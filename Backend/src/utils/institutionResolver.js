const mongoose = require('mongoose');
const Institution = require('../models/institution.model');

/**
 * Resolves an institution identifier or code (e.g. 'SIT-DEMO-01' or '6addc98bd023732c35a44f17')
 * to its canonical MongoDB ObjectId string.
 *
 * @param {string|mongoose.Types.ObjectId} idOrCode
 * @returns {Promise<string|null>} 24-character hex ObjectId string, or null if not found
 */
async function resolveInstitutionId(idOrCode) {
  if (!idOrCode) return null;
  const str = String(idOrCode).trim();
  if (mongoose.Types.ObjectId.isValid(str) && /^[0-9a-fA-F]{24}$/.test(str)) {
    return str;
  }
  const inst = await Institution.findOne({
    $or: [
      { code: str.toUpperCase() },
      { code: str }
    ]
  }).select('_id code').lean();

  return inst ? String(inst._id) : null;
}

module.exports = {
  resolveInstitutionId
};
