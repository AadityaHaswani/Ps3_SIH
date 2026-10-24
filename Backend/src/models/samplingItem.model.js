/**
 * Sampling Item Model.
 * Represents an individual sampled record within an Assurance Sampling run.
 * Contains masked PII, privacy-safe tokens, and append-only audit verification history.
 */
const mongoose = require('mongoose');

const itemHistorySchema = new mongoose.Schema(
  {
    previousStatus: {
      type: String,
      required: true
    },
    newStatus: {
      type: String,
      required: true
    },
    verificationMethod: {
      type: String,
      default: null
    },
    evidenceRef: {
      type: String,
      default: null
    },
    notes: {
      type: String,
      default: null
    },
    updatedBy: {
      userId: { type: String, default: null },
      role: { type: String, default: null },
      email: { type: String, default: null }
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  },
  { _id: true }
);

const samplingItemSchema = new mongoose.Schema(
  {
    samplingRunId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SamplingRun',
      required: true,
      index: true
    },
    institutionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Institution',
      required: true,
      index: true
    },
    rosterRowId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RosterRow',
      required: true
    },
    rowKey: {
      type: String,
      required: true
    },
    stratum: {
      type: String,
      enum: ['RANDOM', 'RISK_TARGETED'],
      default: 'RANDOM',
      index: true
    },
    selectionOrder: {
      type: Number,
      required: true
    },
    // Safe Masked Identifiers & Pseudonymized HMAC Tokens
    applicationNo: {
      type: String,
      default: null
    },
    apaarToken: {
      type: String,
      default: null
    },
    apaarLast4: {
      type: String,
      default: null
    },
    studentNameMasked: {
      type: String,
      default: null
    },
    dob: {
      type: String,
      default: null
    },
    gender: {
      type: String,
      default: null
    },
    category: {
      type: String,
      default: null
    },
    programmeCode: {
      type: String,
      default: null
    },
    academicYear: {
      type: String,
      default: null
    },
    // Verification Status and Metadata
    verificationStatus: {
      type: String,
      enum: ['PENDING', 'VERIFIED', 'FAILED_CHECK', 'UNCONFIRMED', 'EXCLUDED'],
      default: 'PENDING',
      index: true
    },
    verificationMethod: {
      type: String,
      enum: [
        'DOCUMENT_INSPECTION',
        'CROSS_REGISTER_MATCH',
        'DIRECT_CONTACT_CALL',
        'INSTITUTIONAL_AFFIDAVIT',
        'REGULATORY_ORDER',
        'OTHER',
        null
      ],
      default: null
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
    exclusionReason: {
      type: String,
      default: null,
      trim: true
    },
    verifiedBy: {
      userId: { type: String, default: null },
      role: { type: String, default: null },
      email: { type: String, default: null }
    },
    verifiedAt: {
      type: Date,
      default: null
    },
    history: [itemHistorySchema]
  },
  {
    timestamps: true
  }
);

samplingItemSchema.index({ samplingRunId: 1, verificationStatus: 1 });
samplingItemSchema.index({ samplingRunId: 1, stratum: 1 });
samplingItemSchema.index({ institutionId: 1, rosterRowId: 1 });

module.exports = mongoose.model('SamplingItem', samplingItemSchema);
