/**
 * Overlap API Routes.
 * Mounts endpoints for listing, viewing, and resolving cross-institution enrolment overlap cases.
 */
const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { PERMISSIONS } = require('../config/permissions');
const overlapController = require('../controllers/overlap.controller');

const router = express.Router();

router.get(
  '/',
  authenticate,
  authorize([PERMISSIONS.OVERLAP_READ]),
  overlapController.listOverlapCases
);

router.get(
  '/:id',
  authenticate,
  authorize([PERMISSIONS.OVERLAP_READ]),
  overlapController.getOverlapCase
);

router.patch(
  '/:id/resolve',
  authenticate,
  authorize([PERMISSIONS.OVERLAP_RESOLVE]),
  overlapController.resolveOverlapCase
);

module.exports = router;
