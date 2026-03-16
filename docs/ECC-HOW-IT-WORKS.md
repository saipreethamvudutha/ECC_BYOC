# How Everything Claude Code (ECC) Helps BYOC

> **Repository used:** https://github.com/affaan-m/everything-claude-code
> **Integration date:** 2026-03-16
> **BYOC phases completed with ECC:** Starting Phase 13+

---

## What Is ECC?

**Everything Claude Code (ECC)** is an open-source plugin ecosystem for Claude Code (the AI coding CLI by Anthropic). It provides a library of:

- **Agents** — Specialized Claude sub-processes that focus on one domain (security review, database optimization, test writing, etc.)
- **Skills** — Deep domain knowledge files that Claude reads when working on specific tasks
- **Commands** — Slash commands (`/orchestrate`, `/tdd`, `/e2e`) that trigger multi-step workflows
- **Rules** — Always-enforced guidelines that Claude follows automatically in every session
- **Contexts** — Execution mode settings (development vs. review vs. research)

All of these live in the `.claude/` directory at the root of your project. Claude Code reads them automatically.

---

## What Changed Because of ECC

### Before ECC (Phases 1–12)

Every Claude Code session started fresh with no project memory:
- You had to explain BYOC's architecture at the start of every conversation
- Claude would sometimes forget to add `tenantId` to DB queries (security risk)
- Claude would sometimes forget `createAuditLog()` on mutations (compliance risk)
- No structured workflow — features built ad-hoc without standard test-first approach
- No specialized agents — generic Claude handled everything from security audits to DB optimization
- No persistent session learning

### After ECC (Phase 13+)

| Aspect | Before | After |
|--------|--------|-------|
| Session startup | Re-explain architecture every time | CLAUDE.md loaded automatically — zero context loss |
| Security compliance | Manual vigilance | `rules/security.md` enforced in every session |
| tenantId enforcement | Sometimes missed | Rule explicitly states: "tenantId MUST be in every query" |
| Audit log coverage | Sometimes missed | Rule explicitly states: "createAuditLog() MUST be called" |
| Feature development | Ad-hoc | Structured lifecycle: plan → TDD → review → security audit → E2E → quality gate |
| Security code review | Generic review | `security-reviewer` agent with OWASP Top 10, BYOC-specific checks |
| DB query review | Generic | `database-reviewer` agent with N+1 detection, pagination enforcement |
| Test writing | After implementation | `tdd-guide` agent writes tests FIRST (TDD) |
| Documentation | Manual | `doc-updater` agent auto-updates CHANGELOG + phase reports |
| PII in logs | Not handled | `pii-redaction` skill with full GDPR/HIPAA/PCI-DSS patterns |
| AWS deployment | Not planned | `aws-deployment` skill with ECS/RDS/WAF/CloudFront full setup |

---

## How ECC Works in Practice

### 1. CLAUDE.md — The Project Bible

When you open Claude Code in the BYOC directory, it automatically reads `CLAUDE.md`. This file tells Claude:
- BYOC is a multi-tenant cybersecurity platform
- Every DB query needs `tenantId`
- Every API route needs auth + RBAC checks
- Every mutation needs an audit log
- The complete directory structure
- All 54 RBAC capabilities
- SIEM, scanner, and compliance architecture

**Result:** Claude starts every session already knowing everything about BYOC. No re-explaining.

### 2. Rules — Always-On Enforcement

Rules in `.claude/rules/` are loaded every session and treated as mandatory instructions:

- **`rules/security.md`** — If Claude writes an API route, it checks: Did I add `getAuthenticatedUser()`? Did I add `hasCapability()`? Did I add `tenantId`? Did I add `createAuditLog()`?
- **`rules/database.md`** — Every Prisma query reviewed for missing `tenantId`, unbounded queries, over-fetching sensitive fields
- **`rules/typescript.md`** — TypeScript patterns, immutability, file size limits, naming conventions

### 3. Agents — Specialized Sub-Processes

When you type `/orchestrate feature "Add threat intelligence feeds"`, Claude:
1. Invokes the **`planner` agent** → creates a phased implementation plan
2. Invokes the **`tdd-guide` agent** → writes tests first, then implements
3. Invokes the **`code-reviewer` agent** → checks quality, React patterns, backend anti-patterns
4. Invokes the **`security-reviewer` agent** → OWASP checks, BYOC-specific security (tenant isolation, audit logs)
5. Returns a final report with SHIP / NEEDS WORK / BLOCKED verdict

Each agent is a specialized Claude instance that only focuses on its domain.

### 4. Skills — Deep Domain Knowledge

