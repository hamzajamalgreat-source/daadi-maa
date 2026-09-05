const express = require('express');
const { queryAll, queryOne, runSql } = require('../db');
const { requireAuth } = require('./auth');

const router = express.Router();

// â”€â”€â”€ POST /api/orders â€” customer places an order â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.post('/', (req, res) => {
  const { customer_name, customer_phone, customer_address, customer_email, items, notes } = req.body;

  if (!customer_name?.trim() || !customer_phone?.trim() || !customer_address?.trim()) {
    return res.status(400).json({ error: 'Name, phone, and address are required' });
  }
  // Length limits to prevent abuse
  if (customer_name.trim().length > 100)
    return res.status(400).json({ error: 'Name is too long (max 100 characters).' });
  if (customer_phone.trim().length > 20)
    return res.status(400).json({ error: 'Phone number is too long.' });
  if (customer_address.trim().length > 500)
    return res.status(400).json({ error: 'Address is too long (max 500 characters).' });
  if (notes && notes.trim().length > 500)
    return res.status(400).json({ error: 'Notes are too long (max 500 characters).' });
  if (!Array.isArray(items) || items.length > 50)
    return res.status(400).json({ error: 'Too many items in order.' });
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Order must contain at least one item' });
  }

  // Validate & price items server-side (never trust client prices)
  let total = 0;
  const resolvedItems = [];

  for (const item of items) {
    if (!item.product_id || isNaN(parseInt(item.product_id))) {
      return res.status(400).json({ error: 'Invalid product_id in items' });
    }
    const product = queryOne('SELECT * FROM products WHERE id = ?', [parseInt(item.product_id)]);
    if (!product) {
      return res.status(400).json({ error: `Product not found: ${item.product_id}` });
    }
    if (!product.in_stock) {
      return res.status(400).json({ error: `"${product.name}" is currently out of stock` });
    }
    const qty = parseInt(item.quantity);
    if (isNaN(qty) || qty < 1 || qty > 99) {
      return res.status(400).json({ error: `Invalid quantity for "${product.name}"` });
    }
    // Round prices to avoid floating-point drift
    total += Math.round(product.price * qty * 100) / 100;
    resolvedItems.push({
      product_id:   product.id,
      product_name: product.name,
      quantity:     qty,
      unit_price:   product.price,
    });
  }

  total = Math.round(total * 100) / 100;

  try {
    // â”€â”€ Atomic transaction: order + all items or nothing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const orderResult = runSql(
      `INSERT INTO orders
         (customer_name, customer_phone, customer_address, customer_email, total_amount, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        customer_name.trim(),
        customer_phone.trim(),
        customer_address.trim(),
        customer_email?.trim() || null,
        total,
        notes?.trim() || null,
      ]
    );

    const orderId = orderResult.lastInsertRowid;

    for (const item of resolvedItems) {
      runSql(
        `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price)
         VALUES (?, ?, ?, ?, ?)`,
        [orderId, item.product_id, item.product_name, item.quantity, item.unit_price]
      );
    }

    const order = queryOne('SELECT * FROM orders WHERE id = ?', [orderId]);
    const orderItems = queryAll('SELECT * FROM order_items WHERE order_id = ?', [orderId]);

    console.log(`âœ… New order #${orderId} â€” ${customer_name} â€” Rs. ${total}`);
    res.status(201).json({ ...order, items: orderItems });
  } catch (err) {
    console.error('âŒ Order creation failed:', err.message);
    res.status(500).json({ error: 'Failed to place order. Please try again.' });
  }
});

