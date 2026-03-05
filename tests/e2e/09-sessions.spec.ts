import { test, expect } from "@playwright/test";
import {
  loginAsAdmin,
  ensureLoggedIn,
  navigateTo,
  apiCall,
  waitForPageReady,
} from "./helpers/auth";

test.describe("Sessions Management", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await waitForPageReady(page);
  });

  test("should display sessions page with stat cards and current session", async ({ page }) => {
    await navigateTo(page, "/settings/sessions");

    // Wait for loading to complete
    await page.waitForSelector(".stat-card", { state: "visible", timeout: 15000 });

    // Verify all 3 stat cards are present
    const statCards = page.locator(".stat-card");
    await expect(statCards).toHaveCount(3);

    // Verify stat card labels
    await expect(page.getByText("Active Sessions")).toBeVisible();
    await expect(page.getByText("Unique Devices")).toBeVisible();
    await expect(page.getByText("Unique Locations")).toBeVisible();

    // Verify "My Sessions" card is present
    await expect(page.getByText("My Sessions")).toBeVisible();
  });

  test("should show current session with 'This device' badge", async ({ page }) => {
    await navigateTo(page, "/settings/sessions");
    await page.waitForSelector(".stat-card", { state: "visible", timeout: 15000 });

    // The current session should be marked with "This device" badge (use .first() to avoid strict mode with multiple sessions)
    const thisDeviceBadge = page.getByText("This device").first();
    await expect(thisDeviceBadge).toBeVisible({ timeout: 10000 });

    // At minimum, the "This device" badge must be visible
    expect(await thisDeviceBadge.isVisible()).toBeTruthy();
  });

  test("should return session list from sessions API", async ({ page }) => {
    await ensureLoggedIn(page);
    await waitForPageReady(page);

    const { status, data } = await apiCall(page, "GET", "/api/auth/sessions");

    expect(status).toBe(200);
    expect(data).toBeTruthy();

    const result = data as { sessions: Array<{ id: string; device: string | null; ipAddress: string | null; lastActiveAt: string; createdAt: string }> };
    expect(Array.isArray(result.sessions)).toBeTruthy();
    expect(result.sessions.length).toBeGreaterThan(0);

    // Verify the session object structure
    const firstSession = result.sessions[0];
    expect(firstSession.id).toBeTruthy();
    expect(firstSession.lastActiveAt).toBeTruthy();
    expect(firstSession.createdAt).toBeTruthy();
  });
});
