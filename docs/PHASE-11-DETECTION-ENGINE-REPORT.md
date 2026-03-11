# BYOC Phase 11: Detection Engine, SOAR, Compliance Automation & Operational Maturity

**Date:** 2026-03-10
**Phase:** 11 -- Detection Engine, SOAR, Compliance Automation & Operational Maturity
**Status:** Complete
**Build:** 108 routes, 0 TypeScript errors, 258 E2E tests
**Previous Phase:** Phase 10 -- Enterprise SIEM Enhancement (103 routes, 239 E2E tests)

---

## Executive Summary

Phase 11 makes the SIEM operational -- transforming static seeded data into a live detection pipeline. Events flow in via ingestion API, get evaluated against 12 MITRE ATT&CK-mapped detection rules using 11 evaluator types, trigger alerts with priority scoring, and automatically escalate via SOAR playbooks. Scanner findings now auto-update compliance controls across 5 frameworks. AI actions execute real operations. Reports generate synchronously with CSV/JSON export. The SOC dashboard auto-refreshes on a 30-second polling interval.

### Delivery Summary

| Component | Count | Details |
|---|---|---|
| New files | 9 | Rule engine, SOAR, compliance automation, event APIs, SOAR API, report download, cron scheduler, E2E tests |
| Modified files | 8 | Scanner, alerts, AI actions, reports, SIEM page, seed data, schema, vercel.json |
| Rule evaluator types | 11 | threshold, sequence, process_match, process_access, network_process, geo_velocity, dns_anomaly, volume_threshold, beacon_detection, iam_policy, ransomware_pattern |
| SOAR playbooks | 3 | Critical Auto-Escalation, Brute Force Response, Ransomware Isolation |
| Compliance frameworks automated | 5 | PCI DSS, NIST CSF 2.0, CIS v8.1, HIPAA, GDPR |
| API endpoints | 6 new | POST /api/siem/events, POST /api/siem/events/batch, GET /api/reports/[id]/download, GET /api/soar/playbooks, GET /api/cron/scan-scheduler |
| E2E tests | 19 new | TC-P11-001 through TC-P11-019 |
| Schema changes | 1 field | assessorType on ComplianceAssessment |

---

## Schema Changes

### Enhanced: ComplianceAssessment

Added a single field to distinguish manually created assessments from system-generated ones produced by the compliance automation engine.

```prisma
model ComplianceAssessment {
  // Existing fields retained: id, tenantId, controlId, assessorId, status, findings, evidence, createdAt

  // --- Phase 11 ---
  assessorType  String  @default("manual")   // "manual" | "system"
}
```

This field allows compliance dashboards and auditors to differentiate between human assessments and those auto-created by the scanner-to-compliance pipeline.

---

## Detection Rule Evaluation Engine

**File:** `src/lib/siem/rule-engine.ts`

The rule engine is the core of Phase 11 -- it makes the 12 MITRE ATT&CK-mapped detection rules from Phase 10 operational by evaluating incoming events against them in real time. The engine runs synchronously within the API request lifecycle, making it compatible with Vercel serverless execution.

### Evaluator Types (11)

| # | Evaluator | Description | DB Queries |
|---|---|---|---|
| 1 | `threshold` | Count events matching field=value in time window; trigger when count >= threshold | Yes (count query) |
| 2 | `sequence` | Check if required event actions exist in order within window | Yes (findFirst per step) |
| 3 | `process_match` | Match processName against known-bad list with optional commandLineContains | No (in-memory) |
| 4 | `process_access` | Detect access to sensitive processes (e.g., lsass.exe) with exclusion list | No (in-memory) |
| 5 | `network_process` | Match process making network connections on suspicious destination ports | No (in-memory) |
| 6 | `geo_velocity` | Impossible travel detection by comparing login geo locations for same user | Yes (findFirst) |
| 7 | `dns_anomaly` | DNS tunneling detection via query length and Shannon entropy calculation | No (in-memory) |
| 8 | `volume_threshold` | Large data transfer / exfiltration detection by byte count or title keywords | No (in-memory) |
| 9 | `beacon_detection` | C2 beaconing pattern detection -- repeated connections to same destination | Yes (count query) |
| 10 | `iam_policy` | Dangerous IAM policy changes in cloud environments with wildcard resource check | No (in-memory) |
| 11 | `ransomware_pattern` | Multi-indicator ransomware detection (mass rename, shadow copy delete, ransom note) | No (in-memory) |

