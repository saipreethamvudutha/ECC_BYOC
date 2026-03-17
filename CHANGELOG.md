# BYOC Changelog

All notable changes to the BYOC Cybersecurity Platform are documented here.

---

## [1.4.0] — 2026-03-16 — Phase 12D: CIS v8.1 Linux Benchmark + Enterprise DB Schema

### Added

**CIS v8.1 Linux Benchmark — 12 new SSH check modules (~55 controls)**
- `cis-filesystem-mounts` — /tmp, /var/tmp, /dev/shm mount options (CIS 1.1.x), sticky bit check
- `cis-unnecessary-services` — 14 services including xinetd, avahi, CUPS, rsync (CIS 2.x)
- `cis-network-parameters` — 9 sysctl parameters: IP forwarding, ICMP redirects, SYN cookies (CIS 3.x)
- `cis-auditd-service` — auditd active/enabled + audit=1 kernel parameter (CIS 4.1.1–4.1.3)
- `cis-auditd-rules` — 5 audit rule categories: shadow, passwd, sudoers, privileged, network (CIS 4.1.4–4.1.17)
- `cis-rsyslog` — rsyslog active/enabled + FileCreateMode check (CIS 4.2.x)
- `cis-cron-permissions` — ownership and mode for 6 cron paths (CIS 5.1.x)
- `cis-ssh-hardening` — deep sshd -T parse: 22 directives including Ciphers, MACs, KexAlgorithms (CIS 5.2.1–5.2.22)
- `cis-pam-password` — pwquality minlen, pam_faillock, login.defs PASS_MAX_DAYS/PASS_MIN_DAYS (CIS 5.3/5.4)
- `cis-sudo-hardening` — use_pty, log_file, NOPASSWD detection (CIS 5.3.4–5.3.5)
- `cis-user-group-audit` — empty passwords, UID-0 non-root, duplicate UIDs/GIDs (CIS 6.2.x)
- `cis-file-integrity` — /etc/passwd+shadow+group permissions, world-writable files, unowned files (CIS 6.1.x)

**CIS Control Mapping Registry (`src/lib/scanner/checks/cis-mappings.ts`)**
- 55 CIS v8.1 Linux controls registered with IDs, levels (1/2), families, descriptions, and remediation guidance
- Families: filesystem (12), services (6), network (7), logging (9), access (15), maintenance (6)
- `getCisControl(id)` and `getCisControlsByFamily(family)` utility functions

**CIS Control IDs wired into all 8 existing SSH modules**
- All `ssh-*` check modules now emit `cisControlId`, `cisLevel`, `checkModuleId`, `detectionMethod` in details

**Enterprise DB Schema (4 new models, ~40 new fields)**
- `ScanPolicy` model — reusable scheduled scan configurations with target tag filters
- `ScanTemplate` model — preset check module lists for customized scan types
- `AssetVulnerability` model — canonical cross-scan finding deduplication per asset
- `ScanExecution` model — per-check batch execution audit log
- Asset model: +11 fields (`riskScore`, `vulnerabilityCount`, `criticalCount`, `highCount`, `environment`, `isProduction`, `complianceScope`, `slaDays`, `dataClassification`, `scanFrequency`, `lastRiskScoredAt`)
- Scan model: +5 fields (`findingsSummary`, `complianceScore`, `scanDurationSeconds`, `percentageComplete`, `engineVersion`)
- ScanResult model: +12 fields (`deduplicationHash`, `firstDiscovered`, `lastSeen`, `assignedTo`, `remediationTargetDate`, `cweId`, `cvssVector`, `epssScore`, `checkModuleId`, `detectionMethod`, `cisControlId`, `cisLevel`)
- 6 new performance indices on ScanResult (`assetId`, `tenantId+severity`, `tenantId+status`, `deduplicationHash`) and Scan (`tenantId+createdAt`)

**Scanner Engine Enhancements (`src/lib/scanner/index.ts`)**
- SHA-256 deduplication hash computed for every finding: `tenantId:assetId:checkModuleId:titleSlug`
- `AssetVulnerability` upsert on every finding — persists across scans, tracks `firstDiscoveredAt`/`lastSeenAt`
- Asset `vulnerabilityCount`, `criticalCount`, `highCount` updated after each scan completes
- `checkModuleId`, `detectionMethod`, `cisControlId`, `cisLevel` stored on every ScanResult

**Adapter Updates**
- `compliance` scan type: +12 CIS SSH check modules
- `enterprise` scan type: +12 CIS SSH check modules
- `authenticated` scan type: +12 CIS SSH check modules (between SSH and WinRM checks)
- Both nmap and builtin adapters updated

### Changed
- `cis-benchmark.ts` NSE-based findings now emit `checkModuleId: 'cis-benchmark'` + `detectionMethod: 'network'`
- `ssh.ts` all 8 modules now include `checkModuleId`, `cisControlId`, `cisLevel`, `detectionMethod` in details

---

## [1.3.0] — 2026-03-16 — Phase 12C: SSH/WinRM Authenticated Scanning + Diff Engine + Parallel Nmap

### Added

**Credential Vault (AES-256-GCM encrypted SSH/WinRM credentials)**
- `CredentialVault` DB model — stores encrypted username, secret, passphrase
- `ScanTargetCredential` DB model — maps credentials to scan targets
- `ScanDiff` DB model — persists delta between two completed scans
- `src/lib/scanner/vault/index.ts` — `encryptCredential()`, `decryptCredential()`, `toCredentialSummary()` (secrets never in API responses)

**SSH Connector (8 check modules)**
- `ssh-os-info` — uname + /etc/os-release via authenticated SSH
- `ssh-user-accounts` — active users from /etc/passwd, flags UID 0 accounts
- `ssh-sudo-config` — detects NOPASSWD sudo rules (high severity)
- `ssh-listening-services` — ss/netstat including localhost-only services
- `ssh-installed-packages` — dpkg/rpm software inventory (up to 200 packages)
- `ssh-file-permissions` — checks /etc/shadow world-readable (critical)
- `ssh-cron-jobs` — /etc/crontab + cron.d inventory
- `ssh-sshd-config` — PermitRootLogin / PasswordAuthentication / PermitEmptyPasswords

**WinRM Connector (7 check modules)**
- `winrm-os-info` — Win32_OperatingSystem via PowerShell
- `winrm-local-users` — Get-LocalUser inventory
- `winrm-local-admins` — Administrators group membership
- `winrm-services` — Running Windows services
- `winrm-installed-software` — Registry-based software inventory
- `winrm-firewall-rules` — Active inbound allow rules
- `winrm-patches` — Get-HotFix with >30-day staleness detection (high severity)

**Scan Diff Engine**
- `src/lib/scanner/diff/engine.ts` — fingerprint-based finding comparison (new/resolved/persistent/changed)
- `src/lib/scanner/diff/index.ts` — persist diff to DB, emit SIEM events for new critical/high findings
- Risk trend classification: increasing / decreasing / stable
- 1-hour result caching with idempotent recompute

