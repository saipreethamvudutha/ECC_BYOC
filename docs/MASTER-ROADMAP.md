# BYOC Master Roadmap — Phases 13 to 20+

> **For Furix AI / Client Build**
> This document defines every planned feature phase, the development workflow,
> testing standards, and AWS migration plan to make BYOC a top-tier enterprise
> cybersecurity platform.

---

## Development Workflow (MUST FOLLOW FOR EVERY PHASE)

### The BYOC Phase Lifecycle

```
┌─────────────────────────────────────────────────────────────────────┐
│                     BYOC PHASE LIFECYCLE                             │
│                                                                      │
│  1. PLAN         → /new-phase N "Name" "Description"                 │
│                    planner agent designs implementation              │
│                    architect agent reviews design                    │
│                                                                      │
│  2. BUILD        → /orchestrate feature "..."                        │
│                    tdd-guide: write tests FIRST                      │
│                    implement to pass tests                           │
│                    code-reviewer: quality check                      │
│                    security-reviewer: BYOC security check            │
│                    database-reviewer: DB query check                  │
│                                                                      │
│  3. TEST         → /e2e [new feature flows]                          │
│                    playwright test suite (all 258+ tests pass)       │
│                    /test-coverage (target: 80%+ coverage)            │
│                                                                      │
│  4. VERIFY       → /quality-gate                                     │
│                    npx tsc --noEmit (0 errors)                       │
│                    npm run build (clean build)                       │
│                    npm audit (no HIGH+ vulns)                        │
│                                                                      │
│  5. DOCUMENT     → /update-docs                                      │
│                    doc-updater agent: update CHANGELOG.md            │
│                    create docs/PHASE-N-NAME-REPORT.md                │
│                    document all bugs found + fixes applied           │
│                                                                      │
│  6. MERGE        → git commit + PR to master                         │
│                    CI: GitHub Actions runs tests + security scan     │
│                    deploy to Vercel (now) / AWS ECS (future)         │
└─────────────────────────────────────────────────────────────────────┘
```

### Bug Documentation Standard

Every bug found during testing MUST be documented:
```markdown
## Bug #N — [Short Title]
- **Found in:** Phase N implementation
- **Severity:** CRITICAL | HIGH | MEDIUM | LOW
- **Description:** What the bug is
- **Reproduction:** Steps to reproduce
- **Root Cause:** Why it happened
- **Fix Applied:** What was changed (file:line)
- **Test Added:** Name of regression test added
- **Status:** FIXED | DEFERRED | WONT-FIX
```

---

## Phase 13 — PII/PHI Redaction Engine 🔴 PRIORITY

**Rationale:** Enterprise security platforms that handle logs and SIEM events inevitably process personal data. GDPR Art. 5, HIPAA §164.312, and PCI-DSS Req. 3 all require data minimization and protection. This is a compliance differentiator.

**Features:**
- `src/lib/redaction.ts` — Core redaction engine (PII, PHI, PCI-DSS, credentials)
- Automatic redaction in audit log entries before storage
- SIEM event ingestion pipeline: strip PII from raw log messages
- Report export: role-based redaction (Viewers see less than Admins)
- New API: `GET /api/compliance/data-inventory` — list what data types are stored
- New API: `POST /api/users/:id/data-export` — GDPR Article 20 data portability
- New API: `DELETE /api/users/:id/data-erase` — GDPR Article 17 right to erasure
- New page: `/settings/data-privacy` — Data privacy controls dashboard
- New RBAC capability: `privacy.manage` — required for DSAR handling

**Test Plan:** 15 unit tests (redaction patterns), 5 integration tests (audit log clean), 8 E2E tests (DSAR flows)

**Value:** GDPR compliance evidence, HIPAA Business Associate Agreement (BAA) readiness, PCI-DSS data minimization

---

## Phase 14 — Real-Time WebSocket Streaming 🔴 PRIORITY

**Rationale:** A live SOC dashboard is unusable if you need to refresh to see new alerts. Competitors (Splunk, QRadar) stream events in real time. This is table stakes for enterprise buyers.

