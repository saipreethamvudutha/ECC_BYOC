import { type Page, expect } from "@playwright/test";

export const ADMIN_EMAIL = "admin@exargen.com";
export const ADMIN_PASSWORD = "Admin123!";
export const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

/**
 * Login as admin and return authenticated page.
 */
export async function loginAsAdmin(page: Page): Promise<void> {
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
}

/**
 * Login with given credentials.
 */
export async function login(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  await page.goto("/login", { timeout: 30000 });
  await page.waitForSelector('input[type="email"]', { state: "visible", timeout: 15000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  // Wait for redirect to dashboard or error
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 15000,
  }).catch(() => {
    // Login may have failed - caller should check
  });
}

/**
 * Ensure we are logged in as admin. If already on dashboard, skip.
 */
export async function ensureLoggedIn(page: Page): Promise<void> {
  const url = page.url();
  if (url.includes("/login") || url === "about:blank" || !url.includes("localhost")) {
    await loginAsAdmin(page);
  }
}

/**
 * Logout current user via the Topbar user menu dropdown.
 */
export async function logout(page: Page): Promise<void> {
  try {
    // Open the user menu dropdown by clicking the avatar/user button in the Topbar
    // The button contains the user name (e.g., "Exargen Admin") and role text
    const userMenuButton = page.locator(
      '[data-testid="user-menu-button"], button:has-text("Exargen Admin")'
    );
    await userMenuButton.click({ timeout: 5000 });

    // Wait for dropdown to appear, then click "Sign out"
    const signOutButton = page.locator(
      '[data-testid="sign-out-button"], button:has-text("Sign out")'
    );
    await expect(signOutButton).toBeVisible({ timeout: 5000 });
    await signOutButton.click();

    // Wait for redirect to /login
    await page.waitForURL("**/login", { timeout: 10000 });
  } catch {
    // Fallback: clear cookies and navigate to login
    await page.context().clearCookies();
    await page.goto("/login");
  }
}

/**
 * Make an authenticated API call using the page's cookies.
 */
export async function apiCall(
  page: Page,
  method: string,
  endpoint: string,
  body?: Record<string, unknown>
): Promise<{ status: number; data: unknown }> {
  const response = await page.evaluate(
    async ({ method, endpoint, body }) => {
      const res = await fetch(endpoint, {
        method,
        headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      let data;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      return { status: res.status, data };
    },
    { method, endpoint, body }
  );
  return response;
}

/**
 * Wait for network idle after navigation.
 */
export async function waitForPageReady(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
}

/**
 * Navigate to a page and wait for it to load.
 */
export async function navigateTo(page: Page, path: string): Promise<void> {
  await page.goto(path, { timeout: 30000 });
  await waitForPageReady(page);
}

/**
 * Reset account lockout for the admin user via test API.
 * Call this after running lockout tests to prevent cascading failures.
 */
export async function resetAdminLockout(): Promise<void> {
  try {
    const res = await fetch(`${BASE_URL}/api/test/reset-lockout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ADMIN_EMAIL }),
    });
    if (!res.ok) {
      console.warn(`Failed to reset lockout: ${res.status}`);
    }
  } catch (err) {
    console.warn("Could not reset lockout:", err);
  }
}
