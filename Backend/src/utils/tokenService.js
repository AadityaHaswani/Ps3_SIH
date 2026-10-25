/**
 * Token Service.
 * Generates and validates short-lived access JWTs and cryptographic refresh tokens.
 *
 * TOKEN LIFETIMES:
 * - Access Token: 15 minutes (short-lived, tamper-proof signed JWT).
 * - Refresh Token: 7 days (opaque 64-byte random string, hashed via SHA-256 before MongoDB persistence).
 *
 * REVOCATION & ROTATION:
 * - Access token includes user's tokenVersion for immediate revocation.
 * - Refresh token is stored in an httpOnly cookie with strict security attributes.
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { config } = require('../config/env');

const ACCESS_TOKEN_EXPIRY = '15m'; // 15 minutes
const REFRESH_TOKEN_EXPIRY_DAYS = 7; // 7 days

/**
 * Returns the configured JWT secret.
 */
function getJwtSecret() {
  return config.jwtSecret || 'dev_jwt_secret_fallback_key_32_chars';
}

/**
 * Computes deterministic SHA-256 hash of an opaque token string.
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(String(token).trim()).digest('hex');
}

/**
 * Generates a short-lived access token JWT (15 minutes).
 *
 * @param {Object} user - User document or plain object
 * @returns {string} Signed JWT
 */
function generateAccessToken(user) {
  const payload = {
    sub: String(user._id || user.id),
    email: user.email,
    role: user.role,
    institutionId: user.institutionId ? String(user.institutionId) : null,
    assignedInstitutionIds: Array.isArray(user.assignedInstitutionIds)
      ? user.assignedInstitutionIds.map(String)
      : [],
    tokenVersion: user.tokenVersion || 0,
    type: 'access'
  };

  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: ACCESS_TOKEN_EXPIRY,
    algorithm: 'HS256',
    issuer: 'apaar-seat-integrity-platform',
    audience: 'apaar-client'
  });
}

/**
 * Generates an opaque, cryptographically secure 64-byte refresh token.
 *
 * @returns {string} Hex-encoded random string
 */
function generateRefreshToken() {
  return crypto.randomBytes(64).toString('hex');
}

/**
 * Verifies an access token JWT.
 *
 * @param {string} token - Bearer JWT string
 * @returns {Object} Decoded payload
 */
function verifyAccessToken(token) {
  return jwt.verify(token, getJwtSecret(), {
    algorithms: ['HS256'],
    issuer: 'apaar-seat-integrity-platform',
    audience: 'apaar-client'
  });
}

/**
 * Calculates refresh token expiry Date object.
 */
function getRefreshTokenExpiryDate() {
  const d = new Date();
  d.setDate(d.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);
  return d;
}

/**
 * Returns security attributes for the httpOnly refresh token cookie.
 */
function getRefreshTokenCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd, // Must be true in production (HTTPS)
    sameSite: isProd ? 'Strict' : 'Lax',
    path: '/api/v1/auth', // Scoped strictly to auth endpoints
    maxAge: REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000 // 7 days in ms
  };
}

/**
 * Returns security attributes for clearing the httpOnly refresh token cookie without maxAge.
 */
function getRefreshTokenClearCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'Strict' : 'Lax',
    path: '/api/v1/auth'
  };
}

module.exports = {
  ACCESS_TOKEN_EXPIRY,
  REFRESH_TOKEN_EXPIRY_DAYS,
  hashToken,
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  getRefreshTokenExpiryDate,
  getRefreshTokenCookieOptions,
  getRefreshTokenClearCookieOptions
};