**Parallel Nmap Execution**
- `runNmapParallel()` in `src/lib/scanner/nmap/executor.ts` — semaphore-limited concurrency (default 5)
- Custom port range support in `nmap-port-scan.ts` with injection-prevention allowlist regex (`[0-9,\-TU]+`)

**New Scan Type: `authenticated`**
- Combined Nmap + SSH + WinRM checks per target
- Credentials injected per-target at execution time
- Nmap adapter: full 19-check authenticated profile
- Builtin adapter: graceful fallback (HTTP/SSL/port checks only)

**New API Routes (8 total)**
- `GET/POST /api/credentials` — list and create credentials
- `GET/PUT/DELETE /api/credentials/:id` — get, update, delete credential
- `POST /api/credentials/:id/test` — live connectivity test (returns success:false not 500 on unreachable)
- `GET/POST /api/scans/:id/diff` — retrieve and compute scan diff

**RBAC Capabilities (+2)**
- `scan.credential.view` (medium risk) — list credential names/types
- `scan.credential.manage` (critical risk) — create/update/delete/test credentials

**E2E Tests**
- 25 new tests in `tests/e2e/18-phase12c.spec.ts`

### Changed
- `next.config.ts` — added `serverExternalPackages: ["ssh2"]` for native module compatibility
- `prisma/schema.prisma` — 3 new models, relations on Tenant/User/Scan
- `src/app/api/scans/create/route.ts` — `authenticated` added to valid types, `targetCredentials` array support
- `src/lib/scanner/adapters/nmap.ts` — `authenticated` scan type with full check module list
- `src/lib/scanner/adapters/builtin.ts` — `authenticated` fallback type
- `src/lib/scanner/index.ts` — credential injection from vault for authenticated scans

### Dependencies
- `ssh2` — SSH2 client for Node.js (CJS, server-external)
- `@types/ssh2` (dev) — TypeScript definitions

---

## [1.2.0] — 2026-03-16 — Developer Infrastructure Pass 2: Complete AI Dev Stack + PII Redaction Skill + AWS Roadmap

### Added

**14 Additional Skills from everything-claude-code + 2 BYOC-custom:**
`backend-patterns`, `deployment-patterns`, `docker-patterns`, `database-migrations`, `e2e-testing`, `frontend-patterns`, `tdd-workflow`, `verification-loop`, `security-scan`, `enterprise-agent-ops`, `agentic-engineering`, `coding-standards`, `clickhouse-io`, `continuous-learning-v2`, **`pii-redaction`** (custom), **`aws-deployment`** (custom)

**4 Additional Agents:** `tdd-guide`, `refactor-cleaner`, `doc-updater`, `loop-operator`

**9 Additional Commands:** `/tdd`, `/plan`, `/code-review`, `/quality-gate`, `/update-docs`, `/test-coverage`, `/refactor-clean`, `/checkpoint`, `/learn`

**12 Additional Rules:** `common/testing`, `common/coding-style`, `common/git-workflow`, `common/patterns`, `common/performance`, `common/development-workflow`, `common/agents`, `typescript/testing`, `typescript/patterns`, `typescript/coding-style`, `typescript/security`, `typescript/hooks`

**New Documents:**
- `docs/MASTER-ROADMAP.md` — Phases 13–22 with full feature specs, test plans, and priority queue
- Updated `CLAUDE.md` — Complete Phase Lifecycle workflow, all commands and skills documented

**PII/PHI Redaction Skill** (`.claude/skills/pii-redaction/SKILL.md`):
- Covers all 18 HIPAA identifiers, GDPR personal data categories, PCI-DSS cardholder data
- `redactForAuditLog()` — strip PII before storing in audit logs
- `sanitizeForResponse()` — exclude sensitive fields (passwordHash, mfaSecret) from API responses
- GDPR Art. 20 data export + Art. 17 erasure patterns
- Compliance mapping: GDPR, HIPAA, PCI-DSS, CCPA

**AWS Deployment Skill** (`.claude/skills/aws-deployment/SKILL.md`):
- ECS Fargate architecture (replacing Vercel Hobby)
- Production Dockerfile with multi-stage build + non-root user
- GitHub Actions CI/CD pipeline (test → security-scan → build → deploy → migrate)
- RDS PostgreSQL Multi-AZ + ElastiCache Redis + WAF + CloudFront
- AWS Secrets Manager replacing `.env.local`
- Migration plan: Vercel → AWS with zero-downtime cutover

### Development Workflow Codified
Complete phase lifecycle: `/new-phase → /tdd → implement → /code-review → /security-audit → /e2e → /quality-gate → /update-docs → PR`

---

## [1.1.0] — 2026-03-16 — Developer Infrastructure: everything-claude-code Integration

### Feature: AI-Powered Development Infrastructure

**What:** Integrated the `everything-claude-code` (ECC) open-source plugin ecosystem into BYOC's `.claude/` configuration directory to dramatically accelerate future development, enforce security standards, and provide structured agent-driven workflows.

**Why:** BYOC is a production cybersecurity platform with complex, security-critical code. As the product scales, maintaining consistent security standards (tenant isolation, RBAC, audit logging) across 108+ API routes becomes increasingly error-prone without automation. ECC provides battle-tested tooling for exactly this.

**Value Added:**
- Claude Code now understands BYOC's full architecture on every session start (CLAUDE.md)
- Security violations (missing tenantId, missing audit log, missing RBAC) are caught by automated rules before merge
- Specialized agents reduce the mental overhead of security reviews, DB optimization, and test writing
- Workflow commands (`/orchestrate`, `/new-phase`) standardize how new phases are built
- Persistent memory means no context re-explanation at the start of each session

### Added

#### `CLAUDE.md` — Comprehensive Project Guide
**File:** `CLAUDE.md` (root)
**Reason:** Claude Code reads this file at session start. Without it, every session required re-explaining BYOC's architecture (tenantId everywhere, RBAC pattern, audit log requirement, 108 API routes, etc.). Now this context is always available.
**Value:** Zero context-loss across sessions. Claude immediately knows: stack, file structure, auth pattern, RBAC capabilities, DB rules, scanner architecture, SIEM design, deployment setup.

#### `.claude/agents/` — 7 Specialized Sub-Agents
**Source:** everything-claude-code open-source repo
**Reason:** Complex security tasks need domain expertise. A generic Claude session won't proactively check for tenant isolation violations or N+1 Prisma queries. Specialized agents are focused and thorough.

