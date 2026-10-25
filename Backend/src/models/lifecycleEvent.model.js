/**
 * Student Lifecycle Event Model.
 * Represents an append-only historical record of student lifecycle transitions.
 * Supports privacy-preserving HMAC tokens with key-version tracking.
 * Historical events are immutable; corrections create a new CORRECTED event
 * marking the prior event as SUPERSEDED via supersedesEventId.
 */
const mongoose = require('mongoose');

const LIFECYCLE_EVENT_TYPES = [
  'ADMITTED',
  'ENROLLED',
  'TRANSFER_OUT_REQUESTED',
  'TRANSFER_OUT_CONFIRMED',
  'TRANSFER_IN_REQUESTED',
  'TRANSFER_IN_CONFIRMED',
  'WITHDRAWN',
  'COMPLETED',
  'CORRECTED'
];

const studentLifecycleEventSchema = new mongoose.Schema(
  {
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
    institutionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Institution',
      required: true,
      index: true
    },
    type: {
      type: String,
      enum: LIFECYCLE_EVENT_TYPES,
      required: true,
      index: true
    },
    effectiveDate: {
      type: Date,
      required: true,
      index: true
    },
    reportedAt: {
      type: Date,
      default: Date.now,
      required: true
    },
    sourceRef: {
      type: String,
      default: null,
      trim: true
    },
    status: {
      type: String,
      enum: ['VALID', 'SUPERSEDED'],
      default: 'VALID',
      index: true
    },
    supersedesEventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StudentLifecycleEvent',
      default: null,
      index: true
    },
    reason: {
      type: String,
      default: null,
      trim: true
    },
    programmeCode: {
      type: String,
      default: null,
      uppercase: true,
      trim: true
    },
    academicYear: {
      type: String,
      default: null,
      trim: true
    },
    seatCategory: {
      type: String,
      default: 'GENERAL',
      uppercase: true,
      trim: true
    },
    notes: {
      type: String,
      default: null,
      trim: true
    },
    actor: {
      userId: { type: String, default: 'system' },
      role: { type: String, default: 'INSTITUTION_ADMIN' },
      email: { type: String, default: null }
    },
    idempotencyKey: {
      type: String,
      trim: true
    }
  },
  {
    timestamps: true
  }
);

studentLifecycleEventSchema.index(
  { idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: 'string' } }
  }
);

studentLifecycleEventSchema.index({ studentTokenId: 1, keyVersion: 1, effectiveDate: 1 });
studentLifecycleEventSchema.index({ institutionId: 1, effectiveDate: 1 });
studentLifecycleEventSchema.index({ studentTokenId: 1, status: 1 });

module.exports = mongoose.model('StudentLifecycleEvent', studentLifecycleEventSchema);
module.exports.LIFECYCLE_EVENT_TYPES = LIFECYCLE_EVENT_TYPES;
