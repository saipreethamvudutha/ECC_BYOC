# BYOC - Cybersecurity Platform
## Client Delivery Document

---

## Executive Summary

BYOC (Bring Your Own Cloud) is an enterprise-grade cybersecurity platform designed to serve organizations from 5-person startups to 500-person SOC teams. The platform provides comprehensive security operations including vulnerability management, compliance tracking, SIEM integration, AI-driven security actions, and role-based access control.

---

## Platform Capabilities

### 1. Security Dashboard
- Real-time security posture overview
- 6 key metric cards: Assets, Critical Vulnerabilities, Risk Score, Compliance Score, Open Alerts, AI Actions
- Vulnerability severity breakdown with visual progress bars
- Compliance score overview across all frameworks
- Recent activity feed with actor attribution

### 2. Vulnerability Scanning
- Create and manage security scans (Vulnerability, Port, Compliance, Full Assessment)
- Real-time scan status tracking (Queued -> Running -> Completed)
- Auto-generated vulnerability findings with CVSS scoring
- Scan history with filtering and search

### 3. Asset Management
- Complete IT asset inventory (Servers, Workstations, Network Devices, Cloud Resources, Applications, Databases)
- Asset grouping and tagging
- Criticality classification (Critical, High, Medium, Low)
- Asset group scoping for RBAC

### 4. Compliance Center
- **GDPR** (2016/679) - 10 articles tracked across 6 categories
- **PCI DSS** (v4.0) - 12 requirements across 8 categories
- **HIPAA** (2013) - 11 controls across 3 safeguard types
- Visual compliance scoring with stacked progress bars
- Inline status editing with audit trail
- Category-based filtering
- Assessment history tracking

### 5. SIEM Integration
- Security event ingestion from multiple sources (Firewall, IDS, Endpoint, Cloud, Application)
- Alert management with severity classification
- Event filtering by severity and source
- Alert acknowledgment and escalation workflow

### 6. AI Actions
- AI-driven security action recommendations
- Approval workflow based on risk level
- Action types: Patch, Firewall Rule, Risk Override, SIEM Rule, Scan
- Audit trail linking approver to executed action

### 7. Report Generation
- 4 report templates: Vulnerability, Compliance, Executive Summary, Technical
- Asynchronous generation with real data aggregation
- Report history with status tracking

### 8. Risk Scoring
- Composite risk score calculation
- Breakdown by category: Vulnerability, Compliance, Threat, Coverage
- Severity distribution visualization

---

## Role-Based Access Control (RBAC)

### Built-in Roles
| Role | Access Level | Max Users |
|------|-------------|-----------|
| Super Admin | Full unrestricted access | 2 per org |
| Org Admin | All except billing & org deletion | Unlimited |
| Security Analyst | Scans, assets, SIEM, reports | Unlimited |
| Auditor | Read-only across all modules | Unlimited |
| Viewer | Dashboard & reports only | Unlimited |
| API Service Account | Scoped per key | Unlimited |

### Permission Model
- **102 granular permissions** across 9 modules
- Hierarchical role inheritance (RBAC1)
- Explicit deny overrides inherited grants
- ABAC scoping for enterprise asset group restrictions
- All permission checks are cached (5-minute TTL)

---

## Technical Architecture

### Stack
| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16.1, React 19, TypeScript 5.9 |
| Styling | Tailwind CSS 4.2, Radix UI primitives |
| Backend | Next.js API Routes (server-side) |
| Database | SQLite (dev) / PostgreSQL (production) |
| ORM | Prisma 6.19 |
| Auth | JWT (15-min access + 7-day refresh) |
| Build | Turbopack |

### Database Schema
- **18 tables** with full referential integrity
- Multi-tenant isolation via `tenant_id` on every table
- Append-only audit log
- JSON fields for flexible metadata storage

### API Surface
- **21 API endpoints** covering auth, CRUD, and reporting
- All mutations protected by RBAC permission checks
- Audit logging on every state change

---

## Security Features

- **Deny by default** - every action requires explicit permission grant
- **Least privilege** - users get minimum permissions for their role
- **Tenant isolation** - no cross-tenant data access possible
- **Audit everything** - immutable audit trail on every operation
- **Fail-closed** - if RBAC unavailable, deny all access
- **bcrypt** password hashing (12 rounds)
- **HTTP-only** secure cookies
- **JWT** with short-lived access tokens

---

## Sprint History

| Sprint | Deliverables | Routes | Status |
|--------|-------------|--------|--------|
| Sprint 1 | Foundation: DB schema, RBAC engine, auth, all page shells | 26 | DONE |
| Sprint 2 | CRUD: Scan creation, user invite, asset management | 30 | DONE |
| Sprint 3 | Compliance editing, report generation, enhanced SIEM | 32 | DONE |
| Sprint 4 | API keys, settings polish, final build | 34 | DONE |

---

## Getting Started

### Prerequisites
- Node.js 24+ (LTS)
- npm 11+

### Setup
```bash
# Install dependencies
npm install

# Generate Prisma client & create database
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
| Super Admin | admin@acme.co | Admin123! |
| Security Analyst | priya@acme.co | Admin123! |
| Auditor | amit@acme.co | Admin123! |

### Production Deployment
1. Switch `DATABASE_URL` to PostgreSQL
2. Set secure `AUTH_SECRET` (32+ random chars)
3. Enable HTTPS
4. Configure rate limiting
5. Set up SCIM provisioning for enterprise SSO

---

## Future Roadmap
- SSO integration (Google, Azure AD, Okta)
- SCIM 2.0 user provisioning
- Custom role builder with permission matrix
- Time-bound role assignments
- Real-time WebSocket alerts
- PDF report export
- Dark/light theme toggle
- Mobile responsive optimization