| Agent | File | Purpose | When to Use |
|-------|------|---------|-------------|
| `security-reviewer` | `.claude/agents/security-reviewer.md` | OWASP Top 10, secrets, injection, auth bypass detection | After writing any API route, auth code, or RBAC change |
| `architect` | `.claude/agents/architect.md` | System design, scalability, ADRs, trade-off analysis | When designing new phases or major refactors |
| `database-reviewer` | `.claude/agents/database-reviewer.md` | PostgreSQL optimization, N+1 detection, tenant isolation audit | After writing Prisma queries or schema changes |
| `e2e-runner` | `.claude/agents/e2e-runner.md` | Playwright E2E test generation and execution | For every new feature to maintain 258+ test suite |
| `build-error-resolver` | `.claude/agents/build-error-resolver.md` | TypeScript and Next.js build error fixes | When `npm run build` or `npx tsc --noEmit` fails |
| `code-reviewer` | `.claude/agents/code-reviewer.md` | Code quality, React patterns, backend anti-patterns | After writing any new code |
| `planner` | `.claude/agents/planner.md` | Feature implementation planning with phases | Before starting a new feature or phase |

#### `.claude/rules/` — 3 Mandatory Rule Files
**Reason:** Rules are loaded by Claude Code automatically and enforced on every session. They encode BYOC's security requirements as hard constraints rather than suggestions.

| File | Coverage | Value |
|------|---------|-------|
| `security.md` | Pre-commit checklist, tenant isolation, API route template, audit log requirement, secrets management | Prevents the most common security mistakes in BYOC |
| `typescript.md` | TS typing, immutability, Next.js patterns, import order, naming conventions, file size limits | Consistent, maintainable code across 100+ files |
| `database.md` | Tenant isolation enforcement, pagination requirements, transaction patterns, N+1 prevention, sensitive field exclusion | Catches DB security issues before they reach production |

#### `.claude/commands/` — 5 Slash Commands
**Reason:** Repeatable workflows for the most common BYOC development tasks. Instead of manually chaining agents, one command triggers the full workflow.

| Command | File | Workflow | Value |
|---------|------|---------|-------|
| `/orchestrate` | `orchestrate.md` | Chains planner → tdd-guide → code-reviewer → security-reviewer | Standardized feature implementation with no shortcuts |
| `/e2e` | `e2e.md` | Generates + runs Playwright tests for BYOC flows | Maintains 258+ E2E test suite without manual test writing |
| `/build-fix` | `build-fix.md` | Fixes TS/build errors with minimal diffs | Quick, safe build recovery |
| `/security-audit` | `security-audit.md` | Full BYOC security checklist: RBAC, tenant isolation, audit log coverage | Pre-release or pre-client-demo security gate |
| `/new-phase` | `new-phase.md` | Creates phase doc + kicks off planner + architect | Standardized phase kickoff with documentation from day one |

#### `.claude/skills/` — 3 Domain Knowledge Skills
**Source:** everything-claude-code
**Reason:** Skills provide deep domain knowledge that agents reference when needed.

| Skill | Value |
|-------|-------|
| `security-review` | OWASP Top 10 patterns, secrets checklist, file upload validation, CSP configuration |
| `api-design` | REST conventions, pagination, error formats, rate limiting patterns |
| `postgres-patterns` | Index patterns, RLS, cursor pagination, covering indexes, UPSERT patterns |

#### `.claude/contexts/` — 3 Execution Contexts
| Context | Mode | When to Use |
|---------|------|------------|
| `dev.md` | Implementation | Building features, fixing bugs |
| `review.md` | Audit | Code review, security audits |
| `research.md` | Exploration | Understanding codebase, planning features |

#### `.claude/mcp-servers.json` — MCP Server Configuration
**Tools configured:** GitHub (PR/issue management), Railway (PostgreSQL management), Vercel (deployment management), Playwright (browser automation)
**Reason:** Claude Code can directly inspect Railway DB, manage Vercel deployments, create GitHub PRs, and run browser tests — all without leaving the conversation.

#### `memory/MEMORY.md` — Persistent Session Memory
**File:** `~/.claude/projects/.../memory/MEMORY.md`
**Reason:** Persists key project facts across sessions — phase history, non-negotiable rules, file paths, DB conventions, deployment info. Claude doesn't need to re-discover these facts every session.
**Value:** ~10 minutes saved per session on context-setting; zero risk of forgetting the tenantId rule.

### Installation Notes

All files were sourced from `https://github.com/affaan-m/everything-claude-code` (MIT license).
Only security, TypeScript, database, and architecture-relevant components were installed — media, social, and other irrelevant skills were skipped to keep the configuration lean.

No new npm dependencies were added. All `.claude/` files are configuration only.

---

## [1.0.1] — 2026-03-08 — Post-Phase 7: Dashboard Performance + Notification Bell

### Fixed
- **Dashboard API latency** — Compliance framework query was running sequentially after the main `Promise.all` block, adding ~500ms to every dashboard load. Moved into the parallel query block so all 8 dashboard queries execute concurrently.
- **Notification bell non-functional** — Bell icon in the topbar had no click handler (purely cosmetic). Replaced with a fully interactive alert dropdown that:
  - Fetches live SIEM alerts on component mount
  - Displays up to 5 open/investigating alerts with severity badges (critical/high/medium/low), source labels, and relative timestamps
  - Pulsing red badge with open alert count
  - "View all in SIEM" footer link navigates to `/siem`
  - Click-outside-to-close behavior matching the user menu pattern

### Changed
| File | Change |
|------|--------|
| `src/app/api/dashboard/route.ts` | Moved `complianceFramework.findMany` into `Promise.all` (8 parallel queries, 0 sequential) |
| `src/components/layout/topbar.tsx` | Full notification dropdown with live SIEM alert data, severity icons, click handling |

---

## [1.0.0] — 2026-03-07 — Phase 7: Built-in Vulnerability Scanner Engine

Phase 7: Scanner Engine + Downstream Integration | 93 routes, 0 TypeScript errors, 213/213 E2E tests

### Added
- **Vulnerability Scanner Engine** — 8 real network check modules (HTTP headers, SSL/TLS, port scan, exposed panels, info disclosure, common CVEs, DNS checks, cloud misconfig) using only Node.js built-in modules (`net`, `tls`, `dns`, `https`). Zero external dependencies.
- **Vulnerability Database** (`src/lib/scanner/vulnerability-db.ts`) — ~50 real CVE entries with titles, descriptions, CVSS scores, severity ratings, and remediation guidance
- **Chunked Execution Model** — Each `/api/scans/[id]/execute` call runs 2 check modules (< 7s), saves progress to DB, returns. Client polls until completed. Designed for Vercel's 10s serverless timeout.
- **Scanner Adapter Pattern** — `ScannerAdapter` interface with `BuiltinAdapter` implementation. Extensible for future Nuclei integration.
- **Scan Detail Page** (`/scans/[id]`) — Severity stat cards, progress bar, expandable findings table with CVE links, CVSS scores, remediation, status actions (Acknowledge/Resolve/False Positive), CSV/JSON export
- **Asset Detail Page** (`/assets/[id]`) — Risk score, open findings count, last scan timestamp, IP/hostname, severity breakdown, related findings from all scans, tags
- **AI Actions PATCH endpoint** (`/api/ai-actions/[id]`) — Approve, reject, execute AI action suggestions with audit logging
- **Scan Results API** (`/api/scans/[id]/results`) — Paginated findings with severity/status filters, custom severity sort order
- **Finding Status Updates** (`/api/scans/[id]/results/[resultId]`) — Update finding status: open → acknowledged / resolved / false_positive
- **Scan Export** (`/api/scans/[id]/export`) — CSV and JSON export with Content-Disposition headers
- **Seed Data** — 3 completed scans (30 real findings), 12 SIEM events, 3 alerts, 8 AI actions for production demo
- **22 new E2E tests** (`15-scanner-engine.spec.ts`) covering scanner API, scan detail UI, asset detail UI, and downstream integration

