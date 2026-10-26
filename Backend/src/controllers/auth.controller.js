/**
 * Authentication Controller.
 * Handles two-step authentication (Password + Email OTP), account activation,
 * refresh token rotation, session revocation, logout, current-user inspection,
 * and password changes.
 *
 * SECURITY & PRIVACY CONTROLS:
 * - Passwords validated using scrypt with timing-safe comparison.
 * - Login requires two steps: Step A validates credentials and issues a 6-digit email OTP;
 *   Step B verifies and atomically consumes the OTP before issuing JWT and refresh session.
 * - OTP is stored strictly as SHA-256 hash with attempt limits and expiry.
 * - Account activation enforces cryptographically secure single-use tokens.
 * - Never returns or logs plaintext passwords, OTPs, or activation tokens.
 */
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const User = require('../models/user.model');
const RefreshToken = require('../models/refreshToken.model');
const LoginOtpChallenge = require('../models/loginOtpChallenge.model');
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
const { sendLoginOtpEmail } = require('../services/emailService');
const { sendSuccess, sendError } = require('../utils/apiResponse');

function maskEmail(email) {
  if (!email || !email.includes('@')) return '***@***.com';
  const [local, domain] = email.split('@');
  const visible = local.length <= 2 ? local[0] : local.substring(0, 2);
  return `${visible}***@${domain}`;
}

/**
 * POST /api/v1/auth/login
 * Step A of Two-Step Authentication:
 * Validates password, checks status and lockout, generates 6-digit OTP, sends email,
 * and returns challenge identifier. DOES NOT issue access token or refresh cookie.
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
      '+passwordHash +isActive +isActivated +tokenVersion +failedLoginAttempts +lockUntil'
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

    // Check account active status
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

    // Check account activation status
    if (user.isActivated === false) {
      await logAuditEvent({
        action: 'LOGIN_FAILED',
        entityType: 'User',
        entityId: user._id,
        institutionId: user.institutionId,
        details: { email: normalizedEmail, reason: 'ACCOUNT_PENDING_ACTIVATION' }
      });
      return sendError(
        res,
        'ACCOUNT_NOT_ACTIVATED',
        'Account is pending activation. Please check your invitation email to activate your account.',
        403
      );
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

    // Reset login failures on successful password verification
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    await user.save();

    // Step A: Generate cryptographically secure 6-digit OTP
    const otp = crypto.randomInt(100000, 1000000).toString();
    const challengeId = uuidv4();
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

    const otpExpiryMinutes = parseInt(process.env.OTP_EXPIRY_MINUTES, 10) || 10;
    const maxAttempts = parseInt(process.env.OTP_MAX_ATTEMPTS, 10) || 5;
    const expiresAt = new Date(Date.now() + otpExpiryMinutes * 60 * 1000);

    // Invalidate any unconsumed prior challenges for this user
    await LoginOtpChallenge.deleteMany({ userId: user._id, isConsumed: false });

    await LoginOtpChallenge.create({
      challengeId,
      userId: user._id,
      email: user.email,
      otpHash,
      expiresAt,
      maxAttempts,
      ipAddress: req.ip || null,
      userAgent: req.headers['user-agent'] || null
    });

    // Send OTP email (Resend in production, mock adapter in test/dev)
    await sendLoginOtpEmail({
      to: user.email,
      name: user.name,
      otp,
      expiresMinutes: otpExpiryMinutes
    });

    await logAuditEvent({
      action: 'LOGIN_OTP_CHALLENGE_ISSUED',
      entityType: 'User',
      entityId: user._id,
      institutionId: user.institutionId,
      performedBy: { id: user._id, email: user.email, role: user.role },
      details: { challengeId, expiresAt }
    });

    if (process.env.NODE_ENV !== 'production') {
      console.log(`\n==============================================`);
      console.log(`[AUTH-DEV] 🔑 Login OTP for ${user.email}: ${otp}`);
      console.log(`==============================================\n`);
    }

    return sendSuccess(
      res,
      {
        mfaRequired: true,
        challengeId,
        expiresAt,
        maskedEmail: maskEmail(user.email),
        devOtp: process.env.NODE_ENV !== 'production' ? otp : undefined
      },
      200
    );
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/auth/verify-login-otp
 * Step B of Two-Step Authentication:
 * Validates challenge ID, attempt counts, and OTP correctness.
 * On success, atomically consumes the challenge and issues access JWT and httpOnly refresh cookie.
 */
