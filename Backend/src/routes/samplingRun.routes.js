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

const router = express.Router();

router.use(authenticate);

const REVIEW_ROLES = [
  ROLES.PLATFORM_ADMIN,
  ROLES.AUTHORITY_ADMIN,
  ROLES.AUTHORITY_OFFICER,
  ROLES.AUDITOR
];

const AUTHORITY_ADMIN_ROLES = [
  ROLES.PLATFORM_ADMIN,
  ROLES.AUTHORITY_ADMIN,
  ROLES.AUTHORITY_OFFICER
];

// Preview sample size without persisting
router.post(
  '/preview-size',
  authorize(REVIEW_ROLES),
  scopeToInstitution,
  previewSize
);

// Create / execute Assurance Sampling run
router.post(
  '/',
  authorize(AUTHORITY_ADMIN_ROLES),
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

// Formally close a sampling run
router.post(
  '/:id/close',
  authorize(AUTHORITY_ADMIN_ROLES),
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
