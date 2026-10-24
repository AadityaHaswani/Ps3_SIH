/**
 * Seat Ledger Entry Model.
 * Represents an append-only, immutable transaction recording seat movements or intake revisions.
 * Historical entries are never modified or deleted; corrections append reversing entries.
 */
const mongoose = require('mongoose');

const seatLedgerEntrySchema = new mongoose.Schema(
  {
    bucketKey: {
      type: String,
      required: true,
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
      required: true
    },
    programmeCode: {
      type: String,
      required: true,
      uppercase: true,
      trim: true
    },
    academicYear: {
      type: String,
      required: true,
      trim: true
    },
    seatCategory: {
      type: String,
      required: true,
      uppercase: true,
      trim: true
    },
    type: {
      type: String,
      enum: [
        'INTAKE_SET',
        'INTAKE_REVISED',
        'ROSTER_SYNC_ADJUSTMENT',
        'ADMISSION',
        'WITHDRAWAL',
        'TRANSFER_OUT',
        'TRANSFER_IN',
        'COMPLETION',
        'CORRECTION_REVERSAL'
      ],
      required: true,
      index: true
    },
    delta: {
      type: Number,
      default: 0
    },
    intakeDelta: {
      type: Number,
      default: 0
    },
    balanceAfter: {
      approvedIntake: { type: Number, default: null },
      reportedOccupancy: { type: Number, default: 0 },
      headroom: { type: Number, default: null },
      utilisationPct: { type: Number, default: null }
    },
    effectiveDate: {
      type: Date,
      default: Date.now,
      index: true
    },
    sourceReference: {
      type: String,
      default: null,
      trim: true
    },
    sourceMode: {
      type: String,
      enum: ['INSTITUTION_REPORTED', 'INSTITUTION_DECLARED', 'SIMULATED', 'LIVE'],
      default: 'INSTITUTION_REPORTED'
    },
    verificationStatus: {
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
    rosterVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RosterVersion',
      default: null
    },
    actor: {
      userId: String,
      role: String,
      email: String
    },
    reason: {
      type: String,
      default: null,
      trim: true
    },
    idempotencyKey: {
      type: String,
      trim: true
    },
    ruleVersion: {
      type: String,
      default: 'occupancy-rules@1'
    }
  },
  {
    timestamps: true
  }
);

seatLedgerEntrySchema.index(
  { idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: 'string' } }
  }
);
seatLedgerEntrySchema.index({ bucketKey: 1, effectiveDate: 1 });
seatLedgerEntrySchema.index({ institutionId: 1, academicYear: 1, createdAt: -1 });

module.exports = mongoose.model('SeatLedgerEntry', seatLedgerEntrySchema);
