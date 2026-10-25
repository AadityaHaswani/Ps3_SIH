/**
 * Transfer Case Model.
 * Manages two-sided, institution-authorised student transfer handshake.
 * Tracks sending and receiving confirmations, effective dates, deadline timeouts,
 * date-gap tolerances, and immutable audit history.
 */
const mongoose = require('mongoose');

const TRANSFER_STATUSES = [
  'PENDING',
  'TRANSFER_CONFIRMED',
  'TRANSFER_REJECTED',
  'NEEDS_REVIEW'
];

const transferConfirmationSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['PENDING', 'CONFIRMED', 'REJECTED'],
      default: 'PENDING'
    },
    confirmedAt: {
      type: Date,
      default: null
    },
    effectiveDate: {
      type: Date,
      default: null
    },
    confirmedBy: {
      userId: { type: String, default: null },
      role: { type: String, default: null },
      email: { type: String, default: null }
    },
    reason: {
      type: String,
      default: null,
      trim: true
    },
    notes: {
      type: String,
      default: null,
      trim: true
    }
  },
  { _id: false }
);

const transferCaseSchema = new mongoose.Schema(
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
    studentRef: {
      type: String,
      default: null,
      trim: true
    },
    sendingInstitutionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Institution',
      required: true,
      index: true
    },
    receivingInstitutionId: {
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
      default: 'GENERAL',
      uppercase: true,
      trim: true
    },
    proposedEffectiveDate: {
      type: Date,
      required: true
    },
    sendingConfirmation: {
      type: transferConfirmationSchema,
      default: () => ({ status: 'PENDING' })
    },
    receivingConfirmation: {
      type: transferConfirmationSchema,
      default: () => ({ status: 'PENDING' })
    },
    status: {
      type: String,
      enum: TRANSFER_STATUSES,
      default: 'PENDING',
      index: true
    },
    statusReason: {
      type: String,
      default: null,
      trim: true
    },
    deadline: {
      type: Date,
      required: true,
      index: true
    },
    dateGapDays: {
      type: Number,
      default: null
    },
    ledgerSynced: {
      type: Boolean,
      default: false
    },
    ledgerEntries: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SeatLedgerEntry'
      }
    ],
    history: [
      {
        action: String,
        by: String,
        role: String,
        institutionId: mongoose.Schema.Types.ObjectId,
        at: { type: Date, default: Date.now },
        notes: String
      }
    ],
    idempotencyKey: {
      type: String,
      trim: true
    }
  },
  {
    timestamps: true
  }
);

transferCaseSchema.index(
  { idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: 'string' } }
  }
);

transferCaseSchema.index({ studentTokenId: 1, keyVersion: 1, status: 1 });
transferCaseSchema.index(
  { studentTokenId: 1, keyVersion: 1, sendingInstitutionId: 1, receivingInstitutionId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'PENDING' }
  }
);
transferCaseSchema.index({ sendingInstitutionId: 1, status: 1 });
transferCaseSchema.index({ receivingInstitutionId: 1, status: 1 });
transferCaseSchema.index({ status: 1, deadline: 1 });

module.exports = mongoose.model('TransferCase', transferCaseSchema);
module.exports.TRANSFER_STATUSES = TRANSFER_STATUSES;
