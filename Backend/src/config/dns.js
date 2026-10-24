/**
 * DNS configuration module.
 * Sets DNS servers (1.1.1.1, 8.8.8.8) to resolve potential MongoDB Atlas SRV lookup issues.
 */
const dns = require('dns');

let isConfigured = false;

/**
 * Configure DNS servers for local development / Atlas SRV lookups.
 * Safe to call multiple times (idempotent).
 * @returns {object} status details
 */
function configureDns() {
  if (isConfigured) {
    return { applied: true, servers: dns.getServers(), cached: true };
  }

  // Allow disabling via environment variable if running in an environment that restricts public DNS resolvers
  if (process.env.ENABLE_CUSTOM_DNS === 'false') {
    return { applied: false, reason: 'Disabled via ENABLE_CUSTOM_DNS=false' };
  }

  try {
    dns.setServers(['1.1.1.1', '8.8.8.8']);
    isConfigured = true;
    return { applied: true, servers: dns.getServers(), cached: false };
  } catch (err) {
    // Gracefully capture error without crashing startup
    console.warn('[DNS] Warning: Failed to set custom DNS servers (1.1.1.1, 8.8.8.8):', err.message);
    return { applied: false, error: err.message };
  }
}

// Automatically configure DNS when module is imported
configureDns();

dns.configureDns = configureDns;

module.exports = dns;
