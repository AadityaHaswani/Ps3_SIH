/**
 * 404 Not Found Middleware.
 * Standardizes unknown route responses matching the platform API envelope.
 */
function notFoundHandler(req, res, next) {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Cannot ${req.method} ${req.originalUrl}`
    },
    requestId: req.id || null
  });
}

module.exports = notFoundHandler;
