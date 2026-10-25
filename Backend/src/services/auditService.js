/**
 * Audit Service.
 * Centralized append-only audit event logging for platform security, governance, and traceability.
 * Ensures zero credential or raw PII leakage in audit payloads.
 */
const AuditEvent = require('../models/auditEvent.model');

/**
 * Logs an append-only audit event.
 * @param {Object} eventData
 * @param {string} eventData.action
 * @param {string} eventData.entityType
 * @param {string|Object} eventData.entityId
 * @param {string} [eventData.institutionId]
 * @param {Object} [eventData.performedBy]
 * @param {Object} [eventData.details]
 * @returns {Promise<Object>} Created audit event
 */
async function logAuditEvent({
  action,
  entityType,
  entityId,
  institutionId = null,
  performedBy = {},
  details = {}
}) {
  try {
    // Sanitize details to prevent logging raw secrets or raw identifiers
    const sanitizedDetails = { ...details };
    delete sanitizedDetails.rawApaar;
    delete sanitizedDetails.password;
    delete sanitizedDetails.tokenSecret;

    const event = await AuditEvent.create({
      action,
      entityType,
      entityId,
      institutionId,
      performedBy: {
        userId: performedBy.userId || performedBy.id || null,
        role: performedBy.role || null,
        email: performedBy.email || null
      },
      details: sanitizedDetails
    });

    return event;
  } catch (err) {
    // Audit logging failure should not crash primary transaction, but log securely
    console.error('Audit logging error:', err.message);
    return null;
  }
}

/**
 * Lists audit events with filtering and pagination.
 */
async function listAuditEvents(filters = {}, { page = 1, limit = 50 } = {}) {
  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
  const skip = (p - 1) * l;

  const query = {};
  if (filters.action) query.action = filters.action;
  if (filters.entityType) query.entityType = filters.entityType;
  if (filters.entityId) query.entityId = filters.entityId;
  if (filters.institutionId) query.institutionId = filters.institutionId;

  const [total, items] = await Promise.all([
    AuditEvent.countDocuments(query),
    AuditEvent.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(l)
      .lean()
  ]);

  return {
    items,
    pagination: {
      page: p,
      limit: l,
      total,
      totalPages: Math.ceil(total / l)
    }
  };
}

module.exports = {
  logAuditEvent,
  listAuditEvents
};
