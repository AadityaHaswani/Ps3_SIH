/**
 * Authentication Controller.
 * Handles login, refresh token rotation, session revocation, logout,
 * current-user inspection (with permission list), and password changes.
 */
const { v4: uuidv4 } = require('uuid');
const User = require('../models/user.model');
const RefreshToken = require('../models/refreshToken.model');
const { hashPassword } = require('../utils/passwordCrypto');
const {
  hashToken,
  generateAccessToken,
  generateRefreshToken,
  getRefreshTokenExpiryDate,
  getRefreshTokenCookieOptions,
  getRefreshTokenClearCookieOptions
} = require('../utils/tokenService');
const { getPermissionsForRole } = require('../config/permissions');
const { logAuditEvent } = require('../services/auditService');
const { sendSuccess, sendError } = require('../utils/apiResponse');

/**
 * POST /api/v1/auth/login
 */
async function handleLogin(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return sendError(res, 'VALIDATION_ERROR', 'Email and password are required.', 400);
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    // Query user including hidden security fields
    const user = await User.findOne({ email: normalizedEmail }).select(
      '+passwordHash +isActive +tokenVersion +failedLoginAttempts +lockUntil'
    );

    // Constant-time defense: generic message when account does not exist
    if (!user) {
      await logAuditEvent({
        action: 'LOGIN_FAILED',
        entityType: 'User',
        entityId: 'UNREGISTERED_ACCOUNT',
        details: { email: normalizedEmail, reason: 'ACCOUNT_NOT_FOUND' }
      });
      return sendError(res, 'UNAUTHENTICATED', 'Invalid email or password.', 401);
    }

    // Check account status
    if (!user.isActive) {
      await logAuditEvent({
        action: 'LOGIN_FAILED',
        entityType: 'User',
        entityId: user._id,
        institutionId: user.institutionId,
        details: { email: normalizedEmail, reason: 'ACCOUNT_DISABLED' }
      });
      return sendError(res, 'ACCOUNT_DISABLED', 'Account is disabled. Contact system administrator.', 401);
    }

    // Check temporary lockout
    if (user.isLocked()) {
      const waitMinutes = Math.ceil((user.lockUntil - Date.now()) / (60 * 1000));
      await logAuditEvent({
        action: 'LOGIN_FAILED',
        entityType: 'User',
        entityId: user._id,
        institutionId: user.institutionId,
        details: { email: normalizedEmail, reason: 'ACCOUNT_LOCKED', waitMinutes }
      });
      return sendError(
        res,
        'ACCOUNT_LOCKED',
        `Account temporarily locked due to too many failed attempts. Try again in ${waitMinutes} minutes.`,
        429
      );
    }

    // Verify password
    const isPasswordValid = await user.verifyPassword(password);
    if (!isPasswordValid) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      if (user.failedLoginAttempts >= 5) {
        // Lock for 15 minutes after 5 consecutive failures
        user.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
      }
      await user.save();

      await logAuditEvent({
        action: 'LOGIN_FAILED',
        entityType: 'User',
        entityId: user._id,
        institutionId: user.institutionId,
        details: {
          email: normalizedEmail,
          reason: 'INVALID_CREDENTIALS',
          attempts: user.failedLoginAttempts
        }
      });

      return sendError(res, 'UNAUTHENTICATED', 'Invalid email or password.', 401);
    }

    // Reset login failures on success
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    user.lastLoginAt = new Date();
    await user.save();

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken();
    const tokenHash = hashToken(refreshToken);
    const familyId = uuidv4();

    await RefreshToken.create({
      tokenHash,
      userId: user._id,
      familyId,
      expiresAt: getRefreshTokenExpiryDate(),
      userAgent: req.headers['user-agent'] || null,
      ipAddress: req.ip || null
    });

    // Set protected httpOnly cookie
    res.cookie('refreshToken', refreshToken, getRefreshTokenCookieOptions());

    await logAuditEvent({
      action: 'LOGIN_SUCCESS',
      entityType: 'User',
      entityId: user._id,
      institutionId: user.institutionId,
      performedBy: { id: user._id, email: user.email, role: user.role },
      details: { role: user.role }
    });

    const permissions = getPermissionsForRole(user.role);

    return sendSuccess(
      res,
      {
        user: {
          ...user.toJSON(),
          permissions
        },
        accessToken,
        permissions
      },
      200
    );
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/auth/refresh
 * Rotates refresh token and returns fresh access token.
 */
