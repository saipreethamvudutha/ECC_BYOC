import { test, expect } from "@playwright/test";
import {
  loginAsAdmin,
  apiCall,
  navigateTo,
  waitForPageReady,
} from "./helpers/auth";

test.describe("Dashboard Tests", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await waitForPageReady(page);
  });

  // -------------------------------------------------------------------------
  // Dashboard loads with all 6 stat cards
  // -------------------------------------------------------------------------
  test("Dashboard loads with all 6 stat cards visible", async ({ page }) => {
    // Navigate to dashboard
    await navigateTo(page, "/");

    // Wait for the "Security Dashboard" heading
    await expect(
      page.locator("h1:has-text('Security Dashboard')")
    ).toBeVisible({ timeout: 15000 });

    // Verify all 6 stat card labels are present
    const expectedStatCards = [
      "Total Assets",
      "Critical Vulnerabilities",
      "Risk Score",
      "Compliance Score",
      "Open Alerts",
      "AI Actions Pending",
    ];

    for (const label of expectedStatCards) {
      const card = page.locator(`text=${label}`);
      await expect(card).toBeVisible({ timeout: 10000 });
    }

    // Verify the "Real-time overview" subtitle
    await expect(
      page.locator("text=Real-time overview of your security posture")
    ).toBeVisible();

    // Verify the "Live monitoring active" indicator
    await expect(
      page.locator("text=Live monitoring active")
    ).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Vulnerability Breakdown section visible
  // -------------------------------------------------------------------------
  test("Vulnerability Breakdown section is visible with severity levels", async ({
    page,
  }) => {
    await navigateTo(page, "/");

    // Wait for dashboard to load
    await expect(
      page.locator("h1:has-text('Security Dashboard')")
    ).toBeVisible({ timeout: 15000 });

    // Verify Vulnerability Breakdown card heading
    const vulnSection = page.locator("text=Vulnerability Breakdown");
    await expect(vulnSection).toBeVisible({ timeout: 10000 });

    // Verify severity level labels are present
    const severityLevels = ["critical", "high", "medium", "low", "info"];
    for (const severity of severityLevels) {
      const label = page.locator(
        `.capitalize:has-text("${severity}")`
      );
      await expect(label).toBeVisible();
    }

    // Verify "Total Findings" summary row
    await expect(page.locator("text=Total Findings")).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Compliance Overview section visible with frameworks
  // -------------------------------------------------------------------------
  test("Compliance Overview section shows GDPR, PCI DSS, and HIPAA frameworks", async ({
    page,
  }) => {
    await navigateTo(page, "/");

    // Wait for dashboard to load
    await expect(
      page.locator("h1:has-text('Security Dashboard')")
    ).toBeVisible({ timeout: 15000 });

    // Verify Compliance Overview card heading
    const complianceSection = page.locator("text=Compliance Overview");
    await expect(complianceSection).toBeVisible({ timeout: 10000 });

    // Verify the three compliance frameworks are present in the compliance section
    const frameworks = ["GDPR", "PCI DSS", "HIPAA"];
    for (const framework of frameworks) {
      await expect(page.getByText(framework, { exact: true }).first()).toBeVisible({ timeout: 10000 });
    }

    // Verify compliance status labels exist
    await expect(page.locator("text=Compliant").first()).toBeVisible();
    await expect(page.locator("text=Partial").first()).toBeVisible();
    await expect(page.locator("text=Non-compliant").first()).toBeVisible();
    await expect(page.locator("text=Unassessed").first()).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Recent Activity section visible
  // -------------------------------------------------------------------------
  test("Recent Activity section is visible with audit log entries", async ({
    page,
  }) => {
    await navigateTo(page, "/");

    // Wait for dashboard to load
    await expect(
      page.locator("h1:has-text('Security Dashboard')")
    ).toBeVisible({ timeout: 15000 });

    // Verify Recent Activity card heading
    const activitySection = page.locator("text=Recent Activity");
    await expect(activitySection).toBeVisible({ timeout: 10000 });

    // Verify there are activity entries rendered (each has a result badge)
    // The seed data has 15 audit events, dashboard shows up to 10
    const activityItems = page.locator(
      '[class*="bg-slate-800/30"][class*="hover:bg-slate-800/50"]'
    );
    const count = await activityItems.count();
    expect(count).toBeGreaterThan(0);

    // Verify at least one activity entry shows a result badge (success/denied/etc.)
    const resultBadge = page
      .locator('[class*="bg-slate-800/30"] >> text=success')
      .first();
    await expect(resultBadge).toBeVisible({ timeout: 10000 });
  });

  // -------------------------------------------------------------------------
  // Dashboard data accuracy: Total Assets matches /assets count
  // -------------------------------------------------------------------------
  test("Dashboard Total Assets count matches actual asset count from API", async ({
    page,
  }) => {
    await navigateTo(page, "/");

    // Wait for dashboard to load
    await expect(
      page.locator("h1:has-text('Security Dashboard')")
    ).toBeVisible({ timeout: 15000 });

    // Get the Total Assets value from the dashboard stat card
    // The stat card structure is: p.text-2xl.font-bold containing the number,
    // followed by p.text-xs.text-slate-400 containing "Total Assets"
    const totalAssetsCard = page
      .locator("p.text-xs:has-text('Total Assets')")
      .locator("..");
    const totalAssetsValue = await totalAssetsCard
      .locator("p.text-2xl")
      .textContent();
    const dashboardAssetCount = parseInt(totalAssetsValue?.trim() || "0", 10);

    // Now fetch the actual asset count from the API
    const assetsResponse = await apiCall(page, "GET", "/api/assets");
    expect(assetsResponse.status).toBe(200);
    const actualAssetCount = Array.isArray(assetsResponse.data)
      ? (assetsResponse.data as unknown[]).length
      : 0;

    // The counts should match
    expect(dashboardAssetCount).toBe(actualAssetCount);
  });

  // -------------------------------------------------------------------------
  // Dashboard API returns 200 with correct fields
  // -------------------------------------------------------------------------
  test("Dashboard API /api/dashboard returns 200 with correct response shape", async ({
    page,
  }) => {
    // Make an authenticated API call to the dashboard endpoint
    const response = await apiCall(page, "GET", "/api/dashboard");

    // Verify status code
    expect(response.status).toBe(200);

    // Verify response shape
    const data = response.data as Record<string, unknown>;
    expect(data).toHaveProperty("stats");
    expect(data).toHaveProperty("severityCounts");
    expect(data).toHaveProperty("complianceOverview");
    expect(data).toHaveProperty("recentActivity");

    // Verify stats fields
    const stats = data.stats as Record<string, unknown>;
    expect(stats).toHaveProperty("totalAssets");
    expect(stats).toHaveProperty("criticalVulnerabilities");
    expect(stats).toHaveProperty("complianceScore");
    expect(stats).toHaveProperty("openAlerts");
    expect(stats).toHaveProperty("pendingAiActions");
    expect(stats).toHaveProperty("riskScore");
    expect(stats).toHaveProperty("totalFindings");

    // Verify stats values are numbers
    expect(typeof stats.totalAssets).toBe("number");
    expect(typeof stats.criticalVulnerabilities).toBe("number");
    expect(typeof stats.complianceScore).toBe("number");
    expect(typeof stats.openAlerts).toBe("number");
    expect(typeof stats.pendingAiActions).toBe("number");
    expect(typeof stats.riskScore).toBe("number");
    expect(typeof stats.totalFindings).toBe("number");

    // Verify severityCounts fields
    const severityCounts = data.severityCounts as Record<string, unknown>;
    expect(severityCounts).toHaveProperty("critical");
    expect(severityCounts).toHaveProperty("high");
    expect(severityCounts).toHaveProperty("medium");
    expect(severityCounts).toHaveProperty("low");
    expect(severityCounts).toHaveProperty("info");

    // Verify complianceOverview is an array
    expect(Array.isArray(data.complianceOverview)).toBe(true);
    const complianceOverview = data.complianceOverview as Array<
      Record<string, unknown>
    >;
    if (complianceOverview.length > 0) {
      const firstFramework = complianceOverview[0];
      expect(firstFramework).toHaveProperty("framework");
      expect(firstFramework).toHaveProperty("version");
      expect(firstFramework).toHaveProperty("totalControls");
      expect(firstFramework).toHaveProperty("compliant");
      expect(firstFramework).toHaveProperty("partiallyCompliant");
      expect(firstFramework).toHaveProperty("nonCompliant");
      expect(firstFramework).toHaveProperty("notAssessed");
      expect(firstFramework).toHaveProperty("score");
    }

    // Verify recentActivity is an array
    expect(Array.isArray(data.recentActivity)).toBe(true);
    const recentActivity = data.recentActivity as Array<
      Record<string, unknown>
    >;
    if (recentActivity.length > 0) {
      const firstActivity = recentActivity[0];
      expect(firstActivity).toHaveProperty("id");
      expect(firstActivity).toHaveProperty("action");
      expect(firstActivity).toHaveProperty("actorName");
      expect(firstActivity).toHaveProperty("actorType");
      expect(firstActivity).toHaveProperty("result");
      expect(firstActivity).toHaveProperty("details");
      expect(firstActivity).toHaveProperty("createdAt");
    }

    // Verify totalAssets is at least 12 (seed data has 12, test runs may add more)
    expect(stats.totalAssets as number).toBeGreaterThanOrEqual(12);
  });
});
