# BYOC RBAC v2 — Phase 2: Tag-Based Scoping Implementation Report

**Date:** 2026-03-02
**Phase:** 2 of 6 — Tag-Based Scoping
**Status:** Complete
**Build:** 50 routes, 0 TypeScript errors
**Commit:** `3f14c82`

---

## Summary

Phase 2 activates the **data scoping layer** (Axis 2) that was schema-ready from Phase 1. Admins can now create key:value tags, assign them to assets, build tag-based scopes, and assign scopes to users. Non-global users only see assets matching their assigned scopes.

### What Changed (Phase 1 vs Phase 2)

| Area | Phase 1 | Phase 2 |
|------|---------|---------|
| Data scoping | Schema only (tables created, no logic) | Fully active: tag filtering, scope resolution, enforcement |
| Tags | Table exists, no data | 11 demo tags across 4 keys (env, region, team, criticality) |
| Assets | 0 assets in DB | 12 Exargen-branded assets with tag assignments |
| Scopes | Global scope only | 5 named scopes + Global (Production Only, US East Prod, EU Ops, etc.) |
| Auto-tagging | Not implemented | Rule engine with 6 operators (equals, contains, startsWith, endsWith, regex, notEquals) |
| Asset visibility | All users see all assets | Scope-aware: non-global users see only scoped assets |
| Settings UI | No Scopes tab | Full Scopes management page with tag filter builder |
| Assets UI | No tag display | Tags column with colored badges + tag filter dropdown |
| Users UI | No scope display | Scopes column with scope assignment dialog |

---

## Architecture: Tag-Based Scoping Model

### How Scoping Works

```
Authorization = Capability Check (Axis 1) AND Scope Check (Axis 2)
```

1. **Tags** are key:value pairs (e.g., `env:production`, `region:us-east-1`)
2. **Assets** can have multiple tags via the `AssetTag` join table
3. **Scopes** define tag filters — a JSON object mapping keys to value arrays
4. **Users** can have multiple scopes via the `UserScope` join table
5. At query time, scope filters combine as: **AND between keys, OR within values, UNION across scopes**

### Tag Filter Example

A scope with this filter:
```json
{
  "env": ["production"],
  "region": ["us-east-1", "us-west-2"]
}
```
Matches assets that have tag `env=production` **AND** (tag `region=us-east-1` **OR** `region=us-west-2`).

### Scope Resolution

When a user has multiple scopes, the effective visibility is the **UNION** of all scope matches. Global scope users bypass tag filtering entirely.

---

## Files Created (12)

| File | Purpose | Capability Required |
|------|---------|-------------------|
| `src/app/api/tags/route.ts` | GET tag list (with asset counts), POST create tag | `asset.view` / `asset.tag.manage` |
| `src/app/api/tags/[id]/route.ts` | DELETE tag (with tenant ownership check) | `asset.tag.manage` |
| `src/app/api/assets/[id]/tags/route.ts` | GET asset's tags, POST bulk-assign `{ tagIds: [] }` | `asset.view` / `asset.tag.manage` |
| `src/app/api/assets/[id]/tags/[tagId]/route.ts` | DELETE specific tag from asset | `asset.tag.manage` |
| `src/app/api/scopes/route.ts` | GET scope list (with user counts), POST create scope | `admin.role.view` / `admin.role.manage` |
| `src/app/api/scopes/[id]/route.ts` | GET detail, PATCH update, DELETE (Global protected) | `admin.role.view` / `admin.role.manage` |
| `src/app/api/scopes/[id]/preview/route.ts` | GET matching assets for a scope's tag filters | `admin.role.view` |
| `src/app/api/auth/me/scopes/route.ts` | GET current user's effective scopes | Authenticated |
| `src/app/api/users/[id]/scopes/route.ts` | GET user's scopes, POST assign scope | `admin.user.view` / `admin.role.manage` |
| `src/app/api/users/[id]/scopes/[scopeId]/route.ts` | DELETE remove scope from user | `admin.role.manage` |
| `src/lib/auto-tag.ts` | Auto-tag rule engine with condition evaluator | N/A (server-side) |
| `src/app/(dashboard)/settings/scopes/page.tsx` | Full Scopes management UI page | `admin.role.view` / `admin.role.manage` |

## Files Modified (7)

| File | Changes |
|------|---------|
| `src/app/api/assets/route.ts` | Added `assetTags` include in query; added scope-based WHERE filtering using RBAC profile's `tagFilters`; non-global users with no scopes get empty result |
| `src/app/api/assets/create/route.ts` | Calls `applyAutoTagRules(tenantId, assetId)` after asset creation to auto-assign tags |
| `src/app/api/users/route.ts` | Added `userScopes` include with scope details (id, name, isGlobal) in response |
| `src/app/(dashboard)/settings/layout.tsx` | Added Target icon import and Scopes tab to settings navigation |
| `src/app/(dashboard)/assets/page.tsx` | Added AssetTag interface, Tags column with colored Badge pills, tag filter dropdown |
| `src/app/(dashboard)/settings/users/page.tsx` | Added ScopeItem interface, Scopes column, manage scopes dialog per user |
| `prisma/seed.ts` | Added 11 tags, 12 assets (findFirst+create), 5 named scopes, 3 auto-tag rules |

---

