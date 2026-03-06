# BYOC Changelog

All notable changes to the BYOC Cybersecurity Platform are documented here.

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
