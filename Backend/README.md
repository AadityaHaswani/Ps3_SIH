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
| `PATCH` | `/api/v1/sampling-items/:id/result` | Authority Roles (Admin, Officer) | Record item verification outcome (`VERIFIED`, `FAILED_CHECK`, `UNCONFIRMED`, `EXCLUDED`). Auditor is read-only. |
| `POST` | `/api/v1/sampling-runs/:id/close` | Authority Admin Roles | Formally close a sampling run and freeze item reviews |
| `GET` | `/api/v1/sampling-runs/:id/estimate` | All Authenticated Roles (Scoped) | Compute Wilson score confidence interval on random stratum |

### Feature 4: Institutional Data Reliability Scorecard
| Method | Endpoint | Allowed Roles | Description |
|---|---|---|---|
| `GET` | `/api/v1/scorecards/institutions/:institutionId` | Scoped Institution, Authority, Auditor | Retrieve latest scorecard snapshot (evaluates/snapshots if stale) |
| `GET` | `/api/v1/scorecards/institutions/:institutionId/metrics` | Scoped Institution, Authority, Auditor | Retrieve detailed breakdown of M1, M2, M3, M4 metrics & coverage |
| `GET` | `/api/v1/scorecards/institutions/:institutionId/trend` | Scoped Institution, Authority, Auditor | Retrieve historical score & metric time series with formula version markers |
| `GET` | `/api/v1/scorecards/institutions/:institutionId/history` | Scoped Institution, Authority, Auditor | Query paginated historical snapshots for compliance auditing |
| `POST` | `/api/v1/scorecards/recalculate` | Scoped Institution (own), Authority, Admin | On-demand scorecard recalculation, generating fresh immutable snapshot |
| `GET` | `/api/v1/scorecards/compare` | All Authenticated (Peer-Anonymised for Institution) | Side-by-side comparison across institutions with comparability warnings |
| `GET` | `/api/v1/scorecards/config` | All Authenticated Roles | View active or specific version of scoring configuration |
| `POST` | `/api/v1/scorecards/config` | Authority Admin, Platform Admin | Create a new versioned scoring configuration (formula update) |

---

## Feature 4: Institutional Data Reliability Scorecard Architecture

### Mandatory Non-Negotiable Principle & Disclaimer
"The Institutional Data Reliability Scorecard measures the reliability and completeness of reported data and helps identify support needs. It is not a misconduct verdict or a measure of overall institutional quality."

Strict non-punitive framing is maintained across all APIs, models, and UI contracts. Defamatory terms such as "fraudulent", "dishonest", "bad institution", or "low-quality college" are strictly prohibited.

### Metric Families
1. **M1 — Record Completeness:**
   - Formula: `completenessPct = 100 × populatedRequiredFields / totalRequiredFields`
   - Configurable mandatory fields: `applicationNo`, `apaarToken`, `name`, `dob`, `gender`, `category`, `programmeCode`, `academicYear`.
   - Legitimately optional fields (e.g. `admissionDate`, `admissionQuota`) do not contribute to the denominator.
   - Requires minimum 30 records; returns `INSUFFICIENT_DATA` if below threshold.
2. **M2 — Unresolved Discrepancies:**
   - Observed rate per 1,000 records from Feature 1 reconciliation findings: `observedRatePer1000 = (openCount / inScopeRecords) × 1000`.
   - Sub-Score Formula: `discrepancySubScore = 100 × max(0, 1 - observedRatePer1000 / configuredRateCeiling)` (default ceiling: 50.0).
   - Findings classified by severity and ageing buckets: `0-7 days`, `8-30 days`, `31+ days`.
   - `SOURCE_UNAVAILABLE` findings are strictly excluded from discrepancies and tracked under independent Data Coverage.
3. **M3 — Update Timeliness:**
   - Evaluates lag between effective event dates (`admissionDate`) and submission/commit timestamps.
   - Metrics: Median lag (days), P90 lag (days), on-time percentage (`delay <= 15 days`), data freshness.
   - Normalisation: `lagScore = 100 × max(0, 1 - p90LagDays / configuredLagCeilingDays)`, `timelinessSubScore = 0.5 × onTimePct + 0.5 × lagScore`.
   - Minimum 20 dated events required; marked `UNAVAILABLE` or `INSUFFICIENT_DATA` if event dates are unpopulated.
4. **M4 — Correction Activity & Trends:**
   - Tracks attributable correction events (`DataCorrectionEvent`) and Seat Ledger reversals.
   - Metrics: Total corrections, corrections per 100 records, repeat-correction rate, turnaround days, self-initiated vs prompted counts.
   - Non-Punitive Safeguard: `enabledInScore: false` (weight 0.00) by default so proactive self-corrections are never penalized.

### Scoring Formula, Renormalisation & Minimum Safeguards
- **Prototype Weights:** M1 Completeness (0.40), M2 Discrepancies (0.30), M3 Timeliness (0.30), M4 Corrections (0.00).
- **Renormalisation:** Weights are dynamically renormalised across available scored metrics: `weightUsed = configuredWeight / sum(availableWeights)`.
- **Minimum Thresholds:** Requires at least 50 in-scope records and at least 2 scored metrics (M1-M3).
- **Insufficient Data Protection:** If thresholds are not met, returns `band: INSUFFICIENT_DATA`, `overallScore: null`, `isEligibleForScore: false`. A score of 0 is **never** assigned for insufficient data.
- **Support-Oriented Bands:**
  - `STRONG` (Score >= 85.0)
  - `ADEQUATE` (70.0 <= Score < 85.0)
  - `NEEDS_SUPPORT` (50.0 <= Score < 70.0)
  - `PRIORITY_SUPPORT` (Score < 50.0)
  - `INSUFFICIENT_DATA` (Ineligible)

### Data Coverage
Reported independently from the scorecard value. Evaluates availability and mode (`INSTITUTION_REPORTED`, `SIMULATED`) across `INSTITUTION_ROSTER`, `NATIONAL_APAAR_REGISTRY`, and `BOARD_RESULTS_REGISTER`.

---

## Frontend Integration Contract

### Section Layout & Expected Actions
1. **Overview Tab:**
   - Displays Institution Identity, Reporting Period, Overall Score card, Support Band badge (`STRONG`, `ADEQUATE`, `NEEDS_SUPPORT`, `PRIORITY_SUPPORT`, `INSUFFICIENT_DATA`), Coverage Progress Bar, Unresolved Discrepancies count, Formula Version, and Verbatim Disclaimer.
   - Primary Action: `Recalculate Score` button (triggers `POST /api/v1/scorecards/recalculate`).
2. **Metrics Tab:**
   - 4 Interactive Metric Cards (M1, M2, M3, M4) displaying raw metrics, denominators, sub-scores, weights, and status badges.
   - Action: Click-through drill-down links to view underlying roster rows or open reconciliation findings.
3. **Compare Tab:**
   - Institution Selector Subject to RBAC. Displays side-by-side metric comparison, record counts, and coverage.
   - Comparability Warnings Callout: Warns when comparing different institution types (`ENGINEERING` vs `MANAGEMENT`) or formula versions.
   - Privacy Guard: For institution callers, peer institution names are automatically masked as `Peer Institution B (College)`.
4. **Trends Tab:**
   - Historical time series charts showing score trajectory, metric evolutions, coverage, and formula version change markers.
5. **Drill-down Tab:**
   - Paginated table of in-scope roster rows and reconciliation findings with masked identifiers (`maskIdentifier`, `maskName`).
6. **Method Tab:**
   - Comprehensive explanation of metric definitions, mathematical formulas, prototype weights, normalisation ceilings, and prototype assumptions.
7. **Support Suggestions Tab:**
   - Actionable recommendation cards citing specific triggering metrics, values, and target workflows (e.g. "Targeted Data-Entry Refresher for APAAR / Student ID", "Priority Case Review for Ageing Findings").

---

## Recharts Graph & Chart Specifications

| # | Chart Name | Business Question | Recharts Component | Data Fields & Payload Structure | API Endpoint & Filters | Tooltip & Interaction Behaviour | Empty / Unavailable State Handling |
|---|---|---|---|---|---|---|---|
| **1** | **Overall Reliability Score Trend** | How has the institution's data reliability evolved over time? | `<LineChart>` / `<ResponsiveContainer>` | `calculatedAt` (X-axis), `overallScore` (Y-axis 0-100), `formulaChanged` (ReferenceLine), `isStale` | `GET /api/v1/scorecards/institutions/:id/trend` | Shows Date, Score, Band, Formula Version. Flags formula change markers. | Displays message: "Insufficient historical snapshots. Recalculate to establish baseline." |
| **2** | **Metric Sub-Score Evolution** | Which metric dimension (Completeness, Discrepancies, Timeliness) is improving or needs attention? | `<LineChart>` with multi-lines | `reportingPeriod` (X-axis), `completenessPct`, `unresolvedRatePer1000`, `onTimePct` | `GET /api/v1/scorecards/institutions/:id/trend` | Multi-line hover displaying individual metric sub-scores and weights. | Dashed line for periods where a metric was `UNAVAILABLE`. |
| **3** | **Side-by-Side Peer Comparison** | How does this institution's data profile compare with peers of the same type? | `<BarChart>` (grouped) | `institutionName` (X-axis), `m1SubScore`, `m2SubScore`, `m3SubScore`, `overallScore` | `GET /api/v1/scorecards/compare?institutions=id1,id2` | Shows institution name (or masked peer name), sub-score breakdown, comparability warnings. | Renders disabled state with warning banner if institution types mismatch. |
| **4** | **Data Completeness by Field** | Which specific student data fields have the highest frequency of missing values? | `<BarChart>` (horizontal layout) | `fieldName` (Y-axis), `missingCount` (X-axis), `populatedCount` | `GET /api/v1/scorecards/institutions/:id/metrics` | Shows Field Name, Populated Count, Missing Count, Missing %. Clicking field opens filtered roster drill-down. | Shows "100% Complete — Zero missing required field instances". |
| **5** | **Open Discrepancy Ageing Distribution** | Are reconciliation findings being cleared promptly or lingering beyond 30 days? | `<BarChart>` / `<PieChart>` | `bucket` (`0-7 days`, `8-30 days`, `31+ days`), `count` | `GET /api/v1/scorecards/institutions/:id/metrics` | Shows Age Bucket, Open Finding Count, Severity breakdown (`CRITICAL`, `WARNING`). | Shows "Zero open discrepancies in current reporting period". |
| **6** | **Admissions Reporting Timeliness (On-Time vs Late)** | Are student admissions being reported within the configured 15-day window? | `<PieChart>` / `<Donut>` | `category` (`On-Time (<=15d)`, `Late (>15d)`), `count`, `pct` | `GET /api/v1/scorecards/institutions/:id/metrics` | Shows category, student count, percentage, median lag days (e.g. "Median Lag: 5 days"). | Shows "Timeliness metrics unavailable: Effective admission dates are unpopulated". |
| **7** | **Data Coverage vs Unresolved Records** | What proportion of external source registers are available versus open discrepancies? | `<ComposedChart>` (Bar + Line) | `source` (X-axis), `coveragePct` (Bar), `unresolvedCount` (Line) | `GET /api/v1/scorecards/institutions/:id` | Shows source name, mode (`INSTITUTION_REPORTED`, `SIMULATED`), and availability status. | Clearly indicates `SIMULATED` or `OUTAGE` state for external registers. |
| **8** | **Correction Activity & Turnaround Trend** | Is the institution actively self-correcting data, and what is the turnaround time? | `<AreaChart>` | `month` (X-axis), `totalCorrections`, `selfInitiatedCount`, `medianTurnaroundDays` | `GET /api/v1/scorecards/institutions/:id/trend` | Shows correction volume, self-initiated vs prompted split, median turnaround hours. | Shows contextual message: "No attributable corrections logged. Corrections are not penalised in score." |
| **9** | **Formula Version Markers in Historical Trends** | When did regulatory formula changes occur in relation to historical evaluations? | `<LineChart>` with vertical `<ReferenceLine>` | `calculatedAt` (X-axis), `overallScore`, `configVersion` | `GET /api/v1/scorecards/institutions/:id/trend` | Hovering over vertical reference line displays formula version details and weight revisions. | Single version timeline rendered without vertical divider lines. |