## API Endpoints Added (10)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/tags` | List all tags with asset counts |
| POST | `/api/tags` | Create new tag (key, value, color) |
| DELETE | `/api/tags/[id]` | Delete a tag |
| GET | `/api/assets/[id]/tags` | List tags on an asset |
| POST | `/api/assets/[id]/tags` | Bulk-assign tags to asset |
| DELETE | `/api/assets/[id]/tags/[tagId]` | Remove tag from asset |
| GET | `/api/scopes` | List scopes with user counts |
| POST | `/api/scopes` | Create new scope |
| GET | `/api/scopes/[id]` | Scope detail with assigned users |
| PATCH | `/api/scopes/[id]` | Update scope (Global protected) |
| DELETE | `/api/scopes/[id]` | Delete scope (Global protected) |
| GET | `/api/scopes/[id]/preview` | Preview matching assets for tag filter |
| GET | `/api/auth/me/scopes` | Current user's effective scopes |
| GET | `/api/users/[id]/scopes` | List user's scope assignments |
| POST | `/api/users/[id]/scopes` | Assign scope to user |
| DELETE | `/api/users/[id]/scopes/[scopeId]` | Remove scope from user |

---

## Auto-Tag Engine

The auto-tag engine (`src/lib/auto-tag.ts`) evaluates rules against asset fields to automatically assign tags when assets are created.

### Condition Format
```typescript
interface AutoTagCondition {
  field: string;    // Asset field to evaluate (e.g., "hostname", "type", "os")
  operator: string; // equals | contains | startsWith | endsWith | regex | notEquals
  value: string;    // Value to compare against (case-insensitive)
}
```

### Evaluation Flow
1. Asset is created via `POST /api/assets/create`
2. `applyAutoTagRules(tenantId, assetId)` is called
3. Engine loads all active `AutoTagRule` records for the tenant (ordered by priority)
4. Each rule's conditions are evaluated against the asset's fields
5. Matching rules create `AssetTag` entries linking the asset to the rule's tag
6. Returns array of applied tag IDs

### Demo Auto-Tag Rules (3)
| Rule | Condition | Tag Applied |
|------|-----------|-------------|
| Production servers | hostname contains "prod" | `env:production` |
| US East assets | hostname contains "use1" | `region:us-east-1` |
| Critical servers | type equals "server" AND os contains "linux" | `criticality:high` |

---

## Scope-Aware Asset Filtering

The asset list API (`GET /api/assets`) now applies scope-based filtering:

### Logic
1. Load user's RBAC profile via `rbac.getUserProfile()`
2. If user has global scope: no filtering applied
3. If user has scopes with tag filters: build Prisma WHERE clause
4. If user has no scopes and isn't global: return empty array

### Prisma WHERE Construction
```
For each scope's tagFilter (UNION / OR across scopes):
  For each key in tagFilter (AND between keys):
    assetTags: { some: { tag: { key: key, value: { in: values } } } }
```

---

## Seed Data Added

### Tags (11)
| Key | Values |
|-----|--------|
| `env` | production, staging, development |
| `region` | us-east-1, us-west-2, eu-west-1 |
| `team` | platform, security, devops |
| `criticality` | high, medium |

### Assets (12)
Exargen-branded hostnames: `exg-prod-web-01`, `exg-prod-db-01`, `exg-prod-api-01`, `exg-staging-web-01`, `exg-staging-db-01`, `exg-dev-web-01`, `exg-prod-use1-fw-01`, `exg-prod-usw2-lb-01`, `exg-prod-euw1-cdn-01`, `exg-sec-siem-01`, `exg-devops-ci-01`, `exg-prod-pci-db-01`

### Scopes (5 + Global)
| Scope | Tag Filter | Purpose |
|-------|-----------|---------|
| Production Only | `env: [production]` | See only production assets |
| US East Production | `env: [production], region: [us-east-1]` | Production assets in US East |
| EU Operations | `region: [eu-west-1]` | All EU region assets |
| Security Team | `team: [security]` | Security team assets only |
| PCI Zone | `env: [production], criticality: [high]` | PCI-scoped high-criticality production |

---

## Frontend Features

### Settings > Scopes Page
- Stats row: Total Scopes, Global Scopes, Users With Scopes
- Scope cards showing name, description, tag filter pills, user count, matching asset count
- Create/Edit dialog with tag filter builder (key dropdown + value selection)
- Live preview showing matching asset count as filters are built
- Delete confirmation (Global scope cannot be deleted)
- Gated by `admin.role.view` (read) / `admin.role.manage` (write)

### Assets Page Enhancements
- New Tags column displaying colored Badge pills per asset
- Tag filter dropdown allowing filtering by specific tags
- 8-column grid layout (added Tags column)

### Users Page Enhancements
- New Scopes column showing assigned scope badges (Global gets special styling)
- "Manage Scopes" dialog per user with checkbox list of available scopes

---

## Cache Invalidation

All scope mutations call `rbac.invalidateCache()`:
- Scope create/update/delete: `rbac.invalidateCache(tenantId)` (tenant-wide)
- User scope assign/remove: `rbac.invalidateCache(tenantId, userId)` (per-user)

---

## Next Phase: Phase 3 — User & Role Management UI

Phase 3 adds full CRUD for custom roles with a visual capability matrix editor, role cloning, user suspend/reactivate, and role assignment management.
