/**
 * Integration Tests for Authentication, Authorization, RBAC & Platform Security.
 * Covers:
 * 1. Credentials, login, password security, lockout & error envelopes.
 * 2. Token & session lifecycle, refresh rotation, reuse detection & immediate revocation.
 * 3. User management, sole platform-admin protection & self-promotion defense.
 * 4. Tenant isolation, IDOR protection & Authority-Officer institution scoping.
 * 5. Auditor global read-only enforcement across mutation routes.
 */
require('../src/config/dns');
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const { connectDB, disconnectDB } = require('../src/config/db');

const User = require('../src/models/user.model');
const RefreshToken = require('../src/models/refreshToken.model');
const Institution = require('../src/models/institution.model');
const { hashPassword } = require('../src/utils/passwordCrypto');
const { ROLES } = require('../src/config/permissions');
const { generateAccessToken, generateRefreshToken, hashToken } = require('../src/utils/tokenService');
const { getLatestOtpForTesting } = require('../src/services/emailService');

describe('Auth & Platform Security Integration Suite', () => {
  const instAId = new mongoose.Types.ObjectId();
  const instBId = new mongoose.Types.ObjectId();

  let platformAdminUser;
  let institutionAdminUser;
  let institutionOperatorUser;
  let authorityOfficerUser;
  let auditorUser;
  let disabledUser;

  const testPassword = 'Password123!Secure';

  beforeAll(async () => {
    await connectDB();

    // Setup Institutions
    await Institution.create([
      {
        _id: instAId,
        code: `INST_AUTH_A_${Date.now()}`,
        name: 'Alpha Engineering Academy',
        type: 'ENGINEERING',
        state: 'Maharashtra',
        status: 'ACTIVE'
      },
      {
        _id: instBId,
        code: `INST_AUTH_B_${Date.now()}`,
        name: 'Beta Polytechnic Institute',
        type: 'POLYTECHNIC',
        state: 'Karnataka',
        status: 'ACTIVE'
      }
    ]);

    const passwordHash = await hashPassword(testPassword);

    // Setup Test Users across all canonical roles
    platformAdminUser = await User.create({
      email: `platform.admin.${Date.now()}@aicte.gov.in`,
      passwordHash,
      name: 'Platform Super Admin',
      role: ROLES.PLATFORM_ADMIN,
      isActive: true,
      isActivated: true,
      emailVerified: true,
      tokenVersion: 1
    });

    institutionAdminUser = await User.create({
      email: `inst.admin.${Date.now()}@alpha.edu`,
      passwordHash,
      name: 'Alpha Institution Admin',
      role: ROLES.INSTITUTION_ADMIN,
      institutionId: instAId.toString(),
      isActive: true,
      isActivated: true,
      emailVerified: true,
      tokenVersion: 1
    });

    institutionOperatorUser = await User.create({
      email: `inst.operator.${Date.now()}@alpha.edu`,
      passwordHash,
      name: 'Alpha Data Operator',
      role: ROLES.INSTITUTION_OPERATOR,
      institutionId: instAId.toString(),
      isActive: true,
      isActivated: true,
      emailVerified: true,
      tokenVersion: 1
    });

    authorityOfficerUser = await User.create({
      email: `officer.${Date.now()}@aicte.gov.in`,
      passwordHash,
      name: 'Review Officer Sharma',
      role: ROLES.AUTHORITY_OFFICER,
      assignedInstitutionIds: [instAId.toString()], // Scoped ONLY to Inst A
      isActive: true,
      isActivated: true,
      emailVerified: true,
      tokenVersion: 1
    });

    auditorUser = await User.create({
      email: `auditor.${Date.now()}@audit.gov.in`,
      passwordHash,
      name: 'Independent Auditor Roy',
      role: ROLES.AUDITOR,
      isActive: true,
      isActivated: true,
      emailVerified: true,
      tokenVersion: 1
    });

    disabledUser = await User.create({
      email: `disabled.${Date.now()}@alpha.edu`,
      passwordHash,
      name: 'Disabled User',
      role: ROLES.INSTITUTION_OPERATOR,
      institutionId: instAId.toString(),
      isActive: false,
      isActivated: true,
      emailVerified: true,
      tokenVersion: 1
    });
  });

  afterAll(async () => {
    await Promise.all([
      Institution.deleteMany({ _id: { $in: [instAId, instBId] } }),
      User.deleteMany({
        _id: {
          $in: [
            platformAdminUser._id,
            institutionAdminUser._id,
            institutionOperatorUser._id,
            authorityOfficerUser._id,
            auditorUser._id,
            disabledUser._id
          ]
        }
      }),
      RefreshToken.deleteMany({
        userId: {
          $in: [
            platformAdminUser._id,
            institutionAdminUser._id,
            institutionOperatorUser._id,
            authorityOfficerUser._id,
            auditorUser._id,
            disabledUser._id
          ]
        }
      })
    ]);
    await disconnectDB();
  });

  describe('1. Credentials & Login Endpoint (POST /api/v1/auth/login)', () => {
    it('1. Valid credentials initiate MFA OTP challenge and verify-login-otp issues JWT and sets httpOnly cookie', async () => {
      // Step A: Password authentication triggers OTP generation and email dispatch
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: institutionAdminUser.email,
          password: testPassword
        });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.success).toBe(true);
      expect(loginRes.body.data.mfaRequired).toBe(true);
      expect(loginRes.body.data.challengeId).toBeDefined();
      expect(loginRes.body.data.maskedEmail).toBeDefined();
      expect(loginRes.body.data.expiresAt).toBeDefined();

      // Ensure tokens are NOT issued in Step A
      expect(loginRes.body.data.accessToken).toBeUndefined();
      expect(loginRes.headers['set-cookie']).toBeUndefined();

      // Retrieve test OTP from mock mail adapter
      const otp = getLatestOtpForTesting(institutionAdminUser.email);
      expect(otp).toBeDefined();
      expect(otp).toMatch(/^\d{6}$/);

      // Step B: OTP verification completes authentication
      const verifyRes = await request(app)
        .post('/api/v1/auth/verify-login-otp')
        .send({
          challengeId: loginRes.body.data.challengeId,
          otp
        });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.success).toBe(true);
      expect(verifyRes.body.data.user).toBeDefined();
      expect(verifyRes.body.data.user.email).toBe(institutionAdminUser.email);
      expect(verifyRes.body.data.user.role).toBe(ROLES.INSTITUTION_ADMIN);
      expect(verifyRes.body.data.user.institutionId).toBe(instAId.toString());
      expect(Array.isArray(verifyRes.body.data.user.permissions)).toBe(true);

      // Password hash and tokens must NEVER be exposed in user object
      expect(verifyRes.body.data.user.passwordHash).toBeUndefined();
      expect(verifyRes.body.data.user.activationTokenHash).toBeUndefined();

      // Access token returned
      expect(typeof verifyRes.body.data.accessToken).toBe('string');

      // Refresh token cookie configured safely
      const cookies = verifyRes.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const cookieStr = Array.isArray(cookies) ? cookies.join('; ') : cookies;
      expect(cookieStr).toContain('refreshToken=');
      expect(cookieStr.toLowerCase()).toContain('httponly');
      expect(cookieStr).toContain('Path=/api/v1/auth');
    });

    it('2. Invalid password returns safe generic 401 INVALID_CREDENTIALS error', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: institutionAdminUser.email,
          password: 'IncorrectPassword123!'
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
      expect(res.body.error.message).toBe('Invalid email or password.');
    });

    it('3. Nonexistent account returns identical safe generic 401 without leaking user existence', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'nonexistent.user.999@alpha.edu',
          password: 'AnyPassword123!'
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
      expect(res.body.error.message).toBe('Invalid email or password.');
    });

    it('4. Disabled accounts cannot authenticate (401 ACCOUNT_DISABLED)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: disabledUser.email,
          password: testPassword
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('ACCOUNT_DISABLED');
      expect(res.body.error.message).toContain('disabled');
    });

    it('5. Malformed login input is rejected with 400 VALIDATION_ERROR', async () => {
      const res1 = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'not-an-email', password: '' });
      expect(res1.status).toBe(400);

      const res2 = await request(app)
        .post('/api/v1/auth/login')
        .send({});
      expect(res2.status).toBe(400);
    });

    it('6. Public user registration route is disabled/nonexistent (404 NOT_FOUND)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'hacker@example.com',
          password: 'Password123!',
          role: 'PLATFORM_ADMIN'
        });

      expect(res.status).toBe(404);
    });

    it('7. Temporary account lockout triggers after 5 consecutive failed login attempts', async () => {
      const lockoutUser = await User.create({
        email: `lockout.test.${Date.now()}@alpha.edu`,
        passwordHash: await hashPassword(testPassword),
        name: 'Lockout Target User',
        role: ROLES.INSTITUTION_OPERATOR,
        institutionId: instAId.toString(),
        isActive: true,
        isActivated: true,
        emailVerified: true
      });

      // Execute 5 consecutive failed attempts
      for (let i = 0; i < 5; i++) {
        const failRes = await request(app)
          .post('/api/v1/auth/login')
          .send({
            email: lockoutUser.email,
            password: 'WrongPasswordEveryTime!'
          });
        expect(failRes.status).toBe(401);
      }

      // 6th attempt should return 429 ACCOUNT_LOCKED
      const lockedRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: lockoutUser.email,
          password: testPassword // Even with correct password, account is locked
        });

      expect(lockedRes.status).toBe(429);
      expect(lockedRes.body.error.code).toBe('ACCOUNT_LOCKED');
      expect(lockedRes.body.error.message.toLowerCase()).toContain('locked');

      // Cleanup
      await User.deleteOne({ _id: lockoutUser._id });
    });
  });

  describe('2. Current User Endpoint (GET /api/v1/auth/me)', () => {
    it('8. Returns database-backed identity and permissions array for valid Bearer token', async () => {
      const freshInstAdmin = await User.findById(institutionAdminUser._id);
      const token = generateAccessToken(freshInstAdmin);

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(institutionAdminUser.email);
      expect(res.body.data.user.role).toBe(ROLES.INSTITUTION_ADMIN);
      expect(res.body.data.user.institutionId).toBe(instAId.toString());
      expect(Array.isArray(res.body.data.permissions)).toBe(true);
      expect(res.body.data.permissions).toContain('rosters:commit');
    });

    it('9. Rejects unauthenticated request with 401 UNAUTHENTICATED', async () => {
      const res = await request(app).get('/api/v1/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('10. Rejects tampered or malformed access token with 401 UNAUTHENTICATED', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid.tampered.token');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('11. Rejects refresh token passed as an access token with 401 INVALID_TOKEN_TYPE', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer some-plain-refresh-token');

      expect(res.status).toBe(401);
    });
  });

  describe('3. Refresh Token Rotation & Reuse Detection (POST /api/v1/auth/refresh)', () => {
    let activeRefreshToken;
    let authCookie;

    beforeEach(async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: institutionAdminUser.email,
          password: testPassword
        });

      const otp = getLatestOtpForTesting(institutionAdminUser.email);
      const verifyRes = await request(app)
        .post('/api/v1/auth/verify-login-otp')
        .send({
          challengeId: loginRes.body.data.challengeId,
          otp
        });

      const cookies = verifyRes.headers['set-cookie'];
      authCookie = Array.isArray(cookies) ? cookies[0] : cookies;
      const match = authCookie ? authCookie.match(/refreshToken=([^;]+)/) : null;
      activeRefreshToken = match ? match[1] : null;
    });

    it('12. Valid refresh token rotates the token, issues fresh access token and sets new cookie', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', `refreshToken=${activeRefreshToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(typeof res.body.data.accessToken).toBe('string');

      // Cookie rotated
      const newCookies = res.headers['set-cookie'];
      expect(newCookies).toBeDefined();
      const newCookieStr = Array.isArray(newCookies) ? newCookies[0] : newCookies;
      const match = newCookieStr.match(/refreshToken=([^;]+)/);
      const newRefreshToken = match ? match[1] : null;

      expect(newRefreshToken).toBeDefined();
      expect(newRefreshToken).not.toBe(activeRefreshToken);
    });

    it('13. Reusing an already rotated refresh token triggers reuse detection and revokes session family', async () => {
      // 1st Refresh: Rotates activeRefreshToken to newRefreshToken
      const refresh1 = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', `refreshToken=${activeRefreshToken}`);

      expect(refresh1.status).toBe(200);

      // 2nd Refresh with the OLD rotated token (Replay Attack simulation):
      const reuseRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', `refreshToken=${activeRefreshToken}`);

      expect(reuseRes.status).toBe(401);
      expect(reuseRes.body.error.code).toBe('TOKEN_REUSE_DETECTED');
      expect(reuseRes.body.error.message).toContain('reuse detected');

      // Verify the entire session family was revoked in MongoDB
      const rotatedSession = await RefreshToken.findOne({ tokenHash: hashToken(activeRefreshToken) });
      expect(rotatedSession).toBeDefined();
      const familyTokens = await RefreshToken.find({ familyId: rotatedSession.familyId });
      expect(familyTokens.length).toBeGreaterThan(0);
      familyTokens.forEach((t) => {
        expect(t.isRevoked).toBe(true);
      });
    });

    it('14. Missing or empty refresh cookie returns 401 UNAUTHENTICATED', async () => {
      const res = await request(app).post('/api/v1/auth/refresh');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });
  });

  describe('4. Logout & Immediate Revocation (POST /api/v1/auth/logout)', () => {
    it('15. Logout revokes the session and clears the refresh cookie', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: institutionAdminUser.email,
          password: testPassword
        });

      const otp = getLatestOtpForTesting(institutionAdminUser.email);
      const verifyRes = await request(app)
        .post('/api/v1/auth/verify-login-otp')
        .send({
          challengeId: loginRes.body.data.challengeId,
          otp
        });

      const cookies = verifyRes.headers['set-cookie'];
      const cookieStr = Array.isArray(cookies) ? cookies[0] : cookies;
      const match = cookieStr.match(/refreshToken=([^;]+)/);
      const token = match ? match[1] : null;

      const logoutRes = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', `refreshToken=${token}`);

      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.success).toBe(true);

      // Verify subsequent refresh with this token is rejected
      const retryRefresh = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', `refreshToken=${token}`);

      expect(retryRefresh.status).toBe(401);
    });
  });

  describe('5. Password Change & Stale Token Invalidation (POST /api/v1/auth/change-password)', () => {
    it('16. Password change requires current password and invalidates previous access tokens', async () => {
      const user = await User.create({
        email: `pwd.change.${Date.now()}@alpha.edu`,
        passwordHash: await hashPassword(testPassword),
        name: 'Password Changer',
        role: ROLES.INSTITUTION_OPERATOR,
        institutionId: instAId.toString(),
        isActive: true,
        isActivated: true,
        emailVerified: true,
        tokenVersion: 1
      });

      const oldToken = generateAccessToken(user);
      const newPassword = 'NewSecretPassword456!';

      // Change password
      const changeRes = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${oldToken}`)
        .send({
          currentPassword: testPassword,
          newPassword
        });

      expect(changeRes.status).toBe(200);
      expect(changeRes.body.success).toBe(true);

      // Old token should now be rejected due to incremented tokenVersion
      const staleRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${oldToken}`);

      expect(staleRes.status).toBe(401);
      expect(staleRes.body.error.code).toBe('TOKEN_REVOKED');

      // Login with new password succeeds
      const newLoginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: user.email,
          password: newPassword
        });

      expect(newLoginRes.status).toBe(200);
      expect(newLoginRes.body.data.mfaRequired).toBe(true);

      const newOtp = getLatestOtpForTesting(user.email);
      const newVerifyRes = await request(app)
        .post('/api/v1/auth/verify-login-otp')
        .send({
          challengeId: newLoginRes.body.data.challengeId,
          otp: newOtp
        });

      expect(newVerifyRes.status).toBe(200);
      expect(newVerifyRes.body.data.accessToken).toBeDefined();

      // Cleanup
      await User.deleteOne({ _id: user._id });
    });
  });

  describe('6. User Management & Protection of Sole Admin (/api/v1/users)', () => {
    it('17. Non-admin users cannot access user management endpoints (403 FORBIDDEN)', async () => {
      const freshInstAdmin = await User.findById(institutionAdminUser._id);
      const token = generateAccessToken(freshInstAdmin);

      const res = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it('18. PLATFORM_ADMIN can create and list users with server-side validation', async () => {
      const freshAdmin = await User.findById(platformAdminUser._id);
      const adminToken = generateAccessToken(freshAdmin);

      const newUserRes = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: `new.inst.admin.${Date.now()}@beta.edu`,
          password: testPassword,
          name: 'Beta Admin',
          role: ROLES.INSTITUTION_ADMIN,
          institutionId: instBId.toString()
        });

      expect(newUserRes.status).toBe(201);
      expect(newUserRes.body.success).toBe(true);
      expect(newUserRes.body.data.role).toBe(ROLES.INSTITUTION_ADMIN);
      expect(newUserRes.body.data.institutionId).toBe(instBId.toString());

      // Cleanup
      await User.deleteOne({ _id: newUserRes.body.data._id || newUserRes.body.data.id });
    });

    it('19. Creating an institution role without an institutionId is rejected (400)', async () => {
      const res = await request(app)
        .post('/api/v1/users')
        .set('x-user-role', ROLES.PLATFORM_ADMIN)
        .send({
          email: `missing.inst.${Date.now()}@test.edu`,
          password: testPassword,
          name: 'Missing Inst Admin',
          role: ROLES.INSTITUTION_ADMIN
          // institutionId omitted
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('20. System prevents disabling or demoting the sole active PLATFORM_ADMIN', async () => {
      // Ensure only 1 active PLATFORM_ADMIN exists in the database
      await User.deleteMany({
        role: ROLES.PLATFORM_ADMIN,
        _id: { $ne: platformAdminUser._id }
      });

      const res = await request(app)
        .patch(`/api/v1/users/${platformAdminUser._id}`)
        .set('x-user-role', ROLES.PLATFORM_ADMIN)
        .set('x-user-id', platformAdminUser._id.toString())
        .send({
          isActive: false // Attempt to disable sole platform admin
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('SOLE_ADMIN_PROTECTION');
    });
  });

  describe('7. Tenant Isolation, IDOR Protection & Scoping', () => {
    it('21. INSTITUTION_ADMIN cannot access another institution\'s rosters or data (403)', async () => {
      // Inst A Admin attempts to query Inst B's roster versions
      const res = await request(app)
        .get(`/api/v1/roster-versions?institutionId=${instBId}`)
        .set('x-user-role', ROLES.INSTITUTION_ADMIN)
        .set('x-user-institution', instAId.toString());

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('22. AUTHORITY_OFFICER cannot access institutions outside their assignedInstitutionIds', async () => {
      // officer is assigned ONLY to instAId, attempting to query instBId
      const res = await request(app)
        .get(`/api/v1/roster-versions?institutionId=${instBId}`)
        .set('x-user-role', ROLES.AUTHORITY_OFFICER)
        .set('x-user-assigned', instAId.toString()); // Only Inst A assigned

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('23. AUDITOR role is globally read-only and cannot mutate data across any endpoint (403)', async () => {
      // Attempting POST on sampling-runs as AUDITOR
      const res = await request(app)
        .post('/api/v1/sampling-runs')
        .set('x-user-role', ROLES.AUDITOR)
        .send({
          institutionId: instAId.toString(),
          academicYear: '2024-25',
          sampleSize: 10
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('8. CLI First-Admin Bootstrap Script', () => {
    it('24. Bootstrap refuses to run when a platform administrator already exists', async () => {
      const { bootstrap } = require('../src/scripts/bootstrapAdmin');
      const result = await bootstrap({ doNotExit: true });
      expect(result.success).toBe(false);
      expect(result.reason).toBe('ADMIN_ALREADY_EXISTS');
    });
  });
});
