# PS3 MERN Backend + Frontend Integration Specification

**Project:** SIH 2026 — PS3: APAAR ID-Based Student Data Management and Verification Platform for AICTE-Approved Institutions
**Stack:** MERN, plain JavaScript only (no TypeScript)
**Audience:** Developer A (Backend) and Developer B (Frontend)
**Status:** Single source of truth for the hackathon prototype. Anything marked **[ASSUMPTION]** must be validated with stakeholders before being treated as policy.

---

## Table of Contents

1. Executive Summary
2. Scope, Non-Goals and Capability Labels
3. Roles and Permissions
4. Global Conventions (API envelope, IDs, errors, pagination)
5. Feature Specifications (Features 1–7, including the mandatory Scorecard)
6. Frontend Page Map
7. Button and Interaction Mapping
8. Chart and Graph Specification
9. Backend Architecture
10. MongoDB Data Model
11. API Reference and Sample Contracts
12. Security and Privacy Plan
13. Scalability Roadmap
14. Data Modelling and Business-Rule Correctness
15. Testing Strategy, Synthetic Data and Demo Scenarios
16. Frontend UX and Quality Requirements
17. Product Roadmap (Future, Not Implemented)
18. Implementation Order and Phases
19. Frontend/Backend Integration Checklist
20. Risks and Assumptions
21. Final Acceptance Checklist

---

## 1. Executive Summary

### 1.1 What we are building
A web platform that helps **authorised officials** (for example, regulator staff and auditors) and **institution staff** keep student-enrolment and seat data trustworthy. It does this by adding an **integrity layer** on top of the data institutions already report.

In plain language: institutions tell the authority "we admitted N students into programme P". Today it is hard to check whether that is consistent with other independent records, whether seats were exceeded, whether later corrections quietly changed history, or whether a student has two active enrolments. Our platform makes these checks routine, explainable and auditable, while leaving every final judgement to a human.

### 1.2 What we are NOT building
We are **not** creating another national student identity and are **not** duplicating APAAR, ABC, DigiLocker or existing AICTE reporting systems. We consume identifiers and reports; we do not replace the systems that issue them.

### 1.3 The seven capabilities

| # | Feature | One-line purpose |
|---|---------|------------------|
| 1 | Seat Three-Way Match | Compare roster vs admission/allotment vs exam registration (and approved intake) to find gaps and conflicts |
| 2 | Seat Ledger & Mass-Balance | Track approved intake, occupancy, headroom and over-cap alerts per institution/programme/year/category |
| 3 | Assurance Sampling | Random sample of roster records for authorised verification, with honest statistics |
| 4 | Data Reliability Scorecard (**mandatory**) | Transparent data-quality profile; a support-needs tool, never a misconduct verdict |
| 5 | Lifecycle & Transfer Handshake | Event history with two-sided transfer confirmation and privacy-preserving (HMAC) matching |
| 6 | Data Assurance Labels | Every important field carries its source and verification level |
| 7 | Change Blast-Radius & Sealed Roster | Know what became stale after a correction; tamper-evident roster versions |

### 1.4 Guiding principles
1. **Humans decide.** The system flags and explains; it never declares fraud or a violation.
2. **Deterministic and testable.** Rule-based logic only. No ML/LLM.
3. **Never overwrite history.** Corrections create new versions/events.
4. **Say what we don't know.** Missing, stale, conflicting or unavailable data is shown as such, never silently treated as "fine" or "bad".
5. **Honest labelling.** Simulated sources and demo data are visibly labelled everywhere.

---

## 2. Scope, Non-Goals and Capability Labels

### 2.1 Capability categories (use these exact labels in docs and UI)

| Category | Meaning | Examples |
|---|---|---|
| **EXISTING** | Capabilities that already exist in national/regulatory platforms | APAAR ID issuance, ABC credit storage, DigiLocker documents, AICTE approval/reporting portals |
| **DIFFERENTIATOR** | What this project proposes as new value | Three-way match, mass-balance ledger, sealed rosters, blast-radius analysis, reliability scorecard |
| **IMPLEMENTED** | Built and working in the prototype using our own data | CSV upload, validation, ledger, reconciliation on seeded data, scorecard, seals, audit trail |
| **SIMULATED** | Prototype stand-ins for external systems | Mock admission register, mock exam register, mock authority verifier |
| **FUTURE** | Needs authorisation, policy validation or more data | Live APAAR/DigiLocker/counselling/exam/scholarship connectors, ML anomaly detection |

### 2.2 Hard rules
- **Never** claim live APAAR, DigiLocker, counselling, examination, scholarship or AICTE integration unless implemented with authorised access. In the prototype, all external registers are **SIMULATED** and carry `sourceMode: "SIMULATED"`.
- **Never** present invented weights, thresholds, scores or institution names as official policy or real assessments. All demo data is fictional.
- **Never** hardcode unverified regulatory assumptions (NRI/OCI/foreign-national/supernumerary seat treatment, simultaneous-enrolment rules). These are **configurable rules** with a `policySourceRef` and `policyVerified` flag (default `false`).

### 2.3 Non-goals
- No student identity issuance, no payments, no document-authenticity adjudication.
- No TypeScript, FastAPI/Python services, SQL, microservices, Redis, Kafka or LLM/ML.
- No automated fraud, violation or misconduct determination.
- No public exposure of full student records (including via QR codes).

---

## 3. Roles and Permissions

| Role | Who | Scope | Key abilities |
|---|---|---|---|
| `PLATFORM_ADMIN` | Platform operator | Global | Manage users/institutions, system settings, seed demo data. Cannot edit audit events. |
| `AUTHORITY_ADMIN` | Senior authority staff | Global | Configure scoring formula, seat-category rules, sampling parameters; approve corrections; view everything |
| `AUTHORITY_OFFICER` | Reviewer/verifier | Assigned institutions or all | Run reconciliation, review matches, run sampling, resolve discrepancies, verify seals |
| `AUDITOR` | Read-only oversight | Global read | View all dashboards, audit trail, exports; no mutations |
| `INSTITUTION_ADMIN` | Institution data owner | Own institution only | Upload rosters, request corrections, confirm transfers, respond to discrepancies, view own scorecard |
| `INSTITUTION_OPERATOR` | Institution data-entry staff | Own institution only | Upload/preview rosters, respond to sampling and discrepancy queries; cannot approve or confirm transfers |

### 3.1 Permission matrix (R = read, W = write/act, A = approve, — = none)

| Capability | PLATFORM_ADMIN | AUTHORITY_ADMIN | AUTHORITY_OFFICER | AUDITOR | INSTITUTION_ADMIN | INSTITUTION_OPERATOR |
|---|---|---|---|---|---|---|
| Institutions list/detail | R/W | R/W | R | R | R (own) | R (own) |
| Roster upload/preview | — | — | — | — | W (own) | W (own) |
| Roster commit (confirm) | — | — | — | — | W (own) | — |
| Seat ledger | R | R/W (rules) | R | R | R (own) | R (own) |
| Reconciliation run | — | W | W | R | R (own results, masked) | — |
| Discrepancy review/resolve | — | A | W | R | respond (own) | respond (own) |
| Correction request | — | A | R | R | W (own) | W (own) |
| Correction approve | — | A | A (configurable) | — | — | — |
| Assurance sampling run | — | W | W | R | respond (own) | respond (own) |
| Scorecard view | R | R (all) | R (assigned) | R | R (own only) | R (own summary) |
| Scorecard recalculate | — | W | — | — | — | — |
| Scoring/rule config | — | W | — | R | — | — |
| Lifecycle events | R | R | R | R | W (own) | W (own, draft) |
| Transfer confirm/reject | — | — | R | R | W (sending/receiving party) | — |
| Verification labels | R | W | W | R | R (own) | R (own) |
| Roster versions/compare | R | R | R | R | R (own) | R (own) |
| Seal verify | R | R | W | R | R (own) | R (own) |
| Audit trail | R | R | R (scoped) | R | R (own, limited) | — |
| Export reports | R | W | W | W | W (own, masked) | — |

**Rules enforced on the backend (never only in React):**
1. Every request passes `authenticate` → `authorize(roles)` → `scopeToInstitution`.
2. Institution roles automatically get `institutionId` filter injected from the token; any `institutionId` in the body/query is ignored or rejected if it differs.
3. Comparison views for institution roles show **only anonymised peer benchmarks** (e.g., percentile band), never other institutions' names or data. **[ASSUMPTION — confirm with stakeholders]**.

---

## 4. Global Conventions (Frontend and Backend must follow these)

### 4.1 Base URL and versioning
`/api/v1/...` — JSON only (except CSV upload `multipart/form-data` and file exports).

### 4.2 Response envelope
Success:
```json
{
  "success": true,
  "data": { },
  "meta": { "page": 1, "limit": 25, "total": 142, "totalPages": 6 },
  "requestId": "req_8f2a1c"
}
```
Error:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed.",
    "details": [{ "field": "academicYear", "issue": "Must match YYYY-YY" }]
  },
  "requestId": "req_8f2a1c"
}
```

### 4.3 Standard error codes
`VALIDATION_ERROR` (400), `UNAUTHENTICATED` (401), `TOKEN_EXPIRED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409), `IDEMPOTENCY_REPLAY` (200 with original result), `PAYLOAD_TOO_LARGE` (413), `UNSUPPORTED_MEDIA_TYPE` (415), `UNPROCESSABLE` (422), `RATE_LIMITED` (429), `SOURCE_UNAVAILABLE` (503, external source down), `INTERNAL_ERROR` (500, generic message only).

### 4.4 Pagination, filtering, sorting
- Every list endpoint: `?page=1&limit=25&sort=-createdAt&q=search`. Default `limit=25`, max `limit=100`.
- Filters use explicit named parameters (`status=OPEN&severity=HIGH&academicYear=2025-26`).
- Date ranges: `from=2025-07-01&to=2026-03-31` (ISO dates, inclusive).
- Large datasets (row-level preview, findings, exports) are **always** paginated or delivered as async export files, never as one unbounded response.

### 4.5 Identifiers and naming
- All IDs are MongoDB ObjectIds serialised as strings in field `id` (not `_id`). Foreign keys end in `Id`.
- Field names: `camelCase`. Enums: `UPPER_SNAKE_CASE`. Timestamps: ISO-8601 UTC strings (`createdAt`, `updatedAt`).
- Academic year format: `"2025-26"`.

### 4.6 Common data-context block
Any endpoint returning metrics or charts includes this so the frontend can show honesty badges:
```json
"dataContext": {
  "dataMode": "DEMO",               
  "sourceModes": ["INSTITUTION_REPORTED", "SIMULATED"],
  "coveragePct": 82.5,
  "unresolvedCount": 14,
  "asOf": "2026-01-10T09:00:00Z",
  "ruleVersion": "recon-rules@3",
  "notes": ["Exam register is SIMULATED"]
}
```
`dataMode` is `DEMO` (seeded) or `LIVE` (user-uploaded in this deployment). The UI must show a persistent banner when `DEMO` or any `SIMULATED` source is present.

### 4.7 Idempotency
Mutating endpoints that may be retried (`commit roster`, `run reconciliation`, `start sampling`, `recalculate score`) accept header `Idempotency-Key: <uuid>`. Same key + same user returns the original result.

---

## 5. Feature Specifications

> Each feature follows the same 15-part template. Read Feature 1 fully; the others follow the same structure.

---

### 5.1 Feature 1 — Seat Three-Way Match

**1. What it means (simple language).** Instead of trusting a single list from the institution, we compare it with other independent lists. If a student appears in the institution's roster, we expect to find them in the admission/allotment records and the examination registration (where applicable). Where the three lists disagree, we flag it for a human to look at.

**2. Real-life problem.** An institution may report 120 admitted students while the allotment record supports only 100, or the same candidate may appear twice with slightly different spellings. Today these gaps are found late, if at all.

**3. Example.** *Fictional:* "Sample Institute of Technology (SIT-DEMO-01)" reports 60 students in "CSE, 2025-26, General". The simulated allotment register lists 57 for that bucket. Three roster students (R-0041, R-0042, R-0043) have no allotment match. Two are resolved as late-spot-round admissions with supporting documents; one remains unresolved and goes to review. No one is accused of anything — it is a discrepancy to explain.

**4. Who benefits.** Authority officers (find gaps early), institution admins (fix data before it becomes a bigger issue), auditors (traceable evidence).

**5. Business logic (step by step).**
1. **Pick sources** for a run: `ROSTER` (committed roster version), `ADMISSION` (authorised allotment/admission register or mock), `EXAM` (exam-registration register or mock), `INTAKE` (approved intake from ledger). Optional `SCHOLARSHIP` only when data + permission exist (default off).
2. **Normalise** each record: uppercase, trim, remove punctuation/diacritic variations in names, normalise DOB to ISO date, normalise programme codes via a mapping table.
3. **Compute candidate keys** (in priority order):
   - K1: `apaarToken` (HMAC of APAAR ID, see Feature 5) — strongest.
   - K2: `institutionApplicationNo + programmeCode + academicYear`.
   - K3 (weak, review-only): normalised name + DOB + programme.
4. **Match** each roster record against each other source:
   - Exact K1 match → `MATCH_STRONG`.
   - Exact K2 match → `MATCH_STRONG` (if both present and agree).
   - K3 match only → `MATCH_CANDIDATE` (**never auto-confirmed**; goes to human review).
   - No key hit → `NOT_FOUND_IN_SOURCE`.
5. **Compare attributes** on matched pairs: programme, category, academic year, DOB. Differences → `ATTRIBUTE_CONFLICT` with `fieldDiffs`.
6. **Detect duplicates** within a source: same K1 twice, or K3 collision → `DUPLICATE_CANDIDATE` (no automatic merge).
7. **Reverse check:** records in the admission/exam register but absent from the roster → `MISSING_FROM_ROSTER`.
8. **Count reconciliation:** per bucket (institution, programme, year, category) compare counts across sources and against approved intake → `COUNT_MISMATCH` or `OVER_INTAKE_REPORTED`.
9. **Classify the outcome** per roster record:

| Outcome | Meaning | Next step |
|---|---|---|
| `CONFIRMED_3WAY` | Found in all expected sources, attributes agree | None |
| `CONFIRMED_PARTIAL` | Found in some sources; others unavailable/not applicable | Informational |
| `UNMATCHED` | Not found in an expected source | Review queue |
| `CONFLICT` | Found but attributes disagree | Review queue |
| `CANDIDATE_REVIEW` | Weak/uncertain match | Human confirm/dismiss |
| `SOURCE_UNAVAILABLE` | Source could not be queried | Excluded from mismatch counts; shown separately |

10. **Reliability of a match:** `matchConfidence` is a *rule-based tier* (`STRONG`, `MODERATE`, `WEAK`) derived from which keys matched and how many attributes agree — **not** a probability and not an ML score. Only `STRONG` can auto-pass; `MODERATE`/`WEAK` always go to review.
11. **Human review:** the officer sees both records side by side (masked fields), chooses *Confirm same person*, *Dismiss (different people)*, or *Request clarification from institution*. The decision is stored with reviewer, reason and timestamp; it is never deleted.
12. **Wording rule:** findings use neutral language ("Not found in allotment register"), never "fake", "fraud", "illegal".

**6. Frontend pages/components.** Reconciliation Workspace (tabbed): *Run & Summary*, *Findings*, *Candidate Matches*, *Counts by Bucket*. Components: `SourceSelector`, `RunButton`, `OutcomeDonut`, `FindingsTable`, `SideBySideRecordCompare`, `ReviewDecisionDialog`, `SourceModeBadge`.

**7. Backend routes/services.** `POST /reconciliations`, `GET /reconciliations/:id`, `GET /reconciliations/:id/findings`, `PATCH /findings/:id/review`. Services: `reconciliationService`, `matchingService`, `normalisationService`, `sourceConnectorService`, `countReconService`.

**8. MongoDB collections.** `reconciliationRuns` (runId, institutionId, sources[], ruleVersion, status, summary counts, startedBy, idempotencyKey), `reconciliationFindings` (runId, type, severity, recordRef, sourceRefs, fieldDiffs, matchConfidence, reviewStatus, reviewedBy, reviewNote), `externalRegisterRecords` (sourceId, sourceMode, tokenizedKeys, attributes — **seeded/simulated** in prototype).

**9. API example.**
Request `POST /api/v1/reconciliations`
```json
{
  "institutionId": "665f1c...",
  "academicYear": "2025-26",
  "rosterVersionId": "6660a1...",
  "sources": ["ROSTER", "ADMISSION", "EXAM", "INTAKE"],
  "programmeCodes": ["CSE"]
}
```
Response `201`
```json
{
  "success": true,
  "data": {
    "id": "6661b7...",
    "status": "COMPLETED",
    "ruleVersion": "recon-rules@3",
    "summary": {
      "rosterRecords": 60,
      "confirmed3Way": 51,
      "confirmedPartial": 2,
      "unmatched": 4,
      "conflicts": 1,
      "candidateReview": 2,
      "sourceUnavailable": 0
    },
    "sourceModes": { "ROSTER": "INSTITUTION_REPORTED", "ADMISSION": "SIMULATED", "EXAM": "SIMULATED" }
  }
}
```

**10. Validation/errors.** Roster version must be `COMMITTED`; academic year valid; at least two sources; all sources belong to same institution scope. `409 CONFLICT` if the same run (same idempotency key) is in progress. `503 SOURCE_UNAVAILABLE` → run completes with that source marked unavailable rather than failing entirely.

**11. Security/privacy.** Only tokens and masked fields (e.g., name initials, last 2 characters of IDs) in findings lists. Full record detail requires role + audit log entry. Raw APAAR never stored in findings.

**12. Missing/conflicting/stale/unavailable data.**
- *Missing identifier:* fall back to K2/K3; mark `matchConfidence` lower; flag `MISSING_IDENTIFIER` data-quality issue.
- *Conflicting:* `CONFLICT`, show both values with source labels.
- *Stale source:* if source `asOf` is older than configured freshness window, add `STALE_SOURCE` note; do not raise mismatches that could be caused by timing alone (downgrade severity to `INFO`).
- *Unavailable:* `SOURCE_UNAVAILABLE`; never counted as a mismatch.

**13. Future scale.** Chunked matching by programme bucket; indexed token lookups; async job for runs above the measured threshold (§13); additional connectors via the connector interface (Feature 6).

**14. End-to-end demo.** Institution admin commits roster v1 (60 rows) → officer runs reconciliation → summary shows 4 unmatched, 1 conflict, 2 candidates → officer opens a candidate, sees side-by-side with masked fields, confirms it → institution admin responds to an unmatched record with a supporting reference → officer resolves → summary and scorecard update, audit trail shows each step.

**15. Acceptance criteria.**
- AC-1.1: A planted roster record absent from the allotment mock produces exactly one `UNMATCHED` finding.
- AC-1.2: A K3-only match is never auto-confirmed.
- AC-1.3: An unavailable source yields `SOURCE_UNAVAILABLE` and zero mismatch findings from that source.
- AC-1.4: Re-running with the same idempotency key does not duplicate findings.
- AC-1.5: Every finding records `ruleVersion`; no finding text uses accusatory wording.
- AC-1.6: Review decisions are append-only and appear in the audit trail.

---

### 5.2 Feature 2 — Seat Ledger and Academic Mass-Balance Engine

**1. Simple language.** Like a bank passbook for seats. For each institution, programme, academic year and seat category there is an approved intake (the limit), and every admission, withdrawal or transfer-out moves the balance. The "mass balance" idea: *seats at start + admissions − exits ± transfers should equal seats occupied now.*