### Changed
- **Scan create route** (`/api/scans/create`) — Removed `setTimeout` mock; now initializes progress tracking, auto-creates Asset records for unknown targets, uses `checkCapability` (v2)
- **Scans list page** (`/scans`) — Scan rows now clickable, link to `/scans/[id]` detail page
- **Assets list page** (`/assets`) — Asset rows now clickable, link to `/assets/[id]` detail page
- **AI Actions page** (`/ai-actions`) — Approve/reject buttons now functional via PATCH endpoint
- **Prisma schema** — Added `progress` field to Scan model

### New Files (22)
| File | Purpose |
|------|---------|
| `src/lib/scanner/types.ts` | Scanner engine TypeScript interfaces |
| `src/lib/scanner/vulnerability-db.ts` | ~50 real CVE entries with remediation |
| `src/lib/scanner/index.ts` | Engine orchestration + batch execution |
| `src/lib/scanner/adapters/builtin.ts` | Built-in adapter for check modules |
| `src/lib/scanner/checks/http-headers.ts` | HTTP security header analysis |
| `src/lib/scanner/checks/ssl-tls.ts` | SSL/TLS certificate + protocol checks |
| `src/lib/scanner/checks/port-scan.ts` | TCP port scanning (15 common ports) |
| `src/lib/scanner/checks/exposed-panels.ts` | Admin panel detection |
| `src/lib/scanner/checks/info-disclosure.ts` | Server info + file exposure |
| `src/lib/scanner/checks/common-cves.ts` | Known CVE signature detection |
| `src/lib/scanner/checks/dns-checks.ts` | DNS security record validation |
| `src/lib/scanner/checks/cloud-misconfig.ts` | Cloud storage + metadata exposure |
| `src/app/api/scans/[id]/route.ts` | Scan detail API |
| `src/app/api/scans/[id]/execute/route.ts` | Chunked scan execution |
| `src/app/api/scans/[id]/results/route.ts` | Findings list with filters |
| `src/app/api/scans/[id]/results/[resultId]/route.ts` | Finding status updates |
| `src/app/api/scans/[id]/export/route.ts` | CSV/JSON export |
| `src/app/api/assets/[id]/route.ts` | Asset detail with findings |
| `src/app/api/ai-actions/[id]/route.ts` | AI action state management |
| `src/app/(dashboard)/scans/[id]/page.tsx` | Scan detail page |
| `src/app/(dashboard)/assets/[id]/page.tsx` | Asset detail page |
| `tests/e2e/15-scanner-engine.spec.ts` | 22 E2E tests |

### New API Endpoints (7 route files)
| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| GET | `/api/scans/[id]` | Scan detail + severity counts | `scan.view` |
| POST | `/api/scans/[id]/execute` | Execute next check batch | `scan.execute` |
| GET | `/api/scans/[id]/results` | Paginated findings list | `scan.view` |
| PATCH | `/api/scans/[id]/results/[resultId]` | Update finding status | `scan.execute` |
| GET | `/api/scans/[id]/export` | Export as CSV/JSON | `scan.export` |
| GET | `/api/assets/[id]` | Asset detail + related findings | `asset.view` |
| PATCH | `/api/ai-actions/[id]` | Approve/reject/execute AI action | `ai.approve.standard` |

### Build Metrics
- Routes: 87 → 93 (+6)
- E2E tests: 191 → 213 (+22)
- TypeScript errors: 0
- Scanner check modules: 0 → 8
- Vulnerability DB entries: 0 → ~50 real CVEs
- Detail pages: 0 → 2

---

## [0.9.0] — 2026-03-06 — Phase 6: Enterprise SSO, MFA & SCIM 2.0

### Added
- **Multi-Factor Authentication (TOTP)** — Full MFA lifecycle: setup with QR code, confirm with first code, 10 single-use backup codes, login verification, disable with code proof. Uses `otpauth` + `qrcode` libraries, RFC 6238 compliant.
- **Single Sign-On (OAuth 2.0 OIDC)** — OAuth flow with PKCE for Google, Azure AD (Entra ID), and Okta. JIT user provisioning, account linking by email, domain-scoped providers. Dynamic SSO buttons on login page.
- **SCIM 2.0 Provisioning** — Full SCIM 2.0 server: Users (CRUD + filter + pagination), Groups (role mapping), ServiceProviderConfig, Schemas, ResourceTypes. Bearer token auth with bcrypt hashing.
- **Encryption Library** (`src/lib/encryption.ts`) — AES-256-GCM encrypt/decrypt with PBKDF2 key derivation from AUTH_SECRET. Used for MFA secrets and SSO client secrets at rest.
- **TOTP Library** (`src/lib/totp.ts`) — TOTP secret generation, QR code rendering, code verification with ±1 window tolerance, backup code generation and hashing.
- **OAuth Library** (`src/lib/oauth.ts`) — PKCE (S256) generation, authorization URL builders for 3 providers, code-for-token exchange, userinfo fetch, state management.
- **SCIM Library** (`src/lib/scim.ts`) — SCIM-to-User schema mapping, filter parsing (`userName eq "x"`), ListResponse/ErrorResponse builders, SCIM token authentication.
- **Identity Settings Page** (`/settings/identity`) — SSO provider management (add/edit/delete providers, test connection) and SCIM token management (create/revoke tokens, copy base URL). Gated by `admin.sso.manage` and `admin.scim.manage`.
- **4 new RBAC capabilities**: `admin.sso.view`, `admin.sso.manage`, `admin.scim.view`, `admin.scim.manage` (50 total)
- **2 new Prisma models**: `SSOProvider` (OAuth provider config per tenant) and `SCIMToken` (SCIM bearer tokens per tenant)
- **25 new E2E tests** (`14-sso-mfa-scim.spec.ts`) covering MFA, SSO, SCIM, capabilities, and navigation