---

## Feature 5: Privacy-Preserving Student Lifecycle & Transfer Handshake

Feature 5 implements an append-only student lifecycle state engine, privacy-preserving token matching, a two-sided institution transfer confirmation handshake with date-gap tolerances and deadline timeouts, seat ledger integration, and cross-institution enrolment overlap detection with strictly neutral review resolutions.

### 1. Token Security & Key Version Management

- **HMAC-SHA256 Tokenization:** Canonicalises raw identifiers by trimming whitespace, stripping spaces and hyphens, and converting to uppercase.
- **Key Versioning:** Supports versioned keys (`v1` default/legacy mapped to `APAAR_TOKEN_SECRET`, `v2` mapped to `APAAR_TOKEN_SECRET_V2`). Matching queries supported key versions during overlap windows.
- **Opaque Scoped References:** Ordinary institution users receive opaque references (`STU-<HEX12>`), preventing cross-institution linkage by non-authority users.
- **Privacy Limitation Disclaimer:** *HMAC tokens are pseudonymous, not anonymous.* They are linkable across datasets. Key compromise creates re-identification risk. Raw identifiers are never stored, logged, or returned in API responses. Missing identifiers return `MISSING_IDENTIFIER` and cannot participate in matching.

### 2. Student Lifecycle State Machine

- **Event Types:** `ADMITTED`, `ENROLLED`, `TRANSFER_OUT_REQUESTED`, `TRANSFER_OUT_CONFIRMED`, `TRANSFER_IN_REQUESTED`, `TRANSFER_IN_CONFIRMED`, `WITHDRAWN`, `COMPLETED`, `CORRECTED`.
- **Derived Current States:** `ADMITTED`, `ENROLLED`, `TRANSFER_PENDING`, `TRANSFER_CONFIRMED`, `TRANSFER_REJECTED`, `WITHDRAWN`, `COMPLETED`, `NEEDS_REVIEW`.
- **Allowed Transitions:**
  - `ADMITTED → ENROLLED`, `WITHDRAWN`
  - `ENROLLED → TRANSFER_PENDING`, `WITHDRAWN`, `COMPLETED`
  - `TRANSFER_PENDING → TRANSFER_CONFIRMED`, `TRANSFER_REJECTED`, `NEEDS_REVIEW`, `ENROLLED`
  - `TRANSFER_CONFIRMED → ENROLLED`
  - `TRANSFER_REJECTED → ENROLLED`
  - `NEEDS_REVIEW → TRANSFER_CONFIRMED`, `TRANSFER_REJECTED`, `ENROLLED`
  - `WITHDRAWN` / `COMPLETED`: Terminal states.
- **Non-Destructive Corrections:** A correction appends a new `CORRECTED` event and marks the prior event as `SUPERSEDED`. Historical facts are never modified or deleted in place.

### 3. Two-Sided Transfer Handshake & Seat Ledger Integration

- **Workflow:**
  1. Transfer initiated by either sending or receiving institution admin (`status: PENDING`).
  2. Sending institution confirms student exit (`sendingConfirmation.status = CONFIRMED`).
  3. Receiving institution independently confirms student entry (`receivingConfirmation.status = CONFIRMED`).
  4. Date-gap check: If confirmation effective dates diverge by $\le 7$ days, case transitions to `TRANSFER_CONFIRMED`. If gap $> 7$ days, case routes to `NEEDS_REVIEW`.
  5. If deadline expires without two-sided confirmation, background timeout marks case as `NEEDS_REVIEW` (never auto-confirms).
  6. Rejection routes case to `TRANSFER_REJECTED` and touches no ledger entries.
- **Seat Ledger Synchronization:**
  - Upon `TRANSFER_CONFIRMED`, creates idempotent `TRANSFER_OUT` (-1 delta) at sending institution and `TRANSFER_IN` (+1 delta) at receiving institution.
  - Headroom and occupancy balances are updated using configured intake thresholds.
  - Stable idempotency keys (`transfer_out_<id>`, `transfer_in_<id>`) ensure retries never produce duplicate transactions.

### 4. Cross-Institution Enrolment Overlap & Review Workflow

- **Interval Detection:** Evaluates valid, non-superseded lifecycle events across institutions.
- **Neutral Framing:** Flagged as non-punitive informational observations (`severity: INFO`).
- **Verbatim Explanation:** `"Overlap may be legitimate (e.g., permitted arrangements, pending paperwork). Applicable policy must be verified."`
- **Resolution Codes:** `LEGITIMATE_TRANSFER`, `DATA_ENTRY_ERROR_CORRECTED`, `PERMITTED_PARALLEL`, `REFERRED_FOR_POLICY_REVIEW`, `NO_ACTION`.
- **Audit & History:** Append-only `resolutionHistory` array preserves all decisions. Only authority officers (`AICTE_ADMIN`, `STATE_OFFICER`, `SYSTEM_ADMIN`) can resolve cases.

### 5. API Reference

#### Lifecycle Endpoints
- `POST /api/v1/lifecycle/events` — Records an append-only lifecycle or correction event.
- `GET /api/v1/lifecycle/students/:tokenId/events` — Retrieves derived current state and event timeline with opaque `studentRef`.

#### Transfer Handshake Endpoints
- `POST /api/v1/transfers` — Initiates a two-sided transfer case.
- `PATCH /api/v1/transfers/:id/confirm` — Records sending or receiving side confirmation.
- `PATCH /api/v1/transfers/:id/reject` — Rejects a transfer case with reason.
- `GET /api/v1/transfers` — Paginated, institution-scoped transfer case listings.
- `GET /api/v1/transfers/:id` — Detail view with two-sided confirmation status and audit history.
- `POST /api/v1/transfers/process-timeouts` — Authority batch job moving expired transfers to `NEEDS_REVIEW`.

#### Overlap Review Endpoints
- `GET /api/v1/overlap-cases` — Paginated overlap cases scoped by institution or authority filters.
- `GET /api/v1/overlap-cases/:id` — Detail view of overlap case, institutional intervals, and history.
- `PATCH /api/v1/overlap-cases/:id/resolve` — Authority-only decision recording with required reviewer notes.

---

## Frontend Integration Contracts (Feature 5)

### 1. Student Lifecycle Timeline Component
- **Component:** `<StudentLifecycleTimeline studentRef={ref} />`
- **Endpoint:** `GET /api/v1/lifecycle/students/:tokenId/events`
- **Payload Contract:**
  ```json
  {
    "success": true,
    "data": {
      "studentRef": "STU-94AD52A0A312",
      "currentState": "ENROLLED",
      "totalEvents": 3,
      "validEventsCount": 2,
      "events": [
        {
          "_id": "67123...",
          "type": "ADMITTED",
          "effectiveDate": "2024-07-01T00:00:00.000Z",
          "reportedAt": "2024-07-02T10:15:00.000Z",
          "status": "SUPERSEDED",
          "supersedesEventId": null,
          "reason": "Direct central counselling",
          "studentRef": "STU-94AD52A0A312"
        },
        {
          "_id": "67124...",
          "type": "CORRECTED",
          "effectiveDate": "2024-07-02T00:00:00.000Z",
          "reportedAt": "2024-07-03T11:00:00.000Z",
          "status": "VALID",
          "supersedesEventId": "67123...",
          "reason": "Corrected voucher date",
          "studentRef": "STU-94AD52A0A312"
        }
      ]
    }
  }
  ```

### 2. Transfer Case List & Handshake Modal
- **Component:** `<TransferHandshakeTable />` & `<TransferConfirmationDialog />`
- **Endpoint:** `GET /api/v1/transfers` & `PATCH /api/v1/transfers/:id/confirm`
- **Request Payload:**
  ```json
  {
    "side": "SENDING",
    "effectiveDate": "2024-08-10",
    "reasonCode": "STUDENT_MIGRATION_NOC_ISSUED",
    "notes": "Parent relocation NOC verified"
  }
  ```
- **Response Payload:**
  ```json
  {
    "success": true,
    "data": {
      "_id": "67125...",
      "studentRef": "STU-94AD52A0A312",
      "status": "PENDING",
      "sendingConfirmation": {
        "status": "CONFIRMED",
        "confirmedAt": "2024-08-10T14:20:00.000Z",
        "effectiveDate": "2024-08-10T00:00:00.000Z",
        "reason": "STUDENT_MIGRATION_NOC_ISSUED",
        "notes": "Parent relocation NOC verified"
      },
      "receivingConfirmation": {
        "status": "PENDING",
        "confirmedAt": null,
        "effectiveDate": null
      },
      "deadline": "2024-09-09T00:00:00.000Z",
      "ledgerSynced": false
    }
  }
  ```

### 3. Overlap Review & Resolution Dialog
- **Component:** `<OverlapReviewQueue />` & `<OverlapResolutionModal />`
- **Endpoint:** `PATCH /api/v1/overlap-cases/:id/resolve`
- **Request Payload:**
  ```json
  {
    "code": "LEGITIMATE_TRANSFER",
    "notes": "Verified inter-institution migration certificate dated 2024-08-15."
  }
  ```