### Category Compatibility Map

Rules specify a category, but events may use related but different category values. The compatibility map ensures flexible matching:

```typescript
const CATEGORY_COMPAT: Record<string, string[]> = {
  endpoint:       ["endpoint", "process", "malware", "ransomware"],
  network:        ["network", "dns", "lateral_movement", "data_exfil"],
  authentication: ["authentication", "identity"],
  identity:       ["identity", "authentication"],
  cloud:          ["cloud", "cloud_iam"],
  process:        ["process", "endpoint"],
};
```

### Priority Scoring

Alert priority is computed as: `severity_weight * (confidence / 100) * asset_criticality_weight`, clamped to 0-100.

| Severity | Weight | Asset Criticality | Multiplier |
|---|---|---|---|
| critical | 100 | critical | 1.5 |
| high | 75 | high | 1.2 |
| medium | 50 | medium | 1.0 |
| low | 25 | low | 0.8 |

### Key Exports

| Function | Purpose |
|---|---|
| `evaluateRules(event, rules)` | Evaluate a single event against all active rules; returns array of RuleMatch |
| `createAlertFromMatch(match, event, tenantId)` | Create a SiemAlert from a rule match and update rule statistics |
| `computePriority(severity, confidence, assetCriticality)` | Calculate numerical priority score for alert ranking |
| `parseWindow(window)` | Parse time window string ("10m", "1h", "24h") to milliseconds |

---

## Event Ingestion API

### POST /api/siem/events -- Single Event Ingestion

**File:** `src/app/api/siem/events/route.ts`

The core SIEM ingestion pipeline. Each event flows through a four-stage process:

1. **Validate + Store** -- validates source, severity, category against allowed values; persists the event with all ECS fields
2. **Rule Evaluation** -- loads all active rules for the tenant and evaluates the event against each
3. **Alert Creation** -- creates SiemAlert records for each rule match with priority scoring
4. **SOAR Trigger** -- finds and executes matching SOAR playbooks for each new alert

**Validation Constants:**

| Constant | Values |
|---|---|
| `VALID_SOURCES` | firewall, ids, endpoint, cloud, application, edr, waf, identity, database, dns, scanner, system |
| `VALID_SEVERITIES` | critical, high, medium, low, info |
| `VALID_CATEGORIES` | authentication, network, malware, policy_violation, system, process, dns, cloud_iam, data_exfil, lateral_movement, ransomware, vulnerability |

**Capability required:** `siem.integration.manage`

**Response:**
```json
{
  "event": { "id": "..." },
  "alerts": [
    { "id": "...", "title": "...", "severity": "...", "status": "open", "ruleName": "...", "mitreAttackId": "..." }
  ],
  "playbooks": [
    { "playbookId": "...", "playbookName": "...", "executed": true, "incidentId": "...", "stepsExecuted": ["step-1", "step-2"] }
  ]
}
```

**Audit log:** Creates `siem.event.ingested` entry with source, category, severity, alertsGenerated, playbooksTriggered.

---

### POST /api/siem/events/batch -- Batch Event Ingestion

**File:** `src/app/api/siem/events/batch/route.ts`

Bulk ingestion endpoint for high-volume log sources. Accepts up to 100 events per request.

- Validates all events before processing (fail-fast on first invalid event)
- Loads active rules once, evaluates each event individually
- Creates alerts and triggers SOAR for each event independently

**Capability required:** `siem.integration.manage`

**Request body:** `{ "events": [ { source, severity, category, title, ... }, ... ] }`

**Response:** `{ "ingested": 5, "alerts": [...], "playbooks": [...] }`

**Limits:**
- Maximum batch size: 100 events
- Empty array: rejected (400)
- Events exceeding 100: rejected (400)

**Audit log:** Creates `siem.event.batch_ingested` entry with count, alertsGenerated, playbooksTriggered.

---

## SOAR Playbook System

**File:** `src/lib/soar/playbooks.ts`

A code-defined SOAR (Security Orchestration, Automation, and Response) system. Playbooks are stored as TypeScript constants -- no new database model required. Execution records are captured as timeline entries on auto-created incidents.

