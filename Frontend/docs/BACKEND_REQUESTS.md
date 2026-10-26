# Recommended Backend API Additions & Improvements
## SIH 2026 PS3 — APAAR Seat Integrity Platform

This document captures architectural and functional gaps identified during Frontend engineering. To maintain contract purity, the frontend has built zero invented routes and handles all current gaps via resilient client-side adapters and fallback mappings. Adding these endpoints in the backend will significantly reduce frontend roundtrips and improve UX.

---

### 1. `GET /api/v1/institutions` (Global List & Lookup)
- **Current Behavior**: No endpoint exists to list institutions. Frontend must infer institutional IDs from authenticated user scopes, `GET /api/v1/users?role=INSTITUTION_ADMIN`, or rely on known seeded identifiers (`SIT-DEMO-01` through `05`).
- **Proposed Endpoint**:
  ```http
  GET /api/v1/institutions?dataMode=DEMO&type=ENGINEERING&state=Maharashtra&page=1&limit=50
  ```
- **Recommended Response**:
  ```json
  {
    "success": true,
    "data": {
      "items": [
        {
          "_id": "64f1a2b3c4d5e6f7a8b9c0d2",
          "code": "SIT-DEMO-01",
          "name": "Apex Institute of Technology (Demo)",
          "type": "ENGINEERING",
          "state": "Maharashtra",
          "status": "ACTIVE",
          "dataMode": "DEMO"
        }
      ],
      "pagination": { "page": 1, "limit": 50, "total": 6, "totalPages": 1 }
    }
  }
  ```
- **Permission**: `institutions:read` (All roles).

---

### 2. `GET /api/v1/institutions/:id`
- **Current Behavior**: Fetching a single institution's metadata (e.g. state, category, accreditation) is impossible directly by ID.
- **Proposed Endpoint**:
  ```http
  GET /api/v1/institutions/:id
  ```

---

### 3. `GET /api/v1/programmes` (Institution Programmes Catalogue)
- **Current Behavior**: No endpoint exists to list configured programmes and approved intakes for an institution. The UI must infer programmes from roster uploads or seat ledger balance keys.
- **Proposed Endpoint**:
  ```http
  GET /api/v1/programmes?institutionId=:id&academicYear=2024-25
  ```
- **Recommended Response**:
  ```json
  {
    "success": true,
    "data": {
      "items": [
        {
          "_id": "...",
          "code": "BTECH-CSE",
          "name": "Computer Science & Engineering",
          "durationYears": 4,
          "intakeByYear": [
            {
              "academicYear": "2024-25",
              "seatCategory": "GENERAL",
              "approvedIntake": 60,
              "label": "AUTHORITY_VERIFIED_SIMULATED",
              "sourceMode": "SIMULATED"
            }
          ]
        }
      ]
    }
  }
  ```

---

### 4. `GET /api/v1/findings` (Global Multi-Run Filter)
- **Current Behavior**: `GET /api/v1/reconciliations/:id/findings` requires a specific `runId`. There is no cross-run findings stream, making it difficult for compliance officers to view all high-severity open issues across runs.
- **Proposed Endpoint**:
  ```http
  GET /api/v1/findings?institutionId=:id&severity=HIGH&reviewStatus=PENDING&page=1&limit=25
  ```

---

### 5. `GET /api/v1/dashboard/summary` (Aggregated Executive KPI Feed)
- **Current Behavior**: The hero dashboard must trigger 6–8 parallel requests (`/scorecards/institutions/:id`, `/seat-ledger/balances`, `/reconciliations`, `/transfers`, `/overlap-cases`, `/verifications/connectors/status`) to build the executive overview.
- **Proposed Endpoint**:
  ```http
  GET /api/v1/dashboard/summary?institutionId=:id&academicYear=2024-25
  ```
- **Recommended Response**:
  ```json
  {
    "success": true,
    "data": {
      "scorecard": { "overallScore": 74.5, "band": "ADEQUATE", "isEligible": true },
      "seatLedger": { "totalApproved": 180, "totalOccupancy": 165, "criticalBuckets": 1 },
      "reconciliation": { "lastRunId": "REC-01", "unresolvedDiscrepancies": 8 },
      "transfers": { "pendingActionCount": 2 },
      "overlaps": { "openObservationsCount": 1 },
      "connectors": { "healthyCount": 4, "totalCount": 4 }
    }
  }
  ```

---

### 6. Controller Signature Uniformity
- **Pagination**: Standardize whether `pagination` is returned in the root `meta` envelope or inside `data.pagination`.
- **Review Decision**: Align `PATCH /findings/:id/review` body terminology with schema (`action` vs `reviewStatus`).
