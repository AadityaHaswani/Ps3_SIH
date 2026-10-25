/**
 * Verification Record Model.
 * Represents auditable, version-aware assurance verification records.
 * Tracks source provenance, methods, reviewer evidence, and simulation modes.
 * Historical records are append-only; newer records supersede prior decisions.
 */
const mongoose = require('mongoose');

const VERIFICATION_LABELS = [
  'INSTITUTION_DECLARED',
  'DOCUMENT_SUPPORTED',
  'CROSS_REGISTER_CONFIRMED',
  'AUTHORITY_VERIFIED',
  'AUTHORITY_VERIFIED_SIMULATED',
  'VERIFICATION_PENDING',
  'UNABLE_TO_VERIFY'
];

const VERIFICATION_METHODS = [
  'CONNECTOR_API',
  'MANUAL_OFFICER',
  'DOCUMENT_REVIEW',
  'CROSS_REGISTER'
];

const VERIFICATION_STATUSES = [
  'PENDING',
  'COMPLETED',
  'CONFLICT',
  'UNABLE_TO_VERIFY',
  'EXPIRED',
  'SUPERSEDED'
];

const SOURCE_MODES = ['LIVE', 'SIMULATED', 'INSTITUTION_DECLARED'];

const verificationRecordSchema = new mongoose.Schema(
  {
    subjectType: {
      type: String,
      required: true,
      enum: [
        'PROGRAMME_INTAKE',
        'ROSTER_RECORD',
        'INSTITUTION_METADATA',
        'STUDENT_LIFECYCLE',
        'SEAT_BALANCE'
      ],
      index: true
    },
    subjectId: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    fieldPath: {
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
    valueSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    },
    label: {
      type: String,
      required: true,
      enum: VERIFICATION_LABELS,
      index: true
    },
    sourceMode: {
      type: String,
      required: true,
      enum: SOURCE_MODES,
      default: 'SIMULATED',
      index: true
    },
    method: {
      type: String,
      required: true,
      enum: VERIFICATION_METHODS,
      index: true
    },
    status: {
      type: String,
      required: true,
      enum: VERIFICATION_STATUSES,
      default: 'PENDING',
      index: true
    },
    sourceRef: {
      type: String,
      default: null,
      trim: true
    },
    connectorId: {
      type: String,
      default: null,
      trim: true
    },
    ruleOrSourceVersion: {
      type: String,
      default: 'v1.0',
      trim: true
    },
    evidenceRef: {
      type: String,
      default: null,
      trim: true
    },
    notes: {
      type: String,
      default: null,
      trim: true
    },
    reviewer: {
      userId: { type: String, default: null },
      role: { type: String, default: null },
      email: { type: String, default: null }
    },
    requestedAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    verifiedAt: {
      type: Date,
      default: null
    },
    expiresAt: {
      type: Date,
      default: null,
      index: true
    },
    supersedesVerificationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VerificationRecord',
      default: null,
      index: true
    },
    history: [
      {
        action: { type: String, required: true },
        by: String,
        role: String,
        at: { type: Date, default: Date.now },
        notes: String
      }
    ],
    createdBy: {
      userId: { type: String, default: null },
      role: { type: String, default: null },
      email: { type: String, default: null }
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
    idempotencyKey: {
      type: String,
      default: null,
      trim: true
    }
  },
  {
    timestamps: true
  }
);

// Compound indexes for high-throughput lookup & historical timeline queries
verificationRecordSchema.index({
  subjectType: 1,
  subjectId: 1,
  fieldPath: 1,
  status: 1
});
verificationRecordSchema.index({ institutionId: 1, status: 1 });
verificationRecordSchema.index({ label: 1, sourceMode: 1 });
verificationRecordSchema.index(
  { idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }
);

module.exports = mongoose.model('VerificationRecord', verificationRecordSchema);
module.exports.VERIFICATION_LABELS = VERIFICATION_LABELS;
module.exports.VERIFICATION_METHODS = VERIFICATION_METHODS;
module.exports.VERIFICATION_STATUSES = VERIFICATION_STATUSES;
module.exports.SOURCE_MODES = SOURCE_MODES;
