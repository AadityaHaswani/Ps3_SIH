/**
 * Health check route declarations.
 */
const express = require('express');
const { getSystemHealth, getLiveness, getReadiness } = require('../controllers/health.controller');

const router = express.Router();

router.get('/', getSystemHealth);
router.get('/live', getLiveness);
router.get('/ready', getReadiness);

module.exports = router;
