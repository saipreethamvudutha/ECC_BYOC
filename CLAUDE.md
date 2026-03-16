# CLAUDE.md — BYOC Security Platform

> This file guides Claude Code when working in this repository.
> **Read this fully before making any changes.**

## Project Overview

**BYOC** is an enterprise cybersecurity SaaS platform built for **Furix AI's client** base.
It is a unified security operations platform combining:
- **Vulnerability Management** — built-in scanner + Nmap enterprise engine
- **GRC / Compliance** — GDPR, PCI DSS, HIPAA, CIS Controls v8.1, NIST CSF 2.0
- **SIEM** — event ingestion, alert triage, incident management, MITRE ATT&CK mapping
- **SOAR** — automated playbook execution (critical alert escalation, brute force response, ransomware isolation)
- **Enterprise IAM** — RBAC v2, MFA (TOTP), SSO (OAuth2 PKCE), SCIM 2.0, audit log with SHA-256 hash chain

**Live URL:** https://byoc-rosy.vercel.app
**Current Phase:** Phase 12B (Grouped Scan Results + Selective Asset Onboarding)
**Stack:** Next.js 16, React 19, TypeScript 5.9, Prisma 6, PostgreSQL (Railway), Tailwind CSS 4, Radix UI, Vercel

---

## Core Principles (MUST FOLLOW)

1. **Security-first** — This IS a security product. Every endpoint must have auth + RBAC checks.
2. **Tenant isolation** — Every DB query MUST include `tenantId` filter. No cross-tenant data access.
3. **Audit everything** — All state-changing operations must call `createAuditLog()` from `src/lib/audit.ts`.
4. **Fail closed** — If RBAC is unavailable, deny all access. Never default to open.
5. **Immutability** — Use spread operators, never mutate objects directly.
6. **Agent-first** — Delegate to specialized agents for complex tasks.

---

## Project Structure

```
src/
├── app/
│   ├── (auth)/          — Public auth pages (login, accept-invitation)
│   ├── (dashboard)/     — Protected dashboard pages (20 routes)
│   └── api/             — 108+ REST API route handlers
├── components/
│   ├── layout/          — sidebar.tsx, topbar.tsx, providers.tsx
│   ├── rbac/            — Gate.tsx, PageGate.tsx (capability guards)
│   └── ui/              — Radix UI primitives (badge, button, card, dialog, input)
├── hooks/               — useCapabilities hook
├── lib/                 — Core business logic
│   ├── auth.ts          — JWT authentication, session management
│   ├── rbac.ts          — Two-axis RBAC engine
│   ├── capabilities.ts  — 54 capability definitions
│   ├── audit.ts         — createAuditLog() — MUST USE for all mutations
│   ├── security.ts      — Account lockout, device parsing
│   ├── api-key-auth.ts  — API key auth + rate limiting
│   ├── encryption.ts    — AES-256-GCM with PBKDF2
│   ├── totp.ts          — TOTP MFA, QR codes, backup codes
│   ├── oauth.ts         — OAuth 2.0 PKCE (Google, Azure AD, Okta)
│   ├── scim.ts          — SCIM 2.0 schema mapping
│   ├── email.ts         — Resend email integration
│   ├── prisma.ts        — Singleton Prisma client (import from here)
│   ├── scanner/         — Vulnerability scanner engine (8 modules)
│   ├── siem/            — SIEM detection rules engine
│   ├── soar/            — SOAR playbook orchestrator
│   └── compliance/      — Compliance framework logic
├── middleware.ts         — JWT auth + CSRF protection
└── types/               — TypeScript interfaces (index.ts, siem.ts)

prisma/
├── schema.prisma         — 27 data models (all with tenantId)
└── seed.ts               — Seed data with demo tenant

docs/                     — Phase reports, test plans, client docs
tests/                    — Playwright E2E tests (258 tests)
```

---

## Database Schema (Key Models)

Always use `tenantId` in every query:

