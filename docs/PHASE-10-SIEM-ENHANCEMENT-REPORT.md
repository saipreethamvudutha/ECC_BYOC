# BYOC Phase 10: Enterprise SIEM Enhancement -- SOC Operations Center

**Date:** 2026-03-10
**Phase:** 10 -- Enterprise SIEM Enhancement (SOC Operations Center)
**Status:** Complete
**Build:** 103 routes, 0 TypeScript errors, 239 E2E tests
**Previous Phase:** Phase 9 -- Asset Inventory Enhancement (93 routes, 219 E2E tests)

---

## Executive Summary

Phase 10 delivers a comprehensive Enterprise SIEM and SOC Operations Center upgrade, transforming the existing basic SIEM event viewer into a production-grade security operations platform. The implementation introduces ECS (Elastic Common Schema) normalized event fields, a library of 12 MITRE ATT&CK-mapped detection rules, a full alert lifecycle with status workflow, incident/case management with SLA tracking, and a SOC dashboard featuring real-time MTTD/MTTR metrics. Four new RBAC capabilities bring the platform total from 50 to 54, and 21 new end-to-end tests validate the entire feature surface.

### Delivery Summary

| Component | Count | Details |
|---|---|---|
| Schema fields added | 50+ | ECS normalization, alert lifecycle, incident management |
| Detection rules | 12 | MITRE ATT&CK-mapped, covering T1003 through T1486 |
| RBAC capabilities | 4 new | siem.investigate, siem.incident.manage, siem.hunt, siem.export |
| API endpoints | 8 | 6 new + 1 rewritten + 1 metrics endpoint |
| UI tabs | 5 | SOC Overview, Alert Queue, Incidents, Detection Rules, Threat Hunting |
| Detail pages | 2 | Alert detail, Incident detail |
| Shared components | 3 | MitreTag, SeverityChart, TimelineView |
| Seed data records | 89 | 47 events, 25 alerts, 12 rules, 5 incidents |
| E2E tests | 21 | API + UI + RBAC coverage |
| Files modified | 8 | Schema, seed, capabilities, audit, scanner, UI, layout |
| Files created | 15 | Detection engine, types, APIs, pages, components, tests |

---

## Schema Changes

### Enhanced: SiemEvent (ECS Normalization)

Added 21 fields to normalize raw events to the Elastic Common Schema (ECS) standard, enabling cross-source correlation and structured querying.

```prisma
model SiemEvent {
  // Existing fields retained: id, tenantId, type, severity, message, source, rawData, createdAt

  // --- Phase 10: ECS Fields ---
  // Network context
  sourcePort          Int?
  destPort            Int?
  protocol            String?
  direction           String?

  // User context
  userName            String?
  userDomain          String?

  // Event classification
  eventOutcome        String?
  eventAction         String?

  // Process context
  processName         String?
  processPid          Int?
  processParentName   String?
  processExecutable   String?

  // Host context
  hostName            String?
  hostIp              String?

  // Geo context
  geoCountry          String?
  geoCity             String?

  // Enrichment
  threatIntelHit      Boolean    @default(false)
  assetCriticality    String?

  // Ingestion metadata
  dataset             String?
  module              String?
  logLevel            String?
}
```

### Enhanced: SiemAlert (Lifecycle + MITRE ATT&CK)

Extended with alert lifecycle workflow, MITRE ATT&CK mapping, confidence scoring, case linkage, and investigation context.

```prisma
model SiemAlert {
  // Existing fields retained: id, tenantId, ruleId, eventId, severity, message, acknowledged, createdAt

  // --- Phase 10: Alert Lifecycle ---
  status              String     @default("open")

  // MITRE ATT&CK mapping
  mitreAttackId       String?
  mitreTactic         String?
  mitreTechnique      String?

  // Scoring
  confidenceScore     Float?
  assetCriticalityWeight Float?
  priorityScore       Float?

  // Case management link
  incidentId          String?
  incident            SiemIncident? @relation(fields: [incidentId], references: [id])

  // Investigation context
  impactedUsers       String     @default("[]")
  impactedAssets      String     @default("[]")
  relatedAlertIds     String     @default("[]")
  threatIntel         String     @default("{}")

  // Timestamps
  firstSeenAt         DateTime?
  lastSeenAt          DateTime?
  acknowledgedAt      DateTime?
  resolvedAt          DateTime?
  assignedTo          String?
}
```

