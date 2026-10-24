# SIH 2026 PS3 — APAAR Seat Integrity Platform (Backend)

Backend service foundation and **Feature 1: Seat Three-Way Match** engine for the AICTE-approved institutions' APAAR ID-based Student Data Management and Seat Verification Platform.

---

## Architecture & Technology Stack

- **Runtime & Framework:** Node.js (v24+) + Express.js
- **Database:** MongoDB Atlas + Mongoose ODM
- **Module System:** Plain JavaScript (CommonJS `require()` and `module.exports`)
- **Testing:** Jest + Supertest (unit, integration, and E2E suites)
- **Development Tooling:** Nodemon for hot reloading
- **File Parsing:** `multer` (memory storage, 10MB cap) + `csv-parse`
- **Security:** Helmet, restricted CORS whitelist, HMAC-SHA256 APAAR pseudonymisation, rate limiting, and CWE-1236 CSV injection defense.

---

## Directory Structure

```text
Backend/
├── src/
│   ├── app.js                         # Express application setup
│   ├── server.js                      # Server bootstrap (DNS, DB connect, listener, graceful shutdown)
│   ├── config/
│   │   ├── env.js                     # Validated configuration loader & placeholder defense
│   │   ├── dns.js                     # Development DNS resolver (1.1.1.1, 8.8.8.8)
│   │   └── db.js                      # Reusable Mongoose connection with lifecycle monitoring
│   ├── models/
│   │   ├── institution.model.js       # Institution master entity
│   │   ├── programme.model.js         # Degree programmes with embedded approved intake
│   │   ├── rosterUpload.model.js      # CSV upload staging and row validation summary
│   │   ├── rosterVersion.model.js     # Immutable committed roster versions
│   │   ├── rosterRow.model.js         # Student roster rows with HMAC tokens
│   │   ├── externalRegisterRecord.model.js # Simulated/Independent registers (Admission, Exam)
│   │   ├── reconciliationRun.model.js # Three-way match execution record
│   │   └── reconciliationFinding.model.js # Explainable match findings & audit trail
│   ├── services/
│   │   ├── normalisationService.js    # Data normalisation and candidate key derivation
│   │   ├── matchingService.js         # Deterministic matching rules & conflict detection
│   │   ├── rosterService.js           # CSV parsing, preview, and immutable version commit
│   │   ├── reconciliationService.js   # Multi-source reconciliation orchestrator
│   │   └── findingService.js          # Finding retrieval and human review decision workflow
│   ├── controllers/
│   │   ├── health.controller.js       # System health, liveness, and readiness probes
│   │   ├── roster.controller.js       # Roster upload, preview, and commit handlers
│   │   ├── reconciliation.controller.js # Reconciliation runs and summary handlers
│   │   └── finding.controller.js      # Finding details and reviewer decision handlers
│   ├── routes/
│   │   ├── index.js                   # Root API v1 router aggregator
│   │   ├── health.routes.js           # /api/v1/health endpoints
│   │   ├── roster.routes.js           # /api/v1/rosters endpoints
│   │   ├── reconciliation.routes.js   # /api/v1/reconciliations endpoints
│   │   └── finding.routes.js          # /api/v1/reconciliation-findings endpoints
│   ├── middleware/
│   │   ├── auth.js                    # Bearer JWT / mock identity & institution scoping RBAC
│   │   ├── requestId.js               # Distributed request ID assignment & propagation
│   │   ├── notFound.js                # Standardized 404 response handler
│   │   └── errorHandler.js            # Centralized error handler with sanitization
│   └── utils/
│       ├── apiResponse.js             # Standard JSON success/error envelopes
│       ├── cryptoToken.js             # Keyed HMAC APAAR pseudonymisation & privacy masking
│       └── normalisation.js           # Name/Date/Programme normalisation & CSV injection defense
├── tests/
│   ├── config.test.js                 # Configuration and placeholder validation tests
│   ├── health.test.js                 # Express app, health, liveness, readiness, 404, CORS tests
│   ├── db.test.js                     # Mongoose connection lifecycle unit tests
│   ├── dns.test.js                    # DNS resolver unit tests
│   ├── error.test.js                  # Error middleware unit tests
│   ├── matching.test.js               # Matching engine, key derivation, and conflict unit tests
│   ├── roster.integration.test.js     # CSV upload, preview, commit, and RBAC integration tests
│   └── reconciliation.integration.test.js # End-to-end Three-Way Match & review workflow tests
├── .env.example                       # Sanitized environment template
├── .gitignore                         # Excludes .env, node_modules, coverage, and logs
├── jest.config.js                     # Test runner configuration
├── nodemon.json                       # Development file-watcher configuration
├── package.json                       # Project dependencies and npm scripts
└── README.md                          # Documentation
```

