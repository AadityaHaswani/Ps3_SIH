/**
 * Controlled Failing Connector.
 * Simulates network partition, timeout, or upstream registry outages for resilience testing.
 * Mode: SIMULATED.
 * Always yields safe UNABLE_TO_VERIFY without crashing caller or leaking secrets.
 */
class FailingConnector {
  constructor() {
    this.id = 'failing-test-connector';
    this.name = 'Failing Test Upstream Registry (Simulated Outage)';
    this.mode = 'SIMULATED';
    this.version = 'v1.0-SIM-FAIL';
    this.supportedSubjectTypes = ['PROGRAMME_INTAKE', 'ROSTER_RECORD', 'STUDENT_LIFECYCLE', 'SEAT_BALANCE'];
  }

  async checkHealth() {
    return {
      connectorId: this.id,
      name: this.name,
      mode: this.mode,
      status: 'DOWN',
      latencyMs: 5000,
      lastCheckedAt: new Date(),
      error: 'Upstream connection timed out (Simulated ETIMEDOUT)',
      isSimulated: true
    };
  }

  async verify({ subjectType, subjectId, fieldPath, value, institutionId, context = {} }) {
    // If context specifies throwException, simulate an unhandled network error
    if (context.throwException) {
      const err = new Error('Upstream gateway connection reset by peer (simulated)');
      err.code = 'ECONNRESET';
      throw err;
    }

    return {
      status: 'UNABLE_TO_VERIFY',
      label: 'UNABLE_TO_VERIFY',
      sourceMode: this.mode,
      method: 'CONNECTOR_API',
      sourceRef: 'SIMULATED_FAILING_GATEWAY',
      ruleOrSourceVersion: this.version,
      valueSnapshot: value,
      notes: 'Upstream gateway unavailable / unreachable; verification could not be completed at this time.',
      isSimulated: true,
      errorDetail: 'UPSTREAM_GATEWAY_TIMEOUT'
    };
  }
}

module.exports = FailingConnector;
