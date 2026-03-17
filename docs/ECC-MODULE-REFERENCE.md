# ECC Module Reference — BYOC

> **Document Type:** Technical Reference
> **Prepared by:** BYOC Engineering Team (Furix AI)
> **Version:** 1.0
> **Date:** 2026-03-17
> **Purpose:** Module-by-module reference for every ECC component installed in BYOC

---

## Quick Reference Card

```
BYOC ECC Installation Summary
══════════════════════════════════════════════════════════════════
  Agents:   11  (security-reviewer, architect, database-reviewer,
                 tdd-guide, e2e-runner, build-error-resolver,
                 code-reviewer, planner, refactor-cleaner,
                 doc-updater, loop-operator)

  Commands: 14  (/orchestrate, /new-phase, /tdd, /security-audit,
                 /e2e, /quality-gate, /plan, /code-review,
                 /build-fix, /update-docs, /test-coverage,
                 /refactor-clean, /checkpoint, /learn)

  Skills:   18  (security-review, api-design, postgres-patterns,
                 backend-patterns, deployment-patterns, docker-patterns,
                 database-migrations, e2e-testing, frontend-patterns,
                 tdd-workflow, verification-loop, security-scan,
                 enterprise-agent-ops, agentic-engineering,
                 coding-standards, clickhouse-io,
                 continuous-learning-v2, pii-redaction★, aws-deployment★)
                 ★ = BYOC custom

  Rules:    18  (security.md, database.md, typescript.md,
                 common/7 files, typescript/5 files)

  Contexts:  3  (dev, review, research)

  MCP:       4  (github, railway, vercel, playwright)
══════════════════════════════════════════════════════════════════
```

---

## Agents Reference

### `security-reviewer`

```yaml
File: .claude/agents/security-reviewer.md
Model: sonnet
Tools: Read, Write, Edit, Bash, Grep, Glob
Status: ✅ Active
```

**Responsibilities:**
- OWASP Top 10 vulnerability detection
- Secrets scanning (hardcoded API keys, JWT secrets, DB passwords)
- BYOC-specific security checklist (getAuthenticatedUser, hasCapability, tenantId, createAuditLog)
- SSH command injection prevention review
- Credential handling in vault implementation

**BYOC Checklist (run every phase):**

| Check | API Routes | DB Queries | Mutations |
|-------|-----------|-----------|----------|
| `getAuthenticatedUser()` | ✅ Required | — | — |
| `hasCapability()` | ✅ Required | — | — |
| `tenantId` filter | — | ✅ Required | ✅ Required |
| `createAuditLog()` | — | — | ✅ Required |
| No hardcoded secrets | ✅ Required | — | — |
| Input validation | ✅ Required | — | — |

**Example invocation:**
```bash
/security-audit api        # All 117 API routes
/security-audit new        # Only changed files
/security-audit scanner    # Scanner engine only
```

---

### `architect`

```yaml
File: .claude/agents/architect.md
Model: opus
Tools: Read, Grep, Glob
Status: ✅ Active
```

**Responsibilities:**
- System design and scalability decisions
- Schema architecture review
- Module boundary definitions
- AWS migration architecture planning
- Cross-phase technical debt management

**Used in BYOC for:**
- CIS benchmark check module interface design
- AssetVulnerability deduplication strategy
- Scanner chunked execution architecture (2 checks/invocation)
- Phase 18 AWS ECS/RDS/WAF architecture

---

### `database-reviewer`

```yaml
File: .claude/agents/database-reviewer.md
Model: sonnet
Tools: Read, Write, Edit, Bash, Grep, Glob
Status: ✅ Active
```

**Responsibilities:**
- N+1 query detection
- Missing tenantId identification
- Missing pagination on list queries
- Over-fetching sensitive fields
- Index coverage analysis
- Upsert correctness for concurrent operations

**Key findings for BYOC:**
- Recommended 6 compound indices added in Phase 12D
- Reviewed AssetVulnerability upsert for concurrent scan safety
- Identified missing `select` on user list endpoint (Phase 9)

---

### `tdd-guide`

```yaml
File: .claude/agents/tdd-guide.md
Model: sonnet
Tools: Read, Write, Edit, Bash, Grep
Status: ✅ Active
```

