# BYOC Platform - Detailed Manual Test Cases

**Version:** 2.0
**Date:** 2026-03-10
**Tester:** _______________
**Environment:** _______________
**Build/Commit:** _______________

---

## How to Use This Document

Each test case follows this format:

- **ID**: Unique identifier (e.g., TC-AUTH-001)
- **Title**: What is being tested
- **Priority**: Critical / High / Medium / Low
- **Preconditions**: What must be true BEFORE starting
- **Steps**: Numbered, exact actions to take (every click, every keystroke)
- **Expected Result**: What you should see after EACH step
- **Pass/Fail**: Circle or mark the result

> **Critical** = Must pass before release. Failure blocks deployment.
> **High** = Must pass. Failure is a significant bug.
> **Medium** = Should pass. Failure is a minor bug.
> **Low** = Nice to have. Failure is cosmetic.

---

## Pre-Test Setup Checklist

Complete these steps before running any test cases:

| # | Setup Step | Done |
|---|-----------|------|
| 1 | Run `npx prisma db seed` to reset database to clean state | [ ] |
| 2 | Start the application (`npm run dev` for local OR use https://byoc-rosy.vercel.app) | [ ] |
| 3 | Open Chrome browser (version 120 or newer) | [ ] |
| 4 | Open Chrome DevTools (F12) > keep Network and Console tabs accessible | [ ] |
| 5 | Have a second browser or incognito window ready (for multi-session tests) | [ ] |
| 6 | Confirm admin account works: admin@exargen.com / Admin123! | [ ] |
| 7 | Note the current time (for audit log verification) | [ ] |

### Seed Data Reference

| Data | Expected |
|------|----------|
| Tenant | Exargen (enterprise) |
| Admin user | admin@exargen.com / Admin123! (Platform Administrator) |
| Assets | 12 total (8 servers, 2 network devices, 1 database, 1 cloud resource) |
| Tags | 11 (env:production, env:staging, env:development, region:us-east-1, region:eu-west-1, region:ap-south-1, team:platform, team:security, team:data, criticality:tier-1, criticality:tier-2) |
| Scopes | 6 (Global, Production Only, US East Production, EU Operations, Security Team, PCI Zone) |
| Roles | 7 built-in (platform-admin, org-admin, security-analyst, auditor, viewer, remediation-user, api-service) |
| Audit events | 15 (hash-chained) |
| Sessions | 3 (2 active: Chrome/Safari, 1 revoked: Firefox) |

---

# MODULE 1: AUTHENTICATION & LOGIN

---

## TC-AUTH-001: Successful Login

| Field | Detail |
|-------|--------|
| **Priority** | Critical |
| **Precondition** | Browser is open. User is NOT logged in. No `byoc_token` cookie exists. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Open the application URL in the browser. | Page redirects to `/login`. You see the login page with: "BYOC" logo, "Cybersecurity Platform" subtitle, "Welcome back" heading, "Sign in to your security operations center" subtext. | |
| 2 | Verify the login hint is visible at the bottom. | Text reads: "Login: admin@exargen.com / Admin123!" | |
| 3 | Click in the **Email** field (placeholder shows "admin@exargen.com"). | Cursor appears in the email input field. | |
| 4 | Type: `admin@exargen.com` | Email appears in the field. | |
| 5 | Press **Tab** or click in the **Password** field (placeholder shows "Enter your password"). | Cursor moves to the password field. | |
| 6 | Type: `Admin123!` | Password appears as dots/bullets (masked). | |
| 7 | Click the **"Sign in"** button. | Button text changes to **"Authenticating..."** and a spinner appears. | |
| 8 | Wait for redirect. | Page redirects to `/` (dashboard). URL in address bar shows `/` or the root path. | |
| 9 | Verify the dashboard loaded. | You see: "Security Dashboard" heading, "Real-time overview of your security posture" subtitle, "Live monitoring active" indicator. Six stat cards are visible: "Total Assets", "Critical Vulnerabilities", "Risk Score", "Compliance Score", "Open Alerts", "AI Actions Pending". | |
| 10 | Open DevTools > Application > Cookies. | Two cookies exist: `byoc_token` and `byoc_refresh`. Both have `HttpOnly` flag set. | |
| 11 | Click **"Dashboard"** in the left sidebar to confirm navigation works. | Page stays on `/`. Sidebar shows "BYOC" logo with "Cybersecurity" subtitle. Nine nav items visible: Dashboard, Scans, Assets, Risk Scoring, Compliance, Reports, AI Actions, SIEM, Settings. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-AUTH-002: Login with Wrong Password

| Field | Detail |
|-------|--------|
| **Priority** | Critical |
| **Precondition** | On the login page (`/login`). Not logged in. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | In the **Email** field, type: `admin@exargen.com` | Email entered. | |
| 2 | In the **Password** field, type: `WrongPassword123` | Password entered (masked). | |
| 3 | Click **"Sign in"**. | Button shows "Authenticating..." briefly. | |
| 4 | Wait for response. | An error message appears on the page (red text or alert box). Message reads: **"Invalid credentials"** or similar. | |
| 5 | Verify you remain on the login page. | URL is still `/login`. Email field still has `admin@exargen.com`. Password field is cleared or still present. | |
| 6 | Open DevTools > Application > Cookies. | NO `byoc_token` or `byoc_refresh` cookies were set. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-AUTH-003: Login with Non-Existent Email

| Field | Detail |
|-------|--------|
| **Priority** | High |
| **Precondition** | On the login page. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | In the **Email** field, type: `nobody@exargen.com` | Email entered. | |
| 2 | In the **Password** field, type: `AnyPassword1!` | Password entered. | |
| 3 | Click **"Sign in"**. | Error appears. | |
| 4 | Read the error message carefully. | Message is the SAME generic error as TC-AUTH-002 ("Invalid credentials"). It does NOT say "User not found" or "Email does not exist". This prevents user enumeration. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-AUTH-004: Login with Empty Email

| Field | Detail |
|-------|--------|
| **Priority** | Medium |
| **Precondition** | On the login page. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Leave the **Email** field empty. | Field is blank. | |
| 2 | In the **Password** field, type: `Admin123!` | Password entered. | |
| 3 | Click **"Sign in"**. | Either: (a) Browser shows HTML5 validation "Please fill out this field" tooltip, or (b) Application shows its own validation error. Form is NOT submitted. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-AUTH-005: Login with Empty Password

| Field | Detail |
|-------|--------|
| **Priority** | Medium |
| **Precondition** | On the login page. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | In the **Email** field, type: `admin@exargen.com` | Email entered. | |
| 2 | Leave the **Password** field empty. | Field is blank. | |
| 3 | Click **"Sign in"**. | Either: (a) Browser validation prevents submission, or (b) Application error message. Form is NOT submitted to the server. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-AUTH-006: Account Lockout After 5 Failed Attempts

| Field | Detail |
|-------|--------|
| **Priority** | Critical |
| **Precondition** | On the login page. Account is NOT currently locked. Database freshly seeded. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Type email: `admin@exargen.com`, password: `WrongPass1`. Click **"Sign in"**. | Error: "Invalid credentials". Attempt 1 recorded. | |
| 2 | Clear password field. Type: `WrongPass2`. Click **"Sign in"**. | Error. Attempt 2. | |
| 3 | Clear password field. Type: `WrongPass3`. Click **"Sign in"**. | Error. Attempt 3. | |
| 4 | Clear password field. Type: `WrongPass4`. Click **"Sign in"**. | Error. Attempt 4. | |
| 5 | Clear password field. Type: `WrongPass5`. Click **"Sign in"**. | Error. Attempt 5. Account is now LOCKED for 15 minutes. | |
| 6 | Now type the CORRECT password: `Admin123!`. Click **"Sign in"**. | Login STILL FAILS even with correct password. Error message shown. Account remains locked. | |
| 7 | Wait 15 minutes (or manually clear `lockedUntil` field in database). Then try `Admin123!` again. | Login succeeds. Redirected to dashboard. | |

**Cleanup:** If you manually unlocked the account in step 7, note that here. Otherwise wait the full 15 minutes.

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-AUTH-007: Logout

| Field | Detail |
|-------|--------|
| **Priority** | Critical |
| **Precondition** | Logged in as admin. On any dashboard page. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Locate the logout button/link in the sidebar or top navigation. | Logout option is visible. | |
| 2 | Click the logout button. | Page redirects to `/login`. | |
| 3 | Check the URL bar. | URL shows `/login`. | |
| 4 | Open DevTools > Application > Cookies. | `byoc_token` and `byoc_refresh` cookies are GONE (cleared). | |
| 5 | Try to navigate directly to `/` by typing it in the URL bar. | Redirected back to `/login`. Cannot access dashboard without authentication. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-AUTH-008: Suspended User Cannot Login

| Field | Detail |
|-------|--------|
| **Priority** | Critical |
| **Precondition** | A second user has been created and SUSPENDED (see TC-USER-006 for how to suspend). You know their email and password. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Open an incognito/private browser window. | Clean browser with no cookies. | |
| 2 | Navigate to the login page. | Login page loads. | |
| 3 | Enter the suspended user's email and password. | Fields filled. | |
| 4 | Click **"Sign in"**. | Login FAILS. Error: "Invalid credentials" (same generic message -- no indication the account is suspended, to prevent information leakage). | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-AUTH-009: Login Page Branding Verification

| Field | Detail |
|-------|--------|
| **Priority** | Low |
| **Precondition** | On the login page. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Look at the top of the login card. | Shows "BYOC" in large text, "Cybersecurity Platform" below it. | |
| 2 | Check the main heading. | "Welcome back" text is visible. | |
| 3 | Check the subheading. | "Sign in to your security operations center" text is visible. | |
| 4 | Check the footer. | "BYOC Cybersecurity Platform v0.1.0" at the bottom. | |
| 5 | Verify NO reference to "Acme" appears anywhere. | No "Acme" text on the page. Only "Exargen" or "BYOC" branding. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

# MODULE 2: DASHBOARD

---

## TC-DASH-001: Dashboard Loads with All Stat Cards

| Field | Detail |
|-------|--------|
| **Priority** | Critical |
| **Precondition** | Logged in as admin@exargen.com. On the dashboard (`/`). |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Navigate to `/` (click "Dashboard" in sidebar). | Page loads. Heading: "Security Dashboard". Subtitle: "Real-time overview of your security posture". Green dot indicator: "Live monitoring active". | |
| 2 | Count the stat cards in the top section. | Exactly 6 stat cards visible. | |
| 3 | Verify stat card #1. | Title: "Total Assets". Value: a number (should be 12 from seed). Blue icon. | |
| 4 | Verify stat card #2. | Title: "Critical Vulnerabilities". Value: a number. Red icon. | |
| 5 | Verify stat card #3. | Title: "Risk Score". Value: a number followed by "/100". Orange/yellow icon. | |
| 6 | Verify stat card #4. | Title: "Compliance Score". Value: a number followed by "%". Green icon. | |
| 7 | Verify stat card #5. | Title: "Open Alerts". Value: a number. Purple icon. | |
| 8 | Verify stat card #6. | Title: "AI Actions Pending". Value: a number. Blue/indigo icon. | |
| 9 | Scroll down. Verify "Vulnerability Breakdown" section. | Card with title "Vulnerability Breakdown" is visible. Shows colored bars for: critical (red), high (orange), medium (yellow), low (blue), info (gray). Shows "Total Findings" count. | |
| 10 | Verify "Compliance Overview" section. | Card with title "Compliance Overview" is visible. Shows framework names (GDPR, PCI DSS, HIPAA) with progress bars. Each framework shows: "{count} Compliant", "{count} Partial", "{count} Non-compliant", "{count} Unassessed". | |
| 11 | Verify "Recent Activity" section. | Card with title "Recent Activity" is visible. Lists recent audit events. Each entry shows: actor name, action description, result badge (green "success" or red "denied"), and relative timestamp. | |
| 12 | Open DevTools > Network tab. Check the API call. | GET `/api/dashboard` returns 200 OK. Response is JSON with fields: totalAssets, criticalVulnerabilities, riskScore, complianceScore, openAlerts, pendingAiActions. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-DASH-002: Dashboard Data Accuracy

| Field | Detail |
|-------|--------|
| **Priority** | High |
| **Precondition** | On the dashboard. DevTools open. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Note the "Total Assets" number on the dashboard. | Record the value: _____ | |
| 2 | Click "Assets" in the sidebar to navigate to `/assets`. | Asset Inventory page loads. | |
| 3 | Check the "Total Assets" stat card on the assets page. | The number matches the dashboard's "Total Assets" value from step 1. | |
| 4 | Go back to the dashboard. Note the "Compliance Score" percentage. | Record the value: ____% | |
| 5 | Click "Compliance" in the sidebar to navigate to `/compliance`. | Compliance Center page loads. | |
| 6 | Check the overall compliance score. | Score is consistent with the dashboard percentage from step 4. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

# MODULE 3: ASSET MANAGEMENT

---

## TC-ASSET-001: View Asset Inventory

| Field | Detail |
|-------|--------|
| **Priority** | Critical |
| **Precondition** | Logged in as admin. Database seeded (12 assets). |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Click **"Assets"** in the sidebar. | Page navigates to `/assets`. Heading: "Asset Inventory". Subtitle: "Manage and monitor all assets across your organization". | |
| 2 | Verify the **"Add Asset"** button is visible in the top-right area. | Button labeled "Add Asset" is present. | |
| 3 | Count the stat cards. | 5 stat cards: "Total Assets", "Active", "Critical Assets", "High Priority", "Unscanned". | |
| 4 | Check the "Total Assets" card. | Value shows 12 (from seed data). | |
| 5 | Look at the asset table. | Card title: "Assets (12)". Table has columns: Name, Type, IP / Hostname, OS, Criticality, Tags, Group, Status. | |
| 6 | Verify the first few assets are visible. | Asset names like "exg-web-prod-01", "exg-api-prod-01", etc. are listed. Each row has: a name, a type badge (e.g., "Server"), IP address, OS name, criticality badge (colored: critical=red, high=orange, medium=yellow, low=green), colored tag pills, group name, status badge (green "active"). | |
| 7 | Verify asset types are displayed correctly. | Types shown as badges: "Server", "Network Device", "Database", "Cloud Resource". | |
| 8 | Verify tags are shown as colored pills. | Each asset shows its assigned tags as small colored badges (e.g., green "env:production", blue "region:us-east-1"). | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-ASSET-002: Search Assets by Name

| Field | Detail |
|-------|--------|
| **Priority** | High |
| **Precondition** | On the assets page. 12 assets visible. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Click in the search bar. Placeholder text reads: "Search by name, hostname, or IP address..." | Cursor appears in search field. | |
| 2 | Type: `prod` | As you type, the table filters in real-time. | |
| 3 | Count the visible rows. | Only assets with "prod" in their name or hostname are shown. Expected: ~6-8 production assets (exg-web-prod-01, exg-web-prod-02, exg-api-prod-01, exg-db-prod-01, exg-fw-prod-01, exg-siem-prod-01). | |
| 4 | Clear the search field (select all text, delete). | All 12 assets reappear. | |
| 5 | Type: `staging` | Only staging assets shown (exg-web-staging-01, exg-api-staging-01). | |
| 6 | Type: `zzzznonexistent` | Table shows empty state: "No assets match your filters." | |
| 7 | Clear the search field. | All 12 assets return. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-ASSET-003: Filter Assets by Tag

| Field | Detail |
|-------|--------|
| **Priority** | High |
| **Precondition** | On the assets page. Search field is clear. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Locate the tag filter button/dropdown. Default text: "Filter by tag". | Tag filter control is visible. | |
| 2 | Click the tag filter. | A dropdown appears showing available tags: env:production, env:staging, env:development, region:us-east-1, region:eu-west-1, region:ap-south-1, team:platform, team:security, team:data, criticality:tier-1, criticality:tier-2. | |
| 3 | Select **"env:production"**. | Dropdown closes. Filter button now shows the selected tag. Table updates to show ONLY assets tagged with env:production. | |
| 4 | Count the filtered results. | Multiple production assets shown. No staging or development assets visible. | |
| 5 | Clear the tag filter (click the filter again and deselect, or click a clear button). | All 12 assets reappear. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-ASSET-004: Combined Search and Tag Filter

| Field | Detail |
|-------|--------|
| **Priority** | Medium |
| **Precondition** | On the assets page. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Type `web` in the search bar. | Table filters to assets with "web" in name. | |
| 2 | Also select tag filter "env:production". | Table further filters to show only "web" assets that are ALSO tagged env:production. Should show: exg-web-prod-01, exg-web-prod-02. | |
| 3 | Clear both filters. | All 12 assets return. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

# MODULE 4: VULNERABILITY SCANS

---

## TC-SCAN-001: View Scans List

| Field | Detail |
|-------|--------|
| **Priority** | Critical |
| **Precondition** | Logged in as admin. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Click **"Scans"** in the sidebar. | Page navigates to `/scans`. Heading: "Scans". Subtitle: "Manage vulnerability scans and security assessments". Two buttons visible: "Refresh" and "New Scan". | |
| 2 | Verify stat cards (4). | "Total Scans", "Running", "Completed", "Total Findings". | |
| 3 | Check the scan history card. | Card title: "Scan History". If scans exist from seed, they are listed. Each scan shows: name, type badge (e.g., "Vulnerability Scan", "Port Scan", "Compliance Scan", "Full Assessment"), status badge (colored: "completed"=green, "running"=blue, "queued"=yellow, "failed"=red, "cancelled"=gray), target and findings info, date. | |
| 4 | If no scans exist, verify empty state. | Message: "No scans yet. Run your first security scan." | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-SCAN-002: Create a New Scan

| Field | Detail |
|-------|--------|
| **Priority** | Critical |
| **Precondition** | On the scans page. Logged in with `scan.create` capability (admin has it). |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Click the **"New Scan"** button. | A dialog/modal opens. Title: "Create New Scan". Description: "Configure and launch a new security scan against your assets." | |
| 2 | Locate the **"Scan Name"** field. | Label: "Scan Name". Placeholder: "e.g., Weekly Vulnerability Scan". | |
| 3 | Type: `Manual Test Scan - March 2026` | Text entered in the name field. | |
| 4 | Locate the **"Scan Type"** dropdown. | Label: "Scan Type". Dropdown with options visible. | |
| 5 | Select **"vulnerability"** from the dropdown. | "vulnerability" selected. | |
| 6 | Locate the **"Targets"** field. | Label: "Targets". Placeholder: "e.g., 10.0.1.0/24, 10.0.2.0/24". Help text: "Comma-separated IP addresses or CIDR ranges". | |
| 7 | Type: `10.0.1.0/24, 10.0.2.0/24` | Targets entered. | |
| 8 | Click **"Launch Scan"**. | Button text changes to "Creating...". | |
| 9 | Wait for dialog to close. | Dialog closes. Scan list refreshes. | |
| 10 | Verify the new scan appears in the list. | "Manual Test Scan - March 2026" is now in the scan list with status "queued" or "running" and type badge "Vulnerability Scan". | |
| 11 | Check DevTools > Network. | POST `/api/scans/create` returned 201. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-SCAN-003: Cancel Scan Creation

| Field | Detail |
|-------|--------|
| **Priority** | Low |
| **Precondition** | On the scans page. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Click **"New Scan"**. | Create dialog opens. | |
| 2 | Type any name in the name field. | Text entered. | |
| 3 | Click **"Cancel"** button. | Dialog closes. No scan was created. Scan list remains unchanged. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

# MODULE 5: COMPLIANCE MANAGEMENT

---

## TC-COMP-001: View Compliance Frameworks

| Field | Detail |
|-------|--------|
| **Priority** | Critical |
| **Precondition** | Logged in as admin. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Click **"Compliance"** in the sidebar. | Page navigates to `/compliance`. Heading: "Compliance Center". Subtitle: "Track GDPR, PCI DSS, and HIPAA compliance across your organization". Button visible: "Export Report". | |
| 2 | Count the framework cards. | 3 frameworks visible: **GDPR**, **PCI DSS**, **HIPAA**. | |
| 3 | For each framework, verify the displayed info. | Each card shows: framework name, version (e.g., "Version 2016"), overall percentage score with colored progress bar, status counts: "{count} Compliant", "{count} Partial", "{count} Non-Comp", "{count} Pending". | |
| 4 | Click on the **GDPR** framework card to expand it. | Controls list appears below. Card title: "GDPR Controls ({count})". Expected: ~10 GDPR controls. | |
| 5 | Verify individual control display. | Each control shows: control ID (e.g., "GDPR-1"), title, status badge (colored: "Compliant"=green, "Partial"=yellow, "Non-Compliant"=red, "Not Assessed"=gray), category. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-COMP-002: Update a Compliance Control Status

| Field | Detail |
|-------|--------|
| **Priority** | Critical |
| **Precondition** | On the compliance page. GDPR controls expanded. A control with status "Not Assessed" is visible. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Find a control with status badge "Not Assessed" (gray). | Control identified. Note its control ID: _____ | |
| 2 | Click on the status badge or status dropdown for that control. | Status options appear: "Compliant", "Partial", "Non-Compliant", "Not Assessed", "N/A". | |
| 3 | Select **"Compliant"**. | Status badge changes to green "Compliant". | |
| 4 | Wait for the save to complete. | Check DevTools > Network: PATCH `/api/compliance/update` returned 200. | |
| 5 | Check the framework's overall score. | The GDPR percentage score has INCREASED (one more control is now compliant). | |
| 6 | Refresh the page (F5). | The updated status persists. The control still shows "Compliant". | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

# MODULE 6: SIEM EVENTS & ALERTS

---

## TC-SIEM-001: View SIEM Page

| Field | Detail |
|-------|--------|
| **Priority** | Critical |
| **Precondition** | Logged in as admin. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Click **"SIEM"** in the sidebar. | Page navigates to `/siem`. | |
| 2 | Verify stat cards. | Cards for: "Total Events", "Active Alerts", "Critical Alerts". | |
| 3 | Verify event list. | If SIEM events exist: each event shows source (firewall/ids/endpoint/cloud/application), severity badge, category, details, sourceIp, destIp. If no events: appropriate empty state. | |
| 4 | Check DevTools > Network. | GET `/api/siem` returned 200. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

# MODULE 7: AI ACTIONS

---

## TC-AI-001: View AI Actions Page

| Field | Detail |
|-------|--------|
| **Priority** | Critical |
| **Precondition** | Logged in as admin. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Click **"AI Actions"** in the sidebar. | Page navigates to `/ai-actions`. | |
| 2 | Verify stat cards. | Cards for: "Total Actions", "Pending", "Approved", "Executed". | |
| 3 | Verify action list. | Each action shows: type badge (patch/firewall_rule/risk_override/siem_rule/scan), title, description, riskLevel badge (low/medium/high colored), status badge, config JSON preview. | |
| 4 | Check DevTools > Network. | GET `/api/ai-actions` returned 200. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

# MODULE 8: REPORTS

---

## TC-REPORT-001: View Reports Page and Templates

| Field | Detail |
|-------|--------|
| **Priority** | Critical |
| **Precondition** | Logged in as admin. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Click **"Reports"** in the sidebar. | Page navigates to `/reports`. Heading: "Reports". Subtitle: "Generate and download security reports for your organization". Button: "Refresh". | |
| 2 | Verify "Report Templates" section. | Section heading: "Report Templates". Exactly 4 template cards visible. | |
| 3 | Verify template #1. | Name: "Vulnerability Report". Description mentions "vulnerabilities with severity breakdowns and remediation guidance." Button: "Generate". | |
| 4 | Verify template #2. | Name: "Compliance Report". Description mentions "compliance posture across GDPR, PCI DSS, and HIPAA". | |
| 5 | Verify template #3. | Name: "Executive Summary". Description mentions "leadership and stakeholder communication". | |
| 6 | Verify template #4. | Name: "Technical Report". Description mentions "technical analysis of scan results". | |
| 7 | Check the generated reports section. | Card title: "Generated Reports ({count})". If no reports: "No reports generated yet." and "Select a template above to generate your first security report." | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-REPORT-002: Generate a Report

| Field | Detail |
|-------|--------|
| **Priority** | Critical |
| **Precondition** | On the reports page. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Click the **"Generate"** button on the "Vulnerability Report" template card. | Button text changes to "Generating...". | |
| 2 | Wait for completion. | Button returns to "Generate". | |
| 3 | Check the "Generated Reports" section. | A new report appears with: name "Vulnerability Report" (or similar), type badge, status badge ("completed" or "generating"), date. | |
| 4 | Check DevTools > Network. | POST `/api/reports/generate` returned 201. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

# MODULE 9: USER MANAGEMENT

---

## TC-USER-001: View User List

| Field | Detail |
|-------|--------|
| **Priority** | Critical |
| **Precondition** | Logged in as admin. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Click **"Settings"** in the sidebar. | Navigates to `/settings/users` (Users is the default settings page). | |
| 2 | Verify page header. | You see the user management page with user list. | |
| 3 | Verify stat cards (4). | "Total Users", "Active", "Pending Invites", "MFA Enabled". | |
| 4 | Verify search and filter controls. | Search field with placeholder: "Search users by name or email...". "Invite User" button. Filter controls: "All Roles" dropdown, "All Statuses" dropdown, "All Scopes" dropdown, "Clear Filters" button. | |
| 5 | Verify user table. | Card title: "Users ({count})". Table columns: User, Email, Roles, Scopes, Auth, Last Login, Status. | |
| 6 | Find the admin user in the list. | Row shows: "Exargen Admin", "admin@exargen.com", role badge "Platform Administrator", scope showing "Global", auth showing "Email/Password", last login timestamp, status badge "active" (green). | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-USER-002: Invite a New User

| Field | Detail |
|-------|--------|
| **Priority** | Critical |
| **Precondition** | On the users page. Logged in as admin with `admin.user.manage`. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Click the **"Invite User"** button. | Dialog opens. Title: "Invite User". Description: "Send an invitation to join your organization. They'll receive an email with an onboarding link." | |
| 2 | Locate the **"Full Name"** field (placeholder: "John Smith"). | Field is empty and ready for input. | |
| 3 | Type: `Test Analyst` | Name entered. | |
| 4 | Locate the **"Email Address"** field (placeholder: "john@company.com"). | Field is empty. | |
| 5 | Type: `analyst@exargen.com` | Email entered. | |
| 6 | Locate the **"Role"** dropdown. | Dropdown shows available roles. | |
| 7 | Select **"Security Analyst"**. | Role selected. | |
| 8 | Click **"Send Invitation"**. | Button changes to "Sending...". | |
| 9 | Wait for success response. | Dialog shows success message. An "Invitation Link" field appears with a URL. "Share this link with the invitee if they didn't receive the email." text visible. "Done" button appears. | |
| 10 | **COPY** the invitation link and save it (you will need it for TC-INVITE-001). | Link copied: _____________________________ | |
| 11 | Click **"Done"**. | Dialog closes. | |
| 12 | Check the user list. | "Test Analyst" now appears with: email "analyst@exargen.com", role badge "Security Analyst", status badge "invited" (yellow/blue). "Pending Invites" stat card incremented by 1. | |
| 13 | Verify action buttons for the invited user. | "Resend" and "Revoke" buttons/links are visible next to the invited user. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** Invitation link saved: _______________

---

## TC-USER-003: Search Users

| Field | Detail |
|-------|--------|
| **Priority** | Medium |
| **Precondition** | On users page. At least 2 users exist (admin + invited user from TC-USER-002). |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Click in the search field (placeholder: "Search users by name or email..."). | Cursor in search field. | |
| 2 | Type: `analyst` | User list filters. Only "Test Analyst" is shown. Admin user is hidden. | |
| 3 | Clear the search field. | Both users reappear. | |
| 4 | Type: `admin@exargen.com` | Only the admin user is shown. | |
| 5 | Clear the search field. | All users reappear. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-USER-004: Filter Users by Status

| Field | Detail |
|-------|--------|
| **Priority** | Medium |
| **Precondition** | On users page. At least one "active" and one "invited" user exist. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Click the **"All Statuses"** dropdown. | Options appear: "Active", "Invited", "Suspended". | |
| 2 | Select **"Invited"**. | Only users with status "invited" are shown. Active users are hidden. | |
| 3 | Select **"Active"**. | Only active users shown. Invited users hidden. | |
| 4 | Return to **"All Statuses"** (or click "Clear Filters"). | All users reappear. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-USER-005: Suspend a User

| Field | Detail |
|-------|--------|
| **Priority** | Critical |
| **Precondition** | On users page. An active non-admin user exists (e.g., an accepted invitation user). If you haven't completed the invitation flow yet, you'll need at least a second active user. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Find the user to suspend in the list. Click their actions menu (three dots or "..." button). | Actions menu opens. | |
| 2 | Look for **"Suspend User"** option. | "Suspend User" is listed in the menu. | |
| 3 | Click **"Suspend User"**. | Confirmation dialog opens. Title: "Suspend User". Description: "Suspending a user will immediately revoke their access to the platform. They will not be able to log in until reactivated." Two buttons: "Cancel" and "Suspend User". | |
| 4 | Click **"Suspend User"** in the dialog. | Button changes to "Suspending...". | |
| 5 | Wait for completion. | Dialog closes. | |
| 6 | Check the user's row in the table. | Status badge changed from green "active" to red "suspended". | |
| 7 | Check the "Active" stat card. | Active user count decreased by 1. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** User suspended: _______________

---

## TC-USER-006: Reactivate a Suspended User

| Field | Detail |
|-------|--------|
| **Priority** | High |
| **Precondition** | On users page. A suspended user exists (from TC-USER-005). |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Find the suspended user. Click their actions menu. | Actions menu opens. | |
| 2 | Look for **"Reactivate User"** option. | "Reactivate User" is listed. | |
| 3 | Click **"Reactivate User"**. | Confirmation dialog opens. Title: "Reactivate User". Description: "Reactivating a user will restore their access to the platform with their existing roles and scopes." | |
| 4 | Click **"Reactivate User"** in the dialog. | Button changes to "Reactivating...". Dialog closes. | |
| 5 | Check the user's row. | Status badge changed back to green "active". | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-USER-007: Cannot Suspend Self

| Field | Detail |
|-------|--------|
| **Priority** | High |
| **Precondition** | On users page. Logged in as admin@exargen.com. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Find your own account (admin@exargen.com) in the user list. | Your account row is visible. | |
| 2 | Click the actions menu for your own account. | Actions menu opens. | |
| 3 | Look for "Suspend User" option. | Either: (a) "Suspend User" is NOT shown at all, or (b) it shows "Cannot Suspend Self" (grayed out/disabled). | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-USER-008: Assign Additional Role to User

| Field | Detail |
|-------|--------|
| **Priority** | Critical |
| **Precondition** | On users page. A user with one role exists. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Find a user with a single role (e.g., "Test Analyst" with "Security Analyst"). Click their actions menu. | Actions menu opens. | |
| 2 | Click **"Manage Roles"**. | Dialog opens. Title: "Manage Roles -- {user name}". Description: "Assign or remove roles for this user. Roles determine which capabilities the user has across the platform." Current role(s) shown as assigned. | |
| 3 | Find **"Auditor"** in the available roles list. | "Auditor" is listed with: capability count (e.g., "15 capabilities"), user count, and "Built-in" badge. | |
| 4 | Click to assign "Auditor" to this user. | Role is assigned. The role moves to the "assigned" section or gets a checkmark. | |
| 5 | Click **"Close"**. | Dialog closes. | |
| 6 | Check the user's row in the table. | User now shows TWO role badges: "Security Analyst" AND "Auditor". | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-USER-009: Resend Invitation

| Field | Detail |
|-------|--------|
| **Priority** | Medium |
| **Precondition** | On users page. An invited (pending) user exists. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Find the invited user in the list. | User shows status "invited" with "Pending" badge. | |
| 2 | Click the **"Resend"** button next to the invited user. | A new invitation email is sent. Success message appears. | |
| 3 | Verify in DevTools > Network. | POST `/api/users/invite/resend` returned 200. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-USER-010: Revoke Invitation

| Field | Detail |
|-------|--------|
| **Priority** | Medium |
| **Precondition** | On users page. An invited (pending) user exists (invite a new test user if needed). |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Find the invited user. Click the **"Revoke"** button. | Confirmation may appear. | |
| 2 | Confirm revocation. | Invitation is revoked. | |
| 3 | Check the user's status in the list. | Status changes. Invitation shows "Revoked" badge. | |
| 4 | If you saved the invitation link, try opening it in a new browser tab. | Error page: invitation is no longer valid. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

# MODULE 10: ROLE MANAGEMENT

---

## TC-ROLE-001: View All Roles

| Field | Detail |
|-------|--------|
| **Priority** | Critical |
| **Precondition** | Logged in as admin. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Navigate to `/settings/roles` (click Settings in sidebar, then find Roles section/tab). | Roles page loads. | |
| 2 | Verify stat cards (4). | "Total Roles", "Built-in", "Custom", "Users Assigned". | |
| 3 | Verify "Built-in Roles" section. | Card titled "Built-in Roles". Lists 7 roles: Platform Administrator, Organization Administrator, Security Analyst, Auditor, Viewer, Remediation User, API Service Account. Each has a "Built-in" badge. | |
| 4 | For each built-in role, verify info shown. | Each shows: name, description, capability count (e.g., "Capabilities: 39"), user count (e.g., "Users: 1"). | |
| 5 | Verify "Custom Roles" section. | Either shows custom roles OR empty state: "No custom roles created yet." with text "Create custom roles to define granular capabilities for your team." | |
| 6 | Verify "Create Role" button is visible. | Button labeled "Create Role" is present. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-ROLE-002: Create a Custom Role

| Field | Detail |
|-------|--------|
| **Priority** | Critical |
| **Precondition** | On roles page. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Click **"Create Role"**. | Dialog opens. Title: "Create Custom Role". Description: "Define a new role with specific capabilities for your team." | |
| 2 | In **"Role Name"** (placeholder: "e.g. Junior Analyst"), type: `SOC Lead` | Name entered. | |
| 3 | In **"Slug"** (placeholder: "junior-analyst"), type: `soc-lead` | Slug entered. Note: slug may auto-generate from name. | |
| 4 | In **"Description"** (placeholder: "What this role is for..."), type: `Senior analyst with escalation and approval rights` | Description entered. | |
| 5 | Leave **"Based on (optional)"** as "Start from scratch". | No base role selected. | |
| 6 | Click **"Create Role"**. | Button changes to "Creating...". Dialog closes. | |
| 7 | Verify "SOC Lead" appears in the Custom Roles section. | New role listed with: name "SOC Lead", description, "Capabilities: 0" (no capabilities assigned yet), "Users: 0". No "Built-in" badge. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-ROLE-003: Edit Capability Matrix

| Field | Detail |
|-------|--------|
| **Priority** | Critical |
| **Precondition** | Custom role "SOC Lead" exists (from TC-ROLE-002). |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Click on the "SOC Lead" role to view/edit it. | Role detail view opens. Shows "Capability Matrix" section. Counter: "0 of 39 capabilities granted". Filter field with placeholder: "Filter capabilities..." | |
| 2 | Look for module groups. | Capabilities are grouped by module: Dashboard, Scans, Assets, Risk Scoring, Reports, AI Actions, SIEM, Administration. Each group is expandable/collapsible. | |
| 3 | Expand the **"Dashboard"** module. | Shows 2 capabilities: "View Dashboard" (dash.view) with "low" risk badge, "Customize Dashboard" (dash.customize) with "low" risk badge. Each has a toggle/checkbox. | |
| 4 | **Grant** "View Dashboard" (dash.view). | Toggle turns on/green. Counter updates: "1 of 39 capabilities granted". | |
| 5 | Expand the **"Scans"** module. Grant "View Scans" (scan.view) and "Execute Scans" (scan.execute). | Both toggled on. Counter: "3 of 39". scan.execute shows "medium" risk badge. | |
| 6 | Expand the **"SIEM"** module. Grant "View SIEM Events" (siem.view) and "Escalate Alerts" (siem.escalate). | Both toggled on. Counter: "5 of 39". | |
| 7 | Expand the **"AI Actions"** module. Grant "View AI Actions" (ai.view) and "Approve Standard AI Actions" (ai.approve.standard). | Both toggled on. Counter: "7 of 39". | |
| 8 | Click **"Save Changes"** (or the save button). | Button changes to "Saving...". Then success confirmation. | |
| 9 | Close and reopen the role. | Capability matrix still shows 7 granted capabilities. They persisted. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-ROLE-004: Clone a Role

| Field | Detail |
|-------|--------|
| **Priority** | High |
| **Precondition** | On roles page. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Find the **"Security Analyst"** built-in role. Click its clone button (tooltip: "Clone role"). | Clone dialog opens. Title: "Clone Role". Description mentions "based on Security Analyst". | |
| 2 | In **"New Role Name"**, type: `Senior Analyst` | Name entered. | |
| 3 | In **"Slug"**, verify it auto-fills or type: `senior-analyst` | Slug set. | |
| 4 | In **"Description (optional)"**, type: `Analyst with elevated permissions` | Description entered. | |
| 5 | Click **"Clone Role"**. | Button changes to "Cloning...". Dialog closes. | |
| 6 | Find "Senior Analyst" in the Custom Roles section. | Role appears with the SAME capability count as Security Analyst (25 capabilities). It's a custom role (no "Built-in" badge). | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-ROLE-005: Delete a Custom Role (No Users)

| Field | Detail |
|-------|--------|
| **Priority** | High |
| **Precondition** | A custom role with 0 users assigned exists. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Find the custom role with 0 users. Click its delete button (tooltip: "Delete role"). | Delete dialog opens. Title: "Delete Role". Description: "Are you sure you want to delete this role? This action cannot be undone." | |
| 2 | Verify no user warning is shown (since 0 users). | No "Warning: {count} user(s) currently assigned" message. | |
| 3 | Click **"Delete Role"**. | Button changes to "Deleting...". Dialog closes. | |
| 4 | Verify the role is gone from the list. | Custom role no longer appears. Custom Roles count in stat card decremented. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-ROLE-006: Cannot Delete Built-in Role

| Field | Detail |
|-------|--------|
| **Priority** | High |
| **Precondition** | On roles page. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Find any built-in role (e.g., "Platform Administrator"). | Role is visible with "Built-in" badge. | |
| 2 | Look for a delete button on the built-in role. | Delete button is EITHER: (a) not present at all, or (b) disabled/grayed out. Built-in roles cannot be deleted. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

# MODULE 11: API KEY MANAGEMENT

---

## TC-APIKEY-001: View API Keys Page

| Field | Detail |
|-------|--------|
| **Priority** | Critical |
| **Precondition** | Logged in as admin. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Navigate to `/settings/api-keys`. | Page loads. | |
| 2 | Verify stat cards (3). | "Total API Keys", "Active Keys", "Expiring Soon". | |
| 3 | Verify the "Create API Key" button is present. | Button labeled "Create API Key" is visible. | |
| 4 | Verify the security notice at the bottom. | Section titled "API Key Security" with text about: keys shown only once, rotate every 90 days, IP allowlisting. | |
| 5 | If no keys exist, verify empty state. | "No API keys created yet." with text "Create an API key for CI/CD pipelines and integrations." | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-APIKEY-002: Create an API Key

| Field | Detail |
|-------|--------|
| **Priority** | Critical |
| **Precondition** | On API keys page. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Click **"Create API Key"**. | Dialog opens. Title: "Create API Key". Description: "Generate a new API key for programmatic access to your tenant." | |
| 2 | In **"Name"** (placeholder: "e.g., CI/CD Pipeline Key"), type: `Test Pipeline Key` | Name entered. Red asterisk indicates required. | |
| 3 | Click the **"Role"** dropdown (placeholder: "Select a role..."). | Dropdown shows available roles. Red asterisk indicates required. | |
| 4 | Select **"API Service Account"**. | Role selected. | |
| 5 | In **"Expiry"**, select **"90 days"**. | Available options: 30 days, 60 days, 90 days, 180 days, 365 days. 90 days selected. | |
| 6 | In **"IP Allowlist (optional)"** (placeholder: "e.g., 10.0.0.1, 192.168.1.0/24"), type: `10.0.0.0/8` | IP range entered. Help text: "Comma-separated IPs or CIDR ranges. Leave blank for unrestricted access." | |
| 7 | In **"Rate Limit (requests/min)"** (placeholder: "1000"), type: `500` | Rate limit entered. | |
| 8 | Click **"Create Key"**. | Button changes to "Creating...". | |
| 9 | Wait for the Key Reveal dialog. | NEW dialog appears. Title: "API Key Generated". Description: 'Your new API key for "Test Pipeline Key" has been created successfully.' WARNING box: "This key will only be shown once" with text "Copy it now and store it securely. You will not be able to see it again." The FULL API key is displayed in a copyable field. | |
| 10 | Click the copy button next to the key. | Text changes to "Copied to clipboard". **SAVE THIS KEY** somewhere for TC-API-007. | |
| 11 | Click **"Done"**. | Dialog closes. | |
| 12 | Verify the new key in the list. | "Test Pipeline Key" appears with: status badge "Active" (green), role "API Service Account", rate "500/min", expiry date (~90 days from now), only the key PREFIX is shown (not the full key). | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** API key saved: _______________

---

## TC-APIKEY-003: Verify Key Is Not Shown Again

| Field | Detail |
|-------|--------|
| **Priority** | Critical |
| **Precondition** | API key created in TC-APIKEY-002. Reveal dialog was closed. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Look at the API key in the list. | Only the key PREFIX is shown (first 8 characters + "..."). | |
| 2 | Click anywhere on the key row to try to view details. | Full key is NOT revealed. Only metadata (name, role, rate limit, etc.) is shown. | |
| 3 | There is NO "Show Key" or "Reveal Key" button. | Confirmed: the key can never be viewed again after the initial creation dialog. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-APIKEY-004: Revoke an API Key

| Field | Detail |
|-------|--------|
| **Priority** | High |
| **Precondition** | An active API key exists. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Find the active API key. Click its revoke button (tooltip: "Revoke key"). | Confirmation dialog opens. Title: "Revoke API Key". Description: 'Are you sure you want to revoke the key "Test Pipeline Key"?' Warning: "This action cannot be undone. Any systems using this key will immediately lose access." Shows: "Role: API Service Account | Created by Exargen Admin". | |
| 2 | Click **"Revoke Key"**. | Button changes to "Revoking...". Dialog closes. | |
| 3 | Check the key in the list. | Status badge changed to "Revoked" (red/gray). | |
| 4 | Check the "Active Keys" stat card. | Decreased by 1. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

# MODULE 12: AUDIT LOG

---

## TC-AUDIT-001: View Audit Log

| Field | Detail |
|-------|--------|
| **Priority** | Critical |
| **Precondition** | Logged in as admin. Some audit events exist (from seed + any actions taken during testing). |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Navigate to `/settings/audit-log`. | Audit log page loads. | |
| 2 | Verify stat cards (4). | "Total Events", "Successful", "Denied", "Errors". Each shows a count. | |
| 3 | Verify integrity badge. | Badge reads "Chain Valid" (green) with "(N records)" count. | |
| 4 | Verify export buttons. | Two buttons: "Export CSV" and "Export JSON". | |
| 5 | Verify filter controls. | Search field (placeholder: "Search by actor, action, or email..."), date fields ("From:", "To:"), "Category:" dropdown (default "All Categories"), "Result:" buttons ("All", "Success", "Denied", "Error"), "Severity:" dropdown (default "All Severities"). | |
| 6 | Verify audit log list. | Card title: "Audit Log ({count})". Events listed with: timestamp, actor name, action string, result badge (colored), severity indicator. | |
| 7 | Click on any event row to expand it. | Detail panel opens showing: "Event ID:", "Timestamp:", "Actor:", "Email:", "Action:", "Result:", "Severity:", "Category:", "IP Address:", "Resource:", "User Agent:", "Details:" (JSON). | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-AUDIT-002: Filter Audit Log by Category

| Field | Detail |
|-------|--------|
| **Priority** | High |
| **Precondition** | On audit log page. Multiple event categories exist. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Click the **"Category:"** dropdown (default: "All Categories"). | Options appear (e.g., auth, rbac, data, admin, security, system). | |
| 2 | Select **"auth"**. | Audit log filters to show ONLY authentication events (login, logout, login_failed). All other categories hidden. | |
| 3 | Verify filtered events. | Every visible event has an action like "user.login", "user.logout", or "user.login_failed". | |
| 4 | Return to "All Categories". | All events reappear. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-AUDIT-003: Filter Audit Log by Result

| Field | Detail |
|-------|--------|
| **Priority** | Medium |
| **Precondition** | On audit log page. Both success and denied events exist (denied events created by failed login attempts or RBAC denials). |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Click the **"Denied"** result button. | "Denied" button becomes highlighted/active. | |
| 2 | Verify filtered events. | Only events with "denied" result badge shown. | |
| 3 | Click **"Success"** button. | Only success events shown. | |
| 4 | Click **"All"** button. | All events shown regardless of result. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-AUDIT-004: Verify Hash Chain Integrity

| Field | Detail |
|-------|--------|
| **Priority** | Critical |
| **Precondition** | On audit log page. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Look at the integrity badge near the top of the page. | Badge shows "Chain Valid" in green with record count. | |
| 2 | Open DevTools > Network. Find the integrity check request. | GET `/api/audit-log/integrity` returned: `{ "valid": true, "totalRecords": N, "checkedAt": "2026-..." }` | |
| 3 | Verify `valid` is `true`. | Confirmed: hash chain is intact. No tampering detected. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** Total records verified: _______________

---

## TC-AUDIT-005: Export Audit Log as CSV

| Field | Detail |
|-------|--------|
| **Priority** | High |
| **Precondition** | On audit log page. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Click the **"Export CSV"** button. | A file download begins. | |
| 2 | Open the downloaded file. | File is a valid CSV. Contains columns for all audit log fields. Each row is one audit event. | |
| 3 | Verify the row count roughly matches the total events count shown on the page. | Counts match (accounting for any active filters). | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-AUDIT-006: Export Audit Log as JSON

| Field | Detail |
|-------|--------|
| **Priority** | Medium |
| **Precondition** | On audit log page. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Click the **"Export JSON"** button. | A file download begins. | |
| 2 | Open the downloaded file. | File contains valid JSON. Array of audit log objects. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

# MODULE 13: SESSION MANAGEMENT

---

## TC-SESSION-001: View My Sessions

| Field | Detail |
|-------|--------|
| **Priority** | Critical |
| **Precondition** | Logged in as admin. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Navigate to `/settings/sessions`. | Sessions page loads. | |
| 2 | Verify stat cards (3). | "Active Sessions", "Unique Devices", "Unique Locations". | |
| 3 | Verify "My Sessions" card. | Card title: "My Sessions". Button: "Revoke All Other Sessions". | |
| 4 | Find your current session. | One session is marked with a green **"This device"** badge. Shows: device description (e.g., "Chrome on Windows"), IP address, "Last active:" timestamp, "Created:" timestamp. | |
| 5 | Check if other seeded sessions are visible. | May show seeded sessions: "Safari on macOS" (active), "Firefox on Linux" (revoked -- may or may not appear depending on whether revoked sessions are shown). | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-SESSION-002: Revoke Another Session

| Field | Detail |
|-------|--------|
| **Priority** | High |
| **Precondition** | Multiple active sessions visible (login from a second browser to create another session if needed). |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Find a session that does NOT have the "This device" badge. | Another session identified. | |
| 2 | Click the **"Revoke"** button on that session. | Confirmation dialog opens. Title: "Revoke Session". Description mentions the session label. Buttons: "Cancel" and "Revoke". | |
| 3 | Click **"Revoke"**. | Dialog closes. Session disappears from the active list (or shows as revoked). | |
| 4 | Verify your current session still works. | You are still logged in. Page is responsive. "This device" session unaffected. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-SESSION-003: Revoke All Other Sessions

| Field | Detail |
|-------|--------|
| **Priority** | High |
| **Precondition** | At least 2 active sessions (current + one other). |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Click **"Revoke All Other Sessions"** button. | Confirmation dialog opens. Title: "Revoke All Other Sessions". Description: "This will sign out all other sessions except your current one. You will remain logged in on this device." | |
| 2 | Click **"Revoke All"**. | Dialog closes. All sessions except the current one are removed. | |
| 3 | Verify only the "This device" session remains. | Only 1 session shown, with the "This device" badge. "Active Sessions" stat card shows 1. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

# MODULE 14: SECURITY DASHBOARD

---

## TC-SECDASH-001: View Security Overview

| Field | Detail |
|-------|--------|
| **Priority** | High |
| **Precondition** | Logged in as admin. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Navigate to `/settings/security`. | Page loads. Heading: "Security Overview". Subtitle: "Monitor your platform's security posture and respond to threats". | |
| 2 | Verify the Security Score. | A visual score circle shows a number (0-100). "Security Score Breakdown" card lists 5 checks: "Audit Log Integrity", "No Failed Logins (24h)", "API Keys Not Expiring", "Session Count Normal", "Security Headers Active". Each shows points (e.g., +30, +25, +20, +15, +10). Score badge: "Good" (green, >=80), "Fair" (yellow, >=50), or "At Risk" (red, <50). | |
| 3 | Verify stat cards (4). | "Failed Logins (24h)" (number), "Active Sessions" (number), third card shows API key info "Active" with optional "/ {count} Expiring", "Audit Integrity" with badge "Valid"/"Broken"/"Unknown". | |
| 4 | Verify "Quick Actions" section. | Three buttons: "View Audit Log", "Check Integrity" (or "Checking..."), "View All Sessions". | |
| 5 | Click **"Check Integrity"**. | Button changes to "Checking...". Returns result. Success message: "Audit log integrity verified" or failure: "Audit log integrity check failed". Shows: "{count} records checked at {datetime}". | |
| 6 | Click **"View Audit Log"**. | Navigates to `/settings/audit-log`. | |
| 7 | Go back. Click **"View All Sessions"**. | Navigates to `/settings/sessions`. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** Security Score: _____ / 100

---

# MODULE 15: INVITATION & ONBOARDING FLOW

---

## TC-INVITE-001: Full End-to-End Invitation Flow

| Field | Detail |
|-------|--------|
| **Priority** | Critical |
| **Precondition** | You have an invitation link from TC-USER-002 (or invite a new user now). You need a separate browser/incognito window. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Open an **incognito/private browser window** (separate from the admin session). | Clean browser, no cookies. | |
| 2 | Paste the invitation link in the URL bar and press Enter. | Page loads. You see: "Validating your invitation..." briefly, then the onboarding wizard. | |
| 3 | **Step 1 - Welcome**: Read the welcome message. | Heading: "You've been invited!". Body: "{inviter name} has invited you to join {Exargen}". Shows the inviter's name and organization. Button: "Get Started". | |
| 4 | Click **"Get Started"**. | Wizard advances to Step 2. Progress bar shows step 2 of 6. Step labels at top: Welcome, Password, Profile, MFA, Permissions, Complete. | |
| 5 | **Step 2 - Password**: Read the heading. | "Create Your Password". Subtitle: "Secure your account with a strong password". Fields: "Email" (read-only, showing the invited email), "Password", "Confirm Password". | |
| 6 | In **"Password"** field, type: `weak` | Password strength indicator shows "Weak" (red). Requirements checklist shows: "At least 8 characters" = X (fail), others may vary. | |
| 7 | Clear the field. Type: `Analyst123!` | Password strength shows "Good" or "Strong". Requirements checklist: "At least 8 characters" = check, "One uppercase letter" = check, "One lowercase letter" = check, "One number" = check, "One special character" = check. | |
| 8 | In **"Confirm Password"** field, type: `Analyst123!` | Message: "Passwords match" (green). | |
| 9 | Click **"Continue"**. | Wizard advances to Step 3. | |
| 10 | **Step 3 - Profile Setup**: Read the heading. | "Profile Setup". Subtitle: "Optional info to help your team". Fields: "Department" (placeholder: "Select or type your department"), "Phone Number" (placeholder: "+1 (555) 000-0000"). "(optional)" labels visible. | |
| 11 | In **"Department"**, select or type: `Security Operations` | Department set. Datalist options include: Engineering, Security Operations, IT Operations, Compliance, Management, DevOps, Other. | |
| 12 | Leave phone empty. Click **"Continue"** (or **"Skip"**). | Wizard advances to Step 4. | |
| 13 | **Step 4 - MFA**: Read the heading. | "Multi-Factor Authentication". Subtitle: "Add an extra layer of security to your account". Badge: "Coming Soon". Body: "MFA support is being rolled out soon. You can set it up later from your account settings." | |
| 14 | Click **"Skip for Now"**. | Wizard advances to Step 5. | |
| 15 | **Step 5 - Permissions**: Read the heading. | "Review Your Role". Subtitle: "Confirm your access permissions before activation". Shows: the assigned role name, capability count (e.g., "25 capabilities across 7 module(s)"), and a list/summary of what they can do. | |
| 16 | Click **"Activate My Account"**. | Button changes to "Activating...". Account is being created. | |
| 17 | **Step 6 - Complete**: Read the success message. | "Welcome to Exargen!" (or the org name). "Your account has been activated successfully." Countdown: "Redirecting to dashboard in Xs..." Button: "Go to Dashboard". | |
| 18 | Wait for auto-redirect OR click **"Go to Dashboard"**. | Redirected to `/` (dashboard). You are now logged in as the new user. Dashboard loads. Sidebar shows the new user's name. | |
| 19 | Verify the new user's role by checking the sidebar. | Navigation items match what the assigned role can access (e.g., Security Analyst sees Dashboard, Scans, Assets, etc. but NOT all Settings pages). | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-INVITE-002: Password Mismatch on Invitation

| Field | Detail |
|-------|--------|
| **Priority** | High |
| **Precondition** | On the onboarding wizard Step 2 (Password). |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | In Password field, type: `Analyst123!` | Password entered. | |
| 2 | In Confirm Password field, type: `Different456!` | Message appears: "Passwords do not match" (red). | |
| 3 | Try to click **"Continue"**. | Button is disabled or shows an error. Cannot proceed to Step 3 until passwords match. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-INVITE-003: Invalid Invitation Token

| Field | Detail |
|-------|--------|
| **Priority** | High |
| **Precondition** | Incognito browser window. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Navigate to: `{app-url}/accept-invitation?token=fake-token-12345` | Page loads. | |
| 2 | Wait for validation. | Error page appears. Heading: "Invitation Invalid". Message: "Invalid or expired invitation." or "No invitation token provided." (depending on the token value). | |
| 3 | Verify NO user data or organization info is leaked. | The error page does NOT show any tenant name, user email, or role information. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

# MODULE 16: RBAC ENFORCEMENT (CROSS-CUTTING)

These tests verify that role-based access control works across the entire platform.

---

## TC-RBAC-001: Viewer Role - Restricted Access

| Field | Detail |
|-------|--------|
| **Priority** | Critical |
| **Precondition** | A user with ONLY the "Viewer" role exists and is active. Viewer has ONLY: `dash.view`, `risk.view`, `report.view`, `report.export`. Login credentials known. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Login as the Viewer user. | Redirected to dashboard. | |
| 2 | **Dashboard** (`/`): Check if it loads. | Dashboard loads successfully. Stat cards visible. (Viewer has `dash.view`.) | |
| 3 | Look at the sidebar navigation. | Some nav items may be hidden or visible but restricted. | |
| 4 | Navigate to **`/scans`** (type URL directly). | Page loads but API returns 403. No scan data shown. (Viewer lacks `scan.view`.) | |
| 5 | Navigate to **`/assets`**. | Assets page loads but shows limited/no data (scope-filtered, no explicit asset capability). | |
| 6 | Navigate to **`/siem`**. | API returns 403. No SIEM data. (Viewer lacks `siem.view`.) | |
| 7 | Navigate to **`/ai-actions`**. | API returns 403. No AI actions data. (Viewer lacks `ai.view`.) | |
| 8 | Navigate to **`/reports`**. | Reports page loads with data. (Viewer has `report.view`.) | |
| 9 | Navigate to **`/risk-scoring`**. | Risk scoring data visible. (Viewer has `risk.view`.) | |
| 10 | Navigate to **`/settings/users`**. | API returns 403. Cannot see user list. (Viewer lacks `admin.user.view`.) | |
| 11 | Navigate to **`/settings/roles`**. | API returns 403. Cannot see roles. (Viewer lacks `admin.role.view`.) | |
| 12 | Navigate to **`/settings/api-keys`**. | API returns 403. Cannot see API keys. (Viewer lacks `admin.apikey.manage`.) | |
| 13 | Navigate to **`/settings/audit-log`**. | API returns 403. Cannot see audit logs. (Viewer lacks `admin.audit.view`.) | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-RBAC-002: API Bypass Attempt - Direct API Calls

| Field | Detail |
|-------|--------|
| **Priority** | Critical |
| **Precondition** | Logged in as Viewer role. DevTools open (Network tab). |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Open DevTools > Console. Type and run: `fetch('/api/scans/create', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name:'hack',type:'vulnerability',targets:['10.0.0.1']})}).then(r=>console.log(r.status))` | Console logs: **403** (Forbidden). Viewer cannot create scans even by calling the API directly. | |
| 2 | Run: `fetch('/api/users/invite', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name:'Hacker',email:'h@h.com',roleId:'any'})}).then(r=>console.log(r.status))` | Console logs: **403**. Viewer cannot invite users. | |
| 3 | Run: `fetch('/api/audit-log').then(r=>console.log(r.status))` | Console logs: **403**. Viewer cannot access audit logs. | |
| 4 | Run: `fetch('/api/dashboard').then(r=>console.log(r.status))` | Console logs: **200**. Viewer CAN access dashboard (has `dash.view`). | |

**CRITICAL CHECK**: Steps 1-3 confirm that hiding UI buttons is NOT the only protection. The server also rejects unauthorized API calls.

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-RBAC-003: Unauthenticated API Access

| Field | Detail |
|-------|--------|
| **Priority** | Critical |
| **Precondition** | A separate incognito window with NO cookies. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | In incognito browser, open DevTools > Console. Run: `fetch('/api/dashboard').then(r=>console.log(r.status))` | Console logs: **401** (Unauthorized). | |
| 2 | Run: `fetch('/api/users').then(r=>console.log(r.status))` | Console logs: **401**. | |
| 3 | Run: `fetch('/api/audit-log').then(r=>console.log(r.status))` | Console logs: **401**. | |
| 4 | Run: `fetch('/api/health').then(r=>console.log(r.status))` | Console logs: **200**. Health endpoint is public (no auth needed). | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-RBAC-004: Deny-Wins Rule Verification

| Field | Detail |
|-------|--------|
| **Priority** | Critical |
| **Precondition** | A user exists with TWO roles: one role GRANTS `admin.billing.manage`, another role DENIES `admin.billing.manage`. (Platform Admin grants it; Org Admin denies it. Assign both roles.) |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Login as the multi-role user. | Logged in. | |
| 2 | Open DevTools > Console. Run: `fetch('/api/auth/me/capabilities').then(r=>r.json()).then(d=>console.log('Denied:',d.denied,'Has billing:',d.capabilities.includes('admin.billing.manage')))` | Console shows: Denied array CONTAINS "admin.billing.manage". "Has billing" is **false**. | |
| 3 | This confirms the deny-wins rule. | Even though one role grants the capability, the explicit deny from the other role wins. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

# MODULE 17: SECURITY EDGE CASES

---

## TC-SEC-001: SQL Injection in Search Fields

| Field | Detail |
|-------|--------|
| **Priority** | Critical |
| **Precondition** | Logged in as admin. On the assets page. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | In the assets search bar, type: `'; DROP TABLE assets; --` | No database error. No crash. Either no results shown ("No assets match your filters.") or the literal string is treated as a search term. | |
| 2 | Navigate to audit log. In the search bar, type: `" OR 1=1 --` | No database error. Search treats it as literal text. | |
| 3 | Navigate to users page. In the search bar, type: `<script>alert('xss')</script>` | No JavaScript alert box appears. Text is treated as plain text. | |
| 4 | Verify the application is still functioning normally. | All pages still load. No errors in console. Database is intact. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-SEC-002: XSS via Data Input

| Field | Detail |
|-------|--------|
| **Priority** | Critical |
| **Precondition** | Logged in with create permissions. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Create a new scan with name: `<img src=x onerror=alert('XSS')>` | Scan created. | |
| 2 | View the scan in the scan list. | Scan name displayed as plain text: `<img src=x onerror=alert('XSS')>`. NO image element rendered. NO alert box. | |
| 3 | Create a role with name: `<script>document.cookie</script>` | Role created. | |
| 4 | View the role in the roles list. | Role name displayed as plain text. NO script executed. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-SEC-003: Cookie Security Verification

| Field | Detail |
|-------|--------|
| **Priority** | High |
| **Precondition** | Logged in. DevTools open. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Open DevTools > Application > Cookies > select your domain. | Cookie list shown. | |
| 2 | Find `byoc_token` cookie. Check its attributes. | HttpOnly: **Yes** (checkmark). This means JavaScript CANNOT access it. Path: `/`. | |
| 3 | Find `byoc_refresh` cookie. Check its attributes. | HttpOnly: **Yes**. Path: `/`. | |
| 4 | In Console, run: `document.cookie` | Output does NOT contain `byoc_token` or `byoc_refresh` (because they are HttpOnly). | |
| 5 | If on HTTPS (production), verify Secure flag. | Secure: **Yes** (on production). Cookies only sent over HTTPS. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

# MODULE 21: DETECTION ENGINE & OPERATIONAL MATURITY (PHASE 11)

---

## TC-P11-001: Event Ingestion — Single Event

| Field | Detail |
|-------|--------|
| **Priority** | Critical |
| **Precondition** | Logged in as admin@exargen.com. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Open browser DevTools > Console. | Console is open and ready for input. | |
| 2 | Run: `fetch('/api/siem/events', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ source: 'endpoint', severity: 'high', category: 'process', title: 'Test PowerShell event', processName: 'powershell.exe', hostName: 'TEST-WS-01' }) }).then(r => r.json()).then(console.log)` | Promise resolves and response is logged to the console. | |
| 3 | Check the response in console. | Response has status 200, body contains `event.id` (UUID), and `alerts` array. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-P11-002: Detection Rule Triggers Alert

| Field | Detail |
|-------|--------|
| **Priority** | Critical |
| **Precondition** | Logged in as admin. 12 seeded rules active. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | POST to `/api/siem/events` with body: `{ "source": "endpoint", "severity": "high", "category": "process", "title": "Suspicious PowerShell", "processName": "powershell.exe", "details": { "commandLine": "powershell.exe -EncodedCommand SGVsbG8=" } }` | Response returns 200 with event data. | |
| 2 | Check response `alerts` array. | At least 1 alert with `ruleName` containing "PowerShell" and `mitreAttackId` "T1059.001". | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-P11-003: Batch Event Ingestion

| Field | Detail |
|-------|--------|
| **Priority** | High |
| **Precondition** | Logged in as admin. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | POST to `/api/siem/events/batch` with body: `{ "events": [{"source":"firewall", "severity":"low", "category":"network", "title":"Test 1"}, {"source":"firewall", "severity":"medium", "category":"network", "title":"Test 2"}, {"source":"firewall", "severity":"high", "category":"network", "title":"Test 3"}] }` | Response returns 200. | |
| 2 | Check response body. | Response contains `ingested: 3`. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-P11-004: Batch Rejects Over 100 Events

| Field | Detail |
|-------|--------|
| **Priority** | High |
| **Precondition** | Logged in as admin. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | POST to `/api/siem/events/batch` with an array of 101 events. | Response returns **400** status with error message about maximum batch size exceeded. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-P11-005: RBAC — Viewer Cannot Ingest Events

| Field | Detail |
|-------|--------|
| **Priority** | Critical |
| **Precondition** | Logged in as viewer@exargen.com / Viewer123! |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | POST to `/api/siem/events` with a valid event body (e.g., `{ "source": "endpoint", "severity": "low", "category": "process", "title": "Viewer test" }`). | Response returns **403 Forbidden**. Event is NOT created. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-P11-006: Alert Tuning — False Positive

| Field | Detail |
|-------|--------|
| **Priority** | High |
| **Precondition** | Logged in as admin. At least one alert exists linked to a rule. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | GET `/api/siem?tab=rules`, note a rule's `falsePositiveCount`. | Rule data returned with current `falsePositiveCount` value. | |
| 2 | Find an alert linked to that rule. PATCH `/api/siem/alerts/{id}` with body: `{ "status": "false_positive" }` | Response returns 200. Alert status updated to "false_positive". | |
| 3 | GET the same rule again. | Rule's `falsePositiveCount` is incremented by 1 compared to step 1. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-P11-007: AI Action — Execute Without Approval Fails

| Field | Detail |
|-------|--------|
| **Priority** | Critical |
| **Precondition** | Logged in as admin. A pending AI action exists. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | GET `/api/ai-actions`, find one with status "pending". Note its `id`. | At least one pending AI action found. | |
| 2 | POST `/api/ai-actions/{id}` with body: `{ "action": "execute" }` | Response returns **400** error — action must be approved first before execution. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-P11-008: AI Action — Approve Then Execute

| Field | Detail |
|-------|--------|
| **Priority** | Critical |
| **Precondition** | Logged in as admin. A pending AI action exists. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | POST `/api/ai-actions/{id}` with body: `{ "action": "approve" }` | Response returns **200**. Action status changes to "approved". | |
| 2 | POST `/api/ai-actions/{id}` with body: `{ "action": "execute" }` | Response returns **200**. Action status changes to "executed". | |
| 3 | GET `/api/ai-actions/{id}`, check the `config` field. | Status is "executed". `config` contains `executionResult`. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-P11-009: Report Completes Synchronously

| Field | Detail |
|-------|--------|
| **Priority** | High |
| **Precondition** | Logged in as admin. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | POST `/api/reports/generate` with body: `{ "type": "vulnerability" }` | Response returns 200. | |
| 2 | Check the response body. | Response has `status: "completed"` (NOT "generating"). Report is fully generated synchronously. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-P11-010: Report CSV Export

| Field | Detail |
|-------|--------|
| **Priority** | High |
| **Precondition** | A completed report exists. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | POST `/api/reports/generate` with body: `{ "type": "compliance" }`, note the `id` from response. | Report created with status "completed". `id` is returned. | |
| 2 | GET `/api/reports/{id}/download?format=csv` | Response returns CSV text with "Section,Metric,Value" header row. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-P11-011: Report JSON Export

| Field | Detail |
|-------|--------|
| **Priority** | High |
| **Precondition** | A completed report exists (from TC-P11-010 or similar). |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | GET `/api/reports/{id}/download?format=json` | Response returns JSON with `generatedAt` and `summary` fields present. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-P11-012: SOAR Playbooks List

| Field | Detail |
|-------|--------|
| **Priority** | High |
| **Precondition** | Logged in as admin. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | GET `/api/soar/playbooks` | Response returns an array of 3 playbooks: "Critical Alert Auto-Escalation", "Brute Force Response", "Ransomware Isolation". | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-P11-013: SOAR Auto-Escalation Pipeline

| Field | Detail |
|-------|--------|
| **Priority** | Critical |
| **Precondition** | Logged in as admin. SOAR playbooks active. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | POST `/api/siem/events` with a critical severity event that matches a detection rule. | Response returns 200 with event data. | |
| 2 | Check response for `playbooks` array. | `playbooks` array is present and non-empty, indicating SOAR playbook was triggered. | |
| 3 | GET `/api/siem/incidents` — verify a new incident was created. | New incident exists corresponding to the critical event, created automatically via SOAR playbook. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-P11-014: Cron Scheduler Auth

| Field | Detail |
|-------|--------|
| **Priority** | High |
| **Precondition** | No special login required. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | GET `/api/cron/scan-scheduler` without an Authorization header. | Response returns **401 Unauthorized**. Cron endpoint is not publicly accessible. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-P11-015: SOC Dashboard Live Indicator

| Field | Detail |
|-------|--------|
| **Priority** | Medium |
| **Precondition** | Logged in as admin. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | Navigate to `/siem`. | SIEM / SOC dashboard loads. | |
| 2 | Look for "Live" or "updated" indicator in the header area. | Live indicator is visible showing auto-refresh status (e.g., pulsing dot, "Live" badge, or "Last updated" timestamp). | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-P11-016: Metrics Endpoint

| Field | Detail |
|-------|--------|
| **Priority** | High |
| **Precondition** | Logged in as admin. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | GET `/api/siem/metrics` | Response returns JSON containing: `mttr`, `mttd`, `openAlerts`, `alertsByStatus`, `alertsBySeverity`. | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

## TC-P11-017: Full Detection Pipeline

| Field | Detail |
|-------|--------|
| **Priority** | Critical |
| **Precondition** | Logged in as admin. Detection rules and SOAR playbooks active. |

### Steps

| # | Action | Expected Result | Pass/Fail |
|---|--------|----------------|-----------|
| 1 | POST `/api/siem/events` with a critical severity event matching a detection rule. | Response returns 200 with event data. | |
| 2 | Verify alert was created in the response `alerts` array. | At least 1 alert is present with rule name and MITRE ATT&CK ID. | |
| 3 | If SOAR triggers, verify incident in GET `/api/siem/incidents`. | Full detection pipeline confirmed: Event → rule match → alert → SOAR escalation → incident (full chain). | |

**Result:** PASS [ ] FAIL [ ] BLOCKED [ ]
**Notes:** _______________

---

# TEST EXECUTION SUMMARY

## Quick Totals

| Module | Total | Passed | Failed | Blocked |
|--------|-------|--------|--------|---------|
| 1. Authentication | 9 | | | |
| 2. Dashboard | 2 | | | |
| 3. Assets | 4 | | | |
| 4. Scans | 3 | | | |
| 5. Compliance | 2 | | | |
| 6. SIEM | 1 | | | |
| 7. AI Actions | 1 | | | |
| 8. Reports | 2 | | | |
| 9. User Management | 10 | | | |
| 10. Role Management | 6 | | | |
| 11. API Key Management | 4 | | | |
| 12. Audit Log | 6 | | | |
| 13. Sessions | 3 | | | |
| 14. Security Dashboard | 1 | | | |
| 15. Invitation & Onboarding | 3 | | | |
| 16. RBAC Enforcement | 4 | | | |
| 17. Security Edge Cases | 3 | | | |
| 21. Detection Engine & Operational Maturity (Phase 11) | 17 | | | |
| **TOTAL** | **81** | | | |

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Tester | | | |
| Developer | | | |
| Lead / PM | | | |

---

## Recommended Test Execution Order

Execute tests in this order for the smoothest flow (each module builds on the previous):

1. **TC-AUTH-001** through **TC-AUTH-009** (login works first)
2. **TC-DASH-001** through **TC-DASH-002** (dashboard loads)
3. **TC-ASSET-001** through **TC-ASSET-004** (data is visible)
4. **TC-SCAN-001** through **TC-SCAN-003** (scans work)
5. **TC-COMP-001** through **TC-COMP-002** (compliance works)
6. **TC-SIEM-001**, **TC-AI-001** (read-only pages)
7. **TC-REPORT-001** through **TC-REPORT-002** (reports work)
8. **TC-USER-001** through **TC-USER-010** (user management - creates users for later tests)
9. **TC-INVITE-001** through **TC-INVITE-003** (invitation flow - uses user from TC-USER-002)
10. **TC-ROLE-001** through **TC-ROLE-006** (role management)
11. **TC-APIKEY-001** through **TC-APIKEY-004** (API keys)
12. **TC-AUDIT-001** through **TC-AUDIT-006** (audit log - by now many events exist from testing)
13. **TC-SESSION-001** through **TC-SESSION-003** (sessions)
14. **TC-SECDASH-001** (security dashboard)
15. **TC-RBAC-001** through **TC-RBAC-004** (RBAC enforcement - needs users from earlier tests)
16. **TC-SEC-001** through **TC-SEC-003** (security edge cases - run last)
17. **TC-P11-001** through **TC-P11-005** (event ingestion + RBAC enforcement)
18. **TC-P11-006** through **TC-P11-008** (alert tuning + AI actions)
19. **TC-P11-009** through **TC-P11-011** (reports)
20. **TC-P11-012** through **TC-P11-017** (SOAR, scheduling, dashboard, full pipeline)

---

*End of Manual Test Cases Document*
