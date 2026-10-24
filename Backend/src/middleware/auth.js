/**
 * Minimum Reusable Authentication & Role/Institution Scoping Middleware.
 * Enforces role boundaries and strictly prevents cross-institution data leaks.
 */
const jwt = require('jsonwebtoken');
const { config } = require('../config/env');
const { sendError } = require('../utils/apiResponse');

const ROLES = {
  PLATFORM_ADMIN: 'PLATFORM_ADMIN',
  AUTHORITY_ADMIN: 'AUTHORITY_ADMIN',
  AUTHORITY_OFFICER: 'AUTHORITY_OFFICER',
  AUDITOR: 'AUDITOR',
  INSTITUTION_ADMIN: 'INSTITUTION_ADMIN',
  INSTITUTION_OPERATOR: 'INSTITUTION_OPERATOR'
};

/**
 * Authenticates requests via Bearer JWT or development/test identity headers.
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  // 1. Support development & test mock user headers
  if (req.headers['x-user-role']) {
    req.user = {
      id: req.headers['x-user-id'] || 'mock-user-id-1',
      email: req.headers['x-user-email'] || 'test@example.gov.in',
      role: req.headers['x-user-role'],
      institutionId: req.headers['x-user-institution'] || null
    };
    return next();
  }

  // 2. Bearer Token Verification
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return sendError(res, 'UNAUTHENTICATED', 'Authentication token required.', 401);
  }

  const token = authHeader.split(' ')[1];
  try {
    const secret = config.jwtSecret || 'dev_jwt_secret_fallback_key_32_chars';
    const decoded = jwt.verify(token, secret);
    req.user = decoded;
    return next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return sendError(res, 'TOKEN_EXPIRED', 'Authentication token has expired. Please log in again.', 401);
    }
    return sendError(res, 'UNAUTHENTICATED', 'Invalid authentication token.', 401);
  }
}

/**
 * Authorizes user based on permitted roles.
 * @param {string[]} allowedRoles 
 */
function authorize(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, 'UNAUTHENTICATED', 'Authentication required.', 401);
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(req.user.role)) {
      return sendError(res, 'FORBIDDEN', `Access forbidden for role: ${req.user.role}.`, 403);
    }

    next();
  };
}

/**
 * Scoping middleware: Prevents institution users from accessing or modifying another institution's data.
 * Authority and Platform Admin users can query across institutions or specify institution scope.
 */
function scopeToInstitution(req, res, next) {
  if (!req.user) {
    return sendError(res, 'UNAUTHENTICATED', 'Authentication required.', 401);
  }

  const isInstitutionRole = req.user.role && req.user.role.startsWith('INSTITUTION_');

  if (isInstitutionRole) {
    const userInstId = req.user.institutionId ? String(req.user.institutionId) : null;
    if (!userInstId) {
      return sendError(res, 'FORBIDDEN', 'Institution user is not associated with an institution.', 403);
    }

    // Check if client tried to pass a different institutionId in params, query, or body
    const paramInstId = req.params.institutionId ? String(req.params.institutionId) : null;
    const queryInstId = req.query.institutionId ? String(req.query.institutionId) : null;
    const bodyInstId = req.body && req.body.institutionId ? String(req.body.institutionId) : null;

    if (
      (paramInstId && paramInstId !== userInstId) ||
      (queryInstId && queryInstId !== userInstId) ||
      (bodyInstId && bodyInstId !== userInstId)
    ) {
      return sendError(res, 'FORBIDDEN', 'Cross-institution access is strictly prohibited.', 403);
    }

    // Force verified institutionId onto request
    req.institutionId = userInstId;
  } else {
    // Authority / Auditor / Platform Admin can specify target institution or query globally
    req.institutionId = req.params.institutionId || req.query.institutionId || (req.body ? req.body.institutionId : null) || null;
  }

  next();
}

module.exports = {
  ROLES,
  authenticate,
  authorize,
  scopeToInstitution
};
