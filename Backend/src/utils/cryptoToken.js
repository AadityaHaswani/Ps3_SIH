/**
 * Cryptographic Token and Masking Utilities.
 * Protects sensitive student identifiers by converting raw APAAR IDs to keyed HMAC-SHA256 tokens.
 * NEVER derives the token secret from JWT_SECRET.
 */
const crypto = require('crypto');

const { config } = require('../config/env');

// Dedicated secret for APAAR pseudonymisation
function getHmacSecret() {
  const secret = (config && config.apaarTokenSecret) || process.env.APAAR_TOKEN_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('[Security] APAAR_TOKEN_SECRET is required in production environment.');
    }
    // Isolated default secret for development and testing (strictly distinct from JWT secret)
    return 'ps3_apaar_dedicated_hmac_secret_key_isolated_2026';
  }
  return secret;
}

/**
 * Generates a deterministic keyed HMAC-SHA256 token for an APAAR ID.
 * @param {string|number} rawApaar 
 * @returns {string} Hex-encoded HMAC token
 */
function generateApaarToken(rawApaar) {
  if (!rawApaar) return null;
  const cleanApaar = String(rawApaar).replace(/[\s-]/g, '').trim();
  if (!cleanApaar) return null;

  const secret = getHmacSecret();
  return crypto.createHmac('sha256', secret).update(cleanApaar).digest('hex');
}

/**
 * Returns a masked representation of an identifier (e.g., Application No or Token)
 * @param {string} value 
 * @param {number} visibleTrailing 
 * @returns {string} Masked string (e.g. "***4321")
 */
function maskIdentifier(value, visibleTrailing = 4) {
  if (!value || typeof value !== 'string') return 'N/A';
  if (value.length <= visibleTrailing) return value;
  const maskedLength = Math.max(0, value.length - visibleTrailing);
  return '*'.repeat(Math.min(maskedLength, 8)) + value.slice(-visibleTrailing);
}

/**
 * Masks a student's full name to preserve privacy in review queues.
 * e.g., "Aditya Sharma" -> "A**** S****"
 * @param {string} name 
 * @returns {string}
 */
function maskName(name) {
  if (!name || typeof name !== 'string') return 'N/A';
  return name
    .trim()
    .split(/\s+/)
    .map((part) => {
      if (part.length <= 1) return part;
      return part[0] + '*'.repeat(Math.min(part.length - 1, 4));
    })
    .join(' ');
}

/**
 * Computes SHA-256 hash of a file buffer for tamper-evident provenance.
 * @param {Buffer} buffer 
 * @returns {string}
 */
function computeFileHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

module.exports = {
  generateApaarToken,
  maskIdentifier,
  maskName,
  computeFileHash
};
