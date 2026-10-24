/**
 * Reusable Mongoose database connection module.
 * Implements connection lifecycle management, safe logging, timeout handling,
 * and status introspection without exposing credentials.
 */
const mongoose = require('mongoose');
const { config } = require('./env');

let listenersRegistered = false;

/**
 * Attach connection event listeners once
 */
function setupConnectionListeners() {
  if (listenersRegistered) return;

  mongoose.connection.on('connected', () => {
    const host = mongoose.connection.host || 'remote-cluster';
    const dbName = mongoose.connection.name || 'default';
    console.log(`[MongoDB] Connected successfully to database: ${dbName} (host: ${host})`);
  });

  mongoose.connection.on('error', (err) => {
    const rawMsg = err && err.message ? err.message : 'Unknown error';
    const safeMsg = rawMsg.replace(/mongodb(\+srv)?:\/\/[^@\s]+@/gi, 'mongodb+srv://[REDACTED]@');
    console.error(`[MongoDB] Connection error: ${safeMsg}`);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('[MongoDB] Connection disconnected');
  });

  mongoose.connection.on('reconnected', () => {
    console.log('[MongoDB] Connection re-established');
  });

  listenersRegistered = true;
}

/**
 * Connect to MongoDB with timeout and safe error handling
 * @param {string} [uri] Optional URI override (used in testing)
 * @param {object} [options] Optional Mongoose options
 * @returns {Promise<mongoose.Connection>}
 */
async function connectDB(uri = null, options = {}) {
  setupConnectionListeners();

  // If already connected, return existing connection
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  // If currently connecting, wait for existing connection attempt
  if (mongoose.connection.readyState === 2) {
    return new Promise((resolve, reject) => {
      mongoose.connection.once('connected', () => resolve(mongoose.connection));
      mongoose.connection.once('error', (err) => reject(err));
    });
  }

  const targetUri = uri || (config && config.mongoUri) || process.env.MONGODB_URI;
  if (!targetUri) {
    throw new Error('Database connection failed: No MONGODB_URI configured.');
  }

  const connectionOptions = {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
    ...options
  };

  try {
    await mongoose.connect(targetUri, connectionOptions);
    return mongoose.connection;
  } catch (err) {
    // Tear down any partial connection attempts or socket monitors
    try {
      await mongoose.disconnect();
    } catch (_) {
      // Ignore cleanup error
    }

    let errorCategory = 'CONNECTION_FAILED';
    let safeMessage = err.message || 'Failed to connect to MongoDB';

    if (safeMessage.includes('querySrv ENOTFOUND') || safeMessage.includes('ENOTFOUND') || safeMessage.includes('ESERVFAIL')) {
      errorCategory = 'DNS_RESOLUTION_ERROR';
      safeMessage = 'DNS resolution failure during MongoDB Atlas SRV lookup. Verify network DNS or cluster hostname.';
    } else if (safeMessage.includes('Authentication failed') || safeMessage.includes('bad auth')) {
      errorCategory = 'AUTHENTICATION_FAILED';
      safeMessage = 'Authentication failed for MongoDB user. Please verify credentials in configuration.';
    } else if (safeMessage.includes('Server selection timed out') || safeMessage.includes('ETIMEDOUT') || safeMessage.includes('ECONNREFUSED')) {
      errorCategory = 'NETWORK_TIMEOUT';
      safeMessage = 'Connection timed out. Check network access and MongoDB Atlas IP access list (whitelist).';
    }

    safeMessage = safeMessage.replace(/mongodb(\+srv)?:\/\/[^@\s]+@/gi, 'mongodb+srv://[REDACTED]@');
    const sanitisedError = new Error(`[${errorCategory}] ${safeMessage}`);
    sanitisedError.category = errorCategory;
    throw sanitisedError;
  }
}

/**
 * Disconnect from MongoDB safely
 * @returns {Promise<void>}
 */
async function disconnectDB() {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
    await mongoose.disconnect();
  } catch (err) {
    // Ignore disconnect error
  }
}

/**
 * Check if MongoDB connection is currently active
 * @returns {boolean}
 */
function isDbConnected() {
  return mongoose.connection.readyState === 1;
}

/**
 * Get safe database status for diagnostics
 * @returns {object}
 */
function getDbStatus() {
  const stateMap = {
    0: 'DISCONNECTED',
    1: 'CONNECTED',
    2: 'CONNECTING',
    3: 'DISCONNECTING'
  };

  return {
    connected: mongoose.connection.readyState === 1,
    state: stateMap[mongoose.connection.readyState] || 'UNKNOWN',
    readyState: mongoose.connection.readyState,
    databaseName: mongoose.connection.name || null,
    host: mongoose.connection.host || null
  };
}

module.exports = {
  connectDB,
  disconnectDB,
  isDbConnected,
  getDbStatus
};
