# BYOC RBAC v2 Phase 5: GRC & Compliance Module -- Implementation Report

**Date:** 2026-03-06
**Phase:** 5 of 6 -- GRC & Compliance
**Status:** Complete
**Build:** 77 routes, 0 TypeScript errors, 166/166 E2E tests
**Previous Phase:** Phase 4 -- Audit & Security (65 routes, 152 E2E tests)

---

## Executive Summary

Phase 5 transforms the compliance module from a basic status tracker into a production-grade Governance, Risk & Compliance (GRC) system. The module now supports five regulatory frameworks (GDPR, PCI DSS, HIPAA, CIS Controls v8.1, NIST CSF 2.0) with 73 controls, full assessment workflows with evidence capture, historical audit trails, exportable compliance reports, and framework lifecycle management -- all enforced by four dedicated RBAC capabilities.

The implementation was delivered in two sub-phases:
- **Phase 5A**: Added CIS Controls v8.1 and NIST CSF 2.0 frameworks, created 4 dedicated compliance capabilities, and replaced incorrect capability gates across the module.
- **Phase 5B**: Built the four operational features that make compliance workflows functional: assessment dialog with evidence, assessment history timeline, CSV/JSON export, and framework management.

### Key Statistics

| Metric | Before (Phase 4) | After (Phase 5) | Delta |
|--------|-------------------|------------------|-------|
| Total routes | 65 | 77 | +12 |
| Compliance API routes | 2 | 5 | +3 (history, export, frameworks) |
| Compliance frameworks | 3 | 5 | +2 (CIS v8.1, NIST CSF 2.0) |
| Compliance controls | 33 | 73 | +40 |
| Capabilities | 42 | 46 | +4 (compliance module) |
| Capability modules | 8 | 9 | +1 (compliance) |
| E2E tests | 152 | 166 | +14 |
| TypeScript errors | 0 | 0 | -- |

### Compliance Framework Coverage

| Framework | Version | Controls | Score | Categories |
|-----------|---------|----------|-------|------------|
| GDPR | 2016/679 | 10 | 70% | Data Protection, Transparency, Technical Measures, Incident Response |
| PCI DSS | 4.0 | 12 | 71% | Network Security, Data Protection, Access Control, Monitoring |
| HIPAA | 2013 | 11 | 73% | Administrative, Physical, Technical safeguards |
| CIS Controls | 8.1 | 18 | 58% | Asset Management, Identity & Access, Network Defense, Incident Response |
| NIST CSF | 2.0 | 22 | 61% | Govern, Identify, Protect, Detect, Respond, Recover |

---

## Phase 5 Objectives

1. **Expand framework coverage to match client requirements.** The client scope document specified HIPAA, GDPR, PCI DSS, NIST, and CIS Controls. Before Phase 5, only GDPR, PCI DSS, and HIPAA existed.

2. **Fix broken RBAC on compliance.** The compliance module was using semantically incorrect capabilities borrowed from other modules (`scan.policy.view` for page access, `dash.view` for the API, `risk.override` for updates). This created security holes where users could access compliance data through capabilities intended for other features.

3. **Enable enterprise compliance workflows.** A status badge dropdown is insufficient for real compliance work. Auditors need to document findings, attach evidence references, track assessment history, export reports for regulators, and manage framework activation -- all with proper access controls.

4. **Maintain zero-regression guarantee.** All 152 existing E2E tests must continue to pass after Phase 5 changes.

---

## Features Implemented

### F1: Dedicated Compliance RBAC Capabilities (Phase 5A)

**Why it was needed:**
Before Phase 5, the compliance module borrowed capabilities from unrelated modules. The sidebar gate used `scan.policy.view` (a scanning capability), the GET API used `dash.view` (anyone who could see the dashboard could see compliance data), and the PATCH API used `risk.override` (a risk management capability with different semantics). This meant that capability assignments did not match actual access patterns, creating both over-permissioning and confusion in audit logs.

**What was built:**
Four dedicated compliance capabilities were added to the master registry (`src/lib/capabilities.ts`):

| Capability | Risk Level | Purpose |
|-----------|-----------|---------|
| `compliance.view` | Low | View compliance frameworks, controls, and assessment statuses |
| `compliance.assess` | Medium | Update control assessment status, findings, and evidence |
| `compliance.manage` | High | Manage compliance framework settings and activation |
| `compliance.export` | Low | Export compliance reports and audit data |