- **Response Payload:**
  ```json
  {
    "success": true,
    "data": {
      "caseId": "OVR-84F172E9D4A1",
      "status": "RESOLVED",
      "explanation": "Overlap may be legitimate (e.g., permitted arrangements, pending paperwork). Applicable policy must be verified.",
      "resolution": {
        "code": "LEGITIMATE_TRANSFER",
        "notes": "Verified inter-institution migration certificate dated 2024-08-15.",
        "resolvedBy": { "userId": "admin1", "role": "AUTHORITY_ADMIN" },
        "resolvedAt": "2024-08-20T10:00:00.000Z"
      },
      "resolutionHistory": [
        {
          "code": "LEGITIMATE_TRANSFER",
          "notes": "Verified inter-institution migration certificate dated 2024-08-15.",
          "by": "director@aicte.gov.in",
          "role": "AUTHORITY_ADMIN",
          "at": "2024-08-20T10:00:00.000Z"
        }
      ]
    }
  }
  ```

---

## Recharts Graph & Chart Specifications (Features 4 & 5)

| # | Chart Name | Business Question | Recharts Component | Data Fields & Payload Structure | API Endpoint & Filters | Tooltip & Interaction Behaviour | Empty / Unavailable State Handling |
|---|---|---|---|---|---|---|---|
| **1** | **Overall Reliability Score Trend** | How has the institution's data reliability evolved over time? | `<LineChart>` / `<ResponsiveContainer>` | `calculatedAt` (X-axis), `overallScore` (Y-axis 0-100), `formulaChanged` (ReferenceLine), `isStale` | `GET /api/v1/scorecards/institutions/:id/trend` | Shows Date, Score, Band, Formula Version. Flags formula change markers. | Displays message: "Insufficient historical snapshots. Recalculate to establish baseline." |
| **2** | **Metric Sub-Score Evolution** | Which metric dimension (Completeness, Discrepancies, Timeliness) is improving or needs attention? | `<LineChart>` with multi-lines | `reportingPeriod` (X-axis), `completenessPct`, `unresolvedRatePer1000`, `onTimePct` | `GET /api/v1/scorecards/institutions/:id/trend` | Multi-line hover displaying individual metric sub-scores and weights. | Dashed line for periods where a metric was `UNAVAILABLE`. |
| **3** | **Side-by-Side Peer Comparison** | How does this institution's data profile compare with peers of the same type? | `<BarChart>` (grouped) | `institutionName` (X-axis), `m1SubScore`, `m2SubScore`, `m3SubScore`, `overallScore` | `GET /api/v1/scorecards/compare?institutions=id1,id2` | Shows institution name (or masked peer name), sub-score breakdown, comparability warnings. | Renders disabled state with warning banner if institution types mismatch. |
| **4** | **Data Completeness by Field** | Which specific student data fields have the highest frequency of missing values? | `<BarChart>` (horizontal layout) | `fieldName` (Y-axis), `missingCount` (X-axis), `populatedCount` | `GET /api/v1/scorecards/institutions/:id/metrics` | Shows Field Name, Populated Count, Missing Count, Missing %. Clicking field opens filtered roster drill-down. | Shows "100% Complete — Zero missing required field instances". |
| **5** | **Open Discrepancy Ageing Distribution** | Are reconciliation findings being cleared promptly or lingering beyond 30 days? | `<BarChart>` / `<PieChart>` | `bucket` (`0-7 days`, `8-30 days`, `31+ days`), `count` | `GET /api/v1/scorecards/institutions/:id/metrics` | Shows Age Bucket, Open Finding Count, Severity breakdown (`CRITICAL`, `WARNING`). | Shows "Zero open discrepancies in current reporting period". |
| **6** | **Admissions & Lifecycle Reporting Timeliness** | Are student lifecycle events and admissions being reported within the 15-day window? | `<PieChart>` / `<Donut>` | `category` (`On-Time (<=15d)`, `Late (>15d)`), `count`, `pct` | `GET /api/v1/scorecards/institutions/:id/metrics` | Shows category, student count, percentage, median lag days (e.g. "Median Lag: 5 days"). | Shows "Timeliness metrics unavailable: Effective admission dates are unpopulated". |
| **7** | **Transfer Handshake Status Distribution** | How many transfer cases are currently pending, confirmed, rejected, or in review? | `<BarChart>` / `<Donut>` | `status` (`PENDING`, `TRANSFER_CONFIRMED`, `NEEDS_REVIEW`, `TRANSFER_REJECTED`), `count` | `GET /api/v1/transfers` | Shows status category, pending sending vs receiving breakdowns, date-gap review counts. | Shows "Zero active transfer cases in current reporting period". |
| **8** | **Lifecycle Cohort Transition Breakdown** | What proportion of students transitioned across Enrolled, Transfer, Withdrawn, and Completed? | `<Sankey>` / `<BarChart>` | `transition` (`ADMITTED->ENROLLED`, `ENROLLED->TRANSFER`, `ENROLLED->WITHDRAWN`), `count` | `GET /api/v1/lifecycle/events` | Hover shows source state, target state, student count, percentage of cohort. | Shows "No lifecycle events recorded for current cohort". |
| **9** | **Concurrent Enrolment Overlap Observations** | How many cross-institution overlap observations exist across institutions and states? | `<BarChart>` (stacked by status) | `institution` (X-axis), `openCount`, `inReviewCount`, `resolvedCount` | `GET /api/v1/overlap-cases` | Shows institution name, observation count, neutral observation description. | Shows "Zero concurrent enrolment overlap observations detected". |
| **10** | **Assurance Label Distribution** | What proportion of reported fields carry Authority Verified, Document Supported, or Declared status? | `<PieChart>` / `<Donut>` | `label` (`AUTHORITY_VERIFIED_SIMULATED`, `DOCUMENT_SUPPORTED`, `CROSS_REGISTER_CONFIRMED`, `INSTITUTION_DECLARED`, `VERIFICATION_PENDING`), `count`, `pct` | `GET /api/v1/verifications?institutionId=:id` | Hover shows label name, percentage, confidence weight, simulation indicator. | Shows "Zero verification records found for institution". |
| **11** | **Intake Verification & Audit Timeline** | How has approved intake evolved and when were verifications/supersessions logged? | `<LineChart>` / `<ComposedChart>` | `timestamp` (X-axis), `approvedIntake` (Y-axis), `label` (Scatter dots/colors), `status` | `GET /api/v1/verifications/by-subject?subjectType=PROGRAMME_INTAKE&subjectId=:bucketKey` | Tooltip shows verified intake, label badge, reviewer/connector reference, supersession markers. | Shows "Single intake declaration recorded; no historical revisions". |
| **12** | **Connector Availability & Latency Matrix** | Are simulated and live upstream registries healthy and responding within SLA? | `<BarChart>` (horizontal layout) | `connectorName` (Y-axis), `latencyMs` (X-axis), `status` (`HEALTHY`, `DOWN`, `UNKNOWN`) | `GET /api/v1/connectors/status` | Hover shows connector ID, trusted mode (`SIMULATED`), latency in ms, last checked timestamp. | Shows "Connector health check unavailable". |

---

## Feature 6: Authority-Verified Intake and Data Assurance Labels

### 1. Canonical Assurance Labels & Evidence Precedence

The platform distinguishes institutional self-reporting from qualified evidence and authoritative verification. Every important field carries an explainable provenance record and an effective assurance label.

| Label | Confidence | Meaning & Assignment Rules |
|---|---|---|
| **`AUTHORITY_VERIFIED`** | 1.00 (Rank 7) | A qualifying **LIVE** authoritative source or authenticated authority officer review has verified the value backed by recorded regulatory orders. `sourceMode` MUST be `LIVE`. |
| **`AUTHORITY_VERIFIED_SIMULATED`** | 0.85 (Rank 6) | A simulated regulatory registry connector has verified the value against mock authority quotas. Explicitly labelled `SIMULATED`. Never confused with genuine live authority approval. |
| **`DOCUMENT_SUPPORTED`** | 0.80 (Rank 5) | An authorised reviewer has reviewed a supporting document reference (e.g. signed EOA order PDF) and recorded that the document supports the field. Merely uploading/attaching a file never automatically assigns this label. |
| **`CROSS_REGISTER_CONFIRMED`** | 0.75 (Rank 4) | At least one qualifying independent register (e.g. State Admission/Allotment Register or Examination Board Register) agrees with the value. Weak candidate matches never produce this label without review. |
| **`INSTITUTION_DECLARED`** | 0.50 (Rank 3) | Default baseline for institution-submitted values without qualifying independent verification. |
| **`VERIFICATION_PENDING`** | 0.30 (Rank 2) | A verification request is unresolved, or conflicting qualifying evidence has been recorded (`hasConflict: true`), requiring human review. |
| **`UNABLE_TO_VERIFY`** | 0.20 (Rank 1) | Upstream source is unavailable, timed out, or returned no usable record. **This is not a negative finding, mismatch, failure verdict, or proof of incorrect data.** |

### 2. Workflow Status vs Assurance Label

- **Workflow Status (`status`):** Tracks lifecycle progression (`PENDING`, `COMPLETED`, `CONFLICT`, `UNABLE_TO_VERIFY`, `EXPIRED`, `SUPERSEDED`).
- **Assurance Label (`label`):** The evidentiary certainty tier of the underlying data value. For example, a simulated verification can have workflow status `COMPLETED`, but its assurance label remains `AUTHORITY_VERIFIED_SIMULATED`.

### 3. Strict Simulation Boundary (`LIVE` vs `SIMULATED`)

1. Prototype connectors and external registers strictly run in `sourceMode: SIMULATED`.
2. Under no circumstances can a simulated connector establish genuine `AUTHORITY_VERIFIED`.
3. If an upstream simulated connector produces an authority match, the server co-erces and stores the label as `AUTHORITY_VERIFIED_SIMULATED` with `isSimulated: true`.
4. Display contracts visibly include `isSimulated: true` and display text containing `(Simulated)`. Frontend developers do not need to infer mode from unrelated fields.
5. Connector modes are server-determined; client-supplied payloads cannot spoof or override `sourceMode`.

### 4. Controlled Connector Registry

| Connector ID | Trusted Mode | Supported Subjects | Health / Availability | Behavior on Failure / Conflict |
|---|---|---|---|---|
| `mock-authority-intake` | `SIMULATED` | `PROGRAMME_INTAKE`, `SEAT_BALANCE` | `HEALTHY` (14ms) | Value match -> `AUTHORITY_VERIFIED_SIMULATED`. Value mismatch -> `VERIFICATION_PENDING` (`status: CONFLICT`). |
| `admission-register-connector` | `SIMULATED` | `ROSTER_RECORD`, `STUDENT_LIFECYCLE` | `HEALTHY` (18ms) | Match -> `CROSS_REGISTER_CONFIRMED`. Weak match -> `VERIFICATION_PENDING`. Not found -> `UNABLE_TO_VERIFY`. |
| `exam-board-connector` | `SIMULATED` | `ROSTER_RECORD`, `STUDENT_LIFECYCLE` | `HEALTHY` (22ms) | Match -> `CROSS_REGISTER_CONFIRMED`. Not found -> `UNABLE_TO_VERIFY`. |
| `failing-test-connector` | `SIMULATED` | All subjects | `DOWN` (Simulated outage) | Network error/timeout -> safely returns `UNABLE_TO_VERIFY` with zero credential leakage. |

