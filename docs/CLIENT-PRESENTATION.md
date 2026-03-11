# BYOC - Cybersecurity Platform
## Client Delivery Document

**Last Updated:** 2026-03-10
**Current Build:** 108 routes, 258 E2E tests, 0 TypeScript errors
**Deployment:** https://byoc-rosy.vercel.app

---

## Executive Summary

BYOC (Bring Your Own Cloud) is an enterprise-grade cybersecurity platform designed to serve organizations from 5-person startups to 500-person SOC teams. The platform provides comprehensive security operations including vulnerability scanning with automated detection, GRC compliance across 5 frameworks, a fully operational SIEM with detection engine and SOAR automation, AI-driven security actions, and enterprise-grade RBAC with tag-based data scoping.

---

## Platform Capabilities

### 1. Security Dashboard
- Real-time security posture overview
- 6 key metric cards: Assets, Critical Vulnerabilities, Risk Score, Compliance Score, Open Alerts, AI Actions
- Vulnerability severity breakdown with visual progress bars
- Compliance score overview across all 5 frameworks
- Recent activity feed with actor attribution

### 2. Vulnerability Scanner Engine
- 8 check modules: SSL/TLS, open ports, HTTP headers, DNS, sensitive files, server info, CVE lookup, CMS detection
- ~50 CVE vulnerability database with CVSS scoring
- Chunked execution (2 checks/batch, <7s) for serverless compatibility
- Scan detail pages with findings, severity stats, and remediation guidance
- Automated scan scheduling via Vercel Cron (every 6 hours)
- Scanner findings auto-update compliance controls across 5 frameworks

### 3. Asset Management
- 12 asset types: Servers, Workstations, Network Devices, Cloud Resources, Applications, Databases
- OS fingerprinting, service detection, network discovery, cloud inventory
- Serial numbers, physical locations, installed software, user accounts
- Asset grouping and tagging with auto-tag rules
- Criticality classification (Critical, High, Medium, Low)
- Asset group scoping for RBAC

### 4. Compliance Center (GRC)
- **5 frameworks, 73 controls:**
  - **GDPR** (2016/679) -- 10 articles across 6 categories
  - **PCI DSS** (v4.0) -- 12 requirements across 8 categories
  - **HIPAA** (2013) -- 11 controls across 3 safeguard types
  - **CIS v8.1** -- 18 controls across 5 implementation groups
  - **NIST CSF 2.0** -- 22 controls across 6 functions
- Visual compliance scoring with stacked progress bars
- Assessment history tracking with evidence attachments
- **Automated compliance:** Scanner findings auto-map to controls across all 5 frameworks
- Framework management (enable/disable)
- CSV/JSON export

### 5. Enterprise SIEM / SOC Operations Center
- **Event Ingestion:** POST /api/siem/events (single) and /batch (up to 100)
- **Detection Engine:** 12 MITRE ATT&CK-mapped rules with 11 evaluator types
  - threshold, sequence, process_match, process_access, network_process
  - geo_velocity, dns_anomaly, volume_threshold, beacon_detection
  - iam_policy, ransomware_pattern
- **Alert Lifecycle:** open > triaging > investigating > contained > resolved > closed
- **SOAR Playbooks:** 3 automated playbooks
  - Critical Alert Auto-Escalation
  - Brute Force Response
  - Ransomware Isolation
- **Incident Management:** SLA tracking, timeline entries, alert linkage
- **SOC Dashboard:** 5 tabs (Overview, Alert Queue, Incidents, Detection Rules, Threat Hunting)
- **Metrics:** MTTD, MTTR, open alerts, alerts by status/severity
- **Auto-refresh:** 30-second polling with live indicator
- **Alert Tuning:** FP/TP feedback loop updates rule accuracy scores

### 6. AI Actions
- AI-driven security action recommendations
- Approval workflow: pending > approved > executed (or rejected)
- **Real execution:** Creates scans, SIEM rules, or firewall events
- Action types: Remediation, Scan, Firewall Rule, SIEM Rule, Risk Override
- Audit trail linking approver to executed action

### 7. Report Generation & Export
- 4 report templates: Vulnerability, Compliance, Executive Summary, Technical
- **Synchronous generation** with real data aggregation
- **CSV/JSON export** via /api/reports/{id}/download?format=csv|json
- Report history with status tracking

### 8. Risk Scoring
- Composite risk score calculation
- Breakdown by category: Vulnerability, Compliance, Threat, Coverage
- Severity distribution visualization

### 9. Enterprise SSO, MFA & SCIM 2.0
- TOTP-based MFA with QR code enrollment
- SSO/OAuth provider management (Google, Azure AD, Okta)
- SCIM 2.0 user and group provisioning
- Identity settings management UI

---

## Role-Based Access Control (RBAC)

### Built-in Roles (7)
| Role | Capabilities | Access Level |
|------|-------------|-------------|
| Platform Administrator | 54 | Full unrestricted access |
| Organization Administrator | 53 | All except billing & org deletion |
| Security Analyst | 31 | Scans, assets, SIEM, compliance, reports |
| Auditor | 20 | Read-only across all modules |
| Viewer | 4 | Dashboard & reports only |
| Remediation User | 6 | Limited scan and asset access |
| API Service Account | 8 | Scoped per API key |

