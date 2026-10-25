/**
 * Roster Routes.
 * Mounts endpoints for uploading CSV rosters, viewing preview and validation rows,
 * and committing immutable versions.
 */
const express = require('express');
const multer = require('multer');
const {
  uploadRoster,
  getPreview,
  commitRoster,
  getRoster
} = require('../controllers/roster.controller');
const { authenticate, authorize, scopeToInstitution } = require('../middleware/auth');
const { PERMISSIONS } = require('../config/permissions');

const router = express.Router();

// Configure Multer for memory storage with 10MB limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only CSV files are accepted.'));
    }
  }
});

router.post(
  '/upload',
  authenticate,
  authorize([PERMISSIONS.ROSTERS_UPLOAD]),
  upload.single('file'),
  scopeToInstitution,
  uploadRoster
);

router.get('/:id/preview', authenticate, scopeToInstitution, getPreview);

router.post(
  '/:id/commit',
  authenticate,
  authorize([PERMISSIONS.ROSTERS_COMMIT]),
  scopeToInstitution,
  commitRoster
);

router.get('/:id', authenticate, scopeToInstitution, getRoster);

module.exports = router;