**2. Real-life problem.** Reported occupancy can drift above approved intake through data errors, double-counting or genuine over-admission. Without a ledger, nobody sees the drift until it is large.

**3. Example.** *Fictional:* CSE, 2025-26, category "GENERAL" has approved intake 60. Admissions: 58. Withdrawals: 3. Transfer-in: 1. Occupancy = 56, headroom = 4. An early-warning threshold at 90% (54 seats) is already crossed → `WARNING`. If a later roster reports 63, headroom = −3 → `OVER_CAP_DISCREPANCY` alert (for review, not an accusation).

**4. Who benefits.** Authority officers (capacity monitoring), institutions (early warning before breaching), auditors (history).

**5. Business logic.**
1. **Bucket key:** `(institutionId, programmeId, academicYear, seatCategoryCode)`.
2. **Approved intake** is stored per bucket with `sourceLabel` (Feature 6) — a self-declared number is `INSTITUTION_DECLARED`, **not** authority-verified. A rule `intakeMustBeAuthorityVerifiedForAlerts` (default `false` in prototype, configurable) controls whether alerts treat unverified intake as provisional.
3. **Ledger entries** (append-only): `INTAKE_SET`, `INTAKE_REVISED`, `ADMISSION`, `WITHDRAWAL`, `TRANSFER_OUT`, `TRANSFER_IN`, `COMPLETION`, `CORRECTION_REVERSAL`, `ROSTER_SYNC_ADJUSTMENT`. Each has `delta` (+1/−1 for occupancy), `eventRef`, `effectiveDate`, `sourceRef`.
4. **Derived balance** (`seatBalances`): `approvedIntake`, `occupancy`, `headroom = approvedIntake − countedOccupancy`, `utilisationPct`, `status`.
5. **What counts toward occupancy** is a **configurable rule set** per category (`occupancyRules`): e.g., whether a category is counted against the main intake or treated separately (such as supernumerary). **No default assumption** about NRI, OCI, foreign-national or supernumerary seats is shipped as policy; prototype seeds use plain fictional categories (`GENERAL`, `RESERVED_A`, `RESERVED_B`, `SPECIAL_DEMO`), and each rule carries `policySourceRef` + `policyVerified:false`.
6. **Statuses:** `OK` (< warning threshold), `WARNING` (≥ threshold, ≤100%), `OVER_CAP_DISCREPANCY` (>100%), `INTAKE_UNVERIFIED` (informational flag, can combine), `NO_INTAKE_CONFIGURED`.
7. **Mass-balance reconciliation between cohorts:** `openingBalance(year Y) = closingBalance(year Y−1)` of continuing students (by programme duration config). Compare to what the current roster reports; difference → `COHORT_CARRYOVER_MISMATCH` finding. Programme duration is configuration, not hardcoded.
8. **Thresholds:** `warningThresholdPct` (default 90, **[ASSUMPTION]**), configurable per institution type.
9. **Historical views:** `seatBalanceSnapshots` per date (daily or on-change) power time-series charts.
10. **Concurrency/transactions:** see below.

**Concurrency design (avoiding wrong counts).**
- Ledger entries are **insert-only** with a unique index on `idempotencyKey`, so retries cannot double-count.
- Occupancy is **derived from entries**, with the cached `seatBalances.occupancy` updated using an atomic `$inc` inside the same **MongoDB transaction** (Atlas replica set) as the ledger insert (`session.withTransaction`).
- For bulk roster syncs, compute the net delta per bucket in memory, then apply one transaction per bucket batch.
- A nightly/on-demand **verification job** recomputes balances from entries and compares to cached values; a mismatch raises an internal `LEDGER_DRIFT` alert (should never occur; it is a self-check).
- Optimistic concurrency via Mongoose `versionKey` on `seatBalances` for rule/intake edits.
- Reported occupancy is **recorded even when over cap** (we do not reject institution reports); the system flags rather than blocks.

**6. Frontend.** Seat Ledger page: filters (institution, programme, year, category), `SeatBalanceTable`, `IntakeVsOccupancyBar`, `UtilisationGauge` (or bullet bar), `OccupancyTimeline`, `LedgerEntryDrawer`, `AlertBadge`, `SourceLabelBadge` for intake.

**7. Backend.** `GET /seat-ledger/balances`, `GET /seat-ledger/balances/:id/entries`, `GET /seat-ledger/history`, `PUT /seat-ledger/intake` (authority roles; institution can *declare* via `POST /seat-ledger/intake-declarations`), `POST /seat-ledger/verify-integrity`. Services: `seatLedgerService`, `occupancyRuleService`, `alertService`.

**8. Collections.** `seatLedgerEntries`, `seatBalances`, `seatBalanceSnapshots`, `occupancyRules` (inside `ruleConfigs`), `programmes` (with `approvedIntake[]` and source labels).

**9. API example.** `GET /api/v1/seat-ledger/balances?institutionId=665f1c&academicYear=2025-26`
```json
{
  "success": true,
  "data": [{
    "id": "6670aa...",
    "institution": { "id": "665f1c...", "code": "SIT-DEMO-01" },
    "programme": { "id": "6660bb...", "code": "CSE" },
    "academicYear": "2025-26",
    "seatCategory": "GENERAL",
    "approvedIntake": 60,
    "approvedIntakeLabel": "INSTITUTION_DECLARED",
    "occupancy": 56,
    "headroom": 4,
    "utilisationPct": 93.3,
    "status": "WARNING",
    "flags": ["INTAKE_UNVERIFIED"],
    "ruleVersion": "occupancy-rules@2",
    "lastUpdatedAt": "2026-01-10T09:00:00Z"
  }],
  "meta": { "page": 1, "limit": 25, "total": 1, "totalPages": 1 }
}
```

**10. Validation.** Intake ≥ 0 integer; category must exist in rule config; entry `effectiveDate` not in the far future; negative occupancy rejected (`UNPROCESSABLE`); `idempotencyKey` required for ledger writes.

**11. Security.** Only authority roles may set or revise **verified** intake. Institution intake declarations are stored as declarations (labelled `INSTITUTION_DECLARED`). All intake revisions are audited with before/after.

**12. Missing/conflicting data.** No intake configured → `NO_INTAKE_CONFIGURED` (no headroom computed; UI says "Approved intake not set"). Conflicting intake sources → show both with labels; use the authority-verified one if present, otherwise the most recent declared one marked provisional.

**13. Future scale.** Snapshot collection partitioned by year; scheduled snapshot job; archival of old entries; additional seat-category rules via config only.

**14. Demo.** Seed bucket CSE/GENERAL with intake 60 → commit roster with 63 rows in that bucket → ledger shows −3 headroom, `OVER_CAP_DISCREPANCY` alert → officer opens entries → sees which roster version produced the jump → institution submits a correction → balance returns to 60 and a `CORRECTION_REVERSAL` entry appears (old entries intact).

**15. Acceptance.**
- AC-2.1: `occupancy = Σ deltas` for every bucket after any sequence of operations (property test).
- AC-2.2: Two concurrent writes to the same bucket never lose an update.
- AC-2.3: Retrying a ledger write with the same idempotency key changes nothing.
- AC-2.4: Over-cap produces an alert but the report is still recorded.
- AC-2.5: Self-declared intake displays `INSTITUTION_DECLARED`, never "Authority-verified".
- AC-2.6: Historical chart for any past date matches snapshot data.

---

### 5.3 Feature 3 — Assurance Sampling

**1. Simple language.** Instead of checking every student, officials randomly pick a fair sample of roster records and verify those with an authorised method (e.g., confirm with the student, check a document, cross-check a register). Results give a cautious estimate of how reliable the whole roster is.

**2. Real-life problem.** Full verification is expensive; ad-hoc checking is biased (people check what is convenient). Random sampling is cheaper and fairer.

**3. Example.** *Fictional:* Roster of 500 eligible records, 95% confidence target, ±7% margin → sample ≈ 154 (with finite population correction). After checking: 120 verified, 10 failed-check, 20 unconfirmed (no response), 4 pending. Estimate is based on the 130 resolved checks, with non-response shown separately.

**4. Who benefits.** Authority officers; institutions (transparent, fair process); auditors.

**5. Business logic.**
1. **Eligible population:** records from the committed roster version matching filters (programme, year, status active, not already sampled in this window if configured). Population size `N` and the frozen list of record IDs are stored with the run.
2. **Parameters (configurable):** `confidenceLevel` (default 0.95), `marginOfError` (default 0.07), `expectedProportion` (default 0.5 = most conservative), `minSampleSize`, `maxSampleSize`, optional `riskBasedExtra` (see below), `responseDeadlineDays`, `randomSeedMode`.
3. **Sample size (proportion estimate with finite population correction):**
   - `n0 = z² · p · (1 − p) / e²`
   - `n = n0 / (1 + (n0 − 1) / N)`, rounded up, clamped to `[min, min(max, N)]`.
   - If N is small (e.g., < 30), sample everything or warn that sampling is not meaningful.
4. **Alternative mode — zero-failure acceptance sampling:** `n = ceil( ln(1 − C) / ln(1 − p_max) )` (approximation, large population) for the question "can we be C% confident the failure rate is below `p_max` if we see zero failures?" Use only if the authority chooses that mode; show the assumption text.
5. **Random selection:** use `crypto.randomInt`/`crypto.randomBytes`-based Fisher–Yates shuffle (or reservoir sampling for large N). Store the `seed` / selection proof (hash of the ordered selected IDs plus timestamp) so the draw is reproducible and auditable. Selection is **not** done by Math.random.
6. **Risk-based extra sample (optional):** if configured, an *additional* set may be selected from records with specific flags (e.g., open discrepancy). Rules: (a) the **random component is always mandatory** and drawn first, (b) risk-based records are stored in a separate stratum (`stratum: "RISK_BASED"`), and (c) statistical estimates use **only the random stratum**; risk-based results are reported separately as "targeted checks", never extrapolated.
7. **Item states:** `PENDING` → `VERIFIED` | `FAILED_CHECK` | `UNCONFIRMED` (no response by deadline / unreachable) | `EXCLUDED` (e.g., record withdrawn before check, with reason).
   - `FAILED_CHECK` = verification was performed and the information did **not** match authoritative evidence.
   - `UNCONFIRMED` = no evidence either way; **never** counted as failure or as proof of anything.
8. **Estimate (only when valid):** from resolved items in the random stratum, `verifiedRate = verified / (verified + failed)`. Compute a **Wilson score interval** (z for chosen confidence). Display only if `resolved ≥ minResolvedForEstimate` (default 30, **[ASSUMPTION]**) and `responseRate ≥ minResponseRate` (default 60%, **[ASSUMPTION]**). Otherwise show "Insufficient resolved checks for an estimate".
9. **Non-response sensitivity:** also show a *bounds* view — best case (all unconfirmed verified) and worst case (all unconfirmed failed) — clearly labelled as bounds, not predictions.
10. **Limitations text** (always displayed): sample reflects the frozen population at draw time; estimates apply to the sampled population only; non-response and verification-method error are not modelled; interval is an approximation; results are not a misconduct finding.

**6. Frontend.** Assurance Sampling Workspace: *Configure & Start*, *Sample Progress*, *Item Results*, *Estimate & Limitations*. Components: `SamplingParamsForm` (with live sample-size preview), `CoverageProgressBar`, `StatusStackedBar`, `SampleItemsTable`, `ItemResultDialog`, `EstimateCard`, `LimitationsPanel`.

**7. Backend.** `POST /sampling-runs/preview-size`, `POST /sampling-runs`, `GET /sampling-runs/:id`, `GET /sampling-runs/:id/items`, `PATCH /sampling-items/:id/result`, `POST /sampling-runs/:id/close`, `GET /sampling-runs/:id/estimate`. Services: `samplingService`, `statsService` (sample size, Wilson), `randomSelectionService`.

**8. Collections.** `samplingRuns` (params, N, seed/proof, strata, status, closedAt), `samplingItems` (runId, recordToken ref, stratum, status, method, evidenceRef, checkedBy, checkedAt, note).

**9. API example.** `POST /api/v1/sampling-runs/preview-size`
```json
{ "populationSize": 500, "confidenceLevel": 0.95, "marginOfError": 0.07, "expectedProportion": 0.5 }
```
→
```json
{ "success": true, "data": { "n0": 196, "sampleSize": 141, "formula": "n0 / (1 + (n0-1)/N)", "assumptions": ["Simple random sample", "p=0.5 is most conservative"] } }
```
*(Illustrative numbers; the backend computes real values and unit tests verify them.)*

`GET /api/v1/sampling-runs/:id/estimate`
```json
{
  "success": true,
  "data": {
    "stratum": "RANDOM",
    "counts": { "verified": 120, "failedCheck": 10, "unconfirmed": 20, "pending": 4, "excluded": 0 },
    "responseRatePct": 86.7,
    "estimateAvailable": true,
    "verifiedRate": 0.923,
    "interval": { "method": "WILSON", "level": 0.95, "low": 0.864, "high": 0.957 },
    "nonResponseBounds": { "bestCase": 0.933, "worstCase": 0.8 },
    "limitations": ["Applies to population frozen at draw time", "Non-response is not a failed check"]
  }
}
```

**10. Validation.** `0.80 ≤ confidence < 1`, `0.01 ≤ margin ≤ 0.2`, population ≥ 1; cannot start if the roster version is not committed; cannot close with unresolved `PENDING` unless explicitly converted to `UNCONFIRMED` with a reason; results cannot be edited after close (append a correction record instead).

**11. Security/privacy.** The sampling list shows tokens and masked identity; contact details are accessible only to assigned verifiers and each view is logged. Student responses should be collected through authorised channels only (future); prototype uses officer-entered results.

**12. Missing/conflicting data.** Missing contact/evidence → `UNCONFIRMED` with reason `NO_CONTACT_PATH`, tracked separately from failure. Stale roster: if a newer roster version is committed after draw, show "Roster changed since sample draw" notice (Feature 7).

**13. Scale.** Reservoir sampling and indexed queries handle large rosters; sample draws are O(N) streaming; async job only if measured threshold exceeded.

**14. Demo.** Officer selects an institution (500 eligible) → previews size → starts run (random stratum 141) → results entered over a few items to show all four states → estimate card shows "insufficient" until thresholds are met → after thresholds, shows interval plus non-response bounds and limitations.

**15. Acceptance.**
- AC-3.1: Sample size matches reference calculations in unit tests (including finite-population cases and small N).
- AC-3.2: Selection uses a cryptographic RNG; recorded proof lets a verifier reproduce the draw.
- AC-3.3: `UNCONFIRMED` never increases the failed-check count.
- AC-3.4: Estimates exclude the risk-based stratum.
- AC-3.5: Estimate hidden when thresholds are unmet; limitations always visible.
- AC-3.6: Closed run results are immutable; changes are append-only corrections.

---
### 5.4 Feature 4 — Institutional Data Reliability Scorecard (MANDATORY)

> **Purpose statement (must appear in UI and docs):** The scorecard is a **data-reliability and support-needs tool**. It is **not** a misconduct verdict, and it must never be used to label an institution fraudulent, dishonest or educationally inferior. Its goal is to help officials decide where training, data-cleaning support or follow-up may be needed.

**1. Simple language.** A transparent "data health profile" for each institution, built from four measurable things: how complete its records are, how many discrepancies remain unresolved, how quickly it updates data, and how its correction activity looks (shown with context, not as a penalty by default).

**2. Real-life problem.** Officials currently have no consistent, explainable way to see which institutions need data-quality support. Opaque or ad-hoc rankings would be unfair and unhelpful.

**3. Example (fictional, illustrative only).** "Sample Institute of Technology (DEMO)" shows: completeness 94%, unresolved-discrepancy rate 8 per 1,000 records, median update lag 6 days, 42 corrections (of which 3 are repeat corrections on the same field). The card shows a score band and a "Support suggestions" panel: *"Consider a data-entry refresher for the 'category' field (6% missing)."* These numbers are demo data, not an assessment of any real institution.

**4. Who benefits.** Authority officers (prioritise support), institution admins (see exactly what to fix), auditors (explainable metrics).

**5. Business logic.**

**5.1 Metric definitions** (all computed per institution, per reporting period, optionally per programme/category):

| ID | Metric | Definition | Raw value | Direction |
|---|---|---|---|---|
| M1 | Record completeness | `Σ (non-missing required fields) / Σ (required fields)` over records in scope; required-field list is configurable | % | Higher is better |
| M2 | Unresolved discrepancies | Open findings (types configurable, severity-weighted) per 1,000 records; also ageing buckets (0–7, 8–30, 31+ days) | rate | Lower is better |
| M3 | Timeliness | Median and 90th-percentile lag between `effectiveDate` (event happened) and `reportedAt` (reported); plus % of events reported within the configured window | days, % | Lower lag / higher % better |
| M4 | Correction activity | Corrections per 100 records; **repeat-correction rate** (same field corrected ≥2 times); median correction turnaround after a discrepancy is raised; share of corrections that were *self-initiated* vs *prompted* | counts, % | **Contextual** (see below) |

**5.2 Why M4 is handled differently.** A high correction count can mean poor data entry, **or** it can mean the institution is actively and responsibly fixing errors. Therefore:
- **Raw metrics are always shown**, together with a context note.
- Default behaviour: **correction *volume* is never penalised.** Only two derived sub-signals can contribute, and only if the authority enables them (`m4.enabledInScore = true`; default **false** in the prototype): (a) *repeat-correction rate on the same field* (suggests a systemic entry problem), and (b) *slow turnaround after a prompt* (corrections made late after being flagged).
- Self-initiated corrections are shown as a **positive context signal** ("proactive corrections: 70%"), never a negative.

**5.3 Normalisation rules** (each metric → 0–100 sub-score):
- M1: `sub = completenessPct` (already 0–100).
- M2: `sub = 100 × max(0, 1 − rate / rateCeiling)`; `rateCeiling` configurable (illustrative: 50 per 1,000); severity weights and ageing multipliers configurable.
- M3: `sub = 0.5 × onTimePct + 0.5 × lagScore`, where `lagScore = 100 × max(0, 1 − p90Lag / lagCeilingDays)`; `lagCeilingDays` configurable (illustrative: 60).
- M4 (when enabled): `sub = 100 × (1 − clamp(repeatRate / repeatCeiling)) ` averaged with turnaround score; otherwise excluded.
- Ceilings are **proposed starting points, not policy**.

**5.4 Illustrative scoring formula (PROPOSED STARTING POINT — must be validated with stakeholders; NOT official policy):**

```
Weights (illustrative, config key: scoring-config@v1):
  w1 completeness            = 0.40
  w2 unresolved discrepancies= 0.30
  w3 timeliness              = 0.30
  w4 correction signals      = 0.00   (disabled by default; context only)

ReliabilityScore = round( Σ_i (w_i × sub_i) / Σ_i (w_i of metrics that are AVAILABLE) , 1 )
```
- Weights are renormalised across **available** metrics (missing-data handling below).
- Score **bands** (illustrative): `Strong ≥ 85`, `Adequate 70–84.9`, `Needs support 50–69.9`, `Priority support < 50`, plus `Insufficient data`. Band names intentionally avoid moral/negative language ("fraud", "poor", "bad").
- Every score stores `formulaVersion`, `weights`, `ceilings`, `inputsHash`, and the raw metrics.

