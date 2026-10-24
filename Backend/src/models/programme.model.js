/**
 * Programme Model.
 * Represents academic degree programmes offered by an institution with embedded approved intake records.
 */
const mongoose = require('mongoose');

const intakeRecordSchema = new mongoose.Schema(
  {
    academicYear: {
      type: String,
      required: true,
      trim: true
    },
    seatCategory: {
      type: String,
      default: 'ALL',
      trim: true
    },
    approvedIntake: {
      type: Number,
      required: true,
      min: 0
    },
    label: {
      type: String,
      enum: ['AICTE_APPROVED', 'STATE_APPROVED', 'INSTITUTION_DECLARED', 'PROVISIONAL'],
      default: 'AICTE_APPROVED'
    },
    sourceMode: {
      type: String,
      enum: ['LIVE', 'SIMULATED', 'DECLARED'],
      default: 'SIMULATED'
    },
    sourceRef: {
      type: String,
      default: null
    }
  },
  { _id: true }
);

const programmeSchema = new mongoose.Schema(
  {
    institutionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Institution',
      required: true,
      index: true
    },
    code: {
      type: String,
      required: true,
      uppercase: true,
      trim: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    durationYears: {
      type: Number,
      default: 4
    },
    intakeByYear: [intakeRecordSchema]
  },
  {
    timestamps: true
  }
);

programmeSchema.index({ institutionId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('Programme', programmeSchema);
