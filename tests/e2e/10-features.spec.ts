import { test, expect } from "@playwright/test";
import {
  loginAsAdmin,
  ensureLoggedIn,
  navigateTo,
  apiCall,
  waitForPageReady,
} from "./helpers/auth";

test.describe("Feature Modules", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await waitForPageReady(page);
  });

  test("should load Compliance page with 5 frameworks (GDPR, PCI DSS, HIPAA, CIS, NIST)", async ({ page }) => {
    await navigateTo(page, "/compliance");

    // Wait for loading to complete
    await page.waitForSelector('h1:has-text("Compliance Center")', { state: "visible", timeout: 15000 });

    // Verify the heading
    await expect(page.getByText("Compliance Center")).toBeVisible();

    // Verify all 5 compliance frameworks are shown (use heading role to avoid matching <option> elements)
    await expect(page.getByRole("heading", { name: "GDPR", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "PCI DSS", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "HIPAA", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "CIS Controls", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "NIST CSF", exact: true })).toBeVisible();

    // Verify framework cards have score percentages (e.g., "60%")
    // Use text pattern to find any percentage display on the page
    await expect(page.getByText(/\d+%/).first()).toBeVisible({ timeout: 10000 });
  });

  test("should load SIEM page with events and alert sections", async ({ page }) => {
    await navigateTo(page, "/siem");

    // Wait for page load
    await page.waitForSelector('h1:has-text("SIEM Dashboard")', { state: "visible", timeout: 15000 });

    // Verify heading
    await expect(page.getByText("SIEM Dashboard")).toBeVisible();

    // Verify stat cards
    await expect(page.getByText("Total Events")).toBeVisible();
    await expect(page.getByText("Critical Events")).toBeVisible();
    await expect(page.getByText("Open Alerts")).toBeVisible();

    // Verify Events tab button is visible
    const eventsTab = page.locator('button:has-text("Events")').first();
    await expect(eventsTab).toBeVisible();

    // Verify Alerts tab button is visible
    const alertsTab = page.locator('button:has-text("Alerts")').first();
    await expect(alertsTab).toBeVisible();

    // Verify Security Events section is displayed (default tab)
    await expect(page.getByText("Security Events").first()).toBeVisible();

    // Click Alerts tab and verify it loads
    await alertsTab.click();
    await page.waitForTimeout(500);
    await expect(page.getByText("Security Alerts")).toBeVisible();
  });

  test("should load AI Actions page", async ({ page }) => {
    await navigateTo(page, "/ai-actions");

    // Wait for page load
    await page.waitForSelector('h1:has-text("AI Actions")', { state: "visible", timeout: 15000 });

    // Verify heading (use getByRole to avoid matching sidebar link)
    await expect(page.getByRole("heading", { name: "AI Actions" })).toBeVisible();
    await expect(page.getByText("Review and manage AI-recommended security actions")).toBeVisible();

    // Verify stat cards
    await expect(page.getByText("Total Actions")).toBeVisible();
    await expect(page.getByText("Pending Review")).toBeVisible();

    // Verify stat cards
    await expect(page.getByText("Total Actions")).toBeVisible();
    await expect(page.getByText("Pending Review")).toBeVisible();
  });

  test("should load Reports page with 4 templates", async ({ page }) => {
    await navigateTo(page, "/reports");

    // Wait for page load
    await page.waitForSelector('h1:has-text("Reports")', { state: "visible", timeout: 15000 });

    // Verify heading
    await expect(page.getByText("Reports").first()).toBeVisible();

    // Verify "Report Templates" section
    await expect(page.getByText("Report Templates")).toBeVisible();

    // Verify all 4 report templates
    await expect(page.getByText("Vulnerability Report")).toBeVisible();
    await expect(page.getByText("Compliance Report")).toBeVisible();
    await expect(page.getByText("Executive Summary")).toBeVisible();
    await expect(page.getByText("Technical Report")).toBeVisible();

    // Verify Generate buttons are present (one per template)
    const generateButtons = page.locator('button:has-text("Generate")');
    const buttonCount = await generateButtons.count();
    expect(buttonCount).toBeGreaterThanOrEqual(4);
  });

  test("should load Risk Scoring page with risk score display", async ({ page }) => {
    await navigateTo(page, "/risk-scoring");

    // Wait for page load
    await page.waitForSelector('h1:has-text("Risk Scoring")', { state: "visible", timeout: 15000 });

    // Verify heading (use getByRole to avoid matching sidebar link)
    await expect(page.getByRole("heading", { name: "Risk Scoring" })).toBeVisible();
    await expect(page.getByText("Comprehensive risk assessment")).toBeVisible();

    // Verify the overall risk score heading
    await expect(page.getByText("Overall Risk Score")).toBeVisible();

    // Verify Risk Breakdown section
    await expect(page.getByText("Risk Breakdown")).toBeVisible();

    // Verify risk factor cards
    await expect(page.getByText("Vulnerability Risk")).toBeVisible();
    await expect(page.getByText("Compliance Risk")).toBeVisible();
    await expect(page.getByText("Threat Risk")).toBeVisible();
    await expect(page.getByText("Coverage Risk")).toBeVisible();

    // Verify severity distribution section
    await expect(page.getByText("Finding Severity Distribution")).toBeVisible();
  });

  test("should load Scans page", async ({ page }) => {
    await navigateTo(page, "/scans");

    // Wait for page load
    await page.waitForSelector('h1:has-text("Scans")', { state: "visible", timeout: 15000 });

    // Verify heading
    await expect(page.getByText("Scans").first()).toBeVisible();
    await expect(page.getByText("Manage vulnerability scans")).toBeVisible();

    // Verify stat cards (use exact match to avoid strict mode with status badges)
    await expect(page.getByText("Total Scans")).toBeVisible();
    await expect(page.getByText("Completed", { exact: true })).toBeVisible();
    await expect(page.getByText("Total Findings")).toBeVisible();

    // Verify "New Scan" button exists
    const newScanButton = page.locator('button:has-text("New Scan")');
    await expect(newScanButton).toBeVisible();

    // Verify "Scan History" section
    await expect(page.getByText("Scan History")).toBeVisible();
  });

  test("should load Security Dashboard with score and quick actions", async ({ page }) => {
    await navigateTo(page, "/settings/security");

    // Wait for page load
    await page.waitForSelector('text="Security Overview"', { state: "visible", timeout: 15000 });

    // Verify heading
    await expect(page.getByText("Security Overview")).toBeVisible();

    // Verify security score breakdown section
    await expect(page.getByText("Security Score Breakdown")).toBeVisible();

    // Verify score breakdown items (use exact match to avoid strict mode violations)
    await expect(page.getByText("Audit Log Integrity", { exact: true })).toBeVisible();
    await expect(page.getByText("No Failed Logins (24h)", { exact: true })).toBeVisible();
    await expect(page.getByText("API Keys Not Expiring", { exact: true })).toBeVisible();
    await expect(page.getByText("Session Count Normal", { exact: true })).toBeVisible();
    await expect(page.getByText("Security Headers Active", { exact: true })).toBeVisible();

    // Verify stat cards (use exact match to avoid strict mode with score breakdown items)
    await expect(page.getByText("Failed Logins (24h)", { exact: true })).toBeVisible();
    await expect(page.getByText("Active Sessions", { exact: true })).toBeVisible();
    await expect(page.getByText("Audit Integrity", { exact: true })).toBeVisible();

    // Verify quick actions
    await expect(page.getByText("Quick Actions")).toBeVisible();
    await expect(page.locator('button:has-text("View Audit Log")')).toBeVisible();
    await expect(page.locator('button:has-text("Check Integrity")')).toBeVisible();
    await expect(page.locator('button:has-text("View All Sessions")')).toBeVisible();
  });

  test("should generate a report via first template", async ({ page }) => {
    await navigateTo(page, "/reports");

    // Wait for page load
    await page.waitForSelector('h1:has-text("Reports")', { state: "visible", timeout: 15000 });

    // Click the first "Generate" button (Vulnerability Report)
    const generateButtons = page.locator('button:has-text("Generate")');
    await expect(generateButtons.first()).toBeVisible();
    await generateButtons.first().click();

    // Wait for the generation to complete (button changes to "Generating...")
    // Then check the Generated Reports section updates
    await page.waitForTimeout(2000);
    await waitForPageReady(page);

    // Verify the Generated Reports section shows at least one report
    const generatedReportsSection = page.locator('text=/Generated Reports \\(\\d+\\)/');
    await expect(generatedReportsSection).toBeVisible({ timeout: 10000 });

    // The section should now show a count > 0
    const sectionText = await generatedReportsSection.textContent();
    const match = sectionText?.match(/Generated Reports \((\d+)\)/);
    if (match) {
      const count = parseInt(match[1], 10);
      expect(count).toBeGreaterThan(0);
    }
  });
});
