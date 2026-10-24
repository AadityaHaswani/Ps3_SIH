/**
 * Assurance Sampling Item Routes.
 * Mounts endpoints for recording item verification results and evidence references.
 */
const express = require('express');
const { recordResult } = require('../controllers/sampling.controller');
const {
  authenticate,
  authorize,
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

// Record verification review outcome (Institution roles explicitly prohibited)
router.patch(
  '/:id/result',
  authorize(REVIEW_ROLES),
  recordResult
);

module.exports = router;
