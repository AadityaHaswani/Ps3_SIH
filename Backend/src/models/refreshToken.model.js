/**
 * Refresh Token & Session Model.
 * Manages stateful refresh token rotation, session families, and token reuse detection.
 *
 * PRIVACY & SECURITY SAFEGUARDS:
 * - Refresh token plaintext is NEVER stored in MongoDB; only the SHA-256 tokenHash is stored.
 * - Family ID groups sequential token rotations into a lineage.
 * - If a revoked token in the family is presented, REUSE DETECTION revokes the entire family.
 * - MongoDB TTL index automatically cleans up expired sessions.
 */
const mongoose = require('mongoose');

const refreshTokenSchema = new mongoose.Schema(
  {
    tokenHash: {
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
    familyId: {
      type: String,
      required: true,
      index: true
    },
    isRevoked: {
      type: Boolean,
      default: false,
      index: true
    },
    revokedAt: {
      type: Date,
      default: null
    },
    revokedReason: {
      type: String,
      enum: ['ROTATED', 'LOGOUT', 'REUSE_DETECTED', 'PASSWORD_CHANGE', 'ACCOUNT_DISABLED', 'ADMIN_REVOKED', null],
      default: null
    },
    replacedByTokenHash: {
      type: String,
      default: null
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 } // TTL index: documents automatically purged after expiry
    },
    userAgent: {
      type: String,
      default: null
    },
    ipAddress: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Compound index for querying user's active session families
refreshTokenSchema.index({ userId: 1, isRevoked: 1 });
refreshTokenSchema.index({ familyId: 1, isRevoked: 1 });

const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);

module.exports = RefreshToken;
