/**
 * Lifecycle API Routes.
 * Mounts endpoints for recording lifecycle events, corrections, and student timelines.
 */
const express = require('express');
const { authenticate, authorize, ROLES } = require('../middleware/auth');
const lifecycleController = require('../controllers/lifecycle.controller');

const router = express.Router();

const MUTATION_ROLES = [
  ROLES.PLATFORM_ADMIN,
  ROLES.AUTHORITY_ADMIN,
  ROLES.AUTHORITY_OFFICER,
  ROLES.INSTITUTION_ADMIN,
  ROLES.INSTITUTION_OPERATOR
];

const READ_ROLES = [
  ROLES.PLATFORM_ADMIN,
  ROLES.AUTHORITY_ADMIN,
  ROLES.AUTHORITY_OFFICER,
  ROLES.AUDITOR,
  ROLES.INSTITUTION_ADMIN,
  ROLES.INSTITUTION_OPERATOR
];

router.post(
  '/events',
  authenticate,
  authorize(MUTATION_ROLES),
  lifecycleController.recordEvent
);

router.get(
  '/students/:tokenId/events',
  authenticate,
  authorize(READ_ROLES),
  lifecycleController.getTimeline
);

module.exports = router;
