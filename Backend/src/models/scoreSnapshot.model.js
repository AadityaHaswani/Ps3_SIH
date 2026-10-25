/**
 * Score Snapshot Model.
 * Represents an immutable historical evaluation of an institution's data reliability.
 * Stores comprehensive raw metrics, sub-scores, weights, coverage, staleness flags, and support suggestions.
 */
const mongoose = require('mongoose');

const MANDATORY_DISCLAIMER =
  'The Institutional Data Reliability Scorecard measures the reliability and completeness of reported data and helps identify support needs. It is not a misconduct verdict or a measure of overall institutional quality.';

const scoreSnapshotSchema = new mongoose.Schema(
  {
    institutionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Institution',
      required: true,
      index: true
    },
    reportingPeriod: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    institutionType: {
      type: String,
      default: 'ENGINEERING'
    },
    programmeCode: {
      type: String,
      default: null,
      trim: true
    },
    overallScore: {
      type: Number,
      default: null // null when INSUFFICIENT_DATA (never 0 for missing data)
    },
    band: {
      type: String,
      enum: ['STRONG', 'ADEQUATE', 'NEEDS_SUPPORT', 'PRIORITY_SUPPORT', 'INSUFFICIENT_DATA'],
      default: 'INSUFFICIENT_DATA',
      index: true
    },
    isEligibleForScore: {
      type: Boolean,
      default: false
    },
    ineligibleReason: {
      type: String,
      default: null
    },
    inScopeRecordCount: {
      type: Number,
      default: 0
    },
    unresolvedCount: {
      type: Number,
      default: 0
    },
    metrics: {
      m1Completeness: {
        status: {
          type: String,
          enum: ['AVAILABLE', 'INSUFFICIENT_DATA', 'UNAVAILABLE'],
          default: 'UNAVAILABLE'
        },
        completenessPct: { type: Number, default: null },
        subScore: { type: Number, default: null },
        weightConfigured: { type: Number, default: 0.40 },
        weightUsed: { type: Number, default: null },
        inScopeRecords: { type: Number, default: 0 },
        totalMandatoryFieldInstances: { type: Number, default: 0 },
        populatedMandatoryFieldInstances: { type: Number, default: 0 },
        missingFieldsCount: { type: mongoose.Schema.Types.Mixed, default: {} },
        ruleVersion: { type: String, default: 'roster-req-fields@1' },
        missingReason: { type: String, default: null }
      },
      m2Discrepancies: {
        status: {
          type: String,
          enum: ['AVAILABLE', 'INSUFFICIENT_DATA', 'UNAVAILABLE'],
          default: 'UNAVAILABLE'
        },
        openDiscrepancies: { type: Number, default: 0 },
        unresolvedRatePer1000: { type: Number, default: null },
        subScore: { type: Number, default: null },
        weightConfigured: { type: Number, default: 0.30 },
        weightUsed: { type: Number, default: null },
        bySeverity: { type: mongoose.Schema.Types.Mixed, default: {} },
        byType: { type: mongoose.Schema.Types.Mixed, default: {} },
        ageingBuckets: {
          '0_to_7_days': { type: Number, default: 0 },
          '8_to_30_days': { type: Number, default: 0 },
          '31_plus_days': { type: Number, default: 0 }
        },
        medianResolutionTimeDays: { type: Number, default: null },
        p90ResolutionTimeDays: { type: Number, default: null },
        missingReason: { type: String, default: null }
      },
      m3Timeliness: {
        status: {
          type: String,
          enum: ['AVAILABLE', 'INSUFFICIENT_DATA', 'UNAVAILABLE'],
          default: 'UNAVAILABLE'
        },
        medianLagDays: { type: Number, default: null },
        p90LagDays: { type: Number, default: null },
        onTimePct: { type: Number, default: null },
        subScore: { type: Number, default: null },
        weightConfigured: { type: Number, default: 0.30 },
        weightUsed: { type: Number, default: null },
        eligibleEventCount: { type: Number, default: 0 },
        excludedEventCount: { type: Number, default: 0 },
        dataFreshnessDays: { type: Number, default: null },
        lastUpdatedTimestamp: { type: Date, default: null },
        missingReason: { type: String, default: null }
      },
      m4Corrections: {
        status: {
          type: String,
          enum: ['AVAILABLE', 'INSUFFICIENT_DATA', 'UNAVAILABLE'],
          default: 'UNAVAILABLE'
        },
        totalCorrections: { type: Number, default: 0 },
        correctionsPer100Records: { type: Number, default: null },
        repeatCorrectionRate: { type: Number, default: null },
        medianTurnaroundDays: { type: Number, default: null },
        selfInitiatedCount: { type: Number, default: 0 },
        promptedCount: { type: Number, default: 0 },
        trendDirection: {
          type: String,
          enum: ['INCREASING', 'DECREASING', 'STABLE', 'NONE'],
          default: 'NONE'
        },
        enabledInScore: { type: Boolean, default: false },
        subScore: { type: Number, default: null },
        weightConfigured: { type: Number, default: 0.00 },
        weightUsed: { type: Number, default: null },
        missingReason: { type: String, default: null }
      }
    },
    dataCoverage: {
      coveragePct: { type: Number, default: 0 },
      expectedSources: {
        type: [String],
        default: ['INSTITUTION_ROSTER', 'NATIONAL_APAAR_REGISTRY', 'BOARD_RESULTS_REGISTER']
      },
      availableSources: { type: [String], default: [] },
      missingSources: { type: [String], default: [] },
      sourceModes: { type: mongoose.Schema.Types.Mixed, default: {} },
      sourceFreshness: { type: mongoose.Schema.Types.Mixed, default: {} }
    },
    configVersion: {
      type: String,
      required: true,
      default: 'v1.0',
      index: true
    },
    scoringParameters: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    calculatedAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    triggerReason: {
      type: String,
      enum: [
        'INITIAL_CALCULATION',
        'MANUAL_RECALCULATE',
        'SCHEDULED',
        'ROSTER_COMMITTED',
        'DISCREPANCY_RESOLVED',
        'CORRECTION_LOGGED'
      ],
      default: 'INITIAL_CALCULATION'
    },
    isStale: {
      type: Boolean,
      default: false,
      index: true
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
      default: 'NOT_STARTED'
    },
    supportSuggestions: [
      {
        id: String,
        title: String,
        recommendedAction: String,
        triggerMetric: String,
        triggerValue: mongoose.Schema.Types.Mixed,
        ruleExplanation: String,
        suggestedWorkflow: String,
        evidenceRef: String
      }
    ],
    disclaimer: {
      type: String,
      default: MANDATORY_DISCLAIMER
    }
  },
  {
    timestamps: true
  }
);

scoreSnapshotSchema.index({ institutionId: 1, reportingPeriod: 1, calculatedAt: -1 });
scoreSnapshotSchema.index({ institutionId: 1, configVersion: 1 });
scoreSnapshotSchema.index({ institutionType: 1, reportingPeriod: 1, configVersion: 1 });

module.exports = mongoose.model('ScoreSnapshot', scoreSnapshotSchema);
module.exports.MANDATORY_DISCLAIMER = MANDATORY_DISCLAIMER;
