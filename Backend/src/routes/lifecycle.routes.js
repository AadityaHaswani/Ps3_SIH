/**
 * Lifecycle API Routes.
 * Mounts endpoints for recording lifecycle events, corrections, and student timelines.
 */
const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { PERMISSIONS } = require('../config/permissions');
const lifecycleController = require('../controllers/lifecycle.controller');

const router = express.Router();

router.post(
  '/events',
  authenticate,
  authorize([PERMISSIONS.LIFECYCLE_WRITE]),
  lifecycleController.recordEvent
);

router.get(
  '/students/:tokenId/events',
  authenticate,
  authorize([PERMISSIONS.LIFECYCLE_READ]),
  lifecycleController.getTimeline
);

module.exports = router;
