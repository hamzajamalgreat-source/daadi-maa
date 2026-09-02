/**
 * Simple in-memory rate limiter — no external dependencies.
 * Tracks request counts per IP per time window.
 */
function rateLimit({ windowMs = 15 * 60 * 1000, max = 100, message = 'Too many requests. Please try again later.' }) {
  const store = new Map();

  setInterval(() => {
    const now = Date.now();
    for (const [ip, data] of store.entries()) {
      if (now > data.resetTime) store.delete(ip);
    }
  }, windowMs).unref();

  return (req, res, next) => {
    const ip = (req.headers['x-forwarded-for']?.split(',')[0]?.trim())
      || req.socket?.remoteAddress
      || 'unknown';

    const now  = Date.now();
    const data = store.get(ip);

    if (!data || now > data.resetTime) {
      store.set(ip, { count: 1, resetTime: now + windowMs });
      return next();
    }

    data.count += 1;

    if (data.count > max) {
      const retryAfter = Math.ceil((data.resetTime - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: message,
        retryAfter: retryAfter + ' seconds',
      });
    }

    next();
  };
}

module.exports = rateLimit;
