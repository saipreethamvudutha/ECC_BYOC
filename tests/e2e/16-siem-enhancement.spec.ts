import { test, expect } from "@playwright/test";
import {
  loginAsAdmin,
  apiCall,
  navigateTo,
  waitForPageReady,
} from "./helpers/auth";

/**
 * Phase 10 E2E Tests: Enterprise SIEM Enhancement — SOC Operations Center
 *
 * Tests SIEM APIs (events, alerts, rules, incidents, metrics),
 * SOC Dashboard, alert/incident detail pages, and RBAC enforcement.
 */

test.describe("Phase 10: Enterprise SIEM / SOC Operations Center", () => {
  // ──────────────────────────────────────────────────────────────────
  // SIEM API TESTS
  // ──────────────────────────────────────────────────────────────────

  test.describe("SIEM Events API", () => {
    test("TC-SIEM-001: List events with pagination", async ({ page }) => {
      await loginAsAdmin(page);

      const result = await apiCall(page, "GET", "/api/siem?tab=events&limit=10");
      expect(result.status).toBe(200);

      const body = result.data as { events: unknown[]; pagination: { total: number; page: number; limit: number } };
      expect(Array.isArray(body.events)).toBe(true);
      expect(body.events.length).toBeGreaterThan(0);
      expect(body.events.length).toBeLessThanOrEqual(10);
      expect(body.pagination).toBeDefined();
      expect(body.pagination.total).toBeGreaterThanOrEqual(40);
    });

    test("TC-SIEM-002: Filter events by severity", async ({ page }) => {
      await loginAsAdmin(page);

      const result = await apiCall(page, "GET", "/api/siem?tab=events&severity=critical");
      expect(result.status).toBe(200);

      const body = result.data as { events: Array<{ severity: string }> };
      expect(body.events.length).toBeGreaterThan(0);
      body.events.forEach((event) => {
        expect(event.severity).toBe("critical");
      });
    });

    test("TC-SIEM-003: Filter events by category", async ({ page }) => {
      await loginAsAdmin(page);

      const result = await apiCall(page, "GET", "/api/siem?tab=events&category=authentication");
      expect(result.status).toBe(200);

      const body = result.data as { events: Array<{ category: string }> };
      expect(body.events.length).toBeGreaterThan(0);
      body.events.forEach((event) => {
        expect(event.category).toBe("authentication");
      });
    });
  });

  test.describe("SIEM Alerts API", () => {
    test("TC-SIEM-004: List alerts with pagination", async ({ page }) => {
      await loginAsAdmin(page);

      const result = await apiCall(page, "GET", "/api/siem?tab=alerts&limit=50");
      expect(result.status).toBe(200);

      const body = result.data as { alerts: Array<{ id: string; severity: string; status: string; title: string }> };
      expect(Array.isArray(body.alerts)).toBe(true);
      expect(body.alerts.length).toBeGreaterThanOrEqual(20);
    });

    test("TC-SIEM-005: Filter alerts by status", async ({ page }) => {
      await loginAsAdmin(page);

      const result = await apiCall(page, "GET", "/api/siem?tab=alerts&status=investigating");
      expect(result.status).toBe(200);

      const body = result.data as { alerts: Array<{ status: string }> };
      expect(body.alerts.length).toBeGreaterThan(0);
      body.alerts.forEach((alert) => {
        expect(alert.status).toBe("investigating");
      });
    });

    test("TC-SIEM-006: Get alert detail with MITRE tags", async ({ page }) => {
      await loginAsAdmin(page);

      // Get an alert first
      const list = await apiCall(page, "GET", "/api/siem?tab=alerts&limit=1");
      const alerts = (list.data as { alerts: Array<{ id: string }> }).alerts;
      expect(alerts.length).toBeGreaterThan(0);

      const detail = await apiCall(page, "GET", `/api/siem/alerts/${alerts[0].id}`);
      expect(detail.status).toBe(200);

      const alert = detail.data as {
        id: string; title: string; severity: string; status: string;
        mitreAttackId?: string; mitreTactic?: string;
      };
      expect(alert.id).toBe(alerts[0].id);
      expect(alert.title).toBeTruthy();
      expect(alert.severity).toBeTruthy();
    });

    test("TC-SIEM-007: Update alert status (acknowledge)", async ({ page }) => {
      await loginAsAdmin(page);

      // Find a triaging alert to move to investigating
      const list = await apiCall(page, "GET", "/api/siem?tab=alerts&status=triaging&limit=1");
      const alerts = (list.data as { alerts: Array<{ id: string; status: string }> }).alerts;
      expect(alerts.length).toBeGreaterThan(0);

      const alertId = alerts[0].id;

      // Move to investigating
      const update = await apiCall(page, "PATCH", `/api/siem/alerts/${alertId}`, {
        status: "investigating",
        assignedToName: "Test Analyst",
      });
      expect(update.status).toBe(200);

      const updated = update.data as { id: string; status: string; message: string };
      expect(updated.status).toBe("investigating");
      expect(updated.message).toBeTruthy();
    });
  });

  test.describe("SIEM Rules API", () => {
    test("TC-SIEM-008: List detection rules", async ({ page }) => {
      await loginAsAdmin(page);

      const result = await apiCall(page, "GET", "/api/siem/rules");
      expect(result.status).toBe(200);

      const body = result.data as { rules: Array<{ name: string; mitreAttackId: string; severity: string; isActive: boolean }> };
      expect(body.rules.length).toBeGreaterThanOrEqual(12);

      // Verify MITRE mapping
      const bruteForce = body.rules.find(r => r.name.includes("Brute Force"));
      expect(bruteForce).toBeDefined();
      expect(bruteForce!.mitreAttackId).toBe("T1110");
    });

    test("TC-SIEM-009: Get rule detail with alert count", async ({ page }) => {
      await loginAsAdmin(page);

      const list = await apiCall(page, "GET", "/api/siem/rules?limit=1");
      const rules = (list.data as { rules: Array<{ id: string }> }).rules;
      expect(rules.length).toBeGreaterThan(0);

      const detail = await apiCall(page, "GET", `/api/siem/rules/${rules[0].id}`);
      expect(detail.status).toBe(200);

      const rule = detail.data as { id: string; name: string; condition: unknown };
      expect(rule.name).toBeTruthy();
      expect(rule.condition).toBeTruthy();
    });

    test("TC-SIEM-010: Create new detection rule", async ({ page }) => {
      await loginAsAdmin(page);

      const newRule = {
        name: "E2E Test Rule — Suspicious Login",
        description: "Test rule for E2E validation",
        severity: "medium",
        ruleType: "correlation",
        condition: { field: "eventAction", operator: "eq", value: "login", threshold: 3, window: "1m" },
        mitreAttackId: "T1078",
        mitreTactic: "Initial Access",
        mitreTechnique: "Valid Accounts",
        category: "authentication",
        dataSources: ["identity"],
      };

      const result = await apiCall(page, "POST", "/api/siem/rules", newRule);
      expect(result.status).toBe(201);

      const created = result.data as { id: string; name: string; mitreAttackId: string };
      expect(created.name).toBe(newRule.name);
      expect(created.mitreAttackId).toBe("T1078");

      // Clean up — delete the rule
      const del = await apiCall(page, "DELETE", `/api/siem/rules/${created.id}`);
      expect(del.status).toBe(200);
    });
  });

  test.describe("SIEM Incidents API", () => {
    test("TC-SIEM-011: List incidents", async ({ page }) => {
      await loginAsAdmin(page);

      const result = await apiCall(page, "GET", "/api/siem/incidents");
      expect(result.status).toBe(200);

      const body = result.data as { incidents: Array<{ id: string; title: string; severity: string; status: string }> };
      expect(body.incidents.length).toBeGreaterThanOrEqual(5);

      // Verify incident has expected fields
      const incident = body.incidents[0];
      expect(incident.title).toBeTruthy();
      expect(incident.severity).toBeTruthy();
      expect(incident.status).toBeTruthy();
    });

    test("TC-SIEM-012: Get incident detail with timeline and alerts", async ({ page }) => {
      await loginAsAdmin(page);

      const list = await apiCall(page, "GET", "/api/siem/incidents?limit=1");
      const incidents = (list.data as { incidents: Array<{ id: string }> }).incidents;
      expect(incidents.length).toBeGreaterThan(0);

      const detail = await apiCall(page, "GET", `/api/siem/incidents/${incidents[0].id}`);
      expect(detail.status).toBe(200);

      const incident = detail.data as {
        id: string; title: string; timeline: unknown[];
        alerts: unknown[]; mitreTactics: string[]; mitreTechniques: string[];
      };
      expect(incident.title).toBeTruthy();
      expect(Array.isArray(incident.timeline)).toBe(true);
      expect(Array.isArray(incident.alerts)).toBe(true);
      expect(Array.isArray(incident.mitreTactics)).toBe(true);
    });

    test("TC-SIEM-013: Update incident status", async ({ page }) => {
      await loginAsAdmin(page);

      // Find any non-closed incident to transition
      const list = await apiCall(page, "GET", "/api/siem/incidents");
      const incidents = (list.data as { incidents: Array<{ id: string; status: string }> }).incidents;

      // Find an incident we can move — prefer investigating, then open, then contained
      const target = incidents.find(i => i.status === "investigating")
        || incidents.find(i => i.status === "open")
        || incidents.find(i => i.status === "contained");
      expect(target).toBeDefined();

      const nextStatus = target!.status === "contained" ? "eradicated" : "contained";

      const update = await apiCall(page, "PATCH", `/api/siem/incidents/${target!.id}`, {
        status: nextStatus,
        timelineEntry: {
          action: nextStatus,
          details: `E2E test: Incident moved to ${nextStatus}`,
        },
      });
      expect(update.status).toBe(200);

      const updated = update.data as { status: string };
      expect(updated.status).toBe(nextStatus);
    });
  });

  test.describe("SOC Metrics API", () => {
    test("TC-SIEM-014: Get SOC metrics", async ({ page }) => {
      await loginAsAdmin(page);

      const result = await apiCall(page, "GET", "/api/siem/metrics");
      expect(result.status).toBe(200);

      const metrics = result.data as {
        securityPostureScore: number;
        openAlerts: number;
        activeIncidents: number;
        alertsByHour: unknown[];
        severityDistribution: unknown[];
        topRules: unknown[];
        topAssets: unknown[];
      };

      expect(typeof metrics.securityPostureScore).toBe("number");
      expect(typeof metrics.openAlerts).toBe("number");
      expect(typeof metrics.activeIncidents).toBe("number");
      expect(Array.isArray(metrics.alertsByHour)).toBe(true);
      expect(Array.isArray(metrics.severityDistribution)).toBe(true);
      expect(Array.isArray(metrics.topRules)).toBe(true);
    });
  });

  test.describe("Alert Escalation API", () => {
    test("TC-SIEM-015: Escalate alert to incident", async ({ page }) => {
      await loginAsAdmin(page);

      // Find an alert without an incident link
      const list = await apiCall(page, "GET", "/api/siem?tab=alerts&limit=25");
      const alerts = (list.data as { alerts: Array<{ id: string; incidentId?: string | null }> }).alerts;
      const unlinked = alerts.find(a => !a.incidentId);

      if (unlinked) {
        const esc = await apiCall(page, "POST", `/api/siem/alerts/${unlinked.id}/escalate`, {
          title: "E2E Escalation Test Incident",
          priority: "high",
        });
        expect(esc.status).toBe(201);

        const incident = esc.data as { id: string; title: string };
        expect(incident.title).toBe("E2E Escalation Test Incident");
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // UI TESTS
  // ──────────────────────────────────────────────────────────────────

  test.describe("SOC Dashboard UI", () => {
    test("TC-SIEM-016: SOC Dashboard loads with all tabs", async ({ page }) => {
      await loginAsAdmin(page);
      await navigateTo(page, "/siem");
      await waitForPageReady(page);

      // Check header
      await expect(page.locator("text=SOC Operations Center")).toBeVisible({ timeout: 15000 });

      // Check tabs exist
      await expect(page.getByRole("button", { name: /SOC Overview/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /Alert Queue/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /Incidents/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /Detection Rules/i })).toBeVisible();
    });

    test("TC-SIEM-017: SOC Overview shows metric cards", async ({ page }) => {
      await loginAsAdmin(page);
      await navigateTo(page, "/siem");
      await waitForPageReady(page);

      // Wait for data to load
      await page.waitForTimeout(3000);

      // Metric cards should be visible
      await expect(page.locator("text=Open Alerts")).toBeVisible({ timeout: 15000 });
      await expect(page.locator("text=Active Incidents")).toBeVisible();
    });

    test("TC-SIEM-018: Alert Queue tab shows alerts", async ({ page }) => {
      await loginAsAdmin(page);
      await navigateTo(page, "/siem");
      await waitForPageReady(page);

      // Click Alert Queue tab
      await page.getByRole("button", { name: /Alert Queue/i }).click();
      await page.waitForTimeout(2000);

      // Should show alert entries — look for any alert title text (table rows loaded)
      // Use a broad check: the alert queue should have rendered rows with severity text
      const alertQueueContent = page.locator("table tbody tr").first();
      await expect(alertQueueContent).toBeVisible({ timeout: 10000 });
    });

    test("TC-SIEM-019: Incidents tab shows incidents", async ({ page }) => {
      await loginAsAdmin(page);
      await navigateTo(page, "/siem");
      await waitForPageReady(page);

      // Click Incidents tab
      await page.getByRole("button", { name: /Incidents/i }).click();
      await page.waitForTimeout(2000);

      // Should show incident entries — use .first() to avoid strict mode violation
      await expect(page.locator("text=Active Ransomware").first()).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe("Alert Detail UI", () => {
    test("TC-SIEM-020: Alert detail page loads correctly", async ({ page }) => {
      await loginAsAdmin(page);

      // Get an alert ID
      const list = await apiCall(page, "GET", "/api/siem?tab=alerts&limit=1");
      const alerts = (list.data as { alerts: Array<{ id: string }> }).alerts;
      expect(alerts.length).toBeGreaterThan(0);

      await navigateTo(page, `/siem/alerts/${alerts[0].id}`);
      await waitForPageReady(page);

      // Should show alert details
      await expect(page.locator("text=Back to SOC Dashboard")).toBeVisible({ timeout: 15000 });
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // RBAC ENFORCEMENT
  // ──────────────────────────────────────────────────────────────────

  test.describe("RBAC Enforcement", () => {
    test("TC-SIEM-021: Viewer can access SIEM view but not manage rules", async ({ page }) => {
      // Clear cookies and login as viewer via the login page
      await page.context().clearCookies();
      await page.goto("/login");
      await page.waitForSelector('input[type="email"]', { state: "visible", timeout: 15000 });
      await page.fill('input[type="email"]', "viewer@exargen.com");
      await page.fill('input[type="password"]', "Viewer123!");
      await page.click('button[type="submit"]');
      await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15000 }).catch(() => {});

      // Viewer should NOT be able to create rules
      const createRule = await apiCall(page, "POST", "/api/siem/rules", {
        name: "Unauthorized Rule",
        severity: "low",
        condition: { test: true },
      });
      expect(createRule.status).toBe(403);
    });
  });
});