### Changed
- **Login page** (`login/page.tsx`) — Added SSO provider buttons (dynamically loaded), MFA verification form with backup code toggle, Suspense boundary for `useSearchParams()`
- **Login API** (`/api/auth/login`) — Returns `mfaRequired: true` + `mfaPendingToken` cookie when MFA enabled, instead of immediate session creation
- **Auth library** (`auth.ts`) — `authenticateUser()` now returns MFA-pending state for MFA-enabled users
- **Security settings** (`security/page.tsx`) — Added MFA section: enable/disable MFA with QR code setup flow, backup codes display, status indicator
- **Settings layout** — Added "Identity" tab with Globe icon for SSO + SCIM management
- **Middleware** — Added SSO/MFA/SCIM paths to `publicPaths` and `csrfExemptPaths`
- **`/api/auth/me`** — Now returns `mfaEnabled` field from database for frontend MFA status checks
- **Capability counts updated**: Platform Admin 46→50, Org Admin 45→49, Auditor 17→19
- **Existing E2E tests** — Updated hardcoded capability counts in `05-roles`, `07-rbac-enforcement`, `12-multi-role-access`

### New Files (23)
| File | Purpose |
|------|---------|
| `src/lib/encryption.ts` | AES-256-GCM encrypt/decrypt using AUTH_SECRET |
| `src/lib/totp.ts` | TOTP secret generation, verification, QR codes, backup codes |
| `src/lib/oauth.ts` | OAuth PKCE flow, provider URL builders, token exchange |
| `src/lib/scim.ts` | SCIM user/group schema mapping, filter parsing, response builders |
| `src/app/api/auth/mfa/setup/route.ts` | MFA enrollment initiation |
| `src/app/api/auth/mfa/confirm/route.ts` | MFA enrollment confirmation |
| `src/app/api/auth/mfa/verify/route.ts` | MFA verification during login |
| `src/app/api/auth/mfa/disable/route.ts` | MFA disable |
| `src/app/api/auth/sso/authorize/route.ts` | OAuth authorization redirect |
| `src/app/api/auth/sso/callback/route.ts` | OAuth callback handler |
| `src/app/api/auth/sso/providers/route.ts` | Public: list enabled SSO providers |
| `src/app/api/sso/providers/route.ts` | Admin: SSO provider CRUD (GET, POST) |
| `src/app/api/sso/providers/[id]/route.ts` | Admin: SSO provider (PATCH, DELETE) |
| `src/app/api/scim/v2/Users/route.ts` | SCIM user list + create |
| `src/app/api/scim/v2/Users/[id]/route.ts` | SCIM user get + update + delete |
| `src/app/api/scim/v2/Groups/route.ts` | SCIM group list |
| `src/app/api/scim/v2/Groups/[id]/route.ts` | SCIM group get + member management |
| `src/app/api/scim/v2/ServiceProviderConfig/route.ts` | SCIM discovery |
| `src/app/api/scim/v2/Schemas/route.ts` | SCIM schema advertisement |
| `src/app/api/scim/tokens/route.ts` | SCIM token CRUD (GET, POST) |
| `src/app/api/scim/tokens/[id]/route.ts` | SCIM token revoke (DELETE) |
| `src/app/(dashboard)/settings/identity/page.tsx` | SSO + SCIM settings page |
| `tests/e2e/14-sso-mfa-scim.spec.ts` | 25 E2E tests for Phase 6 |

### New API Endpoints (10 route files, ~20 HTTP methods)
| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| POST | `/api/auth/mfa/setup` | MFA enrollment initiation | Session |
| POST | `/api/auth/mfa/confirm` | MFA enrollment confirmation | Session |
| POST | `/api/auth/mfa/verify` | MFA verification during login | MFA cookie |
| POST | `/api/auth/mfa/disable` | MFA disable | Session + TOTP |
| GET | `/api/auth/sso/authorize` | OAuth authorization redirect | Public |
| GET | `/api/auth/sso/callback` | OAuth callback handler | Public |
| GET | `/api/auth/sso/providers` | List enabled SSO providers | Public |
| GET/POST | `/api/sso/providers` | Admin SSO provider management | `admin.sso.manage` |
| PATCH/DELETE | `/api/sso/providers/[id]` | Admin SSO provider update/delete | `admin.sso.manage` |
| GET/POST | `/api/scim/tokens` | SCIM token management | `admin.scim.manage` |
| DELETE | `/api/scim/tokens/[id]` | Revoke SCIM token | `admin.scim.manage` |
| GET/POST | `/api/scim/v2/Users` | SCIM user provisioning | Bearer token |
| GET/PATCH/DELETE | `/api/scim/v2/Users/[id]` | SCIM user management | Bearer token |
| GET | `/api/scim/v2/Groups` | SCIM group list | Bearer token |
| GET/PATCH | `/api/scim/v2/Groups/[id]` | SCIM group management | Bearer token |
| GET | `/api/scim/v2/ServiceProviderConfig` | SCIM discovery | Bearer token |
| GET | `/api/scim/v2/Schemas` | SCIM schema advertisement | Bearer token |

### Build Metrics
- Routes: 77 → 87 (+10)
- E2E tests: 166 → 191 (+25)
- TypeScript errors: 0
- Capabilities: 46 → 50 (+4)
- Prisma models: 20 → 22 (+2)
- NPM packages added: `otpauth`, `qrcode`, `@types/qrcode`

---

## [0.8.0] — 2026-03-06 — Phase 5B: Compliance Module — Enterprise Features

### Added
- **Assessment Dialog** — Full assessment workflow replacing inline dropdowns: status selection, findings/notes textarea, evidence references (add/remove list), remediation plan (conditional), due date input
- **Evidence Capture** — Text-based evidence references stored as JSON arrays (e.g., "SOC2 Report Q3 2025", "Pen Test Jan 2026 — Section 4.2"); evidence count badges displayed on controls
- **Assessment History Timeline** — Per-control expandable timeline showing all `ComplianceAssessment` records with assessor name, status badge, relative time, findings, evidence, remediation plans; vertical connector dots colored by status
- **Export Compliance Reports** — CSV and JSON export with framework filtering; CSV columns: Framework, Version, ControlID, Title, Category, Status, LastAssessedAt, NextReviewAt, EvidenceCount, Notes; JSON includes full stats; audit-logged
- **Framework Management UI** — Toggle `isActive` on frameworks via management dialog; deactivated frameworks hidden from main view but data preserved; supports description updates
- **History API** (`GET /api/compliance/history?controlId=xxx`) — Returns all assessment records for a control, resolves assessor names, ordered by most recent
- **Export API** (`GET /api/compliance/export?format=csv|json&framework=all|{id}`) — Server-side export with Content-Disposition attachment headers and date-stamped filenames
- **Framework Management API** (`PATCH /api/compliance/frameworks/{id}`) — Toggle isActive, update description; tenant-scoped with audit logging
- **14 new E2E tests** (`13-compliance-features.spec.ts`) covering all 4 features: dialog interaction, API validation, history timeline, export formats, framework toggle

