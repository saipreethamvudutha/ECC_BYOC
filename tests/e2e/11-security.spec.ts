import { test, expect } from "@playwright/test";
import {
  loginAsAdmin,
  login,
  ensureLoggedIn,
  navigateTo,
  apiCall,
  waitForPageReady,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
} from "./helpers/auth";

test.describe("Security Testing", () => {
  test("should handle SQL injection in assets search without crashing", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, "/assets");

    // Wait for page load
    await page.waitForSelector('h1:has-text("Asset Inventory")', { state: "visible", timeout: 15000 });

    // Enter SQL injection payload in search field
    const searchInput = page.locator('input[placeholder*="Search by name, hostname"]');
    await expect(searchInput).toBeVisible();
    await searchInput.fill("'; DROP TABLE assets; --");

    // Wait for client-side filtering
    await page.waitForTimeout(500);

    // Page should not crash - the heading should still be visible
    await expect(page.getByText("Assets").first()).toBeVisible();

    // Try more SQL injection payloads
    await searchInput.fill("\" OR 1=1 --");
    await page.waitForTimeout(500);
    await expect(page.getByText("Assets").first()).toBeVisible();

    await searchInput.fill("1; SELECT * FROM users WHERE 1=1");
    await page.waitForTimeout(500);
    await expect(page.getByText("Assets").first()).toBeVisible();
  });

  test("should handle XSS in scan creation without script execution", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, "/scans");

    await page.waitForSelector('h1:has-text("Scans")', { state: "visible", timeout: 15000 });

    // Click "New Scan" to open dialog
    await page.locator('button:has-text("New Scan")').click();
    await page.waitForSelector('text="Create New Scan"', { state: "visible", timeout: 5000 });

    // Set up alert detection - if an alert fires, the XSS succeeded
    let alertFired = false;
    page.on("dialog", async (dialog) => {
      alertFired = true;
      await dialog.dismiss();
    });

    // Enter XSS payload in scan name
    const nameInput = page.locator('input[placeholder*="Weekly Vulnerability"]');
    await nameInput.fill("<script>alert('xss')</script>");

    // Enter targets
    const targetsInput = page.locator('input[placeholder*="10.0.1.0"]');
    await targetsInput.fill("10.0.0.1");

    // Click Launch Scan
    await page.locator('button:has-text("Launch Scan")').click();

    // Wait for the scan to be created and reflected in the UI
    await page.waitForTimeout(3000);
    await waitForPageReady(page);

    // Verify no alert was fired (XSS did not execute)
    expect(alertFired).toBe(false);

    // Verify the page is still functional
    await expect(page.getByText("Scans").first()).toBeVisible();
  });

  test("should handle XSS in search input without alert execution", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, "/assets");

    await page.waitForSelector('h1:has-text("Asset Inventory")', { state: "visible", timeout: 15000 });

    // Set up alert detection
    let alertFired = false;
    page.on("dialog", async (dialog) => {
      alertFired = true;
      await dialog.dismiss();
    });

    // Enter XSS payload in search field
    const searchInput = page.locator('input[placeholder*="Search by name, hostname"]');
    await searchInput.fill('<img src=x onerror=alert(1)>');

    await page.waitForTimeout(1000);

    // Verify no alert was fired
    expect(alertFired).toBe(false);

    // Try another XSS vector
    await searchInput.fill('<svg onload=alert("xss")>');
    await page.waitForTimeout(500);
    expect(alertFired).toBe(false);

    // Page should still be functional
    await expect(page.getByText("Assets").first()).toBeVisible();
  });

  test("should return 400 for invalid UUID on dynamic API routes", async ({ page }) => {
    await loginAsAdmin(page);
    await waitForPageReady(page);

    // Test /api/users/not-a-uuid
    const usersResult = await apiCall(page, "GET", "/api/users/not-a-uuid");
    // Should return 400 (invalid UUID) or 405 (if only PATCH is defined)
    expect([400, 405]).toContain(usersResult.status);

    // Test /api/roles/not-a-uuid
    const rolesResult = await apiCall(page, "GET", "/api/roles/not-a-uuid");
    expect([400, 405]).toContain(rolesResult.status);

    // Test /api/auth/sessions/not-a-uuid with DELETE method
    const sessionsResult = await apiCall(page, "DELETE", "/api/auth/sessions/not-a-uuid");
    expect(sessionsResult.status).toBe(400);

    // Verify proper error format (should not contain stack traces or internal info)
    if (sessionsResult.data && typeof sessionsResult.data === "object") {
      const errorData = sessionsResult.data as Record<string, unknown>;
      expect(errorData.error).toBeTruthy();
      // Should not expose internal details
      expect(JSON.stringify(errorData)).not.toContain("stack");
      expect(JSON.stringify(errorData)).not.toContain("prisma");
    }
  });

  test("should return 401 for unauthenticated API access on protected endpoints", async ({ page }) => {
    // Clear all cookies to ensure we are unauthenticated
    await page.context().clearCookies();
    await page.goto("/login");
    await waitForPageReady(page);

    // Test multiple protected API endpoints without authentication
    const protectedEndpoints = [
      { method: "GET", path: "/api/audit-log" },
      { method: "GET", path: "/api/audit-log/integrity" },
      { method: "GET", path: "/api/auth/sessions" },
      { method: "GET", path: "/api/dashboard" },
      { method: "GET", path: "/api/compliance" },
      { method: "GET", path: "/api/siem" },
      { method: "GET", path: "/api/ai-actions" },
      { method: "GET", path: "/api/reports" },
      { method: "GET", path: "/api/assets" },
      { method: "GET", path: "/api/roles" },
    ];

    for (const endpoint of protectedEndpoints) {
      const result = await page.evaluate(
        async ({ method, path }) => {
          const res = await fetch(path, { method });
          return { status: res.status, path };
        },
        { method: endpoint.method, path: endpoint.path }
      );

      // Should be 401 Unauthorized (some may return 403 if middleware redirects)
      expect(
        result.status === 401 || result.status === 403,
        `Expected 401 or 403 for ${endpoint.path}, got ${result.status}`
      ).toBeTruthy();
    }

    // Re-login for subsequent tests
    await loginAsAdmin(page);
  });

  test("should not expose byoc_token cookie to JavaScript (HttpOnly)", async ({ page }) => {
    await loginAsAdmin(page);
    await waitForPageReady(page);

    // Try to read cookies via JavaScript
    const cookies = await page.evaluate(() => document.cookie);

    // byoc_token should NOT be accessible via document.cookie (HttpOnly flag)
    expect(cookies).not.toContain("byoc_token");

    // Verify the cookie exists by checking via Playwright's cookie API
    // (This can read HttpOnly cookies, unlike document.cookie)
    const allCookies = await page.context().cookies();
    const tokenCookie = allCookies.find((c) => c.name === "byoc_token");

    if (tokenCookie) {
      // If the cookie exists, verify it has HttpOnly flag
      expect(tokenCookie.httpOnly).toBe(true);
    }
    // If no cookie found by that exact name, the test still passes since
    // the key assertion is that JS cannot read it
  });

  test("should not have wildcard Access-Control-Allow-Origin on API", async ({ page }) => {
    await loginAsAdmin(page);
    await waitForPageReady(page);

    // Make a request and inspect the response headers for CORS
    const corsCheck = await page.evaluate(async () => {
      const res = await fetch("/api/audit-log/integrity");
      const acaoHeader = res.headers.get("access-control-allow-origin");
      return {
        status: res.status,
        accessControlAllowOrigin: acaoHeader,
      };
    });

    // The API should NOT have a wildcard CORS header
    if (corsCheck.accessControlAllowOrigin) {
      expect(corsCheck.accessControlAllowOrigin).not.toBe("*");
    }
    // If the header is null/absent, that's also secure (no CORS = same-origin only)
  });

  test("should handle rapid failed login attempts gracefully (rate limiting)", async ({ page }) => {
    // Clear cookies to start fresh
    await page.context().clearCookies();
    await page.goto("/login");
    await waitForPageReady(page);

    const results: number[] = [];

    // Fire 5 rapid wrong password login attempts
    for (let i = 0; i < 5; i++) {
      const result = await page.evaluate(
        async ({ email, attempt }) => {
          const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password: `WrongPassword${attempt}!` }),
          });
          return res.status;
        },
        { email: ADMIN_EMAIL, attempt: i }
      );
      results.push(result);
    }

    // All should be either 401 (invalid creds) or 429 (rate limited)
    for (const status of results) {
      expect(
        status === 401 || status === 429,
        `Expected 401 or 429, got ${status}`
      ).toBeTruthy();
    }

    // If rate limiting kicked in, at least one should be 429
    // (depends on the rate limit config, so we just ensure no 500s)
    const has500 = results.some((s) => s >= 500);
    expect(has500).toBe(false);

    // Re-login for subsequent tests
    await loginAsAdmin(page);
  });

  test("should not leak sensitive data in failed login error response", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/login");
    await waitForPageReady(page);

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@exargen.com", password: "WrongPassword123!" }),
      });
      const data = await res.json();
      return { status: res.status, body: JSON.stringify(data) };
    });

    // Should get 401 or 429
    expect([401, 429]).toContain(result.status);

    // The response body should NOT contain sensitive information
    const body = result.body.toLowerCase();

    // Should not contain password hashes
    expect(body).not.toContain("$2b$");
    expect(body).not.toContain("$2a$");
    expect(body).not.toContain("bcrypt");

    // Should not contain database details
    expect(body).not.toContain("prisma");
    expect(body).not.toContain("postgresql");
    expect(body).not.toContain("database");

    // Should not contain stack traces
    expect(body).not.toContain("stack");
    expect(body).not.toContain("node_modules");
    expect(body).not.toContain("at object");

    // Should not contain user IDs or internal details
    expect(body).not.toContain("userid");
    expect(body).not.toContain("tenantid");

    // The error message should be generic
    if (result.status === 401) {
      expect(body).toContain("invalid");
    }

    // Re-login for any subsequent tests
    await loginAsAdmin(page);
  });
});
