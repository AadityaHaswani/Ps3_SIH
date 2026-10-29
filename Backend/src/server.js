/**
 * Server Entrypoint.
 * 1. Loads and validates environment configuration.
 * 2. Configures DNS resolvers before SRV lookups.
 * 3. Connects to MongoDB Atlas / local database.
 * 4. Starts HTTP listener on the configured port.
 * 5. Handles graceful shutdown and unexpected errors.
 */
const { config } = require('./config/env');
const dns = require('./config/dns');
const { connectDB, disconnectDB } = require('./config/db');
const app = require('./app');

let server = null;

async function startServer() {
  try {
    console.log('====================================================');
    console.log(' SeatSeal — Every Seat Is Seal');
    console.log(` Environment: ${config.nodeEnv} | Port: ${config.port}`);
    console.log('====================================================');

    // 1. DNS setup verification
    const dnsStatus = typeof dns.configureDns === 'function' ? dns.configureDns() : { applied: true };
    if (dnsStatus.applied) {
      console.log('[DNS] Custom DNS resolvers active (1.1.1.1, 8.8.8.8)');
    }

    // 2. Connect to Database before opening HTTP listener
    console.log('[Bootstrap] Connecting to MongoDB...');
    await connectDB();

    // 3. Start Express HTTP server
    server = app.listen(config.port, () => {
      console.log(`[Server] HTTP server listening on port ${config.port}`);
      console.log(`[Server] Health check: http://localhost:${config.port}/api/v1/health`);
      console.log('====================================================');
    });

  } catch (err) {
    // Sanitise error output: never expose secrets or full connection strings
    const safeErrorMsg = err && err.message 
      ? err.message.replace(/mongodb(\+srv)?:\/\/[^@\s]+@/gi, 'mongodb+srv://[REDACTED]@') 
      : 'Unknown startup error';
    
    console.error(`[Startup Failure] Critical error during boot: ${safeErrorMsg}`);
    process.exit(1);
  }
}

// Graceful shutdown handling
async function gracefulShutdown(signal) {
  console.log(`\n[Server] Received ${signal}. Commencing graceful shutdown...`);

  if (server) {
    server.close(async () => {
      console.log('[Server] HTTP listener closed.');
      try {
        await disconnectDB();
        console.log('[MongoDB] Database connection closed.');
      } catch (err) {
        console.error('[MongoDB] Error closing database connection:', err.message);
      }
      process.exit(0);
    });

    // Force exit if graceful shutdown takes too long (10s)
    setTimeout(() => {
      console.error('[Server] Graceful shutdown timed out. Forcing process termination.');
      process.exit(1);
    }, 10000).unref();
  } else {
    process.exit(0);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  const safeReason = (reason && reason.message) ? reason.message : String(reason);
  console.error('[Process] Unhandled Promise Rejection:', safeReason.replace(/mongodb(\+srv)?:\/\/[^@\s]+@/gi, 'mongodb+srv://[REDACTED]@'));
});

// Start the server
startServer();
