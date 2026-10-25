/**
 * Audit Event Model.
 * Represents append-only immutable records of administrative, lifecycle, transfer,
 * and review actions taken across the platform.
 */
const mongoose = require('mongoose');

const auditEventSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      index: true
    },
    entityType: {
      type: String,
      required: true,
      index: true
    },
    entityId: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    },
    institutionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Institution',
      default: null,
      index: true
    },
    performedBy: {
      userId: { type: String, default: null },
      role: { type: String, default: null },
      email: { type: String, default: null }
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: { createdAt: true, updatedAt: false }
  }
);

auditEventSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
auditEventSchema.index({ institutionId: 1, createdAt: -1 });

module.exports = mongoose.model('AuditEvent', auditEventSchema);