### Enhanced: SiemRule (Tuning + Classification)

Extended with rule typing, MITRE ATT&CK classification, tuning metrics, and data source tracking.

```prisma
model SiemRule {
  // Existing fields retained: id, tenantId, name, condition, severity, enabled, createdAt

  // --- Phase 10: Rule Classification ---
  ruleType            String?

  // MITRE ATT&CK mapping
  mitreAttackId       String?
  mitreTactic         String?
  mitreTechnique      String?

  // Tuning metrics
  confidenceLevel     String?
  falsePositiveRate   Float?
  truePositiveCount   Int        @default(0)
  falsePositiveCount  Int        @default(0)

  // Metadata
  category            String?
  dataSources         String     @default("[]")
}
```

### NEW: SiemIncident (Case Management)

Full incident/case management model supporting SOC workflows, SLA tracking, and compliance mapping.

```prisma
model SiemIncident {
  id                  String     @id @default(cuid())
  tenantId            String

  title               String
  description         String
  severity            String
  status              String     @default("open")
  priority            String     @default("medium")

  assignedTo          String?
  tenant              Tenant     @relation(fields: [tenantId], references: [id])

  impactSummary       String?
  impactedUsers       String     @default("[]")
  impactedAssets      String     @default("[]")

  rootCause           String?
  remediationSteps    String     @default("[]")

  timeline            String     @default("[]")
  evidence            String     @default("[]")

  mitreTactics        String     @default("[]")
  mitreTechniques     String     @default("[]")

  complianceMapping   String     @default("[]")

  slaDeadline         DateTime?
  slaBreach           Boolean    @default(false)

  alerts              SiemAlert[]

  createdAt           DateTime   @default(now())
  updatedAt           DateTime   @updatedAt
  closedAt            DateTime?
}
```

---

## RBAC Changes

### New Capabilities (50 -> 54)

| Capability ID | Module | Description |
|---|---|---|
| `siem.investigate` | SIEM | Investigate alerts, update status, assign analysts |
| `siem.incident.manage` | SIEM | Create, update, and manage incidents/cases |
| `siem.hunt` | SIEM | Access threat hunting interface and IOC lookup |
| `siem.export` | SIEM | Export SIEM data (events, alerts, incidents) |

### Updated Role Assignments

| Role | Previous Count | New Count | Added Capabilities |
|---|---|---|---|
| `platform-admin` | 50 | 54 | siem.investigate, siem.incident.manage, siem.hunt, siem.export |
| `org-admin` | 49 | 53 | siem.investigate, siem.incident.manage, siem.hunt, siem.export |
| `security-analyst` | 28 | 31 | siem.investigate, siem.incident.manage, siem.hunt |
| `auditor` | 19 | 20 | siem.export |
| `asset-manager` | -- | -- | No changes |
| `compliance-officer` | -- | -- | No changes |
| `viewer` | -- | -- | No changes |

---

## Detection Rules Library

12 detection rules implemented in `src/lib/siem/detection-rules.ts`, each mapped to a MITRE ATT&CK technique with defined severity, confidence level, and data source requirements.

### Rule Catalog

| # | Rule Name | MITRE ID | Tactic | Type | Severity | Confidence |
|---|---|---|---|---|---|---|
| 1 | Brute Force / Password Spray | T1110 | Credential Access | threshold | high | high |
| 2 | Impossible Travel | T1078 | Initial Access | anomaly | high | medium |
| 3 | New Admin Account Created | T1136 | Persistence | simple | medium | high |
| 4 | Scheduled Task / Cron Creation | T1053 | Execution / Persistence | simple | medium | medium |
| 5 | PowerShell Encoded Command | T1059.001 | Execution | simple | high | high |
| 6 | LSASS Memory Access | T1003.001 | Credential Access | simple | critical | high |
| 7 | Lateral Movement via PsExec/WMI | T1021 | Lateral Movement | sequence | high | medium |
| 8 | DNS Tunneling | T1071.004 | Command and Control | anomaly | high | medium |
| 9 | Data Exfil -- Large Upload | T1048 | Exfiltration | threshold | critical | medium |
| 10 | C2 Beaconing | T1071 | Command and Control | anomaly | critical | low |
| 11 | Cloud IAM Privilege Escalation | T1078.004 | Privilege Escalation | simple | critical | high |
| 12 | Ransomware Indicators | T1486 | Impact | sequence | critical | high |

