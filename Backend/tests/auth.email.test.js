/**
 * Integration & Security Test Suite for Email Authentication & Account Activation (Prompt 11)
 * Covers:
 * 1. Admin-managed user creation & email activation links.
 * 2. Activation token verification, single-use enforcement, and replay protection.
 * 3. Prevention of login by unactivated accounts (403 ACCOUNT_NOT_ACTIVATED).
 * 4. Step A: Password validation and email OTP dispatch without issuing tokens or cookies.
 * 5. Step B: Cryptographic 6-digit OTP verification, attempt limiting, and expiration.
 * 6. Concurrency & replay protection on OTP challenges.
 * 7. Resend OTP flow and resend activation email.
 * 8. Production security safeguards: no dev fallback keys in production, safe failure when Resend unconfigured.
 * 9. Zero data leakage: no passwords, hashes, OTPs, or activation tokens in API responses.
 */
require('../src/config/dns');
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const { connectDB, disconnectDB } = require('../src/config/db');

const User = require('../src/models/user.model');
const LoginOtpChallenge = require('../src/models/loginOtpChallenge.model');
const RefreshToken = require('../src/models/refreshToken.model');
const Institution = require('../src/models/institution.model');
const { hashPassword } = require('../src/utils/passwordCrypto');
const { ROLES } = require('../src/config/permissions');
const { generateAccessToken } = require('../src/utils/tokenService');
const {
  getLatestOtpForTesting,
  getLatestActivationTokenForTesting,
  getTestMailbox,
  clearTestMailbox,
  sendActivationEmail,
  sendLoginOtpEmail
} = require('../src/services/emailService');
const { getSigningKeys } = require('../src/utils/sealCrypto');

