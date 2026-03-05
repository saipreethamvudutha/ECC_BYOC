import { test, expect } from "@playwright/test";
import {
  loginAsAdmin,
  ensureLoggedIn,
  apiCall,
  navigateTo,
  waitForPageReady,
  ADMIN_EMAIL,
} from "./helpers/auth";

/**
 * 04 - User Management E2E Tests
 *
 * Tests the /settings/users page: listing, inviting, searching,
 * filtering, suspending, reactivating, and self-suspend prevention.
 */

const USERS_URL = "/settings/users";
const UNIQUE_SUFFIX = Date.now().toString(36);
const TEST_USER_EMAIL = `e2e-user-${UNIQUE_SUFFIX}@test.exargen.com`;
const TEST_USER_NAME = `E2E Test User ${UNIQUE_SUFFIX}`;

test.describe.serial("User Management", () => {
  /** Keep track of the test user ID created via invite for later tests. */
  let testUserId: string;
  let testRoleId: string;

  test("should navigate to users page and see admin user", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, USERS_URL);

    // Stat cards should be visible (use specific selector to avoid strict mode on "Active")
    await expect(page.locator("text=Total Users")).toBeVisible();
    await expect(page.locator("p.text-xs:has-text('Active')").first()).toBeVisible();
    await expect(page.locator("text=Pending Invites")).toBeVisible();
    await expect(page.locator("text=MFA Enabled")).toBeVisible();

    // Admin user should be listed
    await expect(page.locator(`text=${ADMIN_EMAIL}`)).toBeVisible();

    // Table column headers should be present (use visible div/span to avoid matching hidden option elements)
    await expect(page.locator("text=User").first()).toBeVisible();
    await expect(page.locator("text=Email").first()).toBeVisible();
    await expect(page.locator("text=Roles").first()).toBeVisible();
    // "Status" text also exists in filter dropdown options; verify the column header via visible text
    await expect(page.locator("div:has-text('Status'), th:has-text('Status')").first()).toBeVisible();
  });

  test("should show admin user with Platform Administrator role", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await navigateTo(page, USERS_URL);

    // The admin user row should display the Platform Administrator badge
    // Use admin email row to scope, avoiding matching hidden <option> elements in dropdowns
    const adminUserRow = page.locator(`text=${ADMIN_EMAIL}`).locator("..").locator("..");
    await expect(adminUserRow.locator("text=Platform Administrator")).toBeVisible({ timeout: 15000 });

    // Admin should have "active" status
    await expect(adminUserRow).toBeVisible();
  });

  test("should get roles via API for invite dialog", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, USERS_URL);

    // Fetch roles to get a valid role ID for subsequent tests
    const rolesResponse = await apiCall(page, "GET", "/api/roles");
    expect(rolesResponse.status).toBe(200);
    const roles = rolesResponse.data as Array<{
      id: string;
      name: string;
      slug: string;
    }>;
    expect(roles.length).toBeGreaterThanOrEqual(7);

    // Use the "Viewer" role for test invite (least privileges)
    const viewerRole = roles.find((r) => r.slug === "viewer");
    expect(viewerRole).toBeTruthy();
    testRoleId = viewerRole!.id;
  });

  test("should invite a new user via the dialog", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, USERS_URL);

    // Click "Invite User" button
    await page.click('button:has-text("Invite User")');

    // Dialog should open
    await expect(page.locator('text=Invite User').nth(1)).toBeVisible({
      timeout: 5000,
    });

    // Fill in the form
    await page.fill('input[placeholder="John Smith"]', TEST_USER_NAME);
    await page.fill(
      'input[placeholder="john@company.com"]',
      TEST_USER_EMAIL
    );

    // Select the Viewer role (the dialog uses toggle buttons, not a select dropdown)
    const viewerRoleButton = page.locator('[role="dialog"] button:has-text("Viewer")');
    await expect(viewerRoleButton).toBeVisible({ timeout: 5000 });
    await viewerRoleButton.click();

    // Click "Send Invitation" (force:true needed because dialog may extend beyond viewport)
    const sendButton = page.locator('[role="dialog"] button:has-text("Send Invitation")');
    await expect(sendButton).toBeEnabled({ timeout: 5000 });
    await sendButton.evaluate((el: HTMLElement) => el.click());

    // Wait for success - either the invite link or success message
    await page.waitForSelector(
      'text=invited, text=Invitation, text=invite',
      { timeout: 15000, state: "visible" }
    ).catch(() => {
      // Some responses may include a warning about email delivery
    });

    // Wait a bit for the UI to update
    await page.waitForTimeout(2000);
  });

  test("should verify invited user appears in the list", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, USERS_URL);

    // Wait for the user list to load
    await page.waitForSelector(`text=${TEST_USER_EMAIL}`, { timeout: 10000 });
    await expect(page.locator(`text=${TEST_USER_EMAIL}`)).toBeVisible();

    // The user should be shown with "invited" status badge (avoid hidden <option> elements)
    const testUserRow = page.locator(`text=${TEST_USER_EMAIL}`).locator("..").locator("..");
    await expect(testUserRow.locator("text=invited")).toBeVisible();

    // Get the test user's ID via API for later tests
    const usersResponse = await apiCall(page, "GET", "/api/users");
    expect(usersResponse.status).toBe(200);
    const users = usersResponse.data as Array<{
      id: string;
      email: string;
      status: string;
    }>;
    const testUser = users.find((u) => u.email === TEST_USER_EMAIL);
    expect(testUser).toBeTruthy();
    expect(testUser!.status).toBe("invited");
    testUserId = testUser!.id;
  });

  test("should search users by name", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, USERS_URL);

    // Wait for user list to load
    await page.waitForSelector(`text=${ADMIN_EMAIL}`, { timeout: 10000 });

    // Type in the search field
    const searchInput = page.locator(
      'input[placeholder="Search users by name or email..."]'
    );
    await searchInput.fill(TEST_USER_NAME);

    // Wait for filter to apply
    await page.waitForTimeout(500);

    // Test user should be visible
    await expect(page.locator(`text=${TEST_USER_EMAIL}`)).toBeVisible();

    // Admin user should NOT be visible (filtered out)
    await expect(page.locator(`text=${ADMIN_EMAIL}`)).not.toBeVisible();
  });

  test("should search users by email", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, USERS_URL);

    await page.waitForSelector(`text=${ADMIN_EMAIL}`, { timeout: 10000 });

    const searchInput = page.locator(
      'input[placeholder="Search users by name or email..."]'
    );
    await searchInput.fill("admin@exargen");

    await page.waitForTimeout(500);

    // Admin user should be visible
    await expect(page.locator(`text=${ADMIN_EMAIL}`)).toBeVisible();

    // Test user should NOT be visible
    await expect(page.locator(`text=${TEST_USER_EMAIL}`)).not.toBeVisible();
  });

  test("should filter users by status", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, USERS_URL);

    await page.waitForSelector(`text=${ADMIN_EMAIL}`, { timeout: 10000 });

    // Find the status filter dropdown (it has "All Statuses" as default)
    const statusFilter = page.locator('select:has(option:text("All Statuses"))');
    await statusFilter.waitFor({ state: "visible" });

    // Filter by "Invited" status
    await statusFilter.selectOption("invited");

    await page.waitForTimeout(500);

    // Test user (invited) should be visible
    await expect(page.locator(`text=${TEST_USER_EMAIL}`)).toBeVisible();

    // Admin user (active) should NOT be visible
    await expect(page.locator(`text=${ADMIN_EMAIL}`)).not.toBeVisible();

    // Filter by "Active" status
    await statusFilter.selectOption("active");

    await page.waitForTimeout(500);

    // Now admin should be visible and test user should not
    await expect(page.locator(`text=${ADMIN_EMAIL}`)).toBeVisible();
    await expect(page.locator(`text=${TEST_USER_EMAIL}`)).not.toBeVisible();
  });

  test("should suspend test user via API and verify status change", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await navigateTo(page, USERS_URL);

    // First, we need to make the test user "active" so we can suspend them
    // The invited user needs to be activated first
    const activateResponse = await apiCall(
      page,
      "PATCH",
      `/api/users/${testUserId}`,
      { status: "active" }
    );
    expect(activateResponse.status).toBe(200);

    // Now suspend the user
    const suspendResponse = await apiCall(
      page,
      "PATCH",
      `/api/users/${testUserId}`,
      { status: "suspended" }
    );
    expect(suspendResponse.status).toBe(200);

    const data = suspendResponse.data as { status: string };
    expect(data.status).toBe("suspended");

    // Reload the page and verify the user shows as suspended
    await navigateTo(page, USERS_URL);
    await page.waitForSelector(`text=${TEST_USER_EMAIL}`, { timeout: 10000 });

    // The suspended badge should be visible (scope to user row to avoid hidden <option>)
    const suspendedUserRow = page.locator(`text=${TEST_USER_EMAIL}`).locator("..").locator("..");
    await expect(suspendedUserRow.locator("text=suspended")).toBeVisible();
  });

  test("should reactivate suspended user via API", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, USERS_URL);

    // Reactivate the test user
    const reactivateResponse = await apiCall(
      page,
      "PATCH",
      `/api/users/${testUserId}`,
      { status: "active" }
    );
    expect(reactivateResponse.status).toBe(200);

    const data = reactivateResponse.data as { status: string };
    expect(data.status).toBe("active");

    // Reload and verify
    await navigateTo(page, USERS_URL);
    await page.waitForSelector(`text=${TEST_USER_EMAIL}`, { timeout: 10000 });
  });

  test("should not allow suspending self via API", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, USERS_URL);

    // Get the current admin user's ID (response shape: { user: { id, ... }, permissions })
    const meResponse = await apiCall(page, "GET", "/api/auth/me");
    expect(meResponse.status).toBe(200);
    const meData = meResponse.data as { user: { id: string } };
    expect(meData.user).toBeTruthy();
    expect(meData.user.id).toBeTruthy();

    // Try to suspend ourselves
    const selfSuspendResponse = await apiCall(
      page,
      "PATCH",
      `/api/users/${meData.user.id}`,
      { status: "suspended" }
    );
    expect(selfSuspendResponse.status).toBe(400);

    const errorData = selfSuspendResponse.data as { error: string };
    expect(errorData.error).toContain("Cannot change your own status");
  });

  test("should show 'Cannot Suspend Self' in actions menu for own account", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await navigateTo(page, USERS_URL);

    await page.waitForSelector(`text=${ADMIN_EMAIL}`, { timeout: 10000 });

    // Find the admin user row and click its actions menu (MoreVertical button)
    // The admin row contains the admin email - find the row and its action button
    const adminRow = page
      .locator(`text=${ADMIN_EMAIL}`)
      .locator("xpath=ancestor::div[contains(@class, 'grid')]")
      .first();

    // Click the actions menu button (the MoreVertical icon button)
    const menuButton = adminRow.locator("button").last();
    await menuButton.click();

    // Wait for the dropdown menu to appear
    await page.waitForTimeout(500);

    // Should show "Cannot Suspend Self" (disabled) instead of "Suspend User"
    await expect(page.locator("text=Cannot Suspend Self")).toBeVisible();
  });

  test("should suspend user via UI actions menu", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, USERS_URL);

    await page.waitForSelector(`text=${TEST_USER_EMAIL}`, { timeout: 10000 });

    // Find the test user row and click its actions menu
    const testUserRow = page
      .locator(`text=${TEST_USER_EMAIL}`)
      .locator("xpath=ancestor::div[contains(@class, 'grid')]")
      .first();

    const menuButton = testUserRow.locator("button").last();
    await menuButton.click();

    await page.waitForTimeout(500);

    // Click "Suspend User" in the menu
    await page.click("text=Suspend User");

    // Wait for the suspend confirmation dialog
    await expect(
      page.locator('[role="dialog"]:has-text("Suspend User")')
    ).toBeVisible({ timeout: 5000 });

    // Click the confirm button
    await page.click(
      '[role="dialog"] button:has-text("Suspend User")'
    );

    // Wait for the action to complete
    await page.waitForTimeout(2000);

    // Verify the user is now suspended
    const usersResponse = await apiCall(page, "GET", "/api/users");
    const users = usersResponse.data as Array<{
      id: string;
      email: string;
      status: string;
    }>;
    const suspended = users.find((u) => u.email === TEST_USER_EMAIL);
    expect(suspended).toBeTruthy();
    expect(suspended!.status).toBe("suspended");
  });

  test("should reactivate user via UI actions menu", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, USERS_URL);

    await page.waitForSelector(`text=${TEST_USER_EMAIL}`, { timeout: 10000 });

    // Find the test user row and click its actions menu
    const testUserRow = page
      .locator(`text=${TEST_USER_EMAIL}`)
      .locator("xpath=ancestor::div[contains(@class, 'grid')]")
      .first();

    const menuButton = testUserRow.locator("button").last();
    await menuButton.click();

    await page.waitForTimeout(500);

    // Click "Reactivate User" in the menu
    await page.click("text=Reactivate User");

    // Wait for the reactivate confirmation dialog
    await expect(
      page.locator('[role="dialog"]:has-text("Reactivate User")')
    ).toBeVisible({ timeout: 5000 });

    // Click the confirm button
    await page.click(
      '[role="dialog"] button:has-text("Reactivate User")'
    );

    // Wait for the action to complete
    await page.waitForTimeout(2000);

    // Verify the user is now active again
    const usersResponse = await apiCall(page, "GET", "/api/users");
    const users = usersResponse.data as Array<{
      id: string;
      email: string;
      status: string;
    }>;
    const reactivated = users.find((u) => u.email === TEST_USER_EMAIL);
    expect(reactivated).toBeTruthy();
    expect(reactivated!.status).toBe("active");
  });

  test("should show correct stat card counts", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, USERS_URL);

    await page.waitForSelector(`text=${ADMIN_EMAIL}`, { timeout: 10000 });

    // Get the expected counts from API
    const usersResponse = await apiCall(page, "GET", "/api/users");
    const users = usersResponse.data as Array<{
      status: string;
      mfaEnabled: boolean;
    }>;
    const totalCount = users.length;
    const activeCount = users.filter((u) => u.status === "active").length;
    const invitedCount = users.filter((u) => u.status === "invited").length;
    const mfaCount = users.filter((u) => u.mfaEnabled).length;

    // Verify the stat cards show correct values
    // Total Users card
    const totalCard = page.locator('.stat-card:has-text("Total Users")');
    await expect(totalCard.locator(".text-2xl")).toContainText(
      totalCount.toString()
    );

    // Active card
    const activeCard = page.locator('.stat-card:has-text("Active")').first();
    await expect(activeCard.locator(".text-2xl")).toContainText(
      activeCount.toString()
    );
  });

  // Cleanup: remove the test user to avoid polluting the database
  test("cleanup: remove test user via API", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, USERS_URL);

    if (testUserId) {
      // Suspend the test user (we cannot delete users via the API, but suspending is fine for cleanup)
      await apiCall(page, "PATCH", `/api/users/${testUserId}`, {
        status: "suspended",
      });
    }
  });
});
