/**
 * Authentication Routes.
 * Mounts endpoints for two-step login (password + email OTP), account activation,
 * refresh rotation, logout, current user, and password changes under /api/v1/auth.
 */
const express = require('express');
const {
  handleLogin,
  handleVerifyLoginOtp,
  handleResendLoginOtp,
  handleActivateAccount,
  handleRefresh,
  handleLogout,
  handleGetMe,
  handleChangePassword
} = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');
const authLimiter = require('../middleware/authLimiter');

const router = express.Router();

// 1. Login Step A: credentials validation and 6-digit email OTP issuance
router.post('/login', authLimiter, handleLogin);

// 2. Login Step B: OTP verification and session token issuance
router.post('/verify-login-otp', authLimiter, handleVerifyLoginOtp);

// 3. Resend login OTP code
router.post('/resend-login-otp', authLimiter, handleResendLoginOtp);

// 4. Single-use invitation token account activation and initial password setup
router.post('/activate-account', authLimiter, handleActivateAccount);

// 5. Refresh token rotation (reads httpOnly cookie or x-refresh-token header)
router.post('/refresh', authLimiter, handleRefresh);

// 6. Logout (revokes session family and clears cookie)
router.post('/logout', handleLogout);

// 7. Current user profile and effective permissions
router.get('/me', authenticate, handleGetMe);

// 8. Authenticated password change
router.post('/change-password', authenticate, handleChangePassword);

module.exports = router;
