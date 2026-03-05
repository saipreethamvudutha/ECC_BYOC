# BYOC Cybersecurity Platform - End-to-End Test Plan

**Version:** 1.0
**Date:** 2026-03-03
**Platform:** BYOC (Bring Your Own Cloud)
**Environment:** https://byoc-rosy.vercel.app (Production) / http://localhost:3000 (Local)
**Test Account:** admin@exargen.com / Admin123!

---

## Table of Contents

1. [Test Environment Setup](#1-test-environment-setup)
2. [Module 1: Authentication & Login](#2-module-1-authentication--login)
3. [Module 2: Dashboard](#3-module-2-dashboard)
4. [Module 3: Asset Management](#4-module-3-asset-management)
5. [Module 4: Vulnerability Scans](#5-module-4-vulnerability-scans)
6. [Module 5: Compliance Management](#6-module-5-compliance-management)
7. [Module 6: SIEM Events & Alerts](#7-module-6-siem-events--alerts)
8. [Module 7: AI Actions](#8-module-7-ai-actions)
9. [Module 8: Risk Scoring](#9-module-8-risk-scoring)
10. [Module 9: Reports](#10-module-9-reports)
11. [Module 10: User Management](#11-module-10-user-management)
12. [Module 11: Role Management & RBAC](#12-module-11-role-management--rbac)
13. [Module 12: Scope Management](#13-module-12-scope-management)
14. [Module 13: API Key Management](#14-module-13-api-key-management)
15. [Module 14: Session Management](#15-module-14-session-management)
16. [Module 15: Audit Log & Integrity](#16-module-15-audit-log--integrity)
17. [Module 16: Security Dashboard](#17-module-16-security-dashboard)
18. [Module 17: Invitation & Onboarding](#18-module-17-invitation--onboarding)
19. [Module 18: RBAC Enforcement (Cross-Cutting)](#19-module-18-rbac-enforcement-cross-cutting)
20. [Module 19: Security & Edge Cases](#20-module-19-security--edge-cases)
21. [Module 20: API-Level Testing](#21-module-20-api-level-testing)
22. [Automated E2E Testing Strategy](#22-automated-e2e-testing-strategy)
23. [Test Execution Tracker](#23-test-execution-tracker)

---

## 1. Test Environment Setup

### Prerequisites

| Item | Details |
|------|---------|
| Browser | Chrome 120+ (primary), Firefox, Safari (secondary) |
| Database | PostgreSQL (Railway) - freshly seeded |
| Seed Command | `npx prisma db seed` |
| Admin Account | admin@exargen.com / Admin123! |
| Tenant | Exargen (slug: exargen, plan: enterprise) |
| API Testing Tool | Browser DevTools (Network tab) or Postman/Insomnia |

### Seed Data Available

| Data | Count | Details |
|------|-------|---------|
| Tenant | 1 | Exargen (enterprise plan) |
| Admin User | 1 | Platform Administrator with Global scope |
| Assets | 12 | 8 servers, 2 network devices, 1 database, 1 cloud resource |
| Tags | 11 | env (3), region (3), team (3), criticality (2) |
| Scopes | 6 | Global, Production Only, US East Production, EU Operations, Security Team, PCI Zone |
| Auto-Tag Rules | 3 | Production servers, EU region, Database tier-1 |
| Audit Events | 15 | Hash-chained across ~4 days |
| Sessions | 3 | 2 active (Chrome/Safari), 1 revoked (Firefox) |

### Pre-Test Checklist

- [ ] Database freshly seeded (`npx prisma db seed`)
- [ ] Application running and accessible
- [ ] Browser DevTools open (Console + Network tabs)
- [ ] Incognito/private window available for multi-session tests
- [ ] Email delivery working (Resend API key configured) - OR - check server logs for invite links

---

## 2. Module 1: Authentication & Login

### TC-AUTH-001: Successful Login

| Field | Value |
|-------|-------|
| **Priority** | Critical |
| **Precondition** | User is on login page, not authenticated |
| **Steps** | 1. Navigate to `/login` <br> 2. Enter email: `admin@exargen.com` <br> 3. Enter password: `Admin123!` <br> 4. Click "Sign In" |
| **Expected Result** | - Redirected to `/` (dashboard) <br> - Two HTTP-only cookies set: `byoc_token` (15min TTL), `byoc_refresh` (7d TTL) <br> - Sidebar shows user name and "Exargen" tenant <br> - Audit log records `user.login` with result `success` |
| **Verify** | Check DevTools > Application > Cookies for `byoc_token` and `byoc_refresh` |

### TC-AUTH-002: Login with Invalid Password

| Field | Value |
|-------|-------|
| **Priority** | Critical |
| **Precondition** | User is on login page |
| **Steps** | 1. Enter email: `admin@exargen.com` <br> 2. Enter password: `WrongPassword123` <br> 3. Click "Sign In" |
| **Expected Result** | - Error message displayed: "Invalid email or password" <br> - User remains on login page <br> - No cookies set <br> - Audit log records `user.login_failed` with severity `medium` |

### TC-AUTH-003: Login with Non-Existent Email

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Precondition** | User is on login page |
| **Steps** | 1. Enter email: `nobody@exargen.com` <br> 2. Enter password: `AnyPassword1` <br> 3. Click "Sign In" |
| **Expected Result** | - Same generic error: "Invalid email or password" <br> - No user enumeration (same message as wrong password) |

### TC-AUTH-004: Account Lockout After 5 Failed Attempts

| Field | Value |
|-------|-------|
| **Priority** | Critical |
| **Precondition** | User is on login page, account is not locked |
| **Steps** | 1. Enter correct email with wrong password <br> 2. Click "Sign In" - repeat 5 times <br> 3. On the 6th attempt, enter the CORRECT password |
| **Expected Result** | - Attempts 1-4: "Invalid email or password" <br> - Attempt 5: Account becomes locked <br> - Attempt 6 (correct password): Still rejected (locked for 15 minutes) <br> - Audit log shows `account.locked` with severity `critical` |
| **Cleanup** | Wait 15 minutes OR manually clear `lockedUntil` in database |

### TC-AUTH-005: Login with Empty Fields

| Field | Value |
|-------|-------|
| **Priority** | Medium |
| **Precondition** | User is on login page |
| **Steps** | 1. Leave email empty, click "Sign In" <br> 2. Enter email only, leave password empty, click "Sign In" |
| **Expected Result** | - Browser HTML5 validation prevents submission <br> - Or application-level error message shown |

### TC-AUTH-006: Logout

| Field | Value |
|-------|-------|
| **Priority** | Critical |
| **Precondition** | User is logged in on dashboard |
| **Steps** | 1. Click user profile/logout button in sidebar or topbar <br> 2. Confirm logout |
| **Expected Result** | - Redirected to `/login` <br> - Cookies cleared <br> - Attempting to visit `/` redirects back to `/login` <br> - Audit log records `user.logout` |

### TC-AUTH-007: Session Expiry (Access Token)

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Precondition** | User is logged in |
| **Steps** | 1. Log in successfully <br> 2. Wait 15+ minutes without refreshing <br> 3. Try to navigate to a new page or make an API call |
| **Expected Result** | - Access token expired <br> - Application should attempt refresh using `byoc_refresh` cookie <br> - If refresh succeeds: seamless experience <br> - If refresh fails: redirected to login |

### TC-AUTH-008: Suspended User Cannot Login

| Field | Value |
|-------|-------|
| **Priority** | Critical |
| **Precondition** | A second user exists and has been suspended |
| **Steps** | 1. As admin, suspend a user via Settings > Users <br> 2. Open incognito window <br> 3. Try to login as the suspended user |
| **Expected Result** | - Login rejected <br> - Error: "Invalid email or password" (no user enumeration) |

### TC-AUTH-009: Login Page Branding

| Field | Value |
|-------|-------|
| **Priority** | Low |
| **Precondition** | None |
| **Steps** | 1. Navigate to `/login` |
| **Expected Result** | - Shows "Exargen" branding (not "Acme") <br> - Shows BYOC platform name <br> - Professional cybersecurity look and feel |

---

## 3. Module 2: Dashboard

### TC-DASH-001: Dashboard Loads with Correct Stats

| Field | Value |
|-------|-------|
| **Priority** | Critical |
| **Precondition** | Logged in as admin, database seeded |
| **Steps** | 1. Navigate to `/` |
| **Expected Result** | - 6 stat cards visible: Total Assets (12), Critical Vulnerabilities, Risk Score (/100), Compliance Score (%), Open Alerts, AI Actions Pending <br> - No loading errors <br> - Numbers match seeded data |

### TC-DASH-002: Vulnerability Breakdown Chart

| Field | Value |
|-------|-------|
| **Priority** | Medium |
| **Precondition** | On dashboard, scans with results exist |
| **Steps** | 1. Check the Vulnerability Breakdown section |
| **Expected Result** | - Bar chart showing critical/high/medium/low/info counts <br> - Colors match severity (red for critical, orange for high, etc.) |

### TC-DASH-003: Compliance Overview Section

| Field | Value |
|-------|-------|
| **Priority** | Medium |
| **Precondition** | On dashboard, compliance frameworks seeded |
| **Steps** | 1. Check Compliance Overview section |
| **Expected Result** | - Shows GDPR, PCI DSS, HIPAA frameworks <br> - Progress bars with percentage scores <br> - Scores match the compliance page data |

### TC-DASH-004: Recent Activity Feed

| Field | Value |
|-------|-------|
| **Priority** | Medium |
| **Precondition** | On dashboard, audit events exist |
| **Steps** | 1. Check Recent Activity section |
| **Expected Result** | - Shows latest 10 audit events <br> - Each entry shows: actor name, action, result badge, timestamp <br> - Most recent event at top |

### TC-DASH-005: Dashboard Requires dash.view Capability

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Precondition** | User with a role that does NOT have `dash.view` |
| **Steps** | 1. Login as user without `dash.view` <br> 2. Navigate to `/` |
| **Expected Result** | - Dashboard data does not load <br> - API returns 403 Forbidden <br> - Appropriate error or empty state shown |

---

## 4. Module 3: Asset Management

### TC-ASSET-001: View Asset Inventory

| Field | Value |
|-------|-------|
| **Priority** | Critical |
| **Precondition** | Logged in as admin, 12 seeded assets exist |
| **Steps** | 1. Navigate to `/assets` |
| **Expected Result** | - 5 stat cards: Total (12), Active, Critical, High Priority, Unscanned <br> - Asset table shows all 12 assets <br> - Each row: Name, Type icon, IP/Hostname, OS, Criticality badge, Tags (colored), Group, Status |

### TC-ASSET-002: Search Assets by Name

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Precondition** | On assets page |
| **Steps** | 1. Type "prod" in search bar |
| **Expected Result** | - Table filters to show only assets with "prod" in name/hostname <br> - Should show ~6 production assets <br> - Filter is case-insensitive |

### TC-ASSET-003: Search Assets by IP Address

| Field | Value |
|-------|-------|
| **Priority** | Medium |
| **Precondition** | On assets page |
| **Steps** | 1. Type "10.0" in search bar |
| **Expected Result** | - Table filters to assets with IPs starting with "10.0" |

### TC-ASSET-004: Filter Assets by Tag

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Precondition** | On assets page |
| **Steps** | 1. Click tag filter dropdown <br> 2. Select "env:production" |
| **Expected Result** | - Only assets tagged with `env:production` are shown <br> - Stat cards update to reflect filtered count |

### TC-ASSET-005: Create New Asset

| Field | Value |
|-------|-------|
| **Priority** | Critical |
| **Precondition** | Logged in with `asset.create` capability |
| **Steps** | 1. Click "Add Asset" button <br> 2. Fill in: Name: "test-server-01", Type: "server", IP: "10.0.5.100", Hostname: "test-server-01.exargen.com", OS: "Ubuntu 22.04", Criticality: "high" <br> 3. Submit the form |
| **Expected Result** | - Asset created successfully <br> - Appears in asset table <br> - Total Assets count increments <br> - Audit log records `asset.created` |

### TC-ASSET-006: Add Tag to Asset

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Precondition** | On assets page, `asset.tag.manage` capability |
| **Steps** | 1. Find an asset without a specific tag <br> 2. Add tag `env:staging` to it |
| **Expected Result** | - Tag appears on the asset row <br> - Tag is color-coded correctly <br> - POST `/api/assets/[id]/tags` returns 200 |

### TC-ASSET-007: Remove Tag from Asset

| Field | Value |
|-------|-------|
| **Priority** | Medium |
| **Precondition** | Asset has at least one tag assigned |
| **Steps** | 1. Find an asset with tags <br> 2. Remove a tag from the asset |
| **Expected Result** | - Tag disappears from the asset row <br> - DELETE `/api/assets/[id]/tags/[tagId]` returns 200 |

### TC-ASSET-008: Asset Scope Filtering (Non-Global User)

| Field | Value |
|-------|-------|
| **Priority** | Critical |
| **Precondition** | Create a user with "Production Only" scope (not Global) |
| **Steps** | 1. Login as the scoped user <br> 2. Navigate to `/assets` |
| **Expected Result** | - Only production-tagged assets are visible <br> - Staging, development assets are NOT shown <br> - Asset count reflects only scoped assets |

---

## 5. Module 4: Vulnerability Scans

### TC-SCAN-001: View Scans List

| Field | Value |
|-------|-------|
| **Priority** | Critical |
| **Precondition** | Logged in with `scan.view`, scans exist in seed data |
| **Steps** | 1. Navigate to `/scans` |
| **Expected Result** | - Stats: Total Scans, Running, Completed, Failed <br> - Scan table with: name, type badge, status badge, target count, findings by severity, dates |

### TC-SCAN-002: Create New Scan

| Field | Value |
|-------|-------|
| **Priority** | Critical |
| **Precondition** | Logged in with `scan.create` capability |
| **Steps** | 1. Click "Create Scan" <br> 2. Fill: Name: "Manual Test Scan", Type: "vulnerability", select target assets <br> 3. Submit |
| **Expected Result** | - Scan created with status "queued" <br> - Appears in scan list <br> - POST `/api/scans/create` returns 201 <br> - Audit log records scan creation |

### TC-SCAN-003: Search Scans by Name

| Field | Value |
|-------|-------|
| **Priority** | Medium |
| **Precondition** | On scans page, multiple scans exist |
| **Steps** | 1. Type scan name in search bar |
| **Expected Result** | - Table filters to matching scans |

### TC-SCAN-004: Scan Without Permission

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Precondition** | Logged in as `viewer` role (no `scan.view`) |
| **Steps** | 1. Navigate to `/scans` |
| **Expected Result** | - API returns 403 <br> - Page shows access denied or empty state <br> - "Create Scan" button is hidden (Gate component) |

---

## 6. Module 5: Compliance Management

### TC-COMP-001: View Compliance Frameworks

| Field | Value |
|-------|-------|
| **Priority** | Critical |
| **Precondition** | Logged in, compliance data seeded |
| **Steps** | 1. Navigate to `/compliance` |
| **Expected Result** | - 3 frameworks visible: GDPR, PCI DSS, HIPAA <br> - Each shows: overall score %, control counts by status <br> - Expandable control lists |

### TC-COMP-002: Expand Framework Controls

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Precondition** | On compliance page |
| **Steps** | 1. Click on GDPR framework to expand <br> 2. Review control list |
| **Expected Result** | - Shows all GDPR controls (10 expected) <br> - Each control: controlId, title, status badge, category, evidence count, notes |

### TC-COMP-003: Update Control Status

| Field | Value |
|-------|-------|
| **Priority** | Critical |
| **Precondition** | On compliance page with controls visible |
| **Steps** | 1. Find a control with status "not_assessed" <br> 2. Change status to "compliant" <br> 3. Add evidence notes <br> 4. Save |
| **Expected Result** | - Control status badge updates to green "compliant" <br> - Framework overall score recalculates <br> - PATCH `/api/compliance/update` returns 200 <br> - Last assessed date updates |

### TC-COMP-004: Compliance Score Accuracy

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Precondition** | On compliance page |
| **Steps** | 1. Count controls per status for a framework <br> 2. Manually calculate: (compliant / total) * 100 <br> 3. Compare to displayed score |
| **Expected Result** | - Displayed score matches manual calculation <br> - Score includes partially_compliant as partial credit (if applicable) |

---

## 7. Module 6: SIEM Events & Alerts

### TC-SIEM-001: View SIEM Events

| Field | Value |
|-------|-------|
| **Priority** | Critical |
| **Precondition** | Logged in with `siem.view`, SIEM data seeded |
| **Steps** | 1. Navigate to `/siem` |
| **Expected Result** | - Stats: Total Events, Active Alerts, Critical Alerts <br> - Event list with: source, severity badge, category, details, sourceIp, destIp <br> - Alert list with: severity, status, description, assignedTo |

### TC-SIEM-002: SIEM Without Permission

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Precondition** | Logged in as `viewer` (no `siem.view`) |
| **Steps** | 1. Navigate to `/siem` |
| **Expected Result** | - API returns 403 <br> - Page shows empty state or access denied |

---

## 8. Module 7: AI Actions

### TC-AI-001: View AI Actions

| Field | Value |
|-------|-------|
| **Priority** | Critical |
| **Precondition** | Logged in with `ai.view`, AI actions seeded |
| **Steps** | 1. Navigate to `/ai-actions` |
| **Expected Result** | - Stats: Total Actions, Pending, Approved, Executed <br> - Action list: type badge, title, description, riskLevel badge, status, config JSON |

### TC-AI-002: AI Actions Without Permission

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Precondition** | Logged in as `viewer` (no `ai.view`) |
| **Steps** | 1. Navigate to `/ai-actions` |
| **Expected Result** | - API returns 403 <br> - Page shows access denied |

---

## 9. Module 8: Risk Scoring

### TC-RISK-001: View Risk Scores

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Precondition** | Logged in with `risk.view`, scan results exist |
| **Steps** | 1. Navigate to `/risk-scoring` |
| **Expected Result** | - AI-prioritized risk scores displayed <br> - Vulnerability findings grouped by severity <br> - Risk score computation visible |

---

## 10. Module 9: Reports

### TC-REPORT-001: View Reports List

| Field | Value |
|-------|-------|
| **Priority** | Critical |
| **Precondition** | Logged in with `report.view` |
| **Steps** | 1. Navigate to `/reports` |
| **Expected Result** | - Stats: Total Reports, Generating, Completed <br> - Report list: name, type badge, status, template, date |

### TC-REPORT-002: Generate New Report

| Field | Value |
|-------|-------|
| **Priority** | Critical |
| **Precondition** | Logged in with `report.create` |
| **Steps** | 1. Click "Generate Report" <br> 2. Select report type and template <br> 3. Submit |
| **Expected Result** | - Report created with status "generating" <br> - Appears in report list <br> - POST `/api/reports/generate` returns 201 |

### TC-REPORT-003: Reports Without Permission

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Precondition** | Logged in as `remediation-user` (no `report.view`) |
| **Steps** | 1. Navigate to `/reports` |
| **Expected Result** | - API returns 403 |

---

## 11. Module 10: User Management

### TC-USER-001: View User List

| Field | Value |
|-------|-------|
| **Priority** | Critical |
| **Precondition** | Logged in with `admin.user.view` |
| **Steps** | 1. Navigate to `/settings/users` |
| **Expected Result** | - User list loads with all tenant users <br> - Each user shows: name, email, status badge, role badges, scope info <br> - Stats cards visible |

### TC-USER-002: Invite New User

| Field | Value |
|-------|-------|
| **Priority** | Critical |
| **Precondition** | Logged in with `admin.user.manage` |
| **Steps** | 1. Click "Invite User" <br> 2. Fill: Name: "Test Analyst", Email: "analyst@exargen.com", Role: "Security Analyst" <br> 3. Click "Send Invitation" |
| **Expected Result** | - User created with status "invited" <br> - Invitation email sent (or invite link available in server logs) <br> - New user appears in list with "Invited" badge <br> - Audit log records `user.invited` |

### TC-USER-003: Search Users

| Field | Value |
|-------|-------|
| **Priority** | Medium |
| **Precondition** | On users page, multiple users exist |
| **Steps** | 1. Type "admin" in search bar |
| **Expected Result** | - Filters to show only users matching "admin" in name or email |

### TC-USER-004: Filter Users by Status

| Field | Value |
|-------|-------|
| **Priority** | Medium |
| **Precondition** | On users page, users in different statuses |
| **Steps** | 1. Click "Invited" status filter |
| **Expected Result** | - Only invited users shown |

### TC-USER-005: Filter Users by Role

| Field | Value |
|-------|-------|
| **Priority** | Medium |
| **Precondition** | On users page |
| **Steps** | 1. Select "Security Analyst" from role dropdown |
| **Expected Result** | - Only users with Security Analyst role shown |

### TC-USER-006: Suspend User

| Field | Value |
|-------|-------|
| **Priority** | Critical |
| **Precondition** | At least 2 active users exist |
| **Steps** | 1. Find a non-admin active user <br> 2. Click suspend action <br> 3. Confirm suspension |
| **Expected Result** | - User status changes to "suspended" <br> - Status badge updates to red <br> - Audit log records `user.suspended` with severity `high` <br> - Suspended user can no longer login (verify in TC-AUTH-008) |

### TC-USER-007: Reactivate User

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Precondition** | A suspended user exists |
| **Steps** | 1. Find the suspended user <br> 2. Click reactivate action <br> 3. Confirm reactivation |
| **Expected Result** | - User status changes to "active" <br> - Status badge updates to green <br> - Audit log records `user.reactivated` <br> - User can login again |

### TC-USER-008: Cannot Suspend Self

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Precondition** | Logged in as admin |
| **Steps** | 1. Try to suspend own account |
| **Expected Result** | - Action is blocked/hidden <br> - API returns error if attempted directly <br> - Cannot lock yourself out |

### TC-USER-009: Cannot Suspend Platform Admin

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Precondition** | Another Platform Administrator exists |
| **Steps** | 1. Try to suspend the other Platform Admin |
| **Expected Result** | - Action is blocked <br> - API returns error: cannot suspend Platform Administrators |

### TC-USER-010: Assign Role to User

| Field | Value |
|-------|-------|
| **Priority** | Critical |
| **Precondition** | A user with one role exists |
| **Steps** | 1. Find the user <br> 2. Click "Assign Role" <br> 3. Select "Auditor" from dropdown <br> 4. Confirm |
| **Expected Result** | - Role added to user <br> - User now shows both role badges <br> - User gets combined capabilities from both roles <br> - Audit log records `role.assigned` |

### TC-USER-011: Remove Role from User

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Precondition** | User has 2+ roles assigned |
| **Steps** | 1. Find a user with multiple roles <br> 2. Remove one role |
| **Expected Result** | - Role removed <br> - User's capabilities updated (loses removed role's capabilities) <br> - Cannot remove last remaining role (minimum 1 required) |

### TC-USER-012: Resend Invitation

| Field | Value |
|-------|-------|
| **Priority** | Medium |
| **Precondition** | An invited (pending) user exists |
| **Steps** | 1. Find the invited user <br> 2. Click "Resend Invitation" |
| **Expected Result** | - New invitation token generated <br> - Expiry extended <br> - Email re-sent <br> - Audit log records the resend |

### TC-USER-013: Revoke Invitation

| Field | Value |
|-------|-------|
| **Priority** | Medium |
| **Precondition** | An invited (pending) user exists |
| **Steps** | 1. Find the invited user <br> 2. Click "Revoke Invitation" |
| **Expected Result** | - Invitation status changes to "revoked" <br> - User status changes to "deactivated" <br> - Invitation link no longer works |

### TC-USER-014: User Management Without Permission

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Precondition** | Logged in as `viewer` or `auditor` (no `admin.user.manage`) |
| **Steps** | 1. Navigate to `/settings/users` |
| **Expected Result** | - `auditor` with `admin.user.view` can see users but NOT suspend/invite/manage <br> - `viewer` without `admin.user.view` gets 403 on API <br> - Management buttons hidden via Gate component |

---

## 12. Module 11: Role Management & RBAC

### TC-ROLE-001: View All Roles

| Field | Value |
|-------|-------|
| **Priority** | Critical |
| **Precondition** | Logged in with `admin.role.view` |
| **Steps** | 1. Navigate to `/settings/roles` |
| **Expected Result** | - 7 built-in roles listed <br> - Each shows: name, description, capability count, user count, builtin/custom badge <br> - Built-in roles marked distinctly |

### TC-ROLE-002: Create Custom Role

| Field | Value |
|-------|-------|
| **Priority** | Critical |
| **Precondition** | Logged in with `admin.role.manage` |
| **Steps** | 1. Click "Create Role" <br> 2. Fill: Name: "SOC Lead", Slug: "soc-lead", Description: "Senior analyst with escalation rights", Max Assignments: 5 <br> 3. Submit |
| **Expected Result** | - New role appears in list with "custom" badge <br> - Capability count starts at 0 <br> - Audit log records `role.created` |

### TC-ROLE-003: Edit Capability Matrix

| Field | Value |
|-------|-------|
| **Priority** | Critical |
| **Precondition** | Custom role "SOC Lead" exists |
| **Steps** | 1. Click on "SOC Lead" to expand <br> 2. Open capability matrix editor <br> 3. Grant: `dash.view`, `scan.view`, `scan.execute`, `siem.view`, `siem.escalate`, `ai.view`, `ai.approve.standard` <br> 4. Deny: `admin.billing.manage` <br> 5. Save |
| **Expected Result** | - Capabilities saved (7 granted, 1 denied) <br> - Role capability count updates to reflect grants <br> - Each capability shows risk level badge (low/medium/high/critical) <br> - Module groups (Dashboard, Scans, etc.) are expandable |

### TC-ROLE-004: Clone Role

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Precondition** | A role with capabilities exists |
| **Steps** | 1. Click "Clone" on "Security Analyst" role |
| **Expected Result** | - New role created: "Security Analyst (Copy)" <br> - All 25 capabilities copied exactly <br> - New role is custom (not built-in) <br> - Audit log records clone |

### TC-ROLE-005: Delete Custom Role

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Precondition** | Custom role with NO users assigned |
| **Steps** | 1. Find a custom role with 0 users <br> 2. Click Delete <br> 3. Confirm |
| **Expected Result** | - Role removed from list <br> - Audit log records `role.deleted` with severity `high` |

### TC-ROLE-006: Cannot Delete Built-in Role

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Precondition** | On roles page |
| **Steps** | 1. Try to delete "Platform Administrator" (built-in) |
| **Expected Result** | - Delete button hidden or disabled for built-in roles <br> - API returns error if attempted directly |

### TC-ROLE-007: Cannot Delete Role with Active Users

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Precondition** | Custom role has users assigned |
| **Steps** | 1. Try to delete the role |
| **Expected Result** | - Error: "Cannot delete role with active users" <br> - Users must be reassigned first |

### TC-ROLE-008: Max Assignments Enforcement

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Precondition** | "Platform Administrator" has maxAssignments=2, 1 admin exists |
| **Steps** | 1. Assign Platform Administrator to a 2nd user (should succeed) <br> 2. Try to assign Platform Administrator to a 3rd user |
| **Expected Result** | - 2nd assignment succeeds <br> - 3rd assignment fails: "Maximum assignments (2) reached for this role" |

### TC-ROLE-009: Deny-Wins Conflict Resolution

| Field | Value |
|-------|-------|
| **Priority** | Critical |
| **Precondition** | User has 2 roles: Role A grants `admin.billing.manage`, Role B explicitly denies `admin.billing.manage` |
| **Steps** | 1. Assign both roles to a test user <br> 2. Login as that user <br> 3. Check capabilities via `/api/auth/me/capabilities` |
| **Expected Result** | - `admin.billing.manage` appears in `denied` array, NOT in `capabilities` <br> - Deny from Role B overrides grant from Role A <br> - This is the "deny-wins" rule |

### TC-ROLE-010: Role Search

| Field | Value |
|-------|-------|
| **Priority** | Low |
| **Precondition** | On roles page |
| **Steps** | 1. Type "admin" in search bar |
| **Expected Result** | - Filters to roles containing "admin" in name |

---

## 13. Module 12: Scope Management

### TC-SCOPE-001: View All Scopes

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Precondition** | Logged in with appropriate permissions |
| **Steps** | 1. Navigate to `/settings/scopes` |
| **Expected Result** | - 6 seeded scopes visible <br> - Each shows: name, description, tag filter, user count, Global badge (for Global scope) |

### TC-SCOPE-002: Create New Scope

| Field | Value |
|-------|-------|
| **Priority** | Critical |
| **Precondition** | Logged in with `admin.role.manage` |
| **Steps** | 1. Click "Create Scope" <br> 2. Fill: Name: "Dev Team Only", Description: "Development environment access", Tag Filter: `{"env": ["development"], "team": ["platform"]}` <br> 3. Submit |
| **Expected Result** | - Scope created <br> - Appears in scope list <br> - Tag filter JSON is valid and stored |

### TC-SCOPE-003: Preview Scope Matching Assets

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Precondition** | A scope with tag filters exists |
| **Steps** | 1. Click "Preview" on "Production Only" scope |
| **Expected Result** | - Shows count of matching assets <br> - Lists the actual asset names that match `{"env": ["production"]}` <br> - Only assets with `env:production` tag appear |

### TC-SCOPE-004: Edit Scope

| Field | Value |
|-------|-------|
| **Priority** | Medium |
| **Precondition** | Custom scope exists |
| **Steps** | 1. Click Edit on "Dev Team Only" <br> 2. Change tag filter to add `{"env": ["development", "staging"]}` <br> 3. Save |
| **Expected Result** | - Scope updated <br> - Preview now includes staging assets too |

### TC-SCOPE-005: Delete Scope

| Field | Value |
|-------|-------|
| **Priority** | Medium |
| **Precondition** | Custom scope with no users assigned |
| **Steps** | 1. Delete "Dev Team Only" scope |
| **Expected Result** | - Scope removed from list |

### TC-SCOPE-006: Cannot Delete Global Scope

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Precondition** | On scopes page |
| **Steps** | 1. Try to delete the "Global" scope |
| **Expected Result** | - Action blocked <br> - API returns error: cannot delete Global scope |

### TC-SCOPE-007: Assign Scope to User

| Field | Value |
|-------|-------|
| **Priority** | Critical |
| **Precondition** | A user and a scope exist |
| **Steps** | 1. Navigate to user management or scope management <br> 2. Assign "Production Only" scope to a test user |
| **Expected Result** | - Scope assigned <br> - User's asset view now filtered to production assets only |

---

## 14. Module 13: API Key Management

### TC-APIKEY-001: View API Keys

| Field | Value |
|-------|-------|
| **Priority** | Critical |
| **Precondition** | Logged in with `admin.apikey.manage` |
| **Steps** | 1. Navigate to `/settings/api-keys` |
| **Expected Result** | - Stats: Total Keys, Active, Expiring Soon <br> - Key list: name, prefix, role, rate limit, status, expiry, last used, creator |

### TC-APIKEY-002: Create API Key

| Field | Value |
|-------|-------|
| **Priority** | Critical |
| **Precondition** | Logged in with `admin.apikey.manage` |
| **Steps** | 1. Click "Create API Key" <br> 2. Fill: Name: "CI/CD Pipeline", Role: "API Service Account", Expiry: 90 days, Rate Limit: 1000 <br> 3. Submit |
| **Expected Result** | - Key created <br> - Key Reveal dialog shows FULL key (shown ONCE only) <br> - "Copy to Clipboard" button works <br> - After closing dialog, only key prefix is visible <br> - Audit log records `apikey.created` |

### TC-APIKEY-003: Key Shown Only Once

| Field | Value |
|-------|-------|
| **Priority** | Critical |
| **Precondition** | Just created an API key |
| **Steps** | 1. Close the key reveal dialog <br> 2. Try to view the full key again |
| **Expected Result** | - Full key is NO longer accessible <br> - Only prefix (first 8 chars) is shown <br> - This is by security design (key is hashed in DB) |

### TC-APIKEY-004: Rotate API Key

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Precondition** | Active API key exists |
| **Steps** | 1. Click "Rotate" on the API key <br> 2. Confirm rotation |
| **Expected Result** | - Old key invalidated <br> - New key generated and shown in reveal dialog <br> - New prefix is different from old <br> - Audit log records rotation |

### TC-APIKEY-005: Revoke API Key

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Precondition** | Active API key exists |
| **Steps** | 1. Click "Revoke" on the API key <br> 2. Confirm revocation |
| **Expected Result** | - Key status changes to "revoked" <br> - Key no longer works for API authentication <br> - Audit log records `apikey.revoked` with severity `high` |

### TC-APIKEY-006: API Key Without Permission

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Precondition** | Logged in without `admin.apikey.manage` |
| **Steps** | 1. Navigate to `/settings/api-keys` |
| **Expected Result** | - API returns 403 <br> - Page gated or shows access denied |

---

## 15. Module 14: Session Management

### TC-SESSION-001: View My Sessions

| Field | Value |
|-------|-------|
| **Priority** | Critical |
| **Precondition** | Logged in, active session exists |
| **Steps** | 1. Navigate to `/settings/sessions` |
| **Expected Result** | - Current session marked with "This device" badge <br> - Shows: device type icon, browser/OS, IP, last active time <br> - Other seeded sessions visible (Safari on macOS, Firefox on Linux - revoked) |

### TC-SESSION-002: Revoke Individual Session

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Precondition** | Multiple active sessions exist |
| **Steps** | 1. Find a session that is NOT the current one <br> 2. Click "Revoke" <br> 3. Confirm |
| **Expected Result** | - Session removed from active list <br> - That session's refresh token no longer works <br> - Audit log records session revocation |

### TC-SESSION-003: Revoke All Other Sessions

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Precondition** | Multiple active sessions exist |
| **Steps** | 1. Click "Revoke All Other Sessions" <br> 2. Confirm |
| **Expected Result** | - All sessions except current are revoked <br> - Current session still works (stays logged in) <br> - Count resets to 1 active session |

### TC-SESSION-004: Cannot Revoke Current Session from Session Page

| Field | Value |
|-------|-------|
| **Priority** | Medium |
| **Precondition** | On sessions page |
| **Steps** | 1. Look at the current session (marked "This device") |
| **Expected Result** | - Revoke button is hidden or disabled for current session <br> - Can only end current session via Logout |

### TC-SESSION-005: Admin Sees All User Sessions

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Precondition** | Logged in as admin with `admin.user.view` |
| **Steps** | 1. Navigate to sessions page <br> 2. Check admin section below "My Sessions" |
| **Expected Result** | - Shows all sessions grouped by user <br> - Expandable user groups <br> - Admin can revoke any user's session (with `admin.user.manage`) |

---

## 16. Module 15: Audit Log & Integrity

### TC-AUDIT-001: View Audit Log

| Field | Value |
|-------|-------|
| **Priority** | Critical |
| **Precondition** | Logged in with `admin.audit.view` |
| **Steps** | 1. Navigate to `/settings/audit-log` |
| **Expected Result** | - Stats: Total Events, Successful, Denied, Errors <br> - Integrity badge: "Chain Valid" (green) <br> - Event list with: timestamp, actor, action, result badge, severity badge |

### TC-AUDIT-002: Expand Audit Event Detail

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Precondition** | On audit log page, events exist |
| **Steps** | 1. Click on any audit event row to expand |
| **Expected Result** | - Detail panel shows: Event ID, full timestamp, actor name, actor email, IP address, resource type, resource ID, user agent, details JSON |

### TC-AUDIT-003: Filter by Category

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Precondition** | On audit log page |
| **Steps** | 1. Select "auth" from category dropdown |
| **Expected Result** | - Only authentication events shown (login, logout, login_failed) <br> - Other categories (rbac, data, admin, security) filtered out |

### TC-AUDIT-004: Filter by Result

| Field | Value |
|-------|-------|
| **Priority** | Medium |
| **Precondition** | On audit log page |
| **Steps** | 1. Click "Denied" result filter button |
| **Expected Result** | - Only denied events shown <br> - Success and error events hidden |

### TC-AUDIT-005: Filter by Date Range

| Field | Value |
|-------|-------|
| **Priority** | Medium |
| **Precondition** | On audit log page, events span multiple dates |
| **Steps** | 1. Set "From" date to 2 days ago <br> 2. Set "To" date to today |
| **Expected Result** | - Only events within the date range shown <br> - Events outside the range hidden |

### TC-AUDIT-006: Search Audit Log

| Field | Value |
|-------|-------|
| **Priority** | Medium |
| **Precondition** | On audit log page |
| **Steps** | 1. Type "login" in search bar |
| **Expected Result** | - Filters to events with "login" in action, actor, or email |

### TC-AUDIT-007: Export Audit Log as CSV

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Precondition** | Logged in with `admin.audit.export` |
| **Steps** | 1. Click "Export CSV" button |
| **Expected Result** | - CSV file downloaded <br> - Contains all audit log columns <br> - Respects current filters (if any active) |

### TC-AUDIT-008: Export Audit Log as JSON

| Field | Value |
|-------|-------|
| **Priority** | Medium |
| **Precondition** | Logged in with `admin.audit.export` |
| **Steps** | 1. Click "Export JSON" button |
| **Expected Result** | - JSON file downloaded <br> - Valid JSON structure <br> - Contains all audit log entries matching current filters |

### TC-AUDIT-009: Verify Hash Chain Integrity

| Field | Value |
|-------|-------|
| **Priority** | Critical |
| **Precondition** | Logged in with `admin.audit.view` |
| **Steps** | 1. Check the integrity badge on audit log page <br> 2. OR click "Check Integrity" on security dashboard |
| **Expected Result** | - Badge shows "Chain Valid" (green) <br> - API response: `{ valid: true, totalRecords: N, checkedAt: "..." }` <br> - Every audit log entry's hash links to the previous entry |

### TC-AUDIT-010: Tampered Audit Log Detection

| Field | Value |
|-------|-------|
| **Priority** | Critical |
| **Precondition** | Direct database access |
| **Steps** | 1. Manually modify an audit log entry's `action` field directly in the database <br> 2. Run integrity check |
| **Expected Result** | - Integrity check returns `valid: false` <br> - `firstInvalidId` points to the tampered record <br> - Badge shows "Chain Broken" (red) <br> - All subsequent records also fail (chain is broken from that point) |

### TC-AUDIT-011: Load More Pagination

| Field | Value |
|-------|-------|
| **Priority** | Medium |
| **Precondition** | More than 50 audit events exist |
| **Steps** | 1. Scroll to bottom of audit log <br> 2. Click "Load More" |
| **Expected Result** | - Next page of events loads <br> - Appended below existing events <br> - Cursor-based pagination (no duplicates) |

### TC-AUDIT-012: Audit Log Without Permission

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Precondition** | Logged in without `admin.audit.view` |
| **Steps** | 1. Navigate to `/settings/audit-log` |
| **Expected Result** | - API returns 403 <br> - Page shows access denied |

---

## 17. Module 16: Security Dashboard

### TC-SECDASH-001: View Security Score

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Precondition** | Logged in as admin |
| **Steps** | 1. Navigate to `/settings/security` |
| **Expected Result** | - Security Score (0-100) displayed in visual circle <br> - 5 scoring components shown: Audit Integrity (+30), No Failed Logins 24h (+25), API Key Health (+20), Session Count (+15), Security Headers (+10) <br> - Score = sum of passing checks |

### TC-SECDASH-002: Security Stat Cards

| Field | Value |
|-------|-------|
| **Priority** | Medium |
| **Precondition** | On security dashboard |
| **Steps** | 1. Review 4 stat cards |
| **Expected Result** | - Failed Logins (24h): count of failed login attempts in last 24 hours <br> - Active Sessions: count of current active sessions <br> - API Key Health: active/expiring-soon ratio <br> - Audit Integrity: Valid or Broken |

### TC-SECDASH-003: Check Integrity Quick Action

| Field | Value |
|-------|-------|
| **Priority** | Medium |
| **Precondition** | On security dashboard |
| **Steps** | 1. Click "Check Integrity" button |
| **Expected Result** | - Calls GET `/api/audit-log/integrity` <br> - Result updates in the Audit Integrity card <br> - Shows valid/invalid status |

---

## 18. Module 17: Invitation & Onboarding

### TC-INVITE-001: Full Invitation Flow (End-to-End)

| Field | Value |
|-------|-------|
| **Priority** | Critical |
| **Precondition** | Admin logged in, email delivery working |
| **Steps** | 1. Admin invites user: "analyst@exargen.com" with role "Security Analyst" <br> 2. Check email (or server logs) for invitation link <br> 3. Open invitation link in incognito browser <br> 4. Verify invitation details shown (org: Exargen, role: Security Analyst, invited by: Exargen Admin) <br> 5. Set password: "Analyst123!" <br> 6. Fill optional fields (department, phone) <br> 7. Click "Activate Account" |
| **Expected Result** | - Step 2: Email received with valid link containing `?token=xxx` <br> - Step 4: Invitation page shows correct org, role, inviter <br> - Step 7: Account activated, auto-logged in, redirected to dashboard <br> - User appears as "active" in user list <br> - User has Security Analyst capabilities <br> - Audit log records activation |

### TC-INVITE-002: Expired Invitation

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Precondition** | An invitation exists with past expiry date |
| **Steps** | 1. Try to access an expired invitation link |
| **Expected Result** | - Error: "Invitation has expired" <br> - Cannot activate account <br> - Admin must resend invitation |

### TC-INVITE-003: Revoked Invitation

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Precondition** | An invitation has been revoked |
| **Steps** | 1. Try to access the revoked invitation link |
| **Expected Result** | - Error: "Invitation has been revoked" <br> - Cannot activate account |

### TC-INVITE-004: Password Validation on Acceptance

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Precondition** | On invitation acceptance page |
| **Steps** | 1. Try password "short" (too short) <br> 2. Try password "nouppercase1" (no uppercase) <br> 3. Try password "NOLOWERCASE1" (no lowercase) <br> 4. Try password "NoNumbers!" (no number) <br> 5. Try valid password "ValidPass1!" |
| **Expected Result** | - Steps 1-4: Validation error shown <br> - Step 5: Accepted, account activated <br> - Requirements: min 8 chars, uppercase + lowercase + number |

### TC-INVITE-005: Invalid Invitation Token

| Field | Value |
|-------|-------|
| **Priority** | Medium |
| **Precondition** | None |
| **Steps** | 1. Navigate to `/accept-invitation?token=fake-invalid-token-123` |
| **Expected Result** | - Error: "Invalid or expired invitation" <br> - No account information leaked |

---

## 19. Module 18: RBAC Enforcement (Cross-Cutting)

These tests verify RBAC is correctly enforced across ALL modules.

### TC-RBAC-001: Viewer Role Access Matrix

| Field | Value |
|-------|-------|
| **Priority** | Critical |
| **Precondition** | User with ONLY `viewer` role logged in (capabilities: `dash.view`, `risk.view`, `report.view`, `report.export`) |
| **Steps** | Test access to every page: |

| Page | Expected |
|------|----------|
| `/` (Dashboard) | Visible (has `dash.view`) |
| `/assets` | Visible but empty/limited (scope filtered, no explicit capability) |
| `/scans` | 403 (no `scan.view`) |
| `/compliance` | Visible (uses `dash.view`) |
| `/siem` | 403 (no `siem.view`) |
| `/ai-actions` | 403 (no `ai.view`) |
| `/risk-scoring` | Visible (has `risk.view`) |
| `/reports` | Visible (has `report.view`) |
| `/settings/users` | 403 (no `admin.user.view`) |
| `/settings/roles` | 403 (no `admin.role.view`) |
| `/settings/api-keys` | 403 (no `admin.apikey.manage`) |
| `/settings/audit-log` | 403 (no `admin.audit.view`) |

### TC-RBAC-002: Auditor Role Access Matrix

| Field | Value |
|-------|-------|
| **Priority** | Critical |
| **Precondition** | User with ONLY `auditor` role |
| **Steps** | Test access to every page: |

| Page | Expected |
|------|----------|
| `/` (Dashboard) | Visible |
| `/assets` | Visible (read-only, `asset.view`) |
| `/scans` | Visible (read-only, `scan.view`) |
| `/compliance` | Visible |
| `/siem` | Visible (read-only, `siem.view`) |
| `/ai-actions` | Visible (read-only, `ai.view`) |
| `/reports` | Visible (read-only, `report.view`) |
| `/settings/users` | Visible (read-only, `admin.user.view`) - NO manage actions |
| `/settings/roles` | Visible (read-only, `admin.role.view`) - NO manage actions |
| `/settings/api-keys` | 403 (no `admin.apikey.manage`) |
| `/settings/audit-log` | Visible + can export (`admin.audit.view` + `admin.audit.export`) |

**Key verification**: Auditor should see data but NOT see any create/edit/delete buttons.

### TC-RBAC-003: Security Analyst Write Actions

| Field | Value |
|-------|-------|
| **Priority** | Critical |
| **Precondition** | User with `security-analyst` role |
| **Steps** | Verify these actions WORK: |

| Action | Expected |
|--------|----------|
| Create Scan | Allowed (`scan.create`) |
| Execute Scan | Allowed (`scan.execute`) |
| Edit Asset | Allowed (`asset.edit`) |
| Import Assets | Allowed (`asset.import`) |
| Override Risk Score | Allowed (`risk.override`) |
| Approve Standard AI Action | Allowed (`ai.approve.standard`) |
| Approve Critical AI Action | DENIED (no `ai.approve.critical`) |
| Create Role | DENIED (no `admin.role.manage`) |
| Manage Users | DENIED (no `admin.user.manage`) |
| Manage SIEM Rules | DENIED (no `siem.rule.manage`) |

### TC-RBAC-004: Multi-Role Capability Accumulation

| Field | Value |
|-------|-------|
| **Priority** | Critical |
| **Precondition** | User assigned BOTH `viewer` and `auditor` roles |
| **Steps** | 1. Check capabilities via `/api/auth/me/capabilities` |
| **Expected Result** | - User has UNION of both roles' capabilities <br> - Viewer capabilities: `dash.view`, `risk.view`, `report.view`, `report.export` <br> - Auditor adds: `scan.view`, `scan.export`, `asset.view`, `asset.export`, `ai.view`, `siem.view`, `admin.audit.view`, `admin.audit.export`, `admin.user.view`, `admin.role.view`, `scan.policy.view` <br> - Combined total = all unique capabilities from both roles |

### TC-RBAC-005: Frontend Gate Component

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Precondition** | Logged in as `viewer` role |
| **Steps** | 1. Navigate to dashboard <br> 2. Check if admin-only buttons are visible |
| **Expected Result** | - "Invite User" button: hidden <br> - "Create Role" button: hidden <br> - "Create Scan" button: hidden <br> - Dashboard data: visible <br> - Gate component renders `null` for unauthorized children <br> - GateMessage shows "You don't have permission" for settings sections |

### TC-RBAC-006: Direct API Bypass Attempt

| Field | Value |
|-------|-------|
| **Priority** | Critical |
| **Precondition** | Logged in as `viewer` role |
| **Steps** | 1. Using browser DevTools or curl, directly call: <br> `POST /api/scans/create` with scan data <br> `POST /api/users/invite` with user data <br> `DELETE /api/roles/[roleId]` |
| **Expected Result** | - ALL return 403 Forbidden <br> - No data created/modified <br> - Frontend hiding is backed by server-side enforcement |

### TC-RBAC-007: Org Admin Cannot Access Billing

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Precondition** | User with `org-admin` role (has explicit deny on `admin.billing.manage`) |
| **Steps** | 1. Check capabilities via API <br> 2. Try to access billing-related features |
| **Expected Result** | - `admin.billing.manage` appears in `denied` list <br> - Even though org-admin has nearly all capabilities, billing is explicitly denied |

---

## 20. Module 19: Security & Edge Cases

### TC-SEC-001: SQL Injection via Search Fields

| Field | Value |
|-------|-------|
| **Priority** | Critical |
| **Precondition** | On any page with search functionality |
| **Steps** | 1. In the assets search bar, type: `'; DROP TABLE assets; --` <br> 2. In the audit log search, type: `" OR 1=1 --` <br> 3. In user search, type: `<script>alert('xss')</script>` |
| **Expected Result** | - No database errors <br> - No data loss <br> - No script execution <br> - Prisma parameterized queries prevent injection <br> - React escapes HTML by default |

### TC-SEC-002: XSS via User Input

| Field | Value |
|-------|-------|
| **Priority** | Critical |
| **Precondition** | Logged in with create permissions |
| **Steps** | 1. Create asset with name: `<img src=x onerror=alert('XSS')>` <br> 2. Create role with name: `<script>document.cookie</script>` <br> 3. View these items in the UI |
| **Expected Result** | - No JavaScript execution <br> - Strings rendered as plain text <br> - React JSX auto-escapes by default |

### TC-SEC-003: UUID Validation on Dynamic Routes

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Precondition** | Logged in as admin |
| **Steps** | 1. Call `GET /api/users/not-a-uuid` <br> 2. Call `DELETE /api/roles/../../etc/passwd` <br> 3. Call `GET /api/api-keys/12345` |
| **Expected Result** | - All return 400 Bad Request: "Invalid ID format" <br> - UUID validation rejects non-UUID strings <br> - No path traversal possible |

### TC-SEC-004: Cross-Tenant Data Access Attempt

| Field | Value |
|-------|-------|
| **Priority** | Critical |
| **Precondition** | Two tenants exist (or simulate by modifying JWT) |
| **Steps** | 1. Login as Exargen admin <br> 2. Try to access resources with IDs belonging to another tenant <br> 3. Call `GET /api/users/[other-tenant-user-id]` |
| **Expected Result** | - 404 Not Found (not 403, to avoid confirming existence) <br> - No data from other tenant returned <br> - Every query filters by `tenantId` from JWT |

### TC-SEC-005: Unauthenticated API Access

| Field | Value |
|-------|-------|
| **Priority** | Critical |
| **Precondition** | Not logged in (no cookies) |
| **Steps** | 1. Call these APIs without any auth: <br> `GET /api/dashboard` <br> `GET /api/users` <br> `GET /api/audit-log` <br> `POST /api/scans/create` |
| **Expected Result** | - ALL return 401 Unauthorized <br> - No data leaked <br> - Only public endpoints work: `/api/health`, `/api/version`, `/api/auth/login` |

### TC-SEC-006: Expired JWT Token

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Precondition** | Have an expired access token |
| **Steps** | 1. Manually craft or wait for a JWT to expire <br> 2. Send request with expired token |
| **Expected Result** | - 401 Unauthorized <br> - `verifyToken()` returns null for expired JWTs |

### TC-SEC-007: Cookie Security Attributes

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Precondition** | Just logged in |
| **Steps** | 1. Open DevTools > Application > Cookies <br> 2. Inspect `byoc_token` and `byoc_refresh` cookies |
| **Expected Result** | - `HttpOnly`: true (not accessible via JavaScript) <br> - `Secure`: true (HTTPS only, in production) <br> - `SameSite`: Lax or Strict <br> - `Path`: / |

### TC-SEC-008: Concurrent Session from Multiple Browsers

| Field | Value |
|-------|-------|
| **Priority** | Medium |
| **Precondition** | Admin account |
| **Steps** | 1. Login from Chrome <br> 2. Login from Firefox (or incognito) <br> 3. Check sessions page from Chrome |
| **Expected Result** | - Both sessions visible on sessions page <br> - Each shows different browser/device <br> - Can revoke the other session <br> - Revoking one doesn't affect the other |

---

## 21. Module 20: API-Level Testing

These tests are performed directly against the API using DevTools, curl, or Postman.

### TC-API-001: Health Check

| Field | Value |
|-------|-------|
| **Priority** | Low |
| **Steps** | `GET /api/health` |
| **Expected Result** | - 200 OK <br> - `{ "status": "ok" }` <br> - No auth required |

### TC-API-002: Version Endpoint

| Field | Value |
|-------|-------|
| **Priority** | Low |
| **Steps** | `GET /api/version` |
| **Expected Result** | - 200 OK <br> - Returns version and build info <br> - No auth required |

### TC-API-003: Login API (Direct)

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Steps** | `POST /api/auth/login` with body: `{"email": "admin@exargen.com", "password": "Admin123!"}` |
| **Expected Result** | - 200 OK <br> - Response contains user object (id, email, name, roles) <br> - Set-Cookie headers for `byoc_token` and `byoc_refresh` |

### TC-API-004: Capabilities API

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Steps** | `GET /api/auth/me/capabilities` (with valid cookie) |
| **Expected Result** | - 200 OK <br> - Response: `{ capabilities: [...], denied: [...], roles: [...], globalScope: true/false }` <br> - For admin: all 39 capabilities, 0 denied, globalScope: true |

### TC-API-005: Audit Log Integrity API

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Steps** | `GET /api/audit-log/integrity` (with admin cookie) |
| **Expected Result** | - 200 OK <br> - `{ valid: true, totalRecords: N, checkedAt: "2026-03-03T..." }` |

### TC-API-006: Pagination (Cursor-Based)

| Field | Value |
|-------|-------|
| **Priority** | Medium |
| **Steps** | 1. `GET /api/audit-log?limit=5` <br> 2. Take `nextCursor` from response <br> 3. `GET /api/audit-log?limit=5&cursor=[nextCursor]` |
| **Expected Result** | - Page 1: 5 events + nextCursor <br> - Page 2: next 5 events <br> - No duplicate events between pages <br> - Last page: nextCursor is null |

### TC-API-007: API Key Authentication

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Precondition** | Active API key created |
| **Steps** | 1. `GET /api/scans` with header: `Authorization: Bearer byoc_xxxx...` |
| **Expected Result** | - 200 OK if API key has `scan.view` capability <br> - Response returns scans data <br> - `lastUsedAt` timestamp updates on the API key |

### TC-API-008: Revoked API Key Rejected

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Precondition** | API key has been revoked |
| **Steps** | 1. `GET /api/scans` with header: `Authorization: Bearer [revoked-key]` |
| **Expected Result** | - 401 Unauthorized <br> - Revoked keys cannot authenticate |

---

## 22. Automated E2E Testing Strategy

### Can You Automate All of This?

**Yes.** Here's how, with the recommended toolchain for your Next.js stack:

### Recommended Tools

| Tool | Purpose | Why |
|------|---------|-----|
| **Playwright** | Browser E2E testing | Best for Next.js, supports Chrome/Firefox/Safari, built-in auto-waiting, TypeScript native |
| **Vitest** | Unit + integration testing | Fast, Vite-compatible, works with TypeScript |
| **Supertest** or **fetch** | API route testing | Direct HTTP testing of Next.js API routes |
| **Prisma test utils** | Database setup/teardown | Seed/reset DB between test suites |
| **GitHub Actions** | CI pipeline | Run tests on every PR to master |

### Playwright Setup (Recommended)

```bash
npm install -D @playwright/test
npx playwright install
```

**File structure:**
```
tests/
  e2e/
    auth/
      login.spec.ts
      lockout.spec.ts
      invitation.spec.ts
    dashboard/
      dashboard.spec.ts
    assets/
      asset-crud.spec.ts
      asset-scope.spec.ts
    rbac/
      viewer-access.spec.ts
      auditor-access.spec.ts
      analyst-access.spec.ts
      deny-wins.spec.ts
      gate-component.spec.ts
    admin/
      user-management.spec.ts
      role-management.spec.ts
      api-keys.spec.ts
      sessions.spec.ts
    audit/
      audit-log.spec.ts
      integrity.spec.ts
    security/
      injection.spec.ts
      auth-bypass.spec.ts
      tenant-isolation.spec.ts
  api/
    auth.test.ts
    dashboard.test.ts
    users.test.ts
    roles.test.ts
    scans.test.ts
    audit.test.ts
  unit/
    rbac-engine.test.ts
    capabilities.test.ts
    audit-hash.test.ts
    security.test.ts
```

### Example Playwright Test (Login Flow)

```typescript
// tests/e2e/auth/login.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('successful login redirects to dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@exargen.com');
    await page.fill('input[type="password"]', 'Admin123!');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL('/');
    await expect(page.locator('text=Total Assets')).toBeVisible();
  });

  test('invalid password shows error', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@exargen.com');
    await page.fill('input[type="password"]', 'WrongPassword');
    await page.click('button[type="submit"]');

    await expect(page.locator('text=Invalid email or password')).toBeVisible();
    await expect(page).toHaveURL('/login');
  });

  test('account lockout after 5 failed attempts', async ({ page }) => {
    await page.goto('/login');

    for (let i = 0; i < 5; i++) {
      await page.fill('input[type="email"]', 'admin@exargen.com');
      await page.fill('input[type="password"]', 'WrongPassword');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(500);
    }

    // 6th attempt with correct password should still fail
    await page.fill('input[type="password"]', 'Admin123!');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=Invalid email or password')).toBeVisible();
  });
});
```

### Example API Test (RBAC Enforcement)

```typescript
// tests/api/rbac-enforcement.test.ts
import { describe, test, expect, beforeAll } from 'vitest';

const BASE_URL = 'http://localhost:3000';

async function loginAs(email: string, password: string) {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const cookies = res.headers.getSetCookie();
  return cookies.find(c => c.startsWith('byoc_token='));
}

describe('RBAC Enforcement', () => {
  let adminCookie: string;
  let viewerCookie: string;

  beforeAll(async () => {
    adminCookie = await loginAs('admin@exargen.com', 'Admin123!');
    viewerCookie = await loginAs('viewer@exargen.com', 'Viewer123!');
  });

  test('admin can access audit log', async () => {
    const res = await fetch(`${BASE_URL}/api/audit-log`, {
      headers: { Cookie: adminCookie },
    });
    expect(res.status).toBe(200);
  });

  test('viewer cannot access audit log', async () => {
    const res = await fetch(`${BASE_URL}/api/audit-log`, {
      headers: { Cookie: viewerCookie },
    });
    expect(res.status).toBe(403);
  });

  test('viewer cannot create scans', async () => {
    const res = await fetch(`${BASE_URL}/api/scans/create`, {
      method: 'POST',
      headers: { Cookie: viewerCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'hack', type: 'vulnerability' }),
    });
    expect(res.status).toBe(403);
  });

  test('unauthenticated request returns 401', async () => {
    const res = await fetch(`${BASE_URL}/api/dashboard`);
    expect(res.status).toBe(401);
  });
});
```

### Example Unit Test (RBAC Engine)

```typescript
// tests/unit/rbac-engine.test.ts
import { describe, test, expect } from 'vitest';
import { CAPABILITIES, BUILTIN_ROLES } from '@/lib/capabilities';

describe('Capability Registry', () => {
  test('has 39 capabilities', () => {
    expect(CAPABILITIES).toHaveLength(39);
  });

  test('all capabilities have unique IDs', () => {
    const ids = CAPABILITIES.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('all capability IDs follow dot notation', () => {
    for (const cap of CAPABILITIES) {
      expect(cap.id).toMatch(/^[a-z]+\.[a-z.]+$/);
    }
  });

  test('platform-admin has all capabilities', () => {
    const admin = BUILTIN_ROLES.find(r => r.slug === 'platform-admin');
    expect(admin!.capabilities).toHaveLength(CAPABILITIES.length);
  });

  test('org-admin denies billing', () => {
    const orgAdmin = BUILTIN_ROLES.find(r => r.slug === 'org-admin');
    expect(orgAdmin!.deniedCapabilities).toContain('admin.billing.manage');
    expect(orgAdmin!.capabilities).not.toContain('admin.billing.manage');
  });

  test('viewer has minimal capabilities', () => {
    const viewer = BUILTIN_ROLES.find(r => r.slug === 'viewer');
    expect(viewer!.capabilities).toHaveLength(4);
    expect(viewer!.capabilities).toContain('dash.view');
    expect(viewer!.capabilities).toContain('report.view');
  });

  test('platform-admin limited to 2 assignments', () => {
    const admin = BUILTIN_ROLES.find(r => r.slug === 'platform-admin');
    expect(admin!.maxAssignments).toBe(2);
  });
});
```

### CI Pipeline (GitHub Actions)

```yaml
# .github/workflows/test.yml
name: E2E Tests
on:
  push:
    branches: [master]
  pull_request:
    branches: [master]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: byoc_test
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
        ports: ['5432:5432']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
      - run: npm ci
      - run: npx prisma migrate deploy
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/byoc_test
      - run: npx prisma db seed
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/byoc_test
      - run: npx playwright install --with-deps
      - run: npm run test:unit
      - run: npm run test:api
      - run: npm run test:e2e
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/byoc_test
          AUTH_SECRET: test-secret-at-least-32-characters-long
```

---

## 23. Test Execution Tracker

### Summary

| Module | Total Cases | Critical | High | Medium | Low |
|--------|------------|----------|------|--------|-----|
| 1. Authentication | 9 | 4 | 3 | 1 | 1 |
| 2. Dashboard | 5 | 1 | 1 | 2 | 1 |
| 3. Assets | 8 | 3 | 2 | 2 | 1 |
| 4. Scans | 4 | 2 | 1 | 1 | 0 |
| 5. Compliance | 4 | 2 | 1 | 1 | 0 |
| 6. SIEM | 2 | 1 | 1 | 0 | 0 |
| 7. AI Actions | 2 | 1 | 1 | 0 | 0 |
| 8. Risk Scoring | 1 | 0 | 1 | 0 | 0 |
| 9. Reports | 3 | 2 | 1 | 0 | 0 |
| 10. User Management | 14 | 4 | 5 | 4 | 1 |
| 11. Role Management | 10 | 3 | 5 | 1 | 1 |
| 12. Scope Management | 7 | 2 | 2 | 2 | 1 |
| 13. API Keys | 6 | 2 | 2 | 1 | 1 |
| 14. Sessions | 5 | 1 | 3 | 1 | 0 |
| 15. Audit Log | 12 | 3 | 3 | 5 | 1 |
| 16. Security Dashboard | 3 | 0 | 1 | 2 | 0 |
| 17. Invitation Flow | 5 | 1 | 3 | 1 | 0 |
| 18. RBAC Enforcement | 7 | 4 | 2 | 1 | 0 |
| 19. Security/Edge Cases | 8 | 3 | 3 | 1 | 1 |
| 20. API-Level Testing | 8 | 0 | 4 | 2 | 2 |
| **TOTAL** | **123** | **39** | **44** | **26** | **11** |

### Execution Log Template

| Test Case ID | Status | Tester | Date | Notes |
|-------------|--------|--------|------|-------|
| TC-AUTH-001 | Pass / Fail / Blocked | | | |
| TC-AUTH-002 | Pass / Fail / Blocked | | | |
| ... | ... | ... | ... | ... |

### Status Definitions

| Status | Meaning |
|--------|---------|
| **Pass** | Test executed, all expected results verified |
| **Fail** | Test executed, one or more expected results not met |
| **Blocked** | Cannot execute due to dependency or environment issue |
| **Skipped** | Intentionally not executed (with reason documented) |
| **Not Run** | Not yet executed |

---

## Appendix A: Role-Capability Quick Reference

| Capability | Platform Admin | Org Admin | Security Analyst | Auditor | Viewer | Remediation | API Service |
|------------|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| dash.view | Y | Y | Y | Y | Y | Y | - |
| dash.customize | Y | Y | Y | - | - | - | - |
| scan.view | Y | Y | Y | Y | - | Y | Y |
| scan.create | Y | Y | Y | - | - | - | Y |
| scan.execute | Y | Y | Y | - | - | - | Y |
| asset.view | Y | Y | Y | Y | - | Y | Y |
| asset.create | Y | Y | - | - | - | - | - |
| asset.delete | Y | Y | - | - | - | - | - |
| risk.view | Y | Y | Y | Y | Y | Y | - |
| risk.override | Y | Y | Y | - | - | - | - |
| report.view | Y | Y | Y | Y | Y | Y | Y |
| report.create | Y | Y | Y | - | - | - | - |
| ai.view | Y | Y | Y | Y | - | - | - |
| ai.approve.standard | Y | Y | Y | - | - | - | - |
| ai.approve.critical | Y | Y | - | - | - | - | - |
| ai.configure | Y | Y | - | - | - | - | - |
| siem.view | Y | Y | Y | Y | - | - | Y |
| siem.rule.manage | Y | Y | - | - | - | - | - |
| admin.user.view | Y | Y | - | Y | - | - | - |
| admin.user.manage | Y | Y | - | - | - | - | - |
| admin.role.view | Y | Y | - | Y | - | - | - |
| admin.role.manage | Y | Y | - | - | - | - | - |
| admin.apikey.manage | Y | Y | Y | - | - | - | - |
| admin.billing.manage | Y | DENY | - | - | - | - | - |
| admin.audit.view | Y | Y | Y | Y | - | - | - |
| admin.audit.export | Y | Y | - | Y | - | - | - |

*(Table shows selected capabilities. Full matrix has all 39.)*

---

## Appendix B: Test Data Quick Reference

### Users to Create for Testing

| Email | Role | Purpose |
|-------|------|---------|
| admin@exargen.com | Platform Administrator | Pre-seeded admin (all access) |
| orgadmin@exargen.com | Organization Administrator | Test org-admin deny-wins on billing |
| analyst@exargen.com | Security Analyst | Test write operations, no admin access |
| auditor@exargen.com | Auditor | Test read-only access |
| viewer@exargen.com | Viewer | Test minimal access |
| remediation@exargen.com | Remediation User | Test limited scope |
| multi@exargen.com | Viewer + Auditor | Test multi-role accumulation |
| scoped@exargen.com | Security Analyst + "Production Only" scope | Test scope-filtered data |

### Critical Paths (Smoke Test Order)

1. Login as admin
2. View dashboard (data loads)
3. View assets (12 assets visible)
4. View scans
5. View compliance (3 frameworks)
6. Invite new user
7. Accept invitation (new browser)
8. Login as new user
9. Verify role-appropriate access
10. View audit log (records all above actions)
11. Verify hash chain integrity

---

*Document generated: 2026-03-03*
*Platform version: BYOC v1.0*
*Total test cases: 123*
*Modules covered: 20*