**TDD Cycle:**
```
1. RED    → Write failing test
2. GREEN  → Write minimal implementation
3. REFACTOR → Improve while tests stay green
4. VERIFY → Coverage ≥ 80%
```

**Applied to BYOC:**
- All 19 E2E spec files follow TDD methodology
- Phase 12D tests written before CIS modules were implemented
- Coverage gate ensures scanner modules have matching tests

---

### `e2e-runner`

```yaml
File: .claude/agents/e2e-runner.md
Model: sonnet
Tools: Read, Write, Edit, Bash, Grep, Glob
Status: ✅ Active
```

**Manages:**
- Playwright test generation (19 spec files, 8,151 lines)
- Test isolation (unique names, shared test helpers)
- Flaky test detection and quarantine
- CI integration via Playwright config
- Screenshot/video artifact collection on failure

---

### `build-error-resolver`

```yaml
File: .claude/agents/build-error-resolver.md
Model: sonnet
Tools: Read, Write, Edit, Bash, Grep, Glob
Status: ✅ Active
```

**Principle:** Minimal diff only — get build green, no refactoring.

**Resolved in BYOC Phase 12D:**
```
Before: TS2339: Property 'assetVulnerability' does not exist on type 'PrismaClient'
Before: TS2353: 'vulnerabilityCount' not in AssetUpdateInput

Fix: npx prisma generate (regenerate stale Prisma client)

After: 0 TypeScript errors ✅
```

---

### `code-reviewer`

```yaml
File: .claude/agents/code-reviewer.md
Model: sonnet
Tools: Read, Grep, Glob, Bash
Status: ✅ Active
```

**Reviews for:**
- BYOC API route template compliance
- CheckModule interface implementation correctness
- Error handling (no internal details leaked)
- File size limits (< 400 lines)
- Import organization and path aliases

---

### `planner`

```yaml
File: .claude/agents/planner.md
Model: sonnet
Tools: Read, Grep, Glob
Status: ✅ Active
```

**Outputs:**
- Numbered implementation steps
- Risk assessment
- Affected system map
- Security implications
- **Requires explicit user approval before coding starts**

---

### `refactor-cleaner`

```yaml
File: .claude/agents/refactor-cleaner.md
Model: sonnet
Tools: Read, Write, Edit, Bash, Grep, Glob
Status: ✅ Active
```

**Tools used:**
- `knip` — unused exports and files
- `depcheck` — unused npm dependencies
- `ts-prune` — TypeScript dead code

---

### `doc-updater`

```yaml
File: .claude/agents/doc-updater.md
Model: sonnet
Tools: Read, Write, Edit, Bash, Grep, Glob
Status: ✅ Active
```

**Maintains:**
- `CHANGELOG.md` — semver entries per phase
- `docs/PHASE-*-REPORT.md` — comprehensive phase reports
- `CLAUDE.md` — project memory updated with new capabilities
- Phase history in MEMORY.md

---

### `loop-operator`

```yaml
File: .claude/agents/loop-operator.md
Model: sonnet
Tools: Read, Grep, Glob, Bash, Edit
Status: ✅ Active
```

**Monitors:**
- Scanner batch execution loops
- Long-running agent chains
- Stall detection and safe intervention

---

## Commands Reference

### `/orchestrate [workflow] [description]`

**File:** `.claude/commands/orchestrate.md`

| Workflow | Chain | Use Case |
|----------|-------|---------|
| `feature` | planner → tdd-guide → code-reviewer → security-reviewer | New features |
| `bugfix` | planner → code-reviewer → security-reviewer | Bug fixes |
| `refactor` | architect → code-reviewer → database-reviewer | Refactoring |
| `security` | security-reviewer → code-reviewer → architect | Security changes |
| `phase` | planner → architect → tdd-guide → code-reviewer → security-reviewer | Full phase |

---

### `/new-phase [number] [name]`

**File:** `.claude/commands/new-phase.md`

Sets up: `docs/PHASE-N-NAME-REPORT.md`, updates `MASTER-ROADMAP.md`, kicks off `/plan`

---

### `/tdd`

**File:** `.claude/commands/tdd.md`

Invokes `tdd-guide` for red-green-refactor cycle with 80%+ coverage gate.

---

### `/security-audit [scope]`

