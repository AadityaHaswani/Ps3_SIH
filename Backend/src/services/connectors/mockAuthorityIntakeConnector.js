/**
 * Mock Authority Approved Intake Connector.
 * Simulates regulatory portal verification (e.g. AICTE Approval Process portal).
 * STRICT INTEGRITY RULE: Always runs in mode = 'SIMULATED'.
 * Results yield AUTHORITY_VERIFIED_SIMULATED, never genuine live AUTHORITY_VERIFIED.
 */
const Programme = require('../../models/programme.model');
const SeatBalance = require('../../models/seatBalance.model');

class MockAuthorityIntakeConnector {
  constructor() {
    this.id = 'mock-authority-intake';
    this.name = 'AICTE / Authority Regulatory Intake Registry (Simulated)';
    this.mode = 'SIMULATED';
    this.version = 'v2024.1-SIM';
    this.supportedSubjectTypes = ['PROGRAMME_INTAKE', 'SEAT_BALANCE'];
  }

  async checkHealth() {
    return {
      connectorId: this.id,
      name: this.name,
      mode: this.mode,
      status: 'HEALTHY',
      latencyMs: 14,
      lastCheckedAt: new Date(),
      isSimulated: true
    };
  }

  /**
   * Verifies an intake figure against simulated regulatory records.
   * @param {Object} params
   * @param {string} params.subjectType
   * @param {string} params.subjectId - bucketKey or programmeCode
   * @param {string} params.fieldPath - e.g. 'approvedIntake'
   * @param {*} params.value - intake number to verify
   * @param {string} params.institutionId
   * @param {Object} [params.context] - optional expected values or mock registry overrides
   */
  async verify({ subjectType, subjectId, fieldPath, value, institutionId, context = {} }) {
    const intakeNum = parseInt(value, 10);
    if (isNaN(intakeNum)) {
      return {
        status: 'UNABLE_TO_VERIFY',
        label: 'UNABLE_TO_VERIFY',
        sourceMode: this.mode,
        method: 'CONNECTOR_API',
        sourceRef: 'SIMULATED_AICTE_REGISTRY',
        ruleOrSourceVersion: this.version,
        valueSnapshot: value,
        notes: 'Invalid intake value specified for verification.',
        isSimulated: true
      };
    }

    // Determine target authority registered figure
    let authorityTargetIntake = null;
    let sourceOrderRef = 'AICTE-EOA-2024-SIMULATED-01';

    if (context.expectedIntake !== undefined) {
      authorityTargetIntake = parseInt(context.expectedIntake, 10);
    } else if (context.mockMatch) {
      authorityTargetIntake = intakeNum;
    } else {
      // Look up Programme in database
      const prog = await Programme.findOne({
        institutionId,
        $or: [{ code: subjectId.toUpperCase() }, { _id: subjectId.match(/^[0-9a-fA-F]{24}$/) ? subjectId : null }]
      }).lean();

      if (prog && prog.intakeByYear && prog.intakeByYear.length > 0) {
        const matchingYear = context.academicYear
          ? prog.intakeByYear.find((iy) => iy.academicYear === context.academicYear)
          : prog.intakeByYear[0];
        if (matchingYear) {
          authorityTargetIntake = matchingYear.approvedIntake;
          sourceOrderRef = matchingYear.sourceRef || sourceOrderRef;
        }
      } else {
        // Look up SeatBalance
        const balance = await SeatBalance.findOne({
          $or: [{ bucketKey: subjectId }, { institutionId, programmeCode: subjectId.toUpperCase() }]
        }).lean();

        if (balance && balance.approvedIntake !== null) {
          authorityTargetIntake = balance.approvedIntake;
          sourceOrderRef = balance.intakeSourceRef || sourceOrderRef;
        }
      }
    }

    // If no record exists at all in simulated registry
    if (authorityTargetIntake === null && !context.mockMatch) {
      return {
        status: 'UNABLE_TO_VERIFY',
        label: 'UNABLE_TO_VERIFY',
        sourceMode: this.mode,
        method: 'CONNECTOR_API',
        sourceRef: 'SIMULATED_AICTE_REGISTRY',
        ruleOrSourceVersion: this.version,
        valueSnapshot: intakeNum,
        notes: 'No authority approval quota found for the requested programme.',
        isSimulated: true
      };
    }

    // Check match vs conflict
    const target = context.mockMatch ? intakeNum : authorityTargetIntake;

    if (intakeNum === target) {
      return {
        status: 'COMPLETED',
        label: 'AUTHORITY_VERIFIED_SIMULATED',
        sourceMode: this.mode,
        method: 'CONNECTOR_API',
        sourceRef: sourceOrderRef,
        ruleOrSourceVersion: this.version,
        evidenceRef: `REG-APPROVAL-${target}-SEATS`,
        valueSnapshot: intakeNum,
        notes: `Simulated regulatory registry confirms intake quota of ${target} seats.`,
        isSimulated: true
      };
    }

    // Value conflicts with authority registered figure
    return {
      status: 'CONFLICT',
      label: 'VERIFICATION_PENDING',
      sourceMode: this.mode,
      method: 'CONNECTOR_API',
      sourceRef: sourceOrderRef,
      ruleOrSourceVersion: this.version,
      evidenceRef: null,
      valueSnapshot: intakeNum,
      notes: `Declared intake ${intakeNum} conflicts with simulated authority quota of ${target} seats.`,
      isSimulated: true,
      hasConflict: true
    };
  }
}

module.exports = MockAuthorityIntakeConnector;
