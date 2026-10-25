/**
 * Version Diff Service.
 * Implements deterministic row-level comparison between committed roster versions.
 * Classifies changes as ADDED, REMOVED, MODIFIED, UNCHANGED, and UNKEYED.
 * Identifies affected programme/category/year buckets and masks personal identifiers.
 */
const RosterVersion = require('../models/rosterVersion.model');
const RosterRow = require('../models/rosterRow.model');
const { maskIdentifier, maskName } = require('../utils/cryptoToken');
const { buildBucketKey } = require('./seatLedgerService');

const TRACKED_FIELDS = [
  'programmeCode',
  'category',
  'gender',
  'dob',
  'admissionQuota',
  'admissionDate',
  'validationStatus'
];

/**
 * Safely masks field values in diffs according to privacy requirements.
 */
function maskDiffValue(field, value) {
  if (value === null || value === undefined || value === '') return null;
  const str = String(value);

  if (field === 'apaarToken') {
    return maskIdentifier(str, 6);
  }
  if (field === 'name') {
    return maskName(str);
  }
  if (field === 'applicationNo') {
    return maskIdentifier(str, 4);
  }
  return str;
}

/**
 * Derives a stable key for a roster row.
 */
function getRowKey(row) {
  if (row.rowKey && String(row.rowKey).trim().length > 0) {
    return String(row.rowKey).trim();
  }
  if (row.applicationNo && row.programmeCode) {
    return `${String(row.applicationNo).trim()}__${String(row.programmeCode).trim().toUpperCase()}`;
  }
  return null;
}

/**
 * Compares two committed roster versions.
 *
 * @param {Object} params
 * @param {string} params.currentVersionId
 * @param {string} [params.previousVersionId]
 * @param {number} [params.page=1]
 * @param {number} [params.limit=50]
 * @param {Object} [params.user]
 * @returns {Promise<Object>} Diff summary, affected buckets, and paginated row differences
 */