**File:** `.claude/commands/security-audit.md`

Scopes: `full`, `api`, `auth`, `siem`, `scanner`, `new`

Runs BYOC 20-point security checklist on selected scope.

---

### `/e2e`

**File:** `.claude/commands/e2e.md`

Generates Playwright tests, runs against local or production, quarantines flaky tests.

---

### `/quality-gate`

**File:** `.claude/commands/quality-gate.md`

**Exit criteria:**
```
✅ npx tsc --noEmit → 0 errors
✅ npm run build → clean
✅ All E2E tests → passing
✅ /security-audit → passed
✅ /update-docs → complete
```

---

### `/plan`

**File:** `.claude/commands/plan.md`

Invokes `planner` agent. Produces numbered plan. **Waits for CONFIRM before touching code.**

---

### `/code-review`

**File:** `.claude/commands/code-review.md`

Invokes `code-reviewer` for quality and pattern compliance.

---

### `/build-fix`

**File:** `.claude/commands/build-fix.md`

Invokes `build-error-resolver`. Minimal diffs only.

---

### `/update-docs`

**File:** `.claude/commands/update-docs.md`

Invokes `doc-updater`. Updates CHANGELOG, phase reports, CLAUDE.md.

---

### `/test-coverage`

**File:** `.claude/commands/test-coverage.md`

Analyzes coverage, adds tests for uncovered paths, enforces 80% threshold.

---

### `/refactor-clean`

**File:** `.claude/commands/refactor-clean.md`

Invokes `refactor-cleaner`. Runs `knip`, `depcheck`, `ts-prune`.

---

### `/checkpoint`

**File:** `.claude/commands/checkpoint.md`

Saves session state snapshot. Used when approaching context limits in long sessions.

---

### `/learn`

**File:** `.claude/commands/learn.md`

Extracts reusable patterns from completed work, saves to relevant skill file.

---

## Skills Reference

### `security-review` ✅

**Domain:** Web security, OWASP Top 10, credential handling

**Key content for BYOC:**
- AES-256-GCM encryption/decryption pattern for credential vault
- API route security template (auth → RBAC → business logic → audit)
- SSH command injection prevention (static strings only)

---

### `api-design` ✅

**Domain:** RESTful API design, Next.js App Router

**Key content for BYOC:**
- Standard response shape: `{ data, pagination?, error? }`
- Error code conventions: 401 (unauth), 403 (forbidden), 422 (validation), 404 (not found)
- Pagination: cursor-based for large datasets, offset for small

---

### `postgres-patterns` ✅

**Domain:** Prisma ORM, PostgreSQL optimization

**Key content for BYOC:**
- Multi-tenant compound indices
- `AssetVulnerability` upsert strategy for concurrent safety
- Batch insert with `createMany` for scan results

---

### `backend-patterns` ✅

**Domain:** Next.js API, middleware, service patterns

---

### `deployment-patterns` ✅

**Domain:** Vercel deployment, serverless constraints

**Key content for BYOC:**
- Vercel 10s execution limit → chunked scanner (2 checks/invocation)
- Daily cron scheduler pattern

---

### `docker-patterns` ✅

**Domain:** Containerization, multi-stage builds

**Used for Phase 18 AWS ECS preparation**

---

### `database-migrations` ✅

**Domain:** Prisma migrations, zero-downtime strategies

**Used in Phase 12D schema changes**

---

### `e2e-testing` ✅

**Domain:** Playwright, test isolation, fixtures

---

### `frontend-patterns` ✅

**Domain:** React 19, Next.js 16, Tailwind CSS 4, Radix UI

---

### `tdd-workflow` ✅

**Domain:** Test-driven development methodology

---

### `verification-loop` ✅

**Domain:** Autonomous agent self-verification

---

### `security-scan` ✅

**Domain:** Vulnerability scanning, CVSS, CIS methodology, Nmap

**Key content for BYOC:**
- CIS v8.1 benchmark structure (55 controls, 6 families)
- Nmap NSE script patterns
- CVSS scoring methodology

---

### `enterprise-agent-ops` ✅

**Domain:** Multi-agent orchestration, context handoffs

---

### `agentic-engineering` ✅

**Domain:** Claude-powered autonomous workflows, MCP integration

---

