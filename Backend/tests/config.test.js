/**
 * Unit tests for Configuration validation.
 * Verifies environment loading, placeholder checks, and credential security.
 */
const { parseAndValidateConfig, isPlaceholderUri } = require('../src/config/env');

describe('Configuration & Environment Validator', () => {
  const validMongoUri = 'mongodb+srv://valid_user:valid_secret_pass@cluster0.abcde.mongodb.net/platform_db?retryWrites=true&w=majority';

  test('should detect placeholder patterns in MongoDB URIs', () => {
    expect(isPlaceholderUri('mongodb+srv://<username>:<password>@cluster0.mongodb.net/db')).toBe(true);
    expect(isPlaceholderUri('mongodb+srv://your_username:your_password@cluster0.example.mongodb.net/db')).toBe(true);
    expect(isPlaceholderUri('mongodb://localhost:27017/placeholder')).toBe(true);
    expect(isPlaceholderUri(validMongoUri)).toBe(false);
  });

  test('should parse and accept a fully valid configuration', () => {
    const validEnv = {
      PORT: '4000',
      NODE_ENV: 'test',
      MONGODB_URI: validMongoUri,
      CLIENT_URL: 'http://localhost:3000'
    };

    const cfg = parseAndValidateConfig(validEnv);
    expect(cfg.port).toBe(4000);
    expect(cfg.nodeEnv).toBe('test');
    expect(cfg.mongoUri).toBe(validMongoUri);
    expect(cfg.clientUrl).toBe('http://localhost:3000');
  });

  test('should throw sanitised error when MONGODB_URI is missing', () => {
    const invalidEnv = {
      PORT: '5000',
      NODE_ENV: 'development'
    };

    expect(() => parseAndValidateConfig(invalidEnv)).toThrow(/Invalid or missing MONGODB_URI/);
  });

  test('should throw sanitised error when MONGODB_URI has invalid protocol scheme', () => {
    const invalidEnv = {
      PORT: '5000',
      NODE_ENV: 'development',
      MONGODB_URI: 'http://my-mongo-server:27017/db'
    };

    expect(() => parseAndValidateConfig(invalidEnv)).toThrow(/Invalid MONGODB_URI scheme/);
  });

  test('should throw sanitised error when MONGODB_URI contains angle-bracket placeholder', () => {
    const placeholderEnv = {
      PORT: '5000',
      NODE_ENV: 'development',
      MONGODB_URI: 'mongodb+srv://<username>:<password>@cluster0.xyz.mongodb.net/testdb'
    };

    expect(() => parseAndValidateConfig(placeholderEnv)).toThrow(/Value appears to contain placeholder text/);
  });

  test('should throw sanitised error when MONGODB_URI contains explicit placeholder words', () => {
    const placeholderEnv = {
      PORT: '5000',
      NODE_ENV: 'development',
      MONGODB_URI: 'mongodb+srv://your_username:secret@cluster0.example.mongodb.net/testdb'
    };

    expect(() => parseAndValidateConfig(placeholderEnv)).toThrow(/Value appears to contain placeholder text/);
  });

  test('should validate PORT numbers and reject non-numeric or out-of-range values', () => {
    expect(() => parseAndValidateConfig({
      PORT: 'invalid-port',
      MONGODB_URI: validMongoUri
    })).toThrow(/Invalid PORT/);

    expect(() => parseAndValidateConfig({
      PORT: '999999',
      MONGODB_URI: validMongoUri
    })).toThrow(/Invalid PORT/);
  });

  test('should validate NODE_ENV and reject unknown environments', () => {
    expect(() => parseAndValidateConfig({
      NODE_ENV: 'nonexistent_env',
      MONGODB_URI: validMongoUri
    })).toThrow(/Invalid NODE_ENV/);
  });

  test('should never include sensitive credentials in error messages', () => {
    const secretPassword = 'SUPER_SECRET_COMPLEX_PASSWORD_123';
    const invalidEnv = {
      MONGODB_URI: `mongodb+srv://admin:${secretPassword}@example.mongodb.net/test`
    };

    try {
      parseAndValidateConfig(invalidEnv);
      throw new Error('Should have failed validation');
    } catch (err) {
      expect(err.message).not.toContain(secretPassword);
      expect(err.message).toContain('placeholder');
    }
  });
});