### 5. Local Invalidation & Supersession Rules

- **Value Change Invalidation:** When an institution declares a revised intake or an authority officer changes an intake figure, any prior verification tied to the old value is marked `SUPERSEDED`. It remains in immutable history but ceases to contribute to the current effective label. The effective label deterministically resets to `INSTITUTION_DECLARED`.
- **Review Supersession:** When an authority officer confirms evidence on a verification record, prior `CONFLICT` or `PENDING` records for that subject are automatically marked `SUPERSEDED`, resolving the conflict.
- **Expiry:** Verification records with past `expiresAt` timestamps are excluded from effective label resolution.

### 6. API Endpoints Contract

#### A. Request Verification
`POST /api/v1/verifications/request`
- **Headers:** `Authorization: Bearer <token>` or `x-user-role`, optional `idempotency-key`
- **RBAC:** `AUTHORITY_ADMIN`, `AUTHORITY_OFFICER`, `INSTITUTION_ADMIN`, `INSTITUTION_OPERATOR` (institution users scoped to their own institution).
- **Request Body:**
  ```json
  {
    "subjectType": "PROGRAMME_INTAKE",
    "subjectId": "66f1b...:CSE:2024-25:GENERAL",
    "fieldPath": "approvedIntake",
    "connectorId": "mock-authority-intake",
    "institutionId": "66f1b...",
    "value": 60,
    "context": { "expectedIntake": 60 }
  }
  ```
- **Response (201 Created / 200 Replay):**
  ```json
  {
    "success": true,
    "data": {
      "verificationRecord": {
        "_id": "670a...",
        "subjectType": "PROGRAMME_INTAKE",
        "subjectId": "66f1b...:CSE:2024-25:GENERAL",
        "fieldPath": "approvedIntake",
        "label": "AUTHORITY_VERIFIED_SIMULATED",
        "sourceMode": "SIMULATED",
        "method": "CONNECTOR_API",
        "status": "COMPLETED",
        "isSimulated": true,
        "evidenceRef": "REG-APPROVAL-60-SEATS"
      },
      "effectiveLabel": {
        "effectiveLabel": "AUTHORITY_VERIFIED_SIMULATED",
        "sourceMode": "SIMULATED",
        "isSimulated": true,
        "displayBadge": {
          "text": "Authority Verified (Simulated)",
          "variant": "warning",
          "isSimulated": true,
          "confidenceScore": 0.85
        },
        "confidenceScore": 0.85,
        "provenanceList": [...]
      },
      "isReplay": false
    }
  }
  ```

#### B. Review Verification Evidence
`PATCH /api/v1/verifications/:id/review`
- **RBAC:** `AUTHORITY_ADMIN`, `AUTHORITY_OFFICER`, `PLATFORM_ADMIN` (strictly forbidden to Institution users and Auditors — 403 Forbidden).
- **Request Body:**
  ```json
  {
    "action": "CONFIRM",
    "evidenceRef": "AICTE-EOA-ORDER-2024-OFFICIAL.PDF",
    "notes": "Verified against officially uploaded approval order."
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "verificationRecord": {
        "_id": "670a...",
        "label": "DOCUMENT_SUPPORTED",
        "status": "COMPLETED",
        "method": "DOCUMENT_REVIEW",
        "evidenceRef": "AICTE-EOA-ORDER-2024-OFFICIAL.PDF"
      },
      "effectiveLabel": {
        "effectiveLabel": "DOCUMENT_SUPPORTED",
        "displayBadge": {
          "text": "Document Supported",
          "variant": "info",
          "isSimulated": false,
          "confidenceScore": 0.8
        }
      }
    }
  }
  ```

#### C. Get Effective Label and Verification History by Subject
`GET /api/v1/verifications/by-subject?subjectType=PROGRAMME_INTAKE&subjectId=:bucketKey&currentValue=60`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "subjectType": "PROGRAMME_INTAKE",
      "subjectId": "inst1:CSE:2024-25:GENERAL",
      "fieldPath": "approvedIntake",
      "currentValue": 60,
      "effective": {
        "effectiveLabel": "AUTHORITY_VERIFIED_SIMULATED",
        "sourceMode": "SIMULATED",
        "isSimulated": true,
        "displayBadge": {
          "text": "Authority Verified (Simulated)",
          "variant": "warning",
          "isSimulated": true,
          "confidenceScore": 0.85
        },
        "confidenceScore": 0.85,
        "lastVerifiedAt": "2024-08-20T10:00:00.000Z",
        "provenanceList": [
          {
            "verificationId": "670a...",
            "label": "AUTHORITY_VERIFIED_SIMULATED",
            "sourceMode": "SIMULATED",
            "method": "CONNECTOR_API",
            "evidenceRef": "REG-APPROVAL-60-SEATS",
            "verifiedAt": "2024-08-20T10:00:00.000Z",
            "isSimulated": true
          }
        ]
      },
      "history": [...]
    }
  }
  ```

#### D. Registered Connector Status
`GET /api/v1/connectors/status`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "connectors": [
        {
          "id": "mock-authority-intake",
          "name": "AICTE / Authority Regulatory Intake Registry (Simulated)",
          "mode": "SIMULATED",
          "status": "HEALTHY",
          "latencyMs": 14,
          "lastCheckedAt": "2024-10-24T10:00:00.000Z",
          "supportedSubjectTypes": ["PROGRAMME_INTAKE", "SEAT_BALANCE"],
          "isSimulated": true,
          "error": null
        }
      ],
      "timestamp": "2024-10-24T10:00:00.000Z"
    }
  }
  ```

#### E. Canonical Audit Events Query
`GET /api/v1/audit/events?institutionId=:id`
- **RBAC:** `AUTHORITY_ADMIN`, `AUTHORITY_OFFICER`, `AUDITOR`, `PLATFORM_ADMIN`, `INSTITUTION_ADMIN` (institution users strictly scoped to own institution).
- Returns auditable timeline of `VERIFICATION_REQUESTED`, `VERIFICATION_REVIEWED`, and `VERIFICATIONS_SUPERSEDED` actions with redacted sensitive payloads.

---

## Feature 7: Record Change Blast-Radius & Cryptographically Sealed Roster

### 1. Architectural Overview

Feature 7 introduces cryptographic integrity guarantees and automated dependency-aware blast-radius calculation:
1. **Change Blast-Radius Engine:** When a roster is revised and committed, the platform computes row-level diffs, identifies affected programme/category/year buckets, and marks only the appropriate derived outputs (reconciliations, seat balances, scorecards, sampling runs, verification records) as `STALE`, with explicit `staleReason` and `staleSinceVersionId`. Unaffected institutions and buckets remain strictly `FRESH`.
2. **Cryptographically Sealed Roster:** Committed rosters are canonicalised into a deterministic domain-separated SHA-256 Merkle tree (`v1.0`). Each version's root is sealed in an immutable manifest (`IntegritySeal`) linked to its predecessor (`previousSealRoot`), and anchored via an append-only cryptographic hash chain with authority Ed25519 signatures (`SealAnchor`).
3. **Core Trust Boundary Disclaimer:**
   > **A passing seal establishes integrity relative to the trusted anchor. It does not prove that the roster's original content was true or authentic.**

---

### 2. Version Lifecycle & Idempotent Commit

- **Lifecycle:** `UPLOADED → VALIDATED → COMMITTED`. (Failed validation transitions to `REJECTED`).
- **Immutability:** Once `COMMITTED`, a `RosterVersion` document and its underlying `RosterRow` entries cannot be modified or deleted via ordinary application APIs. Any correction creates a new `COMMITTED` version and transitions the prior version to `SUPERSEDED`.
- **Idempotency Contract:** Retrying a commit on an already committed upload with supported idempotency information (e.g. `Idempotency-Key` or `X-Idempotency-Key` header) safely returns the existing version without creating duplicate seals, anchors, or impact records. Retrying without idempotency headers yields `409 CONFLICT`.
- **Atomicity:** A committed version must have exactly one associated `IntegritySeal` and one corresponding `SealAnchor`. If sealing or anchoring fails, the commit transaction fails closed.

---

### 3. Canonicalisation & Merkle Tree Rules

- **Schema Version:** `sealSchemaVersion: "v1.0"`.
- **Canonical Field Allowlist:**
  - `rowKey`: Stable unique student/row identifier.
  - `applicationNo`: Masked/trimmed application number.
  - `programmeCode`: Normalised uppercase programme code.
  - `academicYear`: Normalised academic year (e.g. `2024-25`).
  - `category`: Normalised category (e.g. `GENERAL`, `OBC`, `SC`, `ST`).
  - `gender`: Normalised gender (e.g. `MALE`, `FEMALE`, `OTHER`).
  - `dob`: ISO-formatted Date of Birth (`YYYY-MM-DD`).
  - `admissionQuota`: Quota (e.g. `STATE_MERIT`, `MANAGEMENT`).
  - `admissionDate`: ISO date string or null.
  - `validationStatus`: Row validation status (`VALID`).
- **PII Exclusion:** Personal names, contact details, mobile numbers, and raw APAAR identifiers are strictly excluded from the canonical seal payload. Non-sealed metadata changes do not alter the Merkle root.
- **Domain Separation & Hashing:**
  - Leaf hash: `SHA-256(0x00 || canonicalUtf8RowBytes)`
  - Internal node hash: `SHA-256(0x01 || leftHashBytes || rightHashBytes)`
  - **Odd-Node Handling:** Promotes the unpaired node to the next tree layer without duplicate hashing.
  - **Empty Roster:** Deterministically hashes empty leaf as `SHA-256("00" || "")`.
  - **Row Ordering:** Rows are pre-sorted lexicographically by `rowKey` before tree construction, ensuring permutation-invariant roots.

---

### 4. Ed25519 Authority Anchoring & Append-Only Chain

- **Key Isolation:** The Ed25519 anchor signing private key (`ROSTER_SEAL_PRIVATE_KEY`) is completely isolated from the student-token HMAC secret (`APAAR_TOKEN_SECRET`).
- **Anchor Hash Chain:**
  - Each anchor links to the preceding anchor: `anchorHash = SHA-256(manifestHash || previousAnchorHash || sequenceNumber || timestamp)`.
  - Genesis anchor has `previousAnchorHash: null` and `sequenceNumber: 1`.
  - Digital signature covers canonical manifest bytes using platform authority Ed25519 key.
