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
const { authenticate, authorize } = require('../middleware/auth');
const { PERMISSIONS } = require('../config/permissions');

const router = express.Router();

// All user management routes require authentication
router.use(authenticate);

// 1. List users (PLATFORM_ADMIN, AUTHORITY_ADMIN)
router.get(
  '/',
  authorize([PERMISSIONS.USERS_READ]),
  handleListUsers
);

// 2. Create user (PLATFORM_ADMIN only)
router.post(
  '/',
  authorize([PERMISSIONS.USERS_CREATE]),
  handleCreateUser
);

// 3. Update user role, status, or scope (PLATFORM_ADMIN only)
router.patch(
  '/:id',
  authorize([PERMISSIONS.USERS_UPDATE]),
  handleUpdateUser
);

module.exports = router;
