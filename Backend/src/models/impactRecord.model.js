/**
 * Impact Record Model.
 * Represents an auditable blast-radius assessment when a roster version is committed or corrected.
 * Tracks affected derived outputs across reconciliations, ledger buckets, scorecards, and verifications.
 */
const mongoose = require('mongoose');

const affectedOutputSchema = new mongoose.Schema(
  {
    outputType: {
      type: String,
      required: true,
      enum: [
        'RECONCILIATION_RUN',
        'SEAT_BALANCE',
        'SCORECARD_SNAPSHOT',
        'SAMPLING_RUN',
        'VERIFICATION_RECORD'
      ]
    },
    outputId: {
      type: String,
      required: true
    },
    name: {
      type: String,
      default: null
    },
    bucketKey: {
      type: String,
      default: null
    },
    previousFreshness: {
      type: String,
      default: 'FRESH'
    },
    currentFreshness: {
      type: String,
      default: 'STALE'
    },
    staleReason: {
      type: String,
      default: null
    },
    revalidationStatus: {
      type: String,
      enum: [
        'NOT_STARTED',
        'QUEUED',
        'REVALIDATING',
        'REVALIDATED',
        'NOT_APPLICABLE',
        'BLOCKED'
      ],
      default: 'NOT_STARTED'
    },
    revalidatedOutputId: {
      type: String,
      default: null
    }
  },
  { _id: false }
);

const impactRecordSchema = new mongoose.Schema(
  {
    impactId: {
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
    academicYear: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    rosterVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RosterVersion',
      required: true,
      index: true
    },
    supersededVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RosterVersion',
      default: null,
      index: true
    },
    changeSummary: {
      total: { type: Number, default: 0 },
      added: { type: Number, default: 0 },
      removed: { type: Number, default: 0 },
      modified: { type: Number, default: 0 },
      unchanged: { type: Number, default: 0 },
      unkeyed: { type: Number, default: 0 }
    },
    affectedBuckets: [
      {
        type: String,
        trim: true
      }
    ],
    affectedOutputsCount: {
      reconciliationRuns: { type: Number, default: 0 },
      seatBalances: { type: Number, default: 0 },
      scorecardSnapshots: { type: Number, default: 0 },
      samplingRuns: { type: Number, default: 0 },
      verificationRecords: { type: Number, default: 0 },
      total: { type: Number, default: 0 }
    },
    affectedOutputs: [affectedOutputSchema],
    staleReason: {
      type: String,
      default: 'Roster version committed; prior derived outputs superseded.'
    },
    calculatedAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    calculatedBy: {
      userId: { type: String, default: null },
      role: { type: String, default: null },
      email: { type: String, default: null }
    },
    idempotencyKey: {
      type: String,
      default: null,
      index: true
    }
  },
  {
    timestamps: true
  }
);

impactRecordSchema.index({ institutionId: 1, rosterVersionId: 1 });
impactRecordSchema.index({ institutionId: 1, academicYear: 1, calculatedAt: -1 });

module.exports = mongoose.model('ImpactRecord', impactRecordSchema);
