/**
 * Roster Row Model.
 * Represents student rows within a roster upload and committed version.
 * Stores keyed HMAC tokens instead of raw APAAR identifiers to preserve privacy.
 */
const mongoose = require('mongoose');

const rosterRowSchema = new mongoose.Schema(
  {
    rosterUploadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RosterUpload',
      required: true,
      index: true
    },
    rosterVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RosterVersion',
      index: true,
      default: null
    },
    rowKey: {
      type: String,
      required: true
    },
    applicationNo: {
      type: String,
      required: true,
      trim: true
    },
    apaarToken: {
      type: String,
      index: true,
      default: null
    },
    apaarLast4: {
      type: String,
      default: null
    },
    name: {
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
      required: true // Stored as ISO YYYY-MM-DD
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
    admissionQuota: {
      type: String,
      default: 'STATE_MERIT',
      trim: true
    },
    admissionDate: {
      type: String,
      default: null
    },
    validationStatus: {
      type: String,
      enum: ['VALID', 'INVALID'],
      default: 'VALID'
    },
    validationErrors: [
      {
        field: String,
        issue: String
      }
    ]
  },
  {
    timestamps: true
  }
);

rosterRowSchema.index({ rosterUploadId: 1, rowKey: 1 });
rosterRowSchema.index({ rosterVersionId: 1, programmeCode: 1, category: 1 });
rosterRowSchema.index({ applicationNo: 1, programmeCode: 1, academicYear: 1 });

module.exports = mongoose.model('RosterRow', rosterRowSchema);