---

## Feature 1: Seat Three-Way Match Engine

### Matching Precedence
1. **K1 Match (Strongest):** Exact match on keyed HMAC `apaarToken`.
2. **K2 Match (Strong):** Exact match on `applicationNo + programmeCode + academicYear`.
3. **K3 Match (Weak Candidate):** Normalised Name + Date of Birth + Programme Code. **Must never auto-confirm.** Routed to human reviewer queue.
4. **No Match:** Classified as `UNMATCHED`.

### Finding Outcome Categories
- `CONFIRMED_3WAY`: Student record verified across Roster, Admission, and Examination registers with attribute agreement.
- `CONFIRMED_PARTIAL`: Record confirmed against active sources when some registers are unavailable or not applicable.
- `UNMATCHED`: Student reported in roster but not found in external allotment/admission register.
- `CONFLICT`: Records match on key, but attributes differ (e.g. Category, Date of Birth, Gender, Programme).
- `CANDIDATE_REVIEW`: Weak match candidate requiring side-by-side human review.
- `DUPLICATE_CANDIDATE`: Multiple records within a register share the same student token or identity key.
- `MISSING_FROM_ROSTER`: Candidate present in independent allotment register but absent from the institution roster.
- `COUNT_MISMATCH`: Roster enrollment exceeds approved intake capacity for that programme and academic year.
- `SOURCE_UNAVAILABLE`: External register was unreachable. Handled gracefully with zero mismatch penalties.

### Human Review Actions
- `CONFIRM`: Confirm candidate match (e.g. confirming K3 candidate represents same student).
- `DISMISS`: Dismiss candidate match as different individuals.
- `REQUEST_CLARIFICATION`: Request clarification/documentation from institution.
- `RESOLVE`: Resolve finding with an explained justification.
- *All actions append to immutable `reviewHistory` preserving the complete audit trail.*

---

## Feature 2: Seat Ledger and Academic Mass-Balance Engine

### Bucket Identification & Integrity
Each seat ledger bucket is uniquely identified by:
`institutionId + programmeCode + academicYear + seatCategory`
with a canonical composite key:
`${institutionId}__${normaliseProgrammeCode(prog)}__${normaliseAcademicYear(year)}__${normaliseCategory(cat)}`
backed by a MongoDB unique compound index ensuring no duplicate competing bucket documents.

### Append-Only Immutable Ledger Entries
Every occupancy or intake adjustment is recorded as an immutable ledger transaction:
- `INTAKE_SET` / `INTAKE_REVISED`: Approved intake baseline creation or regulatory revision.
- `ROSTER_SYNC_ADJUSTMENT`: Net adjustment required to bring reported occupancy into agreement with a newly committed roster snapshot.
- `ADMISSION`, `WITHDRAWAL`, `TRANSFER_IN`, `TRANSFER_OUT`, `COMPLETION`, `CORRECTION_REVERSAL`: Lifecycle transitions.
- Idempotency guard: `idempotencyKey` unique partial index (`{ $type: "string" }`) ensures retried syncs never produce duplicate adjustments.

### Committed Roster Net-Delta Synchronization (No Double-Counting)
When an immutable roster version is committed:
1. Active rows are counted per `(programmeCode, seatCategory)` bucket.
2. `requiredDelta = newCount - currentOccupancy`.
3. If previously 58 and newly 61, `delta` is `+3`, bringing occupancy to 61 (never 58 + 61 = 119).
4. An idempotent `ROSTER_SYNC_ADJUSTMENT` entry is appended with the calculated delta.

### Intake Governance & Uncertainty Labelling
- **sourceMode** (`INSTITUTION_REPORTED`, `INSTITUTION_DECLARED`, `SIMULATED`, `LIVE`): Where the data originated. Mock authority connectors remain labelled `SIMULATED`.
- **verificationStatus** (`NO_INTAKE_CONFIGURED`, `INTAKE_UNVERIFIED`, `AUTHORITY_VERIFIED`): How the data was validated.
- Institution users can declare intake (`POST /intake-declarations`) which is marked `INTAKE_UNVERIFIED` and `INSTITUTION_DECLARED`.
- Only regulatory authorities (`AUTHORITY_ADMIN`, `PLATFORM_ADMIN`) can configure authority-approved intake (`PUT /intake`), setting `AUTHORITY_VERIFIED`.

