const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { queryOne } = require('../db');
const rateLimit = require('../middleware/rateLimit');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'daadi_maa_secret_key_2024';

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
    { id: admin.id, username: admin.username },
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
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
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

module.exports = { router, requireAuth };


