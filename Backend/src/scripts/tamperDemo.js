/**
 * Scenario P10: Sealed-Roster Tampering Demonstration & Restoration Tool.
 * SIH 2026 PS3 — APAAR ID-Based Student Data Management Platform.
 *
 * This tool demonstrates cryptographic tamper detection on committed roster versions.
 *
 * SAFETY GUARDS:
 * - Strictly rejects execution if NODE_ENV === 'production'.
 * - Never runs during the default "npm run seed:demo" command.
 * - Confined strictly to synthetic demo institutions (SIT-DEMO-01 or SIT-DEMO-02).
 * - Provides immediate deterministic restoration with --restore.
 *
 * USAGE:
 *   npm.cmd run demo:tamper   (or node src/scripts/tamperDemo.js --tamper)
 *   npm.cmd run demo:restore  (or node src/scripts/tamperDemo.js --restore)
 *   node src/scripts/tamperDemo.js --status
 */
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
require('../config/dns');

const { connectDB, disconnectDB } = require('../config/db');
const Institution = require('../models/institution.model');
const RosterVersion = require('../models/rosterVersion.model');
const RosterRow = require('../models/rosterRow.model');
const IntegritySeal = require('../models/integritySeal.model');
const { verifyRosterSeal } = require('../services/sealService');

const TARGET_INST_CODE = 'SIT-DEMO-02';
const TAMPER_MARKER = ' [TAMPERED_RECORD_DEMO]';

async function runTamperTool(mode = '--status') {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[Tamper Tool] CRITICAL REJECTION: Tamper tool cannot be executed in production environment.');
  }

  const conn = await connectDB();
  try {
    const institution = await Institution.findOne({ code: TARGET_INST_CODE }).lean();
    if (!institution) {
      throw new Error(`Demo institution ${TARGET_INST_CODE} not found. Please run "npm run seed:demo" first.`);
    }

    const version = await RosterVersion.findOne({
      institutionId: institution._id,
      status: 'COMMITTED',
      versionNumber: 1
    }).lean();

    if (!version) {
      throw new Error(`Committed v1 roster version for ${TARGET_INST_CODE} not found.`);
    }

    const seal = await IntegritySeal.findOne({ rosterVersionId: version._id }).lean();
    if (!seal) {
      throw new Error(`Integrity seal for version ${version._id} not found.`);
    }

    // Pick the first row in the sample for clear demonstration
    const sampleKey = seal.rowHashSample && seal.rowHashSample[0] ? seal.rowHashSample[0].rowKey : null;
    const targetRow = sampleKey
      ? await RosterRow.findOne({ rosterVersionId: version._id, rowKey: sampleKey })
      : await RosterRow.findOne({ rosterVersionId: version._id });

    if (!targetRow) {
      throw new Error(`No target row found for version ${version._id}.`);
    }

    console.log(`\n================================================================`);
    console.log(`SCENARIO P10: SEALED-ROSTER TAMPER DETECTION TOOL`);
    console.log(`Target Institution: ${institution.name} (${institution.code})`);
    console.log(`Target Roster Version: v${version.versionNumber} (${version._id})`);
    console.log(`Sealed Merkle Root: ${seal.merkleRoot}`);
    console.log(`Target Row Key: ${targetRow.rowKey}`);
    console.log(`Current Category: "${targetRow.category}"`);
    console.log(`================================================================\n`);

    if (mode === '--tamper') {
      const originalCategory = targetRow.category || 'GENERAL';
      const tamperedCategory = originalCategory === 'GENERAL' ? 'RESERVED_A' : 'GENERAL';

      if (targetRow.tamperBackup) {
        console.log(`[!] Row is already in tampered state: category="${targetRow.category}".`);
      } else {
        await RosterRow.updateOne(
          { _id: targetRow._id },
          { $set: { category: tamperedCategory, tamperBackup: originalCategory } }
        );
        console.log(`[+] DIRECT DB MUTATION APPLIED (Simulating unauthorized modification to sealed category):`);
        console.log(`    Original Category: "${originalCategory}"`);
        console.log(`    Tampered Category: "${tamperedCategory}"\n`);
      }

      console.log(`[*] Executing Cryptographic Seal Verification (verifyRosterSeal)...`);
      const verificationResult = await verifyRosterSeal(version._id, {
        role: 'AUDITOR',
        email: 'auditor@example.test'
      });

      console.log(`\n--- VERIFICATION OUTCOME AFTER TAMPERING ---`);
      console.log(`Result:              ${verificationResult.result} (Expected: FAIL)`);
      console.log(`Expected Merkle Root: ${verificationResult.expectedRoot}`);
      console.log(`Recomputed Root:     ${verificationResult.recomputedRoot}`);
      console.log(`Mismatched Row Keys: ${JSON.stringify(verificationResult.mismatchedRowKeys)}`);
      console.log(`Explanation:         ${verificationResult.explanation || 'Merkle root mismatch detected.'}`);
      console.log(`-------------------------------------------\n`);

      if (verificationResult.result === 'FAIL') {
        console.log(`[SUCCESS] Tampering was IMMEDIATELY detected by cryptographic verification!`);
        console.log(`To restore the record to its sealed state, run:`);
        console.log(`   npm.cmd run demo:restore\n`);
      } else {
        console.error(`[FAILURE] Verification unexpectedly passed despite row modification!`);
      }

      return { mode, result: verificationResult.result };
    } else if (mode === '--restore') {
      const freshRow = await RosterRow.findById(targetRow._id);
      const originalCategory = freshRow.tamperBackup || 'GENERAL';

      await RosterRow.updateOne(
        { _id: targetRow._id },
        { $set: { category: originalCategory }, $unset: { tamperBackup: 1 } }
      );
      console.log(`[+] RESTORATION APPLIED:`);
      console.log(`    Restored Category: "${originalCategory}"\n`);

      console.log(`[*] Executing Cryptographic Seal Verification (verifyRosterSeal)...`);
      const verificationResult = await verifyRosterSeal(version._id, {
        role: 'AUDITOR',
        email: 'auditor@example.test'
      });

      console.log(`\n--- VERIFICATION OUTCOME AFTER RESTORATION ---`);
      console.log(`Result:              ${verificationResult.result} (Expected: PASS)`);
      console.log(`Expected Merkle Root: ${verificationResult.expectedRoot}`);
      console.log(`Recomputed Root:     ${verificationResult.recomputedRoot}`);
      console.log(`Signature Valid:     ${verificationResult.signatureValid}`);
      console.log(`Chain Valid:         ${verificationResult.chainValid}`);
      console.log(`---------------------------------------------\n`);

      if (verificationResult.result === 'PASS') {
        console.log(`[SUCCESS] Integrity seal verification PASSED! Dataset is clean and valid.\n`);
      } else {
        console.error(`[FAILURE] Verification failed after restoration.`);
      }

      return { mode, result: verificationResult.result };
    } else {
      // Status check
      const verificationResult = await verifyRosterSeal(version._id);
      console.log(`Current Verification Result: ${verificationResult.result}`);
      return { mode: '--status', result: verificationResult.result };
    }
  } finally {
    await disconnectDB();
  }
}

if (require.main === module) {
  const arg = process.argv[2] || '--status';
  runTamperTool(arg)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Tamper Tool Error]', err.message);
      process.exit(1);
    });
}

module.exports = { runTamperTool };
