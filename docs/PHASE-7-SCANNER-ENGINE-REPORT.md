# BYOC Phase 7: Built-in Vulnerability Scanner Engine -- Implementation Report

**Date:** 2026-03-07
**Phase:** 7 -- Vulnerability Scanner Engine + Downstream Integration
**Status:** Complete
**Build:** 93 routes, 0 TypeScript errors, 213/213 E2E tests
**Previous Phase:** Phase 6 -- Enterprise SSO, MFA & SCIM 2.0 (87 routes, 191 E2E tests)

---

## Executive Summary

Phase 7 replaces the placeholder mock scanner with a production-grade, zero-dependency TypeScript vulnerability scanner engine. The engine runs 8 real network check modules against targets using only Node.js built-in modules (`net`, `tls`, `dns`, `https`), produces findings with real CVE references, CVSS scores, descriptions, and remediation guidance, and flows data into every downstream module -- Dashboard stats, Risk Scoring, SIEM events, AI action suggestions, and Asset tracking.

The scanner uses a chunked execution model designed for Vercel's serverless timeout constraints: each `/execute` API call runs a batch of 2 checks (< 7 seconds), saves progress to the database, and returns. The client polls until all batches complete. This enables full scans across 8 check modules without hitting the 10-second hobby tier limit.

### Key Statistics

| Metric | Before (Phase 6) | After (Phase 7) | Delta |
|--------|-------------------|------------------|-------|
| Total routes | 87 | 93 | +6 |
| Scanner check modules | 0 (mock) | 8 | +8 |
| Vulnerability database entries | 0 | ~50 real CVEs | +50 |
| Scan API endpoints | 2 (list, create) | 8 (+ detail, execute, results, finding update, export) | +6 |
| Detail pages | 0 | 2 (scan detail, asset detail) | +2 |
| Seed data (findings) | 0 | 30 | +30 |
| Seed data (SIEM events) | 0 | 12 | +12 |
| Seed data (AI actions) | 0 | 8 | +8 |
| E2E tests | 191 | 213 | +22 |
| TypeScript errors | 0 | 0 | -- |

---

## Phase 7 Objectives

1. **Replace the mock scanner with real network checks.** The Phase 1 scanner used `setTimeout` to fake scan execution and generated random findings with no CVE IDs, descriptions, or remediation. This doesn't work on Vercel serverless (timers are killed) and produces meaningless data.

2. **Build a chunked execution model for serverless.** Vercel hobby tier kills functions after 10 seconds. The scanner must execute in batches, persist progress to the database between calls, and resume on the next poll.

3. **Flow scan data into all downstream modules.** Findings must populate Dashboard severity counts, Risk Scoring calculations, SIEM event feeds, AI action suggestions, and Asset vulnerability tracking -- completing the platform's data pipeline.

4. **Deliver drill-down detail pages.** Users need to click a scan row to see findings, or click an asset to see its vulnerability history. These detail pages with `/scans/[id]` and `/assets/[id]` routes complete the navigation story.

5. **Maintain zero-regression guarantee.** All 191 existing E2E tests must continue to pass.

---

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Execution model | Chunked DB-driven state machine | Vercel 10s timeout. Each `/execute` call runs 2 checks, saves progress, returns. Client polls. |
| Scanner code | Pure TypeScript, Node.js built-ins | Zero dependencies, no licensing issues, works on Vercel Serverless |
| Vulnerability database | Static TypeScript module (~50 entries) | Real CVE IDs with descriptions + remediation. No external DB needed. |
| Adapter pattern | `ScannerAdapter` interface | `BuiltinAdapter` now, extensible for `NucleiAdapter` later |
| Downstream hooks | Post-scan completion triggers | After scan completes: create SIEM events, update `Asset.lastScanAt`, seed AI actions |
| Batch size | 2 checks per execution call | Conservative for 10s timeout. Each check has its own 7s internal timeout. |

---

## Features Implemented

### F1: Scanner Engine Library (`src/lib/scanner/`)

