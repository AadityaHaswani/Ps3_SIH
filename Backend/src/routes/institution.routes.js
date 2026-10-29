/**
 * Institutions Routes.
 * Provides institution discovery for all authenticated roles.
 */
const express = require('express');
const Institution = require('../models/institution.model');
const { authenticate, authorize } = require('../middleware/auth');
const { sendSuccess } = require('../utils/apiResponse');

const router = express.Router();

router.use(authenticate);

// GET /api/v1/institutions
router.get('/', async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    // Institution roles are scoped to their institution
    if (['INSTITUTION_ADMIN', 'INSTITUTION_OPERATOR'].includes(req.user.role) && req.user.institutionId) {
      filter._id = req.user.institutionId;
    } else if (req.user.role === 'AUTHORITY_OFFICER' && req.user.assignedInstitutionIds?.length) {
      filter._id = { $in: req.user.assignedInstitutionIds };
    }

    const items = await Institution.find(filter)
      .sort({ code: 1 })
      .select('_id code name type state status dataMode')
      .lean();

    const formatted = items.map(inst => ({
      ...inst,
      id: String(inst._id)
    }));

    return sendSuccess(res, formatted);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/institutions/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const query = id.match(/^[0-9a-fA-F]{24}$/) ? { _id: id } : { code: id.toUpperCase() };
    const inst = await Institution.findOne(query).lean();
    if (!inst) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Institution not found.' } });
    }
    return sendSuccess(res, { ...inst, id: String(inst._id) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