### Permission Model
- **54 granular capabilities** across 9 modules
- Two-axis model: capability checks + tag-based data scoping
- Deny-wins conflict resolution
- Multi-role cumulative assignment
- Custom role creation with capability selection
- All permission checks enforce tenant isolation

---

## Technical Architecture

### Stack
| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16.1.6, React 19, TypeScript 5.9 |
| Styling | Tailwind CSS 4.2, Radix UI primitives |
| Backend | Next.js API Routes (server-side) |
| Database | PostgreSQL (Railway) |
| ORM | Prisma 6.19.2 |
| Auth | JWT with bcrypt, HTTP-only secure cookies |
| Build | Turbopack |
| Deployment | Vercel (auto-deploy from master) |
| Email | Resend (transactional invitation emails) |

### Database Schema
- **25+ tables** with full referential integrity
- Multi-tenant isolation via `tenantId` on every table
- SIEM: events, alerts, incidents, rules with ECS normalization
- Append-only audit log with SHA-256 hash chain integrity
- JSON fields for flexible metadata storage

### API Surface
- **108 API routes** covering auth, CRUD, SIEM, compliance, scanning, and reporting
- All mutations protected by RBAC capability checks
- Centralized audit logging on every state change

---

## Security Features

- **Deny by default** -- every action requires explicit capability grant
- **Least privilege** -- users get minimum capabilities for their role
- **Tenant isolation** -- no cross-tenant data access possible
- **Audit everything** -- immutable audit trail with SHA-256 hash chain
- **Fail-closed** -- if RBAC unavailable, deny all access
- **bcrypt** password hashing (12 rounds)
- **HTTP-only** secure cookies
- **JWT** with short-lived access tokens
- **Account lockout** after 5 failed login attempts
- **Rate limiting** on authentication endpoints
- **TOTP MFA** with backup codes

---

## Implementation History

| Phase | Deliverables | Routes | E2E Tests | Status |
|-------|-------------|--------|-----------|--------|
| Sprint 1-4 | Foundation, CRUD, compliance, API keys | 34 | -- | DONE |
| Phase 1 | Core RBAC v2 engine | 36 | 9 | DONE |
| Phase 2 | Tag-based data scoping | 40 | 32 | DONE |
| Phase 3 | User & role management UI | 45 | 59 | DONE |
| Phase 4 | Audit & security hardening | 50 | 89 | DONE |
| Phase 5 | GRC & compliance (5A + 5B) | 60 | 123 | DONE |
| Phase 6 | Enterprise SSO, MFA & SCIM 2.0 | 72 | 171 | DONE |
| Phase 7 | Vulnerability scanner engine | 80 | 196 | DONE |
| Phase 8 | Enterprise asset discovery | 85 | 213 | DONE |
| Phase 9 | Asset inventory enhancement | 90 | 219 | DONE |
| Phase 10 | Enterprise SIEM / SOC Operations Center | 103 | 239 | DONE |
| Phase 11 | Detection engine, SOAR, compliance automation | 108 | 258 | DONE |

---

## Getting Started

### Prerequisites
- Node.js 24+ (LTS)
- npm 11+

### Setup
```bash
# Install dependencies
npm install

# Generate Prisma client & push schema
npx prisma generate
npx prisma db push

# Seed demo data
npx tsx prisma/seed.ts

# Start development server
npm run dev
```

### Demo Credentials
| Role | Email | Password |
|------|-------|----------|
| Platform Administrator | admin@exargen.com | Admin123! |
| Security Analyst | analyst@exargen.com | Analyst123! |
| Auditor | auditor@exargen.com | Auditor123! |
| Viewer | viewer@exargen.com | Viewer123! |
| Org Administrator | orgadmin@exargen.com | OrgAdmin123! |

### Production Deployment
1. Set `DATABASE_URL` to PostgreSQL connection string
2. Set secure `AUTH_SECRET` (32+ random chars)
3. Set `RESEND_API_KEY` for invitation emails
4. Set `NEXT_PUBLIC_APP_URL` for production URL
5. Configure Vercel Cron for scan scheduling
6. Enable HTTPS (automatic on Vercel)

---

## Seed Data Summary

| Data | Count |
|------|-------|
| Capabilities | 54 |
| Roles | 7 built-in |
| Users | 5 (1 admin + 4 demo) |
| Assets | 12 |
| Tags | 11 |
| Scopes | 6 |
| Scans | 4 |
| Findings | 38 |
| SIEM Rules | 12 (MITRE ATT&CK-mapped) |
| SIEM Events | 47 (ECS-normalized) |
| Alerts | 25 |
| Incidents | 5 |
| AI Actions | 8 |
| Compliance Frameworks | 5 (73 controls) |
| Audit Events | 15 (hash-chained) |

---

## Future Roadmap
- Real-time WebSocket event streaming
- PDF report export with branding
- Threat intelligence feed integration
- Custom compliance framework builder
- Dark/light theme toggle
- Mobile responsive optimization
- Multi-factor authentication enforcement policies
- Automated vulnerability remediation workflows
