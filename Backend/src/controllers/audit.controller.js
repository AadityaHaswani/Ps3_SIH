/**
 * Audit Controller.
 * Exposes canonical audit events across platform actions, verification decisions,
 * and security-sensitive mutations.
 */
const { listAuditEvents } = require('../services/auditService');
const { sendSuccess, sendError } = require('../utils/apiResponse');

/**
 * GET /api/v1/audit/events
 * Lists canonical audit events with role and institution-scoped visibility.
 */
async function handleListAuditEvents(req, res, next) {
  try {
    const { action, entityType, entityId, page, limit } = req.query;
    let institutionId = req.query.institutionId;

    // Institution scoping check
    if (req.user && ['INSTITUTION_ADMIN', 'INSTITUTION_OPERATOR'].includes(req.user.role)) {
      if (institutionId && req.user.institutionId && String(institutionId) !== String(req.user.institutionId)) {
        return sendError(res, 'FORBIDDEN', 'Cannot view audit logs for another institution.', 403);
      }
      institutionId = req.user.institutionId || institutionId;
    }

    const filters = {
      action,
      entityType,
      entityId,
      institutionId
    };

    const result = await listAuditEvents(filters, { page, limit });
    return sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  handleListAuditEvents
};