**5.5 Missing-data handling and minimum-data requirements.**
- A metric is **available** only if its denominator ≥ its minimum (default: ≥ 30 records in scope for M1/M2, ≥ 20 dated events for M3 — **[ASSUMPTION]**).
- If fewer than 2 of the 3 scored metrics are available, or total records < `minRecordsForScore` (default 50), the status is `INSUFFICIENT_DATA` and **no numeric score** is shown — only raw metrics and coverage.
- Missing source for a sub-check (e.g., exam register unavailable) lowers **coverage**, not the score. Coverage is shown as its own indicator (`coveragePct`: share of expected data/sources actually present).
- Unresolved records (pending review) are displayed as a count beside the score, never silently counted as pass or fail.

**5.6 Score history and formula-version tracking.**
- `scoreSnapshots` store each calculation: period, institution, programme/category filter (or `ALL`), raw metrics, sub-scores, final score, band, coverage, `formulaVersion`, `ruleVersions` used, `calculatedAt`, `trigger` (SCHEDULED / MANUAL / CORRECTION_RECALC).
- Changing the formula creates a new `scoringConfigs` version (immutable). Old snapshots keep their version; trend charts mark **formula-change points** and, by default, **do not draw a continuous line across a version change** unless the authority runs a *backfill recalculation* (stored as separate snapshots flagged `isBackfill`).

**5.7 Recalculation after corrections.** When a correction, new roster version, discrepancy resolution or lifecycle event changes inputs, the affected snapshots are marked `stale: true` with `staleReason` (see Feature 7). A recalculation is queued/run (`CORRECTION_RECALC`); old snapshots are retained. Authorised roles can trigger manual recalculation (idempotent).

**5.8 Comparability.**
- Compare only institutions of the same `institutionType` (configurable groups) and the same reporting period and formula version; otherwise the UI shows a warning and disables direct ranking.
- Comparison view shows **distributions/percentile bands and metric-level side-by-side**, not a single "league table" rank, by default.
- Size effects: rates are normalised per 1,000 records; small-denominator institutions show "low-volume" flags.

**5.9 Support-needs output.** Rule-based suggestions mapped to metrics (e.g., M1 low on `category` → "data-entry refresher"; M2 ageing > 30 days → "follow-up call"; M3 high lag → "reporting-schedule reminder"). Suggestions are static templates, not ML.

**6. Frontend.** Scorecard page (tabs): *Overview* (score, band, coverage, unresolved count, formula version, disclaimer), *Metrics* (M1–M4 cards with raw value, sub-score, context, definition tooltip, "Fix this" link), *Compare*, *Trends*, *Drill-down*, *Method* (definitions, formula, weights, limitations). Components: `ScoreCard`, `BandBadge`, `CoverageIndicator`, `MetricCard`, `MetricDefinitionPopover`, `DateRangePicker`, `FilterBar` (programme, category, institution type), `ComparisonChart`, `TrendChart` with formula-change markers, `DrillDownTable`, `SupportSuggestions`, `MethodPanel`.

**Metric → workflow links**
| Metric | Link target |
|---|---|
| M1 completeness | Roster Versions page → "Request correction" filtered to records with missing fields |
| M2 unresolved discrepancies | Discrepancy & Correction Queue filtered by institution + age bucket |
| M3 timeliness | Lifecycle page filtered to late-reported events |
| M4 corrections | Roster Versions → Change history filtered to repeated fields |

**7. Backend.** Routes under `/scorecards` (see §11). Services: `scorecardService`, `metricCalculators/` (one module per metric), `normalisationService`, `scoringConfigService`, `scoreSnapshotService`, `comparabilityService`, `supportSuggestionService`.

**8. Collections.** `scoringConfigs` (versioned), `scoreSnapshots`, `metricSnapshots` (may be embedded in `scoreSnapshots`; see consolidation note §10), `dataQualityIssues` (shared with discrepancies).

**9. API examples.**
`GET /api/v1/scorecards/institutions/665f1c?from=2025-07-01&to=2026-01-31&programmeId=ALL`
```json
{
  "success": true,
  "data": {
    "institution": { "id": "665f1c...", "code": "SIT-DEMO-01", "type": "ENGINEERING_DEMO" },
    "period": { "from": "2025-07-01", "to": "2026-01-31" },
    "status": "SCORED",
    "score": 88.4,
    "band": "STRONG",
    "formulaVersion": "scoring-config@v1",
    "formulaLabel": "PROPOSED_STARTING_POINT_NOT_OFFICIAL",
    "coverage": { "coveragePct": 91.0, "unresolvedRecords": 14, "recordsInScope": 1240 },
    "metrics": [
      { "id": "M1", "name": "Record completeness", "raw": { "completenessPct": 94.2 }, "subScore": 94.2, "weight": 0.4, "available": true,
        "context": "6 required fields tracked; 'category' has most gaps (5.8%)", "link": "/roster-versions?filter=missingFields" },
      { "id": "M2", "name": "Unresolved discrepancies", "raw": { "openPer1000": 11.3, "ageing": { "0-7": 6, "8-30": 5, "31+": 3 } }, "subScore": 77.4, "weight": 0.3, "available": true,
        "link": "/discrepancies?institutionId=665f1c&status=OPEN" },
      { "id": "M3", "name": "Timeliness", "raw": { "medianLagDays": 6, "p90LagDays": 21, "onTimePct": 88 }, "subScore": 80.5, "weight": 0.3, "available": true,
        "link": "/lifecycle?late=true" },
      { "id": "M4", "name": "Correction activity (context)", "raw": { "per100": 3.4, "repeatRatePct": 7.1, "selfInitiatedPct": 70 }, "enabledInScore": false,
        "context": "High volume can indicate active correction; not penalised by default." }
    ],
    "supportSuggestions": ["Review 'category' field entry process (5.8% missing)"],
    "stale": false,
    "disclaimer": "Data-reliability and support-needs tool. Not a misconduct verdict."
  },
  "dataContext": { "dataMode": "DEMO", "sourceModes": ["INSTITUTION_REPORTED", "SIMULATED"] }
}
```
`GET /api/v1/scorecards/compare?institutionIds=a,b,c&from=...&to=...&institutionType=ENGINEERING_DEMO` → returns `items[]` with per-metric values, `comparable: true/false`, `notComparableReasons[]`. `GET /api/v1/scorecards/institutions/:id/trend?metric=M1|SCORE&granularity=month` → `points[]` with `formulaVersion`, `isBackfill`, `formulaChangeMarker`.

**10. Validation/errors.** Date range must be valid, `from ≤ to`, max range configurable (e.g., 5 years); unknown metric → 400; institution roles requesting another institution → 403; `INSUFFICIENT_DATA` is a normal `200` response with `status` set, not an error. Recalculate with no changes → returns existing snapshot with `unchanged:true`.

**11. Security/privacy.** Aggregates only by default. Drill-down returns masked records limited to the user's scope and logs access. Small-cell suppression: counts below `minCellSize` (default 5, **[ASSUMPTION]**) in programme/category breakdowns are shown as "<5" for institution-role users to reduce re-identification risk.

**12. Missing/conflicting/stale/unavailable.** Missing → metric unavailable, weights renormalised, coverage reduced, tooltip explains. Stale snapshot → "Recalculation pending" badge with last-calculated time. Unavailable source → coverage note; no penalty.

**13. Future scale.** Nightly snapshot job + on-demand recalculation; indexes on `(institutionId, period, formulaVersion)`; precomputed monthly rollups; multi-year trend tables; more metrics via new calculator modules without schema changes.

**14. Demo.** Open scorecard for demo institution → see 4 metric cards → click M2 "Fix this" → queue shows 14 open items → institution resolves 8 → backend marks snapshot stale and recalculates → score rises; trend chart shows new point; compare tab shows percentile band vs same-type peers; admin changes weights → new formula version appears and trend chart draws a formula-change marker.

**15. Acceptance.**
- AC-4.1: Score = reference value for fixtures with known inputs (unit tests per metric and combined).
- AC-4.2: Changing correction volume alone (with M4 disabled) never changes the score.
- AC-4.3: Fewer than the minimum data → `INSUFFICIENT_DATA`, no numeric score.
- AC-4.4: Missing metric → weights renormalised; coverage reduced; test passes for each metric missing.
- AC-4.5: Every snapshot stores formula version and raw metrics; old snapshots remain after formula change.
- AC-4.6: A correction marks affected snapshots stale and triggers recalculation within the configured SLA.
- AC-4.7: UI shows the disclaimer, definitions, coverage and unresolved count on every scorecard view.
- AC-4.8: Institution users cannot see other institutions' names/data in comparisons.
- AC-4.9: No UI/API text labels an institution fraudulent/dishonest/inferior.

---

### 5.5 Feature 5 — Privacy-Preserving Student Lifecycle and Transfer Handshake

**1. Simple language.** A tracked timeline for each student's relevant status changes (admitted, enrolled, transferred, withdrawn, corrected, completed). When a student moves between institutions, both sides confirm — a "handshake" — so the move is documented rather than guessed. We match students across institutions using **keyed tokens**, not raw identifiers.

**2. Real-life problem.** A student leaves one institution and joins another; if the first never records the exit, the same identifier appears active in two places. Sometimes that is a real problem, sometimes it is just a pending paperwork delay or a legitimate arrangement.

**3. Example.** *Fictional:* Student token `tok_9f3c…` is `ENROLLED` at Institute A (since 2024-08-01). On 2025-08-10 Institute B reports `ADMITTED` for the same token. System creates a `TRANSFER_PENDING` case. Institute A confirms the exit effective 2025-08-05; Institute B confirms the entry. Case resolves to `TRANSFER_CONFIRMED`. If Institute A never responds within the configured window, the case goes to `NEEDS_REVIEW` for an officer — not to "violation".

**4. Who benefits.** Institutions (clean handoffs), officers (resolve ambiguity), students (accurate record, indirectly).

**5. Business logic.**
1. **Event model:** `StudentLifecycleEvent { studentTokenId, institutionId, type, effectiveDate, reportedAt, sourceRef, status, supersedesEventId, reason }`.
   Types: `ADMITTED, ENROLLED, TRANSFER_OUT_REQUESTED, TRANSFER_OUT_CONFIRMED, TRANSFER_IN_REQUESTED, TRANSFER_IN_CONFIRMED, WITHDRAWN, COMPLETED, CORRECTED`.
2. **State machine** (allowed transitions enforced in `lifecycleService`): `ADMITTED → ENROLLED → {WITHDRAWN | COMPLETED | TRANSFER_PENDING}`; `TRANSFER_PENDING → {TRANSFER_CONFIRMED | TRANSFER_REJECTED | NEEDS_REVIEW}`. Illegal transitions → 422.
3. **Effective dates vs reported dates:** both are stored; timeliness (M3) uses the gap.
4. **Corrections:** a `CORRECTED` event references `supersedesEventId`; the old event stays in history with `status: SUPERSEDED`. Current state is computed from non-superseded events.
5. **Transfer handshake:**
   - Either side may initiate (`POST /transfers`). Case has `sendingInstitutionId`, `receivingInstitutionId`, `studentTokenId`, `proposedEffectiveDate`.
   - Sending side confirms exit (date, reason code). Receiving side confirms entry.
   - Both confirmed + dates consistent → `CONFIRMED`; ledger gets `TRANSFER_OUT`/`TRANSFER_IN` entries (Feature 2).
   - One side rejects, or dates inconsistent beyond tolerance → `NEEDS_REVIEW`.
   - Timeout (`transferConfirmationWindowDays`, configurable) → `NEEDS_REVIEW` (never auto-confirmed).
6. **Overlap detection:** compute active enrolment intervals per token across institutions. If intervals overlap, create `OVERLAP_REVIEW` case **only** under a configurable rule (`overlapRules`) with `policySourceRef` and `policyVerified` flag. Prototype default: flag *all* overlaps as `INFO/REVIEW` and show the text "Overlap may be legitimate (e.g., permitted arrangements, pending paperwork). Applicable policy must be verified."
7. **Why a repeated identifier alone is not proof of an invalid duplicate:** the same ID can appear twice because of an in-progress transfer, a data-entry mistake, a correction not yet applied, a legitimately permitted parallel arrangement, or a typo producing a coincidental match. The system records it as an *observation* requiring context, not a conclusion.
8. **Privacy-preserving token (HMAC):**
   - `studentToken = HMAC-SHA256(secretKey_vK, canonicalise(apaarId))` where `canonicalise` = trim, uppercase, remove spaces/hyphens. Stored fields: `token`, `keyVersion`. Raw APAAR is **not stored** after tokenisation; it exists only in memory during upload processing, and is excluded from logs and error messages.
   - Optionally also store `last4` for human reference (masked display), **[ASSUMPTION]** acceptable under policy — can be disabled via config.
   - **Key management:** secret keys in environment/secret manager, never in the repo; separate key per purpose if needed (`hmac_student_token`, `hmac_seal`). Keys loaded at boot, kept in memory, never returned by APIs.
   - **Rotation:** keys have `keyVersion`. A new version is introduced; new tokens use the new key. Existing tokens cannot be re-derived without raw IDs, so options are: (a) dual-token window — tokens are recomputed whenever the raw ID is next presented (re-upload) and old tokens are retired after a defined period; (b) controlled re-tokenisation by an authorised custodian who can supply the raw IDs from the authoritative source. Matching must query across active key versions. Rotation is audited.
   - **Access control:** only `studentTokenService` can read keys; tokens are never exposed to institution roles for other institutions' students; cross-institution matching happens server-side and returns only the minimum (e.g., "this student has an active enrolment elsewhere" + the counterpart institution only when a transfer case exists or an authorised officer is reviewing).
   - **Limitations (must be stated):** HMAC tokens are **pseudonymous, not anonymous**. APAAR IDs have a limited format, so if the key leaks, an attacker could brute-force the identifier space. Anyone with the key and a candidate ID can confirm membership. Tokens are linkable across datasets by design. Combined with other attributes (programme, year, institution) re-identification risk remains. Tokenisation reduces exposure; it does not guarantee anonymity.
9. **Review & resolution workflow:** `NEEDS_REVIEW` cases have status `OPEN → IN_REVIEW → RESOLVED(<resolution code>)`; resolution codes: `LEGITIMATE_TRANSFER`, `DATA_ENTRY_ERROR_CORRECTED`, `PERMITTED_PARALLEL`, `REFERRED_FOR_POLICY_REVIEW`, `NO_ACTION`. A reviewer must add a note; decisions are append-only.

**6. Frontend.** Lifecycle & Transfer page (tabs): *Timeline* (per masked student token), *Transfers* (pending/confirmed/needs-review), *Overlap Review*. Components: `LifecycleTimeline`, `TransferCaseCard`, `ConfirmTransferDialog`, `RejectTransferDialog` (reason required), `OverlapReviewPanel`, `StatusTransitionChart`.

**7. Backend.** `POST /lifecycle/events`, `GET /lifecycle/students/:tokenId/events`, `POST /transfers`, `PATCH /transfers/:id/confirm`, `PATCH /transfers/:id/reject`, `GET /transfers`, `GET /overlap-cases`, `PATCH /overlap-cases/:id/resolve`. Services: `lifecycleService`, `transferService`, `overlapService`, `studentTokenService`, `keyManagementService`.

**8. Collections.** `studentTokens` (tokenHash, keyVersion, last4?, firstSeenAt), `lifecycleEvents`, `transferCases`, `reviewCases` (shared with discrepancies, `type: OVERLAP|TRANSFER_REVIEW`).

**9. API example.** `PATCH /api/v1/transfers/6680c1/confirm`
```json
{ "side": "SENDING", "effectiveDate": "2025-08-05", "reasonCode": "STUDENT_REQUEST", "note": "Exit formalities complete" }
```
→
```json
{ "success": true, "data": { "id": "6680c1...", "status": "AWAITING_RECEIVING_CONFIRMATION",
  "sending": { "confirmed": true, "confirmedAt": "2026-01-10T10:00:00Z", "confirmedBy": "u_17" },
  "receiving": { "confirmed": false } } }
```

**10. Validation.** Only the named side's `INSTITUTION_ADMIN` may confirm for that side; effective date cannot precede admission date; date gap tolerance configurable; duplicate pending case for the same token+pair → 409; reject requires a reason.

**11. Security.** Never log raw APAAR; request body redaction middleware; rate-limit transfer endpoints; token lookups only inside services; tokens never returned in full to non-authority roles (return opaque `studentRef` per institution instead).

**12. Missing/conflicting/stale.** Missing APAAR → record has `tokenStatus: MISSING_IDENTIFIER` and cannot participate in token-based matching (falls back to Feature 1 K2/K3 with review). Conflicting dates → `NEEDS_REVIEW`. Stale pending case → reminder + ageing indicator.

**13. Scale.** Index `(studentTokenId, effectiveDate)`; interval overlap computed per token incrementally on event insert; batch processing for bulk roster import; key-version-aware lookups.

**14. Demo.** Seeded: Student X enrolled at A; B reports admission → pending transfer → A confirms, B confirms → timeline shows both institutions with effective dates; ledger entries appear; second seeded student has no response → case goes to `NEEDS_REVIEW` → officer resolves with a note.

**15. Acceptance.**
- AC-5.1: Raw APAAR ID is absent from DB, logs and API responses (automated scan test).
- AC-5.2: Same input + same key version → same token; different key version → different token.
- AC-5.3: Illegal state transitions rejected.
- AC-5.4: A correction creates a new event and leaves the old one as `SUPERSEDED`.
- AC-5.5: Transfer needs both confirmations; timeout never auto-confirms.
- AC-5.6: Overlap produces a review case with neutral wording and does not set any "violation" field.
- AC-5.7: Tokens from a retired key version still match during the configured overlap window.

---

### 5.6 Feature 6 — Authority-Verified Intake and Data Assurance Labels

**1. Simple language.** Every important number or field carries a "label" that says where it came from and how strongly it has been checked, like a nutrition label for data.

**2. Real-life problem.** A number like "approved intake = 60" may be typed by the institution or confirmed by the authority. Without labels they look identical, and unverified numbers get treated as facts.

**3. Example.** *Fictional:* CSE approved intake = 60 is `INSTITUTION_DECLARED`. The authority's (mock) approval connector returns 60 → label upgrades to `AUTHORITY_VERIFIED (SIMULATED)` with a visible "Prototype simulation" badge. If the connector is down → `UNABLE_TO_VERIFY`.

**4. Who benefits.** Everyone who reads or relies on data — especially officers deciding how much weight to give a number.

**5. Business logic.**
1. **Label set (ordered by strength):**

| Label | Meaning | How assigned |
|---|---|---|
| `INSTITUTION_DECLARED` | Entered by the institution; no independent check | Default on any institution-submitted field |
| `DOCUMENT_SUPPORTED` | Institution provided a document reference that an officer marked as matching | Officer attaches/reviews a document reference |
| `CROSS_REGISTER_CONFIRMED` | Agreed with at least one independent register | Feature 1 match result |
| `AUTHORITY_VERIFIED` | Confirmed by the authority's own authoritative system or an authorised officer's recorded verification | Connector result in `LIVE` mode, or officer verification with evidence |
| `VERIFICATION_PENDING` | Verification requested, not complete | Set when a request is created |
| `UNABLE_TO_VERIFY` | Source unavailable or no evidence found (not a failure judgement) | Connector failure/no data |