### Playbook Catalog

| # | Playbook | Trigger | Steps | Outcome |
|---|---|---|---|---|
| 1 | Critical Alert Auto-Escalation | severity = critical | escalate_to_incident, add_timeline_entry | Auto-creates incident with priority "critical" |
| 2 | Brute Force Response | ruleName contains "Brute Force" | update_alert_status, escalate_to_incident, add_timeline_entry | Marks alert as contained, creates incident, records firewall block recommendation |
| 3 | Ransomware Isolation | ruleName contains "Ransomware" AND severity = critical | escalate_to_incident, update_alert_status, add_timeline_entry | Creates critical incident, contains alert, initiates network isolation procedure |

### Step Actions

| Action | Description |
|---|---|
| `escalate_to_incident` | Creates a new SiemIncident with "[SOAR]" prefix, links alert, sets status to "investigating" |
| `update_alert_status` | Updates the alert status (e.g., to "contained" or "resolved") with timestamp |
| `add_timeline_entry` | Appends a timeline entry to the incident with actor "SOAR: {playbook name}" |
| `set_priority` | Updates the incident priority level |

### Key Exports

| Function | Purpose |
|---|---|
| `findMatchingPlaybooks(alert, ruleName?)` | Find all playbooks whose trigger conditions match the alert |
| `executePlaybook(alertId, alertData, playbook)` | Execute a playbook's steps for a given alert; returns execution result |
| `PLAYBOOKS` | Array of all registered playbook definitions |

### SOAR API

**GET /api/soar/playbooks** (`src/app/api/soar/playbooks/route.ts`)

Returns all registered playbook definitions with trigger conditions, step counts, and step details.

**Capability required:** `siem.view`

---

## Compliance Automation

**File:** `src/lib/compliance/automation.ts`

Automatically maps scanner findings to compliance controls across 5 frameworks. After a scan completes, the engine groups findings by check module, determines the worst severity, and updates matching compliance controls.

### Scanner Check Module to Compliance Control Mapping

| Check Module | PCI DSS | NIST CSF | CIS v8.1 | HIPAA | GDPR |
|---|---|---|---|---|---|
| `http-headers` | 6 (Secure Systems) | PR.DS (Data Security) | 4 (Secure Config) | -- | 32 (Art. 32) |
| `ssl-tls` | 4 (Data in Transit) | PR.DS (Data Security) | 3 (Data Protection) | 312(e) (Transmission) | 32 (Art. 32) |
| `common-cves` | 6 (Secure Systems) | ID.RA (Risk Assessment) | 7 (Vuln Mgmt) | -- | -- |
| `exposed-panels` | 7 (Restrict Access) | PR.AA (Access Control) | 4 (Secure Config) | 312(a) (Access) | -- |
| `info-disclosure` | 6 (Secure Systems) | -- | 4 (Secure Config) | -- | 32 (Art. 32) |
| `port-scan` | 1 (Network Security) | DE.CM (Monitoring) | 12 (Network Infra) | -- | -- |
| `cloud-misconfig` | 2 (Secure Config) | PR.PS (Platform Security) | 4 (Secure Config) | -- | -- |
| `dns-checks` | -- | DE.CM (Monitoring) | 9 (Email/Web) | -- | -- |

### Severity to Compliance Status Mapping

| Scanner Severity | Compliance Status |
|---|---|
| critical | non_compliant |
| high | non_compliant |
| medium | partially_compliant |
| low | compliant |
| info | compliant |

### Automation Process

1. Load scan results and group by check module
2. For each check module, determine worst severity across all findings
3. Map check module to compliance controls via `SCAN_TO_COMPLIANCE_MAP`
4. Update control status if new status is worse than current (or control is `not_assessed`)
5. Create `ComplianceAssessment` record with `assessorType: "system"` and evidence chain

**Key export:** `updateComplianceFromScan(scanId, tenantId)` -- returns `{ updated: number, assessments: number }`

---

## Alert to Rule Tuning Feedback Loop

When an alert status is updated via PATCH /api/siem/alerts/[id], the system provides tuning feedback to the detection rule:

