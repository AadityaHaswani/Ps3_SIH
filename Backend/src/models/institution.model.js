/**
 * Institution Model.
 * Represents colleges, universities, and polytechnic institutes under oversight.
 */
const mongoose = require('mongoose');

const institutionSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    type: {
      type: String,
      enum: ['ENGINEERING', 'MANAGEMENT', 'PHARMACY', 'POLYTECHNIC', 'ARCHITECTURE', 'OTHER'],
      default: 'ENGINEERING'
    },
    state: {
      type: String,
      required: true,
      trim: true
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE'
    },
    dataMode: {
      type: String,
      enum: ['DEMO', 'LIVE'],
      default: 'DEMO'
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Institution', institutionSchema);