2. **Mode separator:** every verification has `sourceMode`: `LIVE` or `SIMULATED`. A `SIMULATED` result can reach **at most** `AUTHORITY_VERIFIED_SIMULATED` display state — the stored label stays `AUTHORITY_VERIFIED` only if `sourceMode = LIVE`. In the prototype the UI shows a distinct "SIMULATED" ribbon on any simulated verification.
3. **Rule:** self-declared approved intake is **never** `AUTHORITY_VERIFIED`. The service rejects promotion unless a verification record exists with `sourceMode=LIVE` or an authorised reviewer's verification with evidence.
4. **Stored per verification (`verificationRecords`):** `subjectType`, `subjectId`, `fieldPath`, `valueSnapshot`, `label`, `sourceRef` (connector id/register id), `sourceMode`, `method` (`CONNECTOR_API`, `MANUAL_OFFICER`, `DOCUMENT_REVIEW`, `CROSS_REGISTER`), `status`, `verifiedAt`, `ruleOrSourceVersion`, `reviewer { userId, role }`, `evidenceRef`, `expiresAt?`.
5. **Staleness:** if the underlying value changes, existing verification becomes `SUPERSEDED` and the label resets to `INSTITUTION_DECLARED` or `VERIFICATION_PENDING` (links to Feature 7 blast radius).
6. **Connector interface** (`src/services/connectors/BaseConnector.js`):
```js
// Every connector implements this contract
class BaseConnector {
  get id() {}            // e.g. "mock-authority-intake"
  get mode() {}          // "LIVE" | "SIMULATED"
  async healthCheck() {} // -> { available: boolean, checkedAt }
  async verify({ subjectType, fieldPath, value, context }) {}
  // -> { status: "CONFIRMED"|"NOT_CONFIRMED"|"UNAVAILABLE", sourceVersion, evidenceRef, raw? }
}
```
   - Prototype ships `MockAuthorityIntakeConnector`, `MockAdmissionRegisterConnector`, `MockExamRegisterConnector` (all `mode = SIMULATED`, backed by seeded collections) and a `FailingConnector` for testing `UNAVAILABLE`.
   - Future live connectors replace mocks via config; no business-logic change. Live mode requires authorisation, credentials in secrets, and legal sign-off (**FUTURE**).
7. **Label resolution when multiple verifications exist:** strongest valid, non-superseded, non-expired label wins; conflicts (one confirms, another contradicts) → `VERIFICATION_PENDING` with a `CONFLICT` flag and a review case.

**6. Frontend.** Source & Verification page: filter by subject type; `LabelBadge` used throughout the app (tooltip explains each label); `SimulationRibbon`; `VerificationHistoryDrawer`; `RequestVerificationDialog`; `ConnectorStatusPanel` (shows LIVE/SIMULATED, availability).

**7. Backend.** `GET /verifications`, `POST /verifications/request`, `PATCH /verifications/:id/review` (officer), `GET /verifications/by-subject`, `GET /connectors/status`. Services: `verificationService`, `labelResolverService`, `connectors/*`.

**8. Collections.** `verificationSources` (connector registry/config), `verificationRecords`.

**9. API example.** `POST /api/v1/verifications/request`
```json
{ "subjectType": "PROGRAMME_INTAKE", "subjectId": "6660bb...", "fieldPath": "approvedIntake", "connectorId": "mock-authority-intake" }
```
→
```json
{ "success": true, "data": { "id": "6690d2...", "status": "COMPLETED", "label": "AUTHORITY_VERIFIED", "sourceMode": "SIMULATED",
  "displayLabel": "Authority-verified (SIMULATED prototype)", "sourceVersion": "mock-intake@2026-01", "verifiedAt": "2026-01-10T11:00:00Z" } }
```

**10. Validation.** Connector must exist and be enabled; subject must belong to the caller's scope; officer review requires evidence reference or note; connector timeout → record created as `UNABLE_TO_VERIFY`.

**11. Security.** Connector credentials in secrets, never in DB or API responses; raw connector payloads stored minimally and redacted; verification actions audited; officers cannot verify subjects of their own institution if they are linked to it (conflict-of-interest check — optional).

**12. Missing/conflicting.** No data → `UNABLE_TO_VERIFY`; connector down → `UNABLE_TO_VERIFY` + `SOURCE_UNAVAILABLE` note; conflicts → `VERIFICATION_PENDING` + review case.

**13. Scale.** Verification results cached per (subject, source version) with explicit invalidation on value change or source-version bump; batch verification jobs; new connectors via interface only.

**14. Demo.** Institution declares intake → label shows "Institution-declared" → officer triggers mock authority verification → label becomes "Authority-verified (SIMULATED)" with ribbon → switch connector to failing mode → label shows "Unable to verify" → institution edits intake → verification marked superseded, label resets.

**15. Acceptance.**
- AC-6.1: Declared intake can never display as authority-verified without a qualifying verification record.
- AC-6.2: Any `SIMULATED` verification shows the ribbon everywhere it appears (UI test).
- AC-6.3: Changing a verified value supersedes its verification.
- AC-6.4: Connector failure yields `UNABLE_TO_VERIFY` and not an error that blocks the page.
- AC-6.5: Every verification stores source, method, status, timestamp, rule/source version and reviewer where applicable.

---

### 5.7 Feature 7 — Record Change Blast-Radius and Sealed Roster

**1. Simple language.** (a) When a record or roster changes, we show everything that was computed from the old data and may now be out of date. (b) Each submitted roster version is "sealed" with a cryptographic fingerprint so any later silent edit is detectable.

**2. Real-life problem.** A correction quietly invalidates a previous reconciliation, score or report; nobody notices. Or a roster is changed after submission and nobody can prove it.

**3. Example.** *Fictional:* Institute uploads roster v2 correcting 12 programme codes. Blast radius: 1 reconciliation run, 2 score snapshots, 1 sampling run and 1 exported report are marked `STALE`. A seal check on v1 passes; after a test tampering of one row in the DB, the check fails and shows which row hash no longer matches.

**4. Who benefits.** Officers (trust in outputs), institutions (clear impact of their corrections), auditors (tamper evidence).

**5. Business logic.**

**5.1 Versioned roster submissions**
- `rosterSubmissions` (one per institution+academic year) and `rosterVersions` (v1, v2, …). A version moves `UPLOADED → VALIDATED → COMMITTED` (or `REJECTED`). Raw upload is stored separately from validated rows (see §14). Committed versions are immutable; corrections create a **new version**.
- Row-level change set between versions: `ADDED`, `REMOVED`, `MODIFIED { fieldDiffs[{field, before, after}] }`, `UNCHANGED`, matched by a stable `rowKey` (tokenised APAAR, else institution application no.).

**5.2 Dependency tracking (blast radius)**
- Every derived output records its inputs in `dependencyRefs`: `{ rosterVersionId, ruleVersion, scoringConfigVersion, ledgerBucketIds[] }`. Derived outputs: reconciliation runs, seat balances/snapshots, score snapshots, sampling runs, exported reports/receipts, verification records.
- On a new committed version or approved correction, `impactService` computes:
  1. Changed `rowKey`s and the buckets (programme/category/year) they touch.
  2. All derived outputs whose `dependencyRefs` include the old version or touched buckets.
  3. For each, set `freshness: "STALE"`, `staleReason`, `staleSinceVersionId`, and create an `impactRecord` summarising counts.
- **Revalidation status** per output: `FRESH`, `STALE`, `REVALIDATING`, `REVALIDATED`, `NOT_APPLICABLE`. A revalidation action re-runs the relevant computation and links the new output (old output retained for history).
- **Report/receipt tracking:** exported reports store `{ reportId, generatedAt, dependencyRefs, contentHash }`; stale reports show a "Based on superseded data" warning when re-opened.

**5.3 Tamper-evident seal**
- **What is included in the seal:** for each row in the committed version: a canonical JSON serialisation of an **allow-list of fields** (rowKey/token, programme code, academic year, category, admission date, status, declared intake bucket, schema version). Fields sorted; numbers/dates normalised; UTF-8. Names/contact data need not be included (privacy) — document the chosen set in `sealSchemaVersion`.
- **Leaf hash:** `SHA-256( 0x00 || canonicalRowBytes )`. **Node hash:** `SHA-256( 0x01 || left || right )` (domain separation; odd node promoted/duplicated per documented rule). **Merkle root** = top node.
- **Manifest:** `{ institutionId, academicYear, versionNumber, rowCount, merkleRoot, previousSealRoot, sealSchemaVersion, createdAt }`; `manifestHash = SHA-256(canonical manifest)`. Including `previousSealRoot` chains versions so history cannot be reordered or removed unnoticed.
- **Trusted reference — where it lives:** the institution uploading the file must not be the only holder of the reference. The seal is computed **server-side** on commit and the manifest is recorded in a separate **`sealAnchors`** collection that:
  1. Is **write-restricted** to the sealing service (separate MongoDB user with insert-only rights; no update/delete),
  2. Is **chained** (each anchor includes the hash of the previous anchor, forming an append-only hash chain),
  3. Is signed with a platform **Ed25519** key via Node `crypto` (`sign`/`verify`) held in secrets, separate from the institution accounts, and
  4. Has its **chain head exported daily** (and on demand) as a signed receipt to authority-controlled storage/email outside the institution's reach (prototype: downloadable "Chain Head Receipt" file; production: independent storage/notary — **FUTURE**).
  The institution receives a **sealed receipt** (manifest + signature) but cannot alter the authority's anchor.
- **Verification by an authorised verifier:** `POST /roster-versions/:id/verify-seal` → server recomputes leaf hashes from stored rows, rebuilds the Merkle root, compares to the anchored root, checks anchor signature and chain continuity, then returns `PASS` or `FAIL` with `mismatchedRowKeys` (found by walking tree nodes) and `checkedAt`. A verifier may also upload a previously downloaded receipt/CSV to check against the anchor.
- **What a pass means:** the stored rows are identical to what was sealed at commit time. **It does not prove the content was true or authentic.** It establishes integrity relative to the trusted anchor. This statement appears in the UI.
- **Honest limitation:** if the anchor store and the platform's signing key were both compromised or controlled by one insider, seals could be forged; mitigation is out-of-band export of chain heads and separation of duties (**FUTURE:** external timestamping/notarisation).
- **A hash stored only by the uploading institution is explicitly insufficient** and is not used as evidence.

**6. Frontend.** Roster Versions & Change Impact page (tabs): *Versions*, *Compare*, *Impact*, *Seal*. Components: `VersionTimeline`, `VersionDiffTable` (side-by-side before/after, filter by change type), `ImpactSummaryCards`, `StaleOutputList` with `FreshnessBadge`, `RevalidateButton`, `SealStatusCard` (hash prefix, anchored-at, verification result), `VerifySealButton`, `DownloadReceiptButton`.

**7. Backend.** Routes under `/rosters` and `/roster-versions` (§11). Services: `rosterService`, `versionDiffService`, `impactService`, `sealService` (canonicalisation, merkle), `anchorService`, `receiptService`.

**8. Collections.** `rosterUploads` (raw), `rosterVersions` (metadata), `rosterRows` (validated rows, one doc per row per version, or compact chunks), `rosterChanges` (diff summaries), `integritySeals`, `sealAnchors`, `impactRecords`, `reports` (exports with dependencyRefs).

**9. API examples.**
`GET /api/v1/roster-versions/6700e1/impact`
```json
{ "success": true, "data": {
  "versionId": "6700e1...", "supersedes": "6700d0...",
  "changes": { "added": 3, "removed": 1, "modified": 12, "unchanged": 484 },
  "affectedBuckets": [{ "programme": "CSE", "category": "GENERAL", "academicYear": "2025-26" }],
  "staleOutputs": [
    { "type": "RECONCILIATION_RUN", "id": "6661b7...", "freshness": "STALE", "revalidationStatus": "NOT_STARTED" },
    { "type": "SCORE_SNAPSHOT", "id": "6692f0...", "freshness": "STALE", "revalidationStatus": "QUEUED" },
    { "type": "REPORT", "id": "66a001...", "freshness": "STALE" }
  ] } }
```
`POST /api/v1/roster-versions/6700e1/verify-seal`
```json
{ "success": true, "data": { "result": "FAIL", "checkedAt": "2026-01-10T12:00:00Z",
  "anchor": { "signatureValid": true, "chainContinuous": true, "merkleRoot": "9ab4…" },
  "recomputedRoot": "77de…", "mismatchedRowKeys": ["tok_9f3c…"],
  "meaning": "Stored data differs from what was sealed. This indicates a data change after sealing; it does not itself identify who or why." } }
```

**10. Validation.** Cannot modify a committed version (409); commit requires validation pass or explicit accepted-warnings; idempotent commit (same file hash + key → same version); seal verification requires authority role or own-institution read-only result.

**11. Security.** Seal keys isolated; anchor collection insert-only; receipts signed; compare/diff responses masked; verify-seal calls audited; cannot download full rows through seal endpoints.

**12. Missing/conflicting.** Rows without a stable key are listed as `UNKEYED` and included using a documented fallback key; corrupted anchor → verification returns `INCONCLUSIVE` with reason (not `PASS`); missing previous version → chain break flagged.

**13. Scale.** Streamed hashing in chunks; Merkle tree built iteratively; store only needed nodes (top levels + chunk roots) with leaf recomputation on demand; impact queries via indexed `dependencyRefs`.

**14. Demo.** Upload v1 → commit → seal anchored → upload v2 with corrections → see diff and impact list (stale reconciliation/score/report) → click revalidate → items become `REVALIDATED` → admin runs a "tamper demo" script that edits one row directly in DB → verify seal → `FAIL` with the mismatched row; v1 downloaded receipt still matches anchor.

**15. Acceptance.**
- AC-7.1: Commit creates exactly one seal and anchor; the anchor chain is continuous.
- AC-7.2: Mutating any sealed field in the DB makes verification `FAIL` and identifies the row.
- AC-7.3: Changing a non-sealed field (e.g., internal note) does not change the root.
- AC-7.4: A correction creates a new version; old version remains retrievable and verifiable.
- AC-7.5: After a committed change, all outputs with matching `dependencyRefs` show `STALE`; unaffected outputs remain `FRESH`.
- AC-7.6: The UI states that a passing seal proves integrity, not truth.
- AC-7.7: Institution-held data alone cannot produce a valid anchor signature.

---
## 6. Frontend Page Map

### 6.1 Stack and structure (Developer B)
React + Vite, JavaScript/JSX, Tailwind CSS 4, React Router, Recharts. Suggested layout:

```
frontend/src/
  api/            # one module per backend domain; ALL fetches go through apiClient.js
  components/     # shared UI (Table, Pagination, Dialog, Badge, ChartCard, EmptyState, Skeleton)
  features/       # feature folders: roster, ledger, reconciliation, sampling, scorecard, lifecycle, verification, versions, audit, settings
  hooks/          # useApi, usePagination, useDebounce, useAuth
  routes/         # route table + ProtectedRoute (UX only; backend enforces real security)
  context/        # AuthContext, DataModeContext
  utils/          # formatters, constants (enums mirror backend)
```

**API service layer rules**
- Single `apiClient.js` wraps `fetch`/axios: base URL from `VITE_API_BASE_URL`, attaches the access token, parses the standard envelope, normalises errors to `{ code, message, details, requestId }`, handles `401` (redirect to login / refresh) and `429` (show retry message).
- Each domain module exports plain async functions (e.g., `scorecardApi.getInstitution(id, params)`), so components never build URLs.
- Never store access tokens in `localStorage` if avoidable; use in-memory token + httpOnly refresh cookie (see §12). **[Team decision recorded in §20]**
- Mirror enums (statuses, labels) in `utils/constants.js` and keep in sync with this document.

### 6.2 Routes

| # | Page | Route | Roles | Combined into |
|---|---|---|---|---|
| 1 | Login | `/login` | public | — |
| 2 | Dashboard | `/` | all authenticated | — |
| 3 | Institutions (list + detail) | `/institutions`, `/institutions/:id` | authority roles all; institution roles own | detail uses tabs |
| 4–5 | Roster Upload, Preview & Row Validation | `/rosters/upload` | institution roles | **Single stepper page:** Upload → Preview → Validate → Confirm |
| 6 | Seat Ledger | `/seat-ledger` | all (scoped) | — |
| 7 | Reconciliation Workspace | `/reconciliation` | authority roles; institution read-own | tabs: Run, Findings, Candidates, Counts |
| 8 | Discrepancy & Correction Queue | `/discrepancies` | all (scoped) | — |
| 9 | Assurance Sampling | `/sampling` | authority roles; institution respond | tabs |
| 10 | Reliability Scorecard | `/scorecards`, `/scorecards/:institutionId` | all (scoped) | tabs |
| 11 | Lifecycle & Transfers | `/lifecycle` | all (scoped) | tabs: Timeline, Transfers, Overlaps |
| 12 | Source & Verification | `/verification` | all (scoped) | — |
| 13 | Roster Versions & Impact | `/roster-versions`, `/roster-versions/:id` | all (scoped) | tabs: Versions, Compare, Impact, Seal |
| 14 | Audit Trail | `/audit` | authority roles, auditor; institution limited | — |
| 15 | Settings & Rules | `/settings` | `AUTHORITY_ADMIN`, `PLATFORM_ADMIN` (scoring/rules), read for `AUDITOR` | tabs: Scoring, Seat Rules, Sampling Params, Connectors, Users |

**Total: ~12 top-level screens** (pages 4–5 merged; many features use tabs rather than separate pages).

### 6.3 Page detail

**1. Login (`/login`).** Email + password; calls `POST /auth/login`. Shows lockout/rate-limit messages. No registration (admins create users).

**2. Dashboard (`/`).** Authority view: KPI cards (institutions in scope, open discrepancies, over-cap alerts, pending transfers, stale outputs), charts (intake vs occupancy summary, discrepancy types, unresolved over time), "Needs attention" list. Institution view: own KPIs, own scorecard summary, own pending tasks. Always shows `DataModeBanner` (DEMO/LIVE, SIMULATED sources). APIs: `GET /dashboard/summary`, chart endpoints in §8.

**3. Institutions.** List (search, filter by type/state, paginate) with scorecard band badge and open-issue count. Detail tabs: *Overview*, *Programmes & Intake* (with label badges), *Rosters*, *Issues*, *Scorecard* (link). APIs: `GET /institutions`, `GET /institutions/:id`, `GET /institutions/:id/programmes`.

**4–5. Roster Upload stepper.**
1. *Upload:* choose academic year + CSV file (size/type pre-checked client-side as UX only), template download link.
2. *Preview:* first N rows (paginated server-side), detected columns mapping, row count.
3. *Validate:* summary of errors/warnings by rule; row-level table with filter (error/warning/ok); downloadable error CSV (formula-injection-safe).
4. *Confirm:* shows counts, bucket impacts (seat headroom preview), what will be sealed; confirmation dialog; on success shows version number, seal receipt, and impact summary.
APIs: `POST /rosters/uploads`, `GET /rosters/uploads/:id/preview`, `POST /rosters/uploads/:id/validate`, `GET /rosters/uploads/:id/validation-rows`, `POST /rosters/uploads/:id/commit`.

**6. Seat Ledger.** Filters; balances table with status badges and label badges; charts (intake vs occupancy, utilisation, occupancy timeline); ledger-entry drawer; authority-only "Set/verify intake" dialog.

**7. Reconciliation Workspace.** Select institution/year/sources → run → outcome donut, findings table (filters: type, severity, review status, source), candidate-match review with side-by-side compare, counts-by-bucket table.

**8. Discrepancy & Correction Queue.** Unified queue (`reviewCases`) of findings, overlap cases, transfer reviews, sampling failed-checks. Filters: type, severity, status, age, institution. Detail drawer: evidence, history, response thread, buttons (Mark for review, Respond, Request correction, Approve/Reject correction, Resolve).