The "Compliance" module was added to `CAPABILITY_MODULES` as the 9th module (icon: ShieldCheck), and capabilities were assigned to roles:

| Role | Capabilities Granted |
|------|---------------------|
| platform-admin | All 4 (automatic -- gets all capabilities) |
| org-admin | All 4 (automatic -- gets all minus billing) |
| security-analyst | `compliance.view`, `compliance.assess`, `compliance.export` |
| auditor | `compliance.view`, `compliance.export` |
| remediation-user | `compliance.view` |
| viewer | None |
| api-service | None |

**What it solves:**
- Semantic correctness: compliance access is now controlled by compliance-specific capabilities
- Proper separation of concerns: viewing, assessing, managing, and exporting are independently gated
- Audit clarity: when a `compliance.assess` check appears in the audit log, it unambiguously refers to a compliance action
- Least-privilege enforcement: viewers cannot see compliance data; auditors can view and export but not modify

---

### F2: CIS Controls v8.1 Framework (Phase 5A)

**Why it was needed:**
CIS Controls v8.1 is the most widely adopted cybersecurity best-practices framework, used by organizations worldwide to prioritize defensive actions. The client scope document explicitly required CIS Controls coverage. Unlike regulatory frameworks (GDPR, HIPAA), CIS Controls are technology-agnostic operational controls that map directly to security tooling.

**What was built:**
18 top-level control groups seeded with realistic assessment statuses:

| Control | Title | Category | Status |
|---------|-------|----------|--------|
| CIS.1 | Inventory and Control of Enterprise Assets | Asset Management | Compliant |
| CIS.2 | Inventory and Control of Software Assets | Asset Management | Partial |
| CIS.3 | Data Protection | Data Protection | Partial |
| CIS.4 | Secure Configuration of Assets and Software | Configuration Management | Compliant |
| CIS.5 | Account Management | Identity & Access | Compliant |
| CIS.6 | Access Control Management | Identity & Access | Compliant |
| CIS.7 | Continuous Vulnerability Management | Vulnerability Management | Non-Compliant |
| CIS.8 | Audit Log Management | Audit & Accountability | Compliant |
| CIS.9 | Email and Web Browser Protections | Network Defense | Partial |
| CIS.10 | Malware Defenses | Endpoint Security | Compliant |
| CIS.11 | Data Recovery | Data Protection | Not Assessed |
| CIS.12 | Network Infrastructure Management | Network Security | Compliant |
| CIS.13 | Network Monitoring and Defense | Network Defense | Partial |
| CIS.14 | Security Awareness and Skills Training | Workforce Security | Non-Compliant |
| CIS.15 | Service Provider Management | Third-Party Risk | Not Assessed |
| CIS.16 | Application Software Security | Secure Development | Partial |
| CIS.17 | Incident Response Management | Incident Response | Compliant |
| CIS.18 | Penetration Testing | Security Testing | Non-Compliant |

**Integration point for scan automation (deferred):**
CIS Controls map directly to security scan results. When the scan-compliance integration is built (separate team member), scan findings can automatically update controls like CIS.7 (Vulnerability Management) and CIS.10 (Malware Defenses) based on scan pass/fail results. The `PATCH /api/compliance/update` endpoint already accepts programmatic updates with evidence arrays like `["Automated Scan #1234 -- 0 critical findings"]`.

---

### F3: NIST Cybersecurity Framework 2.0 (Phase 5A)

**Why it was needed:**
NIST CSF 2.0 (released February 2024) is the de facto cybersecurity risk management framework for organizations operating in or with US federal agencies. Version 2.0 added a new "Govern" function (6 categories) to the existing five functions. The client scope document listed NIST as a required framework.

**What was built:**
22 category-level controls across all 6 NIST CSF 2.0 functions:

| Function | Categories | Controls |
|----------|------------|----------|
| GOVERN | Organizational Context, Risk Management Strategy, Roles & Responsibilities, Policy, Oversight, Supply Chain Risk | 6 |
| IDENTIFY | Asset Management, Risk Assessment, Improvement | 3 |
| PROTECT | Identity & Auth, Awareness & Training, Data Security, Platform Security, Infrastructure Resilience | 5 |
| DETECT | Continuous Monitoring, Adverse Event Analysis | 2 |
| RESPOND | Incident Management, Incident Analysis, Response Reporting, Incident Mitigation | 4 |
| RECOVER | Recovery Plan Execution, Recovery Communication | 2 |