**Features:**
- WebSocket server via Next.js + `ws` package (or Socket.io)
- `GET /api/siem/stream` — SSE endpoint for SIEM alert feed (simpler, Vercel-compatible)
- Client: `useSiemStream()` hook — subscribes to live alert updates
- SOC dashboard: live alert counter, incident ticker, auto-updating metrics
- Asset status real-time updates (scan progress)
- Redis Pub/Sub for horizontal scaling (required for ECS multi-instance)

**Test Plan:** 6 unit tests (event emitter), 4 integration tests (SSE endpoint), 10 E2E tests (live dashboard behavior)

**Value:** Real-time SOC operations, competitive parity with enterprise SIEM products

---

## Phase 15 — PDF Report Generation 🟡 HIGH PRIORITY

**Rationale:** Every security engagement ends with a report. Clients need branded PDF deliverables for board presentations, audits, and compliance evidence. CSV/JSON exports exist but PDFs are required for executive consumption.

**Features:**
- `src/lib/pdf-generator.ts` — PDF generation using `@react-pdf/renderer`
- Report types: Vulnerability Assessment, Compliance Summary, Executive Report, Incident Report
- Company branding: logo, colors, header/footer (configurable per tenant)
- Charts: severity distribution (pie), compliance score (gauge), risk trend (line)
- New API: `GET /api/reports/:id/download?format=pdf`
- Report scheduling: cron-based automated PDF delivery via Resend
- Signature/watermark support for confidential reports

**Test Plan:** 4 unit tests (template rendering), 2 integration tests (PDF generation), 6 E2E tests (download flows)

**Value:** Client-ready deliverables, replaces manual report creation, enterprise sales differentiator

---

## Phase 16 — Threat Intelligence Feed Integration 🟡 HIGH PRIORITY

**Rationale:** Raw SIEM events become actionable when enriched with threat context. IoC matching against MISP/OTX feeds turns an alert from "suspicious connection" to "known C2 infrastructure — APT28".

**Features:**
- `src/lib/threat-intel/` — Threat intel engine
- Feed sources: AlienVault OTX (free), MISP (self-hosted), AbuseIPDB (paid tier)
- IoC types: IP addresses, domains, file hashes, URLs
- New DB model: `ThreatIntelIndicator` — IoC database with confidence scores
- New API: `POST /api/threat-intel/sync` — Pull latest feeds (cron-triggered)
- SIEM event enrichment: auto-enrich IPs/domains in events at ingestion
- Alert enhancement: show threat intel match in alert detail view
- New dashboard widget: "Active Threats" with IoC hit count
- MITRE ATT&CK enrichment: map indicators to technique IDs

**Test Plan:** 8 unit tests (IoC matching engine), 4 integration tests (feed sync), 10 E2E tests (enriched alerts)

**Value:** Threat context transforms raw alerts into actionable intelligence. Major competitive differentiator.

---

## Phase 17 — Custom Compliance Framework Builder 🟡 HIGH PRIORITY

**Rationale:** Every industry has unique compliance requirements. Healthcare clients need ISO 27001. Financial clients need SOX. Defense contractors need CMMC. Currently BYOC supports only 5 hardcoded frameworks. Custom builder unlocks every vertical market.

**Features:**
- New DB model: `CustomComplianceFramework` — user-defined frameworks
- New DB model: `CustomComplianceControl` — user-defined controls with mappings
- New page: `/compliance/builder` — drag-and-drop framework builder
- Framework import: parse uploaded JSON/CSV framework definitions
- Cross-framework mapping: map controls between frameworks (e.g., CIS → NIST)
- Framework export: download as JSON, CSV, or PDF
- New API: `POST /api/compliance/frameworks/import`
- New API: `GET /api/compliance/frameworks/export/:id`
- Pre-built framework templates: ISO 27001, SOX ITGCs, CMMC Level 2, FedRAMP Moderate

**Test Plan:** 10 unit tests (parser, mapper), 6 integration tests (CRUD), 12 E2E tests (builder UI flows)