describe('Email Authentication, Activation & MFA OTP Security Suite', () => {
  const testInstId = new mongoose.Types.ObjectId();
  let platformAdminUser;
  let adminAccessToken;
  const adminPassword = 'AdminPassword123!Secure';

  beforeAll(async () => {
    await connectDB();
    clearTestMailbox();

    // Create test institution
    await Institution.create({
      _id: testInstId,
      code: `INST_EMAIL_TEST_${Date.now()}`,
      name: 'National Email Test Institute',
      type: 'ENGINEERING',
      state: 'Delhi',
      status: 'ACTIVE'
    });

    // Create Platform Admin
    platformAdminUser = await User.create({
      email: `admin.email.test.${Date.now()}@aicte.gov.in`,
      passwordHash: await hashPassword(adminPassword),
      name: 'Email Test Platform Admin',
      role: ROLES.PLATFORM_ADMIN,
      isActive: true,
      isActivated: true,
      emailVerified: true,
      tokenVersion: 1
    });

    adminAccessToken = generateAccessToken(platformAdminUser);
  });

  afterAll(async () => {
    await Promise.all([
      Institution.deleteMany({ _id: testInstId }),
      User.deleteMany({ email: { $regex: /@aicte\.gov\.in|@email-test\.edu/ } }),
      LoginOtpChallenge.deleteMany({ email: { $regex: /@aicte\.gov\.in|@email-test\.edu/ } }),
      RefreshToken.deleteMany({ userId: platformAdminUser._id })
    ]);
    await disconnectDB();
  });

  describe('1. Account Creation and Activation Flow', () => {
    const newUserEmail = `new.operator.${Date.now()}@email-test.edu`;
    let createdUserId;
    let activationToken;

    it('1.1. Platform Admin creates user: account is created in pending activation state without exposing token', async () => {
      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          email: newUserEmail,
          name: 'Pending Operator',
          role: ROLES.INSTITUTION_OPERATOR,
          institutionId: testInstId.toString()
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isActivated).toBe(false);
      expect(res.body.data.emailVerified).toBe(false);
      expect(res.body.data.email).toBe(newUserEmail);

      // SECURITY AUDIT: Activation token and passwordHash MUST NOT be exposed in API response
      expect(res.body.data.activationToken).toBeUndefined();
      expect(res.body.data.activationTokenHash).toBeUndefined();
      expect(res.body.data.passwordHash).toBeUndefined();

      createdUserId = res.body.data._id || res.body.data.id;

      // Verify email was dispatched via test adapter
      activationToken = getLatestActivationTokenForTesting(newUserEmail);
      expect(activationToken).toBeDefined();
      expect(typeof activationToken).toBe('string');
      expect(activationToken.length).toBe(64); // 32 bytes hex
    });

    it('1.2. Account in pending activation state CANNOT log in (403 ACCOUNT_NOT_ACTIVATED)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: newUserEmail,
          password: 'AnyPassword123!'
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('ACCOUNT_NOT_ACTIVATED');
      expect(res.body.error.message.toLowerCase()).toContain('activation');
    });

    it('1.3. Invalid or malformed activation token is rejected (400 INVALID_OR_EXPIRED_TOKEN)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/activate-account')
        .send({
          token: 'invalid_malformed_token_1234567890abcdef',
          password: 'NewStrongPassword123!'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_ACTIVATION_TOKEN');
    });

    it('1.4. Valid activation token sets password and activates the account', async () => {
      const res = await request(app)
        .post('/api/v1/auth/activate-account')
        .send({
          token: activationToken,
          password: 'ActivatedPassword123!'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe(newUserEmail);
      expect(res.body.data.isActivated).toBe(true);
      expect(res.body.data.emailVerified).toBe(true);

      // Password hash and token hash must NOT be in response
      expect(res.body.data.passwordHash).toBeUndefined();
      expect(res.body.data.activationTokenHash).toBeUndefined();

      // Check DB directly: token hash removed and activatedAt set
      const dbUser = await User.findById(createdUserId).select('+activationTokenHash +passwordHash');
      expect(dbUser.isActivated).toBe(true);
      expect(dbUser.emailVerified).toBe(true);
      expect(dbUser.activationTokenHash).toBeNull();
      expect(dbUser.activatedAt).toBeDefined();
    });

    it('1.5. Replaying a used activation token is rejected (400 INVALID_ACTIVATION_TOKEN)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/activate-account')
        .send({
          token: activationToken,
          password: 'AnotherPassword123!'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_ACTIVATION_TOKEN');
    });

    it('1.6. Resend activation email generates a new token and sends a fresh email', async () => {
      // Create another user pending activation
      const email2 = `resend.test.${Date.now()}@email-test.edu`;
      const createRes = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          email: email2,
          name: 'Resend Target User',
          role: ROLES.INSTITUTION_OPERATOR,
          institutionId: testInstId.toString()
        });

      const user2Id = createRes.body.data._id || createRes.body.data.id;
      const initialToken = getLatestActivationTokenForTesting(email2);
      expect(initialToken).toBeDefined();

      // Resend activation email
      const resendRes = await request(app)
        .post(`/api/v1/users/${user2Id}/resend-activation`)
        .set('Authorization', `Bearer ${adminAccessToken}`);

      expect(resendRes.status).toBe(200);
      expect(resendRes.body.success).toBe(true);

      const secondToken = getLatestActivationTokenForTesting(email2);
      expect(secondToken).toBeDefined();
      expect(secondToken).not.toBe(initialToken); // Fresh token generated

      // Old token is invalidated
      const tryOld = await request(app)
        .post('/api/v1/auth/activate-account')
        .send({
          token: initialToken,
          password: 'Password123!'
        });
      expect(tryOld.status).toBe(400);

      // New token succeeds
      const tryNew = await request(app)
        .post('/api/v1/auth/activate-account')
        .send({
          token: secondToken,
          password: 'Password123!'
        });
      expect(tryNew.status).toBe(200);
      expect(tryNew.body.data.isActivated).toBe(true);
    });
  });

  describe('2. Two-Step Email OTP Authentication Flow', () => {
    let mfaUser;
    const mfaPassword = 'MfaUserPassword123!';
    let currentChallengeId;

    beforeAll(async () => {
      mfaUser = await User.create({
        email: `mfa.user.${Date.now()}@email-test.edu`,
        passwordHash: await hashPassword(mfaPassword),
        name: 'MFA Verified Operator',
        role: ROLES.INSTITUTION_OPERATOR,
        institutionId: testInstId.toString(),
        isActive: true,
        isActivated: true,
        emailVerified: true,
        tokenVersion: 1
      });
    });

    it('2.1. Step A: Password validation triggers 6-digit OTP dispatch without issuing tokens or cookies', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: mfaUser.email,
          password: mfaPassword
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.mfaRequired).toBe(true);
      expect(res.body.data.challengeId).toBeDefined();
      expect(res.body.data.maskedEmail).toBeDefined();
      expect(res.body.data.expiresAt).toBeDefined();

      // STRICT SECURITY CHECK: No tokens or cookies in Step A
      expect(res.body.data.accessToken).toBeUndefined();
      expect(res.body.data.user).toBeUndefined();
      expect(res.headers['set-cookie']).toBeUndefined();

      currentChallengeId = res.body.data.challengeId;

      // Inspect dispatched OTP from test adapter
      const otp = getLatestOtpForTesting(mfaUser.email);
      expect(otp).toBeDefined();
      expect(otp).toMatch(/^\d{6}$/);
    });

    it('2.2. Step B: Incorrect OTP is rejected and decrements remaining attempts', async () => {
      const res = await request(app)
        .post('/api/v1/auth/verify-login-otp')
        .send({
          challengeId: currentChallengeId,
          otp: '000000' // wrong OTP
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_OTP');
      expect(res.body.error.details.attemptsRemaining).toBe(4);
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('2.3. Exceeding maximum OTP attempts locks challenge with 429 OTP_ATTEMPTS_EXCEEDED', async () => {
      // 4 more wrong attempts to hit limit of 5
      for (let i = 0; i < 4; i++) {
        await request(app)
          .post('/api/v1/auth/verify-login-otp')
          .send({
            challengeId: currentChallengeId,
            otp: '000000'
          });
      }

      // 6th attempt
      const lockedRes = await request(app)
        .post('/api/v1/auth/verify-login-otp')
        .send({
          challengeId: currentChallengeId,
          otp: getLatestOtpForTesting(mfaUser.email)
        });

      expect(lockedRes.status).toBe(429);
      expect(lockedRes.body.error.code).toBe('OTP_MAX_ATTEMPTS_EXCEEDED');
      expect(lockedRes.body.error.message.toLowerCase()).toContain('exceeded');
    });

    it('2.4. Resend OTP creates a fresh challenge OTP and resets attempt counter', async () => {
      const resendRes = await request(app)
        .post('/api/v1/auth/resend-login-otp')
        .send({
          challengeId: currentChallengeId
        });

      expect(resendRes.status).toBe(200);
      expect(resendRes.body.success).toBe(true);
      expect(resendRes.body.data.expiresAt).toBeDefined();

      const freshOtp = getLatestOtpForTesting(mfaUser.email);
      expect(freshOtp).toBeDefined();
      expect(freshOtp).toMatch(/^\d{6}$/);

      // Verify with the fresh OTP now succeeds
      const verifyRes = await request(app)
        .post('/api/v1/auth/verify-login-otp')
        .send({
          challengeId: currentChallengeId,
          otp: freshOtp
        });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.success).toBe(true);
      expect(typeof verifyRes.body.data.accessToken).toBe('string');
      expect(verifyRes.body.data.user.email).toBe(mfaUser.email);

      // Refresh cookie set
      const cookies = verifyRes.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const cookieStr = Array.isArray(cookies) ? cookies.join('; ') : cookies;
      expect(cookieStr).toContain('refreshToken=');
      expect(cookieStr.toLowerCase()).toContain('httponly');
    });

    it('2.5. Replay attack: Consumed OTP challenge CANNOT be verified again', async () => {
      const replayRes = await request(app)
        .post('/api/v1/auth/verify-login-otp')
        .send({
          challengeId: currentChallengeId,
          otp: getLatestOtpForTesting(mfaUser.email)
        });

      expect(replayRes.status).toBe(401);
      expect(replayRes.body.error.code).toBe('CHALLENGE_ALREADY_USED');
    });

    it('2.6. Expired OTP challenge is rejected with 401 OTP_EXPIRED', async () => {
      // Initiate a fresh login challenge
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: mfaUser.email,
          password: mfaPassword
        });

      const expChallengeId = loginRes.body.data.challengeId;
      const validOtp = getLatestOtpForTesting(mfaUser.email);

      // Force challenge to be expired in database
      await LoginOtpChallenge.updateOne(
        { challengeId: expChallengeId },
        { $set: { expiresAt: new Date(Date.now() - 60000) } }
      );

      const verifyRes = await request(app)
        .post('/api/v1/auth/verify-login-otp')
        .send({
          challengeId: expChallengeId,
          otp: validOtp
        });

      expect(verifyRes.status).toBe(401);
      expect(verifyRes.body.error.code).toBe('OTP_EXPIRED');
    });

    it('2.7. Concurrent OTP verification race condition: atomic consumption prevents double issuance', async () => {
      // Initiate a new login
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: mfaUser.email,
          password: mfaPassword
        });

      const raceChallengeId = loginRes.body.data.challengeId;
      const raceOtp = getLatestOtpForTesting(mfaUser.email);

      // Fire 5 simultaneous verification requests
      const results = await Promise.all([
        request(app).post('/api/v1/auth/verify-login-otp').send({ challengeId: raceChallengeId, otp: raceOtp }),
        request(app).post('/api/v1/auth/verify-login-otp').send({ challengeId: raceChallengeId, otp: raceOtp }),
        request(app).post('/api/v1/auth/verify-login-otp').send({ challengeId: raceChallengeId, otp: raceOtp }),
        request(app).post('/api/v1/auth/verify-login-otp').send({ challengeId: raceChallengeId, otp: raceOtp }),
        request(app).post('/api/v1/auth/verify-login-otp').send({ challengeId: raceChallengeId, otp: raceOtp })
      ]);

      const successCount = results.filter((r) => r.status === 200).length;
      const failureCount = results.filter((r) => r.status === 401).length;

      // Exactly ONE request must succeed; all other concurrent requests must be rejected
      expect(successCount).toBe(1);
      expect(failureCount).toBe(4);
    });
  });

  describe('3. Production Security & Cryptographic Safeguards', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalResendKey = process.env.RESEND_API_KEY;
    const originalSealPriv = process.env.SEAL_SIGNING_PRIVATE_KEY;
    const originalSealPub = process.env.SEAL_SIGNING_PUBLIC_KEY;

    afterEach(() => {
      process.env.NODE_ENV = originalNodeEnv;
      process.env.RESEND_API_KEY = originalResendKey;
      process.env.SEAL_SIGNING_PRIVATE_KEY = originalSealPriv;
      process.env.SEAL_SIGNING_PUBLIC_KEY = originalSealPub;
    });

    it('3.1. Production strictly forbids fallback Ed25519 signing keys and throws SECURITY_ERROR if keys missing', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.SEAL_SIGNING_PRIVATE_KEY;
      delete process.env.SEAL_SIGNING_PUBLIC_KEY;

      expect(() => {
        getSigningKeys();
      }).toThrow(/SECURITY_ERROR.*SEAL_SIGNING_PRIVATE_KEY/);
    });

    it('3.2. Production email delivery strictly fails safely without RESEND_API_KEY and never allows mock bypass', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.RESEND_API_KEY;

      await expect(
        sendLoginOtpEmail({ email: 'prod.test@example.com', otp: '123456' })
      ).rejects.toThrow(/SECURITY_ERROR.*RESEND_API_KEY/);

      await expect(
        sendActivationEmail({ email: 'prod.test@example.com', activationToken: 'test-token' })
      ).rejects.toThrow(/SECURITY_ERROR.*RESEND_API_KEY/);
    });

    it('3.3. Test mail inspection helpers are strictly disabled in production', () => {
      process.env.NODE_ENV = 'production';

      expect(getLatestOtpForTesting('any@example.com')).toBeNull();
      expect(getLatestActivationTokenForTesting('any@example.com')).toBeNull();
      expect(getTestMailbox()).toEqual([]);
    });

    it('3.4. API responses never leak sensitive secrets (passwordHash, activationTokenHash, otpHash)', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${adminAccessToken}`);

      expect(res.status).toBe(200);
      const userStr = JSON.stringify(res.body);

      expect(userStr).not.toContain('passwordHash');
      expect(userStr).not.toContain('activationTokenHash');
      expect(userStr).not.toContain('otpHash');
      expect(userStr).not.toContain('salt');
    });
  });
});