**Design decision -- category-level, not subcategory:**
NIST CSF 2.0 defines ~100+ subcategories. We chose category-level (22 controls) for parity with the other frameworks (10-18 controls each). This keeps the compliance dashboard readable and the assessment workload manageable. Organizations that need subcategory tracking can extend individual controls with evidence references pointing to detailed subcategory assessments.

---

### F4: Assessment Dialog with Evidence & Notes (Phase 5B)

**Why it was needed:**
Before Phase 5B, clicking a control status badge showed an inline dropdown with 5 status options. There was no way to document why a status was assigned, what evidence supports the assessment, or what remediation steps are planned. Enterprise compliance workflows require documented rationale for every status change -- auditors and regulators expect to see evidence trails, not just status flags.

**How it works:**
Clicking a control's status badge (visible only to users with `compliance.assess`) opens a Radix UI dialog with:

1. **Status dropdown** -- All 5 status options (Compliant, Partial, Non-Compliant, Not Assessed, N/A)
2. **Findings/Notes textarea** -- Free-text field for assessment rationale, observations, or control-specific notes
3. **Evidence References list** -- Add/remove text references to supporting documents (e.g., "SOC2 Report Q3 2025", "Penetration Test Results -- Section 4.2", "https://docs.internal.com/audit-2026"). Evidence is stored as a JSON array of strings.
4. **Remediation Plan textarea** -- Shown only when status is non_compliant or partially_compliant. Documents the steps needed to achieve compliance.
5. **Due Date input** -- Shown only for non-compliant/partial statuses. Sets the next review date for the control.

On submission, the API (`PATCH /api/compliance/update`):
- Updates the `ComplianceControl` record (status, notes, evidence, lastAssessedAt, nextReviewAt)
- Creates a `ComplianceAssessment` record (assessorId, status, findings, evidence, remediationPlan, dueDate)
- Creates an audit log entry with the previous and new status, evidence count, and flags for findings/remediation

**Why evidence is text-based, not file upload:**
Enterprise compliance evidence typically lives in document management systems (SharePoint, Confluence, Google Drive) or GRC platforms. The text reference approach mirrors how organizations actually work -- compliance officers reference existing documents by name or URL rather than uploading copies. This avoids the complexity of file storage (S3, CDN) while providing the audit trail regulators need. The schema field (`evidence: String @default("[]")`) stores a JSON array of string references.

**RBAC enforcement:**
- Users with `compliance.assess` see a clickable status badge that opens the dialog
- Users with only `compliance.view` see a static, non-interactive badge
- The `<Gate>` component renders the appropriate version based on the user's capabilities

**What it solves:**
- Auditors can document assessment rationale and evidence for every control status change
- Regulatory inspections can trace the full decision chain: who assessed, what they found, what evidence supports it
- Non-compliant controls get remediation plans with due dates for accountability tracking

---

### F5: Assessment History Timeline (Phase 5B)

**Why it was needed:**
Every `PATCH /api/compliance/update` call creates a `ComplianceAssessment` record, building an audit trail over time. But there was no way to view this history. When an auditor asks "who changed PCI DSS Req. 6 from Non-Compliant to Partial last month?", the answer was buried in raw database records.

**How it works:**
Clicking any control row expands to show a vertical timeline of all `ComplianceAssessment` records for that control, sorted newest first.

**New API endpoint:** `GET /api/compliance/history?controlId={uuid}`
- Requires `compliance.view` capability
- Returns up to 100 assessment records with resolved assessor names (batch User lookup)
- Response shape: `{ controlId, controlLabel, assessments: [...] }`

Each timeline entry displays:
- **Assessor name** with user icon
- **Status badge** (color-coded: green/yellow/red/gray)
- **Relative timestamp** (e.g., "3h ago", "5d ago")
- **Findings text** (if provided)
- **Evidence badges** (each evidence reference as a labeled badge)
- **Remediation plan** (amber text, if provided)
- **Due date** (if set)

The timeline uses a vertical connector pattern (colored dots + line segments) similar to a git log, making it easy to scan assessment progression visually.

