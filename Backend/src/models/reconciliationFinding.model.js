/**
 * Reconciliation Finding Model.
 * Represents an explainable finding produced by the Seat Three-Way Match engine.
 * Maintains full audit trail of reviewer decisions and preserves neutral language.
 */
const mongoose = require('mongoose');

const reconciliationFindingSchema = new mongoose.Schema(
  {
    runId: {
      type: String,
      required: true,
      index: true
    },
    institutionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Institution',
      required: true,
      index: true
    },
    type: {
      type: String,
      enum: [
        'CONFIRMED_3WAY',
        'CONFIRMED_PARTIAL',
        'UNMATCHED',
        'CONFLICT',
        'CANDIDATE_REVIEW',
        'DUPLICATE_CANDIDATE',
        'MISSING_FROM_ROSTER',
        'COUNT_MISMATCH',
        'SOURCE_UNAVAILABLE',
        'STALE_SOURCE'
      ],
      required: true,
      index: true
    },
    severity: {
      type: String,
      enum: ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      default: 'MEDIUM'
    },
    recordRef: {
      rowKey: { type: String, default: null },
      applicationNo: { type: String, default: null },
      apaarTokenMasked: { type: String, default: null },
      studentNameMasked: { type: String, default: null },
      programmeCode: { type: String, default: null },
      category: { type: String, default: null }
    },
    sourceRefs: [
      {
        source: String,
        sourceRecordId: String,
        identifierMasked: String,
        attributes: mongoose.Schema.Types.Mixed
      }
    ],
    fieldDiffs: [
      {
        field: String,
        rosterValue: String,
        sourceValue: String,
        source: String
      }
    ],
    matchConfidence: {
      type: String,
      enum: ['STRONG', 'MODERATE', 'WEAK'],
      default: 'STRONG'
    },
    reviewStatus: {
      type: String,
      enum: ['PENDING', 'CONFIRMED', 'DISMISSED', 'CLARIFICATION_REQUESTED', 'RESOLVED'],
      default: 'PENDING',
      index: true
    },
    reviewHistory: [
      {
        by: String,
        role: String,
        action: String,
        note: String,
        at: { type: Date, default: Date.now }
      }
    ],
    explanation: {
      expected: String,
      observed: String,
      sourcesCompared: [String],
      ruleApplied: String,
      nextAction: String
    }
  },
  {
    timestamps: true
  }
);

reconciliationFindingSchema.index({ runId: 1, type: 1, reviewStatus: 1 });
reconciliationFindingSchema.index({ institutionId: 1, reviewStatus: 1, createdAt: -1 });

module.exports = mongoose.model('ReconciliationFinding', reconciliationFindingSchema);
