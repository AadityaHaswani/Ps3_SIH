/**
 * Scoring Configuration Model.
 * Represents an immutable/versioned configuration for the Institutional Data Reliability Scorecard.
 * Supports configurable weights, ceilings, ageing buckets, and minimum data thresholds.
 */
const mongoose = require('mongoose');

const scoringConfigSchema = new mongoose.Schema(
  {
    configVersion: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true
    },
    name: {
      type: String,
      required: true,
      default: 'Prototype Reliability Scoring Formula'
    },
    description: {
      type: String,
      default: 'Versioned scoring configuration for institutional data reliability and completeness'
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
    weights: {
      m1Completeness: { type: Number, default: 0.40, min: 0, max: 1 },
      m2Discrepancies: { type: Number, default: 0.30, min: 0, max: 1 },
      m3Timeliness: { type: Number, default: 0.30, min: 0, max: 1 },
      m4Corrections: { type: Number, default: 0.00, min: 0, max: 1 }
    },
    m4EnabledInScore: {
      type: Boolean,
      default: false
    },
    parameters: {
      m1: {
        requiredFields: {
          type: [String],
          default: [
            'applicationNo',
            'apaarToken',
            'name',
            'dob',
            'gender',
            'category',
            'programmeCode',
            'academicYear'
          ]
        },
        minRecords: { type: Number, default: 30 },
        ruleVersion: { type: String, default: 'roster-req-fields@1' }
      },
      m2: {
        rateCeilingPer1000: { type: Number, default: 50.0 },
        ageingBucketsDays: { type: [Number], default: [7, 30] }, // 0-7, 8-30, 31+
        minRecords: { type: Number, default: 30 },
        contributingTypes: {
          type: [String],
          default: [
            'UNMATCHED',
            'CONFLICT',
            'CANDIDATE_REVIEW',
            'DUPLICATE_CANDIDATE',
            'MISSING_FROM_ROSTER',
            'COUNT_MISMATCH'
          ]
        }
      },
      m3: {
        lagCeilingDays: { type: Number, default: 30 },
        onTimeWindowDays: { type: Number, default: 15 },
        minDatedEvents: { type: Number, default: 20 }
      },
      m4: {
        turnaroundCeilingDays: { type: Number, default: 14 },
        repeatCorrectionThresholdPct: { type: Number, default: 15 }
      },
      thresholds: {
        minRecordsForInstitutionScore: { type: Number, default: 50 },
        minMetricsRequired: { type: Number, default: 2 }
      }
    },
    bands: {
      strongMin: { type: Number, default: 85.0 },
      adequateMin: { type: Number, default: 70.0 },
      needsSupportMin: { type: Number, default: 50.0 }
    },
    isOfficialPolicy: {
      type: Boolean,
      default: false // Prototype proposed configuration, not official AICTE policy
    },
    createdBy: {
      userId: { type: String, default: 'system' },
      role: { type: String, default: 'SYSTEM' },
      email: { type: String, default: null }
    }
  },
  {
    timestamps: true
  }
);

scoringConfigSchema.index({ isActive: 1, createdAt: -1 });

module.exports = mongoose.model('ScoringConfig', scoringConfigSchema);