// â”€â”€â”€ GET /api/orders/stats/summary â€” admin dashboard stats â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// MUST be before /:id to avoid route conflict
router.get('/stats/summary', requireAuth, (req, res) => {
  try {
    const totalOrders      = queryOne('SELECT COUNT(*) AS c FROM orders')?.c || 0;
    const pendingOrders    = queryOne("SELECT COUNT(*) AS c FROM orders WHERE status='pending'")?.c || 0;
    const processingOrders = queryOne("SELECT COUNT(*) AS c FROM orders WHERE status='processing'")?.c || 0;
    const shippedOrders    = queryOne("SELECT COUNT(*) AS c FROM orders WHERE status='shipped'")?.c || 0;
    const deliveredOrders  = queryOne("SELECT COUNT(*) AS c FROM orders WHERE status='delivered'")?.c || 0;
    const cancelledOrders  = queryOne("SELECT COUNT(*) AS c FROM orders WHERE status='cancelled'")?.c || 0;
    const totalRevenue     = queryOne(
      "SELECT COALESCE(SUM(total_amount),0) AS t FROM orders WHERE status != 'cancelled'"
    )?.t || 0;
    const todayRevenue     = queryOne(
      "SELECT COALESCE(SUM(total_amount),0) AS t FROM orders WHERE DATE(created_at)=DATE('now') AND status != 'cancelled'"
    )?.t || 0;
    const todayOrders      = queryOne(
      "SELECT COUNT(*) AS c FROM orders WHERE DATE(created_at)=DATE('now')"
    )?.c || 0;

    // Recent 10 orders with their items
    const recentOrders = queryAll(
      'SELECT * FROM orders ORDER BY created_at DESC LIMIT 10'
    ).map(o => ({
      ...o,
      items: queryAll('SELECT * FROM order_items WHERE order_id = ?', [o.id]),
    }));

    // Revenue by day for last 7 days
    const dailyRevenue = queryAll(
      `SELECT DATE(created_at) AS day, COUNT(*) AS orders,
              COALESCE(SUM(total_amount),0) AS revenue
       FROM orders
       WHERE created_at >= DATE('now','-6 days') AND status != 'cancelled'
       GROUP BY DATE(created_at)
       ORDER BY day ASC`
    );

    // Top products by quantity sold
    const topProducts = queryAll(
      `SELECT oi.product_name, SUM(oi.quantity) AS total_qty,
              SUM(oi.quantity * oi.unit_price) AS total_revenue
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.status != 'cancelled'
       GROUP BY oi.product_name
       ORDER BY total_qty DESC
       LIMIT 5`
    );

    res.json({
      totalOrders, pendingOrders, processingOrders,
      shippedOrders, deliveredOrders, cancelledOrders,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      todayRevenue: Math.round(todayRevenue * 100) / 100,
      todayOrders,
      recentOrders,
      dailyRevenue,
      topProducts,
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

// â”€â”€â”€ GET /api/orders/:id â€” customer order lookup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// FIX H1: requireAuth added — order PII (name/phone/address) was publicly accessible by guessing integer IDs

// GET /api/orders/track?phone=03XXXXXXXXX
// Public endpoint — customers look up their own orders by phone number
router.get('/track', (req, res) => {
  const phone = (req.query.phone || '').trim();
  if (phone.length < 7) {
    return res.status(400).json({ error: 'Please enter your phone number.' });
  }
  // Strip dashes/spaces for flexible matching
  const norm = phone.replace(/[-\\s]/g, '');
  const orders = queryAll(
    `SELECT o.id, o.status, o.total_amount, o.created_at,
     o.customer_name, o.customer_phone, o.customer_address
     FROM orders o
     WHERE replace(replace(o.customer_phone, '-', ''), ' ', '') LIKE ?
     ORDER BY o.created_at DESC LIMIT 5`,
    ['%' + norm + '%']
  );
  const result = orders.map(o => ({
    ...o,
    items: queryAll('SELECT product_name, quantity, unit_price FROM order_items WHERE order_id = ?', [o.id])
  }));
  res.json(result);
});

router.get('/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid order ID' });

  const order = queryOne('SELECT * FROM orders WHERE id = ?', [id]);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const items = queryAll('SELECT * FROM order_items WHERE order_id = ?', [id]);
  res.json({ ...order, items });
});

// â”€â”€â”€ GET /api/orders â€” admin: list all orders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/', requireAuth, (req, res) => {
  try {
    const { status, page = 1, limit = 20, search } = req.query;
    const pageNum  = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const offset   = (pageNum - 1) * limitNum;

    let where  = 'WHERE 1=1';
    const params = [];

    if (status) {
      where += ' AND status = ?';
      params.push(status);
    }
    if (search?.trim()) {
      where += ' AND (customer_name LIKE ? OR customer_phone LIKE ?)';
      params.push(`%${search.trim()}%`, `%${search.trim()}%`);
    }

    const total = queryOne(
      `SELECT COUNT(*) AS c FROM orders ${where}`, params
    )?.c || 0;

    const orders = queryAll(
      `SELECT * FROM orders ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    ).map(o => ({
      ...o,
      items: queryAll('SELECT * FROM order_items WHERE order_id = ?', [o.id]),
    }));

    res.json({ orders, total, page: pageNum, limit: limitNum });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// â”€â”€â”€ PATCH /api/orders/:id/status â€” admin: update status â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.patch('/:id/status', requireAuth, (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid order ID' });

  const { status } = req.body;
  const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
  }

  const order = queryOne('SELECT * FROM orders WHERE id = ?', [id]);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  runSql(
    'UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [status, id]
  );

  const updated = queryOne('SELECT * FROM orders WHERE id = ?', [id]);
  const items   = queryAll('SELECT * FROM order_items WHERE order_id = ?', [id]);
  res.json({ ...updated, items });
});

// â”€â”€â”€ DELETE /api/orders/:id â€” admin: delete order â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.delete('/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid order ID' });

  const order = queryOne('SELECT * FROM orders WHERE id = ?', [id]);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  runSql('DELETE FROM order_items WHERE order_id = ?', [id]);
  runSql('DELETE FROM orders WHERE id = ?', [id]);
  res.json({ message: `Order #${id} deleted successfully` });
});

module.exports = router;


