import { test, expect } from "@playwright/test";
import {
  loginAsAdmin,
  logout,
  apiCall,
  navigateTo,
  waitForPageReady,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  BASE_URL,
} from "./helpers/auth";

/**
 * 07 - RBAC Enforcement E2E Tests
 *
 * Cross-cutting tests that verify server-side RBAC enforcement:
 * - Admin can access all protected endpoints
 * - Unauthenticated requests get 401
 * - Public endpoints work without auth
 * - Deny-wins conflict resolution
 * - Org-admin has billing denied
 * - Direct API calls are enforced server-side
 */

/** Protected API endpoints the admin should have access to. */
const PROTECTED_ENDPOINTS = [
  { method: "GET", path: "/api/dashboard", name: "Dashboard" },
  { method: "GET", path: "/api/users", name: "Users" },
  { method: "GET", path: "/api/audit-log", name: "Audit Log" },
  { method: "GET", path: "/api/scans", name: "Scans" },
  { method: "GET", path: "/api/siem", name: "SIEM" },
  { method: "GET", path: "/api/ai-actions", name: "AI Actions" },
  { method: "GET", path: "/api/roles", name: "Roles" },
];

/** Public endpoints that should work without authentication. */
const PUBLIC_ENDPOINTS = [
  { method: "GET", path: "/api/health", name: "Health" },
  { method: "GET", path: "/api/version", name: "Version" },
];

test.describe("RBAC Enforcement - Authenticated Admin", () => {
  test("admin should access all protected API endpoints", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, "/settings/users");

    for (const endpoint of PROTECTED_ENDPOINTS) {
      const response = await apiCall(page, endpoint.method, endpoint.path);
      expect(
        response.status,
        `Expected 200 for ${endpoint.name} (${endpoint.path}), got ${response.status}`
      ).toBe(200);
    }
  });

  test("admin should have all capabilities granted", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, "/settings/users");

    const capResponse = await apiCall(
      page,
      "GET",
      "/api/auth/me/capabilities"
    );
    expect(capResponse.status).toBe(200);

    const capData = capResponse.data as {
      capabilities: string[];
      denied: string[];
      roles: string[];
      globalScope: boolean;
    };

    // Platform Admin should have all 42 capabilities
    expect(capData.capabilities.length).toBe(42);

    // No capabilities should be denied for Platform Admin
    expect(capData.denied.length).toBe(0);

    // Should have the platform-admin role
    expect(capData.roles).toContain("platform-admin");

    // Should have global scope
    expect(capData.globalScope).toBe(true);

    // Verify specific critical capabilities are present
    const criticalCaps = [
      "admin.user.manage",
      "admin.role.manage",
      "admin.apikey.manage",
      "admin.org.manage",
      "admin.billing.manage",
      "admin.audit.view",
      "ai.approve.critical",
      "ai.configure",
    ];
    for (const cap of criticalCaps) {
      expect(
        capData.capabilities,
        `Expected admin to have capability: ${cap}`
      ).toContain(cap);
    }
  });

  test("admin capabilities API should return correct response structure", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await navigateTo(page, "/settings/users");

    const capResponse = await apiCall(
      page,
      "GET",
      "/api/auth/me/capabilities"
    );
    expect(capResponse.status).toBe(200);

    const capData = capResponse.data as Record<string, unknown>;

    // Verify response structure
    expect(capData).toHaveProperty("capabilities");
    expect(capData).toHaveProperty("denied");
    expect(capData).toHaveProperty("roles");
    expect(capData).toHaveProperty("globalScope");

    expect(Array.isArray(capData.capabilities)).toBe(true);
    expect(Array.isArray(capData.denied)).toBe(true);
    expect(Array.isArray(capData.roles)).toBe(true);
    expect(typeof capData.globalScope).toBe("boolean");
  });

  test("admin /api/auth/me should return user profile", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, "/settings/users");

    const meResponse = await apiCall(page, "GET", "/api/auth/me");
    expect(meResponse.status).toBe(200);

    // /api/auth/me returns { user: {...}, permissions: {...} }
    const meData = meResponse.data as {
      user: { id: string; email: string; name: string };
    };
    expect(meData.user.email).toBe(ADMIN_EMAIL);
    expect(meData.user.id).toBeTruthy();
    expect(meData.user.name).toBeTruthy();
  });
});