- **Verification Outcomes:**
  - `PASS`: Current stored rows recompute to the expected Merkle root, manifest hash is valid, authority Ed25519 signature verifies, and anchor-chain continuity is intact.
  - `FAIL`: Tampering detected—leaf hashes diverge, row count mismatch, or altered manifest/signature. Identifies mismatched row keys where feasible.
  - `INCONCLUSIVE`: Integrity cannot be established due to missing anchor, corrupted chain links, or unconfigured signing authority. Never returns a false PASS.

---

### 5. Blast-Radius & Output Freshness Contract

When a new version $V_{k}$ supersedes $V_{k-1}$:
1. **Row Diff Engine:** Classifies all rows into:
   - `ADDED`: New row present in $V_k$ absent in $V_{k-1}$.
   - `REMOVED`: Row present in $V_{k-1}$ absent in $V_k$.
   - `MODIFIED`: Row present in both with field-level delta.
   - `UNCHANGED`: Identical tracked fields across versions.
   - `UNKEYED`: Rows lacking stable identity reference.
2. **Affected Buckets:** Builds bucket keys (`{institutionId}__{prog}__{year}__{cat}`) for every added, removed, or modified row.
3. **Derived Output Freshness Updates:**
   - **`ReconciliationRun`:** Runs referencing superseded version $V_{k-1}$ are marked `freshness: "STALE"`, `revalidationStatus: "NOT_STARTED"`.
   - **`SeatBalance`:** Only balances whose `bucketKey` is in the affected bucket set are marked `freshness: "STALE"`. Unaffected programme/category buckets remain `freshness: "FRESH"`.
   - **`ScoreSnapshot`:** Reliability scorecards for that academic year are marked `isStale: true`, `freshness: "STALE"`, `revalidationStatus: "QUEUED"`.
   - **`SamplingRun`:** Historical sampling runs referencing $V_{k-1}$ are marked `freshness: "STALE"`, `revalidationStatus: "BLOCKED"`. Their selected sample and audit items remain strictly preserved.
   - **`VerificationRecord`:** Verification records referencing affected buckets are marked `freshness: "STALE"`.
4. **Revalidation Capabilities:**
   - `SCORECARD_SNAPSHOT`: Re-calculates and persists fresh snapshot, transitioning stale record to `revalidationStatus: "REVALIDATED"`.
   - `SAMPLING_RUN`: Returns `revalidationStatus: "BLOCKED"` (historical audit samples cannot be retroactively resampled).
   - `SEAT_BALANCE`: Returns `revalidationStatus: "NOT_APPLICABLE"` (updated automatically through subsequent roster upload reconciliations).

---

### 6. API Endpoints

#### A. List Committed Roster Versions
`GET /api/v1/roster-versions?academicYear=2024-25`
- **RBAC:** `INSTITUTION_ADMIN`, `INSTITUTION_OPERATOR`, `AUTHORITY_ADMIN`, `AUTHORITY_OFFICER`, `AUDITOR`.
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "items": [
        {
          "_id": "670b...",
          "versionNumber": 2,
          "status": "COMMITTED",
          "rowCount": 150,
          "academicYear": "2024-25",
          "isSealed": true,
          "merkleRoot": "a1b2c3d4...",
          "isAnchored": true,
          "anchorSequence": 2,
          "committedAt": "2024-10-24T12:00:00.000Z"
        }
      ],
      "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
    }
  }
  ```

#### B. Compare Roster Versions & Row Diffs
`GET /api/v1/roster-versions/:id/compare?withVersionId=:prevId&page=1&limit=50`
- **RBAC:** Enforces strict institution scoping.
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "currentVersion": { "id": "670b...", "versionNumber": 2, "rowCount": 3 },
      "previousVersion": { "id": "670a...", "versionNumber": 1, "rowCount": 2 },
      "summary": {
        "totalCurrent": 3,
        "totalPrevious": 2,
        "added": 1,
        "removed": 0,
        "modified": 1,
        "unchanged": 1,
        "unkeyed": 0,
        "affectedBucketsCount": 2,
        "affectedBuckets": [
          "670a...__BTECH-CS__2024-25__GENERAL",
          "670a...__BTECH-CS__2024-25__OBC"
        ]
      },
      "changes": [
        {
          "rowKey": "STUDENT_001",
          "changeType": "MODIFIED",
          "applicationNoMasked": "APP-***1",
          "programmeCode": "BTECH-CS",
          "category": "OBC",
          "fieldDiffs": [
            { "field": "category", "before": "GENERAL", "after": "OBC" }
          ]
        }
      ],
      "pagination": { "page": 1, "limit": 50, "total": 3, "totalPages": 1 }
    }
  }
  ```

#### C. Get Blast-Radius Impact Record
`GET /api/v1/roster-versions/:id/impact`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "impactId": "impact_9c7e...",
      "institutionId": "670a...",
      "academicYear": "2024-25",
      "rosterVersionId": "670b...",
      "supersededVersionId": "670a...",
      "changeSummary": { "total": 3, "added": 1, "removed": 0, "modified": 1, "unchanged": 1, "unkeyed": 0 },
      "affectedBuckets": ["670a...__BTECH-CS__2024-25__OBC"],
      "affectedOutputsCount": {
        "reconciliationRuns": 1,
        "seatBalances": 1,
        "scorecardSnapshots": 1,
        "samplingRuns": 1,
        "verificationRecords": 0,
        "total": 4
      },
      "affectedOutputs": [
        {
          "outputType": "SCORECARD_SNAPSHOT",
          "outputId": "670c...",
          "name": "Data Reliability Scorecard (2024-25)",
          "previousFreshness": "FRESH",
          "currentFreshness": "STALE",
          "revalidationStatus": "QUEUED"
        }
      ]
    }
  }
  ```

#### D. Get Cryptographic Seal Manifest
`GET /api/v1/roster-versions/:id/seal`
- Returns sealed manifest metadata including `merkleRoot`, `previousSealRoot`, `manifestHash`, `leafHashAlgorithm: "SHA-256"`, and `treeDepth`.

#### E. Verify Sealed Roster Cryptographic Integrity
`POST /api/v1/roster-versions/:id/verify-seal`
- Recomputes the Merkle tree from current stored rows, validates Ed25519 signature, checks anchor hash chain continuity, and diagnoses mismatched row keys.
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "result": "PASS",
      "checkedAt": "2024-10-24T12:00:00.000Z",
      "versionId": "670b...",
      "versionNumber": 2,
      "expectedMerkleRoot": "a1b2c3d4...",
      "recomputedMerkleRoot": "a1b2c3d4...",
      "merkleRootMatch": true,
      "signatureValid": true,
      "chainContinuityValid": true,
      "mismatchedRowKeys": [],
      "explanation": "Cryptographic integrity verified against trusted anchor sequence 2. Stored roster rows match the signed Merkle root exactly."
    }
  }
  ```

#### F. Download Cryptographic Commitment Receipt
`GET /api/v1/roster-versions/:id/receipt`
- Returns signed cryptographic receipt containing sealed manifest, anchor reference, signature, and public key identifier. Excludes raw student names and contact details.

#### G. Export Signed Chain-Head
`GET /api/v1/roster-versions/chain-head?institutionId=:id&academicYear=2024-25`
- Returns authoritative tip of the append-only anchor chain for off-site verifiers.

#### H. Revalidate Stale Output
`POST /api/v1/roster-versions/:id/revalidate`
- **Body:** `{ "outputType": "SCORECARD_SNAPSHOT", "outputId": "670c..." }`
- Executes real re-calculation, links fresh output, and updates stale record to `REVALIDATED`.

---

### 7. Security, Prototype Boundaries & Deployment Considerations

- **Least-Privilege Database User:** Mongoose append-only controls prevent application-level edits. In production deployment, the MongoDB database user assigned to the application should have write permissions on `SealAnchor` restricted to `insert` only (no `update` or `delete`).
- **External Notarisation:** For production, signed chain-head receipts should be periodically notarised to an external authority timestamping service or distributed public log.
- **Key Rotation:** The Ed25519 signing key is referenced by `keyId: "auth-ed25519-v1"`. Key rotations create a new key version without invalidating historical signatures.

---

## Platform Security Architecture: Authentication, Authorization & RBAC

The platform incorporates an enterprise-grade security layer designed around OWASP recommendations, defense-in-depth, zero-trust tenant isolation, and strict role-based access control (RBAC).

### 1. Cryptographic Authentication & Password Storage

- **Password Hashing:** Uses Node.js native `crypto.scrypt` with OWASP-recommended parameters ($N=16384, r=8, p=1$), 32-byte cryptographically secure random salt, and 64-byte derived keys.
- **Constant-Time Verification:** Password comparison executes via `crypto.timingSafeEqual` over fixed-length key buffers, preventing side-channel timing attacks.
- **Brute-Force & Lockout Protection:** The platform monitors failed login attempts per account. Five consecutive failed attempts trigger an automated 15-minute account lockout (`429 ACCOUNT_LOCKED`). Counters reset immediately upon successful authentication.
- **Credential Sanitization:** User serialization models strictly exclude `passwordHash` by default (`select: false`). Passwords, hashes, and session secrets are never serialized into API responses or audit logs.
- **Account Disablement:** Inactive accounts (`isActive: false`) are denied authentication immediately (`401 ACCOUNT_DISABLED`).

---

### 2. Access Token & Refresh Session Lifecycle

- **Access Tokens (JWT):** Short-lived access tokens valid for **15 minutes**. Signed using HS256 with environment-configured `JWT_SECRET` (distinct from APAAR HMAC student tokens and Ed25519 seal signing keys). Tokens encode subject (`sub`), email, canonical role, institution ID, assigned institutions, and session `tokenVersion`.
- **Refresh Tokens:** High-entropy 64-byte random hex tokens valid for **7 days**. Stored exclusively in an `httpOnly`, `Secure` (production), `SameSite=Lax` cookie scoped to path `/api/v1/auth`.
- **Hashed Token Persistence:** Plaintext refresh tokens are never persisted in MongoDB. Only SHA-256 cryptographic hashes (`tokenHash`) are stored alongside session lineage metadata (`familyId`).
- **Cryptographic Rotation:** Every successful call to `POST /api/v1/auth/refresh` revokes the incoming token and issues a brand new refresh token with rotated cryptographic lineage.
- **Reuse Detection Safeguard:** If an already rotated or revoked refresh token is presented, the system detects a replay attack, instantly revokes all refresh tokens in that session family (`familyId`), increments the user's `tokenVersion`, clears cookies, and logs a high-severity security audit event (`REFRESH_TOKEN_REUSE_DETECTED`).
- **Immediate Invalidation (`tokenVersion`):** Password changes, account disablement, role upgrades, and tenant scope changes increment `tokenVersion`, invalidating all active access tokens on the subsequent API request without waiting for token expiry.

