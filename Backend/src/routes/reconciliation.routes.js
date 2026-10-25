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
const { authenticate, authorize, scopeToInstitution } = require('../middleware/auth');
const { PERMISSIONS } = require('../config/permissions');

const router = express.Router();

router.post(
  '/',
  authenticate,
  authorize([PERMISSIONS.RECONCILIATION_RUN]),
  scopeToInstitution,
  createReconciliation
);

router.get('/', authenticate, scopeToInstitution, listReconciliations);
router.get('/:id', authenticate, scopeToInstitution, getReconciliation);
router.get('/:id/findings', authenticate, scopeToInstitution, getReconciliationFindings);
router.get('/:id/summary', authenticate, scopeToInstitution, getReconciliationSummary);

module.exports = router;