```typescript
// ALWAYS filter by tenantId
const assets = await prisma.asset.findMany({
  where: { tenantId: user.tenantId, ...otherFilters }
})

// NEVER omit tenantId — this is a security violation
const assets = await prisma.asset.findMany() // WRONG
```

**Core Models:**
- `Tenant` — Organization root; all data hangs off tenantId
- `User` — Auth: local/google/azure_ad/okta; MFA: TOTP; status: active/invited/suspended/deactivated
- `Role` / `UserRole` / `Capability` / `RoleCapability` — RBAC v2
- `Tag` / `UserScope` / `Scope` / `AutoTagRule` — Tag-based data scoping
- `Asset` — 12 types; criticality; network/hardware/software metadata
- `Scan` / `ScanResult` — Vulnerability scanner; 8 modules; chunked execution
- `ComplianceFramework` / `ComplianceControl` / `ComplianceAssessment` — 5 frameworks, 73 controls
- `SiemEvent` / `SiemAlert` / `SiemRule` / `SiemIncident` — Full SIEM stack
- `AiAction` — AI-suggested security actions with approval workflow
- `AuditLog` — Append-only with SHA-256 hash chain
- `Session` — Device tracking, IP tracking, revocable
- `SSOProvider` / `SCIMToken` — Enterprise IAM

---

## Authentication Pattern

All protected API routes follow this pattern:

```typescript
import { getAuthenticatedUser } from '@/lib/auth'
import { hasCapability } from '@/lib/rbac'
import { createAuditLog } from '@/lib/audit'

export async function POST(request: NextRequest) {
  // 1. Authenticate
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 2. Authorize (RBAC capability check)
  const canDoThing = await hasCapability(user.id, 'capability_name', user.tenantId)
  if (!canDoThing) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // 3. Validate input
  const body = await request.json()
  // ... validate

  // 4. Business logic with tenant isolation
  const result = await prisma.model.create({
    data: { tenantId: user.tenantId, ...data }
  })

  // 5. Audit log (REQUIRED for all mutations)
  await createAuditLog({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'action.created',
    resource: 'ModelName',
    resourceId: result.id,
    severity: 'info',
    category: 'data',
    details: { /* relevant fields */ }
  })

  return NextResponse.json(result, { status: 201 })
}
```

---

## RBAC Capabilities (54 total)

Key capability groups:
- `admin.*` — org management, user/role management, API key management
- `scan.*` — scan.create, scan.read, scan.execute, scan.delete, scan.export
- `asset.*` — asset.create, asset.read, asset.update, asset.delete, asset.tag
- `compliance.*` — compliance.read, compliance.update, compliance.export
- `siem.*` — siem.read, siem.write, siem.alert.manage, siem.incident.manage, siem.rules.manage
- `ai.*` — ai.actions.read, ai.actions.approve
- `audit.*` — audit.read, audit.export
- `soar.*` — soar.read, soar.execute

**Built-in roles:** Platform Admin, Org Admin, Security Analyst, Auditor, Viewer, Remediation User, API Service Account

---

## Key Commands

```bash
npm run dev           # Start dev server (Turbopack)
npm run build         # prisma generate + next build
npm run db:push       # Apply schema to DB (dev)
npm run db:seed       # Seed demo data
npm run db:studio     # Open Prisma Studio
npx playwright test   # Run E2E tests (258 tests)
```

**Environment Variables Required:**
```
DATABASE_URL          # PostgreSQL connection string (Railway)
JWT_SECRET            # JWT signing secret (min 32 chars)
RESEND_API_KEY        # Email service
NEXT_PUBLIC_APP_URL   # App URL for OAuth callbacks
ENCRYPTION_KEY        # AES-256-GCM key for sensitive data
```

---

## API Design Conventions

- All routes return `{ error: string }` on failure with appropriate HTTP status
- Tenant isolation: always filter by `tenantId` from authenticated user
- Pagination: use `page` + `limit` params; return `{ data, total, page, limit }`
- Mutations require `canXxx` capability check before proceeding
- All mutations write to audit log
- Exports return CSV or JSON based on `?format=csv|json` query param