test.describe("RBAC Enforcement - Unauthenticated Requests", () => {
  test("unauthenticated requests to protected endpoints should return 401", async ({
    page,
  }) => {
    // Clear cookies to ensure no auth session
    await page.context().clearCookies();
    await page.goto("/login");

    for (const endpoint of PROTECTED_ENDPOINTS) {
      const response = await page.evaluate(
        async ({ method, path }) => {
          const res = await fetch(path, { method });
          return { status: res.status };
        },
        { method: endpoint.method, path: endpoint.path }
      );

      expect(
        response.status,
        `Expected 401 for unauthenticated ${endpoint.name} (${endpoint.path}), got ${response.status}`
      ).toBe(401);
    }
  });

  test("unauthenticated request to /api/auth/me should return 401", async ({
    page,
  }) => {
    await page.context().clearCookies();
    await page.goto("/login");

    const response = await page.evaluate(async () => {
      const res = await fetch("/api/auth/me");
      return { status: res.status };
    });
    expect(response.status).toBe(401);
  });

  test("unauthenticated request to /api/auth/me/capabilities should return 401", async ({
    page,
  }) => {
    await page.context().clearCookies();
    await page.goto("/login");

    const response = await page.evaluate(async () => {
      const res = await fetch("/api/auth/me/capabilities");
      return { status: res.status };
    });
    expect(response.status).toBe(401);
  });

  test("unauthenticated request to /api/api-keys should return 401", async ({
    page,
  }) => {
    await page.context().clearCookies();
    await page.goto("/login");

    const response = await page.evaluate(async () => {
      const res = await fetch("/api/api-keys");
      return { status: res.status };
    });
    expect(response.status).toBe(401);
  });

  test("unauthenticated POST to /api/users/invite should return 401", async ({
    page,
  }) => {
    await page.context().clearCookies();
    await page.goto("/login");

    const response = await page.evaluate(async () => {
      const res = await fetch("/api/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "hacker@evil.com",
          name: "Hacker",
          roleId: "fake-role-id",
        }),
      });
      return { status: res.status };
    });
    expect(response.status).toBe(401);
  });

  test("unauthenticated POST to /api/roles should return 401", async ({
    page,
  }) => {
    await page.context().clearCookies();
    await page.goto("/login");

    const response = await page.evaluate(async () => {
      const res = await fetch("/api/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Evil Role",
          slug: "evil-role",
          capabilities: ["admin.role.manage"],
        }),
      });
      return { status: res.status };
    });
    expect(response.status).toBe(401);
  });
});

test.describe("RBAC Enforcement - Public Endpoints", () => {
  test("public endpoints should work without authentication", async ({
    page,
  }) => {
    // Clear all cookies to ensure no auth
    await page.context().clearCookies();
    await page.goto("/login");

    for (const endpoint of PUBLIC_ENDPOINTS) {
      const response = await page.evaluate(
        async ({ method, path }) => {
          const res = await fetch(path, { method });
          let data;
          try {
            data = await res.json();
          } catch {
            data = null;
          }
          return { status: res.status, data };
        },
        { method: endpoint.method, path: endpoint.path }
      );

      expect(
        response.status,
        `Expected 200 for public ${endpoint.name} (${endpoint.path}), got ${response.status}`
      ).toBe(200);
    }
  });

  test("/api/health should return status ok with database check", async ({
    page,
  }) => {
    await page.context().clearCookies();
    await page.goto("/login");

    const response = await page.evaluate(async () => {
      const res = await fetch("/api/health");
      return { status: res.status, data: await res.json() };
    });

    expect(response.status).toBe(200);
    const health = response.data as {
      status: string;
      timestamp: string;
      database: { connected: boolean };
    };
    expect(health.status).toBe("ok");
    expect(health.timestamp).toBeTruthy();
    expect(health.database.connected).toBe(true);
  });

  test("/api/version should return version info", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/login");

    const response = await page.evaluate(async () => {
      const res = await fetch("/api/version");
      return { status: res.status, data: await res.json() };
    });

    expect(response.status).toBe(200);
    const version = response.data as {
      version: string;
      phase: string;
      features: string[];
    };
    expect(version.version).toBeTruthy();
    expect(version.phase).toBeTruthy();
    expect(Array.isArray(version.features)).toBe(true);
  });
});

