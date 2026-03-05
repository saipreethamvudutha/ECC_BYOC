import { test, expect } from "@playwright/test";
import {
  loginAsAdmin,
  apiCall,
  navigateTo,
  waitForPageReady,
} from "./helpers/auth";

test.describe("Asset Management Tests", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await waitForPageReady(page);
  });

  // -------------------------------------------------------------------------
  // View asset inventory: 12 assets, stat cards, table columns
  // -------------------------------------------------------------------------
  test("View asset inventory shows 12 seed assets with stat cards and table columns", async ({
    page,
  }) => {
    await navigateTo(page, "/assets");

    // Wait for the page heading
    await expect(
      page.locator("h1:has-text('Asset Inventory')")
    ).toBeVisible({ timeout: 15000 });

    // Verify the description text
    await expect(
      page.locator(
        "text=Manage and monitor all assets across your organization"
      )
    ).toBeVisible();

    // Verify "Add Asset" button
    await expect(
      page.locator("button:has-text('Add Asset')")
    ).toBeVisible();

    // Verify the 5 stat cards are present
    const statLabels = [
      "Total Assets",
      "Active",
      "Critical Assets",
      "High Priority",
      "Unscanned",
    ];
    for (const label of statLabels) {
      await expect(page.locator(`text=${label}`).first()).toBeVisible({
        timeout: 10000,
      });
    }

    // Verify the Total Assets stat card shows at least 12 (seed data; test runs may add more)
    const totalAssetsCard = page
      .locator("p.text-xs:has-text('Total Assets')")
      .first()
      .locator("..");
    const totalValue = await totalAssetsCard
      .locator("p.text-2xl")
      .textContent();
    expect(parseInt(totalValue?.trim() || "0", 10)).toBeGreaterThanOrEqual(12);

    // Verify table column headers are present
    const columnHeaders = [
      "Name",
      "Type",
      "IP / Hostname",
      "OS",
      "Criticality",
      "Tags",
      "Group",
      "Status",
    ];
    for (const header of columnHeaders) {
      await expect(
        page.locator(`text=${header}`).first()
      ).toBeVisible();
    }

    // Verify the "Assets (N)" heading showing the count (at least 12 from seed data)
    const assetsHeading = page.locator('h3:has-text("Assets")');
    await expect(assetsHeading).toBeVisible();
    const headingText = await assetsHeading.textContent();
    const headingMatch = headingText?.match(/Assets \((\d+)\)/);
    expect(headingMatch).toBeTruthy();
    expect(parseInt(headingMatch![1], 10)).toBeGreaterThanOrEqual(12);

    // Verify individual asset rows exist (check for known seed asset names)
    await expect(
      page.locator("text=exg-web-prod-01").first()
    ).toBeVisible();
    await expect(
      page.locator("text=exg-db-prod-01").first()
    ).toBeVisible();
    await expect(
      page.locator("text=exg-fw-prod-01").first()
    ).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Search assets by name
  // -------------------------------------------------------------------------
  test('Search assets by name filters correctly (searching "prod")', async ({
    page,
  }) => {
    await navigateTo(page, "/assets");

    await expect(
      page.locator("h1:has-text('Asset Inventory')")
    ).toBeVisible({ timeout: 15000 });

    // Wait for assets to load (at least one visible)
    await expect(
      page.locator("text=exg-web-prod-01").first()
    ).toBeVisible({ timeout: 10000 });

    // Type "prod" in the search field
    const searchInput = page.locator(
      'input[placeholder="Search by name, hostname, or IP address..."]'
    );
    await searchInput.fill("prod");

    // Wait for filtering to take effect
    await page.waitForTimeout(500);

    // Assets with "prod" in their name should be visible
    // From seed data: exg-web-prod-01, exg-web-prod-02, exg-api-prod-01,
    // exg-db-prod-01, exg-siem-prod-01, exg-fw-prod-01
    // These are 6 prod assets
    await expect(
      page.locator("text=exg-web-prod-01").first()
    ).toBeVisible();
    await expect(
      page.locator("text=exg-api-prod-01").first()
    ).toBeVisible();
    await expect(
      page.locator("text=exg-db-prod-01").first()
    ).toBeVisible();

    // Assets WITHOUT "prod" should NOT be visible
    await expect(
      page.locator("text=exg-web-staging-01").first()
    ).not.toBeVisible();
    await expect(
      page.locator("text=exg-app-dev-01").first()
    ).not.toBeVisible();

    // The card title should reflect the filtered count
    const assetsTitle = page.locator('h3:has-text("Assets")');
    const titleText = await assetsTitle.textContent();
    // Should show fewer than 12 assets
    const match = titleText?.match(/Assets \((\d+)\)/);
    if (match) {
      const filteredCount = parseInt(match[1], 10);
      expect(filteredCount).toBeGreaterThan(0);
      expect(filteredCount).toBeLessThan(12);
    }
  });

  // -------------------------------------------------------------------------
  // Search assets by IP address
  // -------------------------------------------------------------------------
  test("Search assets by IP address filters correctly", async ({ page }) => {
    await navigateTo(page, "/assets");

    await expect(
      page.locator("h1:has-text('Asset Inventory')")
    ).toBeVisible({ timeout: 15000 });

    // Wait for assets to load
    await expect(
      page.locator("text=exg-web-prod-01").first()
    ).toBeVisible({ timeout: 10000 });

    // Search by a specific IP prefix
    const searchInput = page.locator(
      'input[placeholder="Search by name, hostname, or IP address..."]'
    );
    await searchInput.fill("10.0.1.10");

    // Wait for filtering
    await page.waitForTimeout(500);

    // exg-web-prod-01 has IP 10.0.1.10 - should be visible
    await expect(
      page.locator("text=exg-web-prod-01").first()
    ).toBeVisible();

    // Other assets should not be visible
    await expect(
      page.locator("text=exg-db-prod-01").first()
    ).not.toBeVisible();
    await expect(
      page.locator("text=exg-app-dev-01").first()
    ).not.toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Filter assets by tag
  // -------------------------------------------------------------------------
  test("Filter assets by tag narrows the asset list", async ({ page }) => {
    await navigateTo(page, "/assets");

    await expect(
      page.locator("h1:has-text('Asset Inventory')")
    ).toBeVisible({ timeout: 15000 });

    // Wait for assets to load
    await expect(
      page.locator("text=exg-web-prod-01").first()
    ).toBeVisible({ timeout: 10000 });

    // Open the tag filter dropdown
    const tagFilterButton = page.locator(
      'button:has-text("Filter by tag")'
    );
    await tagFilterButton.click();

    // Wait for the dropdown to appear (tag options become visible)
    const stagingTagOption = page.locator(
      'button:has-text("env:staging")'
    );
    await expect(stagingTagOption).toBeVisible({ timeout: 5000 });

    // Select the "env:staging" tag (exists on staging assets)
    await stagingTagOption.click();

    // Wait for filtering to take effect
    await page.waitForTimeout(500);

    // Staging assets should be visible
    await expect(
      page.locator("text=exg-web-staging-01").first()
    ).toBeVisible();
    await expect(
      page.locator("text=exg-api-staging-01").first()
    ).toBeVisible();

    // Production-only assets should NOT be visible
    await expect(
      page.locator("text=exg-app-dev-01").first()
    ).not.toBeVisible();

    // The filtered count should be less than 12
    const assetsTitle = page.locator('h3:has-text("Assets")');
    const titleText = await assetsTitle.textContent();
    const match = titleText?.match(/Assets \((\d+)\)/);
    if (match) {
      const filteredCount = parseInt(match[1], 10);
      expect(filteredCount).toBe(2); // Only 2 staging assets
    }
  });

  // -------------------------------------------------------------------------
  // Combined search + tag filter
  // -------------------------------------------------------------------------
  test("Combined search and tag filter narrows results further", async ({
    page,
  }) => {
    await navigateTo(page, "/assets");

    await expect(
      page.locator("h1:has-text('Asset Inventory')")
    ).toBeVisible({ timeout: 15000 });

    // Wait for assets to load
    await expect(
      page.locator("text=exg-web-prod-01").first()
    ).toBeVisible({ timeout: 10000 });

    // First, apply a tag filter for "env:production"
    const tagFilterButton = page.locator(
      'button:has-text("Filter by tag")'
    );
    await tagFilterButton.click();

    const prodTagOption = page.locator(
      'button:has-text("env:production")'
    );
    await expect(prodTagOption).toBeVisible({ timeout: 5000 });
    await prodTagOption.click();
    await page.waitForTimeout(500);

    // Now also search by "web" to narrow further
    const searchInput = page.locator(
      'input[placeholder="Search by name, hostname, or IP address..."]'
    );
    await searchInput.fill("web");
    await page.waitForTimeout(500);

    // Only production web servers should show:
    // exg-web-prod-01, exg-web-prod-02, exg-web-eu-01
    await expect(
      page.locator("text=exg-web-prod-01").first()
    ).toBeVisible();
    await expect(
      page.locator("text=exg-web-prod-02").first()
    ).toBeVisible();

    // Non-web assets should not show
    await expect(
      page.locator("text=exg-db-prod-01").first()
    ).not.toBeVisible();
    await expect(
      page.locator("text=exg-api-prod-01").first()
    ).not.toBeVisible();

    // Staging web server should not show (wrong tag)
    await expect(
      page.locator("text=exg-web-staging-01").first()
    ).not.toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Empty search results show "No assets match your filters."
  // -------------------------------------------------------------------------
  test('Empty search results show "No assets match your filters" message', async ({
    page,
  }) => {
    await navigateTo(page, "/assets");

    await expect(
      page.locator("h1:has-text('Asset Inventory')")
    ).toBeVisible({ timeout: 15000 });

    // Wait for assets to load
    await expect(
      page.locator("text=exg-web-prod-01").first()
    ).toBeVisible({ timeout: 10000 });

    // Search for something that will not match any asset
    const searchInput = page.locator(
      'input[placeholder="Search by name, hostname, or IP address..."]'
    );
    await searchInput.fill("zzz-nonexistent-asset-xyz");
    await page.waitForTimeout(500);

    // The empty state message should appear
    await expect(
      page.locator("text=No assets match your filters.")
    ).toBeVisible({ timeout: 5000 });

    // The filtered count should be 0
    await expect(page.locator("text=Assets (0)")).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Create new asset via API call, then verify in list
  // -------------------------------------------------------------------------
  test("Create new asset via API and verify it appears in the asset list", async ({
    page,
  }) => {
    // Create a new asset via the API
    const newAssetName = `e2e-test-asset-${Date.now()}`;
    const createResponse = await apiCall(page, "POST", "/api/assets/create", {
      name: newAssetName,
      type: "server",
      hostname: `${newAssetName}.exargen.io`,
      ipAddress: "10.99.99.1",
      os: "Ubuntu 24.04 LTS",
      criticality: "medium",
    });

    // Verify the API response
    expect(createResponse.status).toBe(200);
    const createdAsset = createResponse.data as Record<string, unknown>;
    expect(createdAsset).toHaveProperty("id");

    // Now navigate to the assets page and verify the new asset appears
    await navigateTo(page, "/assets");

    await expect(
      page.locator("h1:has-text('Asset Inventory')")
    ).toBeVisible({ timeout: 15000 });

    // Search for the new asset by name
    const searchInput = page.locator(
      'input[placeholder="Search by name, hostname, or IP address..."]'
    );
    await searchInput.fill(newAssetName);
    await page.waitForTimeout(500);

    // The new asset should appear
    await expect(
      page.locator(`text=${newAssetName}`).first()
    ).toBeVisible({ timeout: 10000 });

    // Verify the asset count increased (should be 13 now)
    // Clear the search first to see all assets
    await searchInput.fill("");
    await page.waitForTimeout(500);

    const assetsTitle = page.locator('h3:has-text("Assets")');
    const titleText = await assetsTitle.textContent();
    const match = titleText?.match(/Assets \((\d+)\)/);
    if (match) {
      const totalCount = parseInt(match[1], 10);
      expect(totalCount).toBeGreaterThanOrEqual(13);
    }
  });

  // -------------------------------------------------------------------------
  // Asset table shows correct type badges, criticality badges, and tags
  // -------------------------------------------------------------------------
  test("Asset table displays correct type badges, criticality badges, and tags", async ({
    page,
  }) => {
    await navigateTo(page, "/assets");

    await expect(
      page.locator("h1:has-text('Asset Inventory')")
    ).toBeVisible({ timeout: 15000 });

    // Wait for assets to load
    await expect(
      page.locator("text=exg-web-prod-01").first()
    ).toBeVisible({ timeout: 10000 });

    // Verify type badges exist for different asset types from seed data
    // exg-web-prod-01 is type "server" -> displayed as "Server" badge
    await expect(page.locator("text=Server").first()).toBeVisible();

    // exg-fw-prod-01 is type "network_device" -> displayed as "Network Device"
    await expect(
      page.locator("text=Network Device").first()
    ).toBeVisible();

    // exg-db-prod-01 is type "database" -> displayed as "Database"
    await expect(page.locator("text=Database").first()).toBeVisible();

    // exg-app-dev-01 is type "cloud_resource" -> displayed as "Cloud Resource"
    await expect(
      page.locator("text=Cloud Resource").first()
    ).toBeVisible();

    // Verify criticality badges
    // Seed data has critical, high, medium, and low criticality assets
    await expect(page.locator("text=critical").first()).toBeVisible();
    await expect(page.locator("text=high").first()).toBeVisible();
    await expect(page.locator("text=medium").first()).toBeVisible();
    await expect(page.locator("text=low").first()).toBeVisible();

    // Verify tags are displayed on assets
    // exg-web-prod-01 should have env:production tag
    await expect(
      page.locator("text=env:production").first()
    ).toBeVisible();

    // Verify other tags exist
    await expect(
      page.locator("text=region:us-east-1").first()
    ).toBeVisible();

    // Verify status badges (all seed assets are "active")
    await expect(page.locator("text=active").first()).toBeVisible();

    // Verify OS values are displayed
    await expect(
      page.locator("text=Ubuntu 22.04 LTS").first()
    ).toBeVisible();
    await expect(
      page.locator("text=PostgreSQL 16").first()
    ).toBeVisible();

    // Verify IP addresses are displayed in the table
    await expect(page.locator("text=10.0.1.10").first()).toBeVisible();
    await expect(page.locator("text=10.0.3.10").first()).toBeVisible();
  });
});
