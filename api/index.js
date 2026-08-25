const express = require('express');
const cors    = require('cors');
const path    = require('path');
const { initDb } = require('./db');

const app = express();

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors({ origin: '*', credentials: true }));

// ─── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Routes (lazy-loaded after DB is ready) ───────────────────────────────────
let dbReady = false;

app.use((req, res, next) => {
  if (!dbReady) {
    initDb();
    dbReady = true;
  }
  next();
});

const { router: authRouter } = require('./routes/auth');
const productsRouter          = require('./routes/products');
const ordersRouter            = require('./routes/orders');
const uploadRouter            = require('./routes/upload');

app.use('/api/auth',     authRouter);
app.use('/api/products', productsRouter);
app.use('/api/orders',   ordersRouter);
app.use('/api/upload',   uploadRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/*', (_req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

// ─── Export for Vercel serverless ─────────────────────────────────────────────
module.exports = app;
