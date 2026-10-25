/**
 * Authentication Routes.
 * Mounts endpoints for login, refresh rotation, logout, current user, and password changes under /api/v1/auth.
 */
const express = require('express');
const {
  handleLogin,
  handleRefresh,
  handleLogout,
  handleGetMe,
  handleChangePassword
} = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');
const authLimiter = require('../middleware/authLimiter');

const router = express.Router();

// 1. Login with anti-brute-force rate limiting
router.post('/login', authLimiter, handleLogin);

// 2. Refresh token rotation (reads httpOnly cookie or x-refresh-token header)
router.post('/refresh', authLimiter, handleRefresh);

// 3. Logout (revokes session and clears cookie)
router.post('/logout', handleLogout);

// 4. Current user profile and effective permissions
router.get('/me', authenticate, handleGetMe);

// 5. Authenticated password change
router.post('/change-password', authenticate, handleChangePassword);

module.exports = router;