### Detection Rule Schema

Each rule definition includes:

```typescript
interface DetectionRule {
  name: string;
  description: string;
  ruleType: "threshold" | "sequence" | "anomaly" | "simple";
  condition: string;
  severity: string;
  mitreAttackId: string;
  mitreTactic: string;
  mitreTechnique: string;
  confidenceLevel: string;
  category: string;
  dataSources: string[];
}
```

---

## Seed Data

### Event Distribution (47 total)

| Dataset | Count | Example Events |
|---|---|---|
| auth | 12 | Failed logins, successful logins, MFA challenges, account lockouts |
| network | 10 | DNS queries, firewall blocks, large uploads, beaconing patterns |
| process | 8 | PowerShell encoded commands, LSASS access, PsExec execution, cron jobs |
| cloud | 6 | IAM policy changes, S3 public access, privilege escalation, API calls |
| scanner | 6 | Vulnerability scan results, CVE detections, compliance check outcomes |
| system | 5 | Service restarts, disk warnings, kernel events, configuration changes |

### Alert Distribution (25 total)

| Status | Count | Description |
|---|---|---|
| open | 5 | Newly generated, awaiting triage |
| triaging | 4 | Under initial assessment |
| investigating | 5 | Active investigation in progress |
| contained | 3 | Threat contained, remediation pending |
| resolved | 4 | Investigation complete, actions taken |
| closed | 2 | Fully resolved and documented |
| false_positive | 2 | Confirmed benign, tuning feedback applied |

### Incident Distribution (5 total)

| # | Title | Severity | Status | Linked Alerts |
|---|---|---|---|---|
| 1 | Active Ransomware Outbreak | critical | containment | 6 |
| 2 | Brute Force Campaign -- External | high | investigating | 5 |
| 3 | Data Exfiltration Attempt | high | eradication | 4 |
| 4 | False Positive -- Scheduled Maintenance | low | false_positive | 3 |
| 5 | Cloud IAM Privilege Escalation | critical | open | 4 |

---

## API Endpoints

### Rewritten: GET /api/siem

Complete rewrite of the SIEM listing endpoint to support tabbed views with independent pagination and filtering.

| Parameter | Type | Description |
|---|---|---|
| `tab` | string | `events` or `alerts` (default: `events`) |
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 25, max: 100) |
| `severity` | string | Filter by severity: `critical`, `high`, `medium`, `low`, `info` |
| `category` | string | Events only: filter by dataset |
| `status` | string | Alerts only: filter by lifecycle status |
| `search` | string | Full-text search across message fields |

**Capability required:** `siem.view`

---

### NEW: GET /api/siem/alerts/[id]

Retrieve full alert detail including triggering event, MITRE ATT&CK context, linked incident, and investigation metadata.

**Capability required:** `siem.view`

---

### NEW: PATCH /api/siem/alerts/[id]

Update alert status, assignment, and investigation fields. Enforces valid status transitions.

**Valid status transitions:**
```
open -> triaging -> investigating -> contained -> resolved -> closed
                                                            -> false_positive
```

**Capability required:** `siem.investigate`

**Audit log:** Creates `siem.alert.updated` entry with previous and new status.

---

### NEW: POST /api/siem/alerts/[id]/escalate

Escalate an alert to create a new incident, or link the alert to an existing incident.

**Capability required:** `siem.incident.manage`

**Audit log:** Creates `siem.alert.escalated` entry.

---

### NEW: GET /api/siem/rules

List all detection rules with filtering and sorting support.

| Parameter | Type | Description |
|---|---|---|
| `enabled` | boolean | Filter by enabled/disabled status |
| `severity` | string | Filter by rule severity |
| `category` | string | Filter by MITRE tactic category |

**Capability required:** `siem.view`

---

