/**
 * Centralized Error Handling Middleware.
 * Standardizes error responses across all routes according to the platform specification.
 * Ensures internal details, stack traces, and database credentials are never leaked.
 */
function errorHandler(err, req, res, next) {
  // If response has already started streaming, delegate to default Express handler
  if (res.headersSent) {
    return next(err);
  }

  // Handle JSON body parse errors (e.g. malformed JSON in request)
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Malformed JSON payload in request body.'
      },
      requestId: req.id || null
    });
  }

  // Handle CORS errors
  if (err && err.message && err.message.includes('CORS policy')) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Cross-Origin Request blocked by security policy.'
      },
      requestId: req.id || null
    });
  }

  const statusCode = err.status || err.statusCode || 500;
  const isServerError = statusCode >= 500;

  // Mask internal 500 error messages to prevent leakage of internal system details
  let safeMessage = err.message || 'An internal server error occurred.';
  if (isServerError && process.env.NODE_ENV === 'production') {
    safeMessage = 'An unexpected internal error occurred. Please contact system support.';
  }

  // Sanitise any accidental connection string or credentials in error message
  safeMessage = safeMessage.replace(/mongodb(\+srv)?:\/\/[^@\s]+@/gi, 'mongodb+srv://[REDACTED]@');

  const errorCode = err.code || (isServerError ? 'INTERNAL_ERROR' : 'REQUEST_ERROR');

  const errorResponse = {
    success: false,
    error: {
      code: errorCode,
      message: safeMessage
    },
    requestId: req.id || null
  };

  if (Array.isArray(err.details) && err.details.length > 0) {
    errorResponse.error.details = err.details;
  }

  res.status(statusCode).json(errorResponse);
}

module.exports = errorHandler;