Skills are loaded on-demand when Claude detects a relevant task:

- Working on audit logs? → `pii-redaction` skill loads → Claude knows all 18 HIPAA identifiers, `redactForAuditLog()` function pattern, GDPR Article 17/20 requirements
- Writing a new API endpoint? → `api-design` skill loads → Claude knows the exact response envelope format, pagination pattern, error format BYOC uses
- Changing the Prisma schema? → `database-migrations` + `postgres-patterns` skills load → Claude knows zero-downtime migration patterns, index strategies, concurrent index creation

### 5. Commands — Workflow Shortcuts

Instead of typing long instructions, you use slash commands:

```
/new-phase 13 "PII Redaction" "GDPR/HIPAA compliance engine"
```
→ Creates the phase doc in `docs/`, invokes planner + architect, sets up the development workflow

```
/tdd
```
→ Forces test-first development: write failing test → implement → refactor → verify 80%+ coverage

```
/e2e "test the SIEM alert triage flow"
```
→ Generates Playwright tests, runs them, captures screenshots/traces on failure

```
/quality-gate
```
→ Runs: `npx tsc --noEmit` + `npm run build` + `npm audit` + checks E2E pass rate. Only proceeds if all pass.

```
/security-audit new
```
→ Scans recently changed files: checks every API route has auth, every query has tenantId, no hardcoded secrets

---

## What You CAN Do Now (With ECC)

### Development
- ✅ `/new-phase N "Name" "Desc"` — Start any new phase with full planning + docs
- ✅ `/orchestrate feature "..."` — Full TDD → review → security pipeline automatically
- ✅ `/tdd` — Force test-first development on any feature
- ✅ `/build-fix` — Fix TypeScript errors with minimal changes, no regressions

### Testing
- ✅ `/e2e [flow description]` — Generate Playwright tests for any BYOC user flow
- ✅ `/test-coverage` — Check coverage report, find untested paths
- ✅ `/quality-gate` — Pre-merge check: TypeScript + build + security audit
- ✅ Existing 258 E2E tests all run via `npx playwright test`

### Security
- ✅ `/security-audit full` — Full BYOC security audit (tenant isolation, RBAC, audit logs, secrets)
- ✅ `/security-audit new` — Audit only recently changed files (fast, pre-PR)
- ✅ `security-reviewer` agent — Proactively invoked after any auth/API/RBAC code change
- ✅ `pii-redaction` skill — PII/PHI/PCI-DSS patterns for GDPR/HIPAA compliance

### Code Quality
- ✅ `/code-review` — Quality review with severity-graded findings
- ✅ `/refactor-clean` — Dead code removal, unused imports cleanup
- ✅ `database-reviewer` agent — N+1 detection, pagination enforcement
- ✅ `/checkpoint` — Save session state before long operations

### Documentation
- ✅ `/update-docs` — Auto-update CHANGELOG.md + create phase reports
- ✅ `doc-updater` agent — Keeps documentation in sync with code

### Deployment
- ✅ `aws-deployment` skill — Full AWS ECS + RDS + WAF architecture patterns
- ✅ `deployment-patterns` skill — GitHub Actions CI/CD, Docker, rollback strategies
- ✅ `docker-patterns` skill — Dockerfile, Docker Compose for local dev + production

---

## What You CANNOT Do (ECC Limitations)

| Limitation | Reason | Workaround |
|-----------|--------|-----------|
| ECC doesn't auto-run agents | Agents run only when you invoke them or use `/orchestrate` | Make it a habit to use `/orchestrate feature` for all new work |
| ECC doesn't prevent bad commits | Rules guide Claude but don't block `git commit` | Use `/quality-gate` before every PR |
| ECC hooks (auto-tmux, pre-bash reminders) not active | Those hooks require ECC's Node.js scripts installed globally | Optional: install ECC globally via `install.sh` for hook automation |
| Continuous learning not auto-active | `continuous-learning-v2` skill is passive — needs `/learn` to extract patterns | Run `/learn` at end of major sessions to capture patterns |
| Agents don't share memory between sessions | Each agent invocation starts fresh | CLAUDE.md + MEMORY.md compensate for this |
| No real-time monitoring | `loop-operator` runs in sessions, not as a daemon | For actual SIEM monitoring, BYOC's cron scanner handles production |
| MCP servers require setup | GitHub/Railway/Vercel MCPs need tokens configured | Follow setup instructions in `.claude/mcp-servers.json` |

---

## How to Use Claude Code with BYOC

### Starting a New Feature

