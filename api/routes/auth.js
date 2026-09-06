const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { queryOne } = require('../db');
const rateLimit = require('../middleware/rateLimit');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'daadi_maa_secret_key_2024';
// SECURITY: Set JWT_SECRET env var on Vercel. The fallback is not safe for production.
if (!process.env.JWT_SECRET) console.warn('⚠️  JWT_SECRET env var not set. Tokens can be forged. Set it on Vercel.');

// Rate limit: max 10 login attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many login attempts. Please wait 15 minutes before trying again.',
});

// POST /api/auth/login
router.post('/login', loginLimiter, (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const admin = queryOne('SELECT * FROM admins WHERE username = ?', [username]);
  if (!admin) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = bcrypt.compareSync(password, admin.password);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { id: admin.id, username: admin.username, role: admin.role || 'admin' },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({ token, username: admin.username });
});

// POST /api/auth/change-password
router.post('/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Both current and new passwords are required' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }

  const admin = queryOne('SELECT * FROM admins WHERE id = ?', [req.admin.id]);
  const valid = bcrypt.compareSync(currentPassword, admin.password);
  if (!valid) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  const hashed = bcrypt.hashSync(newPassword, 10);
  const { runSql } = require('../db');
  runSql('UPDATE admins SET password = ? WHERE id = ?', [hashed, req.admin.id]);

  res.json({ message: 'Password updated successfully' });
});

// Middleware
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}


// Middleware — admin only (not manager)
function requireAdmin(req, res, next) {
  if (!req.admin) return res.status(401).json({ error: 'Unauthorized' });
  if (req.admin.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
  next();
}

// POST /api/auth/create-user — admin creates manager accounts
router.post('/create-user', requireAuth, requireAdmin, (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });
  if (!['admin','manager'].includes(role)) return res.status(400).json({ error: 'Role must be admin or manager.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  const { queryOne, runSql } = require('../db');
  const existing = queryOne('SELECT id FROM admins WHERE username = ?', [username]);
  if (existing) return res.status(409).json({ error: 'Username already exists.' });
  const hashed = require('bcryptjs').hashSync(password, 10);
  const result = runSql('INSERT INTO admins (username, password, role) VALUES (?, ?, ?)', [username, hashed, role]);
  res.status(201).json({ id: result.lastInsertRowid, username, role });
});

// GET /api/auth/users — admin lists all users
router.get('/users', requireAuth, requireAdmin, (req, res) => {
  const { queryAll } = require('../db');
  const users = queryAll('SELECT id, username, role, created_at FROM admins ORDER BY created_at');
  res.json(users);
});

// DELETE /api/auth/users/:id — admin deletes a user
router.delete('/users/:id', requireAuth, requireAdmin, (req, res) => {
  const { queryOne, runSql } = require('../db');
  const id = Number(req.params.id);
  if (id === req.admin.id) return res.status(400).json({ error: 'Cannot delete your own account.' });
  const user = queryOne('SELECT id FROM admins WHERE id = ?', [id]);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  runSql('DELETE FROM admins WHERE id = ?', [id]);
  res.json({ message: 'User deleted.' });
});

module.exports = { router, requireAuth, requireAdmin };



