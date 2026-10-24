/**
 * Finding Routes.
 * Mounts endpoints for finding detail inspection and recording reviewer decisions.
 */
const express = require('express');
const { getFinding, reviewFinding } = require('../controllers/finding.controller');
const { authenticate, authorize, scopeToInstitution, ROLES } = require('../middleware/auth');

const router = express.Router();

router.get('/:id', authenticate, scopeToInstitution, getFinding);

router.patch(
  '/:id/review',
  authenticate,
  authorize([ROLES.PLATFORM_ADMIN, ROLES.AUTHORITY_ADMIN, ROLES.AUTHORITY_OFFICER]),
  scopeToInstitution,
  reviewFinding
);

module.exports = router;