async function handleRefresh(req, res, next) {
  try {
    const rawRefreshToken =
      (req.cookies && req.cookies.refreshToken) ||
      req.headers['x-refresh-token'] ||
      (req.body && req.body.refreshToken);

    if (!rawRefreshToken) {
      return sendError(res, 'UNAUTHENTICATED', 'Refresh token required in cookie or header.', 401);
    }

    const tokenHash = hashToken(rawRefreshToken);
    const session = await RefreshToken.findOne({ tokenHash });

    if (!session || (session.expiresAt && session.expiresAt < new Date())) {
      res.clearCookie('refreshToken', getRefreshTokenClearCookieOptions());
      return sendError(res, 'UNAUTHENTICATED', 'Invalid or expired refresh token. Please log in again.', 401);
    }

    // REUSE DETECTION SAFEGUARD:
    // If an already revoked token is used, assume breach and invalidate the entire session family
    if (session.isRevoked) {
      await RefreshToken.updateMany(
        { familyId: session.familyId },
        { $set: { isRevoked: true, revokedAt: new Date(), revokedReason: 'REUSE_DETECTED' } }
      );

      // Invalidate user tokenVersion for immediate access token revocation
      await User.findByIdAndUpdate(session.userId, { $inc: { tokenVersion: 1 } });
      res.clearCookie('refreshToken', getRefreshTokenClearCookieOptions());

      await logAuditEvent({
        action: 'REFRESH_TOKEN_REUSE_DETECTED',
        entityType: 'RefreshToken',
        entityId: session._id,
        details: {
          familyId: session.familyId,
          userId: session.userId,
          attemptedHashPrefix: tokenHash.substring(0, 8)
        }
      });

      return sendError(
        res,
        'TOKEN_REUSE_DETECTED',
        'Security alert: refresh token reuse detected. All active sessions have been revoked.',
        401
      );
    }

    const user = await User.findById(session.userId);
    if (!user || !user.isActive) {
      res.clearCookie('refreshToken', getRefreshTokenClearCookieOptions());
      return sendError(res, 'UNAUTHENTICATED', 'User account is inactive or not found.', 401);
    }

    // Token Rotation
    const newRefreshToken = generateRefreshToken();
    const newHash = hashToken(newRefreshToken);

    session.isRevoked = true;
    session.revokedAt = new Date();
    session.revokedReason = 'ROTATED';
    session.replacedByTokenHash = newHash;
    await session.save();

    await RefreshToken.create({
      tokenHash: newHash,
      userId: user._id,
      familyId: session.familyId,
      expiresAt: getRefreshTokenExpiryDate(),
      userAgent: req.headers['user-agent'] || null,
      ipAddress: req.ip || null
    });

    const accessToken = generateAccessToken(user);
    res.cookie('refreshToken', newRefreshToken, getRefreshTokenCookieOptions());

    return sendSuccess(res, { accessToken }, 200);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/auth/logout
 */
async function handleLogout(req, res, next) {
  try {
    const rawRefreshToken =
      (req.cookies && req.cookies.refreshToken) ||
      req.headers['x-refresh-token'] ||
      (req.body && req.body.refreshToken);

    if (rawRefreshToken) {
      const tokenHash = hashToken(rawRefreshToken);
      await RefreshToken.updateOne(
        { tokenHash, isRevoked: false },
        { $set: { isRevoked: true, revokedAt: new Date(), revokedReason: 'LOGOUT' } }
      );
    }

    res.clearCookie('refreshToken', getRefreshTokenClearCookieOptions());

    if (req.user) {
      await logAuditEvent({
        action: 'LOGOUT',
        entityType: 'User',
        entityId: req.user.id || req.user._id,
        institutionId: req.user.institutionId,
        performedBy: req.user
      });
    }

    return sendSuccess(res, { message: 'Logged out successfully.' }, 200);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/auth/me
 * Returns current authenticated user profile and computed granular permissions array.
 */
async function handleGetMe(req, res, next) {
  try {
    const userId = req.user.id || req.user._id;
    const user = await User.findById(userId);

    if (!user) {
      return sendError(res, 'NOT_FOUND', 'User record not found.', 404);
    }

    if (!user.isActive) {
      return sendError(res, 'ACCOUNT_DISABLED', 'Account has been disabled.', 401);
    }

    const permissions = getPermissionsForRole(user.role);

    return sendSuccess(
      res,
      {
        user: user.toJSON(),
        permissions
      },
      200
    );
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/auth/change-password
 */
async function handleChangePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return sendError(res, 'VALIDATION_ERROR', 'Both currentPassword and newPassword are required.', 400);
    }

    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return sendError(res, 'VALIDATION_ERROR', 'New password must be at least 8 characters long.', 400);
    }

    const userId = req.user.id || req.user._id;
    const user = await User.findById(userId).select('+passwordHash +tokenVersion');

    if (!user) {
      return sendError(res, 'NOT_FOUND', 'User record not found.', 404);
    }

    const isMatch = await user.verifyPassword(currentPassword);
    if (!isMatch) {
      return sendError(res, 'VALIDATION_ERROR', 'Current password is incorrect.', 400);
    }

    user.passwordHash = await hashPassword(newPassword);
    user.tokenVersion = (user.tokenVersion || 0) + 1; // Immediately invalidates outstanding access tokens
    await user.save();

    // Revoke all active refresh sessions for this user
    await RefreshToken.updateMany(
      { userId: user._id, isRevoked: false },
      { $set: { isRevoked: true, revokedAt: new Date(), revokedReason: 'PASSWORD_CHANGE' } }
    );

    res.clearCookie('refreshToken', getRefreshTokenClearCookieOptions());

    await logAuditEvent({
      action: 'PASSWORD_CHANGED',
      entityType: 'User',
      entityId: user._id,
      institutionId: user.institutionId,
      performedBy: req.user
    });

    return sendSuccess(res, { message: 'Password changed successfully. Please log in again.' }, 200);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  handleLogin,
  handleRefresh,
  handleLogout,
  handleGetMe,
  handleChangePassword
};
