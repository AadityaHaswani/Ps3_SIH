/**
 * CLI First-Admin Bootstrap Script.
 * Provisions initial PLATFORM_ADMIN account via command-line when no administrator exists.
 *
 * SAFETY RESTRICTIONS:
 * - Refuses to execute if any PLATFORM_ADMIN already exists in the database.
 * - Requires explicit environment credentials (INITIAL_ADMIN_EMAIL, INITIAL_ADMIN_PASSWORD).
 * - Never prints password plaintext in console output or logs.
 * - Unreachable via HTTP / public APIs.
 *
 * USAGE:
 *   node src/scripts/bootstrapAdmin.js
 */
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const { connectDB, disconnectDB } = require('../config/db');
const User = require('../models/user.model');
const { hashPassword } = require('../utils/passwordCrypto');
const { ROLES } = require('../config/permissions');

async function bootstrap(options = {}) {
  try {
    await connectDB();

    // 1. Strict guard: abort if any PLATFORM_ADMIN already exists
    const existingAdminCount = await User.countDocuments({ role: ROLES.PLATFORM_ADMIN });
    if (existingAdminCount > 0) {
      const msg = '[Bootstrap Error] Platform administrator already provisioned. Bootstrap aborted.';
      if (options.doNotExit) {
        return { success: false, reason: 'ADMIN_ALREADY_EXISTS', message: msg };
      }
      console.error(msg);
      await disconnectDB();
      process.exit(1);
    }

    // 2. Read explicit credentials from environment or options
    const email = options.email || process.env.INITIAL_ADMIN_EMAIL || process.env.ADMIN_EMAIL;
    const password = options.password || process.env.INITIAL_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;
    const name = options.name || process.env.INITIAL_ADMIN_NAME || process.env.ADMIN_NAME || 'Central Platform Administrator';

    if (!email || !password) {
      const msg = '[Bootstrap Error] INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD environment variables are required.';
      if (options.doNotExit) {
        return { success: false, reason: 'MISSING_CREDENTIALS', message: msg };
      }
      console.error(msg);
      await disconnectDB();
      process.exit(1);
    }

    if (password.length < 8) {
      const msg = '[Bootstrap Error] Initial admin password must be at least 8 characters long.';
      if (options.doNotExit) {
        return { success: false, reason: 'PASSWORD_TOO_SHORT', message: msg };
      }
      console.error(msg);
      await disconnectDB();
      process.exit(1);
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const passwordHash = await hashPassword(password);

    const adminUser = await User.create({
      email: normalizedEmail,
      passwordHash,
      name: String(name).trim(),
      role: ROLES.PLATFORM_ADMIN,
      institutionId: null,
      isActive: true,
      tokenVersion: 0
    });

    const successMsg = `[Bootstrap Success] Platform administrator successfully provisioned for ${adminUser.email} (ID: ${adminUser._id}).`;
    console.log(successMsg);

    if (options.doNotExit) {
      return { success: true, user: adminUser };
    }

    await disconnectDB();
    process.exit(0);
  } catch (err) {
    if (options.doNotExit) {
      throw err;
    }
    console.error('[Bootstrap Fatal Error]', err.message);
    await disconnectDB();
    process.exit(1);
  }
}

if (require.main === module) {
  bootstrap();
}

module.exports = { bootstrap };