**What it solves:**
- Full audit trail visibility for regulatory inspections
- Accountability tracking: every status change has an identified assessor
- Trend analysis: see how a control's status evolved over time
- Evidence chain: each assessment snapshot preserves the evidence at that point in time

---

### F6: Compliance Export (Phase 5B)

**Why it was needed:**
External auditors and regulators typically require compliance data in standardized formats they can import into their own tools. Showing them a web dashboard is not sufficient -- they need CSV files for spreadsheet analysis and JSON for programmatic integration with audit management systems.

**How it works:**

**New API endpoint:** `GET /api/compliance/export?format=csv|json&framework=all|{frameworkId}`
- Requires `compliance.export` capability
- Returns file with `Content-Disposition: attachment` header for browser download
- Filename includes date stamp: `compliance-export-2026-03-06.csv`

**CSV format (10 columns):**
```
Framework,Version,ControlID,Title,Category,Status,LastAssessedAt,NextReviewAt,EvidenceCount,Notes
GDPR,2016/679,Art. 5,Principles of Processing,Data Protection,compliant,2026-03-06T06:09:05.426Z,2026-04-10T11:39:33.570Z,0,
```

**JSON format:**
Full framework structure with computed stats (score, compliant/partial/non-compliant counts) and complete control details including evidence arrays and notes. Pretty-printed with 2-space indentation.

**Framework filter:** Export all frameworks or a specific one. The UI provides a dropdown selector alongside CSV and JSON buttons.

**Audit trail:** Every export creates an audit log entry recording the format, framework filter, framework count, and control count.

**Pattern reuse:** The implementation follows the exact pattern established by the audit log export (`/api/audit-log/export`) -- same `escapeCSV()` function, same `Content-Disposition` headers, same `NextResponse` approach.

**What it solves:**
- Regulatory submissions: provide compliance data to auditors in their preferred format
- Cross-system integration: JSON export enables importing into external GRC platforms
- Point-in-time snapshots: exported files serve as compliance status records at a specific date
- Framework-specific reports: filter to export only the relevant framework for a particular audit

---

### F7: Framework Management UI (Phase 5B)

**Why it was needed:**
All five compliance frameworks were seeded during deployment. If an organization decides a framework is no longer relevant (e.g., they stop handling payment card data and PCI DSS becomes inapplicable), there was no way to remove it from the UI without a database migration. Conversely, if a deactivated framework becomes relevant again, it should be recoverable without data loss.

**How it works:**

**New API endpoint:** `PATCH /api/compliance/frameworks/{id}`
- Requires `compliance.manage` capability (high risk)
- Accepts `{ isActive: boolean, description?: string }`
- Validates framework belongs to the requesting tenant
- Creates audit log entry with before/after state

**UI:** "Manage" button in the compliance page header (visible only to `compliance.manage` users) opens a dialog listing all frameworks with toggle switches. Each framework shows its name, version, control count, and current compliance score.

**Active/Inactive behavior:**
- Active frameworks appear in the main compliance view (default API response)
- Inactive frameworks are hidden from the main view but all data (controls, assessments, evidence) is preserved
- The management dialog fetches all frameworks including inactive (`?includeInactive=true`)
- Re-activating a framework instantly restores it with all historical data intact

**What it solves:**
- Framework lifecycle management without code changes or database migrations
- Safe deactivation: no data loss when a framework becomes irrelevant
- Instant re-activation: no re-seeding needed to bring a framework back
- Clean UI: only relevant frameworks shown to compliance users

---

## API Reference

### Existing Endpoints (Modified)

| Method | Endpoint | Capability | Change |
|--------|----------|------------|--------|
| GET | `/api/compliance` | `compliance.view` | Added `evidence`, `notes`, `assignedTo` to control response; added `?includeInactive=true` param |
| PATCH | `/api/compliance/update` | `compliance.assess` | Now persists `evidence`, `remediationPlan`, `dueDate` into ComplianceAssessment; validates evidence array |

### New Endpoints

| Method | Endpoint | Capability | Purpose |
|--------|----------|------------|---------|
| GET | `/api/compliance/history?controlId=` | `compliance.view` | Assessment history for a specific control |
| GET | `/api/compliance/export?format=&framework=` | `compliance.export` | CSV/JSON compliance data export |
| PATCH | `/api/compliance/frameworks/[id]` | `compliance.manage` | Toggle framework isActive, update description |

---

## Files Changed

### New Files (4)

