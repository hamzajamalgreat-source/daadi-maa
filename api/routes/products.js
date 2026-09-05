const express = require('express');
const { queryAll, queryOne, runSql } = require('../db');
const { requireAuth } = require('./auth');

const router = express.Router();

// GET /api/products â€” list all products (optionally filter by category)
router.get('/', (req, res) => {
  const { category, search } = req.query;

  let query = `
    SELECT p.*, c.name AS category_name, c.slug AS category_slug
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE 1=1
  `;
  const params = [];

  if (category) {
    query += ' AND c.slug = ?';
    params.push(category);
  }

  if (search) {
    query += ' AND (p.name LIKE ? OR p.description LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  query += ' ORDER BY p.category_id, p.id';

  const products = queryAll(query, params);
  res.json(products);
});

// GET /api/products/categories â€” list all categories
router.get('/categories', (req, res) => {
  const categories = queryAll('SELECT * FROM categories ORDER BY id');
  res.json(categories);
});

// POST /api/products/categories â€” admin creates a new category
router.post('/categories', requireAuth, (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Category name is required.' });
  }
  const slug = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const existing = queryOne('SELECT id FROM categories WHERE slug = ?', [slug]);
  if (existing) {
    return res.status(409).json({ error: 'A category with that name already exists.' });
  }
  const result = runSql('INSERT INTO categories (name, slug) VALUES (?, ?)', [name.trim(), slug]);
  const created = queryOne('SELECT * FROM categories WHERE id = ?', [result.lastInsertRowid]);
  res.status(201).json(created);
});

// GET /api/products/:slug â€” single product by slug
router.get('/:slug', (req, res) => {
  const product = queryOne(`
    SELECT p.*, c.name AS category_name, c.slug AS category_slug
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.slug = ?
  `, [req.params.slug]);

  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
});

// â”€â”€â”€ Admin Routes (protected) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// POST /api/products â€” create product
router.post('/', requireAuth, (req, res) => {
  const { name, slug, description, price, image_url, category_id, badge, in_stock } = req.body;
  // FIX M3: thorough input validation — name, price, lengths, types
  const trimmedName = (name || ').toString().trim();
  if (!trimmedName) return res.status(400).json({ error: 'Product name is required.' });
  if (trimmedName.length > 120) return res.status(400).json({ error: 'Product name too long (max 120 chars).' });
  const parsedPrice = parseFloat(price);
  if (!price || isNaN(parsedPrice) || parsedPrice <= 0) return res.status(400).json({ error: 'A valid price greater than 0 is required.' });
  if (parsedPrice > 999999) return res.status(400).json({ error: 'Price exceeds maximum allowed value.' });
  if (description && description.toString().length > 1000) return res.status(400).json({ error: 'Description too long (max 1000 chars).' });
  if (badge && badge.toString().trim().length > 50) return res.status(400).json({ error: 'Badge too long (max 50 chars).' });
