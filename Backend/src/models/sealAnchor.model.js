/**
 * Seal Anchor Model.
 * Represents an immutable, trusted signed anchor for an IntegritySeal manifest.
 * Forms a tamper-evident append-only hash chain signed by the central authority via Ed25519.
 */
const mongoose = require('mongoose');

const sealAnchorSchema = new mongoose.Schema(
  {
    anchorId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true
    },
    rosterVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RosterVersion',
      required: true,
      unique: true,
      index: true
    },
    sealId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'IntegritySeal',
      required: true,
      index: true
    },
    institutionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Institution',
      required: true,
      index: true
    },
    academicYear: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    sequenceNumber: {
      type: Number,
      required: true,
      index: true
    },
    manifestHash: {
      type: String,
      required: true,
      trim: true
    },
    sealRoot: {
      type: String,
      required: true,
      trim: true
    },
    previousAnchorHash: {
      type: String,
      default: null,
      trim: true
    },
    anchorHash: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true
    },
    signingKeyVersion: {
      type: String,
      required: true,
      default: 'ed25519_v1'
    },
    signature: {
      type: String,
      required: true,
      trim: true
    },
    signerIdentity: {
      type: String,
      required: true,
      default: 'AICTE_CENTRAL_AUTHORITY_SIGNER'
    },
    anchoredAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    status: {
      type: String,
      enum: ['COMMITTED', 'SUPERSEDED'],
      default: 'COMMITTED',
      index: true
    },
    history: [
      {
        action: { type: String, required: true },
        at: { type: Date, default: Date.now },
        by: String,
        notes: String
      }
    ]
  },
  {
    timestamps: true
  }
);

sealAnchorSchema.index(
  { institutionId: 1, academicYear: 1, sequenceNumber: 1 },
  { unique: true }
);

module.exports = mongoose.model('SealAnchor', sealAnchorSchema);
