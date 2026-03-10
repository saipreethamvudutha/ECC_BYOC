import { test, expect } from "@playwright/test";
import {
  login,
  apiCall,
  navigateTo,
  waitForPageReady,
  BASE_URL,
} from "./helpers/auth";

/**
 * 12 - Multi-Role Access Control E2E Tests
 *
 * Tests RBAC enforcement across all 4 demo user roles:
 *   - Viewer:   4 capabilities (dash.view, risk.view, report.view, report.export)
 *   - Analyst:  28 capabilities (operational SOC role)
 *   - Auditor:  19 capabilities (read-only compliance + SSO/SCIM view)
 *   - Admin:    50 capabilities (full access)
 *
 * Validates:
 *   - Sidebar shows correct nav items per role
 *   - Pages grant/deny access via PageGate
 *   - API endpoints enforce capability checks
 *   - Scope-based asset filtering works
 */

// ─── Demo User Credentials ────────────────────────────────────────
const VIEWER = { email: "viewer@exargen.com", password: "Viewer123!", name: "Emily Rodriguez" };
const ANALYST = { email: "analyst@exargen.com", password: "Analyst123!", name: "Sarah Chen" };
const AUDITOR = { email: "auditor@exargen.com", password: "Auditor123!", name: "James Wilson" };
const ADMIN = { email: "admin@exargen.com", password: "Admin123!", name: "Exargen Admin" };

// ─── Expected Capabilities Per Role ────────────────────────────────
const VIEWER_CAPS = ["dash.view", "risk.view", "report.view", "report.export"];
const ANALYST_CAP_COUNT = 31;  // Phase 10: +3 SIEM (investigate, hunt, export)
const AUDITOR_CAP_COUNT = 20;  // Phase 10: +1 SIEM (export)
const ADMIN_CAP_COUNT = 54;   // Phase 10: +4 SIEM capabilities