| Alert Status | Rule Field Updated | Effect |
|---|---|---|
| `false_positive` | `falsePositiveCount` incremented | Increases false positive rate |
| `resolved` / `closed` | `truePositiveCount` incremented | Improves rule confidence |

**False Positive Rate Calculation:**

```
falsePositiveRate = falsePositiveCount / (truePositiveCount + falsePositiveCount)
```

This feedback loop enables SOC analysts to track rule quality over time and identify rules that need tuning.

---

## AI Action Execution

**Modified file:** AI actions PATCH endpoint

The AI action execution logic was rewritten with proper guards and real execution behavior:

### Guards

- **Status check:** Action must be in "approved" status before execution. Attempting to execute a "pending" action returns 400.
- **Approval flow:** `pending` -> `approved` -> `executed`

### Execution by Action Type

| Action Type | Execution Behavior |
|---|---|
| `remediation` / `scan` | Creates a new Scan record with the action's parameters |
| `siem_rule` | Creates a new SiemRule from the action's rule definition |
| `firewall_rule` | Creates a SiemEvent recording the firewall change |

### Response

```json
{
  "status": "executed",
  "executionResult": {
    "action": "scan_created",
    "resourceId": "...",
    "timestamp": "..."
  }
}
```

---

## Report Generation & Export

### Synchronous Report Generation

Reports now complete synchronously within the API request lifecycle. The previous `setTimeout` fire-and-forget pattern was replaced with `await`, ensuring the report data is populated before the response is returned.

**POST /api/reports/generate** now returns `{ "status": "completed" }` immediately.

### Report Download

**GET /api/reports/[id]/download?format=csv|json**

**File:** `src/app/api/reports/[id]/download/route.ts`

| Parameter | Type | Description |
|---|---|---|
| `format` | string | `csv` or `json` (default: `json`) |

**CSV Format:**
```
Section,Metric,Value
Metadata,Generated At,"2026-03-10T..."
Metadata,Tenant,"Exargen"
Summary,Total Assets,15
Vulnerabilities,critical,2
Compliance,compliant,12
```

**JSON Format:** Returns the full report data object with proper Content-Disposition header for download.

**Capability required:** `report.export`

---

## SOC Dashboard Auto-Refresh

The SOC Operations Center dashboard (`/siem`) now auto-refreshes metrics and data:

- **Polling interval:** 30 seconds
- **Status indicator:** "Live -- updated {relative time}" displayed in the dashboard header
- **No loading spinner:** Auto-refresh updates data silently without showing a loading state
- **Vercel-compatible:** Uses polling instead of WebSocket connections

---

## Scan Scheduling

**GET /api/cron/scan-scheduler**

**File:** `src/app/api/cron/scan-scheduler/route.ts`

Vercel Cron endpoint that checks for scans with `scheduleCron` set and creates new instances when they are due.

### Authentication

Authenticated via `CRON_SECRET` environment variable. Vercel automatically sends `Authorization: Bearer {CRON_SECRET}` on cron invocations. If `CRON_SECRET` is not set (dev mode), the endpoint runs without auth.

### Supported Cron Patterns

| Pattern | Meaning |
|---|---|
| `*/N * * * *` | Every N minutes |
| `0 */N * * *` | Every N hours |
| `0 0 * * *` | Daily |
| `0 0 * * 0` | Weekly (Sunday) |
| `0 0 1 * *` | Monthly |

### vercel.json Configuration

```json
{
  "crons": [
    {
      "path": "/api/cron/scan-scheduler",
      "schedule": "0 */6 * * *"
    }
  ]
}
```

Runs every 6 hours. Creates new scan instances from templates with `scheduleCron` set.

---

## Scanner to Rule Engine Wiring

Phase 11 connects the vulnerability scanner pipeline to the detection engine and compliance automation:

### Event Flow

```
Scanner Execution
    |
    v
Scan Results + SiemEvent Creation (existing Phase 10 behavior)
    |
    +---> evaluateRules() --- matches ---> createAlertFromMatch()
    |                                            |
    |                                            +---> findMatchingPlaybooks()
    |                                                        |
    |                                                        +---> executePlaybook()
    |
    +---> updateComplianceFromScan() --- maps findings to 5 frameworks
```

### Backward Compatibility

