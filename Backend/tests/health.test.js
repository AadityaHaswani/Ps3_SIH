/**
 * Health and Express foundation tests.
 * Tests liveness, readiness (connected & disconnected), 404 handling, error formatting, and CORS.
 */
const request = require('supertest');
const app = require('../src/app');
const db = require('../src/config/db');

describe('Express Foundation & Health API Suite', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('1. Express App Initialisation', () => {
    test('should export an Express application without automatically listening on a port', () => {
      expect(typeof app).toBe('function');
      expect(app.listen).toBeDefined();
    });

    test('should respond to GET / with service overview and valid requestId', async () => {
      const res = await request(app).get('/');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.platform).toContain('APAAR Seat Integrity');
      expect(res.body.data.status).toBe('ONLINE');
      expect(res.body.requestId).toBeDefined();
      expect(res.headers['x-request-id']).toBe(res.body.requestId);
    });
  });

  describe('2. Health & Liveness Probes', () => {
    test('GET /api/v1/health/live should succeed even when database is disconnected', async () => {
      jest.spyOn(db, 'isDbConnected').mockReturnValue(false);

      const res = await request(app).get('/api/v1/health/live');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ALIVE');
      expect(res.body.data.timestamp).toBeDefined();
      expect(res.body.requestId).toBeDefined();
    });

    test('GET /api/v1/health should return overall platform status and services breakdown', async () => {
      jest.spyOn(db, 'isDbConnected').mockReturnValue(false);
      jest.spyOn(db, 'getDbStatus').mockReturnValue({ connected: false, state: 'DISCONNECTED' });

      const res = await request(app).get('/api/v1/health');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('UP');
      expect(res.body.data.services.process).toBe('HEALTHY');
      expect(res.body.data.services.database).toBe('DISCONNECTED');
      expect(res.body.requestId).toBeDefined();
    });
  });

  describe('3. Database Readiness Probe Behaviour', () => {
    test('GET /api/v1/health/ready should return 503 SERVICE_UNAVAILABLE when database is disconnected', async () => {
      jest.spyOn(db, 'isDbConnected').mockReturnValue(false);
      jest.spyOn(db, 'getDbStatus').mockReturnValue({ connected: false, state: 'DISCONNECTED' });

      const res = await request(app).get('/api/v1/health/ready');

      expect(res.status).toBe(503);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
      expect(res.body.data.status).toBe('NOT_READY');
      expect(res.body.data.database).toBe('DISCONNECTED');
      expect(res.body.requestId).toBeDefined();
    });

    test('GET /api/v1/health/ready should return 200 READY when database is connected', async () => {
      jest.spyOn(db, 'isDbConnected').mockReturnValue(true);
      jest.spyOn(db, 'getDbStatus').mockReturnValue({ connected: true, state: 'CONNECTED' });

      const res = await request(app).get('/api/v1/health/ready');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('READY');
      expect(res.body.data.database).toBe('CONNECTED');
      expect(res.body.requestId).toBeDefined();
    });
  });

  describe('4. Unknown Route Handling (404)', () => {
    test('should return standardized 404 response envelope for nonexistent GET route', async () => {
      const res = await request(app).get('/api/v1/non-existent-endpoint');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(res.body.error.message).toContain('Cannot GET /api/v1/non-existent-endpoint');
      expect(res.body.requestId).toBeDefined();
    });

    test('should return standardized 404 response envelope for nonexistent POST route', async () => {
      const res = await request(app).post('/unknown-route').send({ sample: 123 });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(res.body.requestId).toBeDefined();
    });
  });

  describe('5. Centralized Error Handling & Security', () => {
    test('should catch malformed JSON payloads and return 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .post('/api/v1/health')
        .set('Content-Type', 'application/json')
        .send('{"invalidJson: true'); // Malformed JSON

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.requestId).toBeDefined();
    });

    test('should block unauthorized cross-origin requests under CORS policy', async () => {
      const res = await request(app)
        .get('/api/v1/health')
        .set('Origin', 'http://unauthorized-malicious-domain.com');

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('Cross-Origin Request blocked');
    });

    test('should propagate custom X-Request-Id header when supplied by client', async () => {
      const customId = 'req_custom_trace_98765';
      const res = await request(app)
        .get('/api/v1/health/live')
        .set('X-Request-Id', customId);

      expect(res.status).toBe(200);
      expect(res.headers['x-request-id']).toBe(customId);
      expect(res.body.requestId).toBe(customId);
    });

    test('should never include stack trace in error response', async () => {
      const res = await request(app).get('/api/v1/error-test-unknown-route');
      expect(res.body.stack).toBeUndefined();
      expect(res.body.error.stack).toBeUndefined();
    });
  });
});