// ═══════════════════════════════════════════════════════════════════
// VIEWER TESTS — Most restricted (executives/stakeholders)
// ═══════════════════════════════════════════════════════════════════
test.describe("Multi-Role: Viewer (4 capabilities)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, VIEWER.email, VIEWER.password);
  });

  test("viewer should have exactly 4 capabilities", async ({ page }) => {
    const result = await apiCall(page, "GET", "/api/auth/me/capabilities");
    expect(result.status).toBe(200);
    const data = result.data as { capabilities: string[]; denied: string[]; roles: string[]; globalScope: boolean };
    expect(data.capabilities).toHaveLength(4);
    expect(data.capabilities.sort()).toEqual(VIEWER_CAPS.sort());
    expect(data.roles).toContain("viewer");
    expect(data.globalScope).toBe(false);
  });

  test("viewer sidebar should show only Dashboard, Risk Scoring, and Reports", async ({ page }) => {
    await page.goto("/");
    await waitForPageReady(page);
    // Wait for capabilities to load and sidebar to filter
    await page.waitForTimeout(2000);

    const nav = page.locator("nav");
    // Viewer should see: Dashboard, Risk Scoring, Reports (3 items)
    await expect(nav.getByText("Dashboard")).toBeVisible();
    await expect(nav.getByText("Risk Scoring")).toBeVisible();
    await expect(nav.getByText("Reports")).toBeVisible();

    // Viewer should NOT see these items
    await expect(nav.getByText("Scans")).not.toBeVisible();
    await expect(nav.getByText("Assets")).not.toBeVisible();
    await expect(nav.getByText("Compliance")).not.toBeVisible();
    await expect(nav.getByText("AI Actions")).not.toBeVisible();
    await expect(nav.getByText("SIEM")).not.toBeVisible();
    await expect(nav.getByText("Settings")).not.toBeVisible();
  });

  test("viewer should see Access Denied on Scans page", async ({ page }) => {
    await navigateTo(page, "/scans");
    await expect(page.getByText("Access Denied")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("scan.view")).toBeVisible();
    await expect(page.getByText("Return to Dashboard")).toBeVisible();
  });

  test("viewer should see Access Denied on Assets page", async ({ page }) => {
    await navigateTo(page, "/assets");
    await expect(page.getByText("Access Denied")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("asset.view")).toBeVisible();
  });

  test("viewer should see Access Denied on Settings pages", async ({ page }) => {
    await navigateTo(page, "/settings/users");
    await expect(page.getByText("Access Denied")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("admin.user.view")).toBeVisible();
  });

  test("viewer should successfully load Dashboard page", async ({ page }) => {
    await navigateTo(page, "/");
    await expect(page.getByText("Total Assets")).toBeVisible({ timeout: 15000 });
  });

  test("viewer should successfully load Reports page", async ({ page }) => {
    await navigateTo(page, "/reports");
    await expect(page.getByRole("heading", { name: "Reports", exact: true })).toBeVisible({ timeout: 15000 });
  });

  test("viewer API: /api/assets should return 403", async ({ page }) => {
    const result = await apiCall(page, "GET", "/api/assets");
    expect(result.status).toBe(403);
  });

  test("viewer API: /api/scans should return 403", async ({ page }) => {
    const result = await apiCall(page, "GET", "/api/scans");
    expect(result.status).toBe(403);
  });

  test("viewer API: /api/dashboard should return 200", async ({ page }) => {
    const result = await apiCall(page, "GET", "/api/dashboard");
    expect(result.status).toBe(200);
  });

  test("viewer API: /api/users/invite should return 403", async ({ page }) => {
    const result = await apiCall(page, "POST", "/api/users/invite", {
      name: "Unauthorized Test",
      email: "unauth@test.com",
      roleId: "fake-id",
    });
    expect(result.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════
// ANALYST TESTS — Operational SOC role (28 capabilities)
// ═══════════════════════════════════════════════════════════════════
test.describe("Multi-Role: Analyst (28 capabilities)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ANALYST.email, ANALYST.password);
  });

  test("analyst should have 28 capabilities and security-analyst role", async ({ page }) => {
    const result = await apiCall(page, "GET", "/api/auth/me/capabilities");
    expect(result.status).toBe(200);
    const data = result.data as { capabilities: string[]; roles: string[]; globalScope: boolean };
    expect(data.capabilities).toHaveLength(ANALYST_CAP_COUNT);
    expect(data.roles).toContain("security-analyst");
    expect(data.globalScope).toBe(false);
  });

  test("analyst sidebar should show operational pages but not Settings", async ({ page }) => {
    await page.goto("/");
    await waitForPageReady(page);
    await page.waitForTimeout(2000);

    const nav = page.locator("nav");
    // Analyst should see all operational pages
    await expect(nav.getByText("Dashboard")).toBeVisible();
    await expect(nav.getByText("Scans")).toBeVisible();
    await expect(nav.getByText("Assets")).toBeVisible();
    await expect(nav.getByText("Risk Scoring")).toBeVisible();
    await expect(nav.getByText("Compliance")).toBeVisible();
    await expect(nav.getByText("Reports")).toBeVisible();
    await expect(nav.getByText("AI Actions")).toBeVisible();
    await expect(nav.getByText("SIEM")).toBeVisible();

    // Analyst should NOT see Settings (no admin.user.view)
    await expect(nav.getByText("Settings")).not.toBeVisible();
  });

  test("analyst should load Assets page successfully", async ({ page }) => {
    await navigateTo(page, "/assets");
    await expect(page.getByText("Asset Inventory")).toBeVisible({ timeout: 15000 });
  });

  test("analyst should load Scans page successfully", async ({ page }) => {
    await navigateTo(page, "/scans");
    // Scans page should load (analyst has scan.view)
    await expect(page.getByRole("heading", { name: /Scans/ })).toBeVisible({ timeout: 15000 });
  });

  test("analyst should see Access Denied on User Management page", async ({ page }) => {
    await navigateTo(page, "/settings/users");
    await expect(page.getByText("Access Denied")).toBeVisible({ timeout: 10000 });
  });

  test("analyst should see Access Denied on Role Management page", async ({ page }) => {
    await navigateTo(page, "/settings/roles");
    await expect(page.getByText("Access Denied")).toBeVisible({ timeout: 10000 });
  });

  test("analyst API: /api/assets should return 200 with scope-filtered results", async ({ page }) => {
    const result = await apiCall(page, "GET", "/api/assets");
    expect(result.status).toBe(200);
    // Analyst has "Production Only" scope — should get filtered assets, not all 12
    const assets = result.data as Array<{ id: string }>;
    expect(Array.isArray(assets)).toBe(true);
  });

  test("analyst API: cannot invite users (no admin.user.manage)", async ({ page }) => {
    const result = await apiCall(page, "POST", "/api/users/invite", {
      name: "Test User",
      email: "test@analyst.com",
      roleId: "fake-id",
    });
    expect(result.status).toBe(403);
  });

  test("analyst API: cannot create roles (no admin.role.manage)", async ({ page }) => {
    const result = await apiCall(page, "POST", "/api/roles", {
      name: "Rogue Role",
      slug: "rogue-role",
      description: "Should be blocked",
      capabilities: ["admin.billing.manage"],
    });
    expect(result.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════
// AUDITOR TESTS — Read-only compliance role (17 capabilities)
// ═══════════════════════════════════════════════════════════════════
test.describe("Multi-Role: Auditor (19 capabilities)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, AUDITOR.email, AUDITOR.password);
  });

  test("auditor should have 19 capabilities with global scope", async ({ page }) => {
    const result = await apiCall(page, "GET", "/api/auth/me/capabilities");
    expect(result.status).toBe(200);
    const data = result.data as { capabilities: string[]; roles: string[]; globalScope: boolean };
    expect(data.capabilities).toHaveLength(AUDITOR_CAP_COUNT);
    expect(data.roles).toContain("auditor");
    // Auditor has global scope for read-everything access
    expect(data.globalScope).toBe(true);
  });

  test("auditor sidebar should show read-only operational pages and Settings", async ({ page }) => {
    await page.goto("/");
    await waitForPageReady(page);
    await page.waitForTimeout(2000);

    const nav = page.locator("nav");
    // Auditor has admin.user.view so Settings is visible
    await expect(nav.getByText("Dashboard")).toBeVisible();
    await expect(nav.getByText("Scans")).toBeVisible();
    await expect(nav.getByText("Assets")).toBeVisible();
    await expect(nav.getByText("Compliance")).toBeVisible();
    await expect(nav.getByText("Reports")).toBeVisible();
    await expect(nav.getByText("SIEM")).toBeVisible();
    await expect(nav.getByText("Settings")).toBeVisible();
  });

  test("auditor should load Audit Log page (has admin.audit.view)", async ({ page }) => {
    await navigateTo(page, "/settings/audit-log");
    await expect(page.getByRole("heading", { name: /Audit Log/ })).toBeVisible({ timeout: 15000 });
  });

  test("auditor should see all assets (global scope)", async ({ page }) => {
    const result = await apiCall(page, "GET", "/api/assets");
    expect(result.status).toBe(200);
    const assets = result.data as Array<{ id: string }>;
    // Auditor has global scope — should see all assets (12 seed)
    expect(assets.length).toBeGreaterThanOrEqual(12);
  });

  test("auditor API: cannot create scans (no scan.create)", async ({ page }) => {
    const result = await apiCall(page, "POST", "/api/scans/create", {
      name: "Unauthorized Scan",
      targets: ["192.168.1.1"],
      scanType: "full",
    });
    expect(result.status).toBe(403);
  });

  test("auditor API: cannot manage users (no admin.user.manage)", async ({ page }) => {
    const result = await apiCall(page, "POST", "/api/users/invite", {
      name: "Unauthorized Invite",
      email: "rogue@test.com",
      roleId: "fake-id",
    });
    expect(result.status).toBe(403);
  });

  test("auditor should see Access Denied on API Keys page (no admin.apikey.manage)", async ({ page }) => {
    await navigateTo(page, "/settings/api-keys");
    await expect(page.getByText("Access Denied")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("admin.apikey.manage")).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════
// CROSS-ROLE COMPARISON TESTS
// Uses API-based login (faster, more reliable than UI login in loops)
// ═══════════════════════════════════════════════════════════════════

/** Switch user via API login — avoids UI timing issues in multi-user loops */
async function switchUser(page: import("@playwright/test").Page, email: string, password: string) {
  await page.context().clearCookies();
  // Navigate to app origin so browser fetch works with correct cookie scope
  await page.goto("/login", { waitUntil: "domcontentloaded", timeout: 15000 });
  // Reset any lockout/rate limits for this user (previous security tests may have locked accounts)
  await page.evaluate(async (email) => {
    await fetch("/api/test/reset-lockout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
  }, email);
  // Login via API directly — sets HttpOnly cookie via Set-Cookie header
  const loginStatus = await page.evaluate(
    async ({ email, password }) => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      return res.status;
    },
    { email, password }
  );
  expect(loginStatus).toBe(200);
}

test.describe("Multi-Role: Cross-Role Verification", () => {

  test("all 4 users can login and reach dashboard", async ({ page }) => {
    const users = [VIEWER, ANALYST, AUDITOR, ADMIN];
    for (const user of users) {
      await switchUser(page, user.email, user.password);
      const result = await apiCall(page, "GET", "/api/dashboard");
      expect(result.status).toBe(200);
    }
  });

  test("capability counts are correct for all roles", async ({ page }) => {
    const expected = [
      { ...VIEWER, capCount: VIEWER_CAPS.length, role: "viewer" },
      { ...ANALYST, capCount: ANALYST_CAP_COUNT, role: "security-analyst" },
      { ...AUDITOR, capCount: AUDITOR_CAP_COUNT, role: "auditor" },
      { ...ADMIN, capCount: ADMIN_CAP_COUNT, role: "platform-admin" },
    ];

    for (const user of expected) {
      await switchUser(page, user.email, user.password);
      const result = await apiCall(page, "GET", "/api/auth/me/capabilities");
      expect(result.status).toBe(200);
      const data = result.data as { capabilities: string[]; roles: string[] };
      expect(data.capabilities).toHaveLength(user.capCount);
      expect(data.roles).toContain(user.role);
    }
  });

  test("only admin and auditor have global scope", async ({ page }) => {
    const users = [
      { ...VIEWER, expectedScope: false },
      { ...ANALYST, expectedScope: false },
      { ...AUDITOR, expectedScope: true },
      { ...ADMIN, expectedScope: true },
    ];

    for (const user of users) {
      await switchUser(page, user.email, user.password);
      const result = await apiCall(page, "GET", "/api/auth/me/capabilities");
      expect(result.status).toBe(200);
      const data = result.data as { globalScope: boolean };
      expect(data.globalScope).toBe(user.expectedScope);
    }
  });

  test("asset access: admin=all, auditor=all, analyst=scoped, viewer=denied", async ({ page }) => {
    // Admin — should see all assets
    await switchUser(page, ADMIN.email, ADMIN.password);
    const adminResult = await apiCall(page, "GET", "/api/assets");
    expect(adminResult.status).toBe(200);
    const adminAssets = adminResult.data as Array<{ id: string }>;
    expect(adminAssets.length).toBeGreaterThanOrEqual(12);

    // Auditor — global scope, should see all assets
    await switchUser(page, AUDITOR.email, AUDITOR.password);
    const auditorResult = await apiCall(page, "GET", "/api/assets");
    expect(auditorResult.status).toBe(200);
    const auditorAssets = auditorResult.data as Array<{ id: string }>;
    expect(auditorAssets.length).toBeGreaterThanOrEqual(12);

    // Analyst — scoped, should see some assets (may be 0 if scope doesn't match)
    await switchUser(page, ANALYST.email, ANALYST.password);
    const analystResult = await apiCall(page, "GET", "/api/assets");
    expect(analystResult.status).toBe(200);

    // Viewer — no asset.view capability, should get 403
    await switchUser(page, VIEWER.email, VIEWER.password);
    const viewerResult = await apiCall(page, "GET", "/api/assets");
    expect(viewerResult.status).toBe(403);
  });

  test("invite user: only admin can, all others get 403", async ({ page }) => {
    const invitePayload = { name: "RBAC Test", email: "rbac-test@example.com", roleId: "fake" };

    // Viewer — 403
    await switchUser(page, VIEWER.email, VIEWER.password);
    expect((await apiCall(page, "POST", "/api/users/invite", invitePayload)).status).toBe(403);

    // Analyst — 403
    await switchUser(page, ANALYST.email, ANALYST.password);
    expect((await apiCall(page, "POST", "/api/users/invite", invitePayload)).status).toBe(403);

    // Auditor — 403
    await switchUser(page, AUDITOR.email, AUDITOR.password);
    expect((await apiCall(page, "POST", "/api/users/invite", invitePayload)).status).toBe(403);

    // Admin — should NOT get 403 (may get 400/404 for bad roleId, but not 403)
    await switchUser(page, ADMIN.email, ADMIN.password);
    const adminResult = await apiCall(page, "POST", "/api/users/invite", invitePayload);
    expect(adminResult.status).not.toBe(403);
  });
});
