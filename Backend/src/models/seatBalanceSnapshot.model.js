/**
 * Seat Balance Snapshot Model.
 * Captures historical bucket states on-change or periodically to power time-series charts.
 */
const mongoose = require('mongoose');

const seatBalanceSnapshotSchema = new mongoose.Schema(
  {
    bucketKey: {
      type: String,
      required: true,
      trim: true,
      index: true
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
    seatCategory: {
      type: String,
      required: true,
      uppercase: true,
      trim: true
    },
    approvedIntake: {
      type: Number,
      default: null
    },
    occupancy: {
      type: Number,
      default: 0
    },
    headroom: {
      type: Number,
      default: null
    },
    utilisationPct: {
      type: Number,
      default: null
    },
    status: {
      type: String,
      required: true
    },
    snapshotDate: {
      type: Date,
      default: Date.now,
      index: true
    },
    trigger: {
      type: String,
      enum: ['ROSTER_COMMIT', 'INTAKE_SET', 'INTAKE_REVISED', 'PERIODIC', 'MANUAL_SYNC'],
      default: 'ROSTER_COMMIT'
    },
    triggerRef: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true
  }
);

seatBalanceSnapshotSchema.index({ bucketKey: 1, snapshotDate: -1 });
seatBalanceSnapshotSchema.index({ institutionId: 1, snapshotDate: -1 });

module.exports = mongoose.model('SeatBalanceSnapshot', seatBalanceSnapshotSchema);