**9. Assurance Sampling.** Configure with live size preview; progress, item table, result dialog, estimate card with limitations.

**10. Scorecard.** See §5.4 for layout. Tabs: Overview, Metrics, Compare, Trends, Drill-down, Method.

**11. Lifecycle & Transfers.** Timeline by masked student reference; transfers table with status filter; confirm/reject; overlap review.

**12. Source & Verification.** Table of verified fields with label, source, mode (LIVE/SIMULATED), time; request verification; connector status panel.

**13. Roster Versions & Impact.** Versions list, diff view, impact lists with stale/fresh badges, revalidate actions, seal status and verify.

**14. Audit Trail.** Filterable event table (actor, action, entity, date range), detail drawer showing before/after (masked), export.

**15. Settings.** Scoring formula editor (weights, ceilings, thresholds) with *Save as new version* (never edit in place), diff vs current, preview calculation; seat-category rules with `policySourceRef` and verified flag; sampling defaults; connector enablement; user management (`PLATFORM_ADMIN`).

---

## 7. Button and Interaction Mapping

> **Rule:** every visible button has a defined backend action or a documented frontend-only purpose. No decorative buttons. Loading = disable button + spinner/skeleton; success = toast (+ inline state update); error = inline message with `requestId` for support.

| Page | Button / interaction | User expectation | API called | Request params/body | Loading | Success feedback | Error feedback | Access |
|---|---|---|---|---|---|---|---|---|
| Login | Sign in | Authenticate and land on dashboard | `POST /auth/login` | `{email, password}` | Button spinner | Redirect to `/` | "Invalid credentials" (generic), lockout notice on 429 | public |
| Header | Logout | End session | `POST /auth/logout` | — | — | Redirect to login | Toast; clear session anyway | all |
| Upload | Download template | Get CSV template | `GET /rosters/template` | — | Spinner | File downloads | Toast | institution |
| Upload | Upload roster | Send CSV for parsing | `POST /rosters/uploads` | multipart: `file`, `academicYear` | Progress bar | Moves to Preview; shows row count | Per-code message (413 size, 415 type, 422 malformed) | institution |
| Upload | Preview data | See parsed rows | `GET /rosters/uploads/:id/preview` | `page, limit` | Table skeleton | Rows + column mapping | Inline error + retry | institution |
| Upload | Run validation | Check rules on all rows | `POST /rosters/uploads/:id/validate` | `Idempotency-Key` | Progress | Summary counts by rule | Inline error | institution |
| Upload | Filter validation rows / download errors | Inspect failures | `GET /rosters/uploads/:id/validation-rows`, `GET .../errors.csv` | `status, rule, page, limit` | Skeleton | Table / file | Toast | institution |
| Upload | Confirm upload | Commit as new sealed version | `POST /rosters/uploads/:id/commit` | `{acceptWarnings:boolean}`, `Idempotency-Key` | Confirm dialog → spinner | Version no. + seal receipt + impact summary | "Validation errors remain" (422) / conflict (409) | INSTITUTION_ADMIN |
| Ledger | Apply filters | Refresh balances | `GET /seat-ledger/balances` | `institutionId, programmeId, academicYear, seatCategory, status, page, limit` | Skeleton | Table/charts update | Empty/error state | scoped |
| Ledger | Open entries | See ledger movements | `GET /seat-ledger/balances/:id/entries` | `page, limit, from, to` | Drawer skeleton | Entry list | Inline error | scoped |
| Ledger | Set approved intake | Record intake | `PUT /seat-ledger/intake` (authority) / `POST /seat-ledger/intake-declarations` (institution) | `{programmeId, academicYear, seatCategory, approvedIntake, reason}` | Spinner | Value + label badge updates | Validation messages | AUTHORITY_ADMIN / INSTITUTION_ADMIN (declaration) |
| Ledger | History range | Change timeline range | `GET /seat-ledger/history` | `bucketId, from, to, granularity` | Chart skeleton | Chart updates | Chart error state | scoped |
| Reconciliation | Run reconciliation | Compare sources | `POST /reconciliations` | `{institutionId, academicYear, rosterVersionId, sources[], programmeCodes?}`, `Idempotency-Key` | Progress/status polling | Summary + findings | Source-unavailable banner or error | AUTHORITY_OFFICER+ |
| Reconciliation | Open discrepancy details | See evidence | `GET /findings/:id` | — | Drawer skeleton | Details + side-by-side | Inline | scoped |
| Reconciliation | Mark for review | Escalate | `PATCH /findings/:id/review` | `{action:"MARK_FOR_REVIEW", note}` | Spinner | Status → `IN_REVIEW` | Toast | AUTHORITY_OFFICER+ |
| Reconciliation | Confirm candidate match | Same person | `PATCH /findings/:id/review` | `{action:"CONFIRM_MATCH", note}` | Confirm dialog | Status updated, label upgraded | Toast | AUTHORITY_OFFICER+ |
| Reconciliation | Dismiss candidate | Different people | `PATCH /findings/:id/review` | `{action:"DISMISS", note (required)}` | Confirm dialog | Removed from queue (history kept) | Toast | AUTHORITY_OFFICER+ |
| Discrepancies | Respond | Provide explanation | `POST /review-cases/:id/responses` | `{message, evidenceRef?}` | Spinner | Appears in thread | Inline | INSTITUTION roles (own) |
| Discrepancies | Request correction | Ask to change a record | `POST /corrections` | `{recordRef, field, proposedValue, reason, evidenceRef?}` | Spinner | Correction `PENDING_APPROVAL` | Validation messages | INSTITUTION roles (own) |
| Discrepancies | Approve / reject correction | Decide | `PATCH /corrections/:id/decision` | `{decision:"APPROVE"|"REJECT", note}` | Confirm dialog | New roster version/event; impact shown | Toast | AUTHORITY_ADMIN (and officer if configured) |
| Discrepancies | Resolve case | Close with code | `PATCH /review-cases/:id/resolve` | `{resolutionCode, note}` | Confirm dialog | Status `RESOLVED` | Toast | AUTHORITY_OFFICER+ |
| Sampling | Preview sample size | See required n | `POST /sampling-runs/preview-size` | `{populationSize, confidenceLevel, marginOfError, expectedProportion}` | Debounced inline | n displayed with assumptions | Inline | authority roles |
| Sampling | Start assurance sampling | Draw sample | `POST /sampling-runs` | `{institutionId, rosterVersionId, params, riskBased?}`, `Idempotency-Key` | Spinner | Run created; items listed | Toast | AUTHORITY_OFFICER+ |
| Sampling | Record item result | Set verified/failed/unconfirmed | `PATCH /sampling-items/:id/result` | `{status, method, evidenceRef?, note}` | Spinner | Item updates, progress bars update | Toast | AUTHORITY_OFFICER+ |
| Sampling | View sample results | See estimate | `GET /sampling-runs/:id/estimate` | — | Skeleton | Estimate + limitations or "insufficient" | Inline | authority roles; institution (own, limited) |
| Sampling | Close run | Finalise | `POST /sampling-runs/:id/close` | `{unresolvedHandling}` | Confirm dialog | Read-only run | Toast | AUTHORITY_OFFICER+ |
| Scorecard | Select date range | Change period | `GET /scorecards/institutions/:id` (+ trend) | `from, to` | Skeleton | Cards/charts update | Error state | scoped |
| Scorecard | Change filters | Programme/category/type | same | `programmeId, seatCategory, institutionType` | Skeleton | Updated | Error state | scoped |
| Scorecard | Compare institutions | Side-by-side | `GET /scorecards/compare` | `institutionIds[], from, to, institutionType` | Skeleton | Comparison chart + not-comparable warnings | Inline | authority roles (institution role: anonymised) |
| Scorecard | View metric details | Definition & raw values | `GET /scorecards/institutions/:id/metrics/:metricId` | `from, to` | Drawer skeleton | Details, formula, context | Inline | scoped |
| Scorecard | Drill into records | See explaining records | `GET /scorecards/institutions/:id/metrics/:metricId/records` | `page, limit, filters` | Table skeleton | Masked records | 403 notice if not permitted | scoped |
| Scorecard | Go to workflow ("Fix this") | Navigate to relevant queue | *(frontend-only navigation, pre-filtered)* | URL query | — | Target page opens filtered | — | scoped |
| Scorecard | Recalculate score | Refresh calculation | `POST /scorecards/institutions/:id/recalculate` | `{from, to}`, `Idempotency-Key` | Spinner | New snapshot + "unchanged" notice if same | Toast | AUTHORITY_ADMIN |
| Lifecycle | Add lifecycle event | Record status change | `POST /lifecycle/events` | `{studentRef, type, effectiveDate, reason}` | Spinner | Timeline updates | Transition error (422) | institution roles |
| Lifecycle | Initiate transfer | Start handshake | `POST /transfers` | `{studentRef, otherInstitutionId, proposedEffectiveDate}` | Spinner | Case `PENDING` | Conflict (409) | INSTITUTION_ADMIN |
| Lifecycle | Confirm transfer | Confirm own side | `PATCH /transfers/:id/confirm` | `{side, effectiveDate, reasonCode, note}` | Confirm dialog | Status progresses | Toast | INSTITUTION_ADMIN (own side) |
| Lifecycle | Reject transfer | Reject with reason | `PATCH /transfers/:id/reject` | `{side, reason}` | Confirm dialog | `NEEDS_REVIEW` | Toast | INSTITUTION_ADMIN (own side) |
| Lifecycle | Resolve overlap case | Close with code | `PATCH /overlap-cases/:id/resolve` | `{resolutionCode, note}` | Confirm dialog | Status updated | Toast | AUTHORITY_OFFICER+ |
| Verification | Request verification | Run connector | `POST /verifications/request` | `{subjectType, subjectId, fieldPath, connectorId}` | Spinner | Label updates; SIMULATED ribbon if applicable | "Unable to verify" notice (not an error page) | AUTHORITY_OFFICER+; institution may request (own) |
| Verification | Officer verify (manual) | Record manual verification | `PATCH /verifications/:id/review` | `{decision, evidenceRef, note}` | Confirm dialog | Label updated | Toast | AUTHORITY_OFFICER+ |
| Versions | View previous version | Open past version | `GET /roster-versions/:id` | `page, limit` | Skeleton | Read-only version | Inline | scoped |
| Versions | Compare versions | Show before/after | `GET /roster-versions/:id/compare` | `against=<versionId>, changeType, page, limit` | Skeleton | Diff table | Inline | scoped |
| Versions | View impact | List stale outputs | `GET /roster-versions/:id/impact` | — | Skeleton | Stale list | Inline | scoped |
| Versions | Revalidate | Re-run stale output | `POST /impact/revalidate` | `{outputType, outputId}`, `Idempotency-Key` | Spinner | Becomes `REVALIDATING` → `REVALIDATED` | Toast | AUTHORITY_OFFICER+ (institution: own reconciliations view only) |
| Versions | Verify roster seal | Check integrity | `POST /roster-versions/:id/verify-seal` | — | Spinner | PASS/FAIL panel with explanation | INCONCLUSIVE panel | AUTHORITY roles; institution (own, result only) |
| Versions | Download receipt | Get signed receipt | `GET /roster-versions/:id/receipt` | — | Spinner | File downloads | Toast | scoped |
| Reports | Export report | Create export | `POST /reports/exports` | `{type, filters, format:"CSV"|"JSON"}` | Progress/poll | Download link when ready | Toast | role-dependent |
| Reports | Download export | Get file | `GET /reports/exports/:id/download` | — | Spinner | File downloads | Expired/403 notice | owner |
| Audit | Filter / view audit history | Inspect events | `GET /audit-events` | `actorId, action, entityType, entityId, from, to, page, limit` | Skeleton | Table | Inline | per matrix |
| Audit | Open event detail | See before/after | `GET /audit-events/:id` | — | Drawer | Masked diff | Inline | per matrix |
| Settings | Save scoring config | New version | `POST /settings/scoring-configs` | `{weights, ceilings, thresholds, minData, notes}` | Spinner | New version created | Validation (weights must sum >0) | AUTHORITY_ADMIN |
| Settings | Activate version | Make version current | `PATCH /settings/scoring-configs/:id/activate` | — | Confirm dialog | Active version label updates | Toast | AUTHORITY_ADMIN |
| Settings | Save seat/occupancy rules | New rule version | `POST /settings/rule-configs` | `{type, rules[], policySourceRef, policyVerified}` | Spinner | New version | Validation messages | AUTHORITY_ADMIN |
| Settings | Manage users | Create/disable | `POST /users`, `PATCH /users/:id` | `{email, role, institutionId}` | Spinner | User listed | Conflict/validation | PLATFORM_ADMIN |
| Global | Data-mode info popover | Explain DEMO/SIMULATED | *(frontend-only)* | — | — | Popover | — | all |
| Global | Column sort / pagination controls | Re-query list | respective list API | `sort, page, limit` | Skeleton | Updated | Inline | scoped |

---

## 8. Chart and Graph Specification

**Global chart rules.** Every chart sits in a `ChartCard` with: title, one-line "question answered", info tooltip (definition), filter bar, `DataContextFooter` (coverage %, unresolved count, as-of time, DEMO/SIMULATED badges), and four states: *loading* (skeleton), *empty* ("No data for these filters" + suggestion), *error* (message + retry + requestId), *insufficient data* (where applicable). Use Recharts by default. Never show a precise estimate or ranking when `dataContext.coveragePct` is below the configured minimum. Drill-down always goes to a permission-checked, paginated, masked table.

| # | Chart | Business question | Type (Recharts) | Required API / fields | Filters | Click / drill-down | Empty / error |
|---|---|---|---|---|---|---|---|
| C1 | Approved intake vs reported occupancy | Are institutions within approved intake? | Grouped/clustered `BarChart` with reference line at 100% | `GET /charts/intake-vs-occupancy` → `[{bucketLabel, approvedIntake, occupancy, headroom, intakeLabel}]` | institution, programme, year, category | Bar → ledger entries drawer | "No ledger data" / retry |
| C2 | Seat utilisation & headroom | How full is each bucket and how much room remains? | Horizontal stacked `BarChart` (occupied + headroom; overflow shown separately) | same as C1 + `utilisationPct, status` | same | Bar → bucket detail | same |
| C3 | Occupancy timeline | How did occupancy change over time? | `LineChart`/`ComposedChart` with intake reference line | `GET /seat-ledger/history` → `[{date, occupancy, approvedIntake}]` | bucket, date range | Point → ledger entries on that date | "No history yet" |
| C4 | Three-way reconciliation outcomes | What share of records is confirmed vs needing review? | `PieChart` (donut) + summary table (avoid colour-only meaning) | `GET /reconciliations/:id/summary` → counts per outcome | run, source set | Slice → findings filtered | "No run yet — run reconciliation" |
| C5 | Matched vs unmatched by source | Which source shows the most gaps? | Grouped `BarChart` | `summary.bySource[{source, matched, notFound, conflict, unavailable}]` | run | Bar → findings by source | note: unavailable shown separately |
| C6 | Discrepancy types & severity | What kinds of issues dominate? | Stacked `BarChart` (type × severity) | `GET /charts/discrepancies-by-type` | institution, status, date range | Segment → queue filtered | empty text |
| C7 | Unresolved discrepancies over time | Is the backlog growing or shrinking? | `AreaChart`/`LineChart` (opened vs resolved vs open total) | `GET /charts/discrepancy-trend` | institution, granularity | Point → queue for that date | empty text |
| C8 | Data completeness trend | Are records getting more complete? | `LineChart` with optional per-field breakdown | scorecard trend `metric=M1` | institution, programme, date range | Point → records missing fields | insufficient-data state |
| C9 | Update timeliness | How quickly are events reported? | Histogram (`BarChart` of lag buckets) + trend line for median/p90 | `GET /charts/timeliness` | institution, event type, date range | Bar → late events list | insufficient-data state |
| C10 | Correction frequency & repeat pattern | Are corrections routine and proactive, or repeated on the same fields? | Composed: bars (corrections/100 records), line (repeat-rate); stacked self-initiated vs prompted | `GET /charts/corrections` | institution, field, date range | Bar → change history | context text: "High volume may indicate active correction" |
| C11 | Scorecard comparison | How do comparable institutions differ per metric? | `BarChart` per metric or `RadarChart` (optional) + percentile band strip; **no single league-table rank by default** | `GET /scorecards/compare` | type, period, programme | Bar → institution scorecard | "Not comparable" panel with reasons |
| C12 | Score trend with formula markers | Is reliability improving, and did the formula change? | `LineChart` with `ReferenceLine` at formula-version changes | `GET /scorecards/institutions/:id/trend` | date range, metric | Point → snapshot detail | insufficient-data state |
| C13 | Assurance sample results | What did sampled checks show, and how certain are we? | Stacked `BarChart` (verified/failed/unconfirmed/pending) + interval display (`ErrorBar` or custom range) **only if estimate valid** | `GET /sampling-runs/:id/estimate` | run | Segment → items filtered | "Estimate unavailable: insufficient resolved checks" |
| C14 | Sample coverage/progress | How far is verification progress? | Progress bar + stacked bar | `GET /sampling-runs/:id` | run | → items | — |
| C15 | Lifecycle transitions | How do students move between statuses? | Sankey is not in Recharts; use stacked `BarChart` of transitions by type or a transition matrix table (use a separate library only if truly needed) | `GET /charts/lifecycle-transitions` | institution, year | Bar → events list | empty text |
| C16 | Transfer-pending counts & ageing | How many handshakes are waiting and for how long? | `BarChart` by age bucket, split by side awaiting | `GET /charts/transfers-pending` | institution, age | Bar → transfer cases | empty text |
| C17 | Record change impact | How many outputs became stale after a change? | Stacked `BarChart` by output type (fresh/stale/revalidated) | `GET /roster-versions/:id/impact` | version | Bar → stale list | "No downstream outputs" |
| C18 | Coverage & unresolved indicators | How much data is behind these numbers? | KPI tiles + small bullet bars | `dataContext` blocks | global | → unresolved list | — |

**Accessibility for charts:** provide a "view as table" toggle, use patterns/labels in addition to colour, ensure keyboard-focusable data points where Recharts supports it, and include text summaries (`aria-label`). The visual theme and colours are **entirely Developer B's choice**; this specification does not prescribe a palette.

---
## 9. Backend Architecture (Developer A)

### 9.1 Style: modular monolith
One Express app, one MongoDB Atlas database, clearly separated modules. No microservices, queues or caches at v1 (justification in §13).

**Module system:** use **ES modules** (`"type": "module"`) consistently across the backend.

### 9.2 Folder layout
```
backend/
  package.json
  .env.example
  src/
    server.js                # boot: load config, connect DB, start HTTP
    app.js                   # express app: middleware, routes, error handler
    config/                  # env.js (validated), db.js, constants.js, keys.js
    models/                  # Mongoose schemas (one file per collection)
    routes/                  # route tables only: path -> validators -> controller
      index.js  auth.routes.js  institutions.routes.js  rosters.routes.js ...
    controllers/             # parse request, call ONE service, shape response
    services/                # ALL business logic
      reconciliation/  ledger/  sampling/  scorecard/  lifecycle/
      verification/  versions/  seal/  audit/  reports/
      connectors/            # BaseConnector + mock connectors
    middleware/              # authenticate, authorize, scopeToInstitution, rateLimit,
                             # validate, upload, requestId, errorHandler, redactLogs, idempotency
    validators/              # Joi/Zod-free option: Joi (JS) or express-validator schemas
    utils/                   # canonicalJson, hash, apiResponse, pagination, dates, csvSafe, ApiError
    jobs/                    # (only if needed) scheduled snapshot/recalc scripts
    seed/                    # synthetic data generators + planted scenarios
  tests/
    unit/  integration/  fixtures/  e2e/
```

