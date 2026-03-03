# BYOC Changelog

All notable changes to the BYOC Cybersecurity Platform are documented here.

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
