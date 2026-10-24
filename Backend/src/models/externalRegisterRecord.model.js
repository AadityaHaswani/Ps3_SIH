/**
 * External Register Record Model.
 * Represents independent register records (Admission/Allotment registers, Exam registers)
 * used for Seat Three-Way Match reconciliation.
 * In prototype, external registers carry sourceMode = "SIMULATED".
 */
const mongoose = require('mongoose');

const externalRegisterRecordSchema = new mongoose.Schema(
  {
    sourceType: {
      type: String,
      enum: ['ADMISSION', 'ALLOTMENT', 'EXAM', 'SCHOLARSHIP'],
      required: true,
      index: true
    },
    sourceMode: {
      type: String,
      enum: ['SIMULATED', 'LIVE'],
      default: 'SIMULATED'
    },
    sourceIdentifier: {
      type: String,
      required: true,
      trim: true
    },
    institutionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Institution',
      required: true,
      index: true
    },
    programmeCode: {
      type: String,
      required: true,
      uppercase: true,
      trim: true
    },
    academicYear: {
      type: String,
      required: true,
      trim: true
    },
    apaarToken: {
      type: String,
      index: true,
      default: null
    },
    applicationNo: {
      type: String,
      trim: true,
      default: null
    },
    candidateName: {
      type: String,
      required: true,
      trim: true
    },
    normalisedName: {
      type: String,
      required: true
    },
    dob: {
      type: String,
      required: true // ISO YYYY-MM-DD
    },
    gender: {
      type: String,
      enum: ['MALE', 'FEMALE', 'OTHER'],
      default: 'OTHER'
    },
    category: {
      type: String,
      default: 'GENERAL',
      trim: true
    },
    status: {
      type: String,
      default: 'CONFIRMED'
    },
    asOf: {
      type: Date,
      default: Date.now
    },
    provenance: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

externalRegisterRecordSchema.index({ institutionId: 1, academicYear: 1, sourceType: 1 });
externalRegisterRecordSchema.index({ applicationNo: 1, programmeCode: 1, academicYear: 1 });

module.exports = mongoose.model('ExternalRegisterRecord', externalRegisterRecordSchema);
