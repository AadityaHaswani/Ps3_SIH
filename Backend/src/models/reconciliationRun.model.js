/**
 * Reconciliation Run Model.
 * Represents an execution of the Seat Three-Way Match reconciliation engine.
 */
const mongoose = require('mongoose');

const reconciliationRunSchema = new mongoose.Schema(
  {
    runId: {
      type: String,
      required: true,
      unique: true,
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
      trim: true
    },
    rosterVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RosterVersion',
      required: true,
      index: true
    },
    programmeCodes: [
      {
        type: String,
        uppercase: true,
        trim: true
      }
    ],
    sources: [
      {
        type: String,
        enum: ['ROSTER', 'ADMISSION', 'ALLOTMENT', 'EXAM', 'INTAKE', 'SCHOLARSHIP']
      }
    ],
    sourceModes: {
      type: Map,
      of: String,
      default: {
        ROSTER: 'INSTITUTION_REPORTED',
        ADMISSION: 'SIMULATED',
        EXAM: 'SIMULATED',
        INTAKE: 'SIMULATED'
      }
    },
    ruleVersion: {
      type: String,
      default: 'recon-rules@1'
    },
    status: {
      type: String,
      enum: ['RUNNING', 'COMPLETED', 'FAILED'],
      default: 'RUNNING'
    },
    summary: {
      rosterRecords: { type: Number, default: 0 },
      confirmed3Way: { type: Number, default: 0 },
      confirmedPartial: { type: Number, default: 0 },
      unmatched: { type: Number, default: 0 },
      conflicts: { type: Number, default: 0 },
      candidateReview: { type: Number, default: 0 },
      sourceUnavailable: { type: Number, default: 0 },
      duplicateCandidates: { type: Number, default: 0 },
      missingFromRoster: { type: Number, default: 0 },
      countMismatches: { type: Number, default: 0 }
    },
    sourceFreshness: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {}
    },
    startedBy: {
      userId: String,
      role: String,
      email: String
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

reconciliationRunSchema.index({ institutionId: 1, academicYear: 1, createdAt: -1 });

module.exports = mongoose.model('ReconciliationRun', reconciliationRunSchema);