### NEW: POST /api/siem/rules

Create a new detection rule with MITRE ATT&CK mapping.

**Capability required:** `siem.manage`

**Audit log:** Creates `siem.rule.created` entry.

---

### NEW: GET /api/siem/rules/[id]

Retrieve full rule detail including tuning metrics (true/false positive counts, false positive rate).

**Capability required:** `siem.view`

---

### NEW: PATCH /api/siem/rules/[id]

Update rule configuration, enable/disable toggle, or adjust tuning parameters.

**Capability required:** `siem.manage`

**Audit log:** Creates `siem.rule.updated` entry.

---

### NEW: DELETE /api/siem/rules/[id]

Delete a detection rule. Soft-deletes by disabling the rule if alerts reference it.

**Capability required:** `siem.manage`

**Audit log:** Creates `siem.rule.deleted` entry.

---

### NEW: GET /api/siem/incidents

List all incidents with pagination, filtering, and SLA status.

| Parameter | Type | Description |
|---|---|---|
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 25) |
| `status` | string | Filter by incident status |
| `severity` | string | Filter by severity |
| `assignedTo` | string | Filter by assigned analyst |

**Capability required:** `siem.view`

---

### NEW: POST /api/siem/incidents

Create a new incident manually (not via alert escalation).

**Capability required:** `siem.incident.manage`

**Audit log:** Creates `siem.incident.created` entry.

---

### NEW: GET /api/siem/incidents/[id]

Retrieve full incident detail including timeline, linked alerts, evidence, impact summary, root cause analysis, remediation steps, and MITRE ATT&CK mapping.

**Response includes:**
- Incident metadata (title, severity, status, priority, assignment)
- Timeline entries with timestamps and actor attribution
- Linked alerts array with severity and MITRE context
- Evidence artifacts with type classification
- Impact summary with affected users and assets
- Root cause analysis and remediation steps
- MITRE tactics and techniques arrays
- Compliance mapping references
- SLA deadline and breach status

**Capability required:** `siem.view`

---

### NEW: PATCH /api/siem/incidents/[id]

Update incident fields including status transitions, timeline entries, evidence, and RCA.

**Valid status transitions:**
```
open -> investigating -> containment -> eradication -> recovery -> closed
                                                                 -> false_positive
```

**Capability required:** `siem.incident.manage`

**Audit log:** Creates `siem.incident.updated` entry with status change tracking.

---

### NEW: GET /api/siem/metrics

SOC performance metrics endpoint providing operational KPIs and chart data.

**Response includes:** postureScore, alert counts by status, incident counts by status, MTTD (value, unit, trend), MTTR (value, unit, trend), severityDistribution, alertVolumeByDay, topRules, topAssets.

**Capability required:** `siem.view`

---

## SOC Dashboard UI

Complete rewrite of the `/siem` page from a basic event list to a full-featured SOC Operations Center with 5 tabs.

### Tab 1: SOC Overview

The default landing view provides at-a-glance operational awareness for SOC analysts and managers.

**Metric Cards (6):**

| Card | Value | Description |
|---|---|---|
| Posture Score | 0-100 | Weighted security posture based on open alerts and incident status |
| Open Alerts | count | Total alerts in open + triaging status |
| Active Incidents | count | Incidents not in closed or false_positive status |
| MTTD | minutes | Mean Time to Detect -- average time from event to alert creation |
| MTTR | minutes | Mean Time to Respond -- average time from alert creation to resolution |
| False Positive Rate | percentage | Ratio of false_positive alerts to total closed alerts |

**Charts and Tables:**
- Alert Volume (7-day bar chart) -- daily alert counts rendered with CSS bar charts
- Severity Distribution -- horizontal bars showing critical/high/medium/low breakdown
- Top Triggering Rules -- ranked list of detection rules by alert count
- Top Impacted Assets -- ranked list of assets by alert count
- Recent Alerts -- latest 10 alerts with severity badges, MITRE tags, and timestamps

### Tab 2: Alert Queue

Full-featured alert management table for SOC analyst triage workflows.