### 9.3 Layer responsibilities

| Layer | Does | Must NOT |
|---|---|---|
| Routes | Map URL+method to validators/middleware/controller | Contain logic |
| Middleware | Cross-cutting: auth, RBAC, scoping, limits, request IDs, idempotency, error mapping | Call business services directly (except auth lookup) |
| Validators | Validate/sanitise `params/query/body`; strip unknown fields (blocks mass assignment) | Touch the DB |
| Controllers | Translate HTTP ↔ service calls; apply envelope | Hold business rules |
| Services | Business rules, transactions, calculations, audit emission | Know about `req`/`res` |
| Models | Schema, indexes, simple instance helpers | Cross-collection workflows |
| Utils | Pure helpers (hash, canonical JSON, pagination) | Have side effects |
| Jobs | Scheduled/long operations calling services | Duplicate service logic |

### 9.4 Recommended libraries (JavaScript)
`express`, `mongoose`, `helmet`, `cors`, `express-rate-limit`, `jsonwebtoken`, `argon2` (or `bcrypt`), `cookie-parser`, `joi` (or `express-validator`), `multer` (memory/limits) + `csv-parse` (streaming), `pino`/`pino-http`, `uuid`, Node built-in `crypto`. Tests: `jest` or `vitest`, `supertest`, `mongodb-memory-server` (use a replica-set mode for transaction tests). Frontend tests: `vitest`, `@testing-library/react`, `playwright` (E2E).

### 9.5 Cross-cutting behaviours
- **Request pipeline:** `requestId → helmet → cors → body limits → pino-http (redacted) → rateLimit → authenticate → authorize → scopeToInstitution → validate → controller → service`.
- **Audit emission:** services call `auditService.record({actor, action, entityType, entityId, before, after, outcome})` for sensitive operations; audit docs are append-only.
- **Error handling:** services throw `ApiError(code, status, message, details)`; the global handler maps unknown errors to a generic `INTERNAL_ERROR` and logs details server-side only.
- **Config via env** validated at start; the app refuses to boot with missing secrets.

---

## 10. MongoDB Data Model

> These are proposed entities, **consolidated where sensible**. Trade-offs are noted. All collections include `createdAt`, `updatedAt` (Mongoose `timestamps: true`) unless stated. `ObjectId` refs shown as `→`.

### 10.1 Collection overview and consolidation decisions

| Collection | Purpose | Notes / consolidation |
|---|---|---|
| `users` | Accounts, roles | roles as enum; `institutionId` for institution roles |
| `institutions` | Institution master | includes `type`, `state`, `status` |
| `programmes` | Programme per institution with **embedded** `intakeByYear[]` (approved intake + label) | embedding avoids a join; fine at this scale; moves to separate collection if history grows |
| `studentTokens` | Pseudonymous student identity per institution relationship | no raw APAAR |
| `rosterUploads` | Raw uploaded file metadata + parse summary (+ optional raw rows in staging collection) | separation of raw vs validated |
| `rosterVersions` | Versions with state, file hash, counts | immutable once committed |
| `rosterRows` | Validated rows per version | large; chunk/bulk insert |
| `rosterChanges` | Diff summary between versions | row-level diffs computed on demand + summary stored |
| `lifecycleEvents` | Student status events | append-only; supersede via correction events |
| `transferCases` | Two-sided transfer handshake | |
| `seatLedgerEntries` | Append-only occupancy movements | |
| `seatBalances` | Derived/cached balances per bucket | recomputable |
| `seatBalanceSnapshots` | Time series | optional if history computed on the fly |
| `externalRegisterRecords` | **SIMULATED** admission/exam registers (seeded) | replaced by connectors later |
| `reconciliationRuns` | Run metadata + summary | |
| `reconciliationFindings` | Findings; `reviewCases` merged here via `type` | consolidation: one `reviewCases` collection serves discrepancies, overlaps, transfer reviews |
| `reviewCases` | Unified queue (type, status, severity, thread) | **merged** with findings workflow where appropriate |
| `corrections` | Requested/approved corrections | links to new roster version/event |
| `samplingRuns` / `samplingItems` | Sampling | two collections (items can be large) |
| `scoreSnapshots` | Score + embedded metric details | **metricSnapshots embedded** to avoid extra joins |
| `scoringConfigs` | Versioned scoring formulas | immutable |
| `ruleConfigs` | Versioned rules (occupancy, recon thresholds, overlap, sampling defaults) | one collection, `type` discriminator |
| `verificationSources` | Connector registry | |
| `verificationRecords` | Label/verification evidence | |
| `integritySeals` | Seal manifests + Merkle top levels | |
| `sealAnchors` | **Insert-only** anchor chain, signed | restricted DB user |
| `impactRecords` | Blast-radius results & freshness | |
| `reports` | Export metadata with dependencyRefs + content hash | |
| `auditEvents` | Append-only audit | no update/delete permission for app user |
| `idempotencyKeys` | Key → result pointer (TTL) | |

### 10.2 Key schemas (illustrative Mongoose-style definitions, JavaScript)

```js
// users
{
  email: { type: String, unique: true, lowercase: true, required: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ["PLATFORM_ADMIN","AUTHORITY_ADMIN","AUTHORITY_OFFICER","AUDITOR","INSTITUTION_ADMIN","INSTITUTION_OPERATOR"], required: true },
  institutionId: { type: ObjectId, ref: "Institution", default: null }, // required for INSTITUTION_*
  assignedInstitutionIds: [ObjectId],  // for AUTHORITY_OFFICER scoping
  status: { type: String, enum: ["ACTIVE","DISABLED"], default: "ACTIVE" },
  failedLogins: Number, lockedUntil: Date, tokenVersion: { type: Number, default: 0 }, // revocation
  lastLoginAt: Date
}
// index: { email: 1 } unique; { institutionId: 1, role: 1 }

// institutions
{ code: { type: String, unique: true }, name: String, type: String /* config-driven group */, state: String,
  status: String, dataMode: { type: String, enum: ["DEMO","LIVE"] } }

// programmes (with approved intake history)
{ institutionId, code, name, durationYears: Number,
  intakeByYear: [{ academicYear, seatCategory, approvedIntake: Number,
     label: { type: String, enum: LABELS }, sourceRef: String, sourceMode: { type: String, enum: ["LIVE","SIMULATED","DECLARED"] },
     setBy: ObjectId, setAt: Date, supersededAt: Date }] }
// index: { institutionId: 1, code: 1 } unique

// studentTokens
{ tokenHmac: { type: String, index: true }, keyVersion: Number, last4: String /* optional */, firstSeenAt: Date }
// index: { tokenHmac: 1, keyVersion: 1 } unique

// rosterVersions
{ institutionId, academicYear, versionNumber, status: { enum: ["UPLOADED","VALIDATED","COMMITTED","REJECTED"] },
  fileSha256: String, rowCount: Number, validation: { errors: Number, warnings: Number, ruleVersion: String },
  supersedesVersionId: ObjectId, committedBy: ObjectId, committedAt: Date, sealId: ObjectId }
// index: { institutionId: 1, academicYear: 1, versionNumber: -1 } unique on (inst, year, version)

// rosterRows (validated rows)
{ rosterVersionId, rowKey: String, studentTokenId: ObjectId, programmeCode, seatCategory, academicYear,
  admissionDate: Date, status: String, fields: { /* allow-listed normalised fields */ },
  fieldLabels: { /* optional per-field assurance labels */ },
  completenessFlags: { /* per required field present? */ }, rowHash: String }
// index: { rosterVersionId: 1, rowKey: 1 } unique; { rosterVersionId: 1, programmeCode: 1, seatCategory: 1 }
// NOTE: raw APAAR is NOT stored; name/contact stored only if required, encrypted-at-rest + restricted.

// lifecycleEvents
{ studentTokenId, institutionId, type, effectiveDate, reportedAt, status: { enum: ["ACTIVE","SUPERSEDED"] },
  supersedesEventId, sourceRef, reason, createdBy }
// index: { studentTokenId: 1, effectiveDate: 1 }; { institutionId: 1, reportedAt: -1 }

// seatLedgerEntries (append-only)
{ bucketKey: String /* inst|prog|year|cat */, institutionId, programmeId, academicYear, seatCategory,
  type: String, delta: Number, effectiveDate: Date, eventRef: { kind, id }, idempotencyKey: { type: String, unique: true },
  ruleVersion: String, createdBy }
// index: { bucketKey: 1, effectiveDate: 1 }

// seatBalances
{ bucketKey: { type: String, unique: true }, approvedIntake: Number, approvedIntakeLabel: String, occupancy: Number,
  headroom: Number, utilisationPct: Number, status: String, flags: [String], ruleVersion: String, lastEntryAt: Date, __v: Number }

// reconciliationRuns / findings
{ institutionId, academicYear, rosterVersionId, sources: [String], sourceModes: Object, ruleVersion, status,
  summary: Object, startedBy, idempotencyKey, dependencyRefs: Object, freshness: { enum: ["FRESH","STALE","REVALIDATING","REVALIDATED"] } }
{ runId, type, severity, recordRef: { rowKey, studentTokenId }, sourceRefs: [Object], fieldDiffs: [Object],
  matchConfidence: { enum: ["STRONG","MODERATE","WEAK"] }, reviewStatus: { enum: ["OPEN","IN_REVIEW","CONFIRMED","DISMISSED","RESOLVED"] },
  reviewHistory: [{ by, at, action, note }] }
// index: { runId: 1, type: 1, reviewStatus: 1 }; { institutionId: 1, reviewStatus: 1, createdAt: -1 }

// samplingRuns / samplingItems
{ institutionId, rosterVersionId, params: Object, populationSize, populationHash, selection: { method, seedProof, drawnAt },
  strata: [{ name: "RANDOM"|"RISK_BASED", size }], status, closedAt, dependencyRefs }
{ runId, rowKey, studentTokenId, stratum, status: { enum: ["PENDING","VERIFIED","FAILED_CHECK","UNCONFIRMED","EXCLUDED"] },
  method, evidenceRef, checkedBy, checkedAt, note, history: [Object] }

// scoreSnapshots
{ institutionId, filter: { programmeId, seatCategory }, period: { from, to }, formulaVersion, scoringConfigId,
  status: { enum: ["SCORED","INSUFFICIENT_DATA"] }, score: Number, band: String,
  metrics: [{ id, raw: Object, subScore: Number, weight: Number, available: Boolean, contextNote: String }],
  coverage: { coveragePct, unresolvedRecords, recordsInScope }, inputsHash: String, ruleVersions: Object,
  trigger: String, isBackfill: Boolean, stale: Boolean, staleReason: String, calculatedAt: Date }
// index: { institutionId: 1, "period.from": 1, "period.to": 1, formulaVersion: 1 }

// scoringConfigs (immutable)
{ versionLabel: "scoring-config@v1", weights: { m1, m2, m3, m4 }, ceilings: { discrepancyRatePer1000, lagDays, repeatRate },
  bands: [{ name, min }], minData: { minRecordsForScore, minDenominatorPerMetric, minMetricsAvailable }, m4EnabledInScore: Boolean,
  officialStatus: { type: String, default: "PROPOSED_NOT_OFFICIAL" }, createdBy, isActive: Boolean }

// verificationRecords
{ subjectType, subjectId, fieldPath, valueSnapshot, label, sourceRef, sourceMode, method, status, verifiedAt,
  sourceVersion, reviewer: { userId, role }, evidenceRef, supersededAt, conflictFlag }

// integritySeals + sealAnchors
{ rosterVersionId, sealSchemaVersion, rowCount, merkleRoot, topLevels: [String], manifest: Object, manifestHash }
{ seq: { type: Number, unique: true }, institutionId, rosterVersionId, manifestHash, merkleRoot, previousAnchorHash, anchorHash,
  signature: String, signingKeyId: String, createdAt }   // insert-only

// impactRecords
{ triggerType: "ROSTER_VERSION"|"CORRECTION", triggerId, affectedBuckets: [Object], changes: Object,
  outputs: [{ type, id, freshness, revalidationStatus, revalidatedOutputId }] }

// auditEvents (append-only)
{ at: Date, actor: { userId, role, institutionId }, action, entityType, entityId, before: Object /* masked */, after: Object /* masked */,
  outcome: "SUCCESS"|"DENIED"|"ERROR", ip: String, userAgentHash: String, requestId }
// index: { entityType: 1, entityId: 1, at: -1 }; { "actor.userId": 1, at: -1 }

// idempotencyKeys
{ key: String, userId, route, resultRef, createdAt: { type: Date, expires: 86400 } } // TTL
```

### 10.3 Trade-offs
- **Embedding vs referencing:** `intakeByYear` embedded for simplicity; `rosterRows` referenced (can be 10⁵+ rows).
- **Derived vs ledger-only:** cached `seatBalances` are fast but must be verifiable → integrity job.
- **Unified `reviewCases`:** one queue simplifies the UI; type-specific payloads live in `payload` subdocuments.
- **Snapshots vs on-the-fly:** score snapshots avoid repeated heavy aggregation and give history.

---

## 11. API Reference and Sample Contracts

Base: `/api/v1`. All endpoints require `Authorization: Bearer <accessToken>` unless noted. All lists accept `page, limit, sort`. "Scoped" = institution roles are limited to their own institution automatically.

### 11.1 Authentication & users
| Method & path | Description | Role | Body / query | Success | Errors |
|---|---|---|---|---|---|
| `POST /auth/login` | Login | public | `{email, password}` | `{user, accessToken, expiresIn}` (+ httpOnly refresh cookie) | 400, 401, 429 |
| `POST /auth/refresh` | Rotate access token | cookie | — | new token | 401 |
| `POST /auth/logout` | Revoke refresh/increase tokenVersion | any | — | `{}` | — |
| `GET /auth/me` | Current user + permissions | any | — | `{user, permissions[]}` | 401 |
| `POST /users` | Create user | PLATFORM_ADMIN | `{email, role, institutionId?, tempPassword}` | `{user}` | 400, 409 |
| `PATCH /users/:id` | Update role/status | PLATFORM_ADMIN | `{role?, status?}` | `{user}` | 403, 404 |

### 11.2 Institutions
| `GET /institutions` | List | authority all; institution own | `q, type, state, page, limit, sort` | `data[]` with `scoreBand`, `openIssues` | 401, 403 |
|---|---|---|---|---|---|
| `GET /institutions/:id` | Detail | scoped | — | institution + summary | 403, 404 |
| `GET /institutions/:id/programmes` | Programmes + intake with labels | scoped | `academicYear` | `data[]` | 403, 404 |

### 11.3 Rosters
| Method & path | Description | Role | Request | Success | Errors |
|---|---|---|---|---|---|
| `GET /rosters/template` | CSV template | institution | — | file | — |
| `POST /rosters/uploads` | Upload CSV (multipart) | INSTITUTION_* | `file`, `academicYear` | `201 {id, fileSha256, rowCount, columns}` | 400, 413, 415, 422 |
| `GET /rosters/uploads/:id/preview` | Parsed preview rows | scoped | `page, limit` | rows (masked) | 404 |
| `POST /rosters/uploads/:id/validate` | Run validation | INSTITUTION_* | — | `{summary:{errors,warnings,byRule}}` | 409, 422 |
| `GET /rosters/uploads/:id/validation-rows` | Row-level results | INSTITUTION_* | `status, rule, page, limit` | rows | 404 |
| `GET /rosters/uploads/:id/errors.csv` | Error file (formula-safe) | INSTITUTION_* | — | CSV | 404 |
| `POST /rosters/uploads/:id/commit` | Commit as sealed version | INSTITUTION_ADMIN | `{acceptWarnings}` | `201 {versionId, versionNumber, seal, impact}` | 409, 422 |

### 11.4 Seat ledger
| `GET /seat-ledger/balances` | Balances | scoped | `institutionId, programmeId, academicYear, seatCategory, status` | list | 403 |
|---|---|---|---|---|---|
| `GET /seat-ledger/balances/:id/entries` | Entries | scoped | `from, to` | list | 404 |
| `GET /seat-ledger/history` | Time series | scoped | `bucketId, from, to, granularity` | `points[]` | 400 |
| `PUT /seat-ledger/intake` | Set/revise intake | AUTHORITY_ADMIN | `{programmeId, academicYear, seatCategory, approvedIntake, sourceRef, reason}` | balance | 400, 403 |
| `POST /seat-ledger/intake-declarations` | Declare intake (label = INSTITUTION_DECLARED) | INSTITUTION_ADMIN | same minus sourceRef | balance | 400 |
| `POST /seat-ledger/verify-integrity` | Recompute vs cached | AUTHORITY_ADMIN | `{bucketId?}` | `{ok, drifts[]}` | — |

### 11.5 Reconciliation & discrepancies
| `POST /reconciliations` | Run | AUTHORITY_OFFICER+ | see Feature 1 | `201 {id, summary}` | 400, 409, 422 |
|---|---|---|---|---|---|
| `GET /reconciliations` | List runs | scoped | `institutionId, academicYear, freshness` | list | — |
| `GET /reconciliations/:id` | Run detail | scoped | — | run | 404 |
| `GET /reconciliations/:id/summary` | Chart-ready summary | scoped | — | counts | 404 |
| `GET /reconciliations/:id/findings` | Findings | scoped | `type, severity, reviewStatus, source, page, limit` | list (masked) | — |
| `GET /findings/:id` | Finding detail | scoped | — | finding + side-by-side | 404 |
| `PATCH /findings/:id/review` | Review action | AUTHORITY_OFFICER+ | `{action, note}` | finding | 400, 403 |
| `GET /review-cases` | Unified queue | scoped | `type, status, severity, ageBucket, institutionId` | list | — |
| `POST /review-cases/:id/responses` | Institution response | INSTITUTION_* | `{message, evidenceRef?}` | case | 403 |
| `PATCH /review-cases/:id/resolve` | Resolve | AUTHORITY_OFFICER+ | `{resolutionCode, note}` | case | 422 |
| `POST /corrections` | Request correction | INSTITUTION_* | `{recordRef, field, proposedValue, reason, evidenceRef?}` | `201` correction | 400 |
| `PATCH /corrections/:id/decision` | Approve/reject | AUTHORITY_ADMIN | `{decision, note}` | correction + impact | 409 |

### 11.6 Assurance sampling
| `POST /sampling-runs/preview-size` | Compute n | authority | params | `{sampleSize, assumptions}` | 400 |
|---|---|---|---|---|---|
| `POST /sampling-runs` | Start | AUTHORITY_OFFICER+ | params + `riskBased?` | `201 run` | 400, 409 |
| `GET /sampling-runs/:id` | Run + progress | scoped | — | run | 404 |
| `GET /sampling-runs/:id/items` | Items | scoped | `status, stratum, page, limit` | list (masked) | — |
| `PATCH /sampling-items/:id/result` | Record result | AUTHORITY_OFFICER+ | `{status, method, evidenceRef?, note}` | item | 409 (closed) |
| `GET /sampling-runs/:id/estimate` | Estimate | scoped | — | see Feature 3 | — |
| `POST /sampling-runs/:id/close` | Close | AUTHORITY_OFFICER+ | `{unresolvedHandling}` | run | 422 |

