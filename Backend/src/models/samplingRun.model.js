/**
 * Sampling Run Model.
 * Represents an auditable Assurance Sampling execution drawn from a frozen committed roster version.
 */
const mongoose = require('mongoose');

const samplingRunSchema = new mongoose.Schema(
  {
    runId: {
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
    rosterVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RosterVersion',
      required: true,
      index: true
    },
    academicYear: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    programmeCode: {
      type: String,
      default: null,
      uppercase: true,
      trim: true
    },
    seatCategory: {
      type: String,
      default: null,
      uppercase: true,
      trim: true
    },
    eligiblePopulationSize: {
      type: Number,
      required: true,
      min: 0
    },
    samplingParameters: {
      confidenceLevel: { type: Number, default: 0.95 },
      marginOfError: { type: Number, default: 0.05 },
      expectedProportion: { type: Number, default: 0.50 },
      minSampleSize: { type: Number, default: 10 },
      maxSampleSize: { type: Number, default: 500 },
      minResolvedForEstimate: { type: Number, default: 5 },
      minResponseRate: { type: Number, default: 0.50 },
      riskTargetedCount: { type: Number, default: 0 },
      configVersion: { type: String, default: 'sampling-config@1' }
    },
    sampleSize: {
      type: Number,
      required: true,
      min: 0
    },
    targetedSampleSize: {
      type: Number,
      default: 0,
      min: 0
    },
    totalSampleSize: {
      type: Number,
      required: true,
      min: 0
    },
    selectionHash: {
      type: String,
      required: true,
      trim: true
    },
    algorithmVersion: {
      type: String,
      default: 'crypto-fisher-yates@1'
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'CLOSED'],
      default: 'ACTIVE',
      index: true
    },
    summary: {
      total: { type: Number, default: 0 },
      pending: { type: Number, default: 0 },
      verified: { type: Number, default: 0 },
      failedCheck: { type: Number, default: 0 },
      unconfirmed: { type: Number, default: 0 },
      excluded: { type: Number, default: 0 },
      responseRate: { type: Number, default: 0 }
    },
    idempotencyKey: {
      type: String,
      trim: true
    },
    createdBy: {
      userId: { type: String, default: 'system' },
      role: { type: String, default: 'AUTHORITY_ADMIN' },
      email: { type: String, default: 'admin@aicte.gov.in' }
    },
    closedBy: {
      userId: { type: String, default: null },
      role: { type: String, default: null },
      email: { type: String, default: null },
      closedAt: { type: Date, default: null },
      reason: { type: String, default: null }
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
    revalidationStatus: {
      type: String,
      enum: ['NOT_STARTED', 'QUEUED', 'REVALIDATING', 'REVALIDATED', 'NOT_APPLICABLE', 'BLOCKED'],
      default: 'BLOCKED' // Closed historical sampling runs cannot be re-sampled retrospectively
    }
  },
  {
    timestamps: true
  }
);

// Indexes for fast querying and institution scoping
samplingRunSchema.index({ institutionId: 1, academicYear: 1, status: 1 });
samplingRunSchema.index(
  { idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: 'string' } }
  }
);

module.exports = mongoose.model('SamplingRun', samplingRunSchema);