**Features:**
- Sortable columns: severity, status, MITRE tactic, timestamp, assigned analyst
- Filter bar: severity dropdown, status dropdown, MITRE tactic filter
- Clickable rows navigate to `/siem/alerts/[id]` detail page
- Severity badges with color coding (critical=red, high=orange, medium=yellow, low=blue)
- Status badges with lifecycle color coding
- MITRE ATT&CK technique tags inline
- Pagination with configurable page size

### Tab 3: Incidents

Incident/case management table for tracking active investigations.

**Features:**
- Columns: title, severity, status, priority, assigned analyst, linked alerts count, SLA status
- SLA indicator: green (within SLA), yellow (approaching), red (breached)
- Clickable rows navigate to `/siem/incidents/[id]` detail page
- Filter by status, severity, assignment
- Pagination

### Tab 4: Detection Rules

Rule management interface for viewing and configuring detection logic.

**Features:**
- Columns: rule name, MITRE ID, tactic, severity, confidence, enabled status
- Enable/disable toggle (requires `siem.manage` capability)
- Confidence level badges (high=green, medium=yellow, low=red)
- Tuning metrics: true positive count, false positive count, FP rate
- Data source tags showing required log sources
- Create new rule button (requires `siem.manage` capability)

### Tab 5: Threat Hunting

IOC lookup and threat hunting interface (placeholder for future enrichment).

**Features:**
- IOC input field with type selector (IP, domain, hash, email, URL)
- Search button triggering lookup against event corpus
- Results display with matching events and threat intel context
- Requires `siem.hunt` capability

---

## Detail Pages

### Alert Detail: /siem/alerts/[id]

Full investigation view for a single alert.

**Sections:**
- **Header:** Severity badge, MITRE ATT&CK tag, status badge, priority score
- **Investigation Context:** Impacted users, impacted assets, related alerts, threat intel
- **Triggering Event:** Full ECS-normalized event that generated the alert, with expandable raw data
- **Lifecycle Actions:** Status transition buttons (Triage, Investigate, Contain, Resolve, Close, Mark False Positive)
- **Assignment:** Analyst assignment dropdown with `siem.investigate` capability gate
- **Linked Incident:** Link to parent incident if escalated, or escalate button if not
- **Timeline:** Chronological history of status changes and analyst actions

### Incident Detail: /siem/incidents/[id]

Full case management view for a single incident.

**Sections:**
- **Header:** Title, severity badge, status badge, priority, SLA countdown
- **Impact Summary:** Free-text impact description, affected user count, affected asset count
- **Timeline:** Vertical timeline component showing all investigation actions with timestamps and actors
- **Linked Alerts:** Table of all alerts linked to this incident with severity, MITRE context, and status
- **Root Cause Analysis:** Free-text RCA field, editable by analysts with `siem.incident.manage`
- **Remediation Steps:** Ordered list of remediation actions with completion checkboxes
- **Evidence:** Artifact list with type tags (IOC, log, screenshot, memory dump) and timestamps
- **MITRE ATT&CK:** Combined tactic and technique mapping across all linked alerts
- **Compliance Mapping:** Relevant compliance control references (PCI DSS, NIST, HIPAA)

---

## Shared Components

### MitreTag.tsx

Reusable badge component for displaying MITRE ATT&CK technique IDs and tactic names.

```
Location: src/app/(dashboard)/siem/components/MitreTag.tsx
```

**Features:**
- Accepts `attackId` and optional `tactic` props
- Renders as a compact badge with technique ID (e.g., "T1110")
- Tooltip shows full technique name and tactic on hover
- Color-coded by tactic category

### SeverityChart.tsx

CSS-based bar chart component for rendering severity distributions and alert volume trends without external charting libraries.

```
Location: src/app/(dashboard)/siem/components/SeverityChart.tsx
```

**Features:**
- Horizontal bar chart for severity distribution (critical/high/medium/low)
- Vertical bar chart for daily alert volume (7-day window)
- Color-coded bars matching severity color scheme
- Responsive width, no JavaScript dependencies
- Accepts data as simple array of objects with label and value fields

### TimelineView.tsx

Vertical timeline component for rendering chronological investigation histories.

```
Location: src/app/(dashboard)/siem/components/TimelineView.tsx
```