### 11.7 Scorecard
| `GET /scorecards/institutions/:id` | Scorecard summary | scoped | `from, to, programmeId?, seatCategory?` | see Feature 4 | 400, 403 |
|---|---|---|---|---|---|
| `GET /scorecards/compare` | Comparison | authority (institution: anonymised) | `institutionIds, from, to, institutionType` | `items[], comparable, reasons` | 400 |
| `GET /scorecards/institutions/:id/trend` | Trend | scoped | `metric, from, to, granularity` | `points[]` | 400 |
| `GET /scorecards/institutions/:id/metrics/:metricId` | Metric detail & definition | scoped | `from, to` | detail | 404 |
| `GET /scorecards/institutions/:id/metrics/:metricId/records` | Drill-down (masked, paginated) | scoped | `page, limit, filters` | list | 403 |
| `POST /scorecards/institutions/:id/recalculate` | Recalculate | AUTHORITY_ADMIN | `{from, to}` | snapshot | 409 |
| `GET /scorecards/config` | Active config (public to authenticated) | any | — | weights, definitions | — |
| `GET/POST/PATCH /settings/scoring-configs` | Version list/create/activate | AUTHORITY_ADMIN (read: AUDITOR) | see §7 | config | 400 |

### 11.8 Lifecycle & transfers
| `POST /lifecycle/events` | Add event | INSTITUTION_* | `{studentRef, type, effectiveDate, reason}` | `201 event` | 422 |
|---|---|---|---|---|---|
| `GET /lifecycle/students/:ref/events` | Timeline | scoped | — | events | 403 |
| `POST /transfers` | Initiate | INSTITUTION_ADMIN | `{studentRef, otherInstitutionId, proposedEffectiveDate}` | `201` | 409 |
| `GET /transfers` | List | scoped | `status, page, limit` | list | — |
| `PATCH /transfers/:id/confirm` | Confirm side | INSTITUTION_ADMIN | see Feature 5 | case | 403, 422 |
| `PATCH /transfers/:id/reject` | Reject | INSTITUTION_ADMIN | `{side, reason}` | case | 403 |
| `GET /overlap-cases` / `PATCH /overlap-cases/:id/resolve` | Overlap review | AUTHORITY_OFFICER+ | `{resolutionCode, note}` | case | 422 |

### 11.9 Verification labels
| `GET /verifications` | List | scoped | `subjectType, label, sourceMode` | list | — |
|---|---|---|---|---|---|
| `GET /verifications/by-subject` | History for subject | scoped | `subjectType, subjectId, fieldPath` | list | — |
| `POST /verifications/request` | Request via connector | AUTHORITY_OFFICER+ (institution: own) | see Feature 6 | record | 503 handled as `UNABLE_TO_VERIFY` |
| `PATCH /verifications/:id/review` | Manual officer verification | AUTHORITY_OFFICER+ | `{decision, evidenceRef, note}` | record | 400 |
| `GET /connectors/status` | Connector health & mode | authority | — | list | — |

### 11.10 Roster versions, impact, seals
| `GET /roster-versions` | List | scoped | `institutionId, academicYear` | list | — |
|---|---|---|---|---|---|
| `GET /roster-versions/:id` | Version + rows (masked, paginated) | scoped | `page, limit` | version | 404 |
| `GET /roster-versions/:id/compare` | Diff | scoped | `against, changeType, page, limit` | changes | 400 |
| `GET /roster-versions/:id/impact` | Blast radius | scoped | — | see Feature 7 | — |
| `POST /impact/revalidate` | Revalidate output | AUTHORITY_OFFICER+ | `{outputType, outputId}` | `202/200` | 409 |
| `POST /roster-versions/:id/verify-seal` | Verify | authority; institution own | — | PASS/FAIL/INCONCLUSIVE | 404 |
| `GET /roster-versions/:id/receipt` | Signed receipt | scoped | — | file/JSON | 404 |
| `GET /seal-anchors/chain-head` | Latest chain head receipt | AUTHORITY_ADMIN | — | signed head | — |

### 11.11 Charts, dashboard, audit, reports
| `GET /dashboard/summary` | KPIs | all (scoped) | — | counts + dataContext | — |
|---|---|---|---|---|---|
| `GET /charts/*` | Chart-ready data (see §8) | scoped | filters per chart | `{series[], dataContext}` | 400 |
| `GET /audit-events` | Audit list | per matrix | `actorId, action, entityType, entityId, from, to` | list | 403 |
| `GET /audit-events/:id` | Detail | per matrix | — | event | 404 |
| `POST /reports/exports` | Create export (async if large) | role-based | `{type, filters, format}` | `202 {id, status}` | 400, 429 |
| `GET /reports/exports/:id` | Status | owner | — | status | 404 |
| `GET /reports/exports/:id/download` | Download (CSV formula-safe) | owner | — | file | 403, 410 |

### 11.12 Sample contracts (most important)

**Login** `POST /auth/login`
```json
// request
{ "email": "officer.demo@example.test", "password": "••••••••" }
// response 200
{ "success": true, "data": {
  "user": { "id": "u_21", "role": "AUTHORITY_OFFICER", "institutionId": null, "name": "Demo Officer" },
  "accessToken": "<jwt>", "expiresIn": 900 }, "requestId": "req_1" }
```

**Roster upload** `POST /rosters/uploads` (multipart)
```json
// response 201
{ "success": true, "data": { "id": "6710aa...", "academicYear": "2025-26", "fileSha256": "ab12…", "rowCount": 500,
  "columns": [{ "header": "apaar_id", "mappedTo": "apaarId" }, { "header": "programme", "mappedTo": "programmeCode" }],
  "warnings": ["2 unrecognised columns ignored"] } }
```

**Validation summary** `POST /rosters/uploads/:id/validate`
```json
{ "success": true, "data": { "status": "VALIDATED_WITH_WARNINGS",
  "summary": { "rows": 500, "errors": 0, "warnings": 14,
    "byRule": [ { "rule": "REQUIRED_FIELD_MISSING", "field": "category", "count": 9 },
                { "rule": "INTAKE_BUCKET_EXCEEDED", "count": 1 },
                { "rule": "DUPLICATE_CANDIDATE_IN_FILE", "count": 4 } ] },
  "ruleVersion": "roster-rules@2",
  "seatImpactPreview": [ { "bucket": "CSE|2025-26|GENERAL", "approvedIntake": 60, "projectedOccupancy": 63, "status": "OVER_CAP_DISCREPANCY" } ] } }
```

**Commit** `POST /rosters/uploads/:id/commit`
```json
{ "success": true, "data": { "versionId": "6700e1...", "versionNumber": 2,
  "seal": { "merkleRoot": "9ab4…", "anchoredAt": "2026-01-10T09:00:00Z", "anchorSeq": 41, "receiptUrl": "/api/v1/roster-versions/6700e1/receipt" },
  "impact": { "staleOutputs": 4 } } }
```

**Finding review** `PATCH /findings/:id/review`
```json
// request
{ "action": "DISMISS", "note": "Different DOB and programme; not the same person" }
// response
{ "success": true, "data": { "id": "6662c3...", "reviewStatus": "DISMISSED",
  "reviewHistory": [{ "by": "u_21", "at": "2026-01-10T10:20:00Z", "action": "DISMISS", "note": "Different DOB and programme; not the same person" }] } }
```

**Audit event list** `GET /audit-events?entityType=ROSTER_VERSION&page=1&limit=25`
```json
{ "success": true, "data": [ { "id": "6a01…", "at": "2026-01-10T09:00:00Z", "actor": { "userId": "u_17", "role": "INSTITUTION_ADMIN" },
  "action": "ROSTER_COMMIT", "entityType": "ROSTER_VERSION", "entityId": "6700e1…", "outcome": "SUCCESS" } ],
  "meta": { "page": 1, "limit": 25, "total": 312, "totalPages": 13 } }
```

**Report export** `POST /reports/exports`
```json
{ "type": "SCORECARD_SUMMARY", "filters": { "institutionId": "665f1c", "from": "2025-07-01", "to": "2026-01-31" }, "format": "CSV" }
// 202
{ "success": true, "data": { "id": "6b10…", "status": "PROCESSING", "pollUrl": "/api/v1/reports/exports/6b10…" } }
```
Exports stamp `dependencyRefs`, `contentHash`, DEMO/SIMULATED markers, and prefix risky cell values (`=`, `+`, `-`, `@`, tab, CR) with `'` to prevent CSV formula injection.

---
## 12. Security and Privacy Plan

### 12.1 Threat-oriented checklist

| # | Area | Threat | Required control | Owner |
|---|---|---|---|---|
| 1 | Authentication | Credential stuffing, weak passwords | Argon2id/bcrypt hashing with per-user salt; min length + breach-list check (optional); login rate-limit + temporary lockout; generic error messages | A |
| 2 | Sessions/tokens | Stolen token, no revocation | Short-lived access JWT (≈15 min), rotating refresh token in httpOnly+Secure+SameSite cookie, `tokenVersion` on user for revocation (logout/role change/disable bumps it), refresh-token reuse detection | A (B stores token in memory only) |
| 3 | Authorisation | Role bypass via UI tampering | `authorize(roles)` middleware on every route; deny by default; frontend route guards are UX only | A |
| 4 | Institution isolation | One institution reading another's data (IDOR) | `scopeToInstitution` injects `institutionId` from the token; every query includes it; fetch-by-id checks ownership; tests for cross-tenant access on **every** endpoint | A |
| 5 | Input validation | Injection, malformed data | Schema validation on params/query/body; reject unknown fields; sanitise strings; use Mongoose casting + `express-mongo-sanitize`-style stripping of `$`/`.` keys to block NoSQL operator injection | A |
| 6 | Mass assignment | Client sets `role`, `status`, `institutionId` | Allow-list fields per endpoint; never spread `req.body` into models | A |
| 7 | Upload limits | Memory/disk exhaustion | `multer` size limit (e.g., 10 MB, configurable), MIME + extension + magic-byte check, row-count cap, streaming parse, request body size limit (e.g., 1 MB JSON) | A |
| 8 | CSV parsing | Malformed rows, encoding tricks, huge fields | Strict parser options, max field length, handle BOM/encodings, reject binary, per-row error collection without crashing, timeouts | A |
| 9 | CSV export | Formula injection (`=cmd|…`) | Prefix cells starting with `= + - @ \t \r` with `'`; set `Content-Disposition`; export tests | A |
| 10 | Documents (if supported) | Malicious files | Not required for MVP. If added: allow-list types (PDF/PNG/JPG), size cap, content sniffing, store outside web root/object storage with random names, AV scan (future), serve via authorised download with `Content-Disposition: attachment`, never execute/inline-render untrusted HTML | A |
| 11 | Sensitive identifiers | Raw APAAR/Aadhaar in logs/DB | Never store Aadhaar at all; APAAR only transiently for tokenisation; `redactLogs` middleware; error handler never echoes request bodies; automated test scanning logs/responses/DB for ID patterns | A |
| 12 | HMAC keys | Key leakage; no rotation | Keys only in secret manager/env; versioned (`keyVersion`); rotation runbook; separate keys for tokens vs seals; never in repo, logs or API; access restricted to `keyManagementService` | A |
| 13 | Roster integrity | Silent tampering | Server-side canonical hashing, Merkle root, insert-only signed anchor chain, out-of-band chain-head export (see Feature 7) | A |
| 14 | Audit logging | Unaccountable actions | Append-only `auditEvents` for login/failed login, uploads, commits, corrections, approvals, reviews, verification, config changes, exports, drill-down views of record-level data, seal verifications; app DB user has no update/delete on this collection | A |
| 15 | Rate limiting | Abuse/DoS/brute force | Global + per-route limits (stricter on `/auth/*`, uploads, exports, sampling), per-user and per-IP; 429 with `Retry-After` | A |
| 16 | CORS | Cross-origin abuse | Explicit allow-list origin from env; credentials only for that origin; no wildcard with credentials | A |
| 17 | HTTP headers | Clickjacking, sniffing | `helmet` defaults, strict CSP on the frontend host, HSTS in production | A/B |
| 18 | Secrets | Leakage | `.env` never committed; `.env.example` only; startup validation; different secrets per environment; rotate on suspicion | A |
| 19 | Error responses | Information leakage | Uniform envelope; generic 500 message; stack traces only in server logs with `requestId` | A |
| 20 | DB access | Over-privileged connections | Separate MongoDB users: app (read/write limited collections), anchor writer (insert-only on `sealAnchors`, `auditEvents`), admin separate; IP allow-listing on Atlas; TLS; no public Atlas access without allow-list | A |
| 21 | Backup/restore | Data loss, tampering via restore | Atlas backups enabled; documented restore drill; anchors/chain-head receipts stored separately so a restore cannot silently erase seal history | A |
| 22 | Data retention | Over-retention of personal data | Retention schedule per collection (e.g., raw uploads purged after N days post-validation, sampling contact data purged after close, rows archived per policy) — periods are **[ASSUMPTION]** pending policy; deletion jobs audited | A |
| 23 | Least privilege | Excessive data in views | Return minimum fields per role; mask names/IDs by default (`last 2` chars); small-cell suppression in aggregates for institution roles; drill-down requires scope + audit | A/B |
| 24 | Public exposure | Leaking records via QR/dashboard | **No QR code or public page contains student-level data.** If receipts have QR codes, they contain only an opaque verification token that resolves to **PASS/FAIL + institution + version + root prefix**, behind rate limits; no student rows | A/B |
| 25 | Frontend | XSS, token theft | Never use `dangerouslySetInnerHTML` with API data; React escaping; token in memory only; sanitise any rich text (avoid it); CSP; dependency audit (`npm audit`) | B |
| 26 | Dependency risk | Vulnerable packages | Lock files, `npm audit` in CI, minimal dependencies | A/B |

### 12.2 Remaining risks to state honestly
- **HMAC tokens are pseudonymous, not anonymous.** Compromise of the key plus a list of candidate IDs enables re-identification. Tokenisation reduces exposure; it does not guarantee privacy.
- Seals prove integrity relative to the anchor; they do not prove truth.
- A trusted insider with DB admin rights and signing keys remains a risk; mitigations are separation of duties, restricted DB roles and out-of-band chain-head receipts.
- Mock connectors are not security-validated integrations.
- A privacy/legal review (DPDP Act obligations, data-sharing agreements) is required before any real data is used. This is **not** completed in the prototype. **[ASSUMPTION/RISK]**

### 12.3 Decision-making principle
The system **flags, explains and routes**. **Authorised humans** decide on enrolment violations, misconduct or suspected fraud. No endpoint or UI element sets or displays a "fraud" or "violation" verdict.

---

## 13. Scalability Roadmap

> **Principle:** build the simplest thing that is correct and measurable. Add infrastructure only when a measured threshold is exceeded. **No Redis, Kafka, microservices or other infrastructure is part of v1.**

### 13.1 What v1 handles (target, to be validated by load tests — not proven yet)
- Institutions: hundreds (seeded demo ~5–20).
- Roster size per upload: up to ~50,000 rows (demo ~500–5,000).
- Concurrent users: tens.
- Single MongoDB Atlas cluster; single Node process (can run several identical instances behind a load balancer since the app is stateless).
These are planning targets; measured results must be recorded in §15.6, not assumed.

### 13.2 Techniques by area

| Area | v1 practice | Scale step (when needed) | Trigger to move |
|---|---|---|---|
| Indexes | Index every filter/sort used by list APIs (see §10); compound indexes matching query patterns; review with `explain()` | Add partial/TTL indexes; archive old data | p95 query > threshold (e.g., 300 ms) |
| Pagination/filtering | Server-side only; cursor pagination for large append-only collections (findings, audit) | — | — |
| Bulk imports | Stream CSV (`csv-parse`) in chunks of N (e.g., 1,000); `bulkWrite`/`insertMany(ordered:false)`; validate per chunk; collect row errors | Chunked background processing | Upload > ~60 s or > ~100k rows |
| Duplicate detection | In-file via `Map`/Set on `rowKey`; cross-file via indexed token lookups in batches (`$in`) | Pre-computed token index per bucket | Memory > limit |
| N+1 avoidance | Batch lookups with `$in`, `$lookup` only where indexed, `lean()` queries, projection of needed fields | Materialised aggregates | Many-DB-calls per request detected in tests |
| Reconciliation | Process per programme bucket; set-based comparisons using token maps | Background job + progress polling; resume from checkpoint | Run time > ~30 s |
| Caching | **None by default.** Optional in-process cache for config (`scoringConfigs`, rules) invalidated on config activation | Shared cache only if multi-instance consistency issues are measured | Proven hotspot |
| Background jobs | Scheduled scripts (`node-cron` or Atlas Scheduler) for snapshots/integrity checks; long runs expose `status` and polling | Managed queue (e.g., a hosted job service) | Jobs > request timeouts, or retries needed |
| Idempotency | `Idempotency-Key` + unique keys on ledger/entries/commit file hash so retries never duplicate effects | — | — |
| Transactions | Use `session.withTransaction` only where multi-document atomicity is required (commit roster + ledger + seal anchor); keep transactions short; retry on transient errors | — | Contention seen in tests |
| Connections | One Mongoose connection pool per process, tuned `maxPoolSize`; graceful shutdown | Per-instance pool tuning | Pool exhaustion metrics |
| Scorecards | Persist `scoreSnapshots` and monthly rollups; recompute incrementally for affected institutions only | Pre-aggregated collections per month | Scorecard API p95 > threshold |
| Retention/archival | Retention schedule per collection; archive old rows/ledger entries to cold collections/exports | Atlas Online Archive | Storage cost/perf |
| API versioning | `/api/v1`; additive changes only; deprecate via headers | `/api/v2` when breaking | Contract breaks |
| Observability | Structured logs (pino) with `requestId`; metrics for latency/error rate; error tracking (Sentry-like, optional) | Dashboards/alerts | Always plan; implement basic logs in v1 |
| Load testing | `autocannon`/`k6` scripts for upload, reconciliation, scorecard, list endpoints against seeded datasets (§15.6) | Capacity planning | Before any claim of scale |
| Future split | Keep services isolated behind interfaces so a heavy module (e.g., reconciliation) can become a worker later | Separate worker/service | Measured CPU/memory isolation need |

### 13.3 Feature-specific scaling notes
1. **Three-way match:** token-indexed lookups; run per bucket; stream source records; store findings in bulk.
2. **Ledger:** append-only inserts with unique idempotency key; nightly integrity recomputation; snapshots for charts.
3. **Sampling:** reservoir sampling; frozen population hash; paginated items.
4. **Scorecard:** snapshot + rollup; only recompute stale snapshots; date-range queries hit indexed fields.
5. **Lifecycle:** index by `(studentTokenId, effectiveDate)`; incremental overlap check per new event.
6. **Verification labels:** cache per `(subject, sourceVersion)` with explicit invalidation.
7. **Seals:** streamed hashing, partial tree storage, recompute leaves on demand.

---

## 14. Data Modelling and Business-Rule Correctness

