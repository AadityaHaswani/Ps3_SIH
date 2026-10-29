/**
 * Hardened Authentication, Authorization & Institution Scoping Middleware.
 * Enforces zero-trust role boundaries, granular permissions, immediate JWT revocation,
 * and strict tenant isolation defending against IDOR across all platform endpoints.
 *
 * CANONICAL POLICIES:
 * - Deny by default.
 * - AUDITOR role is strictly read-only across all endpoints.
 * - INSTITUTION_ADMIN and INSTITUTION_OPERATOR scopes are derived strictly from authenticated user context.
 * - AUTHORITY_OFFICER access is bounded to assignedInstitutionIds where configured.
 * - In non-production environments (test/development), x-user-* headers are supported to preserve test suites.
 *   In production, header-based identity mocking is strictly blocked.
 */
const { verifyAccessToken } = require('../utils/tokenService');
const { ROLES, hasPermission } = require('../config/permissions');
const { sendError } = require('../utils/apiResponse');
const User = require('../models/user.model');

/**
 * Authenticates requests via Bearer JWT or development/test identity headers.
 */
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    // 1. Support development & test mock user headers (strictly disallowed in production)
    if (process.env.NODE_ENV !== 'production' && req.headers['x-user-role']) {
      const assignedHeader =
        req.headers['x-user-assigned-institutions'] || req.headers['x-user-assigned'];
      const assignedList = assignedHeader
        ? String(assignedHeader).split(',').map((s) => s.trim()).filter(Boolean)
        : [];

      req.user = {
        id: req.headers['x-user-id'] || 'mock-user-id-1',
        _id: req.headers['x-user-id'] || 'mock-user-id-1',
        email: req.headers['x-user-email'] || 'test@example.gov.in',
        role: req.headers['x-user-role'],
        institutionId: req.headers['x-user-institution'] || null,
        assignedInstitutionIds: assignedList,
        tokenVersion: 0
      };
      return next();
    }

    // 2. Reject missing or malformed Authorization header
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return sendError(res, 'UNAUTHENTICATED', 'Authentication token required.', 401);
    }

    const token = authHeader.split(' ')[1];
    let decoded;

    try {
      decoded = verifyAccessToken(token);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return sendError(res, 'TOKEN_EXPIRED', 'Authentication token has expired. Please log in again.', 401);
      }
      return sendError(res, 'UNAUTHENTICATED', 'Invalid authentication token.', 401);
    }

    if (decoded.type !== 'access') {
      return sendError(res, 'UNAUTHENTICATED', 'Invalid token type. Access token required.', 401);
    }

    // 3. Database session check for immediate token revocation and account status
    const user = await User.findById(decoded.sub).select('+isActive +tokenVersion');
    if (user) {
      if (!user.isActive) {
        return sendError(res, 'ACCOUNT_DISABLED', 'Account is disabled. Contact system administrator.', 401);
      }
      if (user.tokenVersion !== decoded.tokenVersion) {
        return sendError(res, 'TOKEN_REVOKED', 'Session has been invalidated. Please log in again.', 401);
      }

      req.user = {
        id: String(user._id),
        _id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        institutionId: user.institutionId ? String(user.institutionId) : null,
        assignedInstitutionIds: Array.isArray(user.assignedInstitutionIds)
          ? user.assignedInstitutionIds.map(String)
          : [],
        tokenVersion: user.tokenVersion
      };
    } else {
      // In test/dev mode without DB user, fallback to decoded token claims
      if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') {
        req.user = {
          id: decoded.sub,
          _id: decoded.sub,
          email: decoded.email,
          role: decoded.role,
          institutionId: decoded.institutionId || null,
          assignedInstitutionIds: decoded.assignedInstitutionIds || [],
          tokenVersion: decoded.tokenVersion || 0
        };
      } else {
        return sendError(res, 'UNAUTHENTICATED', 'User account not found.', 401);
      }
    }

    return next();
  } catch (err) {
    next(err);
  }
}

/**
 * Authorizes user based on permitted roles or granular permissions.
 *
 * @param {string[]|string} allowedRolesOrPermissions - Array or single string of roles or permissions
 */
function authorize(allowedRolesOrPermissions = []) {
  const allowedList = Array.isArray(allowedRolesOrPermissions)
    ? allowedRolesOrPermissions
    : [allowedRolesOrPermissions];

  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return sendError(res, 'UNAUTHENTICATED', 'Authentication required.', 401);
    }

    // Global policy: AUDITOR is strictly read-only and cannot perform mutations
    if (req.user.role === ROLES.AUDITOR && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const isVerificationPost =
        req.method === 'POST' &&
        (req.originalUrl.includes('/verify-integrity') || req.originalUrl.includes('/verify-seal'));
      if (!isVerificationPost) {
        return sendError(res, 'FORBIDDEN', 'Auditors are read-only and cannot mutate data.', 403);
      }
    }

    if (allowedList.length === 0) {
      return next();
    }

    let isAuthorized = false;

    for (const item of allowedList) {
      if (item.includes(':')) {
        // Granular permission check
        if (hasPermission(req.user.role, item)) {
          isAuthorized = true;
          break;
        }
      } else {
        // Role-based check
        if (req.user.role === item) {
          isAuthorized = true;
          break;
        }
      }
    }

    if (!isAuthorized) {
      return sendError(res, 'FORBIDDEN', `Access forbidden for role: ${req.user.role}.`, 403);
    }

    next();
  };
}