If no detection rules match a scanner event, the existing fallback alert creation behavior is preserved. This ensures scanner findings always generate alerts regardless of rule configuration.

---

## Seed Data Updates

All 12 detection rules in `prisma/seed.ts` were updated with engine-compatible condition formats:

### Key Changes

- **Type field added:** Every rule condition now includes a `type` field that dispatches to the correct evaluator (e.g., `{ "type": "threshold", "field": "eventAction", ... }`)
- **Category compatibility:** Rules use categories that map correctly via the compatibility map (e.g., "endpoint" rules match "process" events)
- **DNS Tunneling rule:** Category changed from "network" to "dns" for proper matching with dns_anomaly evaluator
- **Ransomware rule:** Condition updated with `indicators` array containing `mass_rename`, `shadow_copy_delete`, and `ransom_note` types with `minIndicators: 2`

---

## E2E Test Coverage

19 new tests in `tests/e2e/17-detection-engine.spec.ts` organized across 8 test groups.

### Test Inventory

| Group | # | Test ID | Test | Description |
|---|---|---|---|---|
| **Event Ingestion** | 1 | TC-P11-001 | POST single event | Valid event ingestion returns event ID, alerts array, playbooks array |
| | 2 | TC-P11-002 | Process match triggers rule | PowerShell event triggers T1059.001 rule with correct MITRE mapping |
| | 3 | TC-P11-003 | Batch ingestion | 5-event batch returns correct ingested count |
| | 4 | TC-P11-004 | Batch limit enforcement | 101 events rejected with 400 |
| | 5 | TC-P11-005 | Event visibility | Ingested event appears in GET /api/siem?tab=events search |
| | 6 | TC-P11-006 | RBAC enforcement | Viewer role blocked from POST /api/siem/events (403) |
| **Rule Tuning** | 7 | TC-P11-007 | False positive feedback | false_positive status increments rule falsePositiveCount |
| | 8 | TC-P11-008 | True positive feedback | resolved status increments rule truePositiveCount |
| **AI Action Execution** | 9 | TC-P11-009 | Unapproved execution blocked | Execute on unapproved action returns 400 |
| | 10 | TC-P11-010 | Approve then execute | Approve + execute flow produces execution result |
| **Report Export** | 11 | TC-P11-011 | Synchronous completion | Report generates with status "completed" immediately |
| | 12 | TC-P11-012 | CSV download | CSV export contains Section, Metric headers |
| | 13 | TC-P11-013 | JSON download | JSON export returns structured data with generatedAt or summary |
| **SOAR Playbooks** | 14 | TC-P11-014 | Playbook listing | GET /api/soar/playbooks returns 3 playbooks |
| | 15 | TC-P11-015 | Critical auto-escalation | Critical LSASS event triggers rule, SOAR creates incident |
| **Scan Scheduling** | 16 | TC-P11-016 | Cron auth check | Cron endpoint responds appropriately based on CRON_SECRET |
| **SOC Dashboard** | 17 | TC-P11-017 | Metrics endpoint | Returns all required metric fields with correct types |
| | 18 | TC-P11-018 | Live indicator | SIEM page renders with "Live" status indicator |
| **Full Pipeline** | 19 | TC-P11-019 | End-to-end pipeline | Ransomware event triggers rule (T1486), creates alert, SOAR escalates to incident |

---

## Architecture Decisions

### Synchronous Rule Evaluation

Rule evaluation runs within the API request lifecycle rather than as a background job. This design:
- Eliminates the need for a job queue or worker process
- Is fully compatible with Vercel serverless functions
- Returns alerts and playbook results in the API response
- Keeps the architecture simple and debuggable

Most evaluators (7 of 11) operate purely in-memory with no DB queries, keeping latency low. Only threshold, sequence, geo_velocity, and beacon_detection require historical lookups.

### Code-Defined Playbooks

SOAR playbooks are stored as TypeScript constants rather than database records:
- No new DB model or migration required
- Playbook logic is version-controlled and testable
- Step execution is type-safe
- Execution records are captured as incident timeline entries

### 30-Second Polling for Dashboard

The SOC dashboard uses 30-second polling instead of WebSocket connections:
- Vercel does not support persistent WebSocket connections in serverless functions
- Polling is simple to implement and debug
- 30-second interval balances freshness with server load