### `coding-standards` ✅

**Domain:** File naming, function limits, comment standards

---

### `clickhouse-io` ✅ (planned Phase 14+)

**Domain:** ClickHouse for high-volume SIEM events

**Status:** Skill ready; implementation planned when SIEM event volume outgrows PostgreSQL

---

### `continuous-learning-v2` ✅

**Domain:** Pattern extraction and ECC evolution

---

### `pii-redaction` ✅ BYOC Custom (Phase 13)

**Domain:** GDPR/HIPAA/PCI-DSS data redaction

**Implementation status:**

| Component | Status |
|-----------|--------|
| Skill documentation | ✅ Complete |
| API-level PII middleware | 📋 Phase 13 |
| Audit log sanitization | 📋 Phase 13 |
| SIEM event PII masking | 📋 Phase 13 |
| Report generation redaction | 📋 Phase 13 |
| GDPR right-to-erasure | 📋 Phase 13 |

---

### `aws-deployment` ✅ BYOC Custom (Phase 18)

**Domain:** AWS ECS/RDS/WAF/CloudFront production deployment

**Implementation status:**

| Component | Status |
|-----------|--------|
| Skill documentation | ✅ Complete |
| Architecture design | ✅ Complete |
| ECS task definitions | 📋 Phase 18 |
| RDS Multi-AZ setup | 📋 Phase 18 |
| WAF rules | 📋 Phase 18 |
| GitHub Actions CI/CD | 📋 Phase 18 |
| Secrets Manager migration | 📋 Phase 18 |

---

## Rules Reference

### Top-Level Rules

| File | Applies To | Critical Rule |
|------|-----------|--------------|
| `rules/security.md` | `**/*.ts`, `src/app/api/**` | tenantId + auth + RBAC + audit on every route |
| `rules/database.md` | `prisma/**`, `src/lib/**` | tenantId in every query, pagination required |
| `rules/typescript.md` | `**/*.ts`, `**/*.tsx` | Strict types, no implicit any, file size ≤ 400 lines |

### `common/` Rules (7 files)

| File | Enforces |
|------|---------|
| `error-handling.md` | Structured errors, never swallow |
| `file-organization.md` | Feature-based structure |
| `git-workflow.md` | Conventional commits, no force-push main |
| `logging.md` | Structured logs, no console.log in production |
| `performance.md` | Lazy loading, no blocking API operations |
| `testing.md` | TDD methodology, `*.spec.ts` naming |
| `validation.md` | Zod at API boundaries |

### `typescript/` Rules (5 files)

| File | Enforces |
|------|---------|
| `generics.md` | Proper constraints |
| `imports.md` | `@/` aliases, import order |
| `naming.md` | PascalCase types, camelCase vars |
| `react-patterns.md` | Server vs client components |
| `types.md` | Discriminated unions, exhaustive switch |

---

## MCP Server Integrations

```json
{
  "mcpServers": {
    "github": {
      "command": "npx @modelcontextprotocol/server-github",
      "env": { "GITHUB_TOKEN": "..." }
    },
    "railway": {
      "command": "npx @modelcontextprotocol/server-railway",
      "env": { "RAILWAY_TOKEN": "..." }
    },
    "vercel": {
      "command": "npx @modelcontextprotocol/server-vercel",
      "env": { "VERCEL_TOKEN": "..." }
    },
    "playwright": {
      "command": "npx @playwright/mcp"
    }
  }
}
```

| Server | Capability | BYOC Use |
|--------|-----------|---------|
| `github` | Issues, PRs, code search | Phase PR creation, issue tracking |
| `railway` | DB logs, deploy status | PostgreSQL health monitoring |
| `vercel` | Deploys, env vars, functions | Production deployment status |
| `playwright` | Browser automation | E2E test execution |

---

## Execution Contexts

| Context File | Purpose | Active Tools |
|-------------|---------|-------------|
| `contexts/dev.md` | Implementation | All tools — read, write, edit, run |
| `contexts/review.md` | Code/security review | Read-only preferred, no writes |
| `contexts/research.md` | Architecture planning | Web fetch enabled, no code writes |

---

*Reference document maintained by BYOC Engineering Team — Furix AI*
*Last updated: 2026-03-17 (Phase 12D complete)*