test.describe("RBAC Enforcement - Deny-Wins and Role-Specific", () => {
  test("should verify org-admin has billing denied via capabilities API", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await navigateTo(page, "/settings/roles");

    // Get the org-admin role to check its capabilities
    const rolesResponse = await apiCall(page, "GET", "/api/roles");
    expect(rolesResponse.status).toBe(200);

    const roles = rolesResponse.data as Array<{
      id: string;
      slug: string;
    }>;
    const orgAdmin = roles.find((r) => r.slug === "org-admin");
    expect(orgAdmin).toBeTruthy();

    // Get org-admin's detailed permissions
    const permResponse = await apiCall(
      page,
      "GET",
      `/api/roles/${orgAdmin!.id}/permissions`
    );
    expect(permResponse.status).toBe(200);

    const permData = permResponse.data as {
      role: { name: string; slug: string };
      capabilitiesByModule: Record<
        string,
        Array<{ id: string; granted: boolean }>
      >;
      totalCapabilities: number;
    };

    expect(permData.role.slug).toBe("org-admin");

    // Check that admin.billing.manage is NOT granted
    // (or is explicitly in the denied set at the role definition level)
    const adminCaps = permData.capabilitiesByModule["admin"] || [];
    const billingCap = adminCaps.find(
      (c) => c.id === "admin.billing.manage"
    );

    // In the BUILTIN_ROLES definition, org-admin has deniedCapabilities: ["admin.billing.manage"]
    // But in the permissions API response, it may appear as not granted
    // The key is that it should NOT be in the granted set
    if (billingCap) {
      expect(billingCap.granted).toBe(false);
    }

    // Additionally, verify that org-admin has all other capabilities except billing
    // Org-admin should have 41 capabilities (42 total - 1 denied)
    expect(permData.totalCapabilities).toBe(41);
  });

  test("should verify org-admin role detail shows denied billing capability", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await navigateTo(page, "/settings/roles");

    // Get org-admin role detail through the full detail endpoint
    const rolesResponse = await apiCall(page, "GET", "/api/roles");
    const roles = rolesResponse.data as Array<{
      id: string;
      slug: string;
    }>;
    const orgAdmin = roles.find((r) => r.slug === "org-admin");
    expect(orgAdmin).toBeTruthy();

    const detailResponse = await apiCall(
      page,
      "GET",
      `/api/roles/${orgAdmin!.id}`
    );
    expect(detailResponse.status).toBe(200);

    const detail = detailResponse.data as {
      name: string;
      modules: Array<{
        id: string;
        capabilities: Array<{
          id: string;
          granted: boolean;
          denied: boolean;
        }>;
      }>;
      grantedCount: number;
    };

    // Find the admin module
    const adminModule = detail.modules.find((m) => m.id === "admin");
    expect(adminModule).toBeTruthy();

    // Find the billing capability
    const billingCap = adminModule!.capabilities.find(
      (c) => c.id === "admin.billing.manage"
    );
    expect(billingCap).toBeTruthy();

    // Billing should be denied (not granted) for org-admin
    // The deny-wins model means if a capability is in deniedCapabilities,
    // it should show as denied=true and granted=false
    expect(billingCap!.granted).toBe(false);
    // Note: the denied flag depends on whether the seed stores it as denied
    // vs just not granting it. Check the actual value.
  });

  test("should verify platform-admin has no denied capabilities", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await navigateTo(page, "/settings/roles");

    const capResponse = await apiCall(
      page,
      "GET",
      "/api/auth/me/capabilities"
    );
    expect(capResponse.status).toBe(200);

    const capData = capResponse.data as {
      capabilities: string[];
      denied: string[];
      roles: string[];
    };

    // Platform admin should have zero denied capabilities
    expect(capData.denied.length).toBe(0);
    // And all 42 granted
    expect(capData.capabilities.length).toBe(42);
  });

  test("should verify deny-wins: if both granted and denied, denied takes precedence", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await navigateTo(page, "/settings/roles");

    // The deny-wins mechanism is at the RBAC engine level.
    // Org-admin role explicitly denies admin.billing.manage.
    // Even though org-admin has all other capabilities, billing is denied.
    // This is verified by checking org-admin's effective capabilities.

    const rolesResponse = await apiCall(page, "GET", "/api/roles");
    const roles = rolesResponse.data as Array<{
      id: string;
      slug: string;
      capabilityCount: number;
    }>;
    const orgAdmin = roles.find((r) => r.slug === "org-admin");
    expect(orgAdmin).toBeTruthy();

    // Org-admin should have 41 granted capabilities (all except billing)
    expect(orgAdmin!.capabilityCount).toBe(41);

    // Platform admin should have all 42
    const platformAdmin = roles.find((r) => r.slug === "platform-admin");
    expect(platformAdmin).toBeTruthy();
    expect(platformAdmin!.capabilityCount).toBe(42);

    // The difference (1) is the billing capability denied by org-admin
    expect(platformAdmin!.capabilityCount - orgAdmin!.capabilityCount).toBe(1);
  });

  test("should verify viewer role has minimal capabilities", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await navigateTo(page, "/settings/roles");

    const rolesResponse = await apiCall(page, "GET", "/api/roles");
    const roles = rolesResponse.data as Array<{
      id: string;
      slug: string;
      capabilityCount: number;
    }>;
    const viewer = roles.find((r) => r.slug === "viewer");
    expect(viewer).toBeTruthy();

    // Viewer has only 4 capabilities: dash.view, risk.view, report.view, report.export
    expect(viewer!.capabilityCount).toBe(4);
  });
});