**Features:**
- Vertical connector line with timestamped nodes
- Each node displays: timestamp, actor, action description, optional details
- Color-coded by action type (status change, note, evidence added, assignment)
- Accepts timeline data as JSON array from incident or alert models

---

## Navigation Changes

### Sidebar

- Updated label from "SIEM" to "SIEM / SOC"
- Updated icon to `ShieldAlert` (from Lucide icons)
- Route remains `/siem`

### Topbar

- Alert notification badge in the top navigation bar now links directly to the specific alert detail page (`/siem/alerts/[id]`) instead of the generic SIEM list
- Badge count reflects open + triaging alerts only

---

## E2E Test Coverage

21 new tests in `tests/e2e/16-siem-enhancement.spec.ts` organized across 7 test groups.

### Test Inventory

| Group | # | Test | Description |
|---|---|---|---|
| **Events API** | 1 | Pagination with ECS fields | Pagination returns events with ECS fields |
| | 2 | Severity filter | Severity filter returns only matching events |
| | 3 | Category filter | Category/dataset filter returns correct events |
| **Alerts API** | 4 | Pagination with lifecycle | Pagination returns alerts with lifecycle fields |
| | 5 | Status filter | Status filter returns only matching alerts |
| | 6 | Detail with MITRE | Alert detail includes MITRE ATT&CK context |
| | 7 | Status update | Status update transitions alert correctly |
| **Rules API** | 8 | List rules | List returns all 12 detection rules |
| | 9 | Rule detail | Rule detail includes MITRE mapping and tuning metrics |
| | 10 | Create and delete | Create rule and delete rule lifecycle |
| **Incidents API** | 11 | List incidents | List returns incidents with linked alert counts |
| | 12 | Detail with timeline | Incident detail includes timeline and evidence |
| | 13 | Status update | Status update transitions incident correctly |
| **Metrics API** | 14 | Posture score | Returns posture score between 0-100 |
| | 15 | Alert counts | Returns correct alert count breakdown |
| | 16 | Severity distribution | Returns severity distribution matching alert data |
| **Alert Escalation** | 17 | Escalate to incident | Escalate alert creates new incident |
| **SOC Dashboard UI** | 18 | Tab rendering | Loads all 5 tabs without errors |
| | 19 | Metric cards | SOC Overview shows metric cards with values |
| | 20 | Alert queue | Alert Queue displays alerts with severity and status badges |
| | 21 | Incidents tab | Incidents tab displays incident rows with SLA indicators |
| **Alert Detail UI** | 22 | Detail page | Alert detail page loads with MITRE context and lifecycle buttons |
| **RBAC** | 23 | Viewer blocked | Viewer role blocked from rule creation (403) |

**Note:** The 21 tests are numbered 1-23 above for documentation clarity; some groups contain sub-tests within a single test block, yielding 21 discrete test functions in the spec file.

---

## File Manifest

### Modified Files (8)

| File | Changes |
|---|---|
| `prisma/schema.prisma` | Added 50+ fields across SiemEvent, SiemAlert, SiemRule; added SiemIncident model; added relations |
| `prisma/seed.ts` | Added 12 detection rules, 47 ECS events, 25 lifecycle alerts, 5 incidents with timelines |
| `src/lib/capabilities.ts` | Added 4 capabilities (siem.investigate, siem.incident.manage, siem.hunt, siem.export); updated 4 roles |
| `src/lib/audit.ts` | Added audit event types: siem.alert.updated, siem.alert.escalated, siem.rule.created, siem.rule.updated, siem.rule.deleted, siem.incident.created, siem.incident.updated |
| `src/lib/scanner/index.ts` | Updated scanner to emit ECS-normalized SiemEvents with dataset/module/logLevel fields |
| `src/app/(dashboard)/siem/page.tsx` | Complete rewrite: 5-tab SOC dashboard with metric cards, charts, tables |
| `src/components/layout/sidebar.tsx` | Updated SIEM nav label to "SIEM / SOC", icon to ShieldAlert |
| `src/components/layout/topbar.tsx` | Alert notifications link to individual alert detail pages |

### Created Files (15)