**Why it was needed:** The platform had no actual scanning capability. The mock `setTimeout` approach generated random data that didn't map to real vulnerabilities and broke on serverless platforms.

**What was built:**

A modular scanner engine with 12 files organized into types, vulnerability database, check modules, adapter layer, and orchestration engine:

| Component | File | Purpose |
|-----------|------|---------|
| Types | `types.ts` | `CheckModule`, `CheckResult`, `ScanProgress`, `ScannerAdapter`, `VulnEntry` interfaces |
| Vulnerability DB | `vulnerability-db.ts` | ~50 entries with real CVE IDs, CVSS scores, descriptions, remediation |
| Engine | `index.ts` | Batch orchestration, progress tracking, `executeNextBatch()`, `initializeProgress()` |
| Adapter | `adapters/builtin.ts` | Maps check modules to adapter interface, routes scan types to relevant checks |

**8 Check Modules:**

| Module | File | What it checks |
|--------|------|---------------|
| HTTP Headers | `checks/http-headers.ts` | Missing CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Permissions-Policy, Referrer-Policy |
| SSL/TLS | `checks/ssl-tls.ts` | Certificate expiry, self-signed certs, hostname mismatch, weak protocols (TLS 1.0/1.1) |
| Port Scan | `checks/port-scan.ts` | TCP connect scan on 15 common ports (22, 80, 443, 3306, 5432, 8080, etc.) |
| Exposed Panels | `checks/exposed-panels.ts` | Admin panels, phpMyAdmin, Kibana, Grafana, Jenkins, WordPress admin |
| Info Disclosure | `checks/info-disclosure.ts` | Server version headers, directory listings, `.env` file exposure, `robots.txt` secrets |
| Common CVEs | `checks/common-cves.ts` | Spring4Shell, Log4j indicators, known vulnerability signatures |
| DNS Checks | `checks/dns-checks.ts` | DNS zone transfer, DNSSEC, SPF/DKIM/DMARC record validation |
| Cloud Misconfig | `checks/cloud-misconfig.ts` | Open S3 buckets, Azure blob storage, cloud metadata endpoint exposure |

**Scan type routing:**

| Scan Type | Checks Run |
|-----------|------------|
| `vulnerability` | http-headers, ssl-tls, exposed-panels, info-disclosure, common-cves |
| `port` | port-scan, ssl-tls |
| `compliance` | http-headers, ssl-tls, dns-checks, cloud-misconfig |
| `full` | All 8 modules |

### F2: Chunked Execution Engine

**Why it was needed:** Vercel serverless functions timeout at 10s (hobby) / 60s (pro). A full scan running 8 check modules sequentially would take 30-60 seconds.

**How it works:**

1. `POST /api/scans/create` → Creates scan with status `queued`, initializes progress JSON
2. `POST /api/scans/[id]/execute` → Loads progress from DB, runs next batch of 2 checks (< 7s), saves results as `ScanResult` records, updates progress, returns status
3. Client polls `/execute` until status is `completed`
4. On completion: post-scan hooks fire (SIEM events, asset updates, AI actions)

**Progress tracking schema:**
```json
{
  "completedChecks": ["http-headers", "ssl-tls"],
  "currentBatch": 1,
  "totalBatches": 4,
  "totalFindings": 5,
  "status": "running"
}
```

### F3: Scan API Suite (6 new endpoints)

**Why it was needed:** The platform only had list and create endpoints. Users couldn't view scan details, execute scans, browse findings, update finding status, or export reports.

| Method | Endpoint | Capability | Purpose |
|--------|----------|------------|---------|
| GET | `/api/scans/[id]` | `scan.view` | Scan detail with progress, severity counts, finding count |
| POST | `/api/scans/[id]/execute` | `scan.execute` | Execute next batch, return new findings + progress |
| GET | `/api/scans/[id]/results` | `scan.view` | Paginated findings list with severity/status filters |
| PATCH | `/api/scans/[id]/results/[resultId]` | `scan.execute` | Update finding status (open → acknowledged/resolved/false_positive) |
| GET | `/api/scans/[id]/export` | `scan.export` | Export findings as CSV or JSON with Content-Disposition headers |
| GET | `/api/assets/[id]` | `asset.view` | Asset detail with related findings, risk score, severity breakdown |