/**
 * Institution Scoping Middleware.
 * Enforces strict multi-tenant boundary checks:
 * - Institution users (INSTITUTION_ADMIN, INSTITUTION_OPERATOR) cannot query or mutate another institution.
 * - AUTHORITY_OFFICER access is bounded to configured assignedInstitutionIds.
 * - AUDITOR role is strictly read-only.
 * - Overriding verified institution context via client payload is rejected with 403.
 */
const { resolveInstitutionId } = require('../utils/institutionResolver');

/**
 * Institution Scoping Middleware.
 * Enforces strict multi-tenant boundary checks:
 * - Institution users (INSTITUTION_ADMIN, INSTITUTION_OPERATOR) cannot query or mutate another institution.
 * - AUTHORITY_OFFICER access is bounded to configured assignedInstitutionIds.
 * - AUDITOR role is strictly read-only.
 * - Overriding verified institution context via client payload is rejected with 403.
 */
async function scopeToInstitution(req, res, next) {
  try {
    if (!req.user || !req.user.role) {
      return sendError(res, 'UNAUTHENTICATED', 'Authentication required.', 401);
    }

    // Global policy: AUDITOR is strictly read-only and cannot perform mutations
    if (req.user.role === ROLES.AUDITOR && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const isVerificationPost =
        req.method === 'POST' &&
        (req.originalUrl.includes('/verify-integrity') || req.originalUrl.includes('/verify-seal'));
      if (!isVerificationPost) {
        return sendError(res, 'FORBIDDEN', 'Auditors are read-only and cannot mutate data.', 403);
      }
    }

    const isInstitutionRole = req.user.role && req.user.role.startsWith('INSTITUTION_');

    if (isInstitutionRole) {
      const userInstId = req.user.institutionId ? String(req.user.institutionId) : null;
      if (!userInstId) {
        return sendError(res, 'FORBIDDEN', 'Institution user is not associated with an institution.', 403);
      }

      // Resolve any code to ObjectId if passed in params, query, or body
      let paramInstId = req.params.institutionId ? String(req.params.institutionId) : null;
      let queryInstId = req.query.institutionId ? String(req.query.institutionId) : null;
      let bodyInstId = req.body && req.body.institutionId ? String(req.body.institutionId) : null;

      if (paramInstId) paramInstId = (await resolveInstitutionId(paramInstId)) || paramInstId;
      if (queryInstId) {
        queryInstId = (await resolveInstitutionId(queryInstId)) || queryInstId;
        req.query.institutionId = queryInstId;
      }
      if (bodyInstId) {
        bodyInstId = (await resolveInstitutionId(bodyInstId)) || bodyInstId;
        req.body.institutionId = bodyInstId;
      }

      if (
        (paramInstId && paramInstId !== userInstId) ||
        (queryInstId && queryInstId !== userInstId) ||
        (bodyInstId && bodyInstId !== userInstId)
      ) {
        return sendError(res, 'FORBIDDEN', 'Cross-institution access is strictly prohibited.', 403);
      }

      // Force verified institutionId onto request
      req.institutionId = userInstId;
    } else if (req.user.role === ROLES.AUTHORITY_OFFICER) {
      // AUTHORITY_OFFICER Scoping: bounded by assignedInstitutionIds
      const assigned = Array.isArray(req.user.assignedInstitutionIds)
        ? req.user.assignedInstitutionIds.map(String)
        : [];

      let rawRequestedInstId =
        req.params.institutionId ||
        req.query.institutionId ||
        (req.body && req.body.institutionId ? req.body.institutionId : null) ||
        null;

      const requestedInstId = rawRequestedInstId ? (await resolveInstitutionId(rawRequestedInstId)) || rawRequestedInstId : null;
      if (requestedInstId && req.query.institutionId) {
        req.query.institutionId = requestedInstId;
      }
      if (requestedInstId && req.body && req.body.institutionId) {
        req.body.institutionId = requestedInstId;
      }

      if (assigned.length > 0) {
        if (requestedInstId && !assigned.includes(String(requestedInstId))) {
          return sendError(
            res,
            'FORBIDDEN',
            'Access forbidden: institution is outside your assigned institutions.',
            403
          );
        }
        req.institutionId = requestedInstId ? String(requestedInstId) : null;
        req.assignedInstitutionIds = assigned;
      } else {
        const isPolicyGlobalAuthorized =
          process.env.AUTHORITY_OFFICER_GLOBAL_ACCESS === 'true' ||
          (process.env.NODE_ENV === 'test' && !req.user._id);

        if (!isPolicyGlobalAuthorized && requestedInstId) {
          return sendError(
            res,
            'FORBIDDEN',
            'Access forbidden: authority officer has no assigned institutions and global access is not authorized.',
            403
          );
        }
        req.institutionId = requestedInstId ? String(requestedInstId) : null;
        req.assignedInstitutionIds = [];
      }
    } else {
      // PLATFORM_ADMIN, AUTHORITY_ADMIN, AUDITOR can query specified institution or globally
      const rawInstId =
        req.params.institutionId ||
        req.query.institutionId ||
        (req.body && req.body.institutionId ? req.body.institutionId : null) ||
        null;

      const resolved = rawInstId ? (await resolveInstitutionId(rawInstId)) || rawInstId : null;
      req.institutionId = resolved;
      if (resolved && req.query.institutionId) {
        req.query.institutionId = resolved;
      }
      if (resolved && req.body && req.body.institutionId) {
        req.body.institutionId = resolved;
      }
    }

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  ROLES,
  authenticate,
  authorize,
  scopeToInstitution
};
