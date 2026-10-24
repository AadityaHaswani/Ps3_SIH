/**
 * Request ID middleware.
 * Assigns or propagates a unique request identifier for distributed tracing and audit correlation.
 */
const { v4: uuidv4 } = require('uuid');

function requestIdMiddleware(req, res, next) {
  const incomingId = req.headers['x-request-id'];
  const requestId = (typeof incomingId === 'string' && incomingId.trim()) 
    ? incomingId.trim() 
    : `req_${uuidv4().replace(/-/g, '').slice(0, 12)}`;

  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}

module.exports = requestIdMiddleware;