1. **Raw vs validated.** `rosterUploads` (+ staging rows) hold exactly what was received; `rosterRows` hold normalised, validated rows tied to a version. Raw is never altered after receipt and is purged per retention policy. Validation never "fixes" data silently; normalisations are logged.
2. **Provenance.** Each row/field records `sourceRef` (upload id, connector id), `sourceMode`, `reportedAt`, and `reportedBy`. Labels (Feature 6) say how strong each value is.
3. **Duplicate candidates — no auto-merge.** Duplicates produce `DUPLICATE_CANDIDATE` findings with both records visible; humans confirm or dismiss. Dismissals are stored so the same pair is not repeatedly re-raised (pair key + rule version).
4. **Confirmed facts vs unresolved exceptions.** Statuses separate `CONFIRMED`, `OPEN`, `IN_REVIEW`, `DISMISSED`, `RESOLVED`. Dashboards show unresolved counts alongside any percentage.
5. **Legitimate events.** Transfers (handshake), withdrawals, corrections and missing identifiers have explicit event types/flags; none are treated as errors by default.
6. **No silent overwrites.** Committed versions immutable; corrections → new version/events with `supersedes` links; ledger uses reversal entries; audit stores before/after.
7. **Recalculation.** After any committed change, `impactService` marks dependents stale and triggers recalculation of ledger buckets, reconciliation freshness and scorecard snapshots (Feature 7).
8. **Stale-output identification.** `dependencyRefs` + `freshness` fields on every derived output; UI shows badges and warnings.
9. **Institution-specific differences.** Handled by configuration (`institutionType`, rule sets per type, programme durations, seat categories), never by code branches on institution IDs.
10. **Rule/version stamping.** Every reconciliation, ledger entry, scorecard snapshot, sampling run and verification stores the rule/formula/source version used.
11. **Approved-intake rules** are configurable and carry `policySourceRef` and `policyVerified`. If `policyVerified=false`, the UI shows "Unverified rule — provisional". No regulatory constraint is hardcoded or invented.

---

## 15. Testing Strategy, Synthetic Data and Demo Scenarios

### 15.1 Test layers

| Layer | Tooling | What to test |
|---|---|---|
| Backend unit | Jest/Vitest | Normalisation, matching tiers, sample-size and Wilson interval, scoring formula per metric, weight renormalisation, ledger delta math, canonical JSON, Merkle root, HMAC determinism, state machine transitions, CSV-safe export |
| API integration | Supertest + in-memory/replica-set MongoDB | Every endpoint: success, validation failure, 401/403, cross-institution access (IDOR), pagination bounds, idempotent retries |
| Role & access | Supertest matrix | For each role × endpoint, expected status codes from the permission matrix (generated table-driven test) |
| Scorecard formula | Unit + fixture | Known inputs → exact outputs; correction volume does not change score when M4 disabled; insufficient-data behaviour; formula-version immutability |
| HMAC & seal | Unit + integration | Same input/key → same token; key-version change; no raw ID in DB/logs; tamper test (mutate one row → `FAIL` with correct row); anchor chain continuity; signature verification |
| Reconciliation | Unit + labelled dataset | See §15.4 |
| Sampling stats | Unit | Reference values for n (with/without FPC), Wilson interval vs known tables, small-N handling, non-response never counted as failure |
| Import failures | Integration | Empty file, header-only, BOM, wrong delimiter, binary file, oversized file, 1 row malformed, duplicate headers, extreme field length, formula-looking cells, encoding errors |
| Stale after correction | Integration | Commit v2 → dependent outputs `STALE`, unrelated outputs `FRESH`, revalidation flips status |
| Frontend component | Vitest + Testing Library | Badges (LabelBadge shows SIMULATED ribbon), chart states (loading/empty/error/insufficient), forms, dialogs, role-based rendering (UX only), table pagination |
| End-to-end | Playwright | Workflows in §15.5 against seeded backend |
| Performance/load | `autocannon`/`k6` | See §15.6 |

### 15.2 Synthetic dataset (all fictional)
Seed scripts generate, deterministically (fixed seed): ~6 demo institutions of 2–3 types, 3 programmes each, 3–4 fictional seat categories (`GENERAL`, `RESERVED_A`, `RESERVED_B`, `SPECIAL_DEMO` — placeholders, **not** real policy categories), ~2,000–5,000 students total, fictional names (e.g., from a generator with "Test" suffixes), fictional APAAR-like strings in a clearly invalid-but-formatted pattern (e.g., prefix `TEST-`), emails at `example.test`. All seeded entities have `dataMode: "DEMO"`; mock registers have `sourceMode: "SIMULATED"`.

### 15.3 Planted test conditions (each with an expected outcome)

| ID | Condition | Planted in | Expected result |
|---|---|---|---|
| P1 | Seat bucket exceeding configured limit (63 vs 60) | `SIT-DEMO-01 / CSE / GENERAL` | Ledger `OVER_CAP_DISCREPANCY`; validation preview warning |
| P2 | Student present in roster but absent from mock admission register | 3 rows | 3 `UNMATCHED` findings |
| P3 | Duplicate candidate (same name+DOB, different token; and same token twice in file) | 2 pairs | `DUPLICATE_CANDIDATE`; no auto-merge |
| P4 | Legitimate confirmed transfer A→B | 1 student | `TRANSFER_CONFIRMED`; ledger out/in entries; no overlap case after effective dates |
| P5 | Pending transfer (only sending confirmed) | 1 student | `AWAITING_RECEIVING_CONFIRMATION`; after window → `NEEDS_REVIEW` |
| P6 | Incomplete record (missing category, DOB) | 9 rows | M1 reduced; validation warnings |
| P7 | Late update (event reported 90 days after effective date) | 20 events | M3 lag increases |
| P8 | Repeated correction pattern (same field corrected 3×) | 1 institution | M4 repeat-rate shown; **no score penalty while M4 disabled** |
| P9 | Correction invalidating a previous report | v1 → v2 change in CSE | Reconciliation, score snapshot, report → `STALE` |
| P10 | Roster seal tampering (direct DB edit of one row) | v1 of `SIT-DEMO-02` | `verify-seal` → `FAIL`, row identified |
| P11 | Unavailable external source (failing connector for exam register) | reconciliation run | `SOURCE_UNAVAILABLE`, no mismatches from that source, reduced coverage |
| P12 | Candidate K3-only match | 2 rows | `CANDIDATE_REVIEW`, never auto-confirmed |
| P13 | Self-declared intake | all seeded intakes initially | Label `INSTITUTION_DECLARED` |
| P14 | Non-response in sampling | 20 items `UNCONFIRMED` | Not counted as failed; estimate bounds show sensitivity |
| P15 | Small-denominator institution | 1 tiny institution (<50 records) | `INSUFFICIENT_DATA`, no numeric score |

### 15.4 False-positive / false-negative measurement (labelled synthetic cases)
- Ground truth: the seed script records which planted discrepancies are real (`truth.csv`) and which near-miss cases are benign (e.g., spelling variants of the same person, legitimate transfers).
- A test harness runs reconciliation and computes **precision, recall, false-positive and false-negative counts per finding type** against `truth.csv`; results are written to a test report.
- Report these as **"on this synthetic dataset"** only. Do not claim real-world accuracy.

### 15.5 End-to-end scenarios (Playwright)
1. Institution admin uploads CSV → preview → validate → commit → sees version + seal.
2. Officer runs reconciliation → reviews candidate → resolves unmatched via institution response.
3. Institution requests correction → authority approves → v2 created → impact shows stale outputs → revalidate.
4. Transfer handshake end-to-end (both institutions) and timeout path.
5. Sampling: preview → start → record results → estimate/insufficient states → close.
6. Scorecard: filters, compare, trend, drill-down, "Fix this" navigation, recalc (admin).
7. Seal tamper demo → FAIL display with explanation.
8. Role checks: institution user cannot open another institution's pages or API data.

### 15.6 Performance/load tests (record real numbers; do not pre-claim)
| Test | Dataset | Metric to record |
|---|---|---|
| CSV import | 5k, 50k rows | total time, peak memory |
| Reconciliation run | 5k, 50k roster vs mock registers | duration |
| Scorecard summary / compare | 50 institutions × 12 months snapshots | p50/p95 latency |
| List endpoints | 100k findings, 100k audit events | p95 with pagination |
| Seal verify | 50k rows | duration |
| Concurrent ledger writes | 50 parallel writes to one bucket | correctness (no lost updates) + latency |

Define pass thresholds with the team before testing (e.g., p95 < 500 ms for list endpoints) and keep them in this document once agreed.

---

## 16. Frontend Visual Quality and Usability

Developer B should build a **polished, modern, high-quality administrative product**, not a static mockup. Requirements:
- Clear navigation (sidebar + breadcrumbs), obvious page hierarchy, and consistent layout.
- Strong visual separation between **summary**, **details**, **actions** and **evidence** areas.
- Responsive layouts (desktop-first; usable on tablet; mobile-friendly for review/confirm flows).
- Helpful empty states with next actions; loading skeletons/progress; informative tooltips for definitions.
- Clear status labels (text + icon, never colour alone); consistent badges for assurance labels, freshness, severity.
- Search, filters, sorting and pagination on every list; filter state in the URL so views are shareable (within permissions).
- Attractive, meaningful charts (§8) with drill-down.
- Confirmation dialogs for irreversible/sensitive actions (commit, approve/reject correction, confirm transfer, close sampling run, activate config).
- Clear success/error messages with `requestId` on errors.
- Accessibility: keyboard navigation, focus management in dialogs, ARIA labels, sufficient contrast, reduced-motion respect.
- **Persistent honesty indicators:** `DataModeBanner` (DEMO vs LIVE), `SimulationRibbon` on SIMULATED sources/verifications, `ScorecardDisclaimer`, `SealMeaningNote` ("integrity, not truth").
- Visual theme, colours, typography: **entirely at Developer B's discretion** (no palette is prescribed).
- Must be wired to the real APIs; seeded data must be visibly flagged as demo data.

---

## 17. Product Roadmap (FUTURE — not implemented in the MVP)

- More institution types and configurable intake policies, once policy is verified.
- Additional authorised registers and **live** connectors (APAAR, DigiLocker, counselling, examination, scholarship, AICTE) — only with formal authorisation, agreements and security review.
- Large-scale assurance sampling with managed job queues and field-verification workflows.
- Multi-year institutional trend analysis and calibrated scorecard formulas validated with stakeholders.
- More advanced anomaly detection **only after** obtaining suitable, authorised, representative data and a validation plan.
- Student-facing correction/verification workflows (with identity assurance).
- Improved report generation, controlled data sharing, signed PDF reports.
- Externally notarised anchor timestamps; hardware-backed signing keys.
- Accessibility improvements and multi-language support (including Indian languages).

---

## 18. Implementation Order and Phases

### 18.1 Dependency map
- **Contract first:** Section 4 conventions + Section 11 contracts are the interface. Developer A publishes an OpenAPI-like `contracts/` folder or Postman collection; Developer B builds against **mock responses** (MSW or a JSON stub server) until endpoints land.
- Enum/constant file shared by copy (`constants.js` on both sides, verified in the integration checklist).

### 18.2 Phases

| Phase | Goal | Developer A (Backend) | Developer B (Frontend) | Dependency / hand-off |
|---|---|---|---|---|
| **0. Foundations** (Days 1–2) | Skeleton + contracts | Repo, config, DB connect, error/envelope utils, auth (login/refresh/me), RBAC + scoping middleware, audit service, seed script v0, OpenAPI/Postman for Phase 1 | Vite app, router, layout, `apiClient`, AuthContext, protected routes, shared components (Table, Pagination, Dialog, Badge, ChartCard, states), mock server | A → B: auth contract + token behaviour; B → A: required response fields |
| **1. Roster & Ledger** (Days 3–6) | Data enters the system | Institutions/programmes, CSV upload/preview/validate/commit, rosterVersions/rows, studentToken service (HMAC), ledger + balances, intake labels (declared), snapshots | Institutions pages, Upload stepper, Seat Ledger page + C1–C3 charts, label badges, DataModeBanner | A → B: upload + ledger endpoints stable; B can use mock until then |
| **2. Seals & Versions** (Days 6–8) | Integrity & impact | Seal service (canonical JSON, Merkle), anchor chain + signing, versions list/compare, impact service + freshness fields, receipts | Versions & Impact page, diff table, stale badges, verify-seal UI, C17 | Needs Phase 1 commit flow |
| **3. Reconciliation & Verification** (Days 8–11) | Core checks | Mock registers + connectors, matching service, findings/review cases, corrections, verification records/labels | Reconciliation workspace, Discrepancy queue, Source & Verification page, C4–C6 | Needs Phase 1 rows + tokens |
| **4. Lifecycle & Transfers** (Days 10–12) | Student events | Lifecycle service, state machine, transfer handshake, overlap cases | Lifecycle & Transfers page, C15–C16 | Needs tokens + ledger hooks |
| **5. Scorecard (priority)** (Days 11–14) | Mandatory feature | Metric calculators, scoring config versions, snapshots, compare/trend/drill-down APIs, support suggestions, stale-recalc hooks | Scorecard page: overview, metrics, compare, trends, drill-down, method tab; C8–C12; Settings → scoring config editor | Needs data from Phases 1–4; **start calculators early using Phase 1 data** |
| **6. Sampling** (Days 13–15) | Assurance | Stats service, random selection, runs/items/estimate | Sampling workspace + C13–C14 | Needs rosters |
| **7. Audit, Reports, Settings** (Days 14–16) | Governance | Audit APIs, exports (formula-safe), rule configs, idempotency | Audit page, exports UI, Settings tabs | — |
| **8. Hardening & Demo** (Days 16–18) | Make it solid | Security checklist pass, tests (§15), load tests, seed demo scenarios P1–P15, log redaction scan | E2E tests, accessibility pass, empty/error states, demo script, polish | Joint: run integration checklist (§19) |

**Realistic note:** the phases overlap; the scorecard and seal features are the most differentiating, so protect time for them. If time is short, cut breadth (e.g., chart variants, optional features) before cutting honesty labels, audit, or tests for the mandatory Scorecard.

---

## 19. Frontend/Backend Integration Checklist

**Contract**
- [ ] Response envelope, error codes and pagination match §4 on every endpoint.
- [ ] Field names/enums match the shared constants (labels, statuses, outcomes, roles).
- [ ] Dates are ISO-8601 UTC; academic year format `YYYY-YY`.
- [ ] Every chart endpoint returns `dataContext`.

**Auth & security**
- [ ] Token is kept in memory; refresh flow works; 401/403/429 are handled by `apiClient`.
- [ ] Institution users get 403/404 (not data) for other institutions' IDs.
- [ ] No raw APAAR/Aadhaar appears in any response, console log or network payload.

**UX behaviours**
- [ ] Every button in §7 triggers the listed API (or documented frontend-only action).
- [ ] Loading, success and error states exist for each action; errors show `requestId`.
- [ ] Lists use server-side pagination/sort/filter; no unbounded fetches.
- [ ] DEMO/SIMULATED indicators appear wherever applicable.
- [ ] Scorecard shows disclaimer, definitions, coverage, unresolved count, formula version.
- [ ] Comparison view disables ranking when `comparable=false` and shows reasons.
- [ ] Seal result UI states "integrity, not truth".

**Data flow**
- [ ] Upload → validate → commit → ledger/seal/impact reflect consistently.
- [ ] Correction → new version → stale badges → revalidate → fresh.
- [ ] Idempotency-Key is sent on required endpoints and retries do not duplicate.
- [ ] Export files open safely (formula injection test).

**Process**
- [ ] OpenAPI/Postman collection is current; mock server matches real responses.
- [ ] Seed data covers P1–P15; both developers can reproduce the demo from a fresh database with one command.

---

## 20. Risks and Assumptions

| # | Risk / assumption | Mitigation |
|---|---|---|
| R1 | Policy rules (intake categories, simultaneous enrolment, intake approval) are not verified | Configurable rules with `policyVerified=false`; UI labels "provisional"; stakeholder validation |
| R2 | Scoring weights/ceilings are illustrative | Labelled "PROPOSED_NOT_OFFICIAL"; versioned; need stakeholder review |
| R3 | No live external integrations available | Mock connectors with visible SIMULATED labels; connector interface ready |
| R4 | Matching on weak keys produces false positives | Tiered confidence; human review; measured on synthetic data only |
| R5 | Sampling assumptions (simple random sample, independence, response) may not hold | Show limitations, non-response bounds; hide estimates when thresholds unmet |
| R6 | HMAC tokenisation is pseudonymisation, not anonymity | Key management, access control, minimal exposure, privacy review before real data |
| R7 | Seal trust depends on anchor/key custody | Insert-only anchor store, signed chain, out-of-band chain-head export; future notarisation |
| R8 | MongoDB transactions require replica set (Atlas provides) | Use Atlas M0/M10+; local dev with replica-set memory server |
| R9 | Scope too big for a student team | Phase plan; cut breadth, keep mandatory features and honesty labels |
| R10 | Performance claims untested | Load tests in §15.6; no claims until measured |
| R11 | Data protection/legal compliance not assessed | Document as pre-production requirement |
| R12 | Misuse of scorecard as a ranking/verdict | Disclaimers, non-comparability controls, no league-table default, neutral band names |
| A1 | Institutions can export CSV rosters with a stable per-row key | Template + validation of key presence |
| A2 | Authority users are available to approve corrections | Configurable approver roles |
| A3 | Hackathon demo uses fictional data only | Enforced by seed scripts and DEMO banner |

---

## 21. Final Acceptance Checklist

**Global**
- [ ] Plain JavaScript only; no TypeScript files; no Python/SQL/Redis/Kafka/LLM/ML.
- [ ] All seven features implemented with acceptance criteria AC-1.x … AC-7.x passing.
- [ ] Mandatory **Reliability Scorecard** fully implemented: metrics M1–M4, configurable formula, versioned history, comparison, trends, drill-down, metric→workflow links, coverage & unresolved indicators, missing-data handling, minimum-data rule, stale recalculation, disclaimer.
- [ ] Correction volume is not penalised by default; context is shown with raw metrics.
- [ ] No text anywhere calls an institution fraudulent, dishonest or inferior; no auto fraud/violation verdicts.

**Honesty & labelling**
- [ ] DEMO vs LIVE and SIMULATED vs LIVE are visibly distinguished in UI and exports.
- [ ] Self-declared intake never appears as authority-verified.
- [ ] No claim of live APAAR/DigiLocker/counselling/exam/scholarship/AICTE integration.
- [ ] Policy-dependent rules are marked unverified/provisional.

**Security & privacy**
- [ ] Security checklist §12.1 completed; role and cross-institution tests pass.
- [ ] No raw APAAR/Aadhaar in DB, logs, errors or responses (automated scan).
- [ ] HMAC keys versioned and not in repo; rotation runbook written.
- [ ] Seal tamper test fails correctly; anchor chain verified; receipts downloadable.
- [ ] CSV export formula-injection protection verified.

**Frontend**
- [ ] All pages in §6 reachable by authorised roles; combined pages implemented as tabs/steppers.
- [ ] Every button in §7 works against the real API (or is documented frontend-only).
- [ ] Every chart in §8 has loading, empty, error and (where relevant) insufficient-data states, tooltips, filters and drill-down.
- [ ] Accessibility checks (keyboard, labels, non-colour cues) pass.

**Quality**
- [ ] Unit, integration, role, scorecard, HMAC/seal, reconciliation, sampling-stat, import-failure and stale-output tests pass.
- [ ] False-positive/false-negative report generated on synthetic data and labelled as such.
- [ ] Load-test results recorded with real numbers.
- [ ] One-command seed produces scenarios P1–P15; the end-to-end demo runs from a clean database.
- [ ] README documents setup, environment variables (names only), seeding, running tests and the demo script.

---

*End of specification. Treat this document as the contract between Developer A and Developer B; any change to endpoints, enums or response shapes must be updated here first.*
