/**
 * Overlap API Routes.
 * Mounts endpoints for listing, viewing, and resolving cross-institution enrolment overlap cases.
 */
const express = require('express');
const { authenticate, authorize, ROLES } = require('../middleware/auth');
const overlapController = require('../controllers/overlap.controller');

const router = express.Router();

const RESOLVE_ROLES = [
  ROLES.PLATFORM_ADMIN,
  ROLES.AUTHORITY_ADMIN,
  ROLES.AUTHORITY_OFFICER
];

const READ_ROLES = [
  ROLES.PLATFORM_ADMIN,
  ROLES.AUTHORITY_ADMIN,
  ROLES.AUTHORITY_OFFICER,
  ROLES.AUDITOR,
  ROLES.INSTITUTION_ADMIN,
  ROLES.INSTITUTION_OPERATOR
];

router.get(
  '/',
  authenticate,
  authorize(READ_ROLES),
  overlapController.listOverlapCases
);

router.get(
  '/:id',
  authenticate,
  authorize(READ_ROLES),
  overlapController.getOverlapCase
);

router.patch(
  '/:id/resolve',
  authenticate,
  authorize(RESOLVE_ROLES),
  overlapController.resolveOverlapCase
);

module.exports = router;
