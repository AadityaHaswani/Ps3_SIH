/**
 * Roster Service.
 * Manages streaming CSV ingestion, row-level validation, preview generation,
 * and immutable roster version commitment.
 */
const { parse } = require('csv-parse/sync');
const RosterUpload = require('../models/rosterUpload.model');
const RosterVersion = require('../models/rosterVersion.model');
const RosterRow = require('../models/rosterRow.model');
const { generateApaarToken, maskIdentifier, maskName, computeFileHash } = require('../utils/cryptoToken');
const {
  normaliseName,
  normaliseDate,
  normaliseAcademicYear,
  normaliseProgrammeCode,
  normaliseCategory
} = require('../utils/normalisation');

/**
 * Standardize and clean incoming CSV headers
 * @param {string[]} headers 
 * @returns {object} header mapping
 */
function mapHeaderKeys(headers) {
  const map = {};
  headers.forEach((h, idx) => {
    const clean = h.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (['applicationno', 'applicationid', 'appno', 'rollno', 'applno'].includes(clean)) {
      map.applicationNo = idx;
    } else if (['name', 'studentname', 'candidatename'].includes(clean)) {
      map.name = idx;
    } else if (['dob', 'dateofbirth', 'birthdate'].includes(clean)) {
      map.dob = idx;
    } else if (['gender', 'sex'].includes(clean)) {
      map.gender = idx;
    } else if (['category', 'caste', 'seatcategory'].includes(clean)) {
      map.category = idx;
    } else if (['programmecode', 'programme', 'program', 'branch', 'course'].includes(clean)) {
      map.programmeCode = idx;
    } else if (['academicyear', 'year', 'session', 'batch'].includes(clean)) {
      map.academicYear = idx;
    } else if (['admissionquota', 'quota'].includes(clean)) {
      map.admissionQuota = idx;
    } else if (['admissiondate', 'admitdate'].includes(clean)) {
      map.admissionDate = idx;
    } else if (['apaarid', 'apaarno', 'apaar'].includes(clean)) {
      map.apaarId = idx;
    }
  });
  return map;
}

/**
 * Parses CSV buffer and validates row contents
 * @param {Buffer} buffer 
 * @param {object} defaultMeta 
 * @returns {object}
 */