---

### 3. Canonical Role & Permission Matrix

The platform enforces a single source of truth (`src/config/permissions.js`) defining 28 granular permissions mapped to 6 canonical roles:

| Role | Scope | Key Capabilities | Prohibited Operations |
| :--- | :--- | :--- | :--- |
| **`PLATFORM_ADMIN`** | Platform-Wide | User management, institution provisioning, system governance. | Direct modification or deletion of immutable audit trails or seal anchors. |
| **`AUTHORITY_ADMIN`** | Regulatory Authority | Scoring weights, sampling thresholds, correction approvals, cross-institution oversight. | Roster row data tampering; mutating immutable seal chains. |
| **`AUTHORITY_OFFICER`**| Assigned Institutions | Reconciliation inspection, sampling review, transfer/overlap decisions, seal verification. | Accessing unassigned institutions; mutating institution-owned drafts. |
| **`AUDITOR`** | Global Read-Only | Read-only inspection of dashboards, registers, audit logs, and receipts. | **STRICTLY FORBIDDEN from all mutation methods (`POST`, `PUT`, `PATCH`, `DELETE`).** |
| **`INSTITUTION_ADMIN`** | Own Institution | Uploading rosters, committing versions, requesting corrections, confirming transfers. | Accessing other institutions (IDOR); approving authority corrections. |
| **`INSTITUTION_OPERATOR`**| Own Institution | Data entry, CSV preview, drafting lifecycle events, submitting discrepancy responses. | Committing roster versions (`rosters:commit`); confirming transfer handshakes. |

---

### 4. Tenant Isolation & IDOR Protection

1. **Derived Institutional Scope:** An institution user's scope is strictly derived from the validated server-side token identity, never from client-supplied URL parameters or request bodies.
2. **Authority-Officer Assignment Enforcement:** Officers assigned to specific institutions (`assignedInstitutionIds`) are bounded to their assigned scope; querying unassigned institutions fails closed (`403 FORBIDDEN`).
3. **Auditor Read-Only Enforcement:** Global middleware intercepts all mutation requests from users with the `AUDITOR` role and returns `403 FORBIDDEN`, regardless of which route is targeted.
4. **Sole Platform Admin Protection:** The user management controller actively prevents deleting, demoting, or disabling the platform's last active `PLATFORM_ADMIN` account (`SOLE_ADMIN_PROTECTION`).

---

### 5. CLI First-Admin Bootstrap Workflow

To prevent insecure public registration or default hardcoded credentials, the platform provides a command-line bootstrap script:

```powershell
# Set initial admin credentials in the local environment
$env:INITIAL_ADMIN_EMAIL="admin@aicte.gov.in"
$env:INITIAL_ADMIN_PASSWORD="SecureBootstrapPassword123!"
$env:INITIAL_ADMIN_NAME="Central Platform Administrator"

# Run provisioning script
node src/scripts/bootstrapAdmin.js
```

**Safeguards:**
- Aborts immediately if any `PLATFORM_ADMIN` already exists in MongoDB.
- Requires explicit environment-supplied credentials.
- Unreachable over HTTP or public API routes.

---

### 6. Authentication & User Management API Contracts

#### A. Step 1: Password Validation & OTP Challenge Dispatch
`POST /api/v1/auth/login`
- **Rate Limit:** 10 attempts per 15 minutes per IP.
- **Request Body:**
  ```json
  {
    "email": "admin@institution.edu",
    "password": "UserPassword123!"
  }
  ```
- **Response (200 OK):**
  - **Crucial Security Property:** Does NOT issue access tokens or set refresh cookies.
  - Body:
    ```json
    {
      "success": true,
      "data": {
        "mfaRequired": true,
        "challengeId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
        "expiresAt": "2026-10-25T18:00:00.000Z",
        "maskedEmail": "a***n@institution.edu",
        "message": "Verification OTP sent to your registered email address."
      }
    }
    ```

#### B. Step 2: Verify Login OTP & Session Establishment
`POST /api/v1/auth/verify-login-otp`
- **Rate Limit:** 15 attempts per 15 minutes per IP.
- **Request Body:**
  ```json
  {
    "challengeId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "otp": "491823"
  }
  ```
- **Response (200 OK):**
  - Atomically consumes the single-use OTP challenge (prevents replay/race conditions).
  - Sets `refreshToken` in `httpOnly`, `SameSite=Strict`, `secure` cookie.
  - Body:
    ```json
    {
      "success": true,
      "data": {
        "user": {
          "id": "670c...",
          "email": "admin@institution.edu",
          "name": "Prof. Rao",
          "role": "INSTITUTION_ADMIN",
          "institutionId": "670b...",
          "permissions": ["rosters:commit", "rosters:upload", "..."]
        },
        "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
        "permissions": ["rosters:commit", "rosters:upload", "..."]
      }
    }
    ```

#### C. Resend Login OTP
`POST /api/v1/auth/resend-login-otp`
- **Rate Limit:** 5 requests per 15 minutes per IP.
- **Request Body:**
  ```json
  {
    "challengeId": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
  }
  ```
- Generates a fresh 6-digit OTP, updates challenge hash, and resets remaining attempts.

#### D. Account Creation & Activation Lifecycle
1. **Administrator Creates User:**
   `POST /api/v1/users` (Restricted to `PLATFORM_ADMIN`)
   - Validates role, institutional assignments, and uniqueness.
   - Creates user with `isActivated: false`, `emailVerified: false`.
   - Generates single-use cryptographically random token (stored only as SHA-256 hash).
   - Sends branded activation email containing unique URL: `${APP_BASE_URL}/activate?token=${rawToken}`.
2. **User Activates Account & Sets Password:**
   `POST /api/v1/auth/activate-account` (Public endpoint)
   - **Request Body:**
     ```json
     {
       "token": "4a1f8b2c9d...",
       "password": "SecurePassword123!"
     }
     ```
   - Validates token hash and expiration.
   - Enforces password strength (min 8 characters).
   - Hashes password via scrypt with cryptographically random salt.
   - Atomically updates user to `isActivated: true`, `emailVerified: true`, clears activation token hash, and logs canonical audit event.
   - Unactivated accounts are strictly rejected from logging in with `ACCOUNT_NOT_ACTIVATED`.

#### E. Resend Activation Email
`POST /api/v1/users/:id/resend-activation` (Restricted to `PLATFORM_ADMIN`)
- Invalidates any prior token, generates a fresh single-use activation token, and dispatches a new activation email.

#### F. Refresh Token Rotation
`POST /api/v1/auth/refresh`
- **Cookie:** `refreshToken=<token>`
- **Response (200 OK):** Rotates `refreshToken` cookie and returns fresh `accessToken`. Automatic family revocation on detected reuse.

#### G. Logout
`POST /api/v1/auth/logout`
- Revokes the refresh session family, clears cookie, and logs audit event.

#### H. Current User Identity & Permissions
`GET /api/v1/auth/me`
- **Headers:** `Authorization: Bearer <accessToken>`
- **Response (200 OK):** Returns current database-verified identity, institution scope, and permissions list.

#### I. Change Password
`POST /api/v1/auth/change-password`
- **Headers:** `Authorization: Bearer <accessToken>`
- **Body:** `{ "currentPassword": "OldPassword123!", "newPassword": "NewPassword456!" }`
- Updates scrypt hash, increments `tokenVersion`, revokes active refresh tokens, and requires fresh login.

#### J. User Management (Platform Admin Only)
- `GET /api/v1/users`: List users with role/institution filtering.
- `POST /api/v1/users`: Create user account in pending activation state.
- `PATCH /api/v1/users/:id`: Update role, status, or assignment scope (protected against sole admin demotion).
- `POST /api/v1/users/:id/resend-activation`: Issue fresh activation token for pending account.

---

### 7. Frontend Integration Contract

- **Access Token Handling:** The React/Vite frontend must keep the `accessToken` strictly in-memory (e.g. React Context or auth store), never in `localStorage` or `sessionStorage` (preventing XSS exfiltration).
- **Credentials in Requests:** All API calls to `/api/v1/auth/*` must include `credentials: 'include'` (Fetch API) or `withCredentials: true` (Axios) so the browser transmits the `httpOnly` refresh cookie.
- **UI Element Gating:** The frontend should consume the `permissions` array from `GET /api/v1/auth/me` to toggle visibility of sensitive buttons (e.g. Commit Roster, Recalculate Scorecard), while recognizing that the backend server strictly enforces the authorization boundary.

---

## Prompt 10: Canonical Permission Matrix Reconciliation & Synthetic Demo Data Seeding Engine

### 1. Canonical Permission Matrix Reconciliation

The permission matrix has been reconciled against the canonical project specification to establish strict separation of administrative duties, eliminate over-broad permissions, and enforce multi-tenant isolation.

#### A. Role Scopes and Separation of Duties

| Role | Domain Scope | Primary Responsibilities | Strict Exclusions & Defenses |
| :--- | :--- | :--- | :--- |
| `PLATFORM_ADMIN` | Platform Wide | System health, user lifecycle, tenant management, audit viewing. | **Excluded from domain operations**: cannot upload/commit rosters, run reconciliations, or alter quotas. |
| `AUTHORITY_ADMIN` | National / Regulatory | Full cross-institutional oversight, multi-institution reconciliations, quota approvals, scoring configuration, sampling closure. | Excluded from impersonating institution staff or declaring internal institutional roster drafts. |
| `AUTHORITY_OFFICER` | Assigned Institutions | Reconciliation reviews, weak candidate match decisions, initiating sampling audits, resolving transfer timeouts. | Strictly scoped to `assignedInstitutionIds` (no silent fallback to global access). Cannot approve intake or close audits. |
| `INSTITUTION_ADMIN` | Own Institution Only | Roster commitment, intake capacity declaration, transfer handshakes, own scorecard recalculation. | Strictly scoped to own `institutionId`. Denied cross-institution queries (IDOR defense) and authority operations. |
| `INSTITUTION_OPERATOR` | Own Institution Only | CSV roster staging and upload, reporting lifecycle events. | Denied roster commitment (`rosters:commit`), transfer approvals, and quota declaration. |
| `AUDITOR` | Global (Read-Only) | Independent verification, Merkle seal audits, viewing scorecards, reports, and logs. | **Strictly read-only**: denied all mutation methods (`POST`, `PUT`, `PATCH`, `DELETE`) with HTTP 403 Forbidden. |

