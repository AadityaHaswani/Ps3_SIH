/**
 * Examination Board Connector.
 * Queries independent Exam Board / University Examination registers.
 * Connects to simulated external register records from Feature 1.
 * Mode: SIMULATED.
 */
const ExternalRegisterRecord = require('../../models/externalRegisterRecord.model');

class ExamBoardConnector {
  constructor() {
    this.id = 'exam-board-connector';
    this.name = 'University & State Examination Board Register (Simulated)';
    this.mode = 'SIMULATED';
    this.version = 'v2024.1-SIM';
    this.supportedSubjectTypes = ['ROSTER_RECORD', 'STUDENT_LIFECYCLE'];
  }

  async checkHealth() {
    return {
      connectorId: this.id,
      name: this.name,
      mode: this.mode,
      status: 'HEALTHY',
      latencyMs: 22,
      lastCheckedAt: new Date(),
      isSimulated: true
    };
  }

  async verify({ subjectType, subjectId, fieldPath, value, institutionId, context = {} }) {
    const query = { sourceType: 'EXAM' };
    if (institutionId) query.institutionId = institutionId;

    if (context.applicationNo) {
      query.applicationNo = context.applicationNo;
    } else if (context.apaarToken) {
      query.apaarToken = context.apaarToken;
    } else if (subjectId && subjectId.length < 30) {
      query.$or = [{ applicationNo: subjectId }, { apaarToken: subjectId }];
    }

    const extRecord = context.extRecord || (await ExternalRegisterRecord.findOne(query).lean());

    if (!extRecord) {
      return {
        status: 'UNABLE_TO_VERIFY',
        label: 'UNABLE_TO_VERIFY',
        sourceMode: this.mode,
        method: 'CROSS_REGISTER',
        sourceRef: 'SIMULATED_EXAM_REGISTER',
        ruleOrSourceVersion: this.version,
        valueSnapshot: value,
        notes: 'No matching examination register entry located for student.',
        isSimulated: true
      };
    }

    if (context.isWeakMatch) {
      return {
        status: 'PENDING',
        label: 'VERIFICATION_PENDING',
        sourceMode: this.mode,
        method: 'CROSS_REGISTER',
        sourceRef: extRecord.sourceIdentifier || 'EXAM_REGISTER',
        ruleOrSourceVersion: this.version,
        valueSnapshot: value,
        notes: 'Weak candidate match in exam registry; requires human reconciliation.',
        isSimulated: true
      };
    }

    return {
      status: 'COMPLETED',
      label: 'CROSS_REGISTER_CONFIRMED',
      sourceMode: this.mode,
      method: 'CROSS_REGISTER',
      sourceRef: extRecord.sourceIdentifier || `EXAM-${extRecord.applicationNo || 'REF'}`,
      ruleOrSourceVersion: this.version,
      evidenceRef: `EXAM-CONFIRMATION-${extRecord._id}`,
      valueSnapshot: value || extRecord.status || 'CONFIRMED',
      notes: 'Student record confirmed against university examination register.',
      isSimulated: true
    };
  }
}

module.exports = ExamBoardConnector;