```
You (in Claude Code):
"I want to add real-time WebSocket streaming for SIEM events"

→ Claude reads CLAUDE.md → knows BYOC architecture
→ Claude reads rules/security.md → will enforce tenantId + auth
→ You type: /new-phase 14 "WebSocket Streaming" "Real-time SSE/WebSocket for SIEM"
→ planner agent creates implementation plan
→ architect agent reviews design
→ You approve → implementation begins
```

### During Implementation

```
You: "implement the SSE endpoint first"

→ tdd-guide agent writes failing test first
→ Claude implements /api/siem/stream route
→ security-reviewer agent checks: auth? tenantId? rate limiting?
→ code-reviewer agent checks: React patterns? error handling?
→ database-reviewer agent checks: are queries paginated? indexed?
```

### Before Merging

```
You: /quality-gate

→ npx tsc --noEmit    → must return 0 errors
→ npm run build       → must succeed
→ npm audit           → must have no HIGH+ vulns
→ npx playwright test → 258+ tests must pass
→ /security-audit new → BYOC security checklist on changed files

Only if ALL pass → commit and PR
```

### After Merging

```
You: /update-docs

→ doc-updater agent reads git diff
→ Updates CHANGELOG.md with what changed
→ Creates docs/PHASE-14-WEBSOCKET-REPORT.md
→ Documents: what was added, why, value, test coverage, bugs found+fixed
```

---

## Prompt Style Guide (How to Talk to Claude)

### Most Effective Patterns

```
# Starting a phase
"start Phase 13 — PII/PHI redaction engine"

# Specific feature
"/orchestrate feature 'Add GDPR data export endpoint for users'"

# Security-sensitive work
"/orchestrate security 'Audit SCIM provisioning endpoints for tenant isolation'"

# Bug fix
"/orchestrate bugfix 'Compliance export returns wrong tenant data when scopeId filter is applied'"

# Quick build fix
"/build-fix"

# Pre-PR check
"/quality-gate"

# E2E for new feature
"/e2e test the GDPR data export and erasure flows"
```

### Less Effective (but still works)

```
# Generic - Claude will still follow rules but less structured
"add a feature to export user data"

# This still works but won't trigger the full phase lifecycle
"fix the bug in compliance export"
```

### For Research/Exploration

```
# Use the research context
"explore how to implement WebSocket streaming in Next.js 16 given our Vercel constraints"

# Claude will read code extensively before suggesting
"how does the SIEM detection engine currently work? i want to add a new evaluator type"
```

---

## ECC vs. Without ECC — Side-by-Side Example

### Feature: Add new API endpoint

**Without ECC:**
```
Prompt: "add an endpoint to export SIEM events as CSV"

Result might be:
- Missing getAuthenticatedUser() check ❌
- Missing hasCapability() check ❌
- Missing tenantId filter ❌ (SECURITY BREACH)
- No audit log ❌
- No pagination ❌ (returns all events — performance issue)
- No E2E test ❌
```

**With ECC:**
```
/orchestrate feature "Add SIEM event CSV export endpoint"

Result:
1. planner: creates plan with auth, pagination, export format, test strategy
2. tdd-guide: writes test first — tests auth, pagination, tenantId isolation, CSV format
3. implementation: forced to make tests pass → auth + tenantId + audit log all required
4. code-reviewer: flags missing rate limiting → adds it
5. security-reviewer: verifies BYOC checklist ✅
6. /e2e: generates Playwright test for the download flow
7. /quality-gate: tsc ✅ build ✅ audit ✅ tests ✅
8. /update-docs: CHANGELOG updated, phase report created

Final code:
✅ getAuthenticatedUser()
✅ hasCapability('siem.read')
✅ tenantId filter
✅ createAuditLog()
✅ Pagination
✅ Rate limiting
✅ E2E test coverage
✅ Documented
```

---

## File Map — What Each ECC File Does