### Changed
- **Compliance PATCH API** (`/api/compliance/update`) — Now persists `evidence` (validated string array), `remediationPlan`, `dueDate` in ComplianceAssessment; updates `ComplianceControl.nextReviewAt` from dueDate; enriched audit log with evidence count
- **Compliance GET API** (`/api/compliance`) — Returns `evidence` (parsed JSON), `notes`, `assignedTo` per control; added `?includeInactive=true` query param for framework management
- **Compliance page** (`compliance/page.tsx`) — Complete rewrite (686 lines): assessment dialog, expandable history rows, export UI with framework filter, framework management dialog; all features RBAC-gated (`compliance.assess`, `compliance.export`, `compliance.manage`)
- **Existing E2E tests** (`10-features.spec.ts`) — Changed framework name assertions from `getByText` to `getByRole("heading")` to avoid matching hidden `<option>` elements in export dropdown

### New Files (4)
| File | Purpose |
|------|---------|
| `src/app/api/compliance/history/route.ts` | Assessment history API with assessor name resolution |
| `src/app/api/compliance/export/route.ts` | CSV/JSON export with framework filter and audit logging |
| `src/app/api/compliance/frameworks/[id]/route.ts` | Framework management API (toggle active, update description) |
| `tests/e2e/13-compliance-features.spec.ts` | 14 E2E tests for all compliance enterprise features |

### New API Endpoints
| Method | Endpoint | Purpose | Capability |
|--------|----------|---------|------------|
| GET | `/api/compliance/history` | Assessment history for a control | `compliance.view` |
| GET | `/api/compliance/export` | Export frameworks as CSV/JSON | `compliance.export` |
| PATCH | `/api/compliance/frameworks/[id]` | Update framework settings | `compliance.manage` |

### Build Metrics
- Routes: 77 (total)
- E2E tests: 152 → 166 (+14)
- TypeScript errors: 0
- Compliance capabilities: 4 (`compliance.view`, `compliance.assess`, `compliance.manage`, `compliance.export`)

### Git Reference
- Commit: `90db916`

---

## [0.7.0] — 2026-03-05 — Phase 5A: GRC Module — CIS v8.1 + NIST CSF 2.0 + Compliance RBAC

### Added
- **CIS Controls v8.1** framework — 18 controls across 6 categories (Asset Management, Data Protection, Account Management, Access Control, Vulnerability Management, Audit & Accountability)
- **NIST CSF 2.0** framework — 12 controls across 5 categories (Identify, Protect, Detect, Respond, Recover)
- **Dedicated compliance RBAC** — 4 capabilities: `compliance.view`, `compliance.assess`, `compliance.manage`, `compliance.export` with proper role assignments
- **Compliance Center UI** — Framework cards with progress bars and donut charts, category grouping, status filters, control-level assessment with 5 status options
- **Compliance API** (`/api/compliance`) — Multi-framework GET with stats computation; PATCH for status updates with full audit trail
- **32 multi-role RBAC E2E tests** + PageGate rendering hardening
- **Full RBAC frontend enforcement** — Sidebar gating + page-level access control

### Changed
- Total frameworks: 3 → 5 (added CIS v8.1, NIST CSF 2.0)
- Total controls: 33 → 73 (+40)
- Capabilities: 42 → 46 (+4 compliance-specific)
- Seed data: 5 frameworks with 73 controls, proper tenant scoping

### Build Metrics
- Routes: 77
- E2E tests: 120 → 152 (+32)
- TypeScript errors: 0

### Git Reference
- Commit: `8078fdc`

---

## [0.6.0] — 2026-03-03 — RBAC v2 Phase 4: Audit & Security

### Added
- **Centralized Audit Logger** (`src/lib/audit.ts`) with SHA-256 hash chain integrity, automatic category/severity mapping, and IP/user-agent extraction from request headers
- **Audit Integrity Verification** — `verifyAuditIntegrity()` walks the hash chain and reports tamper detection; exposed via `GET /api/audit-log/integrity`
- **Audit Log Export** — CSV and JSON export with server-side filtering, max 10K records; `GET /api/audit-log/export`
- **Database-Backed Session Management** — Session model with tokenHash, IP, device, city, country; 4 new API endpoints for listing, revoking, and bulk-revoking sessions
- **Account Lockout** — 5 failed login attempts trigger 15-minute lockout with auto-clear; lockout events logged as critical severity
- **API Key Full Lifecycle** — Create (bcrypt hash, show once), revoke, and atomic rotate; `POST /api/api-keys`, `DELETE /api/api-keys/[id]`, `PATCH /api/api-keys/[id]`
- **Security Dashboard** (`/settings/security`) — Computed security score (0-100), failed logins (24h), active sessions, API key health, audit integrity badge, recent security events timeline
- **Sessions Management UI** (`/settings/sessions`) — Active sessions with device/IP/location, revoke individual or all, admin view grouped by user
- **Security Headers** — X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy, HSTS, Permissions-Policy, X-XSS-Protection via `next.config.ts`
- **Security Helpers** (`src/lib/security.ts`) — Session management, account lockout, device parsing, IP extraction utilities

### Changed
- **Audit Log API** (`/api/audit-log`) fully rewritten with server-side filtering (action, result, category, severity, actorId, date range), cursor-based pagination, and filter metadata
- **Audit Log UI** (`/settings/audit-log`) fully rewritten with date range inputs, category/severity dropdowns, working CSV/JSON export buttons, integrity badge, expandable detail view
- **API Keys UI** (`/settings/api-keys`) fully rewritten with working create dialog, key reveal step (shown once with copy), rotate and revoke confirmation dialogs
- **Auth system** (`src/lib/auth.ts`) — Integrated lockout checks, session creation on login, centralized audit logging
- **Login API** — Now passes request object for IP/UA capture in audit logs
- **17 existing API routes** retrofitted from scattered `prisma.auditLog.create()` to centralized `createAuditLog()`
- **Settings layout** — Added Sessions (Monitor icon) and Security (ShieldAlert icon) tabs

### New Files (10)
| File | Purpose |
|------|---------|
| `src/lib/audit.ts` | Centralized audit logger + SHA-256 hash chain + integrity verification |
| `src/lib/security.ts` | Session management + account lockout + device parsing |
| `src/app/api/audit-log/export/route.ts` | CSV/JSON export (admin.audit.export) |
| `src/app/api/audit-log/integrity/route.ts` | Hash chain integrity check (admin.audit.view) |
| `src/app/api/sessions/route.ts` | Admin: all tenant sessions (admin.user.view) |
| `src/app/api/auth/sessions/route.ts` | Current user's own sessions |
| `src/app/api/auth/sessions/[sessionId]/route.ts` | Revoke specific session |
| `src/app/api/auth/sessions/revoke-all/route.ts` | Revoke all user sessions |
| `src/app/(dashboard)/settings/sessions/page.tsx` | Sessions management UI |
| `src/app/(dashboard)/settings/security/page.tsx` | Security dashboard |

