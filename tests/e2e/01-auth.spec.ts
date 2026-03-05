import { test, expect } from "@playwright/test";
import {
  waitForPageReady,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  resetAdminLockout,
} from "./helpers/auth";

test.describe("Authentication Tests", () => {
  // -------------------------------------------------------------------------
  // TC-AUTH-001: Successful login
  // -------------------------------------------------------------------------
  test("TC-AUTH-001: Successful login redirects to dashboard with cookies set", async ({
    page,
  }) => {
    // Navigate to login page
    await page.goto("/login");
    await waitForPageReady(page);

    // Fill in credentials
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);

    // Submit the form
    await page.click('button[type="submit"]');

    // Wait for redirect away from /login
    await page.waitForURL((url) => !url.pathname.includes("/login"), {
      timeout: 15000,
    });

    // Verify we landed on the dashboard (root path)
    expect(page.url()).toMatch(/\/$/);

    // Wait for dashboard content to load
    await waitForPageReady(page);
    await expect(
      page.locator("h1:has-text('Security Dashboard')")
    ).toBeVisible({ timeout: 15000 });

    // Verify cookies are set (HttpOnly cookies can be checked via context)
    const cookies = await page.context().cookies();
    const tokenCookie = cookies.find((c) => c.name === "byoc_token");
    const refreshCookie = cookies.find((c) => c.name === "byoc_refresh");

    expect(tokenCookie).toBeDefined();
    expect(tokenCookie!.httpOnly).toBe(true);
    expect(tokenCookie!.path).toBe("/");

    expect(refreshCookie).toBeDefined();
    expect(refreshCookie!.httpOnly).toBe(true);
    expect(refreshCookie!.path).toBe("/");
  });

  // -------------------------------------------------------------------------
  // TC-AUTH-002: Wrong password shows error, stays on /login
  // -------------------------------------------------------------------------
  test("TC-AUTH-002: Wrong password shows error and stays on login page", async ({
    page,
  }) => {
    await page.goto("/login");
    await waitForPageReady(page);

    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', "WrongPassword123!");

    await page.click('button[type="submit"]');

    // Wait for the error message to appear
    const errorBanner = page.locator(
      ".bg-red-500\\/10, [class*='bg-red']"
    );
    await expect(errorBanner).toBeVisible({ timeout: 10000 });

    // Error text should be generic (no user enumeration)
    const errorText = await errorBanner.textContent();
    expect(errorText).toContain("Invalid");

    // URL should still be /login
    expect(page.url()).toContain("/login");
  });

  // -------------------------------------------------------------------------
  // TC-AUTH-003: Non-existent email shows same generic error
  // -------------------------------------------------------------------------
  test("TC-AUTH-003: Non-existent email shows generic error without user enumeration", async ({
    page,
  }) => {
    await page.goto("/login");
    await waitForPageReady(page);

    await page.fill('input[type="email"]', "nonexistent@exargen.com");
    await page.fill('input[type="password"]', "SomePassword123!");

    await page.click('button[type="submit"]');

    // Wait for the error message
    const errorBanner = page.locator(
      ".bg-red-500\\/10, [class*='bg-red']"
    );
    await expect(errorBanner).toBeVisible({ timeout: 10000 });

    const errorText = await errorBanner.textContent();
    // Should show the same generic message as wrong password (no enumeration)
    expect(errorText).toContain("Invalid");

    // Should NOT reveal that the user does not exist
    expect(errorText?.toLowerCase()).not.toContain("not found");
    expect(errorText?.toLowerCase()).not.toContain("does not exist");
    expect(errorText?.toLowerCase()).not.toContain("no account");

    // URL should still be /login
    expect(page.url()).toContain("/login");
  });

  // -------------------------------------------------------------------------
  // TC-AUTH-004: Empty email validation
  // -------------------------------------------------------------------------
  test("TC-AUTH-004: Empty email prevents form submission via HTML validation", async ({
    page,
  }) => {
    await page.goto("/login");
    await waitForPageReady(page);

    // Leave email empty, fill password
    await page.fill('input[type="password"]', "SomePassword");

    // Click submit
    await page.click('button[type="submit"]');

    // The form uses HTML5 required attribute, so the browser prevents submission
    // URL should remain /login (no network request made)
    expect(page.url()).toContain("/login");

    // Verify the email field has the 'required' attribute
    const isRequired = await page
      .locator('input[type="email"]')
      .getAttribute("required");
    expect(isRequired !== null).toBe(true);
  });

  // -------------------------------------------------------------------------
  // TC-AUTH-005: Empty password validation
  // -------------------------------------------------------------------------
  test("TC-AUTH-005: Empty password prevents form submission via HTML validation", async ({
    page,
  }) => {
    await page.goto("/login");
    await waitForPageReady(page);

    // Fill email, leave password empty
    await page.fill('input[type="email"]', ADMIN_EMAIL);

    // Click submit
    await page.click('button[type="submit"]');

    // HTML5 required attribute prevents submission
    expect(page.url()).toContain("/login");

    // Verify the password field has the 'required' attribute
    const isRequired = await page
      .locator('input[type="password"]')
      .getAttribute("required");
    expect(isRequired !== null).toBe(true);
  });

  // -------------------------------------------------------------------------
  // TC-AUTH-006: Account lockout after 5 failed attempts
  // -------------------------------------------------------------------------
  test("TC-AUTH-006: Account lockout after 5 failed attempts blocks even correct password", async ({
    page,
  }) => {
    // Reset both DB lockout and in-memory rate limits before this test
    await resetAdminLockout();
    await page.waitForTimeout(1000);

    // First, verify we CAN log in (clean state)
    await page.goto("/login");
    await waitForPageReady(page);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes("/login"), {
      timeout: 15000,
    });
    // Now logout to clear session
    await page.context().clearCookies();

    // Attempt 5 failed logins with wrong password
    for (let i = 1; i <= 5; i++) {
      await page.goto("/login");
      await waitForPageReady(page);
      await page.fill('input[type="email"]', ADMIN_EMAIL);
      await page.fill('input[type="password"]', `WrongPassword${i}!`);
      await page.click('button[type="submit"]');

      // Wait for error to appear
      await page
        .locator(".bg-red-500\\/10, [class*='bg-red']")
        .waitFor({ state: "visible", timeout: 10000 });
    }

    // Attempt 6: use the CORRECT password - should still fail due to lockout
    await page.goto("/login");
    await waitForPageReady(page);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');

    // Wait for error
    const errorBanner = page.locator(
      ".bg-red-500\\/10, [class*='bg-red']"
    );
    await expect(errorBanner).toBeVisible({ timeout: 10000 });

    // Should still be on login page (locked out)
    expect(page.url()).toContain("/login");

    // Clean up: Reset the lockout so subsequent tests can log in
    await resetAdminLockout();
  });

  // -------------------------------------------------------------------------
  // TC-AUTH-007: Logout clears cookies and redirects to /login
  // -------------------------------------------------------------------------
  test("TC-AUTH-007: Logout clears cookies and redirects to login page", async ({
    page,
  }) => {
    // Ensure lockout is cleared from the previous test
    await resetAdminLockout();

    await page.context().clearCookies();
    await page.waitForTimeout(1000);

    // Log in
    await page.goto("/login");
    await waitForPageReady(page);
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');

    await page.waitForURL((url) => !url.pathname.includes("/login"), {
      timeout: 15000,
    });

    await waitForPageReady(page);

    // Now perform logout by clicking the user menu then "Sign out"
    // First, open the user menu dropdown (avatar button with user name)
    const userMenuButton = page.locator(
      '[data-testid="user-menu-button"], button:has-text("Exargen Admin")'
    );
    await userMenuButton.click();

    // Click "Sign out" in the dropdown
    const signOutButton = page.locator(
      '[data-testid="sign-out-button"], button:has-text("Sign out")'
    );
    await expect(signOutButton).toBeVisible({ timeout: 5000 });
    await signOutButton.click();

    // Wait for redirect to /login (use domcontentloaded to avoid load timeout)
    await page.waitForURL("**/login**", { timeout: 15000, waitUntil: "domcontentloaded" });

    // Verify URL is /login
    expect(page.url()).toContain("/login");

    // Verify cookies are cleared
    const cookies = await page.context().cookies();
    const tokenCookie = cookies.find((c) => c.name === "byoc_token");
    const refreshCookie = cookies.find((c) => c.name === "byoc_refresh");

    // Cookies should either be absent or have empty/expired values
    const tokenValue = tokenCookie?.value || "";
    const refreshValue = refreshCookie?.value || "";
    expect(tokenValue === "" || tokenCookie === undefined).toBe(true);
    expect(refreshValue === "" || refreshCookie === undefined).toBe(true);

    // Attempting to access dashboard should redirect back to login
    await page.goto("/");
    // Wait for redirect - use domcontentloaded to avoid load timeout on redirects
    await page.waitForURL("**/login**", { timeout: 15000, waitUntil: "domcontentloaded" });
    expect(page.url()).toContain("/login");
  });

  // -------------------------------------------------------------------------
  // TC-AUTH-008: Unauthenticated access redirects to login
  // -------------------------------------------------------------------------
  test("TC-AUTH-008: Unauthenticated access to protected routes redirects to login", async ({
    page,
  }) => {
    // Ensure no cookies are set
    await page.context().clearCookies();

    // Try accessing the dashboard
    await page.goto("/");
    await page.waitForURL("**/login**", { timeout: 10000 });
    expect(page.url()).toContain("/login");

    // Try accessing the assets page
    await page.goto("/assets");
    await page.waitForURL("**/login**", { timeout: 10000 });
    expect(page.url()).toContain("/login");

    // Try accessing the scans page
    await page.goto("/scans");
    await page.waitForURL("**/login**", { timeout: 10000 });
    expect(page.url()).toContain("/login");

    // Try accessing settings
    await page.goto("/settings/users");
    await page.waitForURL("**/login**", { timeout: 10000 });
    expect(page.url()).toContain("/login");

    // Verify that callbackUrl parameter is set (middleware sets it)
    const url = new URL(page.url());
    const callbackUrl = url.searchParams.get("callbackUrl");
    expect(callbackUrl).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // TC-AUTH-009: Login page branding
  // -------------------------------------------------------------------------
  test('TC-AUTH-009: Login page shows correct branding (BYOC, Cybersecurity Platform, no Acme)', async ({
    page,
  }) => {
    await page.goto("/login");
    await waitForPageReady(page);

    // Check for BYOC branding in heading
    const byocHeading = page.locator("h1:has-text('BYOC')");
    await expect(byocHeading).toBeVisible();

    // Check for "Cybersecurity Platform" text (use .first() since it appears in multiple places)
    const platformText = page.getByText("Cybersecurity Platform", { exact: true });
    await expect(platformText).toBeVisible();

    // Check for "Welcome back" text
    const welcomeText = page.locator("text=Welcome back");
    await expect(welcomeText).toBeVisible();

    // Check for "Sign in to your security operations center" text
    const signInText = page.locator(
      "text=Sign in to your security operations center"
    );
    await expect(signInText).toBeVisible();

    // Ensure no "Acme" branding exists anywhere on the page
    const pageContent = await page.textContent("body");
    expect(pageContent?.toLowerCase()).not.toContain("acme");

    // Verify the version text is present
    const versionText = page.locator("text=BYOC Cybersecurity Platform v");
    await expect(versionText).toBeVisible();
  });
});