### F4: Scan Detail Page (`/scans/[id]`)

**Why it was needed:** No way to view scan findings after execution. Users could only see the scan list with status badges.

**What was built:**
- Header with scan name, status badge (color-coded), type, creator, timestamps
- Severity stat cards (critical/high/medium/low counts)
- Progress bar with percentage during execution
- "Execute Next Batch" / "Resume Scan" button for queued/running scans
- Findings table with expandable rows showing:
  - Severity badge, title, CVE ID link, CVSS score, status
  - Expanded: full description, remediation guidance, CVE reference link
  - Action buttons: Acknowledge, Resolve, False Positive (updates status via PATCH)
- Export dropdown (CSV/JSON)
- Back navigation to scan list
- Gated by `scan.view` capability

### F5: Asset Detail Page (`/assets/[id]`)

**Why it was needed:** Asset list showed basic info but no drill-down. Users couldn't see which vulnerabilities affected a specific asset.

**What was built:**
- Header with asset name, type badge, criticality badge, status
- Stat cards: Risk Score, Open Findings count, Last Scanned timestamp, IP/Hostname
- Asset information section: hostname, IP, OS, group
- Tags display
- Vulnerability severity breakdown (critical/high/medium/low/info counts)
- Related findings table from all scans targeting this asset
- Gated by `asset.view` capability

### F6: AI Actions Wiring

**Why it was needed:** The AI Actions page displayed suggestions but the approve/reject buttons were non-functional.

**What was built:**
- `PATCH /api/ai-actions/[id]` endpoint accepting `approve`, `reject`, `execute` actions
- Status transitions: pending → approved/rejected/executed
- Audit logging for all AI action state changes
- Capability check: `ai.approve.standard`

### F7: List Page Navigation

**Why it was needed:** Scan and asset list pages showed data in tables but rows weren't clickable. No way to navigate to detail views.

**What was changed:**
- **Scans list** (`/scans/page.tsx`): Scan rows now link to `/scans/[id]`
- **Assets list** (`/assets/page.tsx`): Asset rows now link to `/assets/[id]`

### F8: Seed Data (Production-Ready Demo Data)

**Why it was needed:** All downstream modules (Dashboard, SIEM, AI Actions, Risk Scoring) query the database. Without seed data, the platform shows empty states everywhere.

**What was seeded:**

| Data Type | Count | Details |
|-----------|-------|---------|
| Completed Scans | 3 | Infrastructure Vulnerability Scan (12 findings), Network Port Assessment (8 findings), Cloud Configuration Audit (10 findings) |
| Scan Findings | 30 | Real CVE IDs, CVSS scores, descriptions, remediation, linked to assets |
| SIEM Events | 12 | 6 scanner-generated (critical/high findings), 3 auth events, 3 system events |
| SIEM Alerts | 3 | Critical finding alerts with severity and rule matching |
| AI Actions | 8 | 4 pending, 2 approved, 1 executed, 1 rejected — remediation suggestions |

---

## Schema Changes

### Scan Model — Added `progress` field

```prisma
progress    String    @default("{}")  // JSON: { completedChecks, currentBatch, totalBatches, totalFindings, status }
```

Applied via `prisma db push`. No other schema changes — `ScanResult` already had all required fields (`cveId`, `description`, `remediation`, `assetId`, `status`, `details`) from Phase 1, they were just unused.

---

## Files Changed

### New Files (22)

