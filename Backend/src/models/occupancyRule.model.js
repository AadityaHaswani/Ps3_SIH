/**
 * Occupancy Rule Model.
 * Configures category accounting rules, warning thresholds, and regulatory policy references.
 * Explicitly carries policyVerified = false by default to prevent hardcoded regulatory assumptions.
 */
const mongoose = require('mongoose');

const categoryMappingSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      required: true,
      uppercase: true,
      trim: true
    },
    countsAgainst: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      default: 'GENERAL'
    },
    isSupernumerary: {
      type: Boolean,
      default: false
    }
  },
  { _id: false }
);

const occupancyRuleSchema = new mongoose.Schema(
  {
    ruleVersion: {
      type: String,
      required: true,
      trim: true,
      default: 'occupancy-rules@1',
      index: true
    },
    institutionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Institution',
      default: null,
      index: true // null = system-wide default rule
    },
    programmeCode: {
      type: String,
      uppercase: true,
      trim: true,
      default: null // null = applies to all programmes
    },
    academicYear: {
      type: String,
      trim: true,
      default: null // null = applies to all academic years
    },
    warningThresholdPct: {
      type: Number,
      required: true,
      default: 90,
      min: 1,
      max: 100
    },
    categoryMappings: [categoryMappingSchema],
    policySourceRef: {
      type: String,
      default: 'AICTE_APH_2025_26',
      trim: true
    },
    policyVerified: {
      type: Boolean,
      default: false // Hard policy: unverified by default
    },
    effectiveDate: {
      type: Date,
      default: Date.now
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    }
  },
  {
    timestamps: true
  }
);

occupancyRuleSchema.index({ institutionId: 1, isActive: 1 });

module.exports = mongoose.model('OccupancyRule', occupancyRuleSchema);
