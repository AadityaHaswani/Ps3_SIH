/**
 * Roster Version Model.
 * Represents an immutable, committed version of an institution's student roster for an academic year.
 */
const mongoose = require('mongoose');

const rosterVersionSchema = new mongoose.Schema(
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
    versionNumber: {
      type: Number,
      required: true,
      default: 1
    },
    status: {
      type: String,
      enum: ['COMMITTED', 'SUPERSEDED'],
      default: 'COMMITTED'
    },
    uploadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RosterUpload',
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
    committedBy: {
      userId: String,
      role: String,
      email: String
    },
    committedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

rosterVersionSchema.index(
  { institutionId: 1, academicYear: 1, versionNumber: -1 },
  { unique: true }
);

module.exports = mongoose.model('RosterVersion', rosterVersionSchema);
