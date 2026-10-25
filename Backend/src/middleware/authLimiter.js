/**
 * Targeted Authentication Rate Limiter.
 * Protects login and sensitive authentication routes against credential stuffing and brute-force attacks.
 * Stricter threshold: 15 requests per 15-minute window per IP. Skipped in test environment.
 */
const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // 15 attempts per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many authentication attempts. Please try again after 15 minutes.'
      },
      requestId: req.id || null
    });
  }
});

module.exports = authLimiter;