### Modified Files (21)
| File | Change |
|------|--------|
| `prisma/schema.prisma` | Session model, User lockout fields, AuditLog category/severity/hash, indexes |
| `src/lib/auth.ts` | Lockout checks, session creation, centralized audit |
| `src/lib/rbac.ts` | Switched auditDenial() to use createAuditLog() |
| `next.config.ts` | Security headers (X-Frame-Options, HSTS, etc.) |
| `src/app/api/audit-log/route.ts` | Full rewrite: server-side filtering, cursor pagination, capability check |
| `src/app/api/api-keys/route.ts` | Added POST create + admin.apikey.manage check |
| `src/app/api/api-keys/[id]/route.ts` | New: DELETE revoke + PATCH rotate |
| `src/app/api/auth/login/route.ts` | Passes request to authenticateUser() |
| `src/app/(dashboard)/settings/layout.tsx` | Sessions + Security tabs |
| `src/app/(dashboard)/settings/audit-log/page.tsx` | Full rewrite with filters, pagination, export |
| `src/app/(dashboard)/settings/api-keys/page.tsx` | Full rewrite with create/revoke/rotate |
| `prisma/seed.ts` | Demo sessions + hash-chained audit events |
| 9 other API routes | Retrofitted audit calls to use createAuditLog() |

### New API Endpoints
| Method | Endpoint | Purpose | Capability |
|--------|----------|---------|------------|
| GET | `/api/audit-log/export` | Export logs as CSV/JSON | `admin.audit.export` |
| GET | `/api/audit-log/integrity` | Verify hash chain integrity | `admin.audit.view` |
| GET | `/api/sessions` | Admin: all tenant sessions | `admin.user.view` |
| GET | `/api/auth/sessions` | Current user's sessions | (authenticated) |
| DELETE | `/api/auth/sessions/[sessionId]` | Revoke a session | (own) or `admin.user.manage` |
| POST | `/api/auth/sessions/revoke-all` | Revoke all sessions | (authenticated) |
| POST | `/api/api-keys` | Create API key | `admin.apikey.manage` |
| DELETE | `/api/api-keys/[id]` | Revoke API key | `admin.apikey.manage` |
| PATCH | `/api/api-keys/[id]` | Rotate API key | `admin.apikey.manage` |

### Compliance Alignment
- **SOC 2 Type II**: CC6.1 (session management), CC7.2 (tamper-evident audit), CC7.3 (security monitoring)
- **ISO 27001:2022**: A.8.15 (activity logging), A.9.4 (access control), A.12.4 (event logging)
- **NIST CSF 2.0**: PR.PS-04 (log integrity), DE.CM-09 (security monitoring), RS.AN-03 (forensic analysis)

### Build Metrics
- Routes: 55 → 65 (+10)
- TypeScript errors: 0
- Retrofitted routes: 17

---

## [0.5.0] — 2026-03-02 — RBAC v2 Phase 3: User & Role Management UI

### Added
- Role detail API with full capability matrix (all 42 capabilities grouped by module)
- Role update API for custom roles (replace name, description, capabilities)
- Role delete API with safety checks (blocks if users assigned, blocks built-in)
- Role clone API (copies all capabilities, sets parentRoleId for lineage tracking)
- User status API (suspend/reactivate with protection for Platform Admins and self)
- User role assignment API with maxAssignment enforcement (e.g., Platform Admin max 2)
- User role removal API with last-role protection
- Roles page: full capability matrix editor with module sections, search, risk-level badges
- Roles page: create role dialog with auto-slug generation and "based on" template dropdown
- Roles page: clone dialog, delete confirmation with user-count warnings
- Users page: role management dialog with assignment and removal
- Users page: suspend/reactivate actions with confirmation dialogs
- Users page: filter dropdowns for role, status, and scope

### Changed
- Roles list API now uses `CAPABILITIES.length` instead of hardcoded count
- Roles permissions API fixed from hardcoded `39` to dynamic `CAPABILITIES.length` (42)
- Users page expanded from 523 to 818 lines with role/scope management
- Roles page rewritten from 191 to 1297 lines with capability matrix editor

### New Files (5)
- `src/app/api/roles/[roleId]/route.ts` — Role detail (GET), update (PATCH), delete (DELETE)
- `src/app/api/roles/[roleId]/clone/route.ts` — Clone role (POST)
- `src/app/api/users/[id]/route.ts` — User suspend/reactivate (PATCH)
- `src/app/api/users/[id]/roles/route.ts` — User role list (GET), assign (POST)
- `src/app/api/users/[id]/roles/[roleId]/route.ts` — Remove role from user (DELETE)

### Modified Files (4)
- `src/app/api/roles/route.ts` — Fixed `totalCapabilities` to use `CAPABILITIES.length`
- `src/app/api/roles/[roleId]/permissions/route.ts` — Fixed `totalAvailable` to use `CAPABILITIES.length`
- `src/app/(dashboard)/settings/roles/page.tsx` — Complete rewrite with capability matrix editor
- `src/app/(dashboard)/settings/users/page.tsx` — Added role management, suspend/reactivate, filters

### API Endpoints Added
| Method | Endpoint | Purpose | Capability |
|--------|----------|---------|------------|
| GET | `/api/roles/[roleId]` | Full role detail with capability matrix | `admin.role.view` |
| PATCH | `/api/roles/[roleId]` | Update custom role | `admin.role.manage` |
| DELETE | `/api/roles/[roleId]` | Delete custom role | `admin.role.manage` |
| POST | `/api/roles/[roleId]/clone` | Clone existing role | `admin.role.manage` |
| PATCH | `/api/users/[id]` | Suspend/reactivate user | `admin.user.manage` |
| GET | `/api/users/[id]/roles` | List user's roles | `admin.user.view` |
| POST | `/api/users/[id]/roles` | Assign role to user | `admin.role.manage` |
| DELETE | `/api/users/[id]/roles/[roleId]` | Remove role from user | `admin.role.manage` |

### Git Reference
- Commit: `ff2d3d2`

---

## [0.4.0] — 2026-03-02 — RBAC v2 Phase 2: Tag-Based Scoping

### Added
- Tag management APIs (CRUD, bulk assign/remove)
- Scope management APIs (CRUD, preview, user scopes)
- Auto-tag engine with rule-based condition evaluation
- Scope-aware asset API with tag-based filtering (AND/OR/UNION)
- Settings → Scopes management page with tag filter builder and live preview
- Assets page: Tags column with colored badges and tag-based filter dropdown
- Users page: Scopes column with scope assignment dialog
- Demo seed: 11 tags, 12 assets, 5 named scopes, 3 auto-tag rules

### Changed
- Assets API now includes `assetTags` relation and scope-based WHERE filtering
- Users API now includes `userScopes` relation
- Asset creation calls auto-tag engine after insert
- Settings layout updated with Scopes tab