| File | Purpose |
|------|---------|
| `src/lib/scanner/types.ts` | TypeScript interfaces for scanner engine |
| `src/lib/scanner/vulnerability-db.ts` | ~50 real CVE entries with descriptions + remediation |
| `src/lib/scanner/index.ts` | Engine orchestration, batch execution, progress tracking |
| `src/lib/scanner/adapters/builtin.ts` | Built-in adapter mapping check modules to scan types |
| `src/lib/scanner/checks/http-headers.ts` | HTTP security header analysis |
| `src/lib/scanner/checks/ssl-tls.ts` | SSL/TLS certificate and protocol checks |
| `src/lib/scanner/checks/port-scan.ts` | TCP port scanning on common ports |
| `src/lib/scanner/checks/exposed-panels.ts` | Admin panel and login page detection |
| `src/lib/scanner/checks/info-disclosure.ts` | Server info and file exposure checks |
| `src/lib/scanner/checks/common-cves.ts` | Known CVE signature detection |
| `src/lib/scanner/checks/dns-checks.ts` | DNS security record validation |
| `src/lib/scanner/checks/cloud-misconfig.ts` | Cloud storage and metadata exposure checks |
| `src/app/api/scans/[id]/route.ts` | Scan detail API |
| `src/app/api/scans/[id]/execute/route.ts` | Scan execution (chunked batches) |
| `src/app/api/scans/[id]/results/route.ts` | Scan findings list with filters |
| `src/app/api/scans/[id]/results/[resultId]/route.ts` | Finding status update |
| `src/app/api/scans/[id]/export/route.ts` | CSV/JSON export |
| `src/app/api/assets/[id]/route.ts` | Asset detail with related findings |
| `src/app/api/ai-actions/[id]/route.ts` | AI action approve/reject/execute |
| `src/app/(dashboard)/scans/[id]/page.tsx` | Scan detail page UI |
| `src/app/(dashboard)/assets/[id]/page.tsx` | Asset detail page UI |
| `tests/e2e/15-scanner-engine.spec.ts` | 22 E2E tests for Phase 7 |

### Modified Files (4)

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Added `progress` field to Scan model |
| `src/app/api/scans/create/route.ts` | Removed `setTimeout` mock, uses `initializeProgress()`, auto-creates assets, `checkCapability` fix |
| `src/app/(dashboard)/scans/page.tsx` | Scan rows now link to `/scans/[id]` |
| `src/app/(dashboard)/assets/page.tsx` | Asset rows now link to `/assets/[id]` |
| `prisma/seed.ts` | Added sections 17-19: 3 scans, 30 findings, 12 SIEM events, 3 alerts, 8 AI actions |

---

## Downstream Data Flow

```
Scanner completes
  ├─→ ScanResult records (with CVE, description, remediation, CVSS)
  ├─→ Dashboard API (/api/dashboard) — queries ScanResult by severity ✓
  ├─→ Risk Scoring (/api/risk-scoring) — uses severity counts for score ✓
  ├─→ SIEM Events — scanner creates SiemEvent for critical/high findings ✓
  ├─→ SIEM Alerts — scanner creates SiemAlert for critical findings ✓
  ├─→ AI Actions — scanner creates AiAction remediation suggestions ✓
  ├─→ Assets — updates Asset.lastScanAt, links findings via assetId ✓
  └─→ Compliance — CVE→control mapping (deferred to future phase)
```

---

## Test Coverage

### New Tests: `15-scanner-engine.spec.ts` (22 tests)

**Scanner API (9 tests):**
- TC-SCAN-001: Scan list returns seeded scans
- TC-SCAN-002: Scan create returns queued status with progress
- TC-SCAN-003: Scan detail returns metadata and severity counts
- TC-SCAN-004: Scan results returns findings with CVE data
- TC-SCAN-005: Scan results severity filter works
- TC-SCAN-006: Finding status update (open → acknowledged)
- TC-SCAN-007: Scan export CSV contains headers and findings
- TC-SCAN-008: Scan export JSON matches API structure
- TC-SCAN-009: Scan create auto-creates asset for unknown target

**Scan Detail Page (5 tests):**
- TC-SCANUI-001: Scan detail page shows scan info and findings table
- TC-SCANUI-002: Severity stat cards display correct counts
- TC-SCANUI-003: Findings table shows CVE IDs and CVSS scores
- TC-SCANUI-004: Scan list page links to scan detail
- TC-SCANUI-005: Navigation breadcrumb works

