/**
 * Assurance Sampling Runs Routes.
 * Mounts endpoints for previewing, creating, querying, closing, and estimating sampling runs.
 */
const express = require('express');
const {
  previewSize,
  createRun,
  listRuns,
  getRunDetail,
  getItems,
  closeRun,
  getEstimate
} = require('../controllers/sampling.controller');
const {
  authenticate,
  authorize,
  scopeToInstitution,
  ROLES
} = require('../middleware/auth');
const { PERMISSIONS } = require('../config/permissions');

const router = express.Router();

router.use(authenticate);

// Preview sample size without persisting (Read-only inspection: Authority reviewers and Auditors)
router.post(
  '/preview-size',
  authorize([ROLES.AUTHORITY_ADMIN, ROLES.AUTHORITY_OFFICER, ROLES.AUDITOR]),
  scopeToInstitution,
  previewSize
);

// Create / execute Assurance Sampling run (Authority Reviewers only)
router.post(
  '/',
  authorize([PERMISSIONS.SAMPLING_CREATE]),
  scopeToInstitution,
  createRun
);

// Query sampling runs
router.get(
  '/',
  scopeToInstitution,
  listRuns
);

// Retrieve single run details
router.get(
  '/:id',
  scopeToInstitution,
  getRunDetail
);

// Paginated items for a sampling run
router.get(
  '/:id/items',
  scopeToInstitution,
  getItems
);

// Formally close a sampling run (Authority Admin only)
router.post(
  '/:id/close',
  authorize([PERMISSIONS.SAMPLING_CLOSE]),
  scopeToInstitution,
  closeRun
);

// Statistical estimate & Wilson score interval
router.get(
  '/:id/estimate',
  scopeToInstitution,
  getEstimate
);

module.exports = router;
