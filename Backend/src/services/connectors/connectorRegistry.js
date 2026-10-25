/**
 * Controlled Connector Registry.
 * Manages trusted connector registrations, health polling, and execution boundaries.
 * CRITICAL INTEGRITY SAFEGUARD:
 * - Callers cannot supply or override trusted sourceMode.
 * - Simulated connectors always produce isSimulated: true and cannot yield genuine AUTHORITY_VERIFIED.
 * - Zero secrets, credentials, or API keys are exposed through health/status queries.
 */
const MockAuthorityIntakeConnector = require('./mockAuthorityIntakeConnector');
const AdmissionRegisterConnector = require('./admissionRegisterConnector');
const ExamBoardConnector = require('./examBoardConnector');
const FailingConnector = require('./failingConnector');

class ConnectorRegistry {
  constructor() {
    this.connectors = new Map();
    this.registerDefaults();
  }

  registerDefaults() {
    const mockAuthority = new MockAuthorityIntakeConnector();
    const admissionReg = new AdmissionRegisterConnector();
    const examBoard = new ExamBoardConnector();
    const failing = new FailingConnector();

    this.connectors.set(mockAuthority.id, mockAuthority);
    this.connectors.set(admissionReg.id, admissionReg);
    this.connectors.set(examBoard.id, examBoard);
    this.connectors.set(failing.id, failing);
  }

  getConnector(id) {
    if (!id || typeof id !== 'string') return null;
    return this.connectors.get(id.trim().toLowerCase()) || null;
  }

  listConnectors() {
    return Array.from(this.connectors.values()).map((c) => ({
      id: c.id,
      name: c.name,
      mode: c.mode,
      version: c.version,
      supportedSubjectTypes: c.supportedSubjectTypes,
      isSimulated: c.mode === 'SIMULATED'
    }));
  }

  /**
   * Health checks all registered connectors.
   * Strips all internal secrets, passwords, tokens, or credentials.
   */
  async listConnectorsStatus() {
    const statusPromises = Array.from(this.connectors.values()).map(async (connector) => {
      let timer;
      try {
        const timeoutPromise = new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('Health check timeout')), 3000);
        });

        const health = await Promise.race([connector.checkHealth(), timeoutPromise]);
        clearTimeout(timer);

        return {
          id: connector.id,
          name: connector.name,
          mode: connector.mode,
          status: health.status || 'UNKNOWN',
          latencyMs: health.latencyMs || 0,
          lastCheckedAt: health.lastCheckedAt || new Date(),
          supportedSubjectTypes: connector.supportedSubjectTypes,
          isSimulated: connector.mode === 'SIMULATED',
          error: health.error || null
        };
      } catch (err) {
        return {
          id: connector.id,
          name: connector.name,
          mode: connector.mode,
          status: 'DOWN',
          latencyMs: 3000,
          lastCheckedAt: new Date(),
          supportedSubjectTypes: connector.supportedSubjectTypes,
          isSimulated: connector.mode === 'SIMULATED',
          error: 'Connection timeout or health check error'
        };
      }
    });

    return Promise.all(statusPromises);
  }

  /**
   * Executes a verification through a controlled connector with bounded timeout and safety wrappers.
   */
  async executeVerification({
    connectorId,
    subjectType,
    subjectId,
    fieldPath,
    value,
    institutionId,
    context = {}
  }) {
    const connector = this.getConnector(connectorId);
    if (!connector) {
      const err = new Error(`Connector '${connectorId}' is not registered or supported.`);
      err.statusCode = 400;
      err.code = 'INVALID_CONNECTOR';
      throw err;
    }

    if (!connector.supportedSubjectTypes.includes(subjectType)) {
      const err = new Error(`Connector '${connectorId}' does not support subject type '${subjectType}'.`);
      err.statusCode = 400;
      err.code = 'UNSUPPORTED_SUBJECT_TYPE';
      throw err;
    }

    // Bounded execution timeout: 5000ms
    let timeoutTimer;
    try {
      const verificationPromise = connector.verify({
        subjectType,
        subjectId,
        fieldPath,
        value,
        institutionId,
        context
      });

      const timeoutPromise = new Promise((_, reject) => {
        timeoutTimer = setTimeout(() => {
          const timeoutErr = new Error('Verification connector response timed out.');
          timeoutErr.code = 'CONNECTOR_TIMEOUT';
          reject(timeoutErr);
        }, 5000);
      });

      const rawResult = await Promise.race([verificationPromise, timeoutPromise]);

      // Enforce strict integrity rules on result
      let effectiveLabel = rawResult.label;
      const trustedMode = connector.mode;

      if (trustedMode === 'SIMULATED') {
        if (effectiveLabel === 'AUTHORITY_VERIFIED') {
          effectiveLabel = 'AUTHORITY_VERIFIED_SIMULATED';
        }
      }

      return {
        ...rawResult,
        label: effectiveLabel,
        sourceMode: trustedMode,
        connectorId: connector.id,
        isSimulated: trustedMode === 'SIMULATED'
      };
    } catch (err) {
      // Never crash or leak credentials/PII on connector exception
      return {
        status: 'UNABLE_TO_VERIFY',
        label: 'UNABLE_TO_VERIFY',
        sourceMode: connector.mode,
        method: 'CONNECTOR_API',
        connectorId: connector.id,
        sourceRef: `CONNECTOR_ERROR_${connector.id.toUpperCase()}`,
        ruleOrSourceVersion: connector.version || 'v1.0',
        valueSnapshot: value,
        notes: `Verification unavailable: ${err.message || 'Upstream gateway error'}`,
        isSimulated: connector.mode === 'SIMULATED',
        errorDetail: err.code || 'UPSTREAM_ERROR'
      };
    } finally {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
      }
    }
  }
}

// Singleton registry instance
const registry = new ConnectorRegistry();

module.exports = registry;