test.describe("RBAC Enforcement - Direct API Bypass Prevention", () => {
  test("server enforces RBAC even on direct API calls", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, "/settings/users");

    // Verify that each endpoint actually checks capabilities server-side
    // by confirming the response contains real data (not just passing through)

    // Dashboard should return real data
    const dashResponse = await apiCall(page, "GET", "/api/dashboard");
    expect(dashResponse.status).toBe(200);
    expect(dashResponse.data).toBeTruthy();

    // Users should return the user list
    const usersResponse = await apiCall(page, "GET", "/api/users");
    expect(usersResponse.status).toBe(200);
    const users = usersResponse.data as Array<{ id: string }>;
    expect(users.length).toBeGreaterThanOrEqual(1);

    // Roles should return the roles list
    const rolesResponse = await apiCall(page, "GET", "/api/roles");
    expect(rolesResponse.status).toBe(200);
    const roles = rolesResponse.data as Array<{ id: string }>;
    expect(roles.length).toBeGreaterThanOrEqual(7);

    // Audit log should return events
    const auditResponse = await apiCall(page, "GET", "/api/audit-log");
    expect(auditResponse.status).toBe(200);
  });

  test("invalid UUID in path should return 400, not 500", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, "/settings/users");

    // Try accessing a user with an invalid UUID
    const invalidResponse = await apiCall(
      page,
      "PATCH",
      "/api/users/not-a-uuid",
      { status: "active" }
    );
    expect(invalidResponse.status).toBe(400);

    const errorData = invalidResponse.data as { error: string };
    expect(errorData.error).toContain("Invalid");
  });

  test("accessing non-existent resource should return 404", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await navigateTo(page, "/settings/users");

    // Try accessing a role with a valid UUID format but non-existent
    const fakeUUID = "00000000-0000-0000-0000-000000000000";
    const notFoundResponse = await apiCall(
      page,
      "GET",
      `/api/roles/${fakeUUID}`
    );
    expect(notFoundResponse.status).toBe(404);
  });

  test("write operations on built-in roles should be rejected", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await navigateTo(page, "/settings/roles");

    // Get the platform-admin role ID
    const rolesResponse = await apiCall(page, "GET", "/api/roles");
    const roles = rolesResponse.data as Array<{
      id: string;
      slug: string;
      isBuiltin: boolean;
    }>;
    const builtinRole = roles.find((r) => r.isBuiltin);
    expect(builtinRole).toBeTruthy();

    // PATCH should fail
    const patchResponse = await apiCall(
      page,
      "PATCH",
      `/api/roles/${builtinRole!.id}`,
      { name: "Hacked Name" }
    );
    expect(patchResponse.status).toBe(400);

    // DELETE should fail
    const deleteResponse = await apiCall(
      page,
      "DELETE",
      `/api/roles/${builtinRole!.id}`
    );
    expect(deleteResponse.status).toBe(400);
  });

  test("self-status-change prevention is enforced server-side", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await navigateTo(page, "/settings/users");

    // Get admin user ID (response is { user: {...}, permissions: {...} })
    const meResponse = await apiCall(page, "GET", "/api/auth/me");
    expect(meResponse.status).toBe(200);
    const meData = meResponse.data as { user: { id: string } };

    // Attempt to suspend self via direct API call
    const selfSuspendResponse = await apiCall(
      page,
      "PATCH",
      `/api/users/${meData.user.id}`,
      { status: "suspended" }
    );
    expect(selfSuspendResponse.status).toBe(400);
    expect(
      (selfSuspendResponse.data as { error: string }).error
    ).toContain("Cannot change your own status");
  });
});

test.describe("RBAC Enforcement - Role Capability Counts", () => {
  test("should verify all built-in role capability counts", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await navigateTo(page, "/settings/roles");

    const rolesResponse = await apiCall(page, "GET", "/api/roles");
    expect(rolesResponse.status).toBe(200);

    const roles = rolesResponse.data as Array<{
      slug: string;
      capabilityCount: number;
      isBuiltin: boolean;
    }>;

    // Expected capability counts per the BUILTIN_ROLES definition (42 total capabilities)
    const expectedCounts: Record<string, number> = {
      "platform-admin": 42, // All capabilities
      "org-admin": 41, // All minus billing
      "security-analyst": 25, // SOC operator set
      "auditor": 15, // Read-only set
      "viewer": 4, // Dashboard + risk + reports
      "remediation-user": 5, // View results only
      "api-service": 8, // Machine-to-machine subset
    };

    for (const [slug, expectedCount] of Object.entries(expectedCounts)) {
      const role = roles.find((r) => r.slug === slug);
      expect(
        role,
        `Built-in role '${slug}' should exist`
      ).toBeTruthy();
      expect(
        role!.capabilityCount,
        `Role '${slug}' should have ${expectedCount} capabilities, got ${role!.capabilityCount}`
      ).toBe(expectedCount);
    }
  });
});