---

## SIEM Architecture

Event flow: `POST /api/siem/events` → normalization → detection engine → alert generation → incident escalation

Detection engine has 12 MITRE ATT&CK-mapped rules with 11 evaluator types:
- threshold, sequence, correlation, anomaly, regex, exists, count, rate, range, geolocation, behavioral

SOAR playbooks run via `/api/soar/playbooks` — 3 built-in:
1. Critical Alert Auto-Escalation
2. Brute Force Response
3. Ransomware Isolation

---

## Scanner Architecture

Built-in scanner (no external deps) runs 8 check modules via chunked execution:
1. HTTP headers analysis
2. SSL/TLS certificate inspection
3. Port scanning (Node.js sockets)
4. Exposed admin panels detection
5. Information disclosure check
6. Common CVEs (~50 real CVEs with CVSS scores)
7. DNS misconfiguration
8. Cloud misconfiguration

Enterprise Nmap scanner: `/api/scans/[id]/execute` with Nmap integration via Node.js socket API.
Chunked model: 2 checks per invocation, <7s per chunk (Vercel 10s timeout compliance).

---

## Testing

**Playwright E2E:** 258 tests in `tests/` directory
```bash
npx playwright test                            # All tests
npx playwright test tests/auth.spec.ts         # Specific file
npx playwright test --headed                   # Visual mode
npx playwright test --debug                    # Debug mode
```

Key test files: auth, rbac, assets, scans, compliance, siem, settings, reports

---

## Deployment

- **Platform:** Vercel (auto-deploy from `master` branch)
- **Database:** Railway PostgreSQL
- **Email:** Resend
- **Cron:** Vercel Cron (daily — Hobby plan limit) at `/api/cron/scan-scheduler`

---

## Security Hardening (Already Implemented)

- bcrypt password hashing (12 rounds)
- HTTP-only secure cookies (`byoc_token`)
- JWT short-lived access tokens
- Account lockout (5 failed attempts → 15 min)
- CSRF protection in middleware (Origin/Referer validation)
- Rate limiting on auth endpoints
- API key hashing with bcrypt
- AES-256-GCM encryption for sensitive TOTP secrets
- SCIM token hashing
- SHA-256 hash chain audit integrity
- Input sanitization on all API boundaries

---

## Current Phase Status

| Phase | Feature | Status |
|-------|---------|--------|
| 1-4 | Foundation, RBAC, compliance, API keys | DONE |
| 5-6 | GRC, SSO, MFA, SCIM | DONE |
| 7-9 | Scanner engine, asset discovery, inventory | DONE |
| 10-11 | SIEM, detection engine, SOAR | DONE |
| 12A-B | Enterprise Nmap, grouped results, selective onboarding | DONE |

**Next planned features:**
- WebSocket real-time event streaming
- PDF report export with branding
- Threat intelligence feed integration
- Custom compliance framework builder
- Mobile responsive optimization
- Dark/light theme toggle

---

## Agent Usage Guide

Use these agents proactively:

| Task | Agent to Use |
|------|-------------|
| New feature design | `planner` → `architect` |
| Auth/API/RBAC code | `security-reviewer` after writing |
| DB queries / schema | `database-reviewer` |
| E2E tests | `e2e-runner` |
| TypeScript errors | `build-error-resolver` |
| Code quality | `code-reviewer` |
| Write tests first | `tdd-guide` |
| Dead code cleanup | `refactor-cleaner` |
| Update docs/changelog | `doc-updater` |
| SIEM autonomous monitoring | `loop-operator` |
| Complex feature | `/orchestrate feature <description>` |
| Security audit | `/orchestrate security <description>` |
| New phase kickoff | `/new-phase N "Name" "Description"` |
| Full development cycle | See BYOC Phase Lifecycle below |

## BYOC Phase Lifecycle (Development Workflow)