### Compliance Automation Pattern Matching

The scanner check module to compliance control mapping uses `controlIdPattern` with LIKE matching:
- Allows a single mapping to match multiple controls within a framework section
- Pattern "6" matches controls "6.1", "6.2", "6.3", etc. in PCI DSS
- Flexible enough to accommodate different control numbering schemes across frameworks

### Category Compatibility Map

Rather than requiring exact category matches between rules and events, the compatibility map allows flexible matching:
- A rule targeting "endpoint" automatically evaluates against "process", "malware", and "ransomware" events
- Reduces the need for duplicate rules across related event categories
- The map is extensible -- adding new category relationships requires only a single line change

---

## Files Changed

### New Files (9)

| File | Purpose |
|---|---|
| `src/lib/siem/rule-engine.ts` | Detection rule evaluation engine with 11 evaluator types, category compatibility, priority scoring |
| `src/lib/soar/playbooks.ts` | SOAR playbook system with 3 code-defined playbooks, matching logic, and execution engine |
| `src/lib/compliance/automation.ts` | Compliance automation mapping 8 scanner check modules to controls across 5 frameworks |
| `src/app/api/siem/events/route.ts` | POST single event ingestion with inline rule evaluation and SOAR trigger |
| `src/app/api/siem/events/batch/route.ts` | POST batch event ingestion (up to 100 events) with rule evaluation and SOAR |
| `src/app/api/soar/playbooks/route.ts` | GET playbook definitions listing with trigger conditions and steps |
| `src/app/api/reports/[id]/download/route.ts` | GET report download with CSV (Section,Metric,Value) and JSON export formats |
| `src/app/api/cron/scan-scheduler/route.ts` | GET Vercel Cron endpoint for scheduled scan execution |
| `tests/e2e/17-detection-engine.spec.ts` | 19 E2E tests covering event ingestion, rule tuning, AI actions, reports, SOAR, scheduling, dashboard |

### Modified Files (8)

| File | Changes |
|---|---|
| `prisma/schema.prisma` | Added `assessorType` field to ComplianceAssessment model |
| `prisma/seed.ts` | Updated all 12 detection rule conditions with engine-compatible format (type field for evaluator dispatch); fixed DNS Tunneling category to "dns" |
| `src/lib/scanner/index.ts` | Wired scanner event creation to evaluateRules() + SOAR; added updateComplianceFromScan() hook after asset updates |
| `src/app/api/siem/alerts/[id]/route.ts` | Added alert-to-rule tuning feedback: false_positive increments falsePositiveCount, resolved/closed increments truePositiveCount; recalculates falsePositiveRate |
| `src/app/api/ai-actions/[id]/route.ts` | Rewrote AI action execution: guards for "approved" status, creates Scan/SiemRule/SiemEvent based on action type |
| `src/app/api/reports/generate/route.ts` | Reports now complete synchronously (replaced setTimeout with await) |
| `src/app/(dashboard)/siem/page.tsx` | Added 30-second auto-refresh polling with "Live -- updated {time}" indicator; no loading spinner on refresh |
| `vercel.json` | Added cron configuration: scan-scheduler runs every 6 hours |

---

## Data Flow

```
External Log Sources (firewall, edr, identity, cloud, dns, scanner)
    |
    v
Event Ingestion API (POST /api/siem/events or /api/siem/events/batch)
    |
    +-- Validate against VALID_SOURCES, VALID_SEVERITIES, VALID_CATEGORIES
    |
    v
SiemEvent Record (ECS-normalized, stored in DB)
    |
    v
Rule Evaluation Engine (11 evaluator types, category compatibility map)
    |
    +-- No match --> done (backward-compatible fallback for scanner events)
    |
    +-- Match --> Alert Creation (priority scoring, MITRE ATT&CK mapping)
                      |
                      v
                SOAR Playbook Matching (findMatchingPlaybooks)
                      |
                      +-- No match --> alert stands alone
                      |
                      +-- Match --> Playbook Execution
                                        |
                                        +-- escalate_to_incident
                                        +-- update_alert_status
                                        +-- add_timeline_entry
                                        +-- set_priority

Scanner Pipeline (parallel flow):
    |
    +-- Scan completes --> updateComplianceFromScan()
                              |
                              +-- Group findings by check module
                              +-- Map to controls across 5 frameworks
                              +-- Update control status + create assessment
```