#### B. Canonical Permission Mapping

| Permission Constant | Canonical Permitted Roles | Notes |
| :--- | :--- | :--- |
| `PERMISSIONS.ROSTERS_UPLOAD` | `INSTITUTION_ADMIN`, `INSTITUTION_OPERATOR` | Platform Admin removed |
| `PERMISSIONS.ROSTERS_COMMIT` | `INSTITUTION_ADMIN` | Strictly institution admin; Platform Admin removed |
| `PERMISSIONS.RECONCILIATION_RUN` | `AUTHORITY_ADMIN`, `AUTHORITY_OFFICER` | Institution and Platform Admin removed |
| `PERMISSIONS.SAMPLING_CREATE` | `AUTHORITY_ADMIN`, `AUTHORITY_OFFICER` | Authority officers can initiate audit samples |
| `PERMISSIONS.SAMPLING_CLOSE` | `AUTHORITY_ADMIN` | Final audit closure restricted to authority admin |
| `PERMISSIONS.SCORECARDS_RECALCULATE` | `AUTHORITY_ADMIN`, `INSTITUTION_ADMIN` | Institution admin can only recalculate own institution |
| `PERMISSIONS.SEAT_INTAKE_DECLARE` | `INSTITUTION_ADMIN` | Self-declared intake capacity for own institution |
| `PERMISSIONS.SEAT_INTAKE_APPROVE` | `AUTHORITY_ADMIN` | Regulatory approval strictly authority admin |
| `PERMISSIONS.SEAT_RULES_UPDATE` | `AUTHORITY_ADMIN` | System-wide seat allocation rules |
| `PERMISSIONS.SCORING_CONFIG_UPDATE` | `AUTHORITY_ADMIN` | Weight configuration for institutional scorecards |
| `PERMISSIONS.TRANSFERS_CREATE` | `INSTITUTION_ADMIN` | Initiating student seat transfer from sending side |
| `PERMISSIONS.TRANSFERS_CONFIRM_OWN_SIDE` | `INSTITUTION_ADMIN` | Two-sided transfer handshake confirmation |
| `PERMISSIONS.TRANSFERS_PROCESS_TIMEOUTS` | `AUTHORITY_ADMIN`, `AUTHORITY_OFFICER` | Processing expired transfers to `NEEDS_REVIEW` |
| `PERMISSIONS.OVERLAP_RESOLVE` | `AUTHORITY_ADMIN`, `AUTHORITY_OFFICER` | Resolving concurrent dual enrolment findings |
| `PERMISSIONS.LIFECYCLE_WRITE` | `INSTITUTION_ADMIN`, `INSTITUTION_OPERATOR` | Reporting student enrolment, transfer, dropouts |

---

### 2. Synthetic Demo Data Seeding Engine

The platform includes a safe, deterministic, interconnected synthetic dataset populating Features 1–7 with 15 planted regulatory scenarios (P1–P15), verifiable Merkle seals, and Ed25519 digital signatures.

#### A. Safety Guards & Integrity Guarantees

1. **Production Guard:** Explicitly rejects execution if `NODE_ENV === 'production'`.
2. **Explicit Opt-in:** Requires `DEMO_SEED_ENABLED=true` in environment or CLI options.
3. **Password Validation:** Enforces `DEMO_SEED_PASSWORD` (minimum 8 characters); plaintext passwords are never printed or committed.
4. **Collision Protection:** Pre-checks all demo emails before execution. Halts immediately with `CONFLICT SAFETY HALT` if any non-demo account collides, aborting before any database modification.
5. **Database Protection:** Strictly forbids dropping the database (`db.dropDatabase()` prohibited). Cleanups are strictly bounded to demo institutions (`dataMode: 'DEMO'`).
6. **Privacy Preservation:** Zero real student PII. Names are synthetic with `(Demo)` indicators, student identifiers are hashed with HMAC-SHA256 tokens (`TEST-` namespace).
7. **Source Provenance:** All external feeds are visibly marked `sourceMode: 'SIMULATED'`.

#### B. The Six Demo Institutions

| Institution Code | Name | Type | Key Planted Scenarios |
| :--- | :--- | :--- | :--- |
| `SIT-DEMO-01` | Apex Institute of Technology (Demo) | Engineering | Multi-version history (V1, V2), P1 (Over-capacity), P3 (Duplicates), P9 (Blast-radius stale outputs) |
| `SIT-DEMO-02` | Beacon National Engineering College (Demo) | Engineering | Target for P10 opt-in tampering demonstration, P11 (Source feed unavailable) |
| `SIT-DEMO-03` | Crestview School of Management (Demo) | Management | P6 (Incomplete required fields: missing DOB and unspecified categories) |
| `SIT-DEMO-04` | Delta Polytechnic Academy (Demo) | Polytechnic | P7 (Late admissions reporting > 90 days), P13 (Self-declared intake capacity) |
| `SIT-DEMO-05` | Everest Institute of Technology (Demo) | Engineering | P8 (Repeated field corrections activity, M4 score zero-penalty) |
| `SIT-DEMO-TINY` | Horizon Micro Technical Campus (Demo) | Polytechnic | P15 (Small-denominator protection: 35 rows < 50 threshold, band `INSUFFICIENT_DATA`) |

#### C. Safe Demo Accounts

All demo accounts use the reserved `@example.test` domain and have their initial password set via `DEMO_SEED_PASSWORD`:

| Email | Role | Scope | Purpose |
| :--- | :--- | :--- | :--- |
| `platform-admin@example.test` | `PLATFORM_ADMIN` | Global | Tenant management, user provisioning, system health |
| `authority-admin@example.test` | `AUTHORITY_ADMIN` | National | Regulatory audits, sampling closure, intake approvals |
| `authority-officer@example.test` | `AUTHORITY_OFFICER` | Assigned (`SIT-DEMO-01`, `02`) | Candidate reviews, transfer timeout handling |
| `auditor@example.test` | `AUDITOR` | Global | Independent read-only auditing, seal verification |
| `inst-admin-01@example.test` | `INSTITUTION_ADMIN` | `SIT-DEMO-01` | Institutional administration, roster commitment |
| `inst-operator-01@example.test` | `INSTITUTION_OPERATOR` | `SIT-DEMO-01` | Roster upload and lifecycle event reporting |
| `inst-admin-02@example.test` | `INSTITUTION_ADMIN` | `SIT-DEMO-02` | Transfer recipient administration |

#### D. The 15 Planted Regulatory Scenarios (P1–P15)

| Scenario ID | Title | Planted Conditions | Verification Criteria |
| :--- | :--- | :--- | :--- |
| **P1** | Seat Bucket Over Limit | 63 admitted in BTECH-CSE GENERAL against approved intake of 60 in SIT-DEMO-01 | `status === 'OVER_CAP_DISCREPANCY'`, `reportedOccupancy: 63`, `headroom: -3` |
| **P2** | Absent from Admission Register | Synthetic students omitted from state allotment register | Discrepancy findings (`UNMATCHED` / `MISSING_FROM_ROSTER`) logged for review |
| **P3** | Duplicate Candidates | Identical Name + DOB + Programme Code in roster with different application numbers | `DUPLICATE_CANDIDATE` finding flagged for human review (no auto-merge) |
| **P4** | Confirmed Transfer Handshake | Two-sided transfer handshake completed between SIT-DEMO-01 and SIT-DEMO-02 | `status === 'CONFIRMED'`, `-1` seat ledger entry on sending, `+1` on receiving |
| **P5** | Pending Transfer Timeout | Expired transfer past confirmation deadline | Safely transitioned to `NEEDS_REVIEW` (never auto-confirmed) |
| **P6** | Incomplete Required Fields | 9 student rows missing Date of Birth or with `GENERAL_UNSPECIFIED` category | Validation warnings flagged during staging preview without halting ingestion |
| **P7** | Late Admissions Reporting | 20 lifecycle events seeded with reporting lag, including 90-day delay in SIT-DEMO-04 | Metric M3 captures reporting lag; events properly timestamped |
| **P8** | Repeated Corrections | 15 data correction history events on SIT-DEMO-05 with repeat flags | M4 score accurately penalizes repeated corrections |
| **P9** | Blast-Radius Stale Outputs | V1 superseded by V2 in SIT-DEMO-01 | Dependent scorecards marked `STALE`, `ImpactRecord` details affected buckets |
| **P10** | Sealed Roster Tampering | Isolated opt-in scenario via CLI tamper tool | Merkle verification isolates mutated row, signature check flags tampering |
| **P11** | External Source Unavailable | Exam connector simulated as offline | Reconciliation records `sourceUnavailable: 1` without false mismatch penalties |
| **P12** | Weak Candidate Match | Candidate matching solely on Name + DOB + Programme (K3 key) | `CANDIDATE_REVIEW` finding flagged; human review queue populated |
| **P13** | Self-Declared Intake | Seat intake capacity without authority sign-off | Labeled `INSTITUTION_DECLARED` / `INTAKE_UNVERIFIED` |
| **P14** | Sampling Non-Response | 208 sampling items marked `UNCONFIRMED` in audit run | Non-response isolated from failure rate; Wilson interval computed properly |
| **P15** | Small-Denominator Protection | SIT-DEMO-TINY seeded with exactly 35 rows (< 50 threshold) | Scorecard band is `INSUFFICIENT_DATA`, `overallScore === null` |

---

### 3. CLI Commands and Workflows

#### A. Seed Demo Dataset
Populates the deterministic synthetic dataset across all demo institutions:
```powershell
npm.cmd run seed:demo
```
*Options:*
- To perform a clean rebuild of demo records: `node src/scripts/seedDemoData.js --clean`

#### B. Verify Demo Dataset Health
Runs the non-destructive verification tool inspecting summary counts, planted scenarios P1–P15, foreign keys, and Merkle seals:
```powershell
npm.cmd run seed:demo:verify
```

#### C. Opt-In Cryptographic Tamper Demonstration (P10)
Demonstrates the Merkle integrity verification and digital seal security by mutating a row in committed roster version 1 of `SIT-DEMO-02`:
```powershell
# 1. Tamper with a committed row in SIT-DEMO-02
npm.cmd run demo:tamper

# 2. Re-verify seals to observe cryptographic breach detection
npm.cmd run seed:demo:verify

# 3. Restore the tampered row to pristine state
npm.cmd run demo:restore

# 4. Re-verify to observe seal restoration
npm.cmd run seed:demo:verify
```

#### D. Run Verification Test Suite
Executes the comprehensive 20-check automated test suite validating safety guards, idempotency, foreign key integrity, RBAC boundaries, and scenario assertions:
```powershell
npm.cmd test -- tests/seed.test.js
```

---