**Value:** Unlocks every compliance vertical. Turns BYOC from "5 frameworks" to "unlimited frameworks".

---

## Phase 18 — AWS Production Deployment 🟡 HIGH PRIORITY

**Rationale:** Vercel Hobby plan has limitations: 10-second function timeout, no persistent WebSockets, no dedicated PostgreSQL, daily cron limit. AWS on ECS Fargate removes all these constraints and provides enterprise-grade SLA.

**Features:**
- `Dockerfile` — Production Next.js container with standalone output
- `.github/workflows/deploy.yml` — GitHub Actions CI/CD to AWS ECS
- Terraform/CDK IaC: `infra/` — VPC, ECS Fargate, RDS PostgreSQL Multi-AZ, ALB, WAF, CloudFront
- `src/app/api/health/route.ts` — Enhanced health check (DB ping, Redis ping, version)
- ElastiCache Redis integration: session store, rate limiting, Redis Pub/Sub for WebSockets
- Secrets Manager integration: replace `.env.local` with AWS Secrets Manager
- CloudWatch dashboards: request latency, error rates, DB connections, scan queue depth
- GuardDuty: enable for threat detection on AWS resources

**Test Plan:** Smoke tests post-deploy, load testing with k6, chaos testing (kill task, failover RDS)

**Value:** Enterprise SLA (99.9% uptime), no serverless limitations, production-ready for enterprise sales.

---

## Phase 19 — Advanced UEBA (User & Entity Behavior Analytics) 🟢 MEDIUM

**Rationale:** Signature-based detection (current SIEM) misses insider threats and novel attacks. UEBA builds behavioral baselines and alerts on anomalies — the core of modern threat detection.

**Features:**
- `src/lib/ueba/` — UEBA engine
- Behavioral profiles: per-user and per-entity baselines (login times, data access, API usage)
- Anomaly models: time-of-day, access volume, geo-velocity, peer-group comparison
- Risk scoring: per-user dynamic risk score (0-100), updated on each event
- Watchlist: flag users for elevated monitoring
- New SIEM alert type: `ueba.anomaly` with baseline deviation details
- Integration with SOAR: auto-trigger investigation for high-risk score users
- New API: `GET /api/siem/ueba/profiles` — User behavioral profiles
- New API: `GET /api/siem/ueba/risk-scores` — Current risk scores

**Test Plan:** 15 unit tests (baseline models), 8 integration tests (risk scoring), 10 E2E tests (watchlist UI)

**Value:** Detects insider threats and account compromise that rules-based SIEM misses. Positions BYOC against enterprise UEBA tools.

---

## Phase 20 — Asset Discovery Automation (Cloud-Native) 🟢 MEDIUM

**Rationale:** Manual asset creation doesn't scale. Enterprise clients have 10,000+ assets across AWS, Azure, GCP. Automated discovery is required for continuous asset inventory.

**Features:**
- `src/lib/cloud-discovery/` — Cloud API connectors
- AWS integration: EC2, RDS, ECS, Lambda, S3 buckets (via AWS SDK with read-only IAM role)
- Azure integration: VMs, App Services, SQL databases (via Azure REST API)
- GCP integration: Compute Engine, Cloud SQL (via GCP client libraries)
- Discovery scheduling: cron-based with configurable intervals
- Change detection: alert when new assets appear or disappear
- Asset auto-tagging from cloud tags/labels
- New API: `POST /api/assets/discover` — trigger cloud discovery run
- New API: `GET /api/assets/discovery-history` — discovery run history

**Test Plan:** Mock AWS/Azure/GCP SDK calls, 20 unit tests, 8 E2E tests

**Value:** Eliminates manual asset management. Full asset visibility across hybrid cloud environments.

---

## Phase 21 — Mobile App (React Native) 🟢 MEDIUM

**Rationale:** SOC analysts need to respond to critical alerts on-the-go. A mobile app with push notifications enables 24/7 incident response.