function parseAndValidateCsv(buffer, defaultMeta = {}) {
  const records = parse(buffer, {
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true
  });

  if (!records || records.length < 2) {
    throw new Error('CSV file is empty or missing data rows.');
  }

  const rawHeaders = records[0];
  const headerMap = mapHeaderKeys(rawHeaders);

  // Mandatory headers check
  const requiredFields = ['applicationNo', 'name', 'dob', 'programmeCode'];
  const missingHeaders = requiredFields.filter((rf) => headerMap[rf] === undefined);

  if (missingHeaders.length > 0) {
    throw new Error(`CSV missing mandatory headers: ${missingHeaders.join(', ')}`);
  }

  const parsedRows = [];
  const rowErrors = [];

  for (let i = 1; i < records.length; i++) {
    const row = records[i];
    const rowNumber = i + 1;
    const issues = [];

    const rawAppNo = headerMap.applicationNo !== undefined ? row[headerMap.applicationNo] : '';
    const rawName = headerMap.name !== undefined ? row[headerMap.name] : '';
    const rawDob = headerMap.dob !== undefined ? row[headerMap.dob] : '';
    const rawProg = headerMap.programmeCode !== undefined ? row[headerMap.programmeCode] : (defaultMeta.programmeCode || '');
    const rawYear = headerMap.academicYear !== undefined ? row[headerMap.academicYear] : (defaultMeta.academicYear || '');
    const rawGender = headerMap.gender !== undefined ? row[headerMap.gender] : 'OTHER';
    const rawCategory = headerMap.category !== undefined ? row[headerMap.category] : 'GENERAL';
    const rawQuota = headerMap.admissionQuota !== undefined ? row[headerMap.admissionQuota] : 'STATE_MERIT';
    const rawAdmDate = headerMap.admissionDate !== undefined ? row[headerMap.admissionDate] : '';
    const rawApaar = headerMap.apaarId !== undefined ? row[headerMap.apaarId] : null;

    if (!rawAppNo || !rawAppNo.trim()) {
      issues.push({ field: 'applicationNo', issue: 'Application number is required.' });
    }

    if (!rawName || !rawName.trim()) {
      issues.push({ field: 'name', issue: 'Student name is required.' });
    }

    const normDob = normaliseDate(rawDob);
    if (!normDob) {
      issues.push({ field: 'dob', issue: 'Invalid or missing Date of Birth. Expected YYYY-MM-DD or DD/MM/YYYY.' });
    }

    const normProg = normaliseProgrammeCode(rawProg);
    if (!normProg) {
      issues.push({ field: 'programmeCode', issue: 'Programme code is required.' });
    }

    const normYear = normaliseAcademicYear(rawYear);
    if (!normYear) {
      issues.push({ field: 'academicYear', issue: 'Academic year is required.' });
    }

    let apaarToken = null;
    let apaarLast4 = null;
    if (rawApaar) {
      const cleanApaar = String(rawApaar).replace(/[\s-]/g, '').trim();
      if (cleanApaar.length >= 4) {
        apaarToken = generateApaarToken(cleanApaar);
        apaarLast4 = cleanApaar.slice(-4);
      }
    }

    const rowItem = {
      rowKey: `row_${rowNumber}`,
      applicationNo: String(rawAppNo).trim(),
      apaarToken,
      apaarLast4,
      name: String(rawName).trim(),
      normalisedName: normaliseName(rawName),
      dob: normDob || '1970-01-01',
      gender: ['MALE', 'FEMALE', 'OTHER'].includes(String(rawGender).trim().toUpperCase())
        ? String(rawGender).trim().toUpperCase()
        : 'OTHER',
      category: normaliseCategory(rawCategory),
      programmeCode: normProg || 'UNKNOWN',
      academicYear: normYear || '2025-26',
      admissionQuota: String(rawQuota).trim().toUpperCase() || 'STATE_MERIT',
      admissionDate: normaliseDate(rawAdmDate) || null,
      validationStatus: issues.length === 0 ? 'VALID' : 'INVALID',
      validationErrors: issues
    };

    if (issues.length > 0) {
      rowErrors.push({
        rowNumber,
        applicationNo: rawAppNo || 'UNKNOWN',
        issues
      });
    }

    parsedRows.push(rowItem);
  }

  return {
    parsedRows,
    rowErrors,
    totalRows: parsedRows.length,
    validRows: parsedRows.filter((r) => r.validationStatus === 'VALID').length,
    invalidRows: rowErrors.length
  };
}

/**
 * Creates a new Roster Upload with parsed staging rows
 */
async function processRosterUpload({ institutionId, academicYear, programmeCode, file, user }) {
  const fileSha256 = computeFileHash(file.buffer);

  const { parsedRows, rowErrors, totalRows, invalidRows } = parseAndValidateCsv(file.buffer, {
    academicYear,
    programmeCode
  });

  const uploadStatus = invalidRows === 0 ? 'VALIDATED' : 'VALIDATED'; // Allows previewing even with errors

  const rosterUpload = await RosterUpload.create({
    institutionId,
    academicYear: normaliseAcademicYear(academicYear),
    programmeCode: programmeCode ? normaliseProgrammeCode(programmeCode) : null,
    sourceMode: 'INSTITUTION_REPORTED',
    filename: file.originalname || 'roster.csv',
    fileSha256,
    rowCount: totalRows,
    status: uploadStatus,
    validation: {
      errors: invalidRows,
      warnings: 0,
      ruleVersion: 'roster-val@1',
      rowErrors
    },
    uploadedBy: {
      userId: user ? user.id : 'system',
      role: user ? user.role : 'INSTITUTION_ADMIN',
      email: user ? user.email : 'admin@institution.edu'
    }
  });

  // Bulk insert staging rows with upload ID
  const rowsToInsert = parsedRows.map((r) => ({
    ...r,
    rosterUploadId: rosterUpload._id
  }));

  await RosterRow.insertMany(rowsToInsert);

  return rosterUpload;
}

/**
 * Retrieves preview of uploaded roster with masked identifiers for review
 */
