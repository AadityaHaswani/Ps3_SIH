/**
 * User Model.
 * Represents platform users across all 6 canonical roles:
 * PLATFORM_ADMIN, AUTHORITY_ADMIN, AUTHORITY_OFFICER, AUDITOR, INSTITUTION_ADMIN, INSTITUTION_OPERATOR.
 *
 * SECURITY CONTROLS:
 * - passwordHash is hidden by default (select: false).
 * - tokenVersion supports immediate session revocation upon password/role/scope changes.
 * - failedLoginAttempts and lockUntil enforce anti-brute-force account lockouts.
 * - toJSON/toObject transformations guarantee password hashes never leak into JSON responses.
 */
const mongoose = require('mongoose');
const { verifyPassword } = require('../utils/passwordCrypto');

const ROLES = [
  'PLATFORM_ADMIN',
  'AUTHORITY_ADMIN',
  'AUTHORITY_OFFICER',
  'AUDITOR',
  'INSTITUTION_ADMIN',
  'INSTITUTION_OPERATOR'
];

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required.'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address.'],
      index: true
    },
    passwordHash: {
      type: String,
      required: [
        function () {
          return this.isActivated;
        },
        'Password hash is required for activated accounts.'
      ],
      select: false // Excluded from default queries to avoid accidental leakage
    },
    name: {
      type: String,
      required: [true, 'Name is required.'],
      trim: true,
      maxlength: 120
    },
    role: {
      type: String,
      required: [true, 'Role is required.'],
      enum: {
        values: ROLES,
        message: 'Invalid role. Must be one of: ' + ROLES.join(', ')
      },
      index: true
    },
    institutionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Institution',
      default: null,
      index: true
    },
    assignedInstitutionIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Institution'
      }
    ],
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
    isActivated: {
      type: Boolean,
      default: false,
      index: true
    },
    emailVerified: {
      type: Boolean,
      default: false
    },
    activationTokenHash: {
      type: String,
      default: null,
      select: false
    },
    activationTokenExpiresAt: {
      type: Date,
      default: null,
      select: false
    },
    activationTokenSentAt: {
      type: Date,
      default: null
    },
    activatedAt: {
      type: Date,
      default: null
    },
    isDemoUser: {
      type: Boolean,
      default: false,
      index: true
    },
    dataMode: {
      type: String,
      enum: ['DEMO', 'LIVE'],
      default: 'LIVE',
      index: true
    },
    tokenVersion: {
      type: Number,
      default: 0
    },
    failedLoginAttempts: {
      type: Number,
      default: 0
    },
    lockUntil: {
      type: Date,
      default: null
    },
    lastLoginAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Method to verify password against stored passwordHash
userSchema.methods.verifyPassword = async function (plainPassword) {
  if (!this.passwordHash) {
    return false;
  }
  return verifyPassword(plainPassword, this.passwordHash);
};

// Check if account is temporarily locked due to failed login attempts
userSchema.methods.isLocked = function () {
  return !!(this.lockUntil && this.lockUntil > new Date());
};

// Transform to safely strip password hash and internal fields on serialization
userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.passwordHash;
    delete ret.activationTokenHash;
    delete ret.activationTokenExpiresAt;
    delete ret.__v;
    return ret;
  }
});

userSchema.set('toObject', {
  transform: (doc, ret) => {
    delete ret.passwordHash;
    delete ret.activationTokenHash;
    delete ret.activationTokenExpiresAt;
    delete ret.__v;
    return ret;
  }
});

const User = mongoose.model('User', userSchema);

module.exports = User;
module.exports.ROLES = ROLES;