## Prompt 11: Email Authentication, Security Audit & Complete Platform Testing

### 1. Email Service & Resend Integration

The platform integrates transactional email delivery using the official `resend` Node.js SDK, supporting branded, responsive HTML and plain-text activation and login OTP emails.

#### A. Environment Configuration
Add the following variables to `.env` (sanitized placeholders in `.env.example`):
```text
# Transactional Email (Resend)
RESEND_API_KEY=re_your_api_key_here
MAIL_FROM="SIH AICTE Platform <notifications@yourverifieddomain.gov.in>"
APP_BASE_URL="http://localhost:5173"

# Authentication Expiry & Attempt Limits
ACTIVATION_TOKEN_EXPIRY_MINUTES=1440   # 24 hours
OTP_EXPIRY_MINUTES=10                  # 10 minutes
OTP_MAX_ATTEMPTS=5                     # Max wrong OTP attempts per challenge

# Ed25519 Seal Digital Signatures (Production requirement)
SEAL_SIGNING_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
SEAL_SIGNING_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
```

#### B. Development & Test Mock Mail Adapter
- In development/test environments (`NODE_ENV !== 'production'`), if `RESEND_API_KEY` is omitted or unverified, the email service automatically routes emails into an **in-memory testing mailbox**.
- The in-memory mailbox captures recipient, subject, token, and OTP without contacting external servers or leaking details over HTTP APIs.
- Dedicated inspection helpers (`getLatestOtpForTesting()`, `getLatestActivationTokenForTesting()`, `getTestMailbox()`) allow integration tests to reliably verify authentication flows.
- **Production Guard:** In `production` (`NODE_ENV === 'production'`), test mailbox inspection helpers strictly return `null` or `[]`. Missing or invalid `RESEND_API_KEY` triggers an immediate `SECURITY_ERROR: Email delivery service is unavailable. Production requires a configured RESEND_API_KEY.`. **The system NEVER bypasses OTP or falls back to password-only login.**

---

### 2. Account Creation & Activation Flow

User creation is restricted to authorized `PLATFORM_ADMIN` users (public registration is prohibited):

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Platform Admin
    actor User as New User
    participant API as Backend API
    participant DB as MongoDB Atlas
    participant Mail as Resend / Mail Service

    Admin->>API: POST /api/v1/users (role, email, institution)
    API->>API: Validate role & tenant assignment
    API->>API: Generate crypto-random activation token (32 bytes)
    API->>DB: Save user (isActivated=false, activationTokenHash=SHA256, expiresAt=+24h)
    API->>Mail: sendActivationEmail(email, token, activationUrl)
    Mail-->>User: Delivery: "Activate Your Account"
    User->>API: POST /api/v1/auth/activate-account (token, password)
    API->>API: Verify token hash & expiry
    API->>API: Hash password (scrypt + random salt)
    API->>DB: Update user (isActivated=true, emailVerified=true, clear token)
    API->>DB: Append canonical audit event (USER_ACTIVATED)
    API-->>User: 200 OK (Account activated successfully)
```

**Security Controls:**
- Only the SHA-256 hash of activation tokens is stored in the database.
- Raw activation tokens are never returned in API responses or written to audit logs.
- Single-use: once consumed, the token hash and expiry are atomically erased.
- Unactivated accounts cannot authenticate; `POST /api/v1/auth/login` rejects them with HTTP 403 `ACCOUNT_NOT_ACTIVATED`.

---

### 3. Two-Step Email OTP Login Specification

Authentication enforces mandatory two-factor verification for all roles:

```mermaid
sequenceDiagram
    autonumber
    actor Client as Web Frontend / Client
    participant API as Auth Controller
    participant DB as MongoDB (User, OTP Challenges)
    participant Mail as Resend / Mail Service

    Client->>API: POST /api/v1/auth/login (email, password)
    API->>DB: Fetch user (check lockout, status, isActivated)
    API->>API: Verify password via scrypt (timing-safe)
    API->>API: Generate 6-digit OTP & UUID challengeId
    API->>DB: Create LoginOtpChallenge (challengeId, otpHash=SHA256, maxAttempts=5, TTL index)
    API->>Mail: sendLoginOtpEmail(email, otp)
    API-->>Client: 200 OK { mfaRequired: true, challengeId, expiresAt, maskedEmail }
    Note over Client,API: NO JWT tokens or cookies issued yet!

    Client->>API: POST /api/v1/auth/verify-login-otp (challengeId, otp)
    API->>DB: Find challenge (atomic concurrency check)
    API->>API: Verify OTP timing-safe (crypto.timingSafeEqual)
    API->>DB: Mark challenge consumed (isConsumed=true, consumedAt=now)
    API->>DB: Create RefreshToken session family
    API->>Client: 200 OK (Sets httpOnly refreshToken cookie + returns short-lived accessToken)
```

**Security Safeguards:**
- **Zero Token Leakage:** Step A strictly issues zero access tokens and sets zero cookies.
- **Atomic Challenge Consumption:** `findOneAndUpdate` with `{ isConsumed: false }` guarantees concurrent verification requests cannot consume the same challenge twice.
- **Attempt Limiting:** Maximum 5 attempts. Exceeding the limit immediately invalidates the challenge with HTTP 400 `OTP_MAX_ATTEMPTS_EXCEEDED`.
- **Timing-Attack Resistance:** OTP comparison uses `crypto.timingSafeEqual` over SHA-256 digests.
- **Rate Limiting:** Login (10 req/15 min), OTP verification (15 req/15 min), and Resend (5 req/15 min) endpoints are protected against brute-force attacks.
- **Account Enumeration Defense:** Generic error messages prevent attackers from discovering valid user accounts.

---

### 4. Cryptographic Key Management & Ed25519 Production Guardrails

The platform maintains strict separation of cryptographic domains:
1. **Student Token HMAC:** `STUDENT_HMAC_SECRET` (Keyed HMAC-SHA256 pseudonymisation).
2. **Access JWTs:** `JWT_ACCESS_SECRET` (Short-lived 15-minute bearer tokens).
3. **Refresh Tokens:** `JWT_REFRESH_SECRET` (Rotating 7-day httpOnly session tokens).
4. **Digital Seals (Feature 7):** Asymmetric Ed25519 signing keypair (`SEAL_SIGNING_PRIVATE_KEY` / `SEAL_SIGNING_PUBLIC_KEY`).

**Production Key Guardrails:**
- In development/test, deterministic fallback keys allow reproducible testing.
- In `production` (`NODE_ENV === 'production'`), `src/utils/sealCrypto.js` explicitly forbids fallback keys, throwing:
  `SECURITY_ERROR: Production environment requires explicitly configured SEAL_SIGNING_PRIVATE_KEY and SEAL_SIGNING_PUBLIC_KEY. Fallback development keys are strictly forbidden.`
- Digital signatures bind the canonical anchor metadata (roster version, Merkle root, row count, previous anchor hash, algorithm, and ISO-8601 timestamp), ensuring tamper-evident provenance.

---

### 5. Running the Platform (Windows Commands)

#### Install Dependencies
```powershell
npm.cmd install
```

#### Start in Development Mode (Nodemon Hot-Reload)
```powershell
npm.cmd run dev
```

#### Run the Synthetic Demo Seeder & Verifier
```powershell
# Populate synthetic demo dataset across 6 institutions (idempotent)
npm.cmd run seed:demo

# Clean rebuild of synthetic demo records
node src/scripts/seedDemoData.js --clean

# Verify demo dataset health, P1-P15 scenarios, foreign references, and Merkle seals
npm.cmd run seed:demo:verify

# Opt-in cryptographic tampering demonstration (P10)
npm.cmd run demo:tamper
npm.cmd run seed:demo:verify
npm.cmd run demo:restore
npm.cmd run seed:demo:verify
```

#### Run Comprehensive Test Suite
```powershell
# Run all test suites in band
npm.cmd test -- --runInBand --forceExit

# Run with test coverage report
npm.cmd run test:coverage -- --runInBand --forceExit
```

---

### 6. Full Test Suite & Coverage Metrics

```text
=============================== TEST SUMMARY ===============================
Test Suites: 24 passed, 24 total
Tests:       333 passed, 333 total
Snapshots:   0 total
Duration:    225.093 s

----------------------------------|---------|----------|---------|---------|
File                              | % Stmts | % Branch | % Funcs | % Lines |
----------------------------------|---------|----------|---------|---------|
All files                         |   76.54 |    59.68 |   84.29 |   77.02 |
 src                              |   94.11 |       50 |      75 |   93.93 |
 src/config                       |   82.69 |    80.30 |   76.47 |   85.56 |
 src/controllers                  |   62.47 |    48.09 |   77.27 |   63.03 |
 src/middleware                   |   85.18 |    69.49 |   85.71 |   87.05 |
 src/models                       |   94.52 |    55.22 |   81.81 |   95.17 |
 src/scripts                      |   67.93 |    51.04 |   77.50 |   66.75 |
 src/services                     |   78.28 |    61.60 |   86.98 |   78.94 |
 src/services/connectors          |   64.93 |    25.78 |   72.00 |   67.11 |
 src/services/scorecard           |   85.29 |    70.08 |   87.50 |   86.72 |
 src/utils                        |   91.66 |    71.20 |  100.00 |   93.16 |
----------------------------------|---------|----------|---------|---------|
```

---

### 7. Remaining Deployment & Infrastructure Security Requirements

The following requirements must be enforced at the infrastructure/orchestration layer prior to production go-live:

1. **TLS / HTTPS Termination:**
   - Production reverse proxy (e.g. NGINX, AWS ALB, Cloudflare) must enforce TLS 1.3 with HSTS headers (`Strict-Transport-Security`).
   - Cookies (`refreshToken`) are configured with `secure: true`, requiring HTTPS to be transmitted by browsers.
2. **Strict CORS Whitelisting:**
   - `CORS_ORIGIN` must point strictly to verified, trusted production domains (e.g. `https://seat-integrity.aicte.gov.in`).
   - Wildcards (`*`) or multi-origin reflections are strictly blocked by `src/app.js`.
3. **Resend Domain Verification:**
   - In production, `MAIL_FROM` must use a sender domain with verified SPF, DKIM, and DMARC records configured in the Resend dashboard to ensure inbox delivery and prevent spoofing.
4. **Hardware Security Module (HSM) / Key Vault:**
   - Ed25519 private signing keys (`SEAL_SIGNING_PRIVATE_KEY`) should be loaded from secure secret managers (e.g. AWS Secrets Manager, HashiCorp Vault) rather than static filesystem files.
5. **Least-Privilege Database Permissions:**
   - Production MongoDB connection URI should use a dedicated application user restricted to CRUD operations on the `sih` database, without `dbAdmin` or `atlasAdmin` roles.
