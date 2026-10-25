/**
 * Admission Register Connector.
 * Queries independent State / Central Admission & Allotment registers.
 * Connects to simulated external register records created in Feature 1.
 * Mode: SIMULATED.
 */
const ExternalRegisterRecord = require('../../models/externalRegisterRecord.model');

class AdmissionRegisterConnector {
  constructor() {
    this.id = 'admission-register-connector';
    this.name = 'State Allotment & Admission Register (Simulated)';
    this.mode = 'SIMULATED';
    this.version = 'v2024.1-SIM';
    this.supportedSubjectTypes = ['ROSTER_RECORD', 'STUDENT_LIFECYCLE', 'PROGRAMME_INTAKE'];
  }

  async checkHealth() {
    return {
      connectorId: this.id,
      name: this.name,
      mode: this.mode,
      status: 'HEALTHY',
      latencyMs: 18,
      lastCheckedAt: new Date(),
      isSimulated: true
    };
  }

  async verify({ subjectType, subjectId, fieldPath, value, institutionId, context = {} }) {
    const query = { sourceType: 'ADMISSION' };
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
        sourceRef: 'SIMULATED_ADMISSION_REGISTER',
        ruleOrSourceVersion: this.version,
        valueSnapshot: value,
        notes: 'No corresponding admission/allotment record discovered in external register.',
        isSimulated: true
      };
    }

    // Weak/candidate match check - if weakMatch flag is present, require review rather than auto-confirming
    if (context.isWeakMatch) {
      return {
        status: 'PENDING',
        label: 'VERIFICATION_PENDING',
        sourceMode: this.mode,
        method: 'CROSS_REGISTER',
        sourceRef: extRecord.sourceIdentifier || 'ADMISSION_REGISTER',
        ruleOrSourceVersion: this.version,
        valueSnapshot: value,
        notes: 'Ambiguous or weak candidate match detected; requires manual officer review before confirmation.',
        isSimulated: true
      };
    }

    // Check conflict if a specific value comparison was requested
    if (value && context.field && extRecord[context.field] && String(extRecord[context.field]) !== String(value)) {
      return {
        status: 'CONFLICT',
        label: 'VERIFICATION_PENDING',
        sourceMode: this.mode,
        method: 'CROSS_REGISTER',
        sourceRef: extRecord.sourceIdentifier || 'ADMISSION_REGISTER',
        ruleOrSourceVersion: this.version,
        valueSnapshot: value,
        notes: `Value ${value} conflicts with register record value ${extRecord[context.field]}.`,
        isSimulated: true,
        hasConflict: true
      };
    }

    return {
      status: 'COMPLETED',
      label: 'CROSS_REGISTER_CONFIRMED',
      sourceMode: this.mode,
      method: 'CROSS_REGISTER',
      sourceRef: extRecord.sourceIdentifier || `ALLOTMENT-${extRecord.applicationNo || 'REF'}`,
      ruleOrSourceVersion: this.version,
      evidenceRef: `ALLOTMENT-CONFIRMATION-${extRecord._id}`,
      valueSnapshot: value || extRecord.status || 'CONFIRMED',
      notes: 'Record verified against independent state admission register.',
      isSimulated: true
    };
  }
}

module.exports = AdmissionRegisterConnector;
