/**
 * Unit tests for DNS configuration module.
 */
const dnsModule = require('../src/config/dns');

describe('DNS Configuration Module', () => {
  test('should export dns object with configureDns method', () => {
    expect(dnsModule).toBeDefined();
    expect(typeof dnsModule.getServers).toBe('function');
    expect(typeof dnsModule.configureDns).toBe('function');
  });

  test('should return status object on configureDns execution', () => {
    const result = dnsModule.configureDns();
    expect(result).toBeDefined();
    expect(result.applied).toBe(true);
    expect(Array.isArray(result.servers)).toBe(true);
  });

  test('configureDns should be idempotent when called multiple times', () => {
    const firstCall = dnsModule.configureDns();
    const secondCall = dnsModule.configureDns();
    expect(secondCall.applied).toBe(true);
    expect(secondCall.cached).toBe(true);
  });
});
