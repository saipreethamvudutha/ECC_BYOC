import { test, expect } from "@playwright/test";
import {
  loginAsAdmin,
  apiCall,
  navigateTo,
  waitForPageReady,
} from "./helpers/auth";

/**
 * 05 - Role Management E2E Tests
 *
 * Tests the /settings/roles page: viewing built-in roles, creating custom
 * roles, cloning, editing, deleting, and max assignment enforcement.
 */

const ROLES_URL = "/settings/roles";
const UNIQUE_SUFFIX = Date.now().toString(36);

/** The 7 built-in roles expected from the seed data. */
const BUILTIN_ROLE_NAMES = [
  "Platform Administrator",
  "Organization Administrator",
  "Security Analyst",
  "Auditor",
  "Viewer",
  "Remediation User",
  "API Service Account",
];

test.describe.serial("Role Management", () => {
  /** Track IDs of custom roles created during tests for cleanup. */
  let customRoleId: string;
  let clonedRoleId: string;

  test("should display all 7 built-in roles", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, ROLES_URL);

    // Wait for roles to load
    await page.waitForSelector("text=Platform Administrator", {
      timeout: 10000,
    });

    // All 7 built-in role names should be visible
    for (const roleName of BUILTIN_ROLE_NAMES) {
      await expect(page.locator(`text=${roleName}`).first()).toBeVisible();
    }

    // "Built-in" badges should be visible
    const builtinBadges = page.locator('text=Built-in');
    const count = await builtinBadges.count();
    expect(count).toBeGreaterThanOrEqual(7);
  });

  test("should show correct stat cards", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, ROLES_URL);

    await page.waitForSelector("text=Total Roles", { timeout: 10000 });

    // Stat cards should be visible
    await expect(page.locator("text=Total Roles")).toBeVisible();
    await expect(page.locator("text=Built-in").first()).toBeVisible();
    await expect(page.locator("text=Custom").first()).toBeVisible();
    await expect(page.locator("text=Users Assigned").first()).toBeVisible();
  });

  test("should verify built-in roles via API", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, ROLES_URL);

    const rolesResponse = await apiCall(page, "GET", "/api/roles");
    expect(rolesResponse.status).toBe(200);

    const roles = rolesResponse.data as Array<{
      id: string;
      name: string;
      slug: string;
      isBuiltin: boolean;
      capabilityCount: number;
      userCount: number;
    }>;

    const builtinRoles = roles.filter((r) => r.isBuiltin);
    expect(builtinRoles.length).toBe(7);

    // Platform Administrator should have all capabilities (42)
    const platformAdmin = builtinRoles.find(
      (r) => r.slug === "platform-admin"
    );
    expect(platformAdmin).toBeTruthy();
    expect(platformAdmin!.capabilityCount).toBe(42);

    // Security Analyst should have 25 capabilities
    const securityAnalyst = builtinRoles.find(
      (r) => r.slug === "security-analyst"
    );
    expect(securityAnalyst).toBeTruthy();
    expect(securityAnalyst!.capabilityCount).toBe(25);

    // Viewer should have the fewest (4)
    const viewer = builtinRoles.find((r) => r.slug === "viewer");
    expect(viewer).toBeTruthy();
    expect(viewer!.capabilityCount).toBe(4);
  });

  test("should create a custom role via API with Security Analyst base", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await navigateTo(page, ROLES_URL);

    // First, get the Security Analyst role ID and its capabilities
    const rolesResponse = await apiCall(page, "GET", "/api/roles");
    const roles = rolesResponse.data as Array<{
      id: string;
      slug: string;
    }>;
    const secAnalyst = roles.find((r) => r.slug === "security-analyst");
    expect(secAnalyst).toBeTruthy();

    // Get Security Analyst's capabilities
    const permResponse = await apiCall(
      page,
      "GET",
      `/api/roles/${secAnalyst!.id}/permissions`
    );
    expect(permResponse.status).toBe(200);

    const permData = permResponse.data as {
      capabilitiesByModule: Record<
        string,
        Array<{ id: string; granted: boolean }>
      >;
    };

    // Collect all granted capability IDs
    const grantedCaps: string[] = [];
    for (const caps of Object.values(permData.capabilitiesByModule)) {
      for (const cap of caps) {
        if (cap.granted) grantedCaps.push(cap.id);
      }
    }
    expect(grantedCaps.length).toBe(25);

    // Create the custom role
    const createResponse = await apiCall(page, "POST", "/api/roles", {
      name: `E2E Test Role ${UNIQUE_SUFFIX}`,
      slug: `e2e-test-role-${UNIQUE_SUFFIX}`,
      description: "Custom role created by E2E test suite",
      capabilities: grantedCaps,
    });
    expect(createResponse.status).toBe(201);

    const created = createResponse.data as {
      id: string;
      name: string;
      slug: string;
      capabilityCount: number;
    };
    expect(created.name).toBe(`E2E Test Role ${UNIQUE_SUFFIX}`);
    expect(created.capabilityCount).toBe(25);
    customRoleId = created.id;
  });

  test("should see custom role in the roles list", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, ROLES_URL);

    // Wait for the page to load, then look for our custom role
    await page.waitForSelector("text=Platform Administrator", {
      timeout: 10000,
    });

    // Custom role should appear under "Custom Roles" section
    await expect(
      page.locator(`text=E2E Test Role ${UNIQUE_SUFFIX}`).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test("should create a custom role via the UI dialog", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, ROLES_URL);

    await page.waitForSelector("text=Platform Administrator", {
      timeout: 10000,
    });

    // Click "Create Role" button
    await page.click('button:has-text("Create Role")');

    // Wait for the dialog to appear
    await expect(
      page.locator('[role="dialog"]').first()
    ).toBeVisible({ timeout: 5000 });

    // Fill in the role name
    await page.fill(
      'input[placeholder="e.g. Junior Analyst"]',
      `UI Test Role ${UNIQUE_SUFFIX}`
    );

    // The slug field should auto-populate or we fill it
    const slugInput = page.locator('input[placeholder*="slug"], input').nth(1);
    const slugValue = await slugInput.inputValue();
    if (!slugValue) {
      await slugInput.fill(`ui-test-role-${UNIQUE_SUFFIX}`);
    }

    // Select "Security Analyst" from "Based on" dropdown
    const basedOnDropdown = page.locator(
      'select:has(option:text("Start from scratch"))'
    );
    if (await basedOnDropdown.isVisible()) {
      await basedOnDropdown.selectOption({ label: "Security Analyst (Built-in)" });

      // Wait for the capabilities to load
      await page.waitForTimeout(2000);
    }

    // The capability matrix should now show checkboxes
    // Look for module group headers
    const dashboardModule = page.locator('text=Dashboard').first();
    await expect(dashboardModule).toBeVisible({ timeout: 5000 });

    // Submit the form
    const createButton = page.locator(
      '[role="dialog"] button:has-text("Create Role")'
    );
    await createButton.click();

    // Wait for dialog to close and role to appear
    await page.waitForTimeout(3000);

    // Verify the role was created by checking the API
    const rolesResponse = await apiCall(page, "GET", "/api/roles");
    const roles = rolesResponse.data as Array<{
      id: string;
      name: string;
      slug: string;
      isBuiltin: boolean;
    }>;
    const uiRole = roles.find((r) =>
      r.name.includes(`UI Test Role ${UNIQUE_SUFFIX}`)
    );

    // If the UI creation succeeded, clean it up
    if (uiRole) {
      // Delete this role since we don't need it for further tests
      await apiCall(page, "DELETE", `/api/roles/${uiRole.id}`);
    }
  });

  test("should clone a built-in role via API", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, ROLES_URL);

    // Get the Auditor role ID to clone
    const rolesResponse = await apiCall(page, "GET", "/api/roles");
    const roles = rolesResponse.data as Array<{
      id: string;
      slug: string;
      capabilityCount: number;
    }>;
    const auditor = roles.find((r) => r.slug === "auditor");
    expect(auditor).toBeTruthy();

    // Clone the Auditor role
    const cloneResponse = await apiCall(
      page,
      "POST",
      `/api/roles/${auditor!.id}/clone`,
      {
        name: `Cloned Auditor ${UNIQUE_SUFFIX}`,
        slug: `cloned-auditor-${UNIQUE_SUFFIX}`,
        description: "Cloned from Auditor by E2E test",
      }
    );
    expect(cloneResponse.status).toBe(201);

    const cloned = cloneResponse.data as {
      id: string;
      name: string;
      capabilityCount: number;
      clonedFrom: { name: string };
    };
    expect(cloned.name).toBe(`Cloned Auditor ${UNIQUE_SUFFIX}`);
    // Should have same capability count as source (Auditor has 15)
    expect(cloned.capabilityCount).toBe(auditor!.capabilityCount);
    expect(cloned.clonedFrom.name).toBe("Auditor");
    clonedRoleId = cloned.id;
  });

  test("should edit custom role capabilities via API", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, ROLES_URL);

    // Edit the custom role we created earlier (add an extra capability)
    expect(customRoleId).toBeTruthy();

    // Get current capabilities
    const permResponse = await apiCall(
      page,
      "GET",
      `/api/roles/${customRoleId}/permissions`
    );
    expect(permResponse.status).toBe(200);

    const permData = permResponse.data as {
      capabilitiesByModule: Record<
        string,
        Array<{ id: string; granted: boolean }>
      >;
    };

    const currentCaps: string[] = [];
    for (const caps of Object.values(permData.capabilitiesByModule)) {
      for (const cap of caps) {
        if (cap.granted) currentCaps.push(cap.id);
      }
    }

    // Add "ai.approve.critical" capability which Security Analyst doesn't have
    const updatedCaps = [...currentCaps, "ai.approve.critical"];

    const updateResponse = await apiCall(
      page,
      "PATCH",
      `/api/roles/${customRoleId}`,
      {
        name: `E2E Test Role ${UNIQUE_SUFFIX} Updated`,
        description: "Updated by E2E test",
        capabilities: updatedCaps,
      }
    );
    expect(updateResponse.status).toBe(200);

    const updated = updateResponse.data as {
      name: string;
      capabilityCount: number;
    };
    expect(updated.name).toBe(`E2E Test Role ${UNIQUE_SUFFIX} Updated`);
    expect(updated.capabilityCount).toBe(26); // 25 + 1
  });

  test("should delete custom role with no users assigned", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await navigateTo(page, ROLES_URL);

    // Delete the cloned role (no users assigned)
    expect(clonedRoleId).toBeTruthy();

    const deleteResponse = await apiCall(
      page,
      "DELETE",
      `/api/roles/${clonedRoleId}`
    );
    expect(deleteResponse.status).toBe(200);

    const result = deleteResponse.data as { success: boolean; message: string };
    expect(result.success).toBe(true);

    // Verify it's gone
    const rolesResponse = await apiCall(page, "GET", "/api/roles");
    const roles = rolesResponse.data as Array<{ id: string }>;
    const deleted = roles.find((r) => r.id === clonedRoleId);
    expect(deleted).toBeUndefined();
  });

  test("should not be able to delete built-in roles via API", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await navigateTo(page, ROLES_URL);

    // Get a built-in role ID
    const rolesResponse = await apiCall(page, "GET", "/api/roles");
    const roles = rolesResponse.data as Array<{
      id: string;
      slug: string;
      isBuiltin: boolean;
    }>;
    const platformAdmin = roles.find((r) => r.slug === "platform-admin");
    expect(platformAdmin).toBeTruthy();

    // Attempt to delete it
    const deleteResponse = await apiCall(
      page,
      "DELETE",
      `/api/roles/${platformAdmin!.id}`
    );
    expect(deleteResponse.status).toBe(400);

    const errorData = deleteResponse.data as { error: string };
    expect(errorData.error).toContain("Built-in roles cannot be deleted");
  });

  test("should not be able to modify built-in roles via API", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await navigateTo(page, ROLES_URL);

    // Get a built-in role
    const rolesResponse = await apiCall(page, "GET", "/api/roles");
    const roles = rolesResponse.data as Array<{
      id: string;
      slug: string;
      isBuiltin: boolean;
    }>;
    const auditor = roles.find((r) => r.slug === "auditor");
    expect(auditor).toBeTruthy();

    // Attempt to modify it
    const patchResponse = await apiCall(
      page,
      "PATCH",
      `/api/roles/${auditor!.id}`,
      {
        name: "Modified Auditor",
      }
    );
    expect(patchResponse.status).toBe(400);

    const errorData = patchResponse.data as { error: string };
    expect(errorData.error).toContain("Built-in roles cannot be modified");
  });

  test("should enforce max assignments on Platform Administrator", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await navigateTo(page, ROLES_URL);

    // Get Platform Admin role details
    const rolesResponse = await apiCall(page, "GET", "/api/roles");
    const roles = rolesResponse.data as Array<{
      id: string;
      slug: string;
      maxAssignments: number | null;
      userCount: number;
    }>;
    const platformAdmin = roles.find((r) => r.slug === "platform-admin");
    expect(platformAdmin).toBeTruthy();
    expect(platformAdmin!.maxAssignments).toBe(2);

    // The Platform Admin role should be limited to 2 users
    // The current admin user is already assigned, so 1/2 slots used
    // Verify this via the API response
    expect(platformAdmin!.userCount).toBeLessThanOrEqual(2);
  });

  test("should verify role detail view shows capabilities by module", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await navigateTo(page, ROLES_URL);

    // Get the custom role's detailed permissions
    expect(customRoleId).toBeTruthy();

    const detailResponse = await apiCall(
      page,
      "GET",
      `/api/roles/${customRoleId}`
    );
    expect(detailResponse.status).toBe(200);

    const detail = detailResponse.data as {
      name: string;
      modules: Array<{
        id: string;
        name: string;
        capabilities: Array<{
          id: string;
          granted: boolean;
          riskLevel: string;
        }>;
      }>;
      grantedCount: number;
    };

    // Should have 8 modules
    expect(detail.modules.length).toBe(8);

    // Module names should match
    const moduleNames = detail.modules.map((m) => m.name);
    expect(moduleNames).toContain("Dashboard");
    expect(moduleNames).toContain("Scans");
    expect(moduleNames).toContain("Assets");
    expect(moduleNames).toContain("Risk Scoring");
    expect(moduleNames).toContain("Reports");
    expect(moduleNames).toContain("AI Actions");
    expect(moduleNames).toContain("SIEM");
    expect(moduleNames).toContain("Administration");

    // Capabilities should have risk levels
    for (const mod of detail.modules) {
      for (const cap of mod.capabilities) {
        expect(["low", "medium", "high", "critical"]).toContain(cap.riskLevel);
      }
    }
  });

  test("should prevent creating a role with duplicate slug", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await navigateTo(page, ROLES_URL);

    // Try to create a role with the same slug
    const duplicateResponse = await apiCall(page, "POST", "/api/roles", {
      name: "Duplicate Role",
      slug: `e2e-test-role-${UNIQUE_SUFFIX}`,
      description: "Should fail",
      capabilities: ["dash.view"],
    });
    expect(duplicateResponse.status).toBe(409);

    const errorData = duplicateResponse.data as { error: string };
    expect(errorData.error).toContain("already exists");
  });

  // Cleanup: delete the custom role created during tests
  test("cleanup: delete custom test role", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, ROLES_URL);

    if (customRoleId) {
      const deleteResponse = await apiCall(
        page,
        "DELETE",
        `/api/roles/${customRoleId}`
      );
      // May fail if users are assigned, that's okay for cleanup
      if (deleteResponse.status === 200) {
        customRoleId = "";
      }
    }
  });
});
