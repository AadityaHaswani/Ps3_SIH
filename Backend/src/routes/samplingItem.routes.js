/**
 * Assurance Sampling Item Routes.
 * Mounts endpoints for recording item verification results and evidence references.
 */
const express = require('express');
const { recordResult } = require('../controllers/sampling.controller');
const {
  authenticate,
  authorize
} = require('../middleware/auth');
const { PERMISSIONS } = require('../config/permissions');

const router = express.Router();

router.use(authenticate);

// Record verification review outcome (Authority Reviewers only; Institution roles & Auditor strictly prohibited)
router.patch(
  '/:id/result',
  authorize([PERMISSIONS.SAMPLING_REVIEW]),
  recordResult
);

module.exports = router;
