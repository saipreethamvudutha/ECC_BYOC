# BYOC RBAC v2 — Phase 1: Core RBAC Implementation Report

**Date:** 2026-03-01
**Phase:** 1 of 6 — Core RBAC
**Status:** Complete
**Build:** 40 routes, 0 TypeScript errors

---

## Summary

Phase 1 replaces the v1 single-layer RBAC model (102 flat permissions merged with data access) with a **two-axis capability system** following patterns proven by Tenable, Qualys, CrowdStrike, Splunk, Wiz, and Prisma Cloud.

### What Changed

| Area | v1 | v2 |
|------|----|----|
| Permission model | 102 `module.resource:action` strings | 42 capability IDs across 8 modules |
| Data structure | `Permission` + `RolePermission` tables | `Capability` + `RoleCapability` tables |
| Role count | 6 built-in roles | 7 built-in roles (added Remediation User) |
| Multi-role | Supported via hierarchy only | Cumulative union + deny-wins conflict resolution |
| Conflict resolution | Last-in wins | **Deny always wins** |
| Frontend hooks | None | `can()`, `canAny()`, `canAll()`, `hasGlobalScope()` |
| Gate component | None | `<Gate capability="...">` |
| Introspection API | None | `GET /api/auth/me/capabilities` |
| Data scoping | ABAC JSON scopes on permissions | Tag-based scopes (schema ready for Phase 2) |

---

## Files Created

| File | Purpose |
|------|---------|
| `src/lib/capabilities.ts` | Master capability registry (42 capabilities), built-in role definitions, module metadata |
| `src/hooks/useCapabilities.ts` | React context + hooks for frontend capability checks |
| `src/components/rbac/Gate.tsx` | `<Gate>` and `<GateMessage>` components for UI access control |
| `src/app/api/auth/me/capabilities/route.ts` | Introspection endpoint returning user's effective capabilities |

## Files Modified

| File | Changes |
|------|---------|
| `prisma/schema.prisma` | Removed `Permission`/`RolePermission`, added `Capability`, `RoleCapability`, `Tag`, `AssetTag`, `Scope`, `UserScope`; added `maxAssignments` to Role |
| `prisma/seed.ts` | Complete rewrite for v2: seeds 42 capabilities, 7 roles, 15 tags, 6 scopes, 4 users with role+scope assignments |
| `src/lib/rbac.ts` | Complete rewrite: two-axis engine with capability check + scope check, v1 backward-compatibility mapping, profile caching |
| `src/lib/auth.ts` | Added `checkCurrentUserCapability()`, `getCurrentUserCapabilities()` |
| `src/app/api/roles/route.ts` | Returns `capabilityCount` instead of `permissionCount` |
| `src/app/api/roles/[roleId]/permissions/route.ts` | Queries `roleCapabilities` with capability details |
| `src/app/api/scans/create/route.ts` | `"scans.jobs:create"` → `"scan.create"` |
| `src/app/api/assets/create/route.ts` | `"assets.inventory:create"` → `"asset.create"` |
| `src/app/api/reports/generate/route.ts` | `"reports.generated:create"` → `"report.create"` |
| `src/app/api/compliance/update/route.ts` | `"compliance.controls:edit"` → `"risk.override"` |
| `src/app/api/users/invite/route.ts` | `"settings.users:create"` → `"admin.user.manage"` |
| `src/app/api/users/invite/resend/route.ts` | `"settings.users:edit"` → `"admin.user.manage"` |
| `src/app/api/users/invite/revoke/route.ts` | `"settings.users:edit"` → `"admin.user.manage"` |

---

## Capability Registry (42 capabilities, 8 modules)

| Module | Count | Capabilities |
|--------|-------|-------------|
| Dashboard | 2 | `dash.view`, `dash.customize` |
| Scans | 7 | `scan.view`, `scan.create`, `scan.execute`, `scan.schedule`, `scan.policy.view`, `scan.policy.manage`, `scan.export` |
| Assets | 7 | `asset.view`, `asset.edit`, `asset.create`, `asset.delete`, `asset.import`, `asset.export`, `asset.tag.manage` |
| Risk | 3 | `risk.view`, `risk.override`, `risk.threshold.manage` |
| Reports | 5 | `report.view`, `report.create`, `report.schedule`, `report.template.manage`, `report.export` |
| AI | 4 | `ai.view`, `ai.approve.standard`, `ai.approve.critical`, `ai.configure` |
| SIEM | 5 | `siem.view`, `siem.acknowledge`, `siem.escalate`, `siem.rule.manage`, `siem.integration.manage` |
| Admin | 9 | `admin.user.view`, `admin.user.manage`, `admin.role.view`, `admin.role.manage`, `admin.apikey.manage`, `admin.org.manage`, `admin.billing.manage`, `admin.audit.view`, `admin.audit.export` |

---

## Built-in Roles (7)

| Role | Capabilities | Max Assignments | Data Scope |
|------|-------------|-----------------|------------|
| Platform Administrator | 42/42 (all) | 2 | Implicit global |
| Organization Administrator | 41/42 (no billing) | Unlimited | Implicit global |
| Security Analyst | 25/42 | Unlimited | Tag-scoped |
| Auditor | 15/42 (read-only) | Unlimited | Typically global |
| Viewer | 4/42 (dashboards + reports) | Unlimited | Tag-scoped |
| Remediation User | 5/42 (view findings) | Unlimited | Tag-scoped |
| API Service Account | 8/42 (scan + asset + report) | Unlimited | Tag-scoped |

---

## Backward Compatibility

The v2 RBAC engine includes a **v1-to-v2 permission mapping layer** in `rbac.ts` that translates old `module.resource:action` strings to new capability IDs. This means:

- All existing API routes continue to work via `rbac.checkPermission()`
- The mapping is transparent — v1 callers are automatically translated to v2
- Routes have been updated to use direct v2 capability IDs for clarity
- The old `Permission` and `RolePermission` tables have been dropped from the database

---

## Demo Users & Credentials

| User | Email | Password | Role | Scope |
|------|-------|----------|------|-------|
| Rahul Sharma | admin@acme.co | Admin123! | Platform Administrator | Global (implicit) |
| Priya Mehta | priya@acme.co | Admin123! | Security Analyst | Production Mumbai |
| Amit Kumar | amit@acme.co | Admin123! | Auditor | Global |
| Sara Joshi | sara@acme.co | Admin123! | Remediation User | Payments Team |

---

## Next Phase: Phase 2 — Tag-Based Scoping

Phase 2 will activate the data scoping layer that was schemaed in Phase 1:
- Scope resolution engine (tag filter evaluation against asset tags)
- Scope assignment APIs
- Auto-tagging rule engine
- Scope preview endpoint
- Frontend scope editor with live preview
- Scope column in user management table
