/**
 * Integrity Seal Model.
 * Represents an immutable cryptographic Merkle seal manifest for a committed roster version.
 * Contains domain-separated Merkle root, row count, previous seal root (chain link), and manifest hash.
 */
const mongoose = require('mongoose');

const integritySealSchema = new mongoose.Schema(
  {
    rosterVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RosterVersion',
      required: true,
      unique: true,
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
    versionNumber: {
      type: Number,
      required: true
    },
    rowCount: {
      type: Number,
      required: true,
      min: 0
    },
    sealSchemaVersion: {
      type: String,
      required: true,
      default: 'v1.0'
    },
    merkleRoot: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    previousSealRoot: {
      type: String,
      default: null,
      trim: true
    },
    manifestHash: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    rowHashSample: [
      {
        rowKey: { type: String, required: true },
        leafHash: { type: String, required: true }
      }
    ],
    sealedAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    sealedBy: {
      userId: { type: String, default: null },
      role: { type: String, default: null },
      email: { type: String, default: null }
    },
    metadata: {
      hashAlgorithm: { type: String, default: 'SHA-256' },
      domainSeparation: { type: Boolean, default: true },
      oddNodeRule: { type: String, default: 'PROMOTE' }
    }
  },
  {
    timestamps: true
  }
);

integritySealSchema.index({ institutionId: 1, academicYear: 1, versionNumber: -1 });

module.exports = mongoose.model('IntegritySeal', integritySealSchema);