| File | Purpose |
|---|---|
| `src/lib/siem/detection-rules.ts` | 12 MITRE ATT&CK-mapped detection rule definitions |
| `src/types/siem.ts` | TypeScript interfaces for SIEM entities (events, alerts, rules, incidents, metrics) |
| `src/app/api/siem/alerts/[id]/route.ts` | GET + PATCH for alert detail and status transitions |
| `src/app/api/siem/alerts/[id]/escalate/route.ts` | POST for alert-to-incident escalation |
| `src/app/api/siem/rules/route.ts` | GET + POST for rule listing and creation |
| `src/app/api/siem/rules/[id]/route.ts` | GET + PATCH + DELETE for rule detail and management |
| `src/app/api/siem/incidents/route.ts` | GET + POST for incident listing and creation |
| `src/app/api/siem/incidents/[id]/route.ts` | GET + PATCH for incident detail and updates |
| `src/app/api/siem/metrics/route.ts` | GET for SOC performance metrics and chart data |
| `src/app/(dashboard)/siem/alerts/[id]/page.tsx` | Alert detail page with investigation context and lifecycle actions |
| `src/app/(dashboard)/siem/incidents/[id]/page.tsx` | Incident detail page with timeline, evidence, and RCA |
| `src/app/(dashboard)/siem/components/MitreTag.tsx` | MITRE ATT&CK badge component |
| `src/app/(dashboard)/siem/components/SeverityChart.tsx` | CSS bar chart component for severity and volume data |
| `src/app/(dashboard)/siem/components/TimelineView.tsx` | Vertical timeline component for investigation histories |
| `tests/e2e/16-siem-enhancement.spec.ts` | 21 E2E tests covering API, UI, and RBAC |

---

## Build Status

| Metric | Value |
|---|---|
| TypeScript errors | 0 |
| Total routes | 103 |
| Total E2E tests | 239 (219 existing + 21 new - 1 consolidated) |
| New API routes | 8 |
| New pages | 3 (SOC dashboard rewrite + 2 detail pages) |
| New components | 3 |
| Schema migrations | 1 (add SIEM enhancement fields + SiemIncident table) |

---

## MITRE ATT&CK Coverage Matrix

The detection rule library provides coverage across 9 MITRE ATT&CK tactics:

| Tactic | Techniques Covered | Rule Count |
|---|---|---|
| Credential Access | T1110 (Brute Force), T1003.001 (LSASS Dump) | 2 |
| Initial Access | T1078 (Valid Accounts -- Impossible Travel) | 1 |
| Persistence | T1136 (Create Account), T1053 (Scheduled Task) | 2 |
| Execution | T1059.001 (PowerShell) | 1 |
| Lateral Movement | T1021 (Remote Services -- PsExec/WMI) | 1 |
| Command and Control | T1071.004 (DNS Tunneling), T1071 (C2 Beaconing) | 2 |
| Exfiltration | T1048 (Exfil Over Alternative Protocol) | 1 |
| Privilege Escalation | T1078.004 (Cloud IAM) | 1 |
| Impact | T1486 (Data Encrypted for Impact) | 1 |

**Total:** 12 techniques across 9 tactics (some rules map to multiple tactics).

---

## SOC Metrics Definitions

| Metric | Definition | Calculation |
|---|---|---|
| MTTD (Mean Time to Detect) | Average elapsed time from the triggering event timestamp to alert creation timestamp | AVG(alert.createdAt - event.createdAt) across all alerts with linked events |
| MTTR (Mean Time to Respond) | Average elapsed time from alert creation to resolution | AVG(alert.resolvedAt - alert.createdAt) across resolved/closed alerts |
| Posture Score | Weighted security posture indicator (0-100) | 100 - (open_critical x 8 + open_high x 4 + open_medium x 2 + open_low x 1) - (active_incidents x 5), clamped to 0-100 |
| False Positive Rate | Ratio of false positive closures to total closures | false_positive_count / (resolved_count + closed_count + false_positive_count) |

---

## Compliance Mapping

Phase 10 satisfies requirements from multiple compliance frameworks:

