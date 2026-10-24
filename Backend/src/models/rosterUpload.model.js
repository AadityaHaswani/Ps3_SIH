/**
 * Roster Upload Staging Model.
 * Tracks uploaded CSV file metadata, validation state, and staging errors before committing.
 */
const mongoose = require('mongoose');

const rosterUploadSchema = new mongoose.Schema(
  {
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
    programmeCode: {
      type: String,
      trim: true,
      uppercase: true,
      default: null
    },
    sourceMode: {
      type: String,
      enum: ['INSTITUTION_REPORTED', 'SIMULATED'],
      default: 'INSTITUTION_REPORTED'
    },
    filename: {
      type: String,
      required: true
    },
    fileSha256: {
      type: String,
      required: true
    },
    rowCount: {
      type: Number,
      default: 0
    },
    status: {
      type: String,
      enum: ['UPLOADED', 'VALIDATED', 'COMMITTED', 'REJECTED'],
      default: 'VALIDATED'
    },
    validation: {
      errors: { type: Number, default: 0 },
      warnings: { type: Number, default: 0 },
      ruleVersion: { type: String, default: 'roster-val@1' },
      rowErrors: [
        {
          rowNumber: Number,
          applicationNo: String,
          issues: [{ field: String, issue: String }]
        }
      ]
    },
    uploadedBy: {
      userId: String,
      role: String,
      email: String
    },
    committedVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RosterVersion',
      default: null
    }
  },
  {
    timestamps: true
  }
);

rosterUploadSchema.index({ institutionId: 1, academicYear: 1, createdAt: -1 });

module.exports = mongoose.model('RosterUpload', rosterUploadSchema);
