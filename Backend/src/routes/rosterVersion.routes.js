/**
 * Roster Version Routes.
 * Mounts endpoints for committed version retrieval, version diffs, blast-radius impacts,
 * cryptographic seals, signed receipts, and seal verification under /api/v1/roster-versions.
 */
const express = require('express');
const { authenticate, authorize, scopeToInstitution } = require('../middleware/auth');
const { PERMISSIONS } = require('../config/permissions');
const {
  handleListVersions,
  handleGetChainHead,
  handleGetVersion,
  handleCompareVersions,
  handleGetImpact,
  handleGetSeal,
  handleGetReceipt,
  handleVerifySeal,
  handleRevalidateOutput
} = require('../controllers/rosterVersion.controller');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// 1. Chain-head attestation query
router.get('/chain-head', handleGetChainHead);

// 2. List committed versions
router.get('/', scopeToInstitution, handleListVersions);

// 3. Get version details
router.get('/:id', handleGetVersion);

// 4. Compare version with predecessor or explicit version
router.get('/:id/compare', handleCompareVersions);

// 5. Get change blast-radius assessment
router.get('/:id/impact', handleGetImpact);

// 6. Get cryptographic Merkle seal manifest
router.get('/:id/seal', handleGetSeal);

// 7. Download/view signed cryptographic receipt
router.get('/:id/receipt', handleGetReceipt);

// 8. Cryptographic seal verification (audited)
router.post('/:id/verify-seal', handleVerifySeal);

// 9. Revalidate affected output (Authority and Institution Admins only, strictly forbidden to Auditors)
router.post(
  '/:id/revalidate',
  authorize([PERMISSIONS.ROSTER_VERSIONS_REVALIDATE]),
  handleRevalidateOutput
);

module.exports = router;
