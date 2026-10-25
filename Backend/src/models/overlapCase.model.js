/**
 * Enrolment Overlap Case Model.
 * Represents non-punitive, informational observations where active enrolment intervals
 * for the same student token overlap across institutions.
 * Preserves append-only review decisions and strictly neutral explanations.
 */
const mongoose = require('mongoose');

const OVERLAP_STATUSES = ['OPEN', 'IN_REVIEW', 'RESOLVED'];

const RESOLUTION_CODES = [
  'LEGITIMATE_TRANSFER',
  'DATA_ENTRY_ERROR_CORRECTED',
  'PERMITTED_PARALLEL',
  'REFERRED_FOR_POLICY_REVIEW',
  'NO_ACTION'
];

const DEFAULT_NEUTRAL_EXPLANATION =
  'Overlap may be legitimate (e.g., permitted arrangements, pending paperwork). Applicable policy must be verified.';

const overlapCaseSchema = new mongoose.Schema(
  {
    caseId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true
    },
    studentTokenId: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    keyVersion: {
      type: String,
      required: true,
      default: 'v1',
      index: true
    },
    studentRef: {
      type: String,
      default: null,
      trim: true
    },
    institutions: [
      {
        institutionId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Institution',
          required: true
        },
        programmeCode: String,
        academicYear: String,
        enrollmentInterval: {
          startDate: Date,
          endDate: Date
        }
      }
    ],
    overlapInterval: {
      startDate: { type: Date, required: true },
      endDate: { type: Date, default: null },
      overlapDays: { type: Number, default: 0 }
    },
    caseType: {
      type: String,
      enum: ['OVERLAP', 'OVERLAP_REVIEW'],
      default: 'OVERLAP'
    },
    status: {
      type: String,
      enum: OVERLAP_STATUSES,
      default: 'OPEN',
      index: true
    },
    severity: {
      type: String,
      enum: ['INFO', 'WARNING'],
      default: 'INFO'
    },
    policySourceRef: {
      type: String,
      default: 'AICTE_ACADEMIC_HANDBOOK_CONCURRENT_ENROLMENT'
    },
    policyVerified: {
      type: Boolean,
      default: false
    },
    explanation: {
      type: String,
      default: DEFAULT_NEUTRAL_EXPLANATION
    },
    resolution: {
      code: {
        type: String,
        enum: RESOLUTION_CODES,
        default: null
      },
      notes: { type: String, default: null },
      resolvedBy: {
        userId: String,
        role: String,
        email: String
      },
      resolvedAt: { type: Date, default: null }
    },
    resolutionHistory: [
      {
        code: String,
        notes: String,
        by: String,
        role: String,
        at: { type: Date, default: Date.now }
      }
    ]
  },
  {
    timestamps: true
  }
);

overlapCaseSchema.index({ studentTokenId: 1, keyVersion: 1, status: 1 });
overlapCaseSchema.index({ 'institutions.institutionId': 1, status: 1 });

module.exports = mongoose.model('OverlapCase', overlapCaseSchema);
module.exports.OVERLAP_STATUSES = OVERLAP_STATUSES;
module.exports.RESOLUTION_CODES = RESOLUTION_CODES;
module.exports.DEFAULT_NEUTRAL_EXPLANATION = DEFAULT_NEUTRAL_EXPLANATION;
