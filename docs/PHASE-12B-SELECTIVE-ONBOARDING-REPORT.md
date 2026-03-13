# Phase 12B — Grouped Scan Results & Selective Asset Onboarding

**Date:** March 13, 2026
**Build:** 121 routes, 0 TypeScript errors
**Scope Alignment:** Step 2 (Asset Inventory), Step 3 (Asset Classification), Step 14 (Dashboard Menu — Inventory vs Discovery)

---

## Problem Statement

After running a home network scan (Phase 12A Nmap scanner), two issues were identified:

1. **Findings not grouped by host** — Scan results displayed as a flat list sorted by severity. When scanning multiple targets (e.g., 4 home network devices), there was no visual distinction between which findings belonged to which host.

2. **No selective asset onboarding** — All scan targets were automatically created as managed assets in the inventory the moment a scan was created. The client requested the ability to review discovered hosts and selectively choose which to add to the asset inventory — a standard feature in enterprise scanners like Qualys (VMDR/CSAM) and Tenable (Nessus/VM).

## Industry Research

Before implementation, we researched how industry leaders handle this workflow:

| Platform | Discovery State | Managed State | Selection Method |
|---|---|---|---|
| **Qualys VMDR** | "Unmanaged asset" in CSAM | "Licensed asset" in VM | Tag-based grouping |
| **Tenable Nessus** | "Unassessed / Rogue" | "Assessed asset" | Tag-based + auto-policies |
| **BYOC (this build)** | `status: "discovered"` | `status: "active"` | Visual checkbox selection |

The scope document (Step 14 — Dashboard Primary Menu Structure) explicitly separates:
- **"Inventory"** — Unified view of all managed assets
- **"Discovery"** — Tools for continuous scanning to find Shadow IT or new network additions

This directly maps to our `"active"` vs `"discovered"` status model.

## Solution: "Discovered" Status Pattern

### Architecture Decision

We use the existing `Asset.status` field (already a plain String type) with a new `"discovered"` value. This requires **no schema migration** — just a new string value alongside existing `"active"`, `"inactive"`, `"decommissioned"`, and `"maintenance"`.

**Flow:**
```
CREATE SCAN
  ↓
Auto-create targets as Asset { status: "discovered" }
  ↓
EXECUTE SCAN → Findings linked to discovered assets
  ↓
POST-SCAN HOOKS → Enrich assets (OS, ports, services)
  ↓
USER REVIEWS GROUPED RESULTS
  ↓
SELECTS HOSTS → Clicks "Onboard"
  ↓
POST /api/scans/{id}/onboard → Flip status to "active"
  ↓
Assets appear in Inventory
```

---

## Changes Made

### 1. Scan Creation — `status: "discovered"` (API)

**File:** `src/app/api/scans/create/route.ts`

Previously, scan creation auto-created assets with `status: "active"`. Now:
- New targets are created with `status: "discovered"`
- If an existing asset is already `"active"`, it is not downgraded
- Post-scan hooks still enrich discovered assets with OS, services, ports, etc.

### 2. Scan Results API — Expanded Asset Fields

**File:** `src/app/api/scans/[id]/results/route.ts`

The `asset` select in the results query was expanded from 3 fields to 10:
- **Added:** `hostname`, `os`, `status`, `type`, `criticality`, `openPorts`, `services`
- This enables the frontend to group findings by host and display rich host information without extra API calls

### 3. New Onboard Endpoint