**Asset Detail Page (3 tests):**
- TC-ASSET-001: Asset detail page shows asset info and findings
- TC-ASSET-002: Asset detail shows risk score and severity breakdown
- TC-ASSET-003: Asset list page links to asset detail

**Downstream Integration (5 tests):**
- TC-DOWNSTREAM-001: Dashboard stats reflect real scan findings
- TC-DOWNSTREAM-002: SIEM events include scanner-generated events
- TC-DOWNSTREAM-003: AI actions page shows scanner-generated suggestions
- TC-DOWNSTREAM-004: AI action approve updates status
- TC-DOWNSTREAM-005: Dashboard page renders with real data

### Regression Results

| Test File | Tests | Status |
|-----------|-------|--------|
| 01-auth.spec.ts | 10 | Pass |
| 02-dashboard.spec.ts | 10 | Pass |
| 03-assets.spec.ts | 12 | Pass |
| 04-scans.spec.ts | 10 | Pass |
| 05-roles.spec.ts | 12 | Pass |
| 06-users.spec.ts | 12 | Pass |
| 07-rbac-enforcement.spec.ts | 12 | Pass |
| 08-audit-security.spec.ts | 10 | Pass |
| 09-sessions.spec.ts | 10 | Pass |
| 10-features.spec.ts | 16 | Pass |
| 11-tag-scoping.spec.ts | 12 | Pass |
| 12-multi-role-access.spec.ts | 32 | Pass |
| 13-compliance-module.spec.ts | 8 | Pass |
| 14-sso-mfa-scim.spec.ts | 25 | Pass |
| **15-scanner-engine.spec.ts** | **22** | **Pass** |
| **Total** | **213** | **All Pass** |

---

## Build Metrics

| Metric | Phase 6 | Phase 7 | Delta |
|--------|---------|---------|-------|
| Routes | 87 | 93 | +6 |
| E2E tests | 191 | 213 | +22 |
| TypeScript errors | 0 | 0 | -- |
| Scanner modules | 0 | 8 | +8 |
| Vulnerability DB entries | 0 | ~50 | +50 |
| Detail pages | 0 | 2 | +2 |
| Seed findings | 0 | 30 | +30 |
| Seed SIEM events | 0 | 12 | +12 |
| Seed AI actions | 0 | 8 | +8 |

---

## Bugs Fixed During Implementation

1. **`rbac.checkPermission` vs `checkCapability`** — Scan create route used `checkPermission("scan.create")` which maps v1→v2 format. Since `"scan.create"` is already v2 format, it wasn't found in the v1 mapping table. Fixed to use `checkCapability` directly.

2. **Nonexistent `ai.manage` capability** — AI actions PATCH route checked for `ai.manage` which doesn't exist in the 50 capabilities. Fixed to `ai.approve.standard`.

3. **Prisma client stale after schema change** — Adding `progress` field required `prisma generate` to regenerate the client. The dev server used a stale client, causing "Unknown argument `progress`" errors.

4. **Dashboard API sequential query** — The compliance framework query (`prisma.complianceFramework.findMany`) ran sequentially after the main `Promise.all` block, adding ~500ms latency on every dashboard load. Fixed by moving it inside the `Promise.all` block so all 8 queries run in parallel.

5. **Notification bell non-functional** — The topbar notification bell (`<Button>`) had no `onClick` handler — purely cosmetic. Fixed by adding a full notification dropdown that fetches live SIEM alerts on mount, displays up to 5 open/investigating alerts with severity badges and timestamps, and links to `/siem` for the full view.

---

## Deferred Work

- **Automated compliance mapping**: CVE→control mapping (e.g., finding a missing HSTS header maps to PCI DSS Requirement 4). Deferred to a future phase.
- **Nuclei adapter**: The `ScannerAdapter` interface supports plugging in Nuclei (MIT license) for deeper vulnerability scanning. Interface is ready, implementation deferred.
- **Scan scheduling**: Recurring scan schedules (daily/weekly). The engine supports it but the UI/cron infrastructure is deferred.