async function getRosterPreview(uploadId, { page = 1, limit = 25 }) {
  const upload = await RosterUpload.findById(uploadId);
  if (!upload) {
    throw new Error('Roster upload not found.');
  }

  const p = Math.max(1, parseInt(page, 10));
  const l = Math.min(100, Math.max(1, parseInt(limit, 10)));
  const skip = (p - 1) * l;

  const total = await RosterRow.countDocuments({ rosterUploadId: uploadId });
  const rows = await RosterRow.find({ rosterUploadId: uploadId })
    .sort({ createdAt: 1 })
    .skip(skip)
    .limit(l)
    .lean();

  const maskedRows = rows.map((r) => ({
    id: r._id,
    rowKey: r.rowKey,
    applicationNoMasked: maskIdentifier(r.applicationNo),
    apaarTokenMasked: r.apaarToken ? maskIdentifier(r.apaarToken, 6) : null,
    apaarLast4: r.apaarLast4,
    studentNameMasked: maskName(r.name),
    dob: r.dob,
    gender: r.gender,
    category: r.category,
    programmeCode: r.programmeCode,
    academicYear: r.academicYear,
    admissionQuota: r.admissionQuota,
    admissionDate: r.admissionDate,
    validationStatus: r.validationStatus,
    validationErrors: r.validationErrors
  }));

  return {
    upload: {
      id: upload._id,
      institutionId: upload.institutionId,
      academicYear: upload.academicYear,
      filename: upload.filename,
      status: upload.status,
      fileSha256: upload.fileSha256,
      rowCount: upload.rowCount,
      validation: upload.validation,
      committedVersionId: upload.committedVersionId,
      createdAt: upload.createdAt
    },
    rows: maskedRows,
    pagination: {
      page: p,
      limit: l,
      total,
      totalPages: Math.ceil(total / l)
    }
  };
}

/**
 * Commits a validated roster into an immutable RosterVersion
 */
async function commitRosterVersion(uploadId, user) {
  const upload = await RosterUpload.findById(uploadId);
  if (!upload) {
    throw new Error('Roster upload not found.');
  }

  if (upload.status === 'COMMITTED') {
    throw new Error('This roster upload has already been committed.');
  }

  if (upload.validation.errors > 0) {
    throw new Error(`Cannot commit roster with ${upload.validation.errors} validation errors. Fix errors and re-upload.`);
  }

  // Find latest version for institution + academicYear
  const latestVersion = await RosterVersion.findOne({
    institutionId: upload.institutionId,
    academicYear: upload.academicYear
  }).sort({ versionNumber: -1 });

  const nextVersionNumber = latestVersion ? latestVersion.versionNumber + 1 : 1;

  // Supersede previous version
  if (latestVersion) {
    latestVersion.status = 'SUPERSEDED';
    await latestVersion.save();
  }

  // Create committed immutable version
  const committedVersion = await RosterVersion.create({
    institutionId: upload.institutionId,
    academicYear: upload.academicYear,
    versionNumber: nextVersionNumber,
    status: 'COMMITTED',
    uploadId: upload._id,
    fileSha256: upload.fileSha256,
    rowCount: upload.rowCount,
    committedBy: {
      userId: user ? user.id : 'system',
      role: user ? user.role : 'INSTITUTION_ADMIN',
      email: user ? user.email : 'admin@institution.edu'
    },
    committedAt: new Date()
  });

  // Link version to rows and mark upload as committed
  await RosterRow.updateMany(
    { rosterUploadId: upload._id },
    { $set: { rosterVersionId: committedVersion._id } }
  );

  upload.status = 'COMMITTED';
  upload.committedVersionId = committedVersion._id;
  await upload.save();

  // Synchronize committed roster snapshot with Seat Ledger (Feature 2)
  const { syncRosterCommitToLedger } = require('./seatLedgerService');
  await syncRosterCommitToLedger(committedVersion, user);

  // Mark Scorecard snapshots stale for this institution and academic year (Feature 4)
  const scorecardService = require('./scorecardService');
  scorecardService.markSnapshotsStale(upload.institutionId, upload.academicYear, 'ROSTER_COMMITTED').catch(() => {});

  return committedVersion;
}

/**
 * Retrieves a roster upload or version by ID
 */
async function getRosterById(id) {
  const upload = await RosterUpload.findById(id).lean();
  if (upload) return upload;

  const version = await RosterVersion.findById(id).lean();
  if (version) return version;

  return null;
}

module.exports = {
  parseAndValidateCsv,
  processRosterUpload,
  getRosterPreview,
  commitRosterVersion,
  getRosterById
};