### New Files (12)
- `src/app/api/tags/route.ts` — Tag list + create
- `src/app/api/tags/[id]/route.ts` — Tag delete
- `src/app/api/assets/[id]/tags/route.ts` — Asset tag list + bulk assign
- `src/app/api/assets/[id]/tags/[tagId]/route.ts` — Remove tag from asset
- `src/app/api/scopes/route.ts` — Scope list + create
- `src/app/api/scopes/[id]/route.ts` — Scope get/update/delete
- `src/app/api/scopes/[id]/preview/route.ts` — Scope preview (matching assets)
- `src/app/api/auth/me/scopes/route.ts` — Current user's scopes
- `src/app/api/users/[id]/scopes/route.ts` — User scope list + assign
- `src/app/api/users/[id]/scopes/[scopeId]/route.ts` — Remove scope from user
- `src/lib/auto-tag.ts` — Auto-tag rule evaluation engine
- `src/app/(dashboard)/settings/scopes/page.tsx` — Scopes management UI

### Modified Files (7)
- `src/app/api/assets/route.ts` — Added `assetTags` include + scope-based WHERE filtering
- `src/app/api/assets/create/route.ts` — Calls `applyAutoTagRules()` after asset creation
- `src/app/api/users/route.ts` — Added `userScopes` include in response
- `src/app/(dashboard)/settings/layout.tsx` — Added Scopes tab to settings navigation
- `src/app/(dashboard)/assets/page.tsx` — Tags column with badges + tag filter dropdown
- `src/app/(dashboard)/settings/users/page.tsx` — Scopes column + scope assignment dialog
- `prisma/seed.ts` — Added 11 tags, 12 assets, 5 scopes, 3 auto-tag rules

### Git Reference
- Commit: `3f14c82`

---

## [0.3.0] — 2026-03-01 — Exargen Production Bootstrap + Resend Integration

### Changed
- **Seed data replaced**: Removed all Acme demo data (4 users, 9 assets, compliance frameworks, scans, SIEM events) and bootstrapped with single Exargen Super Admin (`admin@exargen.com`)
- **Tenant**: Acme Corporation → Exargen (slug: `exargen`, plan: `enterprise`)

### Added
- **Resend email integration**: Invitation emails sent via Resend API (`RESEND_API_KEY` env var)
- **Email templates**: Professional HTML invitation email with BYOC branding (`src/lib/email-templates.ts`)
- **App URL config**: `NEXT_PUBLIC_APP_URL` env var for production invite links

### Environment Variables Required
| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection (Railway) |
| `AUTH_SECRET` | JWT signing secret |
| `RESEND_API_KEY` | Resend API key for invitation emails |
| `EMAIL_FROM` | Sender address (default: `BYOC <onboarding@resend.dev>`) |
| `NEXT_PUBLIC_APP_URL` | Production URL for invite links (fallback: `VERCEL_URL`) |

### Git Reference
- Old demo seed recoverable from commit `e8d8f22`

---

## [0.2.0] — 2026-03-01 — RBAC v2 Phase 1: Two-Axis Capability Model

### Added
- **42 capabilities** across 8 modules replacing 102 flat permissions
- **7 built-in roles**: Platform Admin, Org Admin, Security Analyst, Auditor, Viewer, Remediation User (new), API Service Account
- **Two-axis authorization**: `allowed = role.hasCapability(action) AND scope.coversResource(resource)`
- **Deny-wins conflict resolution**: Any explicit deny overrides all grants
- **Capability introspection API**: `GET /api/auth/me/capabilities`
- **React hooks**: `useCapabilities()` with `can()`, `canAny()`, `canAll()`, `hasGlobalScope()`
- **Gate components**: `<Gate capability="scan.execute">` and `<GateMessage>`
- **v1 backward compatibility**: Automatic mapping of old permission strings to v2 capability IDs
- **Tag-based scoping schema**: `Tag`, `AssetTag`, `Scope`, `UserScope` tables (schema ready for Phase 2)

### Changed
- `prisma/schema.prisma`: Removed `Permission`/`RolePermission`, added capability + scope tables
- `src/lib/rbac.ts`: Complete rewrite — two-axis engine with profile caching
- 7 API routes updated from v1 permission strings to v2 capability IDs

### New Files
- `src/lib/capabilities.ts` — Master capability registry + role definitions
- `src/hooks/useCapabilities.ts` — React context + hooks
- `src/components/rbac/Gate.tsx` — Gate components
- `src/app/api/auth/me/capabilities/route.ts` — Introspection endpoint
- `docs/RBAC-V2-PHASE1-REPORT.md` — Phase 1 implementation report

---

## [0.1.1] — 2026-03-01 — User Invitation & Onboarding Wizard

### Added
- **User invitation flow**: Admins can invite users from Settings → Users
- **6-step onboarding wizard**: Welcome → Password → Profile → MFA → Permissions → Complete
- **Invitation management**: Send, resend, revoke invitations
- **Token-based verification**: Secure bcrypt-hashed invitation tokens with 48h expiry
- **Email service**: Resend integration with HTML email templates

### New Files
- `src/lib/email.ts` — Resend email client
- `src/lib/email-templates.ts` — HTML invitation email template
- `src/app/(auth)/accept-invitation/page.tsx` — Onboarding wizard
- `src/app/api/auth/accept-invitation/route.ts` — Token validation + account activation
- `src/app/api/users/invite/route.ts` — Create invitation
- `src/app/api/users/invite/resend/route.ts` — Resend invitation
- `src/app/api/users/invite/revoke/route.ts` — Revoke invitation

---

## [0.1.0] — 2026-03-01 — Initial Platform Build

### Added
- **Full-stack cybersecurity platform** with Next.js 16.1 + React 19 + TypeScript 5.9
- **18 Prisma tables**: Users, Tenants, Roles, Assets, Scans, Compliance, SIEM, Audit
- **JWT authentication**: HTTP-only cookies, bcrypt password hashing, session management
- **RBAC engine**: Role-based access control with permission hierarchy
- **Dashboard**: Real-time security metrics with animated statistics
- **Vulnerability scanning**: Create, execute, schedule scans with finding management
- **Asset management**: Inventory with groups, criticality levels, import/export
- **Compliance**: GDPR (10), PCI DSS (12), HIPAA (11) — 33 controls across 3 frameworks
- **SIEM integration**: Real-time security event monitoring with severity filters
- **AI Actions**: Autonomous security action management with approval workflows
- **Reports**: Generate, schedule, template management
- **Settings**: User management, role management, API keys, audit log
- **Deployment**: Vercel (byoc-rosy.vercel.app) + Railway PostgreSQL

### Architecture
- App Router with `(auth)` and `(dashboard)` route groups
- Tailwind CSS 4.2 + Radix UI primitives
- Prisma 6.19 + SQLite (dev) / PostgreSQL (prod)
- Singleton Prisma client with connection pooling
- 40 routes (22 API + 18 pages)
