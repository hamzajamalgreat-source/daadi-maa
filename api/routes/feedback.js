const express = require('express');
const { queryAll, queryOne, runSql } = require('../db');
const { requireAuth, requireAdmin } = require('./auth');

const router = express.Router();

// POST /api/feedback — customer submits feedback (public)
router.post('/', (req, res) => {
  const { customer_name, customer_phone, product_id, product_name, rating, comment } = req.body;
  if (!customer_name || !customer_name.trim()) return res.status(400).json({ error: 'Name is required.' });
  if (!comment || comment.trim().length < 5) return res.status(400).json({ error: 'Please write a comment (min 5 characters).' });
  const r = parseInt(rating);
  if (!r || r < 1 || r > 5) return res.status(400).json({ error: 'Rating must be between 1 and 5.' });
  if (comment.trim().length > 500) return res.status(400).json({ error: 'Comment too long (max 500 chars).' });

  const result = runSql(
    'INSERT INTO feedback (customer_name, customer_phone, product_id, product_name, rating, comment) VALUES (?, ?, ?, ?, ?, ?)',
    [customer_name.trim(), customer_phone?.trim() || null, product_id || null, product_name?.trim() || null, r, comment.trim()]
  );
  res.status(201).json({ id: result.lastInsertRowid, message: 'Thank you for your feedback!' });
});

// GET /api/feedback — public approved feedback (for storefront display)
router.get('/', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const items = queryAll(
    "SELECT id, customer_name, product_name, rating, comment, created_at FROM feedback WHERE status = 'approved' ORDER BY created_at DESC LIMIT ?",
    [limit]
  );
  res.json(items);
});

// GET /api/feedback/all — admin sees all feedback
router.get('/all', requireAuth, (req, res) => {
  const items = queryAll('SELECT * FROM feedback ORDER BY created_at DESC');
  res.json(items);
});

// PATCH /api/feedback/:id — admin approves/rejects
router.patch('/:id', requireAuth, (req, res) => {
  const { status } = req.body;
  if (!['approved','rejected','pending'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  const item = queryOne('SELECT id FROM feedback WHERE id = ?', [Number(req.params.id)]);
  if (!item) return res.status(404).json({ error: 'Feedback not found.' });
  runSql('UPDATE feedback SET status = ? WHERE id = ?', [status, Number(req.params.id)]);
  res.json({ message: 'Updated.' });
});

// DELETE /api/feedback/:id — admin deletes
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  runSql('DELETE FROM feedback WHERE id = ?', [Number(req.params.id)]);
  res.json({ message: 'Deleted.' });
});

// ─── Customer Messages ─────────────────────────────────────────────────────

// POST /api/feedback/message — customer sends a message (public)
router.post('/message', (req, res) => {
  const { customer_name, customer_phone, customer_email, subject, message } = req.body;
  if (!customer_name?.trim()) return res.status(400).json({ error: 'Name is required.' });
  if (!message?.trim() || message.trim().length < 10) return res.status(400).json({ error: 'Message too short (min 10 characters).' });
  if (!subject?.trim()) return res.status(400).json({ error: 'Subject is required.' });
  const result = runSql(
    'INSERT INTO messages (customer_name, customer_phone, customer_email, subject, message) VALUES (?, ?, ?, ?, ?)',
    [customer_name.trim(), customer_phone?.trim()||null, customer_email?.trim()||null, subject.trim(), message.trim()]
  );
  res.status(201).json({ id: result.lastInsertRowid, message: 'Message sent! We will get back to you soon.' });
});

// GET /api/feedback/messages — admin views messages
router.get('/messages', requireAuth, (req, res) => {
  const msgs = queryAll('SELECT * FROM messages ORDER BY created_at DESC');
  res.json(msgs);
});

// PATCH /api/feedback/messages/:id — admin replies / marks read
router.patch('/messages/:id', requireAuth, (req, res) => {
  const { status, reply } = req.body;
  const id = Number(req.params.id);
  const msg = queryOne('SELECT id FROM messages WHERE id = ?', [id]);
  if (!msg) return res.status(404).json({ error: 'Message not found.' });
  const updates = [];
  const params = [];
  if (status) { updates.push('status = ?'); params.push(status); }
  if (reply !== undefined) { updates.push('reply = ?'); updates.push('replied_by = ?'); params.push(reply, req.admin.username); }
  if (!updates.length) return res.status(400).json({ error: 'Nothing to update.' });
  params.push(id);
  runSql(`UPDATE messages SET ${updates.join(', ')} WHERE id = ?`, params);
  res.json({ message: 'Updated.' });
});

module.exports = router;