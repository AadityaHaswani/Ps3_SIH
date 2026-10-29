# SeatSeal — Every Seat Is Seal
## SIH 2026 PS3 — SeatSeal Platform Context
**Source-verified from actual code (not README). Where code and README disagree, code wins.**
**Generated:** 2026-10-25 | Backend commit: `1beb811`

---

## Table of Contents
1. [Runtime and Setup](#1-runtime-and-setup)
2. [Auth and RBAC](#2-auth-and-rbac)
3. [Complete Endpoint Inventory](#3-complete-endpoint-inventory)
4. [Global API Conventions](#4-global-api-conventions)
5. [Data Models](#5-data-models)
6. [Enums and Constants the UI Must Know](#6-enums-and-constants-the-ui-must-know)
7. [Seed and Demo Data](#7-seed-and-demo-data)
8. [Ready-to-Use Sample Payloads](#8-ready-to-use-sample-payloads)
9. [Gaps and Risks for the Frontend](#9-gaps-and-risks-for-the-frontend)
10. [Code vs README Disagreements](#10-code-vs-readme-disagreements)

---

## 1. Runtime and Setup

### Server Entry Point
- **File:** `src/server.js` → creates HTTP server using `src/app.js`
- **Default port:** `5000` (env: `PORT`)
- **Base URL:** `http://localhost:5000`
- **API prefix:** `/api/v1` (all routes mounted here)
- **Root info route:** `GET /` (no auth) → returns platform name, status, version, apiBase

### Required Environment Variables
| Variable | Required | Default | Notes |
|---|---|---|---|
| `PORT` | No | `5000` | HTTP port |
| `NODE_ENV` | No | `development` | Allowed: `development`, `production`, `test`, `staging` |
| `MONGODB_URI` | **Yes** | — | Must start with `mongodb://` or `mongodb+srv://`; placeholder URIs rejected |
| `JWT_SECRET` | No | `dev_jwt_secret_fallback_key_32_chars` | Use strong random string in production |
| `JWT_EXPIRES_IN` | No | `7d` | **Note: access token is ALWAYS 15 minutes (hardcoded); this env var is NOT used for access tokens** |
| `APAAR_TOKEN_SECRET` | No | `null` | HMAC key for APAAR pseudonymisation |
| `CLIENT_URL` | No | `http://localhost:5173` | Added to CORS allowlist |
| `ADMIN_NAME` | No | `null` | Bootstrap admin name |
| `ADMIN_EMAIL` | No | `null` | Bootstrap admin email |
| `ADMIN_PASSWORD` | No | `null` | Bootstrap admin password |

### Optional Environment Variables
| Variable | Default | Notes |
|---|---|---|
| `RESEND_API_KEY` | `null` | Production email delivery via Resend SDK; mock in dev/test |
| `MAIL_FROM` | `"AICTE Seat Matrix <noreply@aicte-india.org>"` | Sender address |
| `APP_BASE_URL` | `CLIENT_URL` or `http://localhost:5173` | Used in activation email links |
| `DEMO_SEED_ENABLED` | `false` | Must be `true` to run seed scripts |
| `DEMO_SEED_PASSWORD` | `null` | Password for all seeded demo users (min 8 chars) |
| `AUTHORITY_OFFICER_GLOBAL_ACCESS` | `false` | If `true`, AUTHORITY_OFFICER with no assigned institutions gets global access |
| `ENABLE_CUSTOM_DNS` | `true` | DNS resolvers 1.1.1.1 and 8.8.8.8 |
| `ACTIVATION_TOKEN_EXPIRY_MINUTES` | `1440` | 24 hours |
| `OTP_EXPIRY_MINUTES` | `10` | Login OTP validity window |
| `OTP_MAX_ATTEMPTS` | `5` | Max OTP verification attempts before lockout |
| `SEAL_SIGNING_PRIVATE_KEY` | `null` | Ed25519 PEM private key for roster seal signing |
| `SEAL_SIGNING_PUBLIC_KEY` | `null` | Ed25519 PEM public key for seal verification |
| `SEAL_SIGNING_KEY_VERSION` | `ed25519_v1` | Key version label embedded in seal |
| `SMTP_HOST/PORT/USER/PASS/FROM` | `null` | Legacy SMTP config (parsed but not used by emailService; Resend is used instead) |

### Installation and Commands
```bash
cd Backend
npm install

# Development (nodemon hot-reload)
npm run dev

# Production
npm start

# Tests (Jest in-band, NODE_ENV=test auto-config)
npm test

# Seed demo data (requires DEMO_SEED_ENABLED=true and DEMO_SEED_PASSWORD in .env)
npm run seed:demo

# Verify seeded data
npm run seed:demo:verify

# Tamper/restore demo (seal integrity demonstration)
npm run demo:tamper
npm run demo:restore
```

### CORS Configuration
**Source:** `src/app.js` lines 28-58

The CORS allowlist is **hardcoded** plus `CLIENT_URL` env var:
```javascript
const allowedOrigins = [
  config.clientUrl,          // CLIENT_URL env, default 'http://localhost:5173'
  'http://localhost:5173',   // Vite default — HARDCODED
  'http://localhost:3000',   // CRA default — HARDCODED
  'http://127.0.0.1:5173'    // Vite loopback — HARDCODED
].filter(Boolean);
```

- `credentials: true` — **YES, credentialed requests allowed**
- Methods: `GET POST PUT PATCH DELETE OPTIONS`
- Allowed request headers: `Content-Type`, `Authorization`, `X-Request-Id`, `Idempotency-Key`, `X-Refresh-Token`, `X-User-Role`, `X-User-Id`, `X-User-Email`, `X-User-Institution`, `X-User-Assigned-Institutions`

**To add a new Vite dev origin** (e.g., `http://localhost:5174`): set `CLIENT_URL=http://localhost:5174` in `.env`. Or edit `src/app.js` directly.

**CORS violations** return HTTP 403:
```json
{ "success": false, "error": { "code": "FORBIDDEN", "message": "Cross-Origin Request blocked by security policy." }, "requestId": "..." }
```

### Rate Limits
| Limiter | Routes | Window | Max |
|---|---|---|---|
| **API Limiter** | All `/api/*` | 15 min | 300 req/IP |
| **Auth Limiter** | `/auth/login`, `/auth/verify-login-otp`, `/auth/resend-login-otp`, `/auth/activate-account`, `/auth/refresh` | 15 min | 15 req/IP |

Both return HTTP 429 with `{ "code": "RATE_LIMITED", "message": "..." }`.
Both are **skipped entirely in `NODE_ENV=test`**.

### Body and Upload Limits
- JSON body: **2 MB** (`express.json({ limit: '2mb' })`)
- URL-encoded body: **2 MB**
- CSV file upload (multer on `POST /rosters/upload`): **10 MB**, only `.csv` or `text/csv` MIME type accepted

---

## 2. Auth and RBAC

### Two-Step Login Flow

Login is a **mandatory two-step process**. There is no single-step login path.

#### Step A — `POST /api/v1/auth/login`

**Request:**
```json
{ "email": "user@example.com", "password": "plaintext" }
```

**Success (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "mfaRequired": true,
    "challengeId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "expiresAt": "2026-10-25T11:00:00.000Z",
    "maskedEmail": "us***@example.com"
  },
  "requestId": "req_a1b2c3d4e5f6"
}
```

A 6-digit OTP is sent to the user's email. In dev without a Resend API key, OTP is printed to server console.

**Error codes from Step A:**
| Code | HTTP | Reason |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Missing email or password |
| `UNAUTHENTICATED` | 401 | Wrong credentials |
| `ACCOUNT_DISABLED` | 401 | `isActive=false` |
| `ACCOUNT_NOT_ACTIVATED` | 403 | `isActivated=false` |
| `ACCOUNT_LOCKED` | 429 | 5+ failed attempts; 15-minute lock |

#### Step B — `POST /api/v1/auth/verify-login-otp`

**Request:**
```json
{ "challengeId": "f47ac10b-...", "otp": "123456" }
```

**Success (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "_id": "...", "email": "...", "name": "...", "role": "INSTITUTION_ADMIN",
      "institutionId": "...", "assignedInstitutionIds": [],
      "isActive": true, "isActivated": true, "emailVerified": true,
      "isDemoUser": false, "dataMode": "LIVE",
      "lastLoginAt": "...", "createdAt": "...", "updatedAt": "...",
      "permissions": ["rosters:upload", "rosters:preview", "..."]
    },
    "accessToken": "eyJhbGci...",
    "permissions": ["rosters:upload", "..."]
  },
  "requestId": "..."
}
```

Sets `Set-Cookie: refreshToken=<opaque>; HttpOnly; Path=/api/v1/auth; Max-Age=604800`.

**Error codes from Step B:**
| Code | HTTP | Reason |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Missing challengeId or otp |
| `INVALID_CHALLENGE` | 401 | challengeId not found |
| `CHALLENGE_ALREADY_USED` | 401 | OTP already consumed |
| `OTP_EXPIRED` | 401 | Past 10-min window |
| `OTP_MAX_ATTEMPTS_EXCEEDED` | 429 | 5 failed OTP tries |
| `INVALID_OTP` | 401 | Wrong OTP; `details.attemptsRemaining` included |
| `CHALLENGE_ALREADY_CONSUMED` | 401 | Race condition on atomic consume |

#### Resend OTP — `POST /api/v1/auth/resend-login-otp`

**Request:** `{ "challengeId": "..." }`

**Response (HTTP 200):** `{ "challengeId": "...", "expiresAt": "...", "maskedEmail": "..." }`

Resets `attempts` counter to 0, generates a new OTP, extends `expiresAt`.

#### Account Activation — `POST /api/v1/auth/activate-account`

**Request:** `{ "token": "64-hex-char-token", "password": "min8chars" }`

**Success (HTTP 200):**
```json
{
  "data": {
    "message": "Account successfully activated and password configured. You may now log in.",
    "email": "...", "isActivated": true, "emailVerified": true,
    "user": { "id": "...", "email": "...", "name": "...", "role": "...", "isActivated": true, "emailVerified": true }
  }
}
```

#### Token Refresh — `POST /api/v1/auth/refresh`

Reads from **httpOnly cookie `refreshToken`** OR `X-Refresh-Token` header (cookie wins).

**Success (HTTP 200):** `{ "data": { "accessToken": "eyJ..." } }`

Rotates the refresh token (new cookie set, old revoked). If reuse detected, all sessions in the same family are revoked.

#### Logout — `POST /api/v1/auth/logout`

No JWT required. Reads refresh token from cookie or `X-Refresh-Token`. Revokes entire token family. Clears cookie.

**Response (HTTP 200):** `{ "data": { "message": "Logged out successfully." } }`

#### Current User — `GET /api/v1/auth/me`

Requires `Authorization: Bearer <accessToken>`.

Returns same shape as verify-login-otp (user object + permissions array). Does NOT include `accessToken`.

#### Change Password — `POST /api/v1/auth/change-password`

Requires `Authorization: Bearer <accessToken>`.

**Request:** `{ "currentPassword": "...", "newPassword": "min8chars" }`

**Success (HTTP 200):** `{ "data": { "message": "Password changed successfully. Please log in again." } }`

Increments `tokenVersion` (invalidates all access tokens). Revokes all active refresh tokens. Clears cookie.

### Token Lifetimes and Storage
| Token | Type | Lifetime | Client Storage |
|---|---|---|---|
| **Access Token** | Signed JWT (HS256) | **15 minutes** (hardcoded in `tokenService.js`) | Memory or localStorage |
| **Refresh Token** | Opaque 64-byte hex | **7 days** | `httpOnly` cookie `refreshToken` |

**Cookie attributes:**
- Non-production: `httpOnly=true`, `secure=false`, `sameSite=Lax`, `path=/api/v1/auth`, `maxAge=604800000ms`
- Production: `httpOnly=true`, `secure=true`, `sameSite=Strict`, `path=/api/v1/auth`

> **Critical:** Cookie path is `/api/v1/auth`. The browser only sends it on requests to that path. The frontend must explicitly call `POST /api/v1/auth/refresh` — it cannot piggyback refresh on other endpoint calls.

### Dev/Test Mock Auth Headers

In `NODE_ENV !== 'production'`, setting `X-User-Role` header bypasses JWT entirely:

| Header | Default | Effect |
|---|---|---|
| `X-User-Role` | — | **Presence triggers mock auth** |
| `X-User-Id` | `mock-user-id-1` | Sets `req.user.id` |
| `X-User-Email` | `test@example.gov.in` | Sets `req.user.email` |
| `X-User-Institution` | `null` | Sets `req.user.institutionId` |
| `X-User-Assigned-Institutions` | `""` | Comma-separated institution ObjectIds |

**Enabled by default** in development/test. **Strictly blocked in production.** Useful for testing individual endpoints without going through the full OTP flow.

### RBAC — Roles (exact strings used in code)
```
PLATFORM_ADMIN
AUTHORITY_ADMIN
AUTHORITY_OFFICER
AUDITOR
INSTITUTION_ADMIN
INSTITUTION_OPERATOR
```

### RBAC — Complete Permission-to-Role Map

| Permission String | Roles |
|---|---|
| `users:read` | PLATFORM_ADMIN, AUTHORITY_ADMIN |
| `users:create` | PLATFORM_ADMIN |
| `users:update` | PLATFORM_ADMIN |
| `institutions:read` | ALL 6 roles |
| `rosters:upload` | INSTITUTION_ADMIN, INSTITUTION_OPERATOR |
| `rosters:preview` | ALL 6 roles |
| `rosters:commit` | INSTITUTION_ADMIN only |
| `seat-ledger:read` | ALL 6 roles |
| `seat-intake:declare` | INSTITUTION_ADMIN |
| `seat-intake:approve` | AUTHORITY_ADMIN |
| `seat-rules:update` | AUTHORITY_ADMIN |
| `seat-ledger:audit` | PLATFORM_ADMIN, AUTHORITY_ADMIN, AUDITOR |
| `reconciliation:run` | AUTHORITY_ADMIN, AUTHORITY_OFFICER |
| `reconciliation:read` | ALL 6 roles |
| `findings:review` | AUTHORITY_ADMIN, AUTHORITY_OFFICER |
| `corrections:request` | INSTITUTION_ADMIN |
| `corrections:approve` | AUTHORITY_ADMIN |
| `sampling:read` | ALL 6 roles |
| `sampling:create` | AUTHORITY_ADMIN, AUTHORITY_OFFICER |
| `sampling:review` | AUTHORITY_ADMIN, AUTHORITY_OFFICER |
| `sampling:close` | AUTHORITY_ADMIN |
| `scorecards:read` | ALL 6 roles |
| `scorecards:recalculate` | AUTHORITY_ADMIN, INSTITUTION_ADMIN |
| `scoring-config:update` | AUTHORITY_ADMIN |
| `lifecycle:read` | ALL 6 roles |
| `lifecycle:write` | INSTITUTION_ADMIN, INSTITUTION_OPERATOR |
| `transfers:read` | ALL 6 roles |
| `transfers:create` | INSTITUTION_ADMIN |
| `transfers:confirm-own-side` | INSTITUTION_ADMIN |
| `transfers:process-timeouts` | AUTHORITY_ADMIN, AUTHORITY_OFFICER |
| `overlap:read` | ALL 6 roles |
| `overlap:resolve` | AUTHORITY_ADMIN, AUTHORITY_OFFICER |
| `verification:read` | ALL 6 roles |
| `verification:request` | AUTHORITY_ADMIN, AUTHORITY_OFFICER, INSTITUTION_ADMIN, INSTITUTION_OPERATOR |
| `verification:review` | AUTHORITY_ADMIN, AUTHORITY_OFFICER |
| `roster-versions:read` | ALL 6 roles |
| `roster-versions:verify` | ALL except INSTITUTION_OPERATOR |
| `roster-versions:revalidate` | AUTHORITY_ADMIN, INSTITUTION_ADMIN |
| `audit:read` | ALL except INSTITUTION_OPERATOR |
| `connectors:read` | PLATFORM_ADMIN, AUTHORITY_ADMIN, AUTHORITY_OFFICER, AUDITOR |
| `connectors:configure` | PLATFORM_ADMIN, AUTHORITY_ADMIN |

### AUDITOR Global Read-Only Policy
AUDITOR role: any `POST/PUT/PATCH/DELETE` → HTTP 403 `FORBIDDEN: Auditors are read-only and cannot mutate data.`

**Two exceptions allowed for AUDITOR:**
- `POST /api/v1/roster-versions/:id/verify-seal`
- `POST /api/v1/seat-ledger/verify-integrity`

### Institution Scoping
- `INSTITUTION_ADMIN`/`INSTITUTION_OPERATOR`: Restricted to their own `institutionId`. Sending a different `institutionId` in params/query/body → **HTTP 403**.
- `AUTHORITY_OFFICER`: Restricted to `assignedInstitutionIds[]`. Empty list + `AUTHORITY_OFFICER_GLOBAL_ACCESS=false` → **HTTP 403** for scoped requests.
- `PLATFORM_ADMIN`/`AUTHORITY_ADMIN`/`AUDITOR`: Can query any institution.

**403 vs 404:** The backend returns 403 for scope violations, 404 only when a resource genuinely doesn't exist.

---

## 3. Complete Endpoint Inventory

### Health (no auth)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/health` | status, uptime, DB state |
| GET | `/api/v1/health/live` | Liveness probe |
| GET | `/api/v1/health/ready` | Readiness; 503 if DB down |
| GET | `/` | Platform info |

### Auth (no auth required except where noted)
| Method | Path | Auth | Key Body Fields |
|---|---|---|---|
| POST | `/api/v1/auth/login` | None | `email`*, `password`* |
| POST | `/api/v1/auth/verify-login-otp` | None | `challengeId`*, `otp`* |
| POST | `/api/v1/auth/resend-login-otp` | None | `challengeId`* |
| POST | `/api/v1/auth/activate-account` | None | `token`*, `password`* (≥8 chars) |
| POST | `/api/v1/auth/refresh` | None | Cookie or `X-Refresh-Token` |
| POST | `/api/v1/auth/logout` | None | Cookie or `X-Refresh-Token` |
| GET | `/api/v1/auth/me` | Bearer JWT | — |
| POST | `/api/v1/auth/change-password` | Bearer JWT | `currentPassword`*, `newPassword`* (≥8) |

### Users
| Method | Path | Permission | Key Params |
|---|---|---|---|
| GET | `/api/v1/users` | `users:read` | Query: `role`, `institutionId`, `isActive`, `page`, `limit` |
| POST | `/api/v1/users` | `users:create` | Body: `email`*, `name`*, `role`* (enum), `institutionId` (req for inst roles), `assignedInstitutionIds`, `password` |
| POST | `/api/v1/users/:id/resend-activation` | `users:create` | Path: ObjectId |
| PATCH | `/api/v1/users/:id` | `users:update` | Body: `name`, `role`, `institutionId`, `assignedInstitutionIds`, `isActive` |

### Rosters
| Method | Path | Permission | Key Params |
|---|---|---|---|
| POST | `/api/v1/rosters/upload` | `rosters:upload` | Multipart `file`* (.csv ≤10MB), `academicYear`*, `programmeCode`, `institutionId` |
| GET | `/api/v1/rosters/:id/preview` | (scope) | Query: `page`, `limit` (default 25) |
| POST | `/api/v1/rosters/:id/commit` | `rosters:commit` | Header `Idempotency-Key` or body `idempotencyKey` |
| GET | `/api/v1/rosters/:id` | (scope) | — |

**CSV column names (case-sensitive):** `ApplicationNo`, `Name`, `DOB`, `ProgrammeCode`, `AcademicYear`, `Gender`, `Category`, `AdmissionQuota`, `AdmissionDate`, `ApaarId`

### Roster Versions
| Method | Path | Permission | Key Params |
|---|---|---|---|
| GET | `/api/v1/roster-versions/chain-head` | — | Query: `institutionId`, `academicYear` |
| GET | `/api/v1/roster-versions` | `roster-versions:read` (scope) | Query: `institutionId`, `academicYear`, `page`, `limit` |
| GET | `/api/v1/roster-versions/:id` | — | — |
| GET | `/api/v1/roster-versions/:id/compare` | — | Query: `compareWithId` |
| GET | `/api/v1/roster-versions/:id/impact` | — | — |
| GET | `/api/v1/roster-versions/:id/seal` | — | — |
| GET | `/api/v1/roster-versions/:id/receipt` | — | — |
| POST | `/api/v1/roster-versions/:id/verify-seal` | `roster-versions:verify` | — (AUDITOR allowed) |
| POST | `/api/v1/roster-versions/:id/revalidate` | `roster-versions:revalidate` | — |

### Reconciliations
| Method | Path | Permission | Key Params |
|---|---|---|---|
| POST | `/api/v1/reconciliations` | `reconciliation:run` | Body: `institutionId`*, `academicYear`*, `rosterVersionId`*, `programmeCodes`[], `sources`[]; header `Idempotency-Key` |
| GET | `/api/v1/reconciliations` | `reconciliation:read` (scope) | Query: `institutionId`, `academicYear`, `page`, `limit` |
| GET | `/api/v1/reconciliations/:id` | (scope) | — |
| GET | `/api/v1/reconciliations/:id/findings` | (scope) | Query: `type`, `severity`, `reviewStatus`, `page`, `limit` |
| GET | `/api/v1/reconciliations/:id/summary` | (scope) | — |

### Reconciliation Findings
**Mounted at BOTH `/api/v1/reconciliation-findings` AND `/api/v1/findings` (same handler)**
| Method | Path | Permission | Key Params |
|---|---|---|---|
| GET | `/api/v1/findings/:id` | (scope) | — |
| PATCH | `/api/v1/findings/:id/review` | PLATFORM_ADMIN \| AUTHORITY_ADMIN \| AUTHORITY_OFFICER | Body: `reviewStatus` (enum), `note` |

### Seat Ledger
| Method | Path | Permission | Key Params |
|---|---|---|---|
| GET | `/api/v1/seat-ledger/balances` | `seat-ledger:read` (scope) | Query: `institutionId`, `academicYear`, `programmeCode`, `seatCategory`, `status`, `page`, `limit` |
| GET | `/api/v1/seat-ledger/balances/:id` | `seat-ledger:read` (scope) | — |
| GET | `/api/v1/seat-ledger/balances/:id/entries` | `seat-ledger:read` (scope) | Query: `page`, `limit` |
| GET | `/api/v1/seat-ledger/history` | `seat-ledger:read` (scope) | Query: `bucketKey`, `institutionId`, `from`, `to` |
| POST | `/api/v1/seat-ledger/intake-declarations` | `seat-intake:declare` (scope) | Body: `institutionId`, `programmeCode`*, `academicYear`*, `seatCategory` (default: `GENERAL`), `declaredIntake`* (int ≥0) |
| POST | `/api/v1/seat-ledger/intake/declare` | `seat-intake:declare` (scope) | **Alias for above** |
| PUT | `/api/v1/seat-ledger/intake` | `seat-intake:approve` | Body: `institutionId`*, `programmeCode`*, `academicYear`*, `seatCategory` (default: `ALL`), `approvedIntake`*, `sourceRef`, `verificationStatus`, `sourceMode` |
| GET | `/api/v1/seat-ledger/rules` | `seat-ledger:read` | Query: `ruleVersion`, `activeOnly` |
| POST | `/api/v1/seat-ledger/rules` | `seat-rules:update` | Body: `ruleVersion`*, `name`*, `warningThresholdPct`, `description`, `countingStrategy`, `policySourceRef`, `effectiveFrom` |
| POST | `/api/v1/seat-ledger/verify-integrity` | `seat-ledger:audit` (scope) | Body: `institutionId`, `academicYear`, `programmeCode` |
| GET | `/api/v1/seat-ledger/mass-balance` | `seat-ledger:read` (scope) | Query: `institutionId`*, `programmeCode`*, `academicYear`*, `previousAcademicYear`, `entrants`, `exits`, `retentionRate` |

### Sampling Runs
| Method | Path | Permission | Key Params |
|---|---|---|---|
| POST | `/api/v1/sampling-runs/preview-size` | AUTHORITY_ADMIN \| AUTHORITY_OFFICER \| AUDITOR | Body: sampling params |
| POST | `/api/v1/sampling-runs` | `sampling:create` | Body: `institutionId`*, `rosterVersionId`*, `academicYear`*, `programmeCode`, `seatCategory`, params; header `Idempotency-Key` |
| GET | `/api/v1/sampling-runs` | (scope) | Query: `institutionId`, `academicYear`, `status`, `page`, `limit` |
| GET | `/api/v1/sampling-runs/:id` | (scope) | — |
| GET | `/api/v1/sampling-runs/:id/items` | (scope) | Query: `page`, `limit`, `verificationStatus` |
| POST | `/api/v1/sampling-runs/:id/close` | `sampling:close` | Body: `reason` |
| GET | `/api/v1/sampling-runs/:id/estimate` | (scope) | — |

### Sampling Items
| Method | Path | Permission | Key Params |
|---|---|---|---|
| PATCH | `/api/v1/sampling-items/:id/result` | `sampling:review` | Body: `verificationStatus`*, `verificationMethod` (enum), `evidenceRef`, `notes`, `exclusionReason` |

### Scorecards
| Method | Path | Permission | Key Params |
|---|---|---|---|
| GET | `/api/v1/scorecards/config` | — (any auth) | — |
| POST | `/api/v1/scorecards/config` | `scoring-config:update` | Body: scoring weight config |
| GET | `/api/v1/scorecards/compare` | — (any auth) | Anonymised for institution roles |
| POST | `/api/v1/scorecards/recalculate` | `scorecards:recalculate` | Body: `institutionId`, `reportingPeriod`, `triggerReason` |
| GET | `/api/v1/scorecards/institutions/:institutionId` | `scorecards:read` (scope) | Query: `reportingPeriod`, `configVersion` |
| GET | `/api/v1/scorecards/institutions/:institutionId/metrics` | `scorecards:read` (scope) | — |
| GET | `/api/v1/scorecards/institutions/:institutionId/trend` | `scorecards:read` (scope) | — |
| GET | `/api/v1/scorecards/institutions/:institutionId/history` | `scorecards:read` (scope) | — |

### Lifecycle
| Method | Path | Permission | Key Params |
|---|---|---|---|
| POST | `/api/v1/lifecycle/events` | `lifecycle:write` | Body: `studentTokenId`*, `institutionId`*, `type`* (enum), `effectiveDate`*, `programmeCode`, `academicYear`, `seatCategory`, `reason`, `notes`, `idempotencyKey` |
| GET | `/api/v1/lifecycle/students/:tokenId/events` | `lifecycle:read` | Query: `page`, `limit` |

### Transfers
| Method | Path | Permission | Key Params |
|---|---|---|---|
| POST | `/api/v1/transfers` | `transfers:create` | Body: `studentTokenId`*, `sendingInstitutionId`*, `receivingInstitutionId`*, `programmeCode`*, `academicYear`*, `seatCategory`, `proposedEffectiveDate`*; header `Idempotency-Key` |
| PATCH | `/api/v1/transfers/:id/confirm` | `transfers:confirm-own-side` | Body: `effectiveDate`, `notes`, `reason` |
| PATCH | `/api/v1/transfers/:id/reject` | `transfers:confirm-own-side` | Body: `reason`, `notes` |
| GET | `/api/v1/transfers` | `transfers:read` | Query: `institutionId`, `status`, `page`, `limit` |
| GET | `/api/v1/transfers/:id` | `transfers:read` | — |
| POST | `/api/v1/transfers/process-timeouts` | `transfers:process-timeouts` | No body needed |

### Overlap Cases
| Method | Path | Permission | Key Params |
|---|---|---|---|
| GET | `/api/v1/overlap-cases` | `overlap:read` | Query: `institutionId`, `status`, `page`, `limit` |
| GET | `/api/v1/overlap-cases/:id` | `overlap:read` | — |
| PATCH | `/api/v1/overlap-cases/:id/resolve` | `overlap:resolve` | Body: `code` (resolution code enum)*, `notes` |

### Verifications
| Method | Path | Permission | Key Params |
|---|---|---|---|
| GET | `/api/v1/verifications/by-subject` | — (any auth) | Query: `subjectType`, `subjectId`, `fieldPath`, `institutionId` |
| POST | `/api/v1/verifications/request` | `verification:request` | Body: `institutionId`*, `subjectType`* (enum), `subjectId`*, `fieldPath`*, `valueSnapshot`*, `label`* (enum), `sourceMode`* (enum), `method`* (enum), `sourceRef`, `evidenceRef`, `notes`, `expiresAt`, `idempotencyKey` |
| PATCH | `/api/v1/verifications/:id/review` | `verification:review` | Body: `label`*, `status`*, `evidenceRef`, `notes` |
| GET | `/api/v1/verifications` | `verification:read` | Query: `institutionId`, `status`, `label`, `subjectType`, `page`, `limit` |
| GET | `/api/v1/verifications/connectors/status` | — (any auth) | — |

### Connectors
| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/api/v1/connectors/status` | — (any auth) | Same handler as `/verifications/connectors/status` |

### Audit
| Method | Path | Permission | Key Params |
|---|---|---|---|
| GET | `/api/v1/audit/events` | `audit:read` | Query: `entityType`, `entityId`, `institutionId`, `action`, `from`, `to`, `page`, `limit` |

---

## 4. Global API Conventions

### Success Envelope
```json
{
  "success": true,
  "data": {},
  "requestId": "req_abc123def456",
  "meta": {}
}
```
`meta` is optional; used for pagination in some controllers (not consistent — some put pagination inside `data`).

### Error Envelope
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE_STRING",
    "message": "Human-readable description.",
    "details": {}
  },
  "requestId": "req_abc123def456"
}
```
`details` is optional; present when `sendError` is called with extra fields (e.g., `attemptsRemaining`).

### Standard Error Codes
| Code | HTTP | Source |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Missing/invalid input |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Duplicate or already-committed |
| `UNAUTHENTICATED` | 401 | Missing/invalid/expired token |
| `TOKEN_EXPIRED` | 401 | Access or refresh expired |
| `TOKEN_REVOKED` | 401 | tokenVersion mismatch |
| `TOKEN_REUSE_DETECTED` | 401 | Replay attack detected |
| `ACCOUNT_DISABLED` | 401 | isActive=false |
| `ACCOUNT_NOT_ACTIVATED` | 403 | isActivated=false |
| `ACCOUNT_LOCKED` | 429 | Brute-force lockout |
| `FORBIDDEN` | 403 | Role/permission/scope violation, CORS |
| `RATE_LIMITED` | 429 | Rate limit exceeded |
| `INVALID_ACTIVATION_TOKEN` | 400 | Bad/used activation link |
| `ACTIVATION_TOKEN_EXPIRED` | 400 | Activation link expired |
| `INVALID_CHALLENGE` | 401 | OTP challengeId not found |
| `CHALLENGE_ALREADY_USED` | 401 | OTP already consumed |
| `OTP_EXPIRED` | 401 | Past 10-min window |
| `INVALID_OTP` | 401 | Wrong OTP; `details.attemptsRemaining` |
| `OTP_MAX_ATTEMPTS_EXCEEDED` | 429 | 5 failures |
| `CHALLENGE_ALREADY_CONSUMED` | 401 | Race condition |
| `ALREADY_ACTIVATED` | 400 | Resend to already-active user |
| `SOLE_ADMIN_PROTECTION` | 400 | Cannot demote last PLATFORM_ADMIN |
| `INTERNAL_ERROR` | 500 | Unhandled server error |
| `REQUEST_ERROR` | 4xx | Generic client error |
| `SERVICE_UNAVAILABLE` | 503 | DB disconnected |

### Pagination
Most list endpoints: `?page=1&limit=25`. Response shape:
```json
"pagination": { "page": 1, "limit": 25, "total": 100, "totalPages": 4 }
```
Some controllers place `pagination` inside `data`, some in `meta`. Check individual endpoint responses.

### Idempotency-Key
- Header: `Idempotency-Key: <uuid>` (case-insensitive in code)
- Body fallback: `idempotencyKey` field
- On replay: HTTP 200, `data.isReplay: true`
- Supported endpoints: `POST /rosters/:id/commit`, `POST /seat-ledger/intake-declarations`, `POST /sampling-runs`, `POST /transfers`, `POST /lifecycle/events`, `POST /verifications/request`, `PUT /seat-ledger/intake`

### Request ID Header
- Incoming: `X-Request-Id` (frontend can set its own trace ID)
- Outgoing: `X-Request-Id` response header always echoed
- Body: `requestId` field always present
- Format when server-generated: `req_` + 12 hex chars

---

## 5. Data Models

### User (`users`)
| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | — |
| `email` | String | unique, lowercase, indexed |
| `passwordHash` | String | `select:false` — never in responses |
| `name` | String | max 120 chars |
| `role` | String | 6-value enum, indexed |
| `institutionId` | ObjectId → Institution | nullable |
| `assignedInstitutionIds` | [ObjectId] | for AUTHORITY_OFFICER scope |
| `isActive` | Boolean | default `true` |
| `isActivated` | Boolean | default `false` |
| `emailVerified` | Boolean | default `false` |
| `activationTokenHash` | String | `select:false` |
| `activationTokenExpiresAt` | Date | `select:false` |
| `activationTokenSentAt` | Date | visible |
| `activatedAt` | Date | nullable |
| `isDemoUser` | Boolean | default `false` |
| `dataMode` | String | `DEMO` \| `LIVE` |
| `tokenVersion` | Number | increments on password/role/scope change |
| `failedLoginAttempts` | Number | — |
| `lockUntil` | Date | nullable |
| `lastLoginAt` | Date | nullable |
| `createdAt`, `updatedAt` | Date | auto |

**Always stripped from toJSON/toObject:** `passwordHash`, `activationTokenHash`, `activationTokenExpiresAt`, `__v`

### Institution (`institutions`)
| Field | Type | Enum |
|---|---|---|
| `code` | String | unique, uppercase |
| `name` | String | — |
| `type` | String | `ENGINEERING \| MANAGEMENT \| PHARMACY \| POLYTECHNIC \| ARCHITECTURE \| OTHER` |
| `state` | String | — |
| `status` | String | `ACTIVE \| INACTIVE` |
| `dataMode` | String | `DEMO \| LIVE` |

### Programme (`programmes`)
| Field | Type | Notes |
|---|---|---|
| `institutionId` | ObjectId → Institution | — |
| `code` | String | uppercase; unique per institution |
| `name` | String | — |
| `durationYears` | Number | default 4 |
| `intakeByYear` | [IntakeRecord] | embedded array |

**IntakeRecord sub-fields:** `academicYear`, `seatCategory`, `approvedIntake`, `label` (10-value enum), `sourceMode` (`LIVE \| SIMULATED \| DECLARED \| INSTITUTION_DECLARED`), `sourceRef`

### LoginOtpChallenge (`loginotpchallenges`)
- `challengeId` (String UUID, unique)
- `userId` (ObjectId → User)
- `email`, `otpHash` (`select:false`)
- `expiresAt` (Date; **MongoDB TTL index** — documents auto-deleted at expiry)
- `attempts`, `maxAttempts`, `isConsumed`, `consumedAt`, `ipAddress`, `userAgent`

### RefreshToken (`refreshtokens`)
- `tokenHash` (String, unique), `userId`, `familyId` (UUID groups rotation chain)
- `expiresAt`, `isRevoked`, `revokedAt`
- `revokedReason`: `LOGOUT \| ROTATED \| REUSE_DETECTED \| EXPIRED \| PASSWORD_CHANGE \| ACCOUNT_DISABLED`
- `userAgent`, `ipAddress`

### RosterUpload (`rosteruploads`)
- `institutionId`, `academicYear`, `programmeCode`, `sourceMode` (`INSTITUTION_REPORTED \| SIMULATED`)
- `filename`, `fileSha256`, `rowCount`
- `status`: `UPLOADED \| VALIDATED \| COMMITTED \| REJECTED`
- `validation`: `{errors, warnings, ruleVersion, rowErrors: [{rowNumber, applicationNo, issues: [{field, issue}]}]}`
- `uploadedBy`: `{userId, role, email}`, `committedVersionId`

### RosterVersion (`rosterversions`)
- `institutionId`, `academicYear`, `versionNumber`, `status` (`COMMITTED \| SUPERSEDED`)
- `uploadId`, `fileSha256`, `rowCount`, `committedBy`, `committedAt`
- **Unique index:** `{institutionId, academicYear, versionNumber}`

### RosterRow (`rosterrows`)
- `rosterUploadId`, `rosterVersionId` (nullable until committed)
- `rowKey` (deterministic hash), `applicationNo`, `apaarToken` (HMAC pseudonymised), `apaarLast4`
- `name`, `normalisedName`, `dob` (YYYY-MM-DD), `gender` (`MALE\|FEMALE\|OTHER`), `category`
- `programmeCode`, `academicYear`, `admissionQuota`, `admissionDate`
- `validationStatus` (`VALID\|INVALID`), `validationErrors: [{field, issue}]`

### ReconciliationRun (`reconciliationruns`)
- `runId` (String, unique), `institutionId`, `academicYear`, `rosterVersionId`
- `programmeCodes[]`, `sources[]` (`ROSTER\|ADMISSION\|ALLOTMENT\|EXAM\|INTAKE\|SCHOLARSHIP`)
- `sourceModes` (Map), `ruleVersion`
- `status`: `RUNNING \| COMPLETED \| FAILED`
- `summary`: 10 numeric counters (confirmed3Way, unmatched, conflicts, etc.)
- `freshness`: `FRESH \| STALE \| UNKNOWN`; `revalidationStatus`: 6-value enum
- `idempotencyKey`

### ReconciliationFinding (`reconciliationfindings`)
- `runId`, `institutionId`
- `type`: 10-value enum (CONFIRMED_3WAY, UNMATCHED, CONFLICT, etc.)
- `severity`: `INFO \| LOW \| MEDIUM \| HIGH \| CRITICAL`
- `recordRef`: `{rowKey, applicationNo, apaarTokenMasked, studentNameMasked, programmeCode, category}`
- `sourceRefs[]`, `fieldDiffs[]`, `matchConfidence` (`STRONG\|MODERATE\|WEAK`)
- `reviewStatus`: `PENDING \| CONFIRMED \| DISMISSED \| CLARIFICATION_REQUESTED \| RESOLVED`
- `reviewHistory[]`, `explanation: {expected, observed, sourcesCompared, ruleApplied, nextAction}`

### SeatBalance (`seatbalances`)
- `bucketKey` (String, unique — composite), `institutionId`, `programmeId`, `programmeCode`, `academicYear`, `seatCategory`
- `approvedIntake`, `reportedOccupancy`, `headroom`, `utilisationPct`, `warningThresholdPct` (default 90)
- `intakeSourceMode`: `SIMULATED \| INSTITUTION_DECLARED \| LIVE`
- `intakeVerificationStatus`: 9-value enum (see Section 6)
- `status`: `OK \| WARNING \| OVER_CAP_DISCREPANCY \| INTAKE_UNVERIFIED \| NO_INTAKE_CONFIGURED`
- `freshness`: `FRESH \| STALE \| UNKNOWN`; `staleReason`; `staleSinceVersionId`

### SeatLedgerEntry (`seatledgerentries`)
- `bucketKey`, `institutionId`, `programmeId`, `programmeCode`, `academicYear`, `seatCategory`
- `type`: 9-value enum (INTAKE_SET, ADMISSION, WITHDRAWAL, TRANSFER_OUT, etc.)
- `delta` (Number), `intakeDelta` (Number)
- `balanceAfter`: `{approvedIntake, reportedOccupancy, headroom, utilisationPct}`
- `effectiveDate`, `sourceReference`, `sourceMode` (`INSTITUTION_REPORTED\|INSTITUTION_DECLARED\|SIMULATED\|LIVE`)
- `actor: {userId, role, email}`, `reason`, `idempotencyKey` (unique partial index)

### SamplingRun (`samplingruns`)
- `runId` (unique), `institutionId`, `rosterVersionId`, `academicYear`, `programmeCode`, `seatCategory`
- `eligiblePopulationSize`, `sampleSize`, `targetedSampleSize`, `totalSampleSize`
- `samplingParameters`: `{confidenceLevel, marginOfError, expectedProportion, minSampleSize, maxSampleSize, ...}`
- `selectionHash`, `algorithmVersion` (default `crypto-fisher-yates@1`)
- `status`: `ACTIVE \| CLOSED`
- `summary`: `{total, pending, verified, failedCheck, unconfirmed, excluded, responseRate}`
- `freshness`, `revalidationStatus` (default `BLOCKED` for completed runs)
- `closedBy: {userId, role, email, closedAt, reason}`, `idempotencyKey`

### SamplingItem (`samplingitems`)
- `samplingRunId`, `institutionId`, `rosterRowId`, `rowKey`
- `stratum`: `RANDOM \| RISK_TARGETED`
- `applicationNo`, `apaarToken`, `apaarLast4`, `studentNameMasked`, `dob`, `gender`, `category`, `programmeCode`, `academicYear`
- `verificationStatus`: `PENDING \| VERIFIED \| FAILED_CHECK \| UNCONFIRMED \| EXCLUDED`
- `verificationMethod`: 6-value enum + null
- `evidenceRef`, `notes`, `exclusionReason`
- `verifiedBy: {userId, role, email}`, `verifiedAt`
- `history[]`: append-only status change log

### ScoreSnapshot (`scoresnapshots`)
- `institutionId`, `reportingPeriod`, `institutionType`, `programmeCode`
- `overallScore` (Number; **null** when INSUFFICIENT_DATA, never 0), `band` (5-value enum)
- `isEligibleForScore`, `ineligibleReason`, `inScopeRecordCount`, `unresolvedCount`
- `metrics.m1Completeness`, `m2Discrepancies`, `m3Timeliness`, `m4Corrections` (each with `status`, `subScore`, `weightConfigured`, `weightUsed`, metric-specific fields)
- `dataCoverage: {coveragePct, expectedSources, availableSources, missingSources, sourceModes, sourceFreshness}`
- `triggerReason` (6-value enum), `freshness`, `revalidationStatus`
- `supportSuggestions[]`, `disclaimer` (mandatory string constant)
- `configVersion`, `scoringParameters`, `calculatedAt`

### TransferCase (`transfercases`)
- `studentTokenId`, `keyVersion` (default `v1`), `studentRef`
- `sendingInstitutionId`, `receivingInstitutionId`, `programmeCode`, `academicYear`, `seatCategory`
- `proposedEffectiveDate`, `deadline`
- `sendingConfirmation`, `receivingConfirmation`: `{status: PENDING|CONFIRMED|REJECTED, confirmedAt, effectiveDate, confirmedBy, reason, notes}`
- `status`: `PENDING \| TRANSFER_CONFIRMED \| TRANSFER_REJECTED \| NEEDS_REVIEW`
- `dateGapDays`, `ledgerSynced`, `ledgerEntries[]`, `history[]`, `idempotencyKey`

### OverlapCase (`overlapcases`)
- `caseId` (String, unique), `studentTokenId`, `keyVersion`
- `institutions[]`: `{institutionId, programmeCode, academicYear, enrollmentInterval: {startDate, endDate}}`
- `overlapInterval: {startDate, endDate, overlapDays}`
- `caseType`: `OVERLAP \| OVERLAP_REVIEW`
- `status`: `OPEN \| IN_REVIEW \| RESOLVED`; `severity`: `INFO \| WARNING`
- `policySourceRef`, `policyVerified`, `explanation`
- `resolution: {code, notes, resolvedBy, resolvedAt}`, `resolutionHistory[]`

### VerificationRecord (`verificationrecords`)
- `subjectType`: `PROGRAMME_INTAKE \| ROSTER_RECORD \| INSTITUTION_METADATA \| STUDENT_LIFECYCLE \| SEAT_BALANCE`
- `subjectId`, `fieldPath`, `institutionId`, `valueSnapshot`
- `label`: 7-value enum; `sourceMode`: `LIVE \| SIMULATED \| INSTITUTION_DECLARED`
- `method`: `CONNECTOR_API \| MANUAL_OFFICER \| DOCUMENT_REVIEW \| CROSS_REGISTER`
- `status`: `PENDING \| COMPLETED \| CONFLICT \| UNABLE_TO_VERIFY \| EXPIRED \| SUPERSEDED`
- `connectorId`, `ruleOrSourceVersion`, `evidenceRef`, `notes`
- `reviewer`, `requestedAt`, `verifiedAt`, `expiresAt`, `supersedesVerificationId`
- `history[]`, `freshness`, `idempotencyKey`

### StudentLifecycleEvent (`studentlifecycleevents`)
- `studentTokenId`, `keyVersion` (default `v1`), `institutionId`
- `type`: 9-value enum (ADMITTED, ENROLLED, WITHDRAWN, etc.)
- `effectiveDate`, `reportedAt`, `sourceRef`
- `status`: `VALID \| SUPERSEDED`; `supersedesEventId`
- `programmeCode`, `academicYear`, `seatCategory`, `notes`, `actor`, `idempotencyKey`

### AuditEvent (`auditevents`)
- `action` (free-form String)
- `entityType`, `entityId` (Mixed), `institutionId` (nullable)
- `performedBy: {userId, role, email}`, `details` (Mixed)
- `createdAt` only (no updatedAt)

**Known action strings (from controllers):**
`LOGIN_SUCCESS`, `LOGIN_FAILED`, `LOGIN_OTP_CHALLENGE_ISSUED`, `LOGIN_OTP_FAILED`, `LOGIN_OTP_RESENT`, `LOGOUT_SUCCESS`, `ACCOUNT_ACTIVATED`, `USER_CREATED`, `USER_UPDATED`, `USER_ACTIVATION_RESENT`, `PASSWORD_CHANGED`, `PASSWORD_CHANGE_FAILED`, `TOKEN_REFRESHED`, `TOKEN_REUSE_DETECTED`

---

## 6. Enums and Constants the UI Must Know

### Roles
```
PLATFORM_ADMIN | AUTHORITY_ADMIN | AUTHORITY_OFFICER | AUDITOR | INSTITUTION_ADMIN | INSTITUTION_OPERATOR
```

### Institution Types
```
ENGINEERING | MANAGEMENT | PHARMACY | POLYTECHNIC | ARCHITECTURE | OTHER
```

### Reconciliation Finding Types
```
CONFIRMED_3WAY | CONFIRMED_PARTIAL | UNMATCHED | CONFLICT | CANDIDATE_REVIEW |
DUPLICATE_CANDIDATE | MISSING_FROM_ROSTER | COUNT_MISMATCH | SOURCE_UNAVAILABLE | STALE_SOURCE
```

### Finding/Item Severities
```
INFO | LOW | MEDIUM | HIGH | CRITICAL
```

### Finding Review Statuses
```
PENDING | CONFIRMED | DISMISSED | CLARIFICATION_REQUESTED | RESOLVED
```

### Reconciliation Sources
```
ROSTER | ADMISSION | ALLOTMENT | EXAM | INTAKE | SCHOLARSHIP
```

### Roster Upload Status
```
UPLOADED | VALIDATED | COMMITTED | REJECTED
```

### Roster Version Status
```
COMMITTED | SUPERSEDED
```

### Seat Balance Status
```
OK | WARNING | OVER_CAP_DISCREPANCY | INTAKE_UNVERIFIED | NO_INTAKE_CONFIGURED
```

### Intake Verification Status
```
NO_INTAKE_CONFIGURED | INTAKE_UNVERIFIED | INSTITUTION_DECLARED | DOCUMENT_SUPPORTED |
CROSS_REGISTER_CONFIRMED | AUTHORITY_VERIFIED | AUTHORITY_VERIFIED_SIMULATED |
VERIFICATION_PENDING | UNABLE_TO_VERIFY
```

### Seat Ledger Entry Types
```
INTAKE_SET | INTAKE_REVISED | ROSTER_SYNC_ADJUSTMENT | ADMISSION | WITHDRAWAL |
TRANSFER_OUT | TRANSFER_IN | COMPLETION | CORRECTION_REVERSAL
```

### Intake Source Mode
```
SIMULATED | INSTITUTION_DECLARED | LIVE
```

### Sampling Item Verification Status
```
PENDING | VERIFIED | FAILED_CHECK | UNCONFIRMED | EXCLUDED
```

### Sampling Item Verification Method
```
DOCUMENT_INSPECTION | CROSS_REGISTER_MATCH | DIRECT_CONTACT_CALL |
INSTITUTIONAL_AFFIDAVIT | REGULATORY_ORDER | OTHER
```

### Sampling Run Status
```
ACTIVE | CLOSED
```

### Score Band
```
STRONG | ADEQUATE | NEEDS_SUPPORT | PRIORITY_SUPPORT | INSUFFICIENT_DATA
```

### Score Trigger Reason
```
INITIAL_CALCULATION | MANUAL_RECALCULATE | SCHEDULED | ROSTER_COMMITTED |
DISCREPANCY_RESOLVED | CORRECTION_LOGGED
```

### Metric Status
```
AVAILABLE | INSUFFICIENT_DATA | UNAVAILABLE
```

### Transfer Status
```
PENDING | TRANSFER_CONFIRMED | TRANSFER_REJECTED | NEEDS_REVIEW
```

### Transfer Confirmation (per-side)
```
PENDING | CONFIRMED | REJECTED
```

### Overlap Status
```
OPEN | IN_REVIEW | RESOLVED
```

### Overlap Resolution Codes
```
LEGITIMATE_TRANSFER | DATA_ENTRY_ERROR_CORRECTED | PERMITTED_PARALLEL |
REFERRED_FOR_POLICY_REVIEW | NO_ACTION
```

### Overlap Severity / Case Type
```
Severity: INFO | WARNING
CaseType: OVERLAP | OVERLAP_REVIEW
```

### Verification Labels
```
INSTITUTION_DECLARED | DOCUMENT_SUPPORTED | CROSS_REGISTER_CONFIRMED |
AUTHORITY_VERIFIED | AUTHORITY_VERIFIED_SIMULATED | VERIFICATION_PENDING | UNABLE_TO_VERIFY
```

### Verification Methods
```
CONNECTOR_API | MANUAL_OFFICER | DOCUMENT_REVIEW | CROSS_REGISTER
```

### Verification Statuses
```
PENDING | COMPLETED | CONFLICT | UNABLE_TO_VERIFY | EXPIRED | SUPERSEDED
```

### Verification Subject Types
```
PROGRAMME_INTAKE | ROSTER_RECORD | INSTITUTION_METADATA | STUDENT_LIFECYCLE | SEAT_BALANCE
```

### Lifecycle Event Types
```
ADMITTED | ENROLLED | TRANSFER_OUT_REQUESTED | TRANSFER_OUT_CONFIRMED |
TRANSFER_IN_REQUESTED | TRANSFER_IN_CONFIRMED | WITHDRAWN | COMPLETED | CORRECTED
```

### Lifecycle Event Status
```
VALID | SUPERSEDED
```

### Freshness / Revalidation (cross-model)
```
Freshness: FRESH | STALE | UNKNOWN
RevalidationStatus: NOT_STARTED | QUEUED | REVALIDATING | REVALIDATED | NOT_APPLICABLE | BLOCKED
```

### User Data Mode
```
DEMO | LIVE
```

### Demo-Only Seat Categories and Quotas (seeded data)
```
Seat Categories: GENERAL | RESERVED_A | RESERVED_B | SPECIAL_DEMO
Admission Quotas: STATE_MERIT | MANAGEMENT | NRI_DEMO | ALL_INDIA
```

---

## 7. Seed and Demo Data

### How Seeding Works
**Script:** `npm run seed:demo` → `src/scripts/seedDemoData.js`

**Safety guards:**
1. **Blocked** if `NODE_ENV === 'production'`
2. **Requires** `DEMO_SEED_ENABLED=true` in `.env`
3. **Requires** `DEMO_SEED_PASSWORD` (min 8 chars) — this becomes the shared login password for ALL demo users
4. **Idempotent:** safe to re-run; will update existing demo entities, not duplicate them
5. Only cleans prior demo data when `--clean` flag passed: `node src/scripts/seedDemoData.js --clean`

**Minimum .env for seeding:**
```env
NODE_ENV=development
MONGODB_URI=mongodb://...
DEMO_SEED_ENABLED=true
DEMO_SEED_PASSWORD=SecureDemo2026!
APAAR_TOKEN_SECRET=any-32-char-random-string-here
```

### Seeded Institutions
| Code | Name | Type | State |
|---|---|---|---|
| `SIT-DEMO-01` | Apex Institute of Technology (Demo) | ENGINEERING | Maharashtra |
| `SIT-DEMO-02` | Beacon National Engineering College (Demo) | ENGINEERING | Karnataka |
| `SIT-DEMO-03` | Crestview School of Management (Demo) | MANAGEMENT | Delhi |
| `SIT-DEMO-04` | Delta Technical Institute (Demo) | POLYTECHNIC | Tamil Nadu |
| `SIT-DEMO-05` | Everest Institute of Technology (Demo) | ENGINEERING | Telangana |
| `SIT-DEMO-TINY` | Horizon Micro Institute (Demo Tiny) | POLYTECHNIC | Goa |

### Seeded Programmes
| Institution Code | Programme Codes | Intake Per Year |
|---|---|---|
| SIT-DEMO-01 | `BTECH-CSE`, `BTECH-ECE`, `BTECH-MECH` | 60 each |
| SIT-DEMO-02 | `BTECH-CSE`, `BTECH-IT`, `BTECH-EE` | 60 each |
| SIT-DEMO-03 | `MBA-FIN`, `MBA-HR`, `MBA-OPS` | 60 each |
| SIT-DEMO-04 | `DIPLOMA-CS`, `DIPLOMA-MECH`, `DIPLOMA-CIVIL` | 60 each |
| SIT-DEMO-05 | `BTECH-CSE`, `BTECH-AI`, `BTECH-DS` | 60 each |
| SIT-DEMO-TINY | `DIPLOMA-CS`, `DIPLOMA-IT` | 20 each |

Academic years seeded: `2024-25` and `2023-24`.

### Seeded Demo User Accounts
All passwords = value of `DEMO_SEED_PASSWORD`. All are `isActivated: true, emailVerified: true`.

| Email | Role | Scoped To |
|---|---|---|
| `platform-admin@example.test` | PLATFORM_ADMIN | Global |
| `authority-admin@example.test` | AUTHORITY_ADMIN | Global |
| `authority-officer@example.test` | AUTHORITY_OFFICER | SIT-DEMO-01, SIT-DEMO-02 only |
| `auditor@example.test` | AUDITOR | Global (read-only) |
| `inst-admin-01@example.test` | INSTITUTION_ADMIN | SIT-DEMO-01 |
| `inst-operator-01@example.test` | INSTITUTION_OPERATOR | SIT-DEMO-01 |
| `inst-admin-02@example.test` | INSTITUTION_ADMIN | SIT-DEMO-02 |

### OTP in Development
When `RESEND_API_KEY` is not set, the `emailService.js` uses a mock adapter that **logs the OTP to the server console** instead of sending email. Watch the terminal after `POST /api/v1/auth/login`.

### How to Get Institution IDs After Seeding
There is no `GET /institutions` endpoint. Get institution IDs by:
1. Login as `platform-admin@example.test` → `GET /api/v1/users?role=INSTITUTION_ADMIN` → extract `institutionId` fields
2. For institution users, `GET /api/v1/auth/me` returns their own `institutionId`
3. Or look up via MongoDB directly: `db.institutions.find({dataMode: 'DEMO'})`

### Tamper/Restore Flow
```bash
npm run demo:tamper   # Modifies seeded roster data → seal verification now fails
npm run demo:restore  # Restores original data → seal verification passes again
```
Use this to demonstrate the cryptographic integrity verification feature in the UI.

---

## 8. Ready-to-Use Sample Payloads

> All payloads `[inferred]` from code. Not verified by running the server (requires MongoDB connection and seed data).

### Login Step A
```json
// POST /api/v1/auth/login
// Request:
{ "email": "inst-admin-01@example.test", "password": "SecureDemo2026!" }

// Response 200:
{
  "success": true,
  "data": {
    "mfaRequired": true,
    "challengeId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "expiresAt": "2026-10-25T06:10:00.000Z",
    "maskedEmail": "in***@example.test"
  },
  "requestId": "req_a1b2c3d4e5f6"
}
```

### Login Step B (full session establishment)
```json
// POST /api/v1/auth/verify-login-otp
// Request:
{ "challengeId": "f47ac10b-58cc-4372-a567-0e02b2c3d479", "otp": "847293" }

// Response 200 + Set-Cookie: refreshToken=...; HttpOnly; Path=/api/v1/auth
{
  "success": true,
  "data": {
    "user": {
      "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
      "email": "inst-admin-01@example.test",
      "name": "Apex Institute Administrator (Demo)",
      "role": "INSTITUTION_ADMIN",
      "institutionId": "64f1a2b3c4d5e6f7a8b9c0d2",
      "assignedInstitutionIds": [],
      "isActive": true, "isActivated": true, "emailVerified": true,
      "isDemoUser": true, "dataMode": "DEMO",
      "lastLoginAt": "2026-10-25T06:00:00.000Z",
      "createdAt": "2026-10-01T00:00:00.000Z",
      "updatedAt": "2026-10-25T06:00:00.000Z",
      "permissions": [
        "institutions:read", "rosters:upload", "rosters:preview", "rosters:commit",
        "seat-ledger:read", "seat-intake:declare", "reconciliation:read",
        "findings:review", "corrections:request", "sampling:read",
        "scorecards:read", "scorecards:recalculate", "lifecycle:read",
        "lifecycle:write", "transfers:read", "transfers:create",
        "transfers:confirm-own-side", "overlap:read", "verification:read",
        "verification:request", "roster-versions:read", "roster-versions:verify",
        "roster-versions:revalidate", "audit:read"
      ]
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2NGYxYTJiM...",
    "permissions": ["institutions:read", "rosters:upload", "..."]
  },
  "requestId": "req_b2c3d4e5f6a7"
}
```

### Seat Ledger Balances List
```json
// GET /api/v1/seat-ledger/balances?institutionId=64f1...d2&academicYear=2024-25
{
  "success": true,
  "data": {
    "items": [
      {
        "_id": "64f1...e1",
        "bucketKey": "64f1...d2_BTECH-CSE_2024-25_GENERAL",
        "institutionId": "64f1...d2",
        "programmeCode": "BTECH-CSE",
        "academicYear": "2024-25",
        "seatCategory": "GENERAL",
        "approvedIntake": 60,
        "reportedOccupancy": 58,
        "headroom": 2,
        "utilisationPct": 96.67,
        "status": "WARNING",
        "intakeVerificationStatus": "AUTHORITY_VERIFIED_SIMULATED",
        "intakeSourceMode": "SIMULATED",
        "freshness": "FRESH",
        "warningThresholdPct": 90,
        "flags": [],
        "createdAt": "...", "updatedAt": "..."
      }
    ],
    "pagination": { "page": 1, "limit": 25, "total": 12, "totalPages": 1 }
  }
}
```

### Scorecard
```json
// GET /api/v1/scorecards/institutions/64f1...d2?reportingPeriod=2024-25
{
  "success": true,
  "data": {
    "_id": "64f1...f1",
    "institutionId": "64f1...d2",
    "reportingPeriod": "2024-25",
    "overallScore": 74.5,
    "band": "ADEQUATE",
    "isEligibleForScore": true,
    "inScopeRecordCount": 520,
    "metrics": {
      "m1Completeness": { "status": "AVAILABLE", "completenessPct": 95.2, "subScore": 87, "weightUsed": 0.40 },
      "m2Discrepancies": { "status": "AVAILABLE", "openDiscrepancies": 3, "unresolvedRatePer1000": 5.77, "subScore": 68, "weightUsed": 0.30 },
      "m3Timeliness": { "status": "AVAILABLE", "medianLagDays": 2.5, "onTimePct": 82.1, "subScore": 65, "weightUsed": 0.30 },
      "m4Corrections": { "status": "UNAVAILABLE", "enabledInScore": false, "subScore": null, "weightUsed": null }
    },
    "freshness": "FRESH",
    "disclaimer": "The Institutional Data Reliability Scorecard measures the reliability and completeness of reported data and helps identify support needs. It is not a misconduct verdict or a measure of overall institutional quality.",
    "supportSuggestions": [],
    "calculatedAt": "2026-10-25T05:00:00.000Z",
    "triggerReason": "ROSTER_COMMITTED"
  }
}
```

### Reconciliation Run (trigger)
```json
// POST /api/v1/reconciliations
// Idempotency-Key: rec-sit01-2024-001
{
  "institutionId": "64f1...d2",
  "academicYear": "2024-25",
  "rosterVersionId": "64f1...v2",
  "programmeCodes": ["BTECH-CSE"],
  "sources": ["ROSTER", "ADMISSION", "EXAM"]
}

// Response 201:
{
  "success": true,
  "data": {
    "runId": "REC-SIT-DEMO-01-2024-25-001",
    "status": "COMPLETED",
    "summary": {
      "rosterRecords": 180, "confirmed3Way": 150, "confirmedPartial": 12,
      "unmatched": 8, "conflicts": 5, "candidateReview": 3,
      "sourceUnavailable": 2, "duplicateCandidates": 0, "missingFromRoster": 0, "countMismatches": 0
    }
  }
}
```

### Findings List
```json
// GET /api/v1/reconciliations/REC-.../findings?type=UNMATCHED&reviewStatus=PENDING
{
  "success": true,
  "data": {
    "findings": [
      {
        "_id": "64f1...g1",
        "runId": "REC-SIT-DEMO-01-2024-25-001",
        "type": "UNMATCHED",
        "severity": "HIGH",
        "reviewStatus": "PENDING",
        "recordRef": {
          "rowKey": "sha256abc...",
          "applicationNo": "APP-2024-000042",
          "apaarTokenMasked": "****1234",
          "studentNameMasked": "An*** Sh***",
          "programmeCode": "BTECH-CSE",
          "category": "GENERAL"
        },
        "explanation": {
          "expected": "Student should appear in APAAR registry or admission database",
          "observed": "No matching record found in compared sources",
          "sourcesCompared": ["ROSTER", "ADMISSION"],
          "nextAction": "Request institution to provide supporting documentation"
        }
      }
    ],
    "pagination": { "page": 1, "limit": 25, "total": 8, "totalPages": 1 }
  }
}
```

### Transfer Create
```json
// POST /api/v1/transfers
// Idempotency-Key: tr-s1-r2-student-001
{
  "studentTokenId": "hmac-sha256-token-abc123",
  "sendingInstitutionId": "64f1...d2",
  "receivingInstitutionId": "64f2...e3",
  "programmeCode": "BTECH-CSE",
  "academicYear": "2024-25",
  "seatCategory": "GENERAL",
  "proposedEffectiveDate": "2026-11-01T00:00:00.000Z"
}

// Response 201:
{
  "success": true,
  "data": {
    "_id": "64f1...t1",
    "status": "PENDING",
    "sendingConfirmation": { "status": "PENDING" },
    "receivingConfirmation": { "status": "PENDING" },
    "deadline": "2026-11-15T00:00:00.000Z",
    "ledgerSynced": false,
    "createdAt": "2026-10-25T06:00:00.000Z"
  }
}
```

### Roster Upload (multipart)
```
// POST /api/v1/rosters/upload
// Content-Type: multipart/form-data
// Authorization: Bearer <token>
//
// Fields:
//   file: <csv file>
//   academicYear: "2024-25"
//   programmeCode: "BTECH-CSE"    (optional)
//   institutionId: "64f1...d2"    (only if not institution-scoped user)

// Response 201:
{
  "success": true,
  "data": {
    "id": "64f1...u1",
    "filename": "roster_2024_25.csv",
    "fileSha256": "abc123...",
    "academicYear": "2024-25",
    "rowCount": 45,
    "status": "VALIDATED",
    "validation": {
      "errors": 0,
      "warnings": 0,
      "ruleVersion": "roster-val@1",
      "rowErrors": []
    }
  }
}
```

---

## 9. Gaps and Risks for the Frontend

### Critical Missing Endpoints (Backend Changes Required)

| Missing | Impact | Workaround |
|---|---|---|
| `GET /api/v1/institutions` | **Critical.** Cannot list institutions for selectors, dropdowns, institution switcher | Login as admin → `GET /users?role=INSTITUTION_ADMIN` → extract `institutionId`; or hardcode seeded codes |
| `GET /api/v1/institutions/:id` | Cannot look up institution name/type by ID | None (must join from user data) |
| `GET /api/v1/programmes` | Cannot list programmes for an institution | None (must be known from seed data) |
| `GET /api/v1/programmes/:id` | Cannot fetch single programme detail | None |
| `GET /api/v1/users/:id` | Cannot fetch single user | Use `GET /users?` list and filter |
| Dashboard summary endpoint | No aggregated summary; must fire 6-10 calls | Build aggregate calls on frontend |
| Global findings list | No `GET /findings` across all runs | Must enumerate runs first, then fetch findings per run |

### Dual Mount Points
- `findingRoutes` mounted at both `/api/v1/reconciliation-findings` AND `/api/v1/findings` → use `/findings` (canonical per code comments)
- `handleGetConnectorsStatus` mounted at both `/api/v1/verifications/connectors/status` AND `/api/v1/connectors/status`

### Two-Step Login UX
Frontend must implement a two-screen/two-state login:
1. Email + password form → POST /login → save `challengeId` in state → show OTP input
2. OTP form → POST /verify-login-otp with saved `challengeId` → store `accessToken`

Do not navigate away between steps (challengeId must be preserved).

### Access Token Refresh Strategy
15-minute access token expiry requires proactive refresh. The refresh cookie is scoped to `path=/api/v1/auth` and is NOT sent on API requests to other paths. The frontend must:
1. Track token expiry (decode JWT to read `exp`)
2. Call `POST /api/v1/auth/refresh` before the access token expires
3. On 401 `TOKEN_EXPIRED`, refresh and retry the failed request

### OTP Dev Mode
Without `RESEND_API_KEY`, OTPs are only printed to server console. Frontend developers must watch the terminal. Consider adding a toast or console note in dev mode.

### AUDITOR Button Visibility
Always check the `permissions` array from `/auth/me` and hide write-action buttons for roles that don't have the permission. Never rely on role string alone — use the `permissions` array the API returns.

### AUTHORITY_OFFICER Scope
Always pass `institutionId` as a query parameter when making requests as AUTHORITY_OFFICER. Without it, some controllers may return an empty result or 403 if `AUTHORITY_OFFICER_GLOBAL_ACCESS=false`.

### Idempotency for Retries
On network failure during a mutation, the UI should retry with the same `Idempotency-Key` (store the key before the first attempt). The server will detect replay and return HTTP 200 with `isReplay: true` instead of creating a duplicate.

### Transfer Route Order Note
`POST /api/v1/transfers/process-timeouts` is registered AFTER `GET /:id` in the router. It works correctly because it's a POST (different method). But `GET /transfers/process-timeouts` would match `/:id` with id="process-timeouts" and return a 404/error. Don't add a GET for this path.

### Scorecard `overallScore` Can Be `null`
When `band === 'INSUFFICIENT_DATA'`, `overallScore` is `null` (not 0). The UI must handle this null and show "Insufficient Data" state, not display 0%.

### Scorecard Mandatory Disclaimer
The `ScoreSnapshot.disclaimer` field contains a mandatory non-punitive disclaimer string that **must be displayed** in the UI per the platform spec:
> "The Institutional Data Reliability Scorecard measures the reliability and completeness of reported data and helps identify support needs. It is not a misconduct verdict or a measure of overall institutional quality."

---

## 10. Code vs README Disagreements

| # | Topic | README | Code (wins) |
|---|---|---|---|
| 1 | **Login flow** | Single-step login described | **Two-step mandatory:** POST /login (credentials → challengeId), POST /verify-login-otp (OTP → tokens) |
| 2 | **Access token lifetime** | `JWT_EXPIRES_IN` controls it (default 7d) | Hardcoded `'15m'` in `tokenService.js`; `JWT_EXPIRES_IN` is parsed but never used |
| 3 | **New auth endpoints** | Not mentioned | `POST /auth/verify-login-otp`, `POST /auth/resend-login-otp` are implemented |
| 4 | **Finding routes** | Only `/reconciliation-findings` shown | Mounted at **both** `/reconciliation-findings` AND `/findings` |
| 5 | **Intake declare alias** | One endpoint | TWO routes registered: `/intake-declarations` AND `/intake/declare` (identical handler) |
| 6 | **AUTHORITY_OFFICER scope** | Implied global access | Default is bounded by `assignedInstitutionIds`; global access requires `AUTHORITY_OFFICER_GLOBAL_ACCESS=true` env var |
| 7 | **Scoring config GET** | Not mentioned | `GET /scorecards/config` has **no permission guard** — any authenticated user can read it |
| 8 | **Email service** | SMTP described | Code uses **Resend SDK** (`resend` npm package); SMTP vars are parsed but the email service uses Resend |

---

*End of document. File: `/Users/DELL/Ps3_SIH/BACKEND_CONTEXT_FOR_FRONTEND.md` | Backend commit: `1beb811`*
