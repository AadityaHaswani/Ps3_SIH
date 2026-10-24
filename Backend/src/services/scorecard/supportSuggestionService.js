/**
 * Support Suggestion Service.
 * Generates transparent, rule-based support suggestions citing triggering metrics and thresholds.
 * Strictly framed as positive assistance opportunities (training, workflows, refresher) rather than punitive warnings.
 */

/**
 * Evaluates calculated metrics against rule conditions to generate targeted support recommendations.
 * @param {Object} metrics - Calculated M1, M2, M3, M4 metrics
 * @param {Object} config - Scoring configuration
 * @returns {Array<Object>} List of support recommendations
 */
function generateSupportSuggestions(metrics, config) {
  const suggestions = [];

  // 1. M1: Check for prominent missing fields
  if (metrics.m1Completeness && metrics.m1Completeness.missingFieldsCount) {
    const missingEntries = Object.entries(metrics.m1Completeness.missingFieldsCount)
      .filter(([_, count]) => count > 0)
      .sort((a, b) => b[1] - a[1]);

    if (missingEntries.length > 0) {
      const [topField, topCount] = missingEntries[0];
      suggestions.push({
        id: `SUGG-M1-${topField.toUpperCase()}`,
        title: `Targeted Data-Entry Refresher for ${formatFieldName(topField)}`,
        recommendedAction: `Organize a staff refresher on collecting and verifying ${formatFieldName(topField)} during initial admission intake to eliminate missing entries.`,
        triggerMetric: 'M1_COMPLETENESS',
        triggerValue: `${topCount} missing records (${metrics.m1Completeness.completenessPct || 0}% overall completeness)`,
        ruleExplanation: `Required field '${topField}' has ${topCount} empty instances in the current reporting period.`,
        suggestedWorkflow: 'Admissions Data Collection & Verification Protocol',
        evidenceRef: 'RosterRow.validationStatus'
      });
    }
  }

  // 2. M2: Check for aged open discrepancies (>30 days)
  if (metrics.m2Discrepancies && metrics.m2Discrepancies.ageingBuckets) {
    const aged31Plus = metrics.m2Discrepancies.ageingBuckets['31_plus_days'] || 0;
    const aged8to30 = metrics.m2Discrepancies.ageingBuckets['8_to_30_days'] || 0;

    if (aged31Plus > 0) {
      suggestions.push({
        id: 'SUGG-M2-AGED-DISCREPANCIES',
        title: 'Priority Case Review for Ageing Reconciliation Findings',
        recommendedAction:
          'Convene an inter-departmental reconciliation review session to investigate and resolve discrepancies pending for more than 30 days.',
        triggerMetric: 'M2_DISCREPANCIES',
        triggerValue: `${aged31Plus} findings aged >30 days`,
        ruleExplanation: `There are ${aged31Plus} open reconciliation findings exceeding the 30-day ageing threshold.`,
        suggestedWorkflow: 'Reconciliation Finding Review Queue',
        evidenceRef: 'ReconciliationFinding.createdAt'
      });
    } else if (aged8to30 > 5) {
      suggestions.push({
        id: 'SUGG-M2-QUEUE-FOLLOWUP',
        title: 'Active Discrepancy Queue Follow-up',
        recommendedAction:
          'Review newly identified discrepancies with the state admissions authority before the 30-day mark.',
        triggerMetric: 'M2_DISCREPANCIES',
        triggerValue: `${aged8to30} findings aged 8-30 days`,
        ruleExplanation: `${aged8to30} findings have remained open between 8 and 30 days.`,
        suggestedWorkflow: 'Three-Way Match Verification Workflow',
        evidenceRef: 'ReconciliationFinding.reviewStatus'
      });
    }
  }

  // 3. M3: Check for reporting delays (timeliness)
  if (
    metrics.m3Timeliness &&
    metrics.m3Timeliness.status === 'AVAILABLE' &&
    metrics.m3Timeliness.medianLagDays !== null
  ) {
    const medianLag = metrics.m3Timeliness.medianLagDays;
    const onTimeWindow =
      (config && config.parameters && config.parameters.m3 && config.parameters.m3.onTimeWindowDays) || 15;

    if (medianLag > onTimeWindow) {
      suggestions.push({
        id: 'SUGG-M3-TIMELINESS-SCHEDULE',
        title: 'Reporting Calendar & Milestone Synchronization',
        recommendedAction:
          'Establish a scheduled weekly batch submission schedule during peak admission rounds to align reporting timestamps with effective dates.',
        triggerMetric: 'M3_TIMELINESS',
        triggerValue: `Median delay of ${medianLag} days (target: <=${onTimeWindow} days)`,
        ruleExplanation: `Observed median reporting lag of ${medianLag} days exceeds the recommended ${onTimeWindow}-day upload window.`,
        suggestedWorkflow: 'Scheduled Admissions Batch Upload Schedule',
        evidenceRef: 'RosterUpload.createdAt vs RosterRow.admissionDate'
      });
    }
  }

  // 4. M4: Check for high repeat correction rates
  if (
    metrics.m4Corrections &&
    metrics.m4Corrections.status === 'AVAILABLE' &&
    metrics.m4Corrections.repeatCorrectionRate !== null
  ) {
    const repeatRate = metrics.m4Corrections.repeatCorrectionRate;
    const threshold =
      (config &&
        config.parameters &&
        config.parameters.m4 &&
        config.parameters.m4.repeatCorrectionThresholdPct) ||
      15;

    if (repeatRate > threshold) {
      suggestions.push({
        id: 'SUGG-M4-REPEAT-CORRECTIONS',
        title: 'Pre-Submission Validation & Intake Guidelines Review',
        recommendedAction:
          'Review input field validation rules and student document guidelines to help operators submit accurate values on first attempt.',
        triggerMetric: 'M4_CORRECTIONS',
        triggerValue: `${repeatRate}% repeat correction rate`,
        ruleExplanation: `Repeat corrections on the same record or field (${repeatRate}%) exceed the ${threshold}% monitoring threshold.`,
        suggestedWorkflow: 'Pre-Commit Data Verification Checklist',
        evidenceRef: 'DataCorrectionEvent.isRepeatCorrection'
      });
    }
  }

  // Fallback support note if all metrics are strong
  if (suggestions.length === 0) {
    suggestions.push({
      id: 'SUGG-GENERAL-MAINTENANCE',
      title: 'Maintain Current High-Fidelity Data Practices',
      recommendedAction:
        'Continue periodic roster verification and maintain alignment between student management registers and national identifiers.',
      triggerMetric: 'GENERAL_MAINTENANCE',
      triggerValue: 'High data fidelity across evaluated metrics',
      ruleExplanation: 'All evaluated metrics meet or exceed prototype operating benchmarks.',
      suggestedWorkflow: 'Routine Term Auditing Cycle',
      evidenceRef: 'System-wide reliability synthesis'
    });
  }

  return suggestions;
}

function formatFieldName(fieldName) {
  if (!fieldName) return 'Field';
  const mapping = {
    applicationNo: 'Application Number',
    apaarToken: 'APAAR / Student ID',
    name: 'Student Name',
    dob: 'Date of Birth',
    gender: 'Gender',
    category: 'Reservation Category',
    programmeCode: 'Programme Code',
    academicYear: 'Academic Year',
    admissionDate: 'Admission Date'
  };
  return mapping[fieldName] || fieldName;
}

module.exports = {
  generateSupportSuggestions,
  formatFieldName
};
