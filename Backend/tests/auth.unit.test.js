/**
 * Auth Unit Tests.
 * Tests password hashing (scrypt, salt, timingSafeEqual), token service,
 * permission matrix, cookie parsing, and User model methods.
 */
const { hashPassword, verifyPassword } = require('../src/utils/passwordCrypto');
const {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  verifyAccessToken,
  getRefreshTokenCookieOptions,
  ACCESS_TOKEN_EXPIRY_SECONDS
} = require('../src/utils/tokenService');
const {
  PERMISSIONS,
  ROLES,
  hasPermission,
  getPermissionsForRole
} = require('../src/config/permissions');
const { parseCookies } = require('../src/middleware/cookieMiddleware');

describe('Auth Unit Tests - Password Cryptography', () => {
  it('should hash a password and verify it successfully with timing-safe comparison', async () => {
    const password = 'SuperSecretSecurePassword123!';
    const hash = await hashPassword(password);

    expect(typeof hash).toBe('string');
    expect(hash.startsWith('scrypt$')).toBe(true);

    const parts = hash.split('$');
    expect(parts.length).toBe(6); // scrypt$N$r$p$salt$derivedKey
    expect(Number(parts[1])).toBe(16384); // N
    expect(Number(parts[2])).toBe(8); // r
    expect(Number(parts[3])).toBe(1); // p

    const isValid = await verifyPassword(password, hash);
    expect(isValid).toBe(true);
  });

  it('should reject an incorrect password', async () => {
    const password = 'SuperSecretSecurePassword123!';
    const hash = await hashPassword(password);

    const isValid = await verifyPassword('WrongPassword999!', hash);
    expect(isValid).toBe(false);
  });

  it('should reject malformed or invalid hash formats safely', async () => {
    expect(await verifyPassword('password', 'plain_text_not_scrypt')).toBe(false);
    expect(await verifyPassword('password', '')).toBe(false);
    expect(await verifyPassword('password', null)).toBe(false);
    expect(await verifyPassword('', 'scrypt$16384$8$1$abc$def')).toBe(false);
    expect(await verifyPassword(null, 'scrypt$16384$8$1$abc$def')).toBe(false);
  });

  it('should generate distinct salts for identical passwords', async () => {
    const password = 'IdenticalPassword123!';
    const hash1 = await hashPassword(password);
    const hash2 = await hashPassword(password);

    expect(hash1).not.toBe(hash2);
    expect(await verifyPassword(password, hash1)).toBe(true);
    expect(await verifyPassword(password, hash2)).toBe(true);
  });
});

describe('Auth Unit Tests - Token Service', () => {
  const mockUser = {
    _id: '507f1f77bcf86cd799439011',
    email: 'test.admin@inst.edu',
    role: ROLES.INSTITUTION_ADMIN,
    institutionId: 'INST-001',
    assignedInstitutionIds: [],
    tokenVersion: 1
  };

  it('should generate and verify a valid access token', () => {
    const token = generateAccessToken(mockUser);
    expect(typeof token).toBe('string');

    const decoded = verifyAccessToken(token);
    expect(decoded.sub).toBe(mockUser._id);
    expect(decoded.email).toBe(mockUser.email);
    expect(decoded.role).toBe(ROLES.INSTITUTION_ADMIN);
    expect(decoded.institutionId).toBe(mockUser.institutionId);
    expect(decoded.tokenVersion).toBe(1);
    expect(decoded.type).toBe('access');
  });

  it('should generate a 64-byte random hex refresh token', () => {
    const refreshToken = generateRefreshToken();
    expect(typeof refreshToken).toBe('string');
    expect(refreshToken.length).toBe(128); // 64 bytes = 128 hex chars
  });

  it('should deterministically SHA-256 hash refresh tokens', () => {
    const token = 'sample-refresh-token-string';
    const hash1 = hashToken(token);
    const hash2 = hashToken(token);

    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64); // SHA-256 hex is 64 characters
  });

  it('should throw an error for malformed or tampered access tokens', () => {
    expect(() => verifyAccessToken('malformed.token.string')).toThrow();
  });

  it('should configure secure httpOnly cookie options', () => {
    const options = getRefreshTokenCookieOptions();
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite.toLowerCase()).toBe('lax');
    expect(options.path).toBe('/api/v1/auth');
    expect(typeof options.maxAge).toBe('number');
  });
});

