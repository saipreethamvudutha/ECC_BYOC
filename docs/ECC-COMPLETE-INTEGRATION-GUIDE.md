# Everything Claude Code (ECC) — Complete Integration Guide for BYOC

> **Document Type:** Enterprise Integration Reference
> **Prepared by:** BYOC Engineering Team (Furix AI)
> **Version:** 2.0
> **Last Updated:** 2026-03-17
> **Repository:** https://github.com/saipreethamvudutha/ECC_BYOC
> **ECC Source:** https://github.com/affaan-m/everything-claude-code

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [What is ECC?](#2-what-is-ecc)
3. [Integration Architecture](#3-integration-architecture)
4. [Agents — Specialized AI Sub-Processes](#4-agents--specialized-ai-sub-processes)
5. [Commands — Slash Command Workflows](#5-commands--slash-command-workflows)
6. [Skills — Deep Domain Knowledge](#6-skills--deep-domain-knowledge)
7. [Rules — Always-On Enforcement](#7-rules--always-on-enforcement)
8. [Contexts — Execution Modes](#8-contexts--execution-modes)
9. [BYOC-Custom Extensions](#9-byoc-custom-extensions)
10. [Phase Lifecycle with ECC](#10-phase-lifecycle-with-ecc)
11. [Before vs. After ECC](#11-before-vs-after-ecc)
12. [Implementation Status Matrix](#12-implementation-status-matrix)
13. [Security Impact Assessment](#13-security-impact-assessment)
14. [Quality Metrics](#14-quality-metrics)
15. [Team Workflows](#15-team-workflows)
16. [Limitations & Known Gaps](#16-limitations--known-gaps)
17. [Future Roadmap Integration](#17-future-roadmap-integration)

---

## 1. Executive Summary

BYOC (Bring Your Own Cloud) is an enterprise-grade cybersecurity SaaS platform built on Next.js 16 + Prisma + PostgreSQL, serving multi-tenant customers with capabilities spanning vulnerability scanning, SIEM, SOAR, compliance management, and asset discovery.

**Everything Claude Code (ECC)** is a structured plugin ecosystem for Claude Code (Anthropic's AI coding CLI) that transforms it from a generic coding assistant into a **project-aware, compliance-enforcing, team-disciplined development partner**.

### Integration Results (as of Phase 12D)

| Metric | Value |
|--------|-------|
| ECC components installed | 11 agents + 14 commands + 18 skills + 18 rules + 3 contexts |
| API routes protected | 117 routes — 100% auth + RBAC enforced |
| Database models | 30 models — 100% with tenantId |
| E2E test cases | 283 tests across 19 spec files |
| TypeScript errors | 0 (enforced at every phase) |
| Security vulnerabilities found by ECC | 23 fixed before production |
| Phases delivered with ECC lifecycle | Phases 12A → 12D |

---

## 2. What is ECC?

Everything Claude Code (ECC) is an open-source collection of structured Claude Code configuration files that live in the `.claude/` directory of your project. When Claude Code starts a session, it automatically reads all files in this directory and uses them to shape its behavior.

### File Structure

```
.claude/
├── agents/          ← 11 specialized AI sub-processes
│   ├── architect.md
│   ├── build-error-resolver.md
│   ├── code-reviewer.md
│   ├── database-reviewer.md
│   ├── doc-updater.md
│   ├── e2e-runner.md
│   ├── loop-operator.md
│   ├── planner.md
│   ├── refactor-cleaner.md
│   ├── security-reviewer.md
│   └── tdd-guide.md
│
├── commands/        ← 14 slash command workflows
│   ├── build-fix.md
│   ├── checkpoint.md
│   ├── code-review.md
│   ├── e2e.md
│   ├── learn.md
│   ├── new-phase.md
│   ├── orchestrate.md
│   ├── plan.md
│   ├── quality-gate.md
│   ├── refactor-clean.md
│   ├── security-audit.md
│   ├── tdd.md
│   ├── test-coverage.md
│   └── update-docs.md
│
├── skills/          ← 18 deep domain knowledge modules
│   ├── agentic-engineering/
│   ├── api-design/
│   ├── aws-deployment/        ← BYOC custom
│   ├── backend-patterns/
│   ├── clickhouse-io/
│   ├── coding-standards/
│   ├── continuous-learning-v2/
│   ├── database-migrations/
│   ├── deployment-patterns/
│   ├── docker-patterns/
│   ├── e2e-testing/
│   ├── enterprise-agent-ops/
│   ├── frontend-patterns/
│   ├── pii-redaction/         ← BYOC custom
│   ├── postgres-patterns/
│   ├── security-review/
│   ├── security-scan/
│   ├── tdd-workflow/
│   └── verification-loop/
│
├── rules/           ← 18 always-on enforcement rules
│   ├── security.md
│   ├── database.md
│   ├── typescript.md
│   ├── common/
│   │   ├── error-handling.md
│   │   ├── file-organization.md
│   │   ├── git-workflow.md
│   │   ├── logging.md
│   │   ├── performance.md
│   │   ├── testing.md
│   │   └── validation.md
│   └── typescript/
│       ├── generics.md
│       ├── imports.md
│       ├── naming.md
│       ├── react-patterns.md
│       └── types.md
│
├── contexts/        ← 3 execution mode contexts
│   ├── dev.md
│   ├── review.md
│   └── research.md
│
└── mcp-servers.json ← MCP tool integrations (GitHub, Railway, Vercel, Playwright)
```

---

## 3. Integration Architecture

### How Claude Code Loads ECC

```
Session Start
     │
     ▼
Read CLAUDE.md          ← Project identity, rules, architecture
     │
     ▼
Load .claude/rules/**   ← Security, database, TypeScript rules (auto-enforced)
     │
     ▼
Load .claude/skills/**  ← Domain knowledge (lazy-loaded when relevant)
     │
     ▼
Register agents/**      ← Available as sub-processes
     │
     ▼
Register commands/**    ← Available as /slash-commands
     │
     ▼
Claude session begins — fully project-aware
```

### MCP Server Integrations

ECC connects Claude Code to external services via MCP (Model Context Protocol):

| Server | Tool Access | BYOC Usage |
|--------|-------------|------------|
| `github` | Create issues, PRs, read repo | Phase PRs, issue tracking |
| `railway` | DB logs, deploy status | PostgreSQL monitoring |
| `vercel` | Deploy status, env vars | Production deployment |
| `playwright` | Browser automation | E2E test execution |

---

## 4. Agents — Specialized AI Sub-Processes

Agents are Claude sub-processes with a focused role, restricted tool set, and domain expertise. Each agent has its own system prompt loaded from `.claude/agents/`.

### 4.1 `security-reviewer`

**Status:** ✅ Fully Implemented
**Model:** Sonnet
**Tools:** Read, Write, Edit, Bash, Grep, Glob

**Role:** OWASP Top 10 vulnerability detection, secrets scanning, BYOC-specific security audit

**What it checks for BYOC:**
- Every API route has `getAuthenticatedUser()` + `hasCapability()`
- Every DB query includes `tenantId`
- Every mutation calls `createAuditLog()`
- No hardcoded secrets (API keys, JWT secrets, DB passwords)
- No raw SQL with string concatenation
- CSRF protection active on state-changing routes
- Rate limiting on auth endpoints
- MFA bypass protection
- SCIM token validation
- Session management (expiry, revocation)

**Impact on BYOC:** Before ECC, security reviews were ad-hoc. After ECC, every phase ends with a mandatory `/security-audit` pass that checks all 117 API routes. **23 security issues were identified and fixed** before reaching production.

**Invoked by:**
- `/security-audit` command
- `/orchestrate security` workflow
- Automatically after any code that touches auth, credentials, or PII

---

### 4.2 `architect`

**Status:** ✅ Fully Implemented
**Model:** Opus
**Tools:** Read, Grep, Glob

**Role:** System design, scalability decisions, architectural trade-off analysis

**What it does for BYOC:**
- Reviews schema changes for multi-tenant correctness
- Plans microservice boundaries (scanner, SIEM, SOAR modules)
- Evaluates chunked execution strategy (2 checks/invocation for Vercel 10s limit)
- Designs the AWS migration architecture (Phase 18)
- Reviews the credential vault encryption design

**Impact on BYOC:** Designed the SSH/WinRM connector architecture (Phase 12C), the CIS benchmark check module pattern, the AssetVulnerability deduplication strategy, and the ECS Fargate + RDS Multi-AZ AWS target (Phase 18).

---

### 4.3 `database-reviewer`

**Status:** ✅ Fully Implemented
**Model:** Sonnet
**Tools:** Read, Write, Edit, Bash, Grep, Glob

**Role:** PostgreSQL query optimization, schema correctness, Prisma best practices

**What it checks for BYOC:**
- N+1 query detection (Prisma `include` abuse)
- Missing `tenantId` on every query (security + correctness)
- Missing pagination on list endpoints
- Over-fetching sensitive fields (passwordHash, mfaSecret, encrypted credentials)
- Index coverage for high-traffic queries
- Schema migration safety

**Key contributions to BYOC:**
- Identified N+1 in asset list endpoint (Phase 9)
- Added 6 compound indices in Phase 12D schema changes
- Reviewed AssetVulnerability upsert strategy for correctness under concurrent scans

---

### 4.4 `tdd-guide`

**Status:** ✅ Fully Implemented
**Model:** Sonnet
**Tools:** Read, Write, Edit, Bash, Grep

**Role:** Enforce test-driven development. Write tests first, implement minimal code, verify 80%+ coverage.

**TDD Workflow enforced:**
1. Define interfaces/types
2. Write failing tests (RED)
3. Run tests — verify failure
4. Write minimal implementation (GREEN)
5. Refactor while keeping tests green
6. Verify ≥80% coverage

**Impact on BYOC:**
- All 19 E2E test spec files (8,151 lines) follow TDD methodology
- Phase 12D tests were written before implementation was complete
- Coverage gate ensures every new scanner module has corresponding tests

---

### 4.5 `e2e-runner`

**Status:** ✅ Fully Implemented
**Model:** Sonnet
**Tools:** Read, Write, Edit, Bash, Grep, Glob

**Role:** Playwright E2E test generation, maintenance, flaky test quarantine, artifact management

**What it generates for BYOC:**
- Auth flows (login, logout, session expiry, MFA)
- RBAC enforcement (forbidden routes, capability checks)
- Scan lifecycle (create → queue → execute → results)
- Audit log verification
- Credential vault CRUD
- CIS benchmark result validation

**Current test suite managed:**

| Spec File | Feature Area | Tests |
|-----------|-------------|-------|
| 01-auth.spec.ts | Authentication flows | ~25 |
| 02-dashboard.spec.ts | Dashboard widgets | ~18 |
| 03-assets.spec.ts | Asset CRUD + search | ~42 |
| 04-users.spec.ts | User management | ~30 |
| 05-roles.spec.ts | RBAC roles | ~35 |
| 06-api-keys.spec.ts | API key lifecycle | ~25 |
| 07-rbac-enforcement.spec.ts | Capability enforcement | ~45 |
| 08-audit-log.spec.ts | Audit trail | ~15 |
| 09-sessions.spec.ts | Session management | ~8 |
| 10-features.spec.ts | Feature flags | ~14 |
| 11-security.spec.ts | Security controls | ~20 |
| 12-multi-role-access.spec.ts | Multi-role scenarios | ~28 |
| 13-compliance-features.spec.ts | Compliance frameworks | ~20 |
| 14-sso-mfa-scim.spec.ts | SSO/MFA/SCIM 2.0 | ~30 |
| 15-scanner-engine.spec.ts | Vulnerability scanner | ~38 |
| 16-siem-enhancement.spec.ts | SIEM events | ~25 |
| 17-detection-engine.spec.ts | Detection rules + SOAR | ~30 |
| 18-phase12c.spec.ts | SSH/WinRM + Diff + Nmap | 25 |
| 19-phase12d.spec.ts | CIS v8.1 + Enterprise DB | 25 |
| **Total** | | **~283** |

---

### 4.6 `build-error-resolver`

**Status:** ✅ Fully Implemented
**Model:** Sonnet
**Tools:** Read, Write, Edit, Bash, Grep, Glob

**Role:** Fix TypeScript and Next.js build errors with minimal diffs. Gets the build green without refactoring.

**Key resolution in BYOC:**
- After Phase 12D schema changes (4 new models, 40 new fields), TypeScript errors appeared because the Prisma client was stale
- This agent ran `prisma generate` to regenerate the client and confirmed 0 TypeScript errors before push
- Resolved `TS2339: Property 'assetVulnerability' does not exist on type 'PrismaClient'`
- Resolved `TS2353: Object literal may only specify known properties — vulnerabilityCount not in AssetUpdateInput`

---

### 4.7 `code-reviewer`

**Status:** ✅ Fully Implemented
**Model:** Sonnet
**Tools:** Read, Grep, Glob, Bash

**Role:** Code quality, maintainability, readability, DRY principles, BYOC pattern compliance

**What it enforces for BYOC:**
- API routes follow the standard template (auth → capability → business logic → audit)
- Scanner check modules implement the `CheckModule` interface correctly
- Error handling doesn't leak internal details
- File size limits respected (< 400 lines per file)
- Naming conventions consistent with BYOC patterns

---

### 4.8 `planner`

**Status:** ✅ Fully Implemented
**Model:** Sonnet
**Tools:** Read, Grep, Glob

**Role:** Requirements analysis, risk assessment, step-by-step implementation plans

**How it works for BYOC:**
- Reads CLAUDE.md for project context
- Reads existing relevant source files
- Identifies affected systems (scanner, SIEM, DB, auth)
- Breaks work into atomic implementable steps
- Flags security implications
- Outputs a numbered plan that must be approved before coding starts

---

### 4.9 `refactor-cleaner`

**Status:** ✅ Fully Implemented
**Model:** Sonnet
**Tools:** Read, Write, Edit, Bash, Grep, Glob

**Role:** Dead code elimination, duplicate removal, dependency cleanup using `knip`, `depcheck`, `ts-prune`

**What it found in BYOC:**
- Duplicate helper functions across scanner adapters
- Unused capability constants in early RBAC implementation
- Redundant imports after scanner refactoring

---

### 4.10 `doc-updater`

**Status:** ✅ Fully Implemented
**Model:** Sonnet
**Tools:** Read, Write, Edit, Bash, Grep, Glob

**Role:** Update `CHANGELOG.md`, generate phase reports in `docs/`, update `CLAUDE.md` with new capabilities

**Documents generated with this agent:**
- `docs/PHASE-12D-CIS-ENTERPRISE-REPORT.md`
- `CHANGELOG.md` version `[1.4.0]`
- All phase reports from Phase 7 through 12D

---

### 4.11 `loop-operator`

**Status:** ✅ Fully Implemented
**Model:** Sonnet
**Tools:** Read, Grep, Glob, Bash, Edit

**Role:** Monitor autonomous agent loops, detect when loops stall, intervene safely

**Usage in BYOC:**
- Monitors long-running scan execution chains
- Detects infinite retry loops in the scanner's batch executor
- Intervenes when a check module hangs without returning results

---

## 5. Commands — Slash Command Workflows

Commands are slash-command workflows defined in `.claude/commands/`. They chain agents together in structured sequences.

### 5.1 `/orchestrate` — Master Workflow Orchestrator

**Status:** ✅ Implemented

Chains agents for complex multi-step work:

| Workflow | Agent Chain | Use Case |
|----------|-------------|----------|
| `feature` | planner → tdd-guide → code-reviewer → security-reviewer | New API endpoints, UI pages |
| `bugfix` | planner → code-reviewer → security-reviewer | Production bugs, test failures |
| `refactor` | architect → code-reviewer → database-reviewer | Schema changes, lib restructuring |
| `security` | security-reviewer → code-reviewer → architect | Auth flows, RBAC changes, PII handling |
| `phase` | planner → architect → tdd-guide → code-reviewer → security-reviewer | Full new feature phase |

**BYOC Usage:** Every phase from 12A onward uses `/orchestrate phase` to ensure consistent delivery.

---

### 5.2 `/new-phase` — Phase Kickoff

**Status:** ✅ Implemented

Initializes a new BYOC development phase:
1. Creates phase documentation file (`docs/PHASE-N-FEATURE-REPORT.md`)
2. Updates `MASTER-ROADMAP.md`
3. Runs `/plan` for requirements analysis
4. Kicks off TDD workflow

---

### 5.3 `/tdd` — Test-Driven Development

**Status:** ✅ Implemented

Enforces the red-green-refactor cycle for every new piece of functionality.

```
/tdd → tdd-guide agent → write failing tests → implement → verify ≥80% coverage
```

---

### 5.4 `/security-audit` — Comprehensive Security Audit

**Status:** ✅ Implemented

Scopes:
- `full` — Entire codebase
- `api` — All 117 API routes
- `auth` — Authentication & RBAC flows
- `siem` — SIEM event ingestion
- `scanner` — Vulnerability scanner engine
- `new` — Only recently changed files

**BYOC Checklist run at every phase:**
- [x] Every API route calls `getAuthenticatedUser()`
- [x] Every mutation calls `hasCapability()`
- [x] Every DB query includes `tenantId`
- [x] Every mutation calls `createAuditLog()`
- [x] No hardcoded secrets
- [x] No raw SQL with string concatenation
- [x] CSRF protection active

---

### 5.5 `/e2e` — E2E Test Generation & Execution

**Status:** ✅ Implemented

Generates and runs Playwright E2E tests. Used at every phase end. Manages:
- Test journey creation
- Flaky test quarantine
- Screenshot/video artifact collection
- CI integration

---

### 5.6 `/quality-gate` — Phase Completion Gate

**Status:** ✅ Implemented

Enforces these exit criteria before any phase is considered complete:
- [x] 0 TypeScript errors
- [x] Clean `npm run build`
- [x] All new E2E tests passing
- [x] Security audit passed
- [x] Documentation updated
- [x] CHANGELOG updated

---

### 5.7 `/plan` — Implementation Planning

**Status:** ✅ Implemented

Invokes the `planner` agent. Restates requirements, identifies risks, and produces a numbered implementation plan. **Requires explicit user approval before any code is written.**

---

### 5.8 `/code-review` — Code Review

**Status:** ✅ Implemented

Invokes `code-reviewer` for quality, readability, and BYOC pattern compliance review.

---

### 5.9 `/build-fix` — Build Error Resolution

**Status:** ✅ Implemented

Invokes `build-error-resolver` for minimal-diff TypeScript/Next.js build fixes.

---

### 5.10 `/update-docs` — Documentation Update

**Status:** ✅ Implemented

Invokes `doc-updater` to update CHANGELOG, phase reports, CLAUDE.md, and codemaps.

---

### 5.11 `/test-coverage` — Coverage Analysis

**Status:** ✅ Implemented

Analyzes test coverage, identifies uncovered paths, and generates additional tests to reach 80%+.

---

### 5.12 `/refactor-clean` — Dead Code Cleanup

**Status:** ✅ Implemented

Runs `knip`, `depcheck`, `ts-prune` and removes dead code, unused imports, duplicate helpers.

---

### 5.13 `/checkpoint` — Session State Snapshot

**Status:** ✅ Implemented

Creates a checkpoint of current work state — useful when approaching context window limits in long sessions.

---

### 5.14 `/learn` — Extract Reusable Patterns

**Status:** ✅ Implemented

Extracts patterns from completed work and saves them to the appropriate skill file for future reuse.

---

## 6. Skills — Deep Domain Knowledge

Skills are deep reference documents Claude loads when working on a specific domain. They contain patterns, examples, anti-patterns, and BYOC-specific guidance.

### 6.1 `security-review` ✅

Covers: OWASP Top 10, BYOC auth patterns, credential handling, JWT validation, RBAC checks, AES-256-GCM encryption patterns, audit log requirements.

**BYOC-Specific Content:**
- The exact API route security template used in all 117 routes
- Credential vault encryption/decryption patterns
- SSH command injection prevention (static strings only — no user input interpolation)

---

### 6.2 `api-design` ✅

Covers: RESTful API conventions, Next.js App Router patterns, response shape standards, error codes, pagination patterns.

**BYOC-Specific Content:**
- Standard `{ data, pagination, error }` response shape
- Error code conventions (401, 403, 404, 422, 500)
- Cursor-based vs. offset-based pagination guidance

---

### 6.3 `postgres-patterns` ✅

Covers: Prisma ORM best practices, compound indices, upsert patterns, transaction handling, connection pooling.

**BYOC-Specific Content:**
- Multi-tenant compound index naming (`tenantId_assetId_deduplicationHash`)
- `AssetVulnerability` upsert pattern for cross-scan deduplication
- Scan result batch insert with `createMany`

---

### 6.4 `backend-patterns` ✅

Covers: Next.js API route patterns, middleware, error handling, service layer patterns, dependency injection.

---

### 6.5 `deployment-patterns` ✅

Covers: Vercel deployment, environment variables, edge/serverless function constraints, Vercel 10s execution limit.

**BYOC-Specific Content:**
- Chunked scan execution (2 checks/invocation) to respect Vercel 10s limit
- Cron job scheduling (daily scan scheduler at `/api/cron/scan-scheduler`)

---

### 6.6 `docker-patterns` ✅

Covers: Dockerfile best practices, multi-stage builds, secrets management in containers.

---

### 6.7 `database-migrations` ✅

Covers: Prisma migration workflow, zero-downtime migration strategies, rollback plans, index creation patterns.

---

### 6.8 `e2e-testing` ✅

Covers: Playwright patterns, page object models, test isolation, fixture management, CI integration.

---

### 6.9 `frontend-patterns` ✅

Covers: React 19, Next.js 16, Tailwind CSS 4, Radix UI component patterns, accessibility.

---

### 6.10 `tdd-workflow` ✅

Covers: Red-green-refactor cycle, test doubles (mocks/stubs/spies), coverage thresholds.

---

### 6.11 `verification-loop` ✅

Covers: Self-verification patterns for autonomous agents — how to detect when a task is actually complete.

---

### 6.12 `security-scan` ✅

Covers: Vulnerability scanning patterns, CVSS scoring, CIS benchmark methodology, Nmap NSE script patterns.

---

### 6.13 `enterprise-agent-ops` ✅

Covers: Multi-agent orchestration, context handoffs between agents, loop prevention, agent chain design.

---

### 6.14 `agentic-engineering` ✅

Covers: Building Claude-powered autonomous workflows, MCP server integration, tool selection patterns.

---

### 6.15 `coding-standards` ✅

Covers: File naming, function length limits, comment standards, import ordering.

---

### 6.16 `clickhouse-io` ✅

Covers: ClickHouse for high-volume SIEM event storage (planned for Phase 14+ when event volume exceeds PostgreSQL capacity).

---

### 6.17 `continuous-learning-v2` ✅

Covers: How to extract patterns from completed work and evolve the `.claude/` configuration.

---

### 6.18 `pii-redaction` ✅ (BYOC Custom)

**Status:** ✅ Implemented — BYOC custom skill
**Scope:** Phase 13 implementation

Covers all PII/PHI/PCI-DSS data categories with redaction patterns:

| Data Type | Regulation | Redaction Pattern |
|-----------|-----------|------------------|
| Email address | GDPR | `j***@c******.com` |
| National ID/SSN | GDPR/HIPAA | `***-**-6789` |
| Credit card | PCI-DSS | `****-****-****-4567` |
| Patient name | HIPAA | `M*** J*****` |
| Medical record | HIPAA | `MRN-*****` |
| IP address | GDPR | `192.168.*.*` |
| Biometric data | GDPR | `[REDACTED-BIOMETRIC]` |

**Implementation Status (Phase 13 — NEXT):**
- [ ] API-level PII redaction middleware
- [ ] Audit log sanitization layer
- [ ] SIEM event PII masking
- [ ] Report generation with redacted exports
- [ ] GDPR right-to-erasure endpoint
- [ ] HIPAA minimum-necessary enforcement

---

### 6.19 `aws-deployment` ✅ (BYOC Custom)

**Status:** ✅ Skill documented — Implementation in Phase 18

Full AWS production architecture:

```
Internet → CloudFront (CDN + WAF)
              │
              ▼
           ALB (HTTPS)
              │
         ECS Fargate (Next.js)
              ├── RDS PostgreSQL Multi-AZ
              ├── ElastiCache Redis
              └── S3 (reports, audit archives)
              │
         Secrets Manager
         (replaces .env.local)
```

| Service | Purpose | Phase 18 Status |
|---------|---------|----------------|
| ECS Fargate | Next.js app containers | Planned |
| ECR | Docker image registry | Planned |
| RDS PostgreSQL 15 Multi-AZ | Production DB | Planned |
| ElastiCache Redis | Sessions + rate limiting | Planned |
| ALB | Load balancer + SSL | Planned |
| CloudFront | CDN + edge caching | Planned |
| WAF | Web Application Firewall | Planned |
| Secrets Manager | Secure secrets | Planned |
| S3 | Report exports | Planned |
| VPC + Private Subnets | Network isolation | Planned |
| Route 53 | DNS management | Planned |
| ACM | SSL/TLS certificates | Planned |

---

## 7. Rules — Always-On Enforcement

Rules in `.claude/rules/` are loaded every session and treated as mandatory instructions that Claude cannot override.

### 7.1 `security.md`

**Applies to:** All `.ts`, `.tsx`, `src/app/api/**`, `src/lib/**`

**Mandatory checks enforced:**
```
✅ No hardcoded secrets
✅ All API routes: getAuthenticatedUser()
✅ All mutations: hasCapability()
✅ All DB queries: tenantId filter
✅ All mutations: createAuditLog()
✅ No SQL injection (Prisma only, never raw string SQL)
✅ Input validation on all API route bodies
✅ Error messages don't leak stack traces
```

**Critical pattern enforced:**
```typescript
// ALWAYS enforce this pattern
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const allowed = await hasCapability(user.id, 'capability', user.tenantId)
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  await createAuditLog({ tenantId: user.tenantId, userId: user.id, ... })
}
```

---

### 7.2 `database.md`

**Applies to:** `prisma/**`, `src/app/api/**`, `src/lib/**`

**Enforced patterns:**
```
✅ tenantId required in every query (multi-tenant isolation)
✅ Select only needed fields (no over-fetching)
✅ Pagination required for all list endpoints
✅ No unbounded queries (always limit + offset)
✅ Compound indices for frequent query patterns
```

---

### 7.3 `typescript.md`

**Enforced patterns:**
```
✅ Strict TypeScript — no implicit any
✅ Immutability preferred (const, readonly)
✅ Type guards before type assertions
✅ File size limit: 400 lines
✅ No barrel files that create circular deps
```

---

### 7.4 `common/` — 7 Cross-Cutting Rules

| Rule File | Enforces |
|-----------|---------|
| `error-handling.md` | Never swallow errors, always log, structured error types |
| `file-organization.md` | Feature-based file structure, no monolith files |
| `git-workflow.md` | Conventional commits, never force-push main |
| `logging.md` | Structured logging, no console.log in production |
| `performance.md` | Lazy loading, avoid blocking operations in API routes |
| `testing.md` | Tests in `__tests__/` or `*.spec.ts`, TDD methodology |
| `validation.md` | Zod for runtime validation, validate at API boundaries |

---

### 7.5 `typescript/` — 5 TypeScript-Specific Rules

| Rule File | Enforces |
|-----------|---------|
| `generics.md` | Proper constraint syntax, avoid over-generic types |
| `imports.md` | Path aliases (`@/`), import order, no relative `../../` |
| `naming.md` | PascalCase types, camelCase vars, SCREAMING_SNAKE constants |
| `react-patterns.md` | Server vs. client components, no client state in Server Components |
| `types.md` | Discriminated unions, exhaustive switch, branded types |

---

## 8. Contexts — Execution Modes

Contexts adjust Claude's behavior for different task types.

| Context | When Used | Behavior |
|---------|-----------|----------|
| `dev` | Feature implementation | Full tool access, writes code, runs builds |
| `review` | Code review, security audit | Read-only preferred, suggests changes |
| `research` | Architecture decisions, planning | Web fetch enabled, no code modifications |

---

## 9. BYOC-Custom Extensions

Two skills were built specifically for BYOC and are not part of the upstream ECC package:

### `pii-redaction` Skill
- Built for GDPR Article 17, HIPAA Safe Harbor, PCI-DSS 4.0 compliance
- Covers 30+ personal data types with context-appropriate redaction patterns
- Phase 13 implementation driver
- See: `.claude/skills/pii-redaction/SKILL.md`

### `aws-deployment` Skill
- Built for BYOC's Phase 18 migration from Vercel/Railway to AWS
- Full IaC templates for ECS Fargate, RDS Multi-AZ, WAF, CloudFront
- GitHub Actions CI/CD pipeline definition
- Blue-green deployment strategy
- See: `.claude/skills/aws-deployment/SKILL.md`

---

## 10. Phase Lifecycle with ECC

Every BYOC feature phase follows this mandatory lifecycle, enforced by ECC commands:

```
/new-phase    ← Create phase docs, update roadmap
     ↓
/plan         ← Requirements analysis, risk assessment, step plan
     ↓
/tdd          ← Write failing tests FIRST (RED)
     ↓
[Implement]   ← Write minimal code to pass tests (GREEN)
     ↓
/code-review  ← Quality and pattern compliance
     ↓
/security-audit ← OWASP + BYOC-specific security checks
     ↓
/e2e          ← Generate and run Playwright E2E tests
     ↓
/quality-gate ← 0 TS errors + clean build + all tests pass
     ↓
/update-docs  ← CHANGELOG + phase report + CLAUDE.md update
     ↓
PR → master → Vercel deploy
```

### Exit Criteria (Non-Negotiable)

Before any phase is merged to `master`:

| Criterion | Tool | Status |
|-----------|------|--------|
| 0 TypeScript errors | `npx tsc --noEmit` | Enforced by `/quality-gate` |
| Clean production build | `npm run build` | Enforced by `/quality-gate` |
| All E2E tests passing | Playwright | Enforced by `/e2e` |
| Security audit passed | `/security-audit` | Mandatory |
| Phase report created | `/update-docs` | Mandatory |
| CHANGELOG updated | `/update-docs` | Mandatory |

---

## 11. Before vs. After ECC

### Session Context

| Aspect | Before ECC | After ECC |
|--------|-----------|-----------|
| Session startup | Re-explain BYOC architecture each time | CLAUDE.md auto-loaded — zero context loss |
| Multi-tenant rules | Sometimes forgotten | `rules/security.md` — never skipped |
| Audit log coverage | Sometimes forgotten | Enforced by security rule + security-reviewer agent |
| tenantId on queries | Occasional misses | Enforced on every DB write |

### Code Quality

| Aspect | Before ECC | After ECC |
|--------|-----------|-----------|
| Security review | Generic review | `/security-audit` with 20-point BYOC checklist |
| DB query review | Generic | `database-reviewer` agent (N+1, pagination, indices) |
| Test methodology | After implementation | TDD enforced by `tdd-guide` agent |
| Documentation | Manual, inconsistent | `doc-updater` auto-generates phase reports |

### Development Speed

| Aspect | Before ECC | After ECC |
|--------|-----------|-----------|
| Build error recovery | Manual investigation | `build-error-resolver` fixes in 1 agent invocation |
| Dead code cleanup | Never done | `refactor-cleaner` via `knip`/`depcheck`/`ts-prune` |
| Phase kickoff time | ~30 min planning | `/new-phase` in <5 min |
| Security issues in production | 3 incidents | 0 post-ECC incidents |

---

## 12. Implementation Status Matrix

### Agents

| Agent | Status | Used in Phases |
|-------|--------|---------------|
| security-reviewer | ✅ Active | 12A, 12B, 12C, 12D |
| architect | ✅ Active | 12A, 12C, 12D |
| database-reviewer | ✅ Active | 12D |
| tdd-guide | ✅ Active | 12A, 12B, 12C, 12D |
| e2e-runner | ✅ Active | 12A, 12B, 12C, 12D |
| build-error-resolver | ✅ Active | 12D (Prisma client) |
| code-reviewer | ✅ Active | All phases |
| planner | ✅ Active | All phases |
| refactor-cleaner | ✅ Active | 12B cleanup |
| doc-updater | ✅ Active | All phases |
| loop-operator | ✅ Active | Scanner loops |

### Commands

| Command | Status | Notes |
|---------|--------|-------|
| /orchestrate | ✅ Active | Used in all phases |
| /new-phase | ✅ Active | Phase 12A+ |
| /tdd | ✅ Active | All phases |
| /security-audit | ✅ Active | All phases |
| /e2e | ✅ Active | All phases |
| /quality-gate | ✅ Active | All phases |
| /plan | ✅ Active | All phases |
| /code-review | ✅ Active | All phases |
| /build-fix | ✅ Active | Phase 12D |
| /update-docs | ✅ Active | All phases |
| /test-coverage | ✅ Active | Phase 12C+ |
| /refactor-clean | ✅ Active | Phase 12B |
| /checkpoint | ✅ Active | Long sessions |
| /learn | ✅ Active | Pattern extraction |

### Skills

| Skill | Status | Used In |
|-------|--------|---------|
| security-review | ✅ Active | All phases |
| api-design | ✅ Active | All phases |
| postgres-patterns | ✅ Active | Phase 12D |
| backend-patterns | ✅ Active | All phases |
| deployment-patterns | ✅ Active | Vercel constraints |
| docker-patterns | ✅ Active | Phase 18 prep |
| database-migrations | ✅ Active | Phase 12D schema |
| e2e-testing | ✅ Active | All phases |
| frontend-patterns | ✅ Active | UI phases |
| tdd-workflow | ✅ Active | All phases |
| verification-loop | ✅ Active | Scanner loop |
| security-scan | ✅ Active | Phase 12 series |
| enterprise-agent-ops | ✅ Active | Orchestration |
| agentic-engineering | ✅ Active | MCP integration |
| coding-standards | ✅ Active | All phases |
| clickhouse-io | 📋 Planned | Phase 14+ |
| continuous-learning-v2 | ✅ Active | Pattern extraction |
| pii-redaction (custom) | 📋 Phase 13 | Next phase |
| aws-deployment (custom) | 📋 Phase 18 | AWS migration |

---

## 13. Security Impact Assessment

### Vulnerabilities Prevented by ECC

Since ECC integration (Phase 12A onward), the security-reviewer agent identified and prevented **23 security issues** from reaching production:

| Category | Count | Examples |
|----------|-------|---------|
| Missing tenantId on queries | 4 | New API routes during rapid development |
| Missing auth check | 3 | Draft routes committed before auth was wired |
| Missing audit log | 6 | Credential CRUD operations |
| Over-fetching sensitive fields | 3 | Password hash included in list response |
| Missing input validation | 5 | Scan target array not validated |
| Secret in env reference | 2 | JWT_SECRET used as literal string in test |

### SSH Command Injection Prevention

The CIS SSH check modules (12D) run commands against remote Linux hosts. The security-reviewer enforced:
- **All SSH commands are static strings** — no user input interpolation allowed
- Commands like `grep "^nodev" /proc/mounts` are hardcoded — never constructed from user data
- SSH timeout enforced on every connection (30 seconds)
- SSH known-hosts verification or explicit verification skip with documentation

---

## 14. Quality Metrics

### Test Coverage (as of Phase 12D)

| Area | Tests | Coverage |
|------|-------|---------|
| Authentication | 25 | High |
| RBAC enforcement | 45 | High |
| Scanner engine | 38 + 25 (12C) + 25 (12D) | High |
| SIEM + detection | 25 + 30 | Medium |
| Compliance | 20 | Medium |
| Asset management | 42 | High |
| SSO/MFA/SCIM | 30 | Medium |
| **Total** | **283** | |

### Build Health

| Metric | Status |
|--------|--------|
| TypeScript errors | 0 |
| Build status | ✅ Clean |
| Prisma client | ✅ Generated from schema |
| Database migration | ✅ Up to date |

---

## 15. Team Workflows

### Starting a New Feature

```bash
# 1. Start a new phase
/new-phase 13 "PII Redaction Engine"

# 2. Plan the implementation
/plan

# 3. Write tests first
/tdd

# 4. Implement (use ECC context to stay compliant)
# ... implement code ...

# 5. Review code
/code-review

# 6. Security audit
/security-audit new

# 7. Run E2E tests
/e2e

# 8. Quality gate (must pass before push)
/quality-gate

# 9. Document
/update-docs
```

### Investigating a Bug

```bash
# 1. Orchestrate bugfix workflow
/orchestrate bugfix "Scan results not showing deduplication hash"
# → planner → code-reviewer → security-reviewer
```

### Security Review Before Push

```bash
/security-audit api
# Checks all 117 API routes for BYOC security checklist
```

---

## 16. Limitations & Known Gaps

### Current Limitations

| Gap | Description | Mitigation |
|-----|-------------|-----------|
| SSH tests require real host | E2E tests for CIS SSH checks can only validate structure, not execution against a real Linux host | Tests validate API contract; integration tests against a test VM are recommended |
| Vercel 10s limit | Scanner execution is chunked (2 checks/invocation) which adds latency to long scans | Phase 18 AWS migration to ECS Fargate removes this constraint |
| No real-time scan updates | Scan progress requires polling the API; no WebSocket push | Phase 14 adds WebSocket/SSE real-time SIEM and scan updates |
| ClickHouse not yet active | SIEM events stored in PostgreSQL; high-volume customers will hit performance limits | `clickhouse-io` skill is ready; Phase 14+ migrates SIEM events |
| PII redaction not yet implemented | The `pii-redaction` skill is defined but Phase 13 implementation is pending | Scheduled as next phase |

### Known Test Limitations

| Test | Limitation |
|------|-----------|
| TC-12D SSH execution tests | Cannot SSH into `127.0.0.1` in CI environment — tests validate API structure only |
| SCIM provisioning E2E | External IdP not available in test environment — tested via API contract |
| WinRM E2E tests | Windows target not available in CI — mocked via credential structure tests |

---

## 17. Future Roadmap Integration

ECC will be active in all remaining BYOC phases:

| Phase | Feature | ECC Role |
|-------|---------|---------|
| **13** | PII/PHI Redaction Engine | `pii-redaction` skill drives implementation |
| **14** | WebSocket/SSE Real-Time SIEM | `agentic-engineering` + `deployment-patterns` |
| **15** | PDF Report Generation | New custom skill: `pdf-reporting` |
| **16** | Threat Intelligence Feeds | `security-scan` skill extended |
| **17** | Custom Compliance Framework Builder | `architect` + `database-reviewer` |
| **18** | AWS Production Deployment | `aws-deployment` skill fully utilized |
| **19** | UEBA Behavioral Analytics | `clickhouse-io` + new `ml-patterns` skill |
| **20** | Cloud Asset Auto-Discovery | `agentic-engineering` + cloud API patterns |

---

*Document prepared by the BYOC Engineering Team — Furix AI*
*Repository: https://github.com/saipreethamvudutha/ECC_BYOC*
