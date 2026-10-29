/**
 * Resend Email Service.
 * SIH 2026 PS3 — APAAR ID-Based Student Data Management and Verification Platform.
 *
 * Implements transactional emails for:
 * 1. Account activation invitations (single-use activation token links).
 * 2. Two-step authentication login OTP codes (6-digit cryptographically secure codes).
 *
 * SECURITY & PRIVACY CONTROLS:
 * - Production requires valid RESEND_API_KEY and verified MAIL_FROM domain.
 * - In production, missing or failed email service fails safely; never bypasses OTP.
 * - Test environment uses an isolated in-memory test adapter (zero network egress).
 * - Demo/test domain (@example.test) in non-production environments simulates delivery safely.
 * - NEVER logs plaintext OTPs, activation tokens, passwords, or provider API keys.
 */
const { Resend } = require('resend');

// In-memory test mailbox for automated integration tests
const testMailbox = [];

/**
 * Retrieves the test mailbox (test/development only).
 */
function getTestMailbox() {
  if (process.env.NODE_ENV === 'production') {
    return [];
  }
  return [...testMailbox];
}

/**
 * Clears the test mailbox (test/development only).
 */
function clearTestMailbox() {
  testMailbox.length = 0;
}

/**
 * Inspects the latest sent email for a recipient (test/development only).
 */
function getLatestEmailFor(email) {
  if (process.env.NODE_ENV === 'production') {
    return null;
  }
  const normalized = String(email || '').toLowerCase().trim();
  for (let i = testMailbox.length - 1; i >= 0; i--) {
    if (testMailbox[i].to.toLowerCase() === normalized) {
      return testMailbox[i];
    }
  }
  return null;
}

/**
 * Initializes the Resend client.
 */
function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === 're_placeholder' || apiKey.startsWith('re_your_')) {
    return null;
  }
  return new Resend(apiKey);
}

/**
 * Sends a transactional email through Resend or test mock adapter.
 */
async function sendEmail({ to, subject, html, text }) {
  const isProduction = process.env.NODE_ENV === 'production';
  const isTest = process.env.NODE_ENV === 'test';
  const normalizedTo = String(to || '').toLowerCase().trim();
  const isDemoEmail = normalizedTo.endsWith('@example.test');

  const from =
    process.env.MAIL_FROM ||
    'SeatSeal <onboarding@resend.dev>';

  // Record into test mailbox in test mode or for demo accounts in non-prod
  if (isTest || (!isProduction && isDemoEmail)) {
    const record = {
      to: normalizedTo,
      from,
      subject,
      html,
      text,
      sentAt: new Date(),
      provider: 'MOCK_ADAPTER'
    };
    testMailbox.push(record);
    return { success: true, messageId: `mock_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`, mock: true };
  }

  const client = getResendClient();

  if (!client) {
    if (isProduction) {
      // In production, failure to configure Resend must fail safely
      throw new Error('SECURITY_ERROR: Email delivery service is unavailable. Production requires a configured RESEND_API_KEY.');
    } else {
      // In development without an API key, record locally to prevent blocking local engineers
      const record = {
        to: normalizedTo,
        from,
        subject,
        html,
        text,
        sentAt: new Date(),
        provider: 'DEV_SIMULATED'
      };
      testMailbox.push(record);
      return { success: true, messageId: `dev_${Date.now()}`, mock: true };
    }
  }

  try {
    const response = await client.emails.send({
      from,
      to: [normalizedTo],
      subject,
      html,
      text
    });

    if (response.error) {
      throw new Error(`Resend provider error: ${response.error.message || response.error}`);
    }

    return { success: true, messageId: response.data ? response.data.id : 'resend_ok', mock: false };
  } catch (err) {
    if (isProduction) {
      throw err;
    }
    // Fall back to recorded mock in dev if API call fails
    testMailbox.push({
      to: normalizedTo,
      from,
      subject,
      html,
      text,
      sentAt: new Date(),
      provider: 'DEV_FALLBACK_ON_ERROR',
      error: err.message
    });
    return { success: true, messageId: `dev_fallback_${Date.now()}`, mock: true };
  }
}

/**
 * Sends an account activation invitation email.
 */
