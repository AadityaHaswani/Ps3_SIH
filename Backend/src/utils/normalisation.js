/**
 * Data normalisation and matching key derivation utilities.
 * Ensures consistent string representations for robust multi-way comparison.
 */

/**
 * Normalises a person name for comparison.
 * Converts to uppercase, strips diacritics/punctuation, collapses internal spaces.
 * @param {string} name 
 * @returns {string}
 */
function normaliseName(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ') // Strip punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalises date of birth into standard ISO YYYY-MM-DD format.
 * Supports DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD.
 * @param {string|Date} dateVal 
 * @returns {string|null} ISO YYYY-MM-DD or null if unparseable
 */
function normaliseDate(dateVal) {
  if (!dateVal) return null;
  if (dateVal instanceof Date && !isNaN(dateVal)) {
    return dateVal.toISOString().split('T')[0];
  }

  const str = String(dateVal).trim();
  // YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return null;
}

/**
 * Normalises academic year string (e.g. "2025-2026" -> "2025-26", "2025-26" -> "2025-26")
 * @param {string} yearStr 
 * @returns {string}
 */
function normaliseAcademicYear(yearStr) {
  if (!yearStr) return '';
  const clean = String(yearStr).trim();
  const matchFull = clean.match(/^(\d{4})-(\d{4})$/);
  if (matchFull) {
    return `${matchFull[1]}-${matchFull[2].slice(-2)}`;
  }
  return clean;
}

/**
 * Normalises programme code (e.g. "  cse  " -> "CSE")
 * @param {string} code 
 * @returns {string}
 */
function normaliseProgrammeCode(code) {
  if (!code || typeof code !== 'string') return '';
  return code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
}

/**
 * Normalises student category (e.g. "general" -> "GENERAL", "obc-ncl" -> "OBC")
 * @param {string} category 
 * @returns {string}
 */
function normaliseCategory(category) {
  if (!category || typeof category !== 'string') return 'GENERAL';
  const upper = category.trim().toUpperCase();
  if (upper.includes('OBC')) return 'OBC';
  if (upper.includes('SC')) return 'SC';
  if (upper.includes('ST')) return 'ST';
  if (upper.includes('EWS')) return 'EWS';
  return upper || 'GENERAL';
}

/**
 * Computes deterministic candidate keys for matching precedence.
 * @param {object} record - record fields
 * @returns {object} { k1: string|null, k2: string|null, k3: string|null }
 */
function deriveMatchingKeys(record) {
  const apaarToken = record.apaarToken || null;
  const appNo = record.applicationNo ? String(record.applicationNo).trim().toUpperCase() : null;
  const prog = normaliseProgrammeCode(record.programmeCode);
  const year = normaliseAcademicYear(record.academicYear);
  const normName = normaliseName(record.name || record.candidateName);
  const dob = normaliseDate(record.dob);

  // K1: Strongest (keyed HMAC token)
  const k1 = apaarToken || null;

  // K2: Strong (scoped application reference + programme + academicYear)
  const k2 = (appNo && prog && year) ? `${appNo}__${prog}__${year}` : null;

  // K3: Weak candidate key (normalised name + DOB + programme) - requires human review
  const k3 = (normName && dob && prog) ? `${normName}__${dob}__${prog}` : null;

  return { k1, k2, k3 };
}

/**
 * Defends against CSV Formula Injection (CWE-1236)
 * Prefix formula triggers (=, +, -, @, \t, \r) with a single quote.
 * @param {string} val 
 * @returns {string}
 */
function sanitizeCsvValue(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

module.exports = {
  normaliseName,
  normaliseDate,
  normaliseAcademicYear,
  normaliseProgrammeCode,
  normaliseCategory,
  deriveMatchingKeys,
  sanitizeCsvValue
};
