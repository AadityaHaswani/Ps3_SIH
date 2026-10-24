/**
 * Finding Service.
 * Manages finding retrieval, filtering, pagination, side-by-side candidate comparison,
 * and auditable human review decisions.
 */
const ReconciliationFinding = require('../models/reconciliationFinding.model');

/**
 * Retrieves paginated and filtered findings for a reconciliation run.
 */
async function getFindings(filter = {}, { page = 1, limit = 25 }) {
  const p = Math.max(1, parseInt(page, 10));
  const l = Math.min(100, Math.max(1, parseInt(limit, 10)));
  const skip = (p - 1) * l;

  const total = await ReconciliationFinding.countDocuments(filter);
  const items = await ReconciliationFinding.find(filter)
    .sort({ severity: 1, createdAt: 1 })
    .skip(skip)
    .limit(l)
    .lean();

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

/**
 * Retrieves a single finding by ID with side-by-side comparison data
 */
async function getFindingById(id, institutionId = null) {
  const query = { _id: id };
  if (institutionId) {
    query.institutionId = institutionId;
  }

  const finding = await ReconciliationFinding.findOne(query).lean();
  if (!finding) {
    throw new Error('Reconciliation finding not found.');
  }

  return finding;
}

/**
 * Records a human reviewer decision on a reconciliation finding.
 * Preserves audit history and never overwrites prior decisions.
 */
async function reviewFinding(id, { action, reason, note }, user = {}) {
  const validActions = ['CONFIRM', 'DISMISS', 'REQUEST_CLARIFICATION', 'RESOLVE'];
  if (!validActions.includes(action)) {
    throw new Error(`Invalid review action: '${action}'. Allowed actions: ${validActions.join(', ')}`);
  }

  const finding = await ReconciliationFinding.findById(id);
  if (!finding) {
    throw new Error('Reconciliation finding not found.');
  }

  const statusMap = {
    CONFIRM: 'CONFIRMED',
    DISMISS: 'DISMISSED',
    REQUEST_CLARIFICATION: 'CLARIFICATION_REQUESTED',
    RESOLVE: 'RESOLVED'
  };

  const newStatus = statusMap[action];

  finding.reviewStatus = newStatus;
  finding.reviewHistory.push({
    by: user.id || user.email || 'reviewer',
    role: user.role || 'AUTHORITY_OFFICER',
    action,
    note: note || reason || `Action ${action} executed by reviewer.`,
    at: new Date()
  });

  await finding.save();
  return finding;
}

module.exports = {
  getFindings,
  getFindingById,
  reviewFinding
};
