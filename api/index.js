const express = require('express');
const cors    = require('cors');
const path    = require('path');
const { initDb } = require('./db');

const app = express();

// â”€â”€â”€ CORS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.use(cors({ origin: '*', credentials: true }));

// â”€â”€â”€ Body parsing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// â”€â”€â”€ Routes (lazy-loaded after DB is ready) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let dbReady = false;

app.use(async (req, res, next) => {
  if (!dbReady) {
    try {
      await initDb();
      dbReady = true;
    } catch (err) {
      console.error('DB init error:', err);
      return res.status(500).json({ error: 'Database failed: ' + err.message });
    }
  }
  next();
});

const { router: authRouter } = require('./routes/auth');
const productsRouter          = require('./routes/products');
const ordersRouter            = require('./routes/orders');
const uploadRouter            = require('./routes/upload');
const feedbackRouter = require('./routes/feedback');

app.use('/api/auth',     authRouter);
app.use('/api/products', productsRouter);
app.use('/api/orders',   ordersRouter);
app.use('/api/upload',   uploadRouter);
app.use('/api/feedback', feedbackRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/*', (_req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

// â”€â”€â”€ Export for Vercel serverless â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
module.exports = app;
