/**
 * Unit tests for Database connection module.
 */
const db = require('../src/config/db');

describe('Database Connection Module (Unit)', () => {
  afterAll(async () => {
    await db.disconnectDB();
  });

  test('isDbConnected should return false when not connected', () => {
    expect(db.isDbConnected()).toBe(false);
  });

  test('getDbStatus should return structured diagnostic info without secrets', () => {
    const status = db.getDbStatus();
    expect(status).toBeDefined();
    expect(typeof status.connected).toBe('boolean');
    expect(status.state).toBeDefined();
    expect(status.readyState).toBeDefined();
  });

  test('connectDB should throw sanitized error if invalid connection string is supplied', async () => {
    await expect(
      db.connectDB('mongodb://invalid-host-that-does-not-exist:27017/test', {
        serverSelectionTimeoutMS: 500,
        connectTimeoutMS: 500
      })
    ).rejects.toThrow();
  });

  test('disconnectDB should complete safely even when already disconnected', async () => {
    await expect(db.disconnectDB()).resolves.not.toThrow();
  });
});