---

## Compliance Mapping

Phase 11 satisfies requirements from multiple compliance frameworks:

| Framework | Control | Requirement | Implementation |
|---|---|---|---|
| PCI DSS | 10.6 | Review logs and security events | Event ingestion API with real-time rule evaluation |
| PCI DSS | 10.7 | Retain audit trail history | Event storage with ECS normalization and audit logging |
| PCI DSS | 12.10 | Implement incident response plan | SOAR playbooks auto-escalate critical alerts to incidents |
| NIST CSF 2.0 | DE.AE-2 | Analyze anomalies and events | 11 evaluator types including dns_anomaly, geo_velocity, beacon_detection |
| NIST CSF 2.0 | DE.CM-1 | Monitor networks for cybersecurity events | Continuous event ingestion with 30-second dashboard refresh |
| NIST CSF 2.0 | RS.AN-1 | Investigate notifications from detection systems | Alert-to-rule tuning feedback loop with FP/TP tracking |
| NIST CSF 2.0 | RS.MI-1 | Contain incidents | SOAR auto-containment (Brute Force, Ransomware playbooks) |
| HIPAA | 164.308(a)(6) | Security incident procedures | SOAR auto-escalation and incident creation with timeline |
| CIS v8.1 | 8.2 | Collect audit logs | Batch event ingestion up to 100 events per request |
| CIS v8.1 | 8.11 | Conduct audit log reviews | SOC dashboard auto-refresh with MTTD/MTTR metrics |
| CIS v8.1 | 13.1 | Establish and maintain a data classification process | Compliance automation maps scanner findings to framework controls |

---

## Build Status

| Metric | Value |
|---|---|
| TypeScript errors | 0 |
| Total routes | 108 |
| Total E2E tests | 258 (239 existing + 19 new) |
| New API routes | 6 |
| New library modules | 3 (rule engine, SOAR, compliance automation) |
| Schema migrations | 1 (add assessorType to ComplianceAssessment) |
| SOAR playbooks | 3 |
| Rule evaluator types | 11 |
| Compliance frameworks automated | 5 |

---

## Changelog

### v1.0.11 -- Phase 11: Detection Engine, SOAR, Compliance Automation & Operational Maturity

**Added:**
- Detection rule evaluation engine with 11 evaluator types (threshold, sequence, process_match, process_access, network_process, geo_velocity, dns_anomaly, volume_threshold, beacon_detection, iam_policy, ransomware_pattern)
- SOAR playbook system with 3 code-defined playbooks (Critical Auto-Escalation, Brute Force Response, Ransomware Isolation)
- Compliance automation engine mapping 8 scanner check modules to controls across PCI DSS, NIST CSF 2.0, CIS v8.1, HIPAA, GDPR
- Event ingestion API: single event POST with inline rule evaluation and SOAR trigger
- Batch event ingestion API: up to 100 events per request with full pipeline processing
- SOAR playbook listing API
- Report download API with CSV (Section,Metric,Value) and JSON export formats
- Scan scheduling via Vercel Cron (every 6 hours)
- Shannon entropy calculation for DNS tunneling detection
- Category compatibility map for flexible rule-to-event matching
- Priority scoring: severity x confidence x asset criticality
- 19 new E2E tests covering event ingestion, rule tuning, AI actions, reports, SOAR, scheduling, dashboard, and full pipeline

**Modified:**
- Updated all 12 seed detection rules with engine-compatible condition format (type field for evaluator dispatch)
- Rewrote AI action execution with proper approval guard and real execution behavior
- Reports now complete synchronously (replaced setTimeout with await)
- Added alert-to-rule tuning feedback: false_positive/resolved status updates increment FP/TP counts
- SOC dashboard auto-refreshes every 30 seconds with "Live" indicator
- Scanner events flow through rule evaluation engine and SOAR after creation
- Compliance automation hook runs after scanner asset updates
- Added assessorType field to ComplianceAssessment schema

---

*Report generated: 2026-03-10*
*Phase 11 implementation: Detection Engine, SOAR, Compliance Automation & Operational Maturity*
*Build: 108 routes | 0 errors | 258 E2E tests*
