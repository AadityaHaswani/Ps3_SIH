/**
 * Data Correction Event Model.
 * Minimal attributable model capturing data corrections and timestamps.
 * Measures correction activity and turnaround times without prematurely implementing
 * the full Change Blast-Radius / Sealed Roster workflow.
 */
const mongoose = require('mongoose');

const correctionEventSchema = new mongoose.Schema(
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
    recordId: {
      type: String,
      required: true,
      index: true
    },
    recordType: {
      type: String,
      enum: ['ROSTER_ROW', 'SEAT_BALANCE', 'FINDING_RESOLUTION', 'INTAKE_DECLARATION'],
      default: 'ROSTER_ROW'
    },
    fieldCorrected: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    oldValueMasked: {
      type: String,
      default: null
    },
    newValueMasked: {
      type: String,
      default: null
    },
    isRepeatCorrection: {
      type: Boolean,
      default: false,
      index: true
    },
    isSelfInitiated: {
      type: Boolean,
      default: true
    },
    promptedByFindingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ReconciliationFinding',
      default: null
    },
    turnaroundHours: {
      type: Number,
      default: null
    },
    correctedBy: {
      userId: { type: String, default: null },
      role: { type: String, default: 'INSTITUTION_ADMIN' },
      email: { type: String, default: null }
    },
    correctedAt: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: true
  }
);

correctionEventSchema.index({ institutionId: 1, reportingPeriod: 1, correctedAt: -1 });
correctionEventSchema.index({ institutionId: 1, recordId: 1, fieldCorrected: 1 });

module.exports = mongoose.model('DataCorrectionEvent', correctionEventSchema);