### Headroom & Status Calculations
- `headroom = approvedIntake - reportedOccupancy`
- `utilisationPct = reportedOccupancy / approvedIntake * 100` (safe against zero/missing intake)
- Statuses: `OK`, `WARNING` (when utilisation ≥ configurable threshold, default 90%), `OVER_CAP_DISCREPANCY` (when occupancy > approved intake), `INTAKE_UNVERIFIED`, `NO_INTAKE_CONFIGURED`.

### Academic Mass-Balance Cohort Carryover
- `expectedContinuingCount = Math.round(baselinePreviousCohortCount * retentionRate) + entrants - exits`
- `discrepancyDelta = reportedCurrentCount - expectedContinuingCount`
- If `discrepancyDelta !== 0`, flags `COHORT_CARRYOVER_MISMATCH` with an explainable diagnostic text.
- Unknown programmes return `UNKNOWN_PROGRAMME_RULES` (provisional, never inventing violations).

---

## Feature 3: Assurance Sampling and Verification Confidence

### Objectives & Principles
Allows authorized reviewers to draw statistically qualified, cryptographically secure random samples from frozen committed roster snapshots to evaluate data assurance without jumping to accusations or treating non-response as misconduct.

### Statistical Formulae
- **Sample Size (Cochran's formula + Finite Population Correction):**
  $$n_0 = \frac{z^2 \cdot p \cdot (1 - p)}{e^2}$$
  $$n = \frac{n_0}{1 + \frac{n_0 - 1}{N}}$$
  Rounded up to nearest integer, clamped between `minSampleSize` (default 10) and `maxSampleSize` (default 500).
- **Small Population Handling:** If $N \le \text{minSampleSize}$, recommends a complete 100% census.
- **Wilson Score Confidence Interval:**
  $$\hat{p} = \frac{n_{\text{verified}}}{n_{\text{resolved}}}$$
  $$\text{Interval} = \frac{\hat{p} + \frac{z^2}{2n} \pm z \sqrt{\frac{\hat{p}(1 - \hat{p})}{n} + \frac{z^2}{4n^2}}}{1 + \frac{z^2}{n}}$$
  Adjusted with finite population correction factor $\sqrt{(N - n) / (N - 1)}$.

### Stratum Separation
- **`RANDOM` Stratum:** Selected via `crypto.randomInt` Fisher-Yates shuffle. Sole basis for probability estimation.
- **`RISK_TARGETED` Stratum:** Optional targeted records (e.g. flagged anomalies). Tracked separately; **never mixed into the random probability estimate**. Adding risk-targeted records never shrinks the configured random sample.

### Verification Status Model
- `PENDING`: Check not yet conducted.
- `VERIFIED`: Authoritative evidence checked and verified.
- `FAILED_CHECK`: Explicit verification conducted and did not match authoritative criteria.
- `UNCONFIRMED`: Non-response, unreachable contact, or insufficient data. **Crucially: NEVER silently treated as a failed check.**
- `EXCLUDED`: Record removed for documented reasons (e.g. transferred out before census date).

### Sensitivity Bounding
Provides illustrative sensitivity bounds for unconfirmed records:
- **Best-Case:** Assumes all unconfirmed are verified: $(n_{\text{verified}} + n_{\text{unconfirmed}}) / (n_{\text{resolved}} + n_{\text{unconfirmed}})$.
- **Worst-Case:** Assumes all unconfirmed are failed checks: $n_{\text{verified}} / (n_{\text{resolved}} + n_{\text{unconfirmed}})$.

---

## API Endpoints List

### Feature 1: Seat Three-Way Match
| Method | Endpoint | Allowed Roles | Description |
|---|---|---|---|
| `GET` | `/api/v1/health` | Public | Overall platform health diagnostics |
| `GET` | `/api/v1/health/live` | Public | Process liveness probe |
| `GET` | `/api/v1/health/ready` | Public | Database readiness probe |
| `POST` | `/api/v1/rosters/upload` | INSTITUTION_*, PLATFORM_ADMIN | Upload student roster CSV (multipart/form-data) |
| `GET` | `/api/v1/rosters/:id/preview` | Scoped Institution, Authority | View parsed preview rows with validation errors & masked data |
| `POST` | `/api/v1/rosters/:id/commit` | INSTITUTION_ADMIN, PLATFORM_ADMIN | Commit validated roster as immutable version & sync with Seat Ledger |
| `GET` | `/api/v1/rosters/:id` | Scoped Institution, Authority | Retrieve roster upload or version details |
| `POST` | `/api/v1/reconciliations` | AUTHORITY_*, PLATFORM_ADMIN | Execute Seat Three-Way Match (supports `Idempotency-Key`) |
| `GET` | `/api/v1/reconciliations` | Scoped Institution, Authority | List reconciliation runs |
| `GET` | `/api/v1/reconciliations/:id` | Scoped Institution, Authority | Retrieve reconciliation run metadata |
| `GET` | `/api/v1/reconciliations/:id/findings` | Scoped Institution, Authority | Query paginated findings with filters (`type`, `severity`, `reviewStatus`) |
| `GET` | `/api/v1/reconciliations/:id/summary` | Scoped Institution, Authority | Retrieve chart-ready reconciliation summary metrics |
| `GET` | `/api/v1/reconciliation-findings/:id` | Scoped Institution, Authority | Retrieve single finding with side-by-side comparison payload |
| `PATCH` | `/api/v1/reconciliation-findings/:id/review` | AUTHORITY_*, PLATFORM_ADMIN | Record reviewer decision (`CONFIRM`, `DISMISS`, `REQUEST_CLARIFICATION`, `RESOLVE`) |

### Feature 2: Seat Ledger & Mass-Balance
| Method | Endpoint | Allowed Roles | Description |
|---|---|---|---|
| `GET` | `/api/v1/seat-ledger/balances` | Scoped Institution, Authority, Auditor | Query paginated seat balances by programme, year, category, status |
| `GET` | `/api/v1/seat-ledger/balances/:id` | Scoped Institution, Authority, Auditor | Retrieve single bucket details with headroom & utilisation metrics |
| `GET` | `/api/v1/seat-ledger/balances/:id/entries` | Scoped Institution, Authority, Auditor | Query paginated immutable audit entries for a balance bucket |
| `GET` | `/api/v1/seat-ledger/history` | Scoped Institution, Authority, Auditor | Retrieve time-series snapshots for charting trendlines |
| `POST` | `/api/v1/seat-ledger/intake-declarations` | INSTITUTION_ADMIN, PLATFORM_ADMIN | Submit self-declared intake capacity (marked `INTAKE_UNVERIFIED`) |
| `PUT` | `/api/v1/seat-ledger/intake` | AUTHORITY_ADMIN, PLATFORM_ADMIN | Configure/revise authority-approved intake and sync Programme master |
| `GET` | `/api/v1/seat-ledger/rules` | All Authenticated Roles | View active occupancy rules, threshold percentages, and counting policies |
| `POST` | `/api/v1/seat-ledger/rules` | AUTHORITY_ADMIN, PLATFORM_ADMIN | Create a new versioned occupancy rule |
| `POST` | `/api/v1/seat-ledger/verify-integrity` | AUTHORITY_ADMIN, AUDITOR, PLATFORM_ADMIN | Audit ledger consistency; recompute derived balance from historical deltas |
| `GET` | `/api/v1/seat-ledger/mass-balance` | Scoped Institution, Authority, Auditor | Compute academic year cohort carryover and detect mismatches |

### Feature 3: Assurance Sampling & Confidence Estimation
| Method | Endpoint | Allowed Roles | Description |
|---|---|---|---|
| `POST` | `/api/v1/sampling-runs/preview-size` | Review Roles (Authority, Auditor) | Preview population size, Cochran sample size, and FPC without persisting |
| `POST` | `/api/v1/sampling-runs` | Review Roles (Authority, Auditor) | Execute cryptographically secure random sample selection and initialize run |
| `GET` | `/api/v1/sampling-runs` | All Authenticated Roles (Scoped) | Query paginated list of sampling runs |
| `GET` | `/api/v1/sampling-runs/:id` | All Authenticated Roles (Scoped) | Retrieve run metadata, progress counts, and execution parameters |
| `GET` | `/api/v1/sampling-runs/:id/items` | All Authenticated Roles (Scoped) | Retrieve paginated sampling items with masked student identifiers |
| `PATCH` | `/api/v1/sampling-items/:id/result` | Review Roles (Authority, Auditor) | Record item verification outcome (`VERIFIED`, `FAILED_CHECK`, `UNCONFIRMED`, `EXCLUDED`) |
| `POST` | `/api/v1/sampling-runs/:id/close` | Authority Admin Roles | Formally close a sampling run and freeze item reviews |
| `GET` | `/api/v1/sampling-runs/:id/estimate` | All Authenticated Roles (Scoped) | Compute Wilson score confidence interval on random stratum |

---

## Running the Platform (Windows Commands)

Install dependencies:
```powershell
npm.cmd install
```

Start in development mode with Nodemon:
```powershell
npm.cmd run dev
```

Start the production server:
```powershell
npm.cmd start
```

Run complete test suite:
```powershell
npm.cmd test
```

Run test suite with code coverage:
```powershell
npm.cmd run test:coverage
```