**File:** `src/app/api/scans/[id]/onboard/route.ts` (NEW)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/scans/{id}/onboard` | `asset.create` capability | Batch-onboard discovered assets |

**Request:** `{ assetIds: string[] }`
**Response:** `{ onboarded: number, assets: [{ id, name, ipAddress, status: "active" }] }`

**Logic:**
1. Validates session + `asset.create` RBAC capability
2. Verifies scan belongs to tenant
3. Finds matching assets with `status: "discovered"` belonging to tenant
4. Flips all to `status: "active"` with `discoveryMethod: "scanner"` and `discoveredAt` timestamp
5. Creates audit log entry per onboarded asset (action: `"asset.onboarded"`)

### 4. Asset List API — Filter by Status

**File:** `src/app/api/assets/route.ts`

| Parameter | Value | Behavior |
|---|---|---|
| (none) | — | Default: excludes `"discovered"` assets |
| `?status=discovered` | `discovered` | Shows only discovered/pending assets |
| `?status=all` | `all` | Shows everything including discovered |
| `?status=active` | `active` | Shows only active assets |
| `?status=inactive` | `inactive` | Shows only inactive assets |

**Backward compatible:** Default behavior hides discovered assets, so existing API consumers see the same results as before.

### 5. Scan Detail Page — Grouped View + Onboarding UI

**File:** `src/app/(dashboard)/scans/[id]/page.tsx`

This was the largest change. The page now includes:

#### Grouped Findings View
- **View mode toggle:** "Grouped" (default) | "Flat" segmented control in the Findings card header
- **Client-side grouping:** `useMemo` groups findings by `asset.id` into `HostGroup` objects
- **Two-level accordion:**
  - **Host header row:** Server/Monitor/Wifi icon, IP address, hostname, OS badge, severity count pills (colored circles), "Managed" or "Discovered" status badge, finding count
  - **Nested findings:** Expandable finding rows (same design as before — severity, title, CVE, CVSS, status)
- **Auto-expand:** All host groups expanded on first load
- **"across N hosts"** subtitle next to finding count

#### Onboarding Flow
- **Discovery banner:** When scan is completed and discovered hosts exist, an amber info card appears:
  > "N discovered hosts not yet in your asset inventory — Select which hosts to onboard as managed assets"
- **Selection mode:** Clicking "Select & Onboard" enables checkboxes on each discovered host group
- **Select All / Deselect All** toggle links
- **Onboard action bar:** "Onboard N Assets" button with loading state, "Cancel" to exit
- **Success feedback:** Green banner "N assets onboarded to inventory" (auto-dismiss after 5s)
- **RBAC gated:** Entire onboarding UI wrapped with `<Gate capability="asset.create">` — only visible to users with permission

#### New Imports & Types
- Added `AssetInfo` interface with all expanded fields
- Added `HostGroup` interface for grouped view state
- Added `useMemo` for grouping logic
- Added lucide icons: `Server`, `Monitor`, `Wifi`, `LayoutList`, `LayoutGrid`, `Square`, `CheckSquare`, `Info`

### 6. Asset Inventory Page — Status Filter + Badge

**File:** `src/app/(dashboard)/assets/page.tsx`

- **New status dropdown:** "Managed Assets" (default) | "Discovered (Pending)" | "All Assets" | "Active Only" | "Inactive Only"
- **Badge variant:** Added `discovered: "warning"` (amber) and `maintenance: "secondary"` to `statusVariants` map
- **Dynamic loading:** `loadAssets()` accepts status parameter, re-fetches when status filter changes

---

## Test Results

| # | Test | Result |
|---|---|---|
| 1 | Create scan with new targets → assets get `status: "discovered"` | ✅ Pass |
| 2 | Default asset inventory excludes discovered assets | ✅ Pass (91 active, 0 discovered) |
| 3 | `?status=all` shows all including discovered | ✅ Pass (91 active + 1 discovered) |
| 4 | Onboard endpoint flips discovered → active | ✅ Pass (returned `{ onboarded: 1 }`) |
| 5 | After onboard, discovered list empty | ✅ Pass |
| 6 | Results API returns expanded asset fields | ✅ Pass (hostname, os, status, type, openPorts, services) |
| 7 | Grouped view shows host headers with severity pills | ✅ Pass (visual verification) |
| 8 | "Managed Assets" filter dropdown on assets page | ✅ Pass (visual verification) |
| 9 | Existing seeded assets (status: "active") unaffected | ✅ Pass (91 assets unchanged) |
| 10 | Build succeeds with 0 errors | ✅ Pass (121 routes) |

---

## Files Modified / Created

| File | Action | Lines |
|---|---|---|
| `src/app/api/scans/create/route.ts` | Modified | ~2 lines changed |
| `src/app/api/scans/[id]/results/route.ts` | Modified | ~20 lines changed |
| `src/app/api/scans/[id]/onboard/route.ts` | **Created** | ~95 lines |
| `src/app/api/assets/route.ts` | Modified | ~15 lines changed |
| `src/app/(dashboard)/scans/[id]/page.tsx` | Modified | ~500 lines (major rewrite) |
| `src/app/(dashboard)/assets/page.tsx` | Modified | ~20 lines changed |

**Total:** 5 modified + 1 new file

---

## Scope Coverage Update

| Scope Step | Requirement | Status |
|---|---|---|
| Step 1: Asset Discovery | Identify all reachable systems | ✅ Phase 8 + 12A |
| Step 2: Asset Inventory | Single source of truth | ✅ Enhanced — selective onboarding ensures clean inventory |
| Step 3: Asset Classification | Apply business context | ✅ Users edit criticality/type after onboarding |
| Step 14: Dashboard — Inventory | Unified view of managed assets | ✅ Default excludes discovered |
| Step 14: Dashboard — Discovery | Shadow IT / new network additions | ✅ Discovered status + status filter |

---

## Known Behaviors

1. **Existing assets preserved:** The 12 seeded Exargen assets remain `status: "active"` — onboarding only applies to new scans going forward
2. **Re-scanning existing targets:** If a target already has an `"active"` asset, scan creation skips creating a duplicate (existing behavior preserved)
3. **Post-scan enrichment works on discovered assets:** OS, services, open ports are written to the asset record even while `status: "discovered"`, so the data is ready when the user onboards
4. **Audit trail:** Every onboard action creates an audit log entry with `action: "asset.onboarded"` linking the asset to the scan that discovered it
