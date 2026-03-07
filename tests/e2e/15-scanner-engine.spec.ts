import { test, expect } from "@playwright/test";
import {
  loginAsAdmin,
  apiCall,
  navigateTo,
  waitForPageReady,
} from "./helpers/auth";

/**
 * Phase 7 E2E Tests: Built-in Vulnerability Scanner Engine
 *
 * Tests scanner APIs (create, execute, results, export),
 * scan & asset detail pages, and downstream integration
 * (SIEM events, AI actions, dashboard).
 */

test.describe("Phase 7: Scanner Engine & Downstream Integration", () => {
  // ──────────────────────────────────────────────────────────────────
  // SCANNER API TESTS
  // ──────────────────────────────────────────────────────────────────

  test.describe("Scanner API", () => {
    test("TC-SCAN-001: List scans returns seeded completed scans", async ({ page }) => {
      await loginAsAdmin(page);

      const result = await apiCall(page, "GET", "/api/scans");
      expect(result.status).toBe(200);

      const scans = result.data as Array<{ name: string; status: string; type: string; resultsCount: number }>;
      expect(Array.isArray(scans)).toBe(true);
      expect(scans.length).toBeGreaterThanOrEqual(3);

      // Verify seeded scans exist
      const names = scans.map((s) => s.name);
      expect(names).toContain("Infrastructure Vulnerability Scan");
      expect(names).toContain("Network Port Assessment");
      expect(names).toContain("Cloud Configuration Audit");

      // Seeded scan should be completed with 12 findings
      const infraScan = scans.find((s) => s.name === "Infrastructure Vulnerability Scan");
      expect(infraScan?.status).toBe("completed");
      expect(infraScan?.resultsCount).toBe(12);
    });

    test("TC-SCAN-002: Create scan returns queued scan with progress", async ({ page }) => {
      await loginAsAdmin(page);

      const result = await apiCall(page, "POST", "/api/scans/create", {
        name: "E2E Test Scan",
        type: "vulnerability",
        targets: ["127.0.0.1"],
      });
      if (result.status !== 200) {
        console.error("Scan create failed:", result.status, JSON.stringify(result.data));
      }
      expect(result.status).toBe(200);

      const scan = result.data as {
        id: string;
        status: string;
        progress: { completedChecks: string[]; totalBatches: number; currentBatch: number };
      };
      expect(scan.id).toBeTruthy();
      expect(scan.status).toBe("queued");

      // Progress should be initialized
      expect(scan.progress.completedChecks).toEqual([]);
      expect(scan.progress.totalBatches).toBeGreaterThan(0);
      expect(scan.progress.currentBatch).toBe(0);
    });

    test("TC-SCAN-003: Scan detail API returns metadata and severity counts", async ({ page }) => {
      await loginAsAdmin(page);

      // Get scan list first
      const listResult = await apiCall(page, "GET", "/api/scans");
      const scans = listResult.data as Array<{ id: string; name: string }>;
      const infraScan = scans.find((s) => s.name === "Infrastructure Vulnerability Scan");
      expect(infraScan).toBeTruthy();

      // Get detail
      const detailResult = await apiCall(page, "GET", `/api/scans/${infraScan!.id}`);
      expect(detailResult.status).toBe(200);

      const detail = detailResult.data as {
        id: string;
        name: string;
        status: string;
        targets: string[];
        severityCounts: Record<string, number>;
        resultsCount: number;
      };
      expect(detail.name).toBe("Infrastructure Vulnerability Scan");
      expect(detail.status).toBe("completed");
      expect(detail.targets).toContain("10.0.1.10");
      expect(detail.resultsCount).toBe(12);

      // Check severity counts
      expect(detail.severityCounts.critical).toBe(2);
      expect(detail.severityCounts.high).toBe(3);
      expect(detail.severityCounts.medium).toBe(4);
    });

    test("TC-SCAN-004: Scan results API returns findings with CVE data", async ({ page }) => {
      await loginAsAdmin(page);

      const listResult = await apiCall(page, "GET", "/api/scans");
      const scans = listResult.data as Array<{ id: string; name: string }>;
      const infraScan = scans.find((s) => s.name === "Infrastructure Vulnerability Scan");
      expect(infraScan).toBeTruthy();

      const resultsResult = await apiCall(page, "GET", `/api/scans/${infraScan!.id}/results`);
      expect(resultsResult.status).toBe(200);

      const data = resultsResult.data as {
        results: Array<{
          severity: string;
          title: string;
          cveId: string | null;
          cvssScore: number | null;
          description: string | null;
          remediation: string | null;
          status: string;
        }>;
        pagination: { total: number; page: number };
      };

      expect(data.results.length).toBe(12);
      expect(data.pagination.total).toBe(12);

      // First result should be critical (sorted by severity)
      expect(data.results[0].severity).toBe("critical");

      // Check CVE data exists on findings
      const log4j = data.results.find((r) => r.title.includes("Log4Shell"));
      expect(log4j).toBeTruthy();
      expect(log4j!.cveId).toBe("CVE-2021-44228");
      expect(log4j!.cvssScore).toBe(10.0);
      expect(log4j!.description).toBeTruthy();
      expect(log4j!.remediation).toBeTruthy();
    });

    test("TC-SCAN-005: Scan results support severity filter", async ({ page }) => {
      await loginAsAdmin(page);

      const listResult = await apiCall(page, "GET", "/api/scans");
      const scans = listResult.data as Array<{ id: string; name: string }>;
      const infraScan = scans.find((s) => s.name === "Infrastructure Vulnerability Scan");
      expect(infraScan).toBeTruthy();

      const critResult = await apiCall(page, "GET", `/api/scans/${infraScan!.id}/results?severity=critical`);
      expect(critResult.status).toBe(200);

      const data = critResult.data as { results: Array<{ severity: string }>; pagination: { total: number } };
      expect(data.pagination.total).toBe(2);
      data.results.forEach((r) => expect(r.severity).toBe("critical"));
    });

    test("TC-SCAN-006: Finding status update (open → acknowledged)", async ({ page }) => {
      await loginAsAdmin(page);

      const listResult = await apiCall(page, "GET", "/api/scans");
      const scans = listResult.data as Array<{ id: string; name: string }>;
      const portScan = scans.find((s) => s.name === "Network Port Assessment");
      expect(portScan).toBeTruthy();

      // Get first finding
      const resultsResult = await apiCall(page, "GET", `/api/scans/${portScan!.id}/results`);
      const findings = (resultsResult.data as { results: Array<{ id: string; status: string }> }).results;
      const finding = findings[0];
      expect(finding.status).toBe("open");

      // Update status
      const updateResult = await apiCall(page, "PATCH", `/api/scans/${portScan!.id}/results/${finding.id}`, {
        status: "acknowledged",
      });
      expect(updateResult.status).toBe(200);

      // Verify update
      const verifyResult = await apiCall(page, "GET", `/api/scans/${portScan!.id}/results`);
      const updated = (verifyResult.data as { results: Array<{ id: string; status: string }> }).results.find(
        (r) => r.id === finding.id
      );
      expect(updated!.status).toBe("acknowledged");

      // Reset back to open for idempotency
      await apiCall(page, "PATCH", `/api/scans/${portScan!.id}/results/${finding.id}`, {
        status: "open",
      });
    });

    test("TC-SCAN-007: Scan export CSV returns valid data", async ({ page }) => {
      await loginAsAdmin(page);

      const listResult = await apiCall(page, "GET", "/api/scans");
      const scans = listResult.data as Array<{ id: string; name: string }>;
      const infraScan = scans.find((s) => s.name === "Infrastructure Vulnerability Scan");
      expect(infraScan).toBeTruthy();

      // Use page.evaluate to check CSV response
      const csvResponse = await page.evaluate(async (scanId: string) => {
        const res = await fetch(`/api/scans/${scanId}/export?format=csv`);
        const text = await res.text();
        return {
          status: res.status,
          contentType: res.headers.get("content-type"),
          text,
        };
      }, infraScan!.id);

      expect(csvResponse.status).toBe(200);
      expect(csvResponse.contentType).toContain("text/csv");
      expect(csvResponse.text).toContain("Severity");
      expect(csvResponse.text).toContain("Title");
      expect(csvResponse.text).toContain("Log4Shell");
    });

    test("TC-SCAN-008: Scan export JSON returns valid structure", async ({ page }) => {
      await loginAsAdmin(page);

      const listResult = await apiCall(page, "GET", "/api/scans");
      const scans = listResult.data as Array<{ id: string; name: string }>;
      const infraScan = scans.find((s) => s.name === "Infrastructure Vulnerability Scan");
      expect(infraScan).toBeTruthy();

      const jsonResult = await apiCall(page, "GET", `/api/scans/${infraScan!.id}/export?format=json`);
      expect(jsonResult.status).toBe(200);

      const data = jsonResult.data as {
        scan: { name: string };
        findings: Array<{ severity: string; title: string }>;
      };
      expect(data.scan.name).toBe("Infrastructure Vulnerability Scan");
      expect(data.findings.length).toBe(12);
    });

    test("TC-SCAN-009: Create scan auto-creates asset records", async ({ page }) => {
      await loginAsAdmin(page);

      // Create scan with a unique target IP
      const uniqueIp = `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
      const result = await apiCall(page, "POST", "/api/scans/create", {
        name: "Auto-Asset Test Scan",
        type: "port",
        targets: [uniqueIp],
      });
      expect(result.status).toBe(200);

      // Check assets list includes the new target
      const assetsResult = await apiCall(page, "GET", "/api/assets");
      const assets = assetsResult.data as Array<{ ipAddress: string | null; name: string }>;
      const autoCreated = assets.find((a) => a.ipAddress === uniqueIp);
      expect(autoCreated).toBeTruthy();
      expect(autoCreated!.name).toBe(uniqueIp);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // SCAN DETAIL PAGE TESTS
  // ──────────────────────────────────────────────────────────────────

  test.describe("Scan Detail Page", () => {
    test("TC-SCANUI-001: Scan detail page shows scan info and findings", async ({ page }) => {
      await loginAsAdmin(page);
      await waitForPageReady(page);

      // Get scan ID via API
      const listResult = await apiCall(page, "GET", "/api/scans");
      const scans = listResult.data as Array<{ id: string; name: string }>;
      const infraScan = scans.find((s) => s.name === "Infrastructure Vulnerability Scan");
      expect(infraScan).toBeTruthy();

      await navigateTo(page, `/scans/${infraScan!.id}`);

      // Wait for scan name
      await expect(
        page.locator('h1:has-text("Infrastructure Vulnerability Scan")')
      ).toBeVisible({ timeout: 15000 });

      // Verify status badge
      await expect(page.locator("text=completed").first()).toBeVisible();

      // Verify scan type badge (exact match to avoid matching the scan name)
      await expect(page.getByText("Vulnerability Scan", { exact: true })).toBeVisible();

      // Verify "Back to Scans" link
      await expect(page.getByText("Back to Scans")).toBeVisible();

      // Verify Scan Information section
      await expect(page.getByText("Scan Information")).toBeVisible();
      await expect(page.getByText("Targets")).toBeVisible();
      await expect(page.getByText("Total Findings")).toBeVisible();
    });

    test("TC-SCANUI-002: Scan detail page shows severity stat cards", async ({ page }) => {
      await loginAsAdmin(page);
      await waitForPageReady(page);

      const listResult = await apiCall(page, "GET", "/api/scans");
      const scans = listResult.data as Array<{ id: string; name: string }>;
      const infraScan = scans.find((s) => s.name === "Infrastructure Vulnerability Scan");
      expect(infraScan).toBeTruthy();

      await navigateTo(page, `/scans/${infraScan!.id}`);

      await expect(
        page.locator('h1:has-text("Infrastructure Vulnerability Scan")')
      ).toBeVisible({ timeout: 15000 });

      // Verify severity cards — lowercase labels from the page
      for (const sev of ["critical", "high", "medium", "low", "info"]) {
        await expect(page.locator(`text=${sev}`).first()).toBeVisible({ timeout: 10000 });
      }
    });

    test("TC-SCANUI-003: Scan detail page shows findings table with CVE links", async ({ page }) => {
      await loginAsAdmin(page);
      await waitForPageReady(page);

      const listResult = await apiCall(page, "GET", "/api/scans");
      const scans = listResult.data as Array<{ id: string; name: string }>;
      const infraScan = scans.find((s) => s.name === "Infrastructure Vulnerability Scan");
      expect(infraScan).toBeTruthy();

      await navigateTo(page, `/scans/${infraScan!.id}`);

      // Wait for findings section
      await expect(page.getByText("Findings (12)")).toBeVisible({ timeout: 15000 });

      // Check that critical finding appears
      await expect(page.getByText("Potential Log4Shell").first()).toBeVisible();
      await expect(page.getByText("CVE-2021-44228").first()).toBeVisible();

      // Check CVSS score
      await expect(page.getByText("CVSS: 10.0").first()).toBeVisible();
    });

    test("TC-SCANUI-004: Finding row expands to show description and remediation", async ({ page }) => {
      await loginAsAdmin(page);
      await waitForPageReady(page);

      const listResult = await apiCall(page, "GET", "/api/scans");
      const scans = listResult.data as Array<{ id: string; name: string }>;
      const infraScan = scans.find((s) => s.name === "Infrastructure Vulnerability Scan");
      expect(infraScan).toBeTruthy();

      await navigateTo(page, `/scans/${infraScan!.id}`);

      // Wait for findings to load
      await expect(page.getByText("Findings (12)")).toBeVisible({ timeout: 15000 });

      // Click on the Log4Shell finding row to expand
      await page.getByText("Potential Log4Shell").first().click();

      // Verify expanded content
      await expect(page.getByText("Description").first()).toBeVisible({ timeout: 5000 });
      await expect(page.getByText("Remediation").first()).toBeVisible();

      // Verify action buttons for open finding
      await expect(page.getByRole("button", { name: "Acknowledge" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Resolve" })).toBeVisible();
      await expect(page.getByRole("button", { name: "False Positive" })).toBeVisible();
    });

    test("TC-SCANUI-005: Scans list page navigates to scan detail on click", async ({ page }) => {
      await loginAsAdmin(page);
      await waitForPageReady(page);

      await navigateTo(page, "/scans");

      // Wait for scans list
      await expect(page.getByText("Scan History")).toBeVisible({ timeout: 15000 });

      // Click on the Infrastructure Vulnerability Scan row
      await page.getByText("Infrastructure Vulnerability Scan").first().click();

      // Should navigate to detail page
      await page.waitForURL(/\/scans\//, { timeout: 15000 });
      await expect(
        page.locator('h1:has-text("Infrastructure Vulnerability Scan")')
      ).toBeVisible({ timeout: 15000 });
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // ASSET DETAIL PAGE TESTS
  // ──────────────────────────────────────────────────────────────────

  test.describe("Asset Detail Page", () => {
    test("TC-ASSET-001: Asset detail API returns asset info with findings and risk score", async ({ page }) => {
      await loginAsAdmin(page);

      // Get asset list
      const assetsResult = await apiCall(page, "GET", "/api/assets");
      const assets = assetsResult.data as Array<{ id: string; name: string }>;
      const prodWeb = assets.find((a) => a.name === "exg-web-prod-01");
      expect(prodWeb).toBeTruthy();

      // Get asset detail
      const detailResult = await apiCall(page, "GET", `/api/assets/${prodWeb!.id}`);
      expect(detailResult.status).toBe(200);

      const detail = detailResult.data as {
        name: string;
        riskScore: number;
        findings: Array<{ severity: string; title: string }>;
        severityCounts: Record<string, number>;
        lastScanAt: string | null;
      };

      expect(detail.name).toBe("exg-web-prod-01");
      expect(detail.riskScore).toBeGreaterThan(0);
      expect(detail.findings.length).toBeGreaterThan(0);
      expect(detail.lastScanAt).toBeTruthy();
    });

    test("TC-ASSET-002: Asset detail page shows asset information", async ({ page }) => {
      await loginAsAdmin(page);
      await waitForPageReady(page);

      // Get asset ID
      const assetsResult = await apiCall(page, "GET", "/api/assets");
      const assets = assetsResult.data as Array<{ id: string; name: string }>;
      const prodWeb = assets.find((a) => a.name === "exg-web-prod-01");
      expect(prodWeb).toBeTruthy();

      await navigateTo(page, `/assets/${prodWeb!.id}`);

      // Verify asset name appears
      await expect(
        page.locator('h1:has-text("exg-web-prod-01")')
      ).toBeVisible({ timeout: 15000 });

      // Verify info cards
      await expect(page.getByText("Risk Score")).toBeVisible();
      await expect(page.getByText("Open Findings")).toBeVisible();
      await expect(page.getByText("Last Scanned")).toBeVisible();

      // Verify asset information section
      await expect(page.getByText("Asset Information")).toBeVisible();
      await expect(page.getByText("Back to Assets")).toBeVisible();
    });

    test("TC-ASSET-003: Asset list page navigates to asset detail on click", async ({ page }) => {
      await loginAsAdmin(page);
      await waitForPageReady(page);

      await navigateTo(page, "/assets");

      // Wait for asset list
      await expect(page.getByText("Asset Inventory")).toBeVisible({ timeout: 15000 });

      // Click on the prod web asset row
      await page.getByText("exg-web-prod-01").first().click();

      // Should navigate to detail page
      await page.waitForURL(/\/assets\//, { timeout: 15000 });
      await expect(
        page.locator('h1:has-text("exg-web-prod-01")')
      ).toBeVisible({ timeout: 15000 });
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // DOWNSTREAM INTEGRATION TESTS
  // ──────────────────────────────────────────────────────────────────

  test.describe("Downstream Integration", () => {
    test("TC-DOWNSTREAM-001: Dashboard stats reflect real scan findings", async ({ page }) => {
      await loginAsAdmin(page);

      // Dashboard API should return finding counts > 0
      const dashResult = await apiCall(page, "GET", "/api/dashboard");
      expect(dashResult.status).toBe(200);

      const dashData = dashResult.data as {
        stats: { totalFindings: number; criticalVulnerabilities: number; riskScore: number };
        severityCounts: Record<string, number>;
      };
      expect(dashData.stats.totalFindings).toBeGreaterThan(0);
      expect(dashData.stats.criticalVulnerabilities).toBeGreaterThanOrEqual(3);
      expect(dashData.stats.riskScore).toBeGreaterThan(0);

      // Severity counts should match scan data
      expect(dashData.severityCounts.critical).toBeGreaterThanOrEqual(3);
      expect(dashData.severityCounts.high).toBeGreaterThan(0);
    });

    test("TC-DOWNSTREAM-002: SIEM events include scanner-generated entries", async ({ page }) => {
      await loginAsAdmin(page);

      const siemResult = await apiCall(page, "GET", "/api/siem");
      expect(siemResult.status).toBe(200);

      const siemData = siemResult.data as {
        events: Array<{ title: string; source: string; severity: string }>;
        alerts: Array<{ title: string; severity: string; status: string }>;
      };

      // Should have scanner events
      const scannerEvents = siemData.events.filter((e) => e.source === "scanner");
      expect(scannerEvents.length).toBeGreaterThanOrEqual(3);

      // Should have critical scanner events
      const criticalScannerEvents = scannerEvents.filter((e) => e.severity === "critical");
      expect(criticalScannerEvents.length).toBeGreaterThanOrEqual(2);

      // Should have SIEM alerts
      expect(siemData.alerts.length).toBeGreaterThanOrEqual(3);
    });

    test("TC-DOWNSTREAM-003: AI Actions page shows scanner remediation suggestions", async ({ page }) => {
      await loginAsAdmin(page);
      await waitForPageReady(page);

      await navigateTo(page, "/ai-actions");

      // Wait for page
      await page.waitForSelector('h1:has-text("AI Actions")', { state: "visible", timeout: 15000 });

      // Should show pending count > 0
      await expect(page.getByText("Pending Review")).toBeVisible();

      // Check for remediation actions via API
      const actionsResult = await apiCall(page, "GET", "/api/ai-actions");
      const actions = actionsResult.data as Array<{ type: string; status: string; title: string }>;
      expect(actions.length).toBeGreaterThanOrEqual(8);

      // Should have remediation type actions
      const remediationActions = actions.filter((a) => a.type === "remediation");
      expect(remediationActions.length).toBeGreaterThan(0);

      // Should have pending actions
      const pendingActions = actions.filter((a) => a.status === "pending");
      expect(pendingActions.length).toBeGreaterThan(0);
    });

    test("TC-DOWNSTREAM-004: AI action approve/reject via API", async ({ page }) => {
      await loginAsAdmin(page);

      // Get AI actions via API
      const actionsResult = await apiCall(page, "GET", "/api/ai-actions");
      const actions = actionsResult.data as Array<{ id: string; status: string; title: string }>;

      // Find a pending action
      const pendingAction = actions.find((a) => a.status === "pending");
      if (!pendingAction) {
        // All may have been updated by previous test run — skip gracefully
        return;
      }

      // Approve it via API
      const approveResult = await apiCall(page, "PATCH", `/api/ai-actions/${pendingAction.id}`, {
        action: "approve",
      });
      expect(approveResult.status).toBe(200);

      // Verify status changed
      const verifyResult = await apiCall(page, "GET", "/api/ai-actions");
      const updatedActions = verifyResult.data as Array<{ id: string; status: string }>;
      const updated = updatedActions.find((a) => a.id === pendingAction.id);
      expect(updated!.status).toBe("approved");
    });

    test("TC-DOWNSTREAM-005: Dashboard risk score reflects vulnerability data", async ({ page }) => {
      await loginAsAdmin(page);
      await waitForPageReady(page);

      await navigateTo(page, "/");

      // Wait for dashboard to load
      await expect(page.getByText("Security Dashboard").first()).toBeVisible({ timeout: 15000 });

      // The dashboard should display risk score from seeded data
      const dashResult = await apiCall(page, "GET", "/api/dashboard");
      const dashData = dashResult.data as {
        stats: { riskScore: number; totalFindings: number };
      };

      // With 30 seeded findings including 3 critical, risk should be significant
      expect(dashData.stats.riskScore).toBeGreaterThan(0);
      expect(dashData.stats.totalFindings).toBeGreaterThanOrEqual(30);
    });
  });
});
