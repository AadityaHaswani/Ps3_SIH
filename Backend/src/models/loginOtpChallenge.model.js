/**
 * Login OTP Challenge Model.
 * Manages two-step authentication challenges for email OTP verification.
 *
 * SECURITY SAFEGUARDS:
 * - OTP is stored strictly as a SHA-256 hash; plaintext OTP is never persisted.
 * - Single-use enforcement: challenges are atomically marked consumed or deleted.
 * - Anti-brute-force attempt limits: locks challenge after configured failed attempts.
 * - Automatic expiration via MongoDB TTL index on expiresAt.
 */
const mongoose = require('mongoose');

const loginOtpChallengeSchema = new mongoose.Schema(
  {
    challengeId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true
    },
    otpHash: {
      type: String,
      required: true,
      select: false // Never exposed in queries
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 } // MongoDB TTL index: documents expire automatically at expiresAt
    },
    attempts: {
      type: Number,
      default: 0
    },
    maxAttempts: {
      type: Number,
      default: 5
    },
    isConsumed: {
      type: Boolean,
      default: false,
      index: true
    },
    consumedAt: {
      type: Date,
      default: null
    },
    ipAddress: {
      type: String,
      default: null
    },
    userAgent: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true
  }
);

const LoginOtpChallenge = mongoose.model('LoginOtpChallenge', loginOtpChallengeSchema);

module.exports = LoginOtpChallenge;
