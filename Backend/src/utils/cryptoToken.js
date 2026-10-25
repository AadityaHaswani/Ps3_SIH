/**
 * Cryptographic Token and Masking Utilities.
 * Protects sensitive student identifiers by converting raw APAAR IDs to keyed HMAC-SHA256 tokens.
 * NEVER derives the token secret from JWT_SECRET.
 */
const crypto = require('crypto');

const { config } = require('../config/env');

/**
 * IMPORTANT PRIVACY NOTICE:
 * HMAC tokens are pseudonymous, NOT anonymous.
 * They are linkable across datasets, and cryptographic key compromise creates
 * a re-identification risk. HMAC secrets must be managed securely and never
 * logged, stored in plain text, or exposed in API responses.
 */

const DEFAULT_KEY_VERSION = 'v1';

/**
 * Canonicalises an APAAR or national student identifier.
 * Trims whitespace, uppercases characters, and removes spaces and hyphens.
 * @param {string|number} raw 
 * @returns {string|null}
 */
function canonicaliseApaar(raw) {
  if (raw === null || raw === undefined) return null;
  const cleaned = String(raw).replace(/[\s-]/g, '').trim().toUpperCase();
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Resolves the dedicated secret for an APAAR pseudonymisation key version.
 * Preserves compatibility with existing v1 secret and supports versioned rotation.
 * @param {string} keyVersion - e.g. 'v1', 'v2'
 */
function getHmacSecret(keyVersion = DEFAULT_KEY_VERSION) {
  if (keyVersion === 'v2') {
    return (
      process.env.APAAR_TOKEN_SECRET_V2 ||
      'ps3_apaar_dedicated_hmac_secret_key_isolated_v2_2026'
    );
  }

  // Default v1 key (preserves 100% backward compatibility with Features 1-4)
  const secret = (config && config.apaarTokenSecret) || process.env.APAAR_TOKEN_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('[Security] APAAR_TOKEN_SECRET is required in production environment.');
    }
    return 'ps3_apaar_dedicated_hmac_secret_key_isolated_2026';
  }
  return secret;
}

/**
 * Generates a deterministic keyed HMAC-SHA256 token for an APAAR ID.
 * @param {string|number} rawApaar 
 * @param {string} [keyVersion='v1']
 * @returns {string|null} Hex-encoded HMAC token
 */
function generateApaarToken(rawApaar, keyVersion = DEFAULT_KEY_VERSION) {
  const canonical = canonicaliseApaar(rawApaar);
  if (!canonical) return null;

  const secret = getHmacSecret(keyVersion);
  return crypto.createHmac('sha256', secret).update(canonical).digest('hex');
}

/**
 * Derives a complete student token descriptor with key version, opaque studentRef,
 * and explicit MISSING_IDENTIFIER status handling.
 * @param {string|number} rawApaar 
 * @param {string} [keyVersion='v1']
 * @param {string|ObjectId} [institutionScope] 
 */
function deriveStudentToken(rawApaar, keyVersion = DEFAULT_KEY_VERSION, institutionScope = null) {
  const canonical = canonicaliseApaar(rawApaar);
  if (!canonical) {
    return {
      status: 'MISSING_IDENTIFIER',
      token: null,
      keyVersion: null,
      studentRef: null,
      apaarLast4: null
    };
  }

  const ver = keyVersion || DEFAULT_KEY_VERSION;
  const token = generateApaarToken(canonical, ver);

  // Generate an opaque, institution-scoped student reference for UI responses
  const secret = getHmacSecret(ver);
  const scopeSuffix = institutionScope ? String(institutionScope) : 'GLOBAL';
  const opaqueDigest = crypto
    .createHmac('sha256', secret)
    .update(`SCOPE_${scopeSuffix}_${token}`)
    .digest('hex')
    .slice(0, 12)
    .toUpperCase();

  const studentRef = `STU-${opaqueDigest}`;

  return {
    status: 'GENERATED',
    token,
    keyVersion: ver,
    studentRef,
    apaarLast4: canonical.slice(-4)
  };
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
  DEFAULT_KEY_VERSION,
  canonicaliseApaar,
  generateApaarToken,
  deriveStudentToken,
  maskIdentifier,
  maskName,
  computeFileHash
};