| File | Purpose |
|------|---------|
| `src/app/api/compliance/history/route.ts` | Assessment history API with assessor name resolution |
| `src/app/api/compliance/export/route.ts` | CSV/JSON export with framework filter and audit trail |
| `src/app/api/compliance/frameworks/[id]/route.ts` | Framework management PATCH (isActive, description) |
| `tests/e2e/13-compliance-features.spec.ts` | 14 E2E tests covering all 4 Phase 5B features |

### Modified Files (5)

| File | Change |
|------|--------|
| `src/lib/capabilities.ts` | 4 compliance capabilities, compliance module, role assignments (42 to 46 caps) |
| `src/app/api/compliance/route.ts` | Evidence/notes in response, `includeInactive` filter, `NextRequest` param |
| `src/app/api/compliance/update/route.ts` | Full assessment data persistence, evidence validation, enriched audit details |
| `src/app/(dashboard)/compliance/page.tsx` | Assessment dialog, history timeline, export UI, framework management dialog |
| `src/components/layout/sidebar.tsx` | Compliance nav capability: `scan.policy.view` to `compliance.view` |

### Test Files Modified (2)

| File | Change |
|------|--------|
| `tests/e2e/10-features.spec.ts` | Updated framework assertions to use `getByRole("heading")` to avoid matching `<option>` elements |
| `tests/e2e/05-roles.spec.ts`, `07-rbac-enforcement.spec.ts`, `12-multi-role-access.spec.ts` | Updated capability counts (42 to 46, role-specific counts) |

---

## E2E Test Coverage

### New Tests (14 tests in `13-compliance-features.spec.ts`)

| # | Test | Feature |
|---|------|---------|
| 153 | Open assessment dialog when clicking status badge | F4: Assessment Dialog |
| 154 | Submit assessment with evidence and notes via API | F4: Assessment Dialog |
| 155 | Validate evidence array format (reject non-array) | F4: Assessment Dialog |
| 156 | Display evidence count badge on controls | F4: Assessment Dialog |
| 157 | Fetch assessment history via API | F5: History Timeline |
| 158 | Return 400 without controlId param | F5: History Timeline |
| 159 | Expand control row to show assessment history | F5: History Timeline |
| 160 | Export compliance data as CSV (verify headers, content-type) | F6: Export |
| 161 | Export compliance data as JSON (verify structure, framework count) | F6: Export |
| 162 | Export filtered by specific framework ID | F6: Export |
| 163 | Show export buttons (CSV, JSON, framework dropdown) on page | F6: Export |
| 164 | Open manage frameworks dialog | F7: Framework Management |
| 165 | Toggle framework active status via API (deactivate + verify hidden + reactivate) | F7: Framework Management |
| 166 | Return 400 for empty update body | F7: Framework Management |

### Full Suite: 166/166 passing (15.9 minutes)

---

## Integration Points

### Scan-to-Compliance Automation (Deferred)

A separate team member is building scan automation. When ready, the integration will:

1. **Consume scan results** from the existing `ScanResult` model
2. **Map scan findings to compliance controls** (e.g., CIS.7 "Continuous Vulnerability Management" maps to vulnerability scan results)
3. **Call `PATCH /api/compliance/update`** with:
   - `status`: derived from scan pass/fail thresholds
   - `evidence`: `["Automated Scan #1234 -- 2 high, 0 critical findings"]`
   - `notes`: generated summary of scan findings relevant to the control
4. **Create assessment records** automatically, with `assessorId` set to the API key's user

The compliance module is ready for this integration -- all APIs accept programmatic updates with full evidence and assessment tracking.

### External GRC Platform Integration

The JSON export (`GET /api/compliance/export?format=json`) produces a structured payload that external GRC platforms (ServiceNow GRC, Archer, OneTrust) can consume. The schema includes:
- Framework metadata (name, version, description)
- Computed compliance statistics (score, status distribution)
- Full control details (controlId, title, category, status, evidence, notes, timestamps)

---

## Deployment

- **Commit:** `90db916` (Phase 5B) + `8078fdc` (Phase 5A)
- **Production:** Vercel (byoc-rosy.vercel.app) -- auto-deployed from master
- **Database:** Railway PostgreSQL -- seeded with 5 frameworks, 73 controls, 46 capabilities
- **No schema migration required** -- all fields already existed in ComplianceControl and ComplianceAssessment models
