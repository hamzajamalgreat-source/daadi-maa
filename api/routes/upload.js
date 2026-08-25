const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const { requireAuth } = require('./auth');

const router = express.Router();

// On Vercel, use /tmp for uploads (only writable directory)
const UPLOAD_DIR = process.env.VERCEL
  ? '/tmp/images'
  : path.join(__dirname, '..', '..', 'public', 'images');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// ─── Multer config ────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    // Sanitise: lowercase, spaces → hyphens, keep extension
    const ext  = path.extname(file.originalname).toLowerCase();
    const base = path.basename(file.originalname, ext)
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .slice(0, 60);
    // Append timestamp to avoid collisions
    const name = `${base}-${Date.now()}${ext}`;
    cb(null, name);
  },
});

// Only allow image MIME types
const fileFilter = (_req, file, cb) => {
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, WebP and GIF images are allowed.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB max
    files: 1,
  },
});

// ─── POST /api/upload — upload a product image ────────────────────────────────
router.post('/', requireAuth, upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file provided.' });
  }

  // Return the public URL path (served by Express static middleware)
  const url = `/images/${req.file.filename}`;

  console.log(`📸 Image uploaded: ${req.file.filename} (${Math.round(req.file.size / 1024)} KB)`);

  res.json({
    url,
    filename: req.file.filename,
    size:     req.file.size,
    mimetype: req.file.mimetype,
  });
});

// Multer error handler
router.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Image is too large. Maximum size is 10 MB.' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