async function compareRosterVersions({
  currentVersionId,
  previousVersionId = null,
  page = 1,
  limit = 50,
  user = {}
}) {
  const currentVersion = await RosterVersion.findById(currentVersionId).lean();
  if (!currentVersion) {
    const err = new Error(`Current RosterVersion ${currentVersionId} not found.`);
    err.statusCode = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  // Institution scoping check
  if (['INSTITUTION_ADMIN', 'INSTITUTION_OPERATOR'].includes(user.role)) {
    if (user.institutionId && String(currentVersion.institutionId) !== String(user.institutionId)) {
      const err = new Error('Forbidden: Cannot compare roster versions of another institution.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }
  }

  // Resolve previous version: use explicitly requested or find predecessor
  let previousVersion = null;
  if (previousVersionId) {
    previousVersion = await RosterVersion.findById(previousVersionId).lean();
  } else if (currentVersion.versionNumber > 1) {
    previousVersion = await RosterVersion.findOne({
      institutionId: currentVersion.institutionId,
      academicYear: currentVersion.academicYear,
      versionNumber: currentVersion.versionNumber - 1
    }).lean();
  }

  // Fetch rows for current version and previous version (if exists)
  const [currRows, prevRows] = await Promise.all([
    RosterRow.find({ rosterVersionId: currentVersion._id }).lean(),
    previousVersion ? RosterRow.find({ rosterVersionId: previousVersion._id }).lean() : []
  ]);

  // Index previous rows by rowKey
  const prevMap = new Map();
  for (const row of prevRows) {
    const key = getRowKey(row);
    if (key) {
      prevMap.set(key, row);
    }
  }

  const currMap = new Map();
  const unkeyedRows = [];
  const affectedBucketsSet = new Set();
  const changes = [];

  // Analyze current rows against previous rows
  for (const row of currRows) {
    const key = getRowKey(row);
    const bucket = buildBucketKey(
      currentVersion.institutionId,
      row.programmeCode || 'UNKNOWN',
      currentVersion.academicYear,
      row.category || 'GENERAL'
    );

    if (!key) {
      unkeyedRows.push(row);
      affectedBucketsSet.add(bucket);
      changes.push({
        rowKey: 'UNKEYED',
        changeType: 'UNKEYED',
        applicationNoMasked: maskDiffValue('applicationNo', row.applicationNo),
        programmeCode: row.programmeCode,
        category: row.category,
        fieldDiffs: []
      });
      continue;
    }

    currMap.set(key, row);

    if (!prevMap.has(key)) {
      // ADDED ROW
      affectedBucketsSet.add(bucket);
      changes.push({
        rowKey: key,
        changeType: 'ADDED',
        applicationNoMasked: maskDiffValue('applicationNo', row.applicationNo),
        programmeCode: row.programmeCode,
        category: row.category,
        fieldDiffs: []
      });
    } else {
      // ROW PRESENT IN BOTH: Check field diffs
      const prevRow = prevMap.get(key);
      const fieldDiffs = [];

      for (const field of TRACKED_FIELDS) {
        const valBefore = prevRow[field] !== undefined ? String(prevRow[field]).trim() : '';
        const valAfter = row[field] !== undefined ? String(row[field]).trim() : '';

        if (valBefore !== valAfter) {
          fieldDiffs.push({
            field,
            before: maskDiffValue(field, valBefore),
            after: maskDiffValue(field, valAfter)
          });
        }
      }

      if (fieldDiffs.length > 0) {
        affectedBucketsSet.add(bucket);
        // Also add previous bucket if programmeCode or category changed
        const prevBucket = buildBucketKey(
          currentVersion.institutionId,
          prevRow.programmeCode || 'UNKNOWN',
          currentVersion.academicYear,
          prevRow.category || 'GENERAL'
        );
        affectedBucketsSet.add(prevBucket);

        changes.push({
          rowKey: key,
          changeType: 'MODIFIED',
          applicationNoMasked: maskDiffValue('applicationNo', row.applicationNo),
          programmeCode: row.programmeCode,
          category: row.category,
          fieldDiffs
        });
      } else {
        // UNCHANGED
        changes.push({
          rowKey: key,
          changeType: 'UNCHANGED',
          applicationNoMasked: maskDiffValue('applicationNo', row.applicationNo),
          programmeCode: row.programmeCode,
          category: row.category,
          fieldDiffs: []
        });
      }
    }
  }

  // Check for REMOVED rows (present in previous but absent in current)
  for (const prevRow of prevRows) {
    const key = getRowKey(prevRow);
    if (key && !currMap.has(key)) {
      const bucket = buildBucketKey(
        currentVersion.institutionId,
        prevRow.programmeCode || 'UNKNOWN',
        currentVersion.academicYear,
        prevRow.category || 'GENERAL'
      );
      affectedBucketsSet.add(bucket);

      changes.push({
        rowKey: key,
        changeType: 'REMOVED',
        applicationNoMasked: maskDiffValue('applicationNo', prevRow.applicationNo),
        programmeCode: prevRow.programmeCode,
        category: prevRow.category,
        fieldDiffs: []
      });
    }
  }

  // Summary counts
  const added = changes.filter((c) => c.changeType === 'ADDED').length;
  const removed = changes.filter((c) => c.changeType === 'REMOVED').length;
  const modified = changes.filter((c) => c.changeType === 'MODIFIED').length;
  const unchanged = changes.filter((c) => c.changeType === 'UNCHANGED').length;
  const unkeyed = unkeyedRows.length;
  const affectedBuckets = Array.from(affectedBucketsSet);

  // Bounded pagination for detailed changes list
  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
  const skip = (p - 1) * l;
  const paginatedChanges = changes.slice(skip, skip + l);

  return {
    currentVersion: {
      id: currentVersion._id,
      versionNumber: currentVersion.versionNumber,
      rowCount: currentVersion.rowCount,
      academicYear: currentVersion.academicYear,
      committedAt: currentVersion.committedAt
    },
    previousVersion: previousVersion
      ? {
          id: previousVersion._id,
          versionNumber: previousVersion.versionNumber,
          rowCount: previousVersion.rowCount,
          academicYear: previousVersion.academicYear,
          committedAt: previousVersion.committedAt
        }
      : null,
    summary: {
      totalCurrent: currRows.length,
      totalPrevious: prevRows.length,
      added,
      removed,
      modified,
      unchanged,
      unkeyed,
      affectedBucketsCount: affectedBuckets.length,
      affectedBuckets
    },
    changes: paginatedChanges,
    pagination: {
      page: p,
      limit: l,
      total: changes.length,
      totalPages: Math.ceil(changes.length / l)
    }
  };
}

module.exports = {
  compareRosterVersions,
  maskDiffValue,
  getRowKey
};
