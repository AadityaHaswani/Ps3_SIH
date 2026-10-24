/**
 * Health Controller.
 * Provides overall health, liveness probe, and database readiness probe.
 */
const db = require('../config/db');

/**
 * Overall system health endpoint
 * GET /api/v1/health
 */
function getSystemHealth(req, res) {
  const dbStatus = db.getDbStatus();
  const uptimeSeconds = Math.floor(process.uptime());

  res.status(200).json({
    success: true,
    data: {
      status: 'UP',
      timestamp: new Date().toISOString(),
      uptimeSeconds,
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      services: {
        process: 'HEALTHY',
        database: dbStatus.connected ? 'CONNECTED' : 'DISCONNECTED'
      }
    },
    requestId: req.id || null
  });
}

/**
 * Liveness Probe.
 * Checks whether the Express process is running and responsive.
 * Does not depend on external services like MongoDB.
 * GET /api/v1/health/live
 */
function getLiveness(req, res) {
  res.status(200).json({
    success: true,
    data: {
      status: 'ALIVE',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime())
    },
    requestId: req.id || null
  });
}

/**
 * Readiness Probe.
 * Checks whether the application is ready to accept traffic that requires database operations.
 * Returns 200 when MongoDB is connected, and 503 when disconnected.
 * GET /api/v1/health/ready
 */
function getReadiness(req, res) {
  const connected = db.isDbConnected();
  const dbStatus = db.getDbStatus();

  if (connected) {
    return res.status(200).json({
      success: true,
      data: {
        status: 'READY',
        database: 'CONNECTED',
        timestamp: new Date().toISOString()
      },
      requestId: req.id || null
    });
  }

  return res.status(503).json({
    success: false,
    error: {
      code: 'SERVICE_UNAVAILABLE',
      message: 'Database is disconnected. Application is not ready to process stateful requests.'
    },
    data: {
      status: 'NOT_READY',
      database: dbStatus.state || 'DISCONNECTED',
      timestamp: new Date().toISOString()
    },
    requestId: req.id || null
  });
}

module.exports = {
  getSystemHealth,
  getLiveness,
  getReadiness
};
