/**
 * Seat Balance Model.
 * Represents the current derived state, occupancy, approved intake, headroom,
 * and utilisation status for an institution/programme/academicYear/category bucket.
 */
const mongoose = require('mongoose');

const seatBalanceSchema = new mongoose.Schema(
  {
    bucketKey: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true
    },
    institutionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Institution',
      required: true,
      index: true
    },
    programmeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Programme',
      required: true,
      index: true
    },
    programmeCode: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      index: true
    },
    academicYear: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    seatCategory: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      index: true
    },
    approvedIntake: {
      type: Number,
      default: null,
      min: 0
    },
    intakeSourceMode: {
      type: String,
      enum: ['SIMULATED', 'INSTITUTION_DECLARED', 'LIVE'],
      default: 'SIMULATED'
    },
    intakeVerificationStatus: {
      type: String,
      enum: [
        'NO_INTAKE_CONFIGURED',
        'INTAKE_UNVERIFIED',
        'INSTITUTION_DECLARED',
        'DOCUMENT_SUPPORTED',
        'CROSS_REGISTER_CONFIRMED',
        'AUTHORITY_VERIFIED',
        'AUTHORITY_VERIFIED_SIMULATED',
        'VERIFICATION_PENDING',
        'UNABLE_TO_VERIFY'
      ],
      default: 'NO_INTAKE_CONFIGURED'
    },
    isSimulated: {
      type: Boolean,
      default: false
    },
    intakeSourceRef: {
      type: String,
      default: null,
      trim: true
    },
    verificationMethod: {
      type: String,
      default: null,
      trim: true
    },
    verificationEvidenceRef: {
      type: String,
      default: null,
      trim: true
    },
    verifiedBy: {
      userId: { type: String, default: null },
      role: { type: String, default: null },
      email: { type: String, default: null }
    },
    verifiedAt: {
      type: Date,
      default: null
    },
    reportedOccupancy: {
      type: Number,
      default: 0,
      min: 0
    },
    headroom: {
      type: Number,
      default: null
    },
    utilisationPct: {
      type: Number,
      default: null
    },
    warningThresholdPct: {
      type: Number,
      default: 90,
      min: 1,
      max: 100
    },
    status: {
      type: String,
      enum: [
        'OK',
        'WARNING',
        'OVER_CAP_DISCREPANCY',
        'INTAKE_UNVERIFIED',
        'NO_INTAKE_CONFIGURED'
      ],
      default: 'NO_INTAKE_CONFIGURED',
      index: true
    },
    flags: [
      {
        type: String,
        trim: true
      }
    ],
    ruleVersion: {
      type: String,
      default: 'occupancy-rules@1'
    },
    lastEntryAt: {
      type: Date,
      default: Date.now
    },
    lastRosterVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RosterVersion',
      default: null
    },
    freshness: {
      type: String,
      enum: ['FRESH', 'STALE', 'UNKNOWN'],
      default: 'FRESH',
      index: true
    },
    staleReason: {
      type: String,
      default: null
    },
    staleSinceVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RosterVersion',
      default: null
    },
    lastUpdatedBy: {
      userId: String,
      role: String,
      email: String
    }
  },
  {
    timestamps: true,
    versionKey: '__v'
  }
);

seatBalanceSchema.index(
  { institutionId: 1, academicYear: 1, programmeCode: 1, seatCategory: 1 },
  { unique: true }
);
seatBalanceSchema.index({ institutionId: 1, status: 1 });

module.exports = mongoose.model('SeatBalance', seatBalanceSchema);