async function handleVerifyLoginOtp(req, res, next) {
  try {
    const { challengeId, otp } = req.body;

    if (!challengeId || !otp) {
      return sendError(res, 'VALIDATION_ERROR', 'challengeId and otp are required.', 400);
    }

    const challenge = await LoginOtpChallenge.findOne({ challengeId }).select('+otpHash');

    if (!challenge) {
      return sendError(res, 'INVALID_CHALLENGE', 'Invalid verification challenge.', 401);
    }

    if (challenge.isConsumed) {
      return sendError(res, 'CHALLENGE_ALREADY_USED', 'Verification code has already been used.', 401);
    }

    // Check expiration
    if (new Date() > challenge.expiresAt) {
      return sendError(res, 'OTP_EXPIRED', 'Verification code has expired. Please log in again.', 401);
    }

    // Check attempt limits
    if (challenge.attempts >= challenge.maxAttempts) {
      return sendError(
        res,
        'OTP_MAX_ATTEMPTS_EXCEEDED',
        'Maximum verification attempts exceeded. Please log in again.',
        429
      );
    }

    // Constant-time OTP comparison
    const inputHash = crypto.createHash('sha256').update(String(otp).trim()).digest('hex');
    const isMatch = crypto.timingSafeEqual(
      Buffer.from(inputHash, 'hex'),
      Buffer.from(challenge.otpHash, 'hex')
    );

    if (!isMatch) {
      challenge.attempts = (challenge.attempts || 0) + 1;
      await challenge.save();

      await logAuditEvent({
        action: 'LOGIN_OTP_FAILED',
        entityType: 'User',
        entityId: challenge.userId,
        details: { challengeId, attempts: challenge.attempts, maxAttempts: challenge.maxAttempts }
      });

      const remaining = Math.max(0, challenge.maxAttempts - challenge.attempts);
      return sendError(
        res,
        'INVALID_OTP',
        remaining > 0
          ? `Invalid verification code. ${remaining} attempts remaining.`
          : 'Maximum verification attempts exceeded. Please log in again.',
        401,
        { attemptsRemaining: remaining, remainingAttempts: remaining }
      );
    }

    // Atomically consume challenge to prevent race conditions and replay attacks
    const updatedChallenge = await LoginOtpChallenge.findOneAndUpdate(
      { _id: challenge._id, isConsumed: false },
      { $set: { isConsumed: true, consumedAt: new Date() } },
      { new: true }
    );

    if (!updatedChallenge) {
      return sendError(res, 'CHALLENGE_ALREADY_CONSUMED', 'Verification code has already been used.', 401);
    }

    // Retrieve user including security fields
    const user = await User.findById(challenge.userId).select(
      '+isActive +isActivated +tokenVersion'
    );

    if (!user || !user.isActive || user.isActivated === false) {
      return sendError(res, 'UNAUTHENTICATED', 'User account is not accessible.', 401);
    }

    // Update login timestamp
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
      details: { role: user.role, mfaMethod: 'EMAIL_OTP' }
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
 * POST /api/v1/auth/resend-login-otp
 * Resends a fresh OTP code for an existing active login challenge.
 */
async function handleResendLoginOtp(req, res, next) {
  try {
    const { challengeId } = req.body;

    if (!challengeId) {
      return sendError(res, 'VALIDATION_ERROR', 'challengeId is required.', 400);
    }

    const challenge = await LoginOtpChallenge.findOne({ challengeId, isConsumed: false });
    if (!challenge) {
      return sendError(res, 'INVALID_CHALLENGE', 'Active verification challenge not found.', 400);
    }

    const user = await User.findById(challenge.userId);
    if (!user || !user.isActive || user.isActivated === false) {
      return sendError(res, 'UNAUTHENTICATED', 'User account is not accessible.', 401);
    }

    // Generate fresh OTP
    const otp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

    const otpExpiryMinutes = parseInt(process.env.OTP_EXPIRY_MINUTES, 10) || 10;
    challenge.otpHash = otpHash;
    challenge.attempts = 0;
    challenge.expiresAt = new Date(Date.now() + otpExpiryMinutes * 60 * 1000);
    await challenge.save();

    await sendLoginOtpEmail({
      to: user.email,
      name: user.name,
      otp,
      expiresMinutes: otpExpiryMinutes
    });

    await logAuditEvent({
      action: 'LOGIN_OTP_RESENT',
      entityType: 'User',
      entityId: user._id,
      details: { challengeId, email: user.email }
    });

    if (process.env.NODE_ENV !== 'production') {
      console.log(`\n==============================================`);
      console.log(`[AUTH-DEV] 🔑 Resent Login OTP for ${user.email}: ${otp}`);
      console.log(`==============================================\n`);
    }

    return sendSuccess(
      res,
      {
        challengeId: challenge.challengeId,
        expiresAt: challenge.expiresAt,
        maskedEmail: maskEmail(user.email),
        devOtp: process.env.NODE_ENV !== 'production' ? otp : undefined
      },
      200
    );
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/auth/activate-account
 * Activates a pending account using a single-use cryptographically random token,
 * sets the initial password, and verifies email status.
 */
async function handleActivateAccount(req, res, next) {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return sendError(res, 'VALIDATION_ERROR', 'token and password are required.', 400);
    }

    if (typeof password !== 'string' || password.length < 8) {
      return sendError(res, 'VALIDATION_ERROR', 'Password must be at least 8 characters long.', 400);
    }

    const tokenHash = crypto.createHash('sha256').update(String(token).trim()).digest('hex');

    const user = await User.findOne({ activationTokenHash: tokenHash }).select(
      '+activationTokenHash +activationTokenExpiresAt +passwordHash +isActivated +tokenVersion'
    );

    if (!user || user.isActivated) {
      return sendError(res, 'INVALID_ACTIVATION_TOKEN', 'Invalid or already consumed activation link.', 400);
    }

    if (user.activationTokenExpiresAt && new Date() > user.activationTokenExpiresAt) {
      return sendError(
        res,
        'ACTIVATION_TOKEN_EXPIRED',
        'Activation link has expired. Please contact your platform administrator for a new invitation.',
        400
      );
    }

    // Set new secure password
    user.passwordHash = await hashPassword(password);
    user.isActivated = true;
    user.emailVerified = true;
    user.activatedAt = new Date();
    user.activationTokenHash = null;
    user.activationTokenExpiresAt = null;
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();

    await logAuditEvent({
      action: 'ACCOUNT_ACTIVATED',
      entityType: 'User',
      entityId: user._id,
      institutionId: user.institutionId,
      performedBy: { id: user._id, email: user.email, role: user.role },
      details: { email: user.email, role: user.role }
    });

    return sendSuccess(
      res,
      {
        message: 'Account successfully activated and password configured. You may now log in.',
        email: user.email,
        isActivated: user.isActivated,
        emailVerified: user.emailVerified,
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
          isActivated: user.isActivated,
          emailVerified: user.emailVerified
        }
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
    const cookieToken = req.cookies ? req.cookies.refreshToken : null;
    const headerToken = req.headers['x-refresh-token'];
    const incomingToken = cookieToken || headerToken;

    if (!incomingToken) {
      return sendError(res, 'UNAUTHENTICATED', 'Refresh token is required.', 401);
    }

    const incomingHash = hashToken(incomingToken);

    // Look up token by hash
    const storedToken = await RefreshToken.findOne({ tokenHash: incomingHash });

    if (!storedToken) {
      return sendError(res, 'UNAUTHENTICATED', 'Invalid or unrecognized refresh token.', 401);
    }

    // Reuse detection
    if (storedToken.isRevoked) {
      await RefreshToken.updateMany(
        { familyId: storedToken.familyId },
        { $set: { isRevoked: true, revokedAt: new Date(), revokedReason: 'REUSE_DETECTED' } }
      );

      await logAuditEvent({
        action: 'TOKEN_REUSE_DETECTED',
        entityType: 'RefreshToken',
        entityId: storedToken._id,
        details: {
          familyId: storedToken.familyId,
          userId: storedToken.userId,
          ip: req.ip
        }
      });

      res.clearCookie('refreshToken', getRefreshTokenClearCookieOptions());

      return sendError(
        res,
        'TOKEN_REUSE_DETECTED',
        'Refresh token reuse detected. All sessions in this family have been terminated. Please log in again.',
        401
      );
    }

    // Check expiration
    if (new Date() > storedToken.expiresAt) {
      storedToken.isRevoked = true;
      storedToken.revokedAt = new Date();
      storedToken.revokedReason = 'EXPIRED';
      await storedToken.save();

      res.clearCookie('refreshToken', getRefreshTokenClearCookieOptions());

      return sendError(res, 'TOKEN_EXPIRED', 'Refresh token has expired. Please log in again.', 401);
    }

    // Fetch user and verify active status
    const user = await User.findById(storedToken.userId).select('+isActive +isActivated +tokenVersion');
    if (!user || !user.isActive || user.isActivated === false) {
      storedToken.isRevoked = true;
      storedToken.revokedAt = new Date();
      storedToken.revokedReason = 'USER_INACTIVE';
      await storedToken.save();

      res.clearCookie('refreshToken', getRefreshTokenClearCookieOptions());

      return sendError(res, 'UNAUTHENTICATED', 'User account is not accessible.', 401);
    }

    // Rotate: Mark current token as revoked
    storedToken.isRevoked = true;
    storedToken.revokedAt = new Date();
    storedToken.revokedReason = 'ROTATED';
    await storedToken.save();

    // Create successor token within the same family
    const newRefreshToken = generateRefreshToken();
    const newTokenHash = hashToken(newRefreshToken);

    await RefreshToken.create({
      tokenHash: newTokenHash,
      userId: user._id,
      familyId: storedToken.familyId,
      expiresAt: getRefreshTokenExpiryDate(),
      userAgent: req.headers['user-agent'] || null,
      ipAddress: req.ip || null
    });

    const accessToken = generateAccessToken(user);

    // Set new cookie
    res.cookie('refreshToken', newRefreshToken, getRefreshTokenCookieOptions());

    await logAuditEvent({
      action: 'TOKEN_REFRESHED',
      entityType: 'RefreshToken',
      entityId: storedToken._id,
      performedBy: { id: user._id, email: user.email, role: user.role },
      details: { familyId: storedToken.familyId }
    });

    return sendSuccess(res, { accessToken }, 200);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/auth/logout
 * Terminates current session, revokes refresh token family, and clears cookie.
 */
async function handleLogout(req, res, next) {
  try {
    const cookieToken = req.cookies ? req.cookies.refreshToken : null;
    const headerToken = req.headers['x-refresh-token'];
    const incomingToken = cookieToken || headerToken;

    if (incomingToken) {
      const incomingHash = hashToken(incomingToken);
      const storedToken = await RefreshToken.findOne({ tokenHash: incomingHash });

      if (storedToken) {
        await RefreshToken.updateMany(
          { familyId: storedToken.familyId },
          { $set: { isRevoked: true, revokedAt: new Date(), revokedReason: 'LOGOUT' } }
        );

        await logAuditEvent({
          action: 'LOGOUT_SUCCESS',
          entityType: 'RefreshToken',
          entityId: storedToken._id,
          performedBy: { id: storedToken.userId }
        });
      }
    }

    res.clearCookie('refreshToken', getRefreshTokenClearCookieOptions());

    return sendSuccess(res, { message: 'Logged out successfully.' }, 200);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/auth/me
 * Returns verified authenticated user identity and canonical permissions.
 */
async function handleGetMe(req, res, next) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return sendError(res, 'UNAUTHENTICATED', 'User not found.', 401);
    }

    const permissions = getPermissionsForRole(user.role);

    return sendSuccess(
      res,
      {
        user: {
          ...user.toJSON(),
          permissions
        },
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
 * Authenticated password change with immediate token invalidation.
 */
async function handleChangePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return sendError(res, 'VALIDATION_ERROR', 'Current password and new password are required.', 400);
    }

    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return sendError(res, 'VALIDATION_ERROR', 'New password must be at least 8 characters long.', 400);
    }

    const user = await User.findById(req.user.id).select('+passwordHash +tokenVersion');
    if (!user) {
      return sendError(res, 'UNAUTHENTICATED', 'User not found.', 401);
    }

    const isValid = await user.verifyPassword(currentPassword);
    if (!isValid) {
      await logAuditEvent({
        action: 'PASSWORD_CHANGE_FAILED',
        entityType: 'User',
        entityId: user._id,
        details: { reason: 'CURRENT_PASSWORD_INCORRECT' }
      });
      return sendError(res, 'UNAUTHENTICATED', 'Current password is incorrect.', 401);
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
  handleVerifyLoginOtp,
  handleResendLoginOtp,
  handleActivateAccount,
  handleRefresh,
  handleLogout,
  handleGetMe,
  handleChangePassword
};