**Features:**
- React Native (Expo) mobile app
- Push notifications for CRITICAL/HIGH SIEM alerts
- Incident management: view, update, assign incidents
- Dashboard summary: risk score, open alerts, top vulnerabilities
- Biometric authentication (Face ID, fingerprint) + TOTP MFA
- Offline capability for incident notes

---

## Phase 22 — Marketplace & API Platform 🟢 MEDIUM

**Rationale:** Enterprise security platforms monetize through integrations. An open API platform with webhook support turns BYOC into a platform, not just a product.

**Features:**
- Public REST API with API key authentication (already built — Phase 4)
- GraphQL endpoint for flexible data querying
- Webhook delivery: `POST /api/webhooks` — subscribe to SIEM alerts, scan completions
- Developer portal: API documentation (auto-generated from OpenAPI spec)
- Integration marketplace: pre-built connectors (Slack, PagerDuty, Jira, ServiceNow)
- Rate limiting tiers: free (1000 req/day), pro (10K/day), enterprise (unlimited)

---

## Testing Standards (All Phases)

### Required Test Coverage Per Feature

| Layer | Tool | Minimum Coverage |
|-------|------|-----------------|
| Unit tests | Vitest/Jest | 80% of new utility functions |
| Integration tests | Supertest/next-test | All new API routes (happy + error paths) |
| E2E tests | Playwright | All new user flows |
| Security tests | npm audit | 0 HIGH+ vulnerabilities |
| Type check | tsc --noEmit | 0 errors |
| Build check | npm run build | Clean build |

### Bug Severity → Action

| Severity | Action |
|----------|--------|
| CRITICAL | Block deployment. Fix immediately. |
| HIGH | Fix before phase completion. |
| MEDIUM | Document + fix in current phase if time allows. |
| LOW | Add to backlog. |

### E2E Test Baseline (Must Never Regress)

Current: **258 tests**. Every phase must:
1. Not break any existing test
2. Add tests for every new user flow
3. Target: **+10-20 tests per phase**

---

## Priority Queue (What to Build Next)

```
IMMEDIATE (Phase 13-14):
┌─────────────────────────────────────────────────────┐
│ Phase 13: PII/PHI Redaction Engine                  │  ← COMPLIANCE CRITICAL
│ Phase 14: WebSocket Real-Time Streaming             │  ← UX CRITICAL
└─────────────────────────────────────────────────────┘

SHORT TERM (Phase 15-17):
┌─────────────────────────────────────────────────────┐
│ Phase 15: PDF Report Generation                     │  ← CLIENT DELIVERABLES
│ Phase 16: Threat Intelligence Feeds                 │  ← SIEM VALUE-ADD
│ Phase 17: Custom Compliance Framework Builder       │  ← MARKET EXPANSION
└─────────────────────────────────────────────────────┘

INFRASTRUCTURE (Phase 18):
┌─────────────────────────────────────────────────────┐
│ Phase 18: AWS Production Deployment                 │  ← PRODUCTION READINESS
└─────────────────────────────────────────────────────┘

MEDIUM TERM (Phase 19-20):
┌─────────────────────────────────────────────────────┐
│ Phase 19: UEBA — Behavioral Analytics               │  ← ADVANCED DETECTION
│ Phase 20: Cloud Asset Auto-Discovery                │  ← SCALE
└─────────────────────────────────────────────────────┘
```

---

## Current State Summary

| Metric | Current | Phase 20 Target |
|--------|---------|----------------|
| API Routes | 108 | 160+ |
| E2E Tests | 258 | 400+ |
| DB Models | 27 | 38+ |
| RBAC Capabilities | 54 | 70+ |
| Compliance Frameworks | 5 hardcoded | Unlimited (custom builder) |
| Scanner Modules | 8 | 12+ |
| SIEM Detection Rules | 12 | 30+ |
| Deployment | Vercel Hobby | AWS ECS Fargate Multi-AZ |
| PII Protection | None | Full GDPR/HIPAA/PCI-DSS |
| Real-time Events | Polling | WebSocket/SSE streaming |

---

*Last updated: 2026-03-16 — Phase 12B complete*
