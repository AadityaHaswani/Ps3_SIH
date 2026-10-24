/**
 * Reconciliation Routes.
 * Mounts endpoints for triggering runs, listing historical runs, and viewing summaries.
 */
const express = require('express');
const {
  createReconciliation,
  getReconciliation,
  listReconciliations,
  getReconciliationFindings,
  getReconciliationSummary
} = require('../controllers/reconciliation.controller');
const { authenticate, authorize, scopeToInstitution, ROLES } = require('../middleware/auth');

const router = express.Router();

router.post(
  '/',
  authenticate,
  authorize([ROLES.PLATFORM_ADMIN, ROLES.AUTHORITY_ADMIN, ROLES.AUTHORITY_OFFICER]),
  scopeToInstitution,
  createReconciliation
);

router.get('/', authenticate, scopeToInstitution, listReconciliations);
router.get('/:id', authenticate, scopeToInstitution, getReconciliation);
router.get('/:id/findings', authenticate, scopeToInstitution, getReconciliationFindings);
router.get('/:id/summary', authenticate, scopeToInstitution, getReconciliationSummary);

module.exports = router;
