/**
 * Password Cryptography Utility.
 * Implements OWASP-recommended, memory-hard password hashing using Node.js native crypto.scrypt.
 * Provides constant-time verification using crypto.timingSafeEqual to defend against timing attacks.
 *
 * STORAGE FORMAT:
 *   scrypt$N$r$p$saltHex$derivedKeyHex
 *
 * SAFEGUARDS:
 * - Passwords, salts, and hashes are never printed or logged.
 * - Constant-time comparison ensures resistant against timing side-channel attacks.
 */
const crypto = require('crypto');

// Scrypt recommended parameters (OWASP Password Storage Cheat Sheet)
const SCRYPT_PARAMS = {
  N: 16384, // CPU/memory cost parameter (power of 2)
  r: 8,     // Block size
  p: 1,     // Parallelization
  maxmem: 32 * 1024 * 1024 // 32MB max memory
};

const KEY_LENGTH = 64; // 64 bytes derived key
const SALT_LENGTH = 32; // 32 bytes cryptographically secure salt

/**
 * Hashes a plaintext password using scrypt.
 *
 * @param {string} password - Plaintext password
 * @returns {Promise<string>} Formatted hash string
 */
async function hashPassword(password) {
  if (!password || typeof password !== 'string' || password.length === 0) {
    throw new Error('Password must be a non-empty string.');
  }

  const salt = crypto.randomBytes(SALT_LENGTH);

  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      KEY_LENGTH,
      SCRYPT_PARAMS,
      (err, derivedKey) => {
        if (err) return reject(err);
        const hashStr = `scrypt$${SCRYPT_PARAMS.N}$${SCRYPT_PARAMS.r}$${SCRYPT_PARAMS.p}$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
        resolve(hashStr);
      }
    );
  });
}

/**
 * Verifies a plaintext password against a stored scrypt hash string in constant time.
 *
 * @param {string} password - Plaintext password
 * @param {string} storedHash - Formatted hash string (scrypt$N$r$p$saltHex$derivedKeyHex)
 * @returns {Promise<boolean>} True if password matches stored hash
 */
async function verifyPassword(password, storedHash) {
  if (!password || !storedHash || typeof password !== 'string' || typeof storedHash !== 'string') {
    return false;
  }

  const parts = storedHash.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false;
  }

  const N = parseInt(parts[1], 10);
  const r = parseInt(parts[2], 10);
  const p = parseInt(parts[3], 10);
  const salt = Buffer.from(parts[4], 'hex');
  const expectedKey = Buffer.from(parts[5], 'hex');

  if (isNaN(N) || isNaN(r) || isNaN(p) || salt.length === 0 || expectedKey.length === 0) {
    return false;
  }

  const params = {
    N,
    r,
    p,
    maxmem: 64 * 1024 * 1024
  };

  return new Promise((resolve) => {
    crypto.scrypt(password, salt, expectedKey.length, params, (err, actualKey) => {
      if (err) {
        return resolve(false);
      }

      if (actualKey.length !== expectedKey.length) {
        return resolve(false);
      }

      // Constant-time buffer comparison to prevent timing leaks
      const isMatch = crypto.timingSafeEqual(actualKey, expectedKey);
      resolve(isMatch);
    });
  });
}

module.exports = {
  hashPassword,
  verifyPassword
};
