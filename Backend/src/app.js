/**
 * Express Application setup.
 * Configures core middleware, security headers, CORS, rate limiting, and routes.
 * Exported independently of HTTP listener for unit/integration testing.
 */
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const { config } = require('./config/env');
const requestIdMiddleware = require('./middleware/requestId');
const notFoundHandler = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');
const apiV1Routes = require('./routes/index');

const app = express();

// 1. Unique Request ID tracing
app.use(requestIdMiddleware);

// 2. Security Headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// 3. CORS Configuration (Restricted origin for credentialed requests)
const allowedOrigins = [
  config.clientUrl,
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173'
].filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, server-to-server, Supertest, mobile tools)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    }
    return callback(new Error(`CORS policy violation: origin '${origin}' is not permitted.`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Request-Id',
    'Idempotency-Key',
    'X-Refresh-Token',
    'X-User-Role',
    'X-User-Id',
    'X-User-Email',
    'X-User-Institution',
    'X-User-Assigned-Institutions'
  ]
};
app.use(cors(corsOptions));

// 4. Body & Cookie Parsers with safe size limits
const cookieMiddleware = require('./middleware/cookieMiddleware');
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieMiddleware);

// 5. Baseline Rate Limiter (Skipped in test environment)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // 300 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests from this IP address. Please try again after 15 minutes.'
      },
      requestId: req.id || null
    });
  }
});
app.use('/api', apiLimiter);

// 6. Base informational route
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      platform: 'SeatSeal — Every Seat Is Seal API',
      status: 'ONLINE',
      version: '1.0.0',
      apiBase: '/api/v1',
      healthCheck: '/api/v1/health'
    },
    requestId: req.id || null
  });
});

// 7. Mount Versioned API Routes
app.use('/api/v1', apiV1Routes);

// 8. 404 Route Not Found Handler
app.use(notFoundHandler);

// 9. Centralized Error Handler
app.use(errorHandler);

module.exports = app;