| Framework | Control | Requirement | Implementation |
|---|---|---|---|
| PCI DSS | 10.6 | Review logs and security events | SOC Dashboard, Alert Queue, Event viewer |
| PCI DSS | 10.7 | Retain audit trail history | Event retention with ECS normalization |
| PCI DSS | 12.10 | Implement an incident response plan | Incident management with lifecycle workflow |
| NIST CSF 2.0 | DE.AE-2 | Analyze anomalies and events | 12 detection rules with anomaly and threshold types |
| NIST CSF 2.0 | DE.CM-1 | Monitor networks for cybersecurity events | ECS-normalized network events with geo and threat intel |
| NIST CSF 2.0 | RS.AN-1 | Investigate notifications from detection systems | Alert detail with investigation context |
| NIST CSF 2.0 | RS.MI-1 | Contain incidents | Incident lifecycle with containment status |
| HIPAA | 164.308(a)(6) | Security incident procedures | Incident management with timeline and evidence |
| CIS v8.1 | 8.2 | Collect audit logs | ECS event ingestion across 6 datasets |
| CIS v8.1 | 8.11 | Conduct audit log reviews | SOC Overview metrics and alert triage workflow |

---

## Architecture Notes

### Alert Lifecycle State Machine

```
     +-------+      +----------+      +--------------+      +-----------+
     | open  | ---> | triaging | ---> | investigating| ---> | contained |
     +-------+      +----------+      +--------------+      +-----------+
                                                                  |
                                                                  v
                                            +----------+    +-----------+
                                            |  closed  | <- | resolved  |
                                            +----------+    +-----------+
                                                  ^
                                                  |
                                            +----------------+
                                            | false_positive |
                                            +----------------+
```

### Incident Lifecycle State Machine

```
     +------+      +---------------+      +--------------+
     | open | ---> | investigating | ---> | containment  |
     +------+      +---------------+      +--------------+
                                                |
                                                v
     +--------+      +----------+      +--------------+
     | closed | <--- | recovery | <--- | eradication  |
     +--------+      +----------+      +--------------+
         ^
         |
     +----------------+
     | false_positive |
     +----------------+
```

### Data Flow

```
Raw Log Sources (auth, network, process, cloud, scanner, system)
    |
    v
ECS Normalization (SiemEvent with 21 enrichment fields)
    |
    v
Detection Engine (12 MITRE ATT&CK-mapped rules)
    |
    v
Alert Generation (SiemAlert with lifecycle, scoring, context)
    |
    v
SOC Triage (Alert Queue with filters, assignment, status transitions)
    |
    v
Incident Escalation (SiemIncident with timeline, evidence, RCA)
    |
    v
SOC Metrics (MTTD, MTTR, posture score, trend analysis)
```

---

## Changelog

### v1.0.10 -- Phase 10: Enterprise SIEM Enhancement

**Added:**
- ECS-normalized event schema with 21 enrichment fields across network, user, process, host, and geo contexts
- 12 MITRE ATT&CK-mapped detection rules covering 9 tactics (Credential Access through Impact)
- Full alert lifecycle with 7-status workflow (open through false_positive)
- Incident/case management model with SLA tracking, timeline, evidence, and compliance mapping
- SOC Operations Center dashboard with 5 tabs (Overview, Alert Queue, Incidents, Rules, Threat Hunting)
- Alert detail page with investigation context, triggering event, and lifecycle action buttons
- Incident detail page with timeline, linked alerts, RCA, remediation steps, and evidence
- SOC metrics endpoint with MTTD, MTTR, posture score, and chart data
- 4 new RBAC capabilities (siem.investigate, siem.incident.manage, siem.hunt, siem.export)
- 3 shared components (MitreTag, SeverityChart, TimelineView)
- 47 seed events, 25 seed alerts, 12 seed rules, 5 seed incidents
- 21 new E2E tests covering API, UI, and RBAC

**Modified:**
- Rewrote SIEM listing API with tab support, pagination, and filtering
- Updated scanner to emit ECS-normalized events
- Updated sidebar navigation label and icon
- Updated topbar alert notifications to link to alert detail pages
- Extended audit logger with 7 new SIEM event types
- Updated 4 role definitions with new capability assignments

---

*Report generated: 2026-03-10*
*Phase 10 implementation: Enterprise SIEM Enhancement -- SOC Operations Center*
*Build: 103 routes | 0 errors | 239 E2E tests*