async function sendActivationEmail({ to, name, activationToken, expiresMinutes = 1440 }) {
  const baseUrl = process.env.APP_BASE_URL || 'http://localhost:5173';
  const activationUrl = `${baseUrl.replace(/\/+$/, '')}/activate-account?token=${encodeURIComponent(activationToken)}&email=${encodeURIComponent(to)}`;

  const subject = 'Activate Your Account — SeatSeal';

  const hours = Math.round(expiresMinutes / 60);

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>${subject}</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px;">
        <div style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <div style="border-bottom: 2px solid #2563eb; padding-bottom: 16px; margin-bottom: 24px;">
            <h2 style="color: #1e293b; margin: 0; font-size: 20px;">SeatSeal</h2>
            <p style="color: #64748b; margin: 4px 0 0 0; font-size: 13px;">Every Seat Is Seal &bull; Official Institutional Portal</p>
          </div>
          <p style="color: #334155; font-size: 15px; line-height: 1.5;">Hello ${name || 'User'},</p>
          <p style="color: #334155; font-size: 15px; line-height: 1.5;">An administrative user account has been provisioned for you on SeatSeal. Please click the button below to set your secure password and activate your account:</p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${activationUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 28px; font-weight: 600; text-decoration: none; border-radius: 6px; display: inline-block; font-size: 14px;">Set Password & Activate</a>
          </div>
          <p style="color: #64748b; font-size: 13px; line-height: 1.5;">This single-use activation link will expire in <strong>${hours} hours</strong>. If you did not expect this invitation, please contact your SeatSeal platform administrator immediately.</p>
          <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #f1f5f9; font-size: 12px; color: #94a3b8;">
            <p style="margin: 0;">If the button above does not work, copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #475569; margin-top: 4px;">${activationUrl}</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const text = `Hello ${name || 'User'},\n\nAn administrative account has been provisioned for you on SeatSeal.\n\nPlease visit the following link to set your password and activate your account (valid for ${hours} hours):\n\n${activationUrl}\n\nIf you did not request this, please contact your administrator.`;

  return sendEmail({ to, subject, html, text });
}

/**
 * Sends a two-step authentication login OTP email.
 */
async function sendLoginOtpEmail({ to, name, otp, expiresMinutes = 10 }) {
  const subject = 'Your Verification Code — SeatSeal';

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>${subject}</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px;">
        <div style="max-width: 540px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <div style="border-bottom: 2px solid #2563eb; padding-bottom: 16px; margin-bottom: 24px;">
            <h2 style="color: #1e293b; margin: 0; font-size: 20px;">SeatSeal</h2>
            <p style="color: #64748b; margin: 4px 0 0 0; font-size: 13px;">Every Seat Is Seal &bull; Two-Factor Authentication Security</p>
          </div>
          <p style="color: #334155; font-size: 15px; line-height: 1.5;">Hello ${name || 'User'},</p>
          <p style="color: #334155; font-size: 15px; line-height: 1.5;">Your one-time verification code for SeatSeal login is:</p>
          <div style="text-align: center; margin: 28px 0; background-color: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 6px; padding: 16px;">
            <span style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #1e293b; font-family: 'Courier New', monospace;">${otp}</span>
          </div>
          <p style="color: #64748b; font-size: 13px; line-height: 1.5;">This verification code will expire in <strong>${expiresMinutes} minutes</strong>. Do NOT share this code with anyone. SeatSeal officials will never ask for your verification code.</p>
          <p style="color: #64748b; font-size: 12px; margin-top: 24px; padding-top: 16px; border-top: 1px solid #f1f5f9;">If you did not initiate this login attempt, someone may know your password. Change your password immediately.</p>
        </div>
      </body>
    </html>
  `;

  const text = `Hello ${name || 'User'},\n\nYour SeatSeal verification code is: ${otp}\n\nThis code expires in ${expiresMinutes} minutes. Never share this code with anyone.`;

  return sendEmail({ to, subject, html, text });
}

/**
 * Extracts the latest OTP for an email address (strictly test/development only).
 */
function getLatestOtpForTesting(email) {
  if (process.env.NODE_ENV === 'production') {
    return null;
  }
  const emailRecord = getLatestEmailFor(email);
  if (!emailRecord || !emailRecord.text) return null;
  const match = emailRecord.text.match(/verification code is:\s*([0-9]{6})/i);
  return match ? match[1] : null;
}

/**
 * Extracts the latest activation token for an email address (strictly test/development only).
 */
function getLatestActivationTokenForTesting(email) {
  if (process.env.NODE_ENV === 'production') {
    return null;
  }
  const emailRecord = getLatestEmailFor(email);
  if (!emailRecord || !emailRecord.text) return null;
  const match = emailRecord.text.match(/token=([a-f0-9]+)/i);
  return match ? match[1] : null;
}

module.exports = {
  sendEmail,
  sendActivationEmail,
  sendLoginOtpEmail,
  getTestMailbox,
  clearTestMailbox,
  getLatestEmailFor,
  getLatestOtpForTesting,
  getLatestActivationTokenForTesting
};
