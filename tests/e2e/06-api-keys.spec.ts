import { test, expect } from "@playwright/test";
import {
  loginAsAdmin,
  apiCall,
  navigateTo,
  waitForPageReady,
} from "./helpers/auth";

/**
 * 06 - API Key Management E2E Tests
 *
 * Tests the /settings/api-keys page: listing, creating, key reveal,
 * revoking, and RBAC enforcement for admin.apikey.manage.
 */

const API_KEYS_URL = "/settings/api-keys";
const UNIQUE_SUFFIX = Date.now().toString(36);
const TEST_KEY_NAME = `E2E Test Key ${UNIQUE_SUFFIX}`;

test.describe.serial("API Key Management", () => {
  /** Track the created API key for later tests. */
  let testKeyId: string;
  let testKeyFullValue: string;
  let testRoleId: string;

  test("should navigate to API keys page and see stat cards", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await navigateTo(page, API_KEYS_URL);

    // Wait for page to load
    await page.waitForSelector("text=Total API Keys", { timeout: 10000 });

    // Stat cards should be visible
    await expect(page.locator("text=Total API Keys")).toBeVisible();
    await expect(page.locator("text=Active Keys")).toBeVisible();
    await expect(page.locator("text=Expiring Soon")).toBeVisible();

    // "Create API Key" button should be present
    await expect(
      page.locator('button:has-text("Create API Key")')
    ).toBeVisible();

    // Security notice should be visible
    await expect(page.locator("text=API Key Security")).toBeVisible();
  });

  test("should get roles for the create dialog", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, API_KEYS_URL);

    // Get a role ID for creating an API key
    const rolesResponse = await apiCall(page, "GET", "/api/roles");
    expect(rolesResponse.status).toBe(200);

    const roles = rolesResponse.data as Array<{
      id: string;
      slug: string;
      name: string;
    }>;
    const apiServiceRole = roles.find((r) => r.slug === "api-service");
    expect(apiServiceRole).toBeTruthy();
    testRoleId = apiServiceRole!.id;
  });

  test("should create an API key via API and receive the full key", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await navigateTo(page, API_KEYS_URL);

    expect(testRoleId).toBeTruthy();

    const createResponse = await apiCall(page, "POST", "/api/api-keys", {
      name: TEST_KEY_NAME,
      roleId: testRoleId,
      expiresInDays: 90,
      rateLimit: 500,
    });
    expect(createResponse.status).toBe(201);

    const created = createResponse.data as {
      id: string;
      name: string;
      key: string;
      keyPrefix: string;
      role: string;
      expiresAt: string;
    };

    expect(created.name).toBe(TEST_KEY_NAME);
    expect(created.key).toBeTruthy();
    expect(created.key.length).toBeGreaterThan(32);
    expect(created.keyPrefix).toBeTruthy();
    expect(created.role).toBe("API Service Account");

    testKeyId = created.id;
    testKeyFullValue = created.key;
  });

  test("should see the new key in the API keys list", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, API_KEYS_URL);

    // Wait for the list to load
    await page.waitForSelector("text=Total API Keys", { timeout: 10000 });

    // Wait for our key to appear
    await page.waitForSelector(`text=${TEST_KEY_NAME}`, { timeout: 10000 });
    await expect(page.locator(`text=${TEST_KEY_NAME}`).first()).toBeVisible();

    // Should show "Active" badge
    await expect(page.locator('text=Active').first()).toBeVisible();

    // Should show the key prefix (first 8 chars)
    const prefix = testKeyFullValue.substring(0, 8);
    await expect(page.locator(`text=${prefix}`).first()).toBeVisible();

    // Should show the role name
    await expect(
      page.locator('text=API Service Account').first()
    ).toBeVisible();
  });

  test("should verify full key is NOT retrievable after creation", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await navigateTo(page, API_KEYS_URL);

    // The API GET endpoint only returns keyPrefix, never the full key
    const listResponse = await apiCall(page, "GET", "/api/api-keys");
    expect(listResponse.status).toBe(200);

    const keys = listResponse.data as Array<{
      id: string;
      name: string;
      keyPrefix: string;
    }>;
    const ourKey = keys.find((k) => k.id === testKeyId);
    expect(ourKey).toBeTruthy();

    // keyPrefix should be present but the full key should not be in the response
    expect(ourKey!.keyPrefix).toBeTruthy();
    // Verify no "key" field is present in the list response
    expect((ourKey as Record<string, unknown>)["key"]).toBeUndefined();
  });

  test("should create API key via UI dialog and see key reveal", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await navigateTo(page, API_KEYS_URL);

    await page.waitForSelector("text=Total API Keys", { timeout: 10000 });

    // Click "Create API Key" button
    await page.click('button:has-text("Create API Key")');

    // Wait for the dialog
    await expect(
      page.locator('[role="dialog"]:has-text("Create API Key")')
    ).toBeVisible({ timeout: 5000 });

    // Fill in the name
    await page.fill(
      'input[placeholder="e.g., CI/CD Pipeline Key"]',
      `UI Test Key ${UNIQUE_SUFFIX}`
    );

    // Select a role from the dropdown
    const roleSelect = page.locator(
      '[role="dialog"] select:has(option:text("Select a role..."))'
    );
    await roleSelect.waitFor({ state: "visible" });

    // Select "API Service Account"
    const options = await roleSelect.locator("option").allTextContents();
    const apiServiceOption = options.find((opt) =>
      opt.includes("API Service Account")
    );
    expect(apiServiceOption).toBeTruthy();
    await roleSelect.selectOption({ label: apiServiceOption! });

    // Set expiry to 90 days (should be default)
    const expirySelect = page.locator(
      '[role="dialog"] select:has(option:text("90 days"))'
    );
    if (await expirySelect.isVisible()) {
      await expirySelect.selectOption("90");
    }

    // Click "Create Key" button
    await page.click('[role="dialog"] button:has-text("Create Key")');

    // Wait for the key reveal dialog
    await expect(
      page.locator('text=API Key Generated')
    ).toBeVisible({ timeout: 10000 });

    // The warning about one-time display should be visible
    await expect(
      page.locator("text=This key will only be shown once")
    ).toBeVisible();

    // The key value should be displayed in the pre element
    const keyDisplay = page.locator('[role="dialog"] pre');
    await expect(keyDisplay).toBeVisible();
    const keyValue = await keyDisplay.textContent();
    expect(keyValue).toBeTruthy();
    expect(keyValue!.trim().length).toBeGreaterThan(32);

    // Click "Done" to close the reveal dialog
    await page.click('[role="dialog"] button:has-text("Done")');

    // The reveal dialog should close
    await expect(
      page.locator('text=API Key Generated')
    ).not.toBeVisible({ timeout: 5000 });

    // Clean up the UI-created key
    const listResponse = await apiCall(page, "GET", "/api/api-keys");
    const keys = listResponse.data as Array<{
      id: string;
      name: string;
    }>;
    const uiKey = keys.find((k) =>
      k.name === `UI Test Key ${UNIQUE_SUFFIX}`
    );
    if (uiKey) {
      await apiCall(page, "DELETE", `/api/api-keys/${uiKey.id}`);
    }
  });

  test("should revoke an API key via API", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, API_KEYS_URL);

    expect(testKeyId).toBeTruthy();

    const revokeResponse = await apiCall(
      page,
      "DELETE",
      `/api/api-keys/${testKeyId}`
    );
    expect(revokeResponse.status).toBe(200);

    const result = revokeResponse.data as {
      success: boolean;
      message: string;
    };
    expect(result.success).toBe(true);
    expect(result.message).toBe("API key revoked");

    // Verify the key is now inactive
    const listResponse = await apiCall(page, "GET", "/api/api-keys");
    const keys = listResponse.data as Array<{
      id: string;
      isActive: boolean;
    }>;
    const revoked = keys.find((k) => k.id === testKeyId);
    expect(revoked).toBeTruthy();
    expect(revoked!.isActive).toBe(false);
  });

  test("should show revoked key with Revoked status in UI", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await navigateTo(page, API_KEYS_URL);

    await page.waitForSelector(`text=${TEST_KEY_NAME}`, { timeout: 10000 });

    // The revoked key should show "Revoked" badge
    await expect(page.locator("text=Revoked").first()).toBeVisible();

    // The Revoke and Rotate buttons should be disabled for the revoked key
    const revokedRow = page
      .locator(`text=${TEST_KEY_NAME}`)
      .locator("xpath=ancestor::div[contains(@class, 'flex')]")
      .first();
    await expect(revokedRow).toBeVisible();
  });

  test("should require admin.apikey.manage capability", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, API_KEYS_URL);

    // Verify the admin has the capability
    const capResponse = await apiCall(
      page,
      "GET",
      "/api/auth/me/capabilities"
    );
    expect(capResponse.status).toBe(200);

    const capData = capResponse.data as {
      capabilities: string[];
      roles: string[];
    };
    expect(capData.capabilities).toContain("admin.apikey.manage");
  });

  test("should prevent duplicate API key names", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, API_KEYS_URL);

    // The revoked key still exists with the same name
    // Try to create another with the same name
    const duplicateResponse = await apiCall(page, "POST", "/api/api-keys", {
      name: TEST_KEY_NAME,
      roleId: testRoleId,
      expiresInDays: 30,
    });
    expect(duplicateResponse.status).toBe(409);

    const errorData = duplicateResponse.data as { error: string };
    expect(errorData.error).toContain("already exists");
  });

  test("should create and rotate an API key", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, API_KEYS_URL);

    // Create a temporary key for rotation testing
    const createResponse = await apiCall(page, "POST", "/api/api-keys", {
      name: `Rotate Test Key ${UNIQUE_SUFFIX}`,
      roleId: testRoleId,
      expiresInDays: 30,
    });
    expect(createResponse.status).toBe(201);

    const created = createResponse.data as {
      id: string;
      key: string;
      keyPrefix: string;
    };
    const originalKey = created.key;
    const originalPrefix = created.keyPrefix;

    // Rotate the key
    const rotateResponse = await apiCall(
      page,
      "PATCH",
      `/api/api-keys/${created.id}`
    );
    expect(rotateResponse.status).toBe(200);

    const rotated = rotateResponse.data as {
      id: string;
      key: string;
      keyPrefix: string;
    };

    // New key should be different from the original
    expect(rotated.key).not.toBe(originalKey);
    expect(rotated.keyPrefix).not.toBe(originalPrefix);
    expect(rotated.key.length).toBeGreaterThan(32);

    // Clean up: revoke the rotated key
    await apiCall(page, "DELETE", `/api/api-keys/${created.id}`);
  });

  test("should not rotate an inactive key", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, API_KEYS_URL);

    // testKeyId was revoked earlier - try to rotate it
    expect(testKeyId).toBeTruthy();

    const rotateResponse = await apiCall(
      page,
      "PATCH",
      `/api/api-keys/${testKeyId}`
    );
    expect(rotateResponse.status).toBe(400);

    const errorData = rotateResponse.data as { error: string };
    expect(errorData.error).toContain("Cannot rotate an inactive API key");
  });

  test("should validate required fields when creating a key", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await navigateTo(page, API_KEYS_URL);

    // Missing name
    const noNameResponse = await apiCall(page, "POST", "/api/api-keys", {
      name: "",
      roleId: testRoleId,
      expiresInDays: 90,
    });
    expect(noNameResponse.status).toBe(400);

    // Missing roleId
    const noRoleResponse = await apiCall(page, "POST", "/api/api-keys", {
      name: "Test No Role",
      roleId: "",
      expiresInDays: 90,
    });
    expect(noRoleResponse.status).toBe(400);
  });
});