Every new feature/phase MUST follow this exact sequence:

```
1. /new-phase N "Name" "Desc"     → plan + architecture
2. /tdd                           → write tests FIRST (red)
3. implement feature              → make tests pass (green)
4. /code-review                   → quality check
5. /security-audit new            → BYOC security check
6. /e2e [new flows]               → generate + run E2E tests
7. /quality-gate                  → tsc + build + audit
8. /update-docs                   → changelog + phase report
9. commit + PR to master          → CI runs + deploys
```

**Never skip steps 4, 5, 6, or 7.** Every phase ships with:
- 0 TypeScript errors
- Clean production build
- New E2E tests covering the feature
- Phase report in `docs/PHASE-N-NAME-REPORT.md`
- CHANGELOG.md updated

## Slash Commands Available

| Command | Purpose |
|---------|---------|
| `/orchestrate [type] [desc]` | Chain agents: feature/bugfix/refactor/security/phase |
| `/new-phase N "Name" "Desc"` | Start a new BYOC phase with docs + planning |
| `/tdd` | Write tests first, then implement |
| `/e2e [flow]` | Generate + run Playwright E2E tests |
| `/build-fix` | Fix TypeScript/build errors (minimal diffs) |
| `/security-audit [scope]` | Full BYOC security checklist |
| `/code-review` | Code quality review |
| `/quality-gate` | tsc + build + audit check |
| `/refactor-clean` | Dead code cleanup |
| `/update-docs` | Update CHANGELOG.md + docs |
| `/test-coverage` | Check test coverage report |
| `/checkpoint` | Save session state |
| `/learn` | Extract patterns from this session |

## Skills Available

| Skill | Trigger |
|-------|---------|
| `pii-redaction` | Any feature processing user emails, names, or health data |
| `security-review` | Any auth, API, or input handling code |
| `security-scan` | Before any release |
| `backend-patterns` | New API routes, middleware, service layers |
| `api-design` | Designing new REST endpoints |
| `postgres-patterns` | PostgreSQL queries, indexes, RLS |
| `database-migrations` | Schema changes, zero-downtime migrations |
| `frontend-patterns` | React components, Next.js pages |
| `e2e-testing` | Writing Playwright tests |
| `tdd-workflow` | Test-driven feature development |
| `deployment-patterns` | Docker, CI/CD, AWS deployment |
| `docker-patterns` | Containerization, Docker Compose |
| `aws-deployment` | AWS ECS, RDS, WAF, CloudFront setup |
| `enterprise-agent-ops` | Long-lived workloads, SIEM monitoring |
| `verification-loop` | Pre-release verification |
| `agentic-engineering` | Cost-aware model routing, eval-first |

---

## Common Patterns & Anti-Patterns

### DO:
```typescript
// Correct: tenant-isolated query
const scans = await prisma.scan.findMany({
  where: { tenantId: user.tenantId, status: 'completed' }
})

// Correct: capability check before action
const canExecute = await hasCapability(user.id, 'scan.execute', user.tenantId)
if (!canExecute) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

// Correct: audit log on mutation
await createAuditLog({ tenantId, userId, action: 'scan.executed', ... })
```

### DON'T:
```typescript
// WRONG: Missing tenantId (security violation)
const scans = await prisma.scan.findMany({ where: { status: 'completed' } })

// WRONG: No capability check
export async function DELETE(req) {
  await prisma.user.delete({ where: { id } }) // no auth check!
}

// WRONG: No audit log on sensitive mutation
await prisma.role.update({ ... }) // missing audit
```

---

## File Size Guidelines

- API routes: 100–300 lines typical
- Components: 100–400 lines typical, 800 max
- Lib files: split by concern, keep focused
- Never exceed 800 lines per file — extract to modules

---

## Docs Folder

All feature documentation goes in `docs/` following the naming pattern:
`PHASE-{N}-{FEATURE-NAME}-REPORT.md`

Always update `CHANGELOG.md` when completing a feature phase.