```
.claude/
├── agents/                    ← Specialized Claude sub-processes
│   ├── security-reviewer.md   → OWASP, secrets, BYOC security checklist
│   ├── architect.md           → System design, ADRs, trade-off analysis
│   ├── database-reviewer.md   → PostgreSQL, N+1, tenant isolation, pagination
│   ├── e2e-runner.md          → Playwright tests, POM, CI integration
│   ├── build-error-resolver.md → TypeScript/build error fixes (minimal diffs)
│   ├── code-reviewer.md       → Code quality, React/Next.js patterns
│   ├── planner.md             → Phase planning, phased implementation
│   ├── tdd-guide.md           → Test-first development (RED-GREEN-REFACTOR)
│   ├── refactor-cleaner.md    → Dead code, unused imports
│   ├── doc-updater.md         → CHANGELOG, phase reports, codemaps
│   └── loop-operator.md       → Autonomous loops, SIEM monitoring
│
├── commands/                  ← Slash commands (/orchestrate, /tdd, etc.)
│   ├── orchestrate.md         → Chain agents: feature/bugfix/refactor/security/phase
│   ├── new-phase.md           → BYOC phase kickoff with docs + planning
│   ├── tdd.md                 → Test-first workflow
│   ├── e2e.md                 → Generate + run Playwright tests
│   ├── build-fix.md           → Fix TypeScript/build errors
│   ├── security-audit.md      → Full BYOC security checklist
│   ├── code-review.md         → Quality review
│   ├── quality-gate.md        → Pre-merge: tsc + build + audit + tests
│   ├── update-docs.md         → Update CHANGELOG + docs
│   ├── test-coverage.md       → Coverage report
│   ├── refactor-clean.md      → Dead code cleanup
│   ├── plan.md                → Feature planning
│   ├── checkpoint.md          → Save/restore session state
│   └── learn.md               → Extract reusable patterns from session
│
├── skills/                    ← Domain knowledge loaded on-demand
│   ├── pii-redaction/         → GDPR/HIPAA/PCI-DSS redaction patterns (BYOC-custom)
│   ├── aws-deployment/        → ECS Fargate, RDS, WAF, CI/CD (BYOC-custom)
│   ├── security-review/       → OWASP checklist with TypeScript examples
│   ├── security-scan/         → AgentShield config auditing
│   ├── api-design/            → REST conventions BYOC follows
│   ├── postgres-patterns/     → PostgreSQL index/query/RLS patterns
│   ├── database-migrations/   → Zero-downtime Prisma migrations
│   ├── backend-patterns/      → API, middleware, caching patterns
│   ├── frontend-patterns/     → React/Next.js state, rendering
│   ├── e2e-testing/           → Playwright POM, CI/CD, flaky tests
│   ├── tdd-workflow/          → TDD methodology (80%+ coverage)
│   ├── deployment-patterns/   → Docker, GitHub Actions, rollback
│   ├── docker-patterns/       → Container security, Compose, networking
│   ├── enterprise-agent-ops/  → Long-lived agent lifecycle, observability
│   ├── agentic-engineering/   → Eval-first, cost-aware model routing
│   ├── coding-standards/      → Universal TypeScript standards
│   ├── clickhouse-io/         → Analytics DB for SIEM at scale
│   ├── verification-loop/     → Pre-release verification checklist
│   └── continuous-learning-v2/ → Session pattern extraction
│
├── rules/                     ← Always-enforced guidelines (loaded every session)
│   ├── security.md            → BYOC: tenantId, auth, RBAC, audit log (CRITICAL)
│   ├── database.md            → BYOC: tenant isolation, pagination, sensitive fields
│   ├── typescript.md          → BYOC: TypeScript patterns, file sizes, naming
│   ├── common/                → Universal: testing, coding style, git, patterns
│   └── typescript/            → TypeScript-specific: testing, patterns, security
│
├── contexts/                  ← Execution mode settings
│   ├── dev.md                 → Implementation mode (write code, run tsc)
│   ├── review.md              → Audit mode (BYOC security checklist)
│   └── research.md            → Exploration mode (read before writing)
│
└── mcp-servers.json           ← Tool integrations (GitHub, Railway, Vercel, Playwright)

CLAUDE.md (root)               ← Loaded first in every session — BYOC project bible
docs/MASTER-ROADMAP.md         ← Phases 13-22 feature specs and priority queue
```

---

## Quick Reference Card

| Goal | Command/Agent |
|------|--------------|
| Start new phase | `/new-phase N "Name" "Desc"` |
| Build a feature (full pipeline) | `/orchestrate feature "..."` |
| Fix a bug | `/orchestrate bugfix "..."` |
| Security audit | `/orchestrate security "..."` or `/security-audit full` |
| Write tests first | `/tdd` |
| Run E2E tests | `/e2e [flow]` or `npx playwright test` |
| Fix TypeScript errors | `/build-fix` |
| Pre-PR quality check | `/quality-gate` |
| Update docs | `/update-docs` |
| Clean dead code | `/refactor-clean` |
| Save session state | `/checkpoint` |
| Extract patterns | `/learn` |

---

*This document lives at `docs/ECC-HOW-IT-WORKS.md`*
*Source: https://github.com/affaan-m/everything-claude-code (MIT License)*
*BYOC customizations: pii-redaction skill, aws-deployment skill, BYOC-specific rules and commands*
