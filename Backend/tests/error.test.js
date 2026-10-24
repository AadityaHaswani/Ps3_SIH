/**
 * Unit tests for Centralized Error Handler and 404 Handler.
 */
const errorHandler = require('../src/middleware/errorHandler');
const notFoundHandler = require('../src/middleware/notFound');

describe('Middleware Error & 404 Handlers', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      method: 'GET',
      originalUrl: '/test-error-endpoint',
      id: 'req_test_suite_123'
    };
    res = {
      statusCode: null,
      jsonData: null,
      headersSent: false,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.jsonData = data;
        return this;
      }
    };
    next = jest.fn();
  });

  describe('notFoundHandler', () => {
    test('should return 404 with standard envelope', () => {
      notFoundHandler(req, res, next);

      expect(res.statusCode).toBe(404);
      expect(res.jsonData.success).toBe(false);
      expect(res.jsonData.error.code).toBe('NOT_FOUND');
      expect(res.jsonData.error.message).toContain('Cannot GET /test-error-endpoint');
      expect(res.jsonData.requestId).toBe('req_test_suite_123');
    });
  });

  describe('errorHandler', () => {
    test('should delegate to next if headers already sent', () => {
      res.headersSent = true;
      const error = new Error('Headers already sent');

      errorHandler(error, req, res, next);

      expect(next).toHaveBeenCalledWith(error);
      expect(res.statusCode).toBeNull();
    });

    test('should format standard 500 error and NEVER include stack trace', () => {
      const error = new Error('Database connection reset');
      error.stack = 'Error: Database connection reset\n    at mockFunction (/src/service.js:10:5)';

      errorHandler(error, req, res, next);

      expect(res.statusCode).toBe(500);
      expect(res.jsonData.success).toBe(false);
      expect(res.jsonData.error.code).toBe('INTERNAL_ERROR');
      expect(res.jsonData.error.stack).toBeUndefined();
      expect(res.jsonData.stack).toBeUndefined();
      expect(res.jsonData.requestId).toBe('req_test_suite_123');
    });

    test('should redact MongoDB credentials if accidentally present in error message', () => {
      const leakedError = new Error('Connection failed to mongodb+srv://admin_user:super_secret_pwd@cluster0.abc.mongodb.net/db');

      errorHandler(leakedError, req, res, next);

      expect(res.jsonData.error.message).not.toContain('super_secret_pwd');
      expect(res.jsonData.error.message).toContain('mongodb+srv://[REDACTED]@');
    });

    test('should handle custom status code and details array', () => {
      const customErr = new Error('Validation failed');
      customErr.status = 422;
      customErr.code = 'UNPROCESSABLE';
      customErr.details = [{ field: 'academicYear', issue: 'Invalid year format' }];

      errorHandler(customErr, req, res, next);

      expect(res.statusCode).toBe(422);
      expect(res.jsonData.error.code).toBe('UNPROCESSABLE');
      expect(res.jsonData.error.details).toHaveLength(1);
      expect(res.jsonData.error.details[0].field).toBe('academicYear');
    });
  });
});
