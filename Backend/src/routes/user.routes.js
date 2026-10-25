/**
 * User Management Routes.
 * Mounts administrative endpoints for user provisioning and management under /api/v1/users.
 */
const express = require('express');
const {
  handleListUsers,
  handleCreateUser,
  handleUpdateUser
} = require('../controllers/user.controller');
const { authenticate, authorize, ROLES } = require('../middleware/auth');

const router = express.Router();

// All user management routes require authentication
router.use(authenticate);

// 1. List users (PLATFORM_ADMIN, AUTHORITY_ADMIN)
router.get(
  '/',
  authorize([ROLES.PLATFORM_ADMIN, ROLES.AUTHORITY_ADMIN]),
  handleListUsers
);

// 2. Create user (PLATFORM_ADMIN only)
router.post(
  '/',
  authorize([ROLES.PLATFORM_ADMIN]),
  handleCreateUser
);

// 3. Update user role, status, or scope (PLATFORM_ADMIN only)
router.patch(
  '/:id',
  authorize([ROLES.PLATFORM_ADMIN]),
  handleUpdateUser
);

module.exports = router;
