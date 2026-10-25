/**
 * Environment configuration loader and validator.
 * Validates critical environment variables safely without exposing secrets.
 */
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from Backend/.env if present
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const PLACEHOLDER_PATTERNS = [
  /<[^>]+>/, // e.g. <username>, <password>, <cluster>, etc.
  /\b(your_username|your_password|your_jwt_secret|example\.mongodb\.net|placeholder)\b/i
];

/**
 * Checks if a URI contains obvious placeholder text
 * @param {string} uri 
 * @returns {boolean}
 */
function isPlaceholderUri(uri) {
  if (!uri || typeof uri !== 'string') return true;
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(uri));
}

/**
 * Parses and validates environment variables.
 * @param {object} env - Key-value map (defaults to process.env)
 * @returns {object} Validated configuration object
 */
function parseAndValidateConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const allowedEnvs = ['development', 'production', 'test', 'staging'];
  if (!allowedEnvs.includes(nodeEnv)) {
    throw new Error(`Invalid NODE_ENV: '${nodeEnv}'. Allowed values are: ${allowedEnvs.join(', ')}`);
  }

  const rawPort = env.PORT || '5000';
  const port = parseInt(rawPort, 10);
  if (isNaN(port) || port <= 0 || port > 65535) {
    throw new Error('Invalid PORT specified in environment configuration. Must be a valid port number between 1 and 65535.');
  }

  const mongoUri = env.MONGODB_URI ? env.MONGODB_URI.trim() : '';
  if (!mongoUri) {
    throw new Error('Invalid or missing MONGODB_URI in environment configuration. Connection string is required.');
  }

  if (!mongoUri.startsWith('mongodb://') && !mongoUri.startsWith('mongodb+srv://')) {
    throw new Error('Invalid MONGODB_URI scheme in environment configuration. Must start with mongodb:// or mongodb+srv://.');
  }

  if (isPlaceholderUri(mongoUri)) {
    throw new Error('Invalid MONGODB_URI in environment configuration. Value appears to contain placeholder text.');
  }

  return {
    nodeEnv,
    port,
    mongoUri,
    clientUrl: env.CLIENT_URL ? env.CLIENT_URL.trim() : 'http://localhost:5173',
    jwtSecret: env.JWT_SECRET ? env.JWT_SECRET.trim() : null,
    jwtExpiresIn: env.JWT_EXPIRES_IN ? env.JWT_EXPIRES_IN.trim() : '7d',
    apaarTokenSecret: env.APAAR_TOKEN_SECRET ? env.APAAR_TOKEN_SECRET.trim() : null,
    admin: {
      name: env.ADMIN_NAME ? env.ADMIN_NAME.trim() : null,
      email: env.ADMIN_EMAIL ? env.ADMIN_EMAIL.trim() : null,
      password: env.ADMIN_PASSWORD ? env.ADMIN_PASSWORD.trim() : null
    },
    smtp: {
      host: env.SMTP_HOST ? env.SMTP_HOST.trim() : null,
      port: env.SMTP_PORT ? parseInt(env.SMTP_PORT, 10) : null,
      user: env.SMTP_USER ? env.SMTP_USER.trim() : null,
      pass: env.SMTP_PASS ? env.SMTP_PASS.trim() : null,
      from: env.SMTP_FROM ? env.SMTP_FROM.trim() : null
    },
    demoSeed: {
      enabled: env.DEMO_SEED_ENABLED === 'true',
      password: env.DEMO_SEED_PASSWORD ? env.DEMO_SEED_PASSWORD.trim() : null
    },
    authorityOfficerGlobalAccess: env.AUTHORITY_OFFICER_GLOBAL_ACCESS === 'true',
    enableCustomDns: env.ENABLE_CUSTOM_DNS !== 'false'
  };
}

let config;
try {
  config = parseAndValidateConfig(process.env);
} catch (err) {
  // If running in test mode and MONGODB_URI is not set, provide safe test config
  if (process.env.NODE_ENV === 'test') {
    config = {
      nodeEnv: 'test',
      port: 5000,
      mongoUri: 'mongodb://127.0.0.1:27017/apaar_seat_integrity_test',
      clientUrl: 'http://localhost:5173',
      jwtSecret: 'test_jwt_secret_min_32_chars_long_placeholder_123',
      jwtExpiresIn: '7d',
      admin: {},
      smtp: {},
      demoSeed: {
        enabled: process.env.DEMO_SEED_ENABLED === 'true',
        password: process.env.DEMO_SEED_PASSWORD || null
      },
      authorityOfficerGlobalAccess: process.env.AUTHORITY_OFFICER_GLOBAL_ACCESS === 'true',
      enableCustomDns: false
    };
  } else {
    // In dev/prod, fail fast with sanitised error
    throw err;
  }
}

module.exports = {
  config,
  parseAndValidateConfig,
  isPlaceholderUri
};