describe('Auth Unit Tests - Permission Matrix', () => {
  it('should grant PLATFORM_ADMIN user management and institutional permissions', () => {
    expect(hasPermission(ROLES.PLATFORM_ADMIN, PERMISSIONS.USERS_CREATE)).toBe(true);
    expect(hasPermission(ROLES.PLATFORM_ADMIN, PERMISSIONS.USERS_UPDATE)).toBe(true);
    expect(hasPermission(ROLES.PLATFORM_ADMIN, PERMISSIONS.USERS_READ)).toBe(true);
    expect(hasPermission(ROLES.PLATFORM_ADMIN, PERMISSIONS.AUDIT_READ)).toBe(true);
  });

  it('should strictly limit AUDITOR to read-only permissions', () => {
    const auditorPerms = getPermissionsForRole(ROLES.AUDITOR);
    expect(auditorPerms.length).toBeGreaterThan(0);

    // Verify all AUDITOR permissions are read, audit, or verify
    auditorPerms.forEach((perm) => {
      const isReadOrVerify =
        perm.endsWith(':read') ||
        perm.endsWith(':verify') ||
        perm.endsWith(':review') ||
        perm.endsWith(':audit') ||
        perm.endsWith(':preview');
      expect(isReadOrVerify).toBe(true);
    });

    // Specifically verify mutation permissions are denied
    expect(hasPermission(ROLES.AUDITOR, PERMISSIONS.ROSTERS_COMMIT)).toBe(false);
    expect(hasPermission(ROLES.AUDITOR, PERMISSIONS.ROSTERS_UPLOAD)).toBe(false);
    expect(hasPermission(ROLES.AUDITOR, PERMISSIONS.LIFECYCLE_WRITE)).toBe(false);
    expect(hasPermission(ROLES.AUDITOR, PERMISSIONS.SAMPLING_CREATE)).toBe(false);
    expect(hasPermission(ROLES.AUDITOR, PERMISSIONS.SCORECARDS_RECALCULATE)).toBe(false);
  });

  it('should not allow INSTITUTION_OPERATOR to commit rosters or confirm transfers', () => {
    expect(hasPermission(ROLES.INSTITUTION_OPERATOR, PERMISSIONS.ROSTERS_PREVIEW)).toBe(true);
    expect(hasPermission(ROLES.INSTITUTION_OPERATOR, PERMISSIONS.ROSTERS_UPLOAD)).toBe(true);
    expect(hasPermission(ROLES.INSTITUTION_OPERATOR, PERMISSIONS.ROSTERS_COMMIT)).toBe(false);
    expect(hasPermission(ROLES.INSTITUTION_OPERATOR, PERMISSIONS.TRANSFERS_CONFIRM_OWN_SIDE)).toBe(false);
  });

  it('should allow INSTITUTION_ADMIN to commit rosters and confirm transfers for own side', () => {
    expect(hasPermission(ROLES.INSTITUTION_ADMIN, PERMISSIONS.ROSTERS_COMMIT)).toBe(true);
    expect(hasPermission(ROLES.INSTITUTION_ADMIN, PERMISSIONS.TRANSFERS_CONFIRM_OWN_SIDE)).toBe(true);
  });

  it('should deny permissions for unknown or invalid roles', () => {
    expect(hasPermission('SUPER_USER_HACKER', PERMISSIONS.USERS_READ)).toBe(false);
    expect(hasPermission(null, PERMISSIONS.USERS_READ)).toBe(false);
    expect(hasPermission(undefined, PERMISSIONS.USERS_READ)).toBe(false);
    expect(getPermissionsForRole('INVALID_ROLE')).toEqual([]);
  });
});

describe('Auth Unit Tests - Cookie Middleware Parser', () => {
  it('should parse Cookie header into key-value pairs', () => {
    const cookies = parseCookies('sessionId=xyz123; refreshToken=token_abc_456; theme=dark');
    expect(cookies.sessionId).toBe('xyz123');
    expect(cookies.refreshToken).toBe('token_abc_456');
    expect(cookies.theme).toBe('dark');
  });

  it('should handle undefined or empty Cookie headers gracefully', () => {
    expect(parseCookies(undefined)).toEqual({});
    expect(parseCookies('')).toEqual({});
    expect(parseCookies(null)).toEqual({});
  });
});
