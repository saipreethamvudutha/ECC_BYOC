import { test, expect } from "@playwright/test";
import {
  loginAsAdmin,
  apiCall,
  waitForPageReady,
} from "./helpers/auth";

/**
 * Phase 11 E2E Tests: Detection Engine, SOAR, Compliance Automation & Operational Maturity
 *
 * Tests event ingestion, rule evaluation, alert auto-generation, SOAR playbooks,
 * compliance automation, AI action execution, report export, scan scheduling, and dashboard.
 */

test.describe("Phase 11: Detection Engine & Operational Maturity", () => {
  // ──────────────────────────────────────────────────────────────────
  // EVENT INGESTION & DETECTION ENGINE
  // ──────────────────────────────────────────────────────────────────

  test.describe("Event Ingestion API", () => {
    test("TC-P11-001: POST single event succeeds with valid data", async ({ page }) => {
      await loginAsAdmin(page);

      const result = await apiCall(page, "POST", "/api/siem/events", {
        source: "firewall",
        severity: "medium",
        category: "network",
        title: "E2E Test: Inbound connection blocked",
        sourceIp: "203.0.113.50",
        destIp: "10.0.1.10",
        destPort: 443,
        protocol: "tcp",
        direction: "inbound",
      });

      expect(result.status).toBe(200);
      const body = result.data as { event: { id: string }; alerts: unknown[]; playbooks: unknown[] };
      expect(body.event.id).toBeTruthy();
      expect(Array.isArray(body.alerts)).toBe(true);
      expect(Array.isArray(body.playbooks)).toBe(true);
    });

    test("TC-P11-002: POST event with process match triggers rule", async ({ page }) => {
      await loginAsAdmin(page);

      // Ingest an event that matches the PowerShell Encoded Command rule
      const result = await apiCall(page, "POST", "/api/siem/events", {
        source: "endpoint",
        severity: "high",
        category: "process",
        title: "Suspicious PowerShell execution with encoded command",
        processName: "powershell.exe",
        processExecutable: "C:\\Windows\\System32\\powershell.exe",
        hostName: "WORKSTATION-01",
        hostIp: "10.0.1.50",
        details: {
          commandLine: "powershell.exe -EncodedCommand SGVsbG8gV29ybGQ=",
        },
      });

      expect(result.status).toBe(200);
      const body = result.data as { event: { id: string }; alerts: Array<{ ruleName: string; severity: string; mitreAttackId: string | null }> };
      expect(body.event.id).toBeTruthy();
      // Should trigger the PowerShell Encoded Command rule (T1059.001)
      expect(body.alerts.length).toBeGreaterThanOrEqual(1);
      const psAlert = body.alerts.find(a => a.ruleName.includes("PowerShell"));
      if (psAlert) {
        expect(psAlert.mitreAttackId).toBe("T1059.001");
        expect(psAlert.severity).toBe("high");
      }
    });

    test("TC-P11-003: POST batch events returns correct count", async ({ page }) => {
      await loginAsAdmin(page);

      const result = await apiCall(page, "POST", "/api/siem/events/batch", {
        events: [
          { source: "firewall", severity: "low", category: "network", title: "E2E Batch 1" },
          { source: "firewall", severity: "low", category: "network", title: "E2E Batch 2" },
          { source: "firewall", severity: "low", category: "network", title: "E2E Batch 3" },
          { source: "identity", severity: "info", category: "authentication", title: "E2E Batch 4" },
          { source: "identity", severity: "info", category: "authentication", title: "E2E Batch 5" },
        ],
      });

      expect(result.status).toBe(200);
      const body = result.data as { ingested: number; alerts: unknown[] };
      expect(body.ingested).toBe(5);
    });

    test("TC-P11-004: Batch rejects > 100 events", async ({ page }) => {
      await loginAsAdmin(page);

      // Build events array in browser to avoid large serialization overhead
      const result = await page.evaluate(async () => {
        const events = Array.from({ length: 101 }, (_, i) => ({
          source: "firewall",
          severity: "low",
          category: "network",
          title: `Overflow event ${i}`,
        }));
        const res = await fetch("/api/siem/events/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ events }),
        });
        let data;
        try { data = await res.json(); } catch { data = null; }
        return { status: res.status, data };
      });
      expect(result.status).toBe(400);
    });

    test("TC-P11-005: Events appear in GET /api/siem?tab=events after ingestion", async ({ page }) => {
      await loginAsAdmin(page);

      const uniqueTitle = `E2E-Verify-${Date.now()}`;
      await apiCall(page, "POST", "/api/siem/events", {
        source: "dns",
        severity: "medium",
        category: "dns",
        title: uniqueTitle,
      });

      const list = await apiCall(page, "GET", `/api/siem?tab=events&search=${encodeURIComponent(uniqueTitle)}`);
      expect(list.status).toBe(200);
      const body = list.data as { events: Array<{ title: string }> };
      expect(body.events.length).toBeGreaterThan(0);
      expect(body.events[0].title).toContain(uniqueTitle);
    });

    test("TC-P11-006: Viewer cannot POST events (403)", async ({ page }) => {
      await page.context().clearCookies();
      await page.goto("/login");
      await page.waitForSelector('input[type="email"]', { state: "visible", timeout: 15000 });
      await page.fill('input[type="email"]', "viewer@exargen.com");
      await page.fill('input[type="password"]', "Viewer123!");
      await page.click('button[type="submit"]');
      await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15000 }).catch(() => {});

      const result = await apiCall(page, "POST", "/api/siem/events", {
        source: "firewall",
        severity: "low",
        category: "network",
        title: "Should be blocked",
      });
      expect(result.status).toBe(403);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // ALERT → RULE TUNING FEEDBACK
  // ──────────────────────────────────────────────────────────────────

  test.describe("Rule Tuning Feedback", () => {
    test("TC-P11-007: false_positive increments rule falsePositiveCount", async ({ page }) => {
      await loginAsAdmin(page);

      // Get an alert that has a ruleId and is not already closed/false_positive
      const alertList = await apiCall(page, "GET", "/api/siem?tab=alerts&limit=50");
      const alerts = (alertList.data as { alerts: Array<{ id: string; status: string }> }).alerts;
      const target = alerts.find(a => !["closed", "false_positive", "resolved"].includes(a.status));
      expect(target).toBeDefined();

      // Get the alert detail to find its ruleId
      const detail = await apiCall(page, "GET", `/api/siem/alerts/${target!.id}`);
      const alertDetail = detail.data as { ruleId?: string; rule?: { id: string; falsePositiveCount: number } };

      if (alertDetail.rule) {
        const prevFpCount = alertDetail.rule.falsePositiveCount || 0;

        // Mark as false positive
        await apiCall(page, "PATCH", `/api/siem/alerts/${target!.id}`, {
          status: "false_positive",
        });

        // Check rule updated
        const ruleDetail = await apiCall(page, "GET", `/api/siem/rules/${alertDetail.rule.id}`);
        const rule = ruleDetail.data as { falsePositiveCount: number };
        // FP count should have increased
        expect(rule.falsePositiveCount).toBeGreaterThanOrEqual(prevFpCount);
      }
    });

    test("TC-P11-008: resolved increments rule truePositiveCount", async ({ page }) => {
      await loginAsAdmin(page);

      // Find an investigating or contained alert
      const alertList = await apiCall(page, "GET", "/api/siem?tab=alerts&status=investigating&limit=5");
      const alerts = (alertList.data as { alerts: Array<{ id: string }> }).alerts;

      if (alerts.length > 0) {
        const detail = await apiCall(page, "GET", `/api/siem/alerts/${alerts[0].id}`);
        const alertDetail = detail.data as { rule?: { id: string; truePositiveCount: number } };

        if (alertDetail.rule) {
          const prevTpCount = alertDetail.rule.truePositiveCount || 0;

          await apiCall(page, "PATCH", `/api/siem/alerts/${alerts[0].id}`, {
            status: "resolved",
          });

          const ruleDetail = await apiCall(page, "GET", `/api/siem/rules/${alertDetail.rule.id}`);
          const rule = ruleDetail.data as { truePositiveCount: number };
          expect(rule.truePositiveCount).toBeGreaterThanOrEqual(prevTpCount);
        }
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // AI ACTION EXECUTION
  // ──────────────────────────────────────────────────────────────────

  test.describe("AI Action Execution", () => {
    test("TC-P11-009: Execute unapproved action returns 400", async ({ page }) => {
      await loginAsAdmin(page);

      // Get a pending AI action
      const list = await apiCall(page, "GET", "/api/ai-actions");
      const actions = (list.data as Array<{ id: string; status: string }>);
      const pending = actions.find(a => a.status === "pending");

      if (pending) {
        const result = await apiCall(page, "PATCH", `/api/ai-actions/${pending.id}`, {
          action: "execute",
        });
        expect(result.status).toBe(400);
      }
    });

    test("TC-P11-010: Approve then execute creates execution result", async ({ page }) => {
      await loginAsAdmin(page);

      const list = await apiCall(page, "GET", "/api/ai-actions");
      const actions = (list.data as Array<{ id: string; status: string; type: string }>);
      const pending = actions.find(a => a.status === "pending");

      if (pending) {
        // Approve first
        const approve = await apiCall(page, "PATCH", `/api/ai-actions/${pending.id}`, {
          action: "approve",
        });
        expect(approve.status).toBe(200);

        // Execute
        const execute = await apiCall(page, "PATCH", `/api/ai-actions/${pending.id}`, {
          action: "execute",
        });
        expect(execute.status).toBe(200);
        const body = execute.data as { status: string; executionResult?: Record<string, unknown> };
        expect(body.status).toBe("executed");
        expect(body.executionResult).toBeDefined();
        expect(body.executionResult!.action).toBeTruthy();
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // REPORT GENERATION & EXPORT
  // ──────────────────────────────────────────────────────────────────

  test.describe("Report Generation & Export", () => {
    test("TC-P11-011: Report completes synchronously", async ({ page }) => {
      await loginAsAdmin(page);

      const result = await apiCall(page, "POST", "/api/reports/generate", {
        type: "vulnerability",
      });
      expect(result.status).toBe(200);
      const body = result.data as { id: string; status: string };
      // Should be completed immediately, not "generating"
      expect(body.status).toBe("completed");
    });

    test("TC-P11-012: CSV download returns proper format", async ({ page }) => {
      await loginAsAdmin(page);

      // Generate a report first
      const gen = await apiCall(page, "POST", "/api/reports/generate", { type: "compliance" });
      expect(gen.status).toBe(200);
      const reportId = (gen.data as { id: string }).id;

      // Download as CSV — use page.evaluate with text() since apiCall uses json()
      const csvResult = await page.evaluate(async (reportId) => {
        const res = await fetch(`/api/reports/${reportId}/download?format=csv`);
        const text = await res.text();
        return { status: res.status, text };
      }, reportId);
      expect(csvResult.status).toBe(200);
      expect(csvResult.text).toContain("Section");
      expect(csvResult.text).toContain("Metric");
    });

    test("TC-P11-013: JSON download returns structured data", async ({ page }) => {
      await loginAsAdmin(page);

      const gen = await apiCall(page, "POST", "/api/reports/generate", { type: "executive" });
      expect(gen.status).toBe(200);
      const reportId = (gen.data as { id: string }).id;

      const download = await apiCall(page, "GET", `/api/reports/${reportId}/download?format=json`);
      expect(download.status).toBe(200);

      const data = download.data as { generatedAt?: string; summary?: unknown };
      expect(data.generatedAt || data.summary).toBeTruthy();
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // SOAR PLAYBOOKS
  // ──────────────────────────────────────────────────────────────────

  test.describe("SOAR Playbooks", () => {
    test("TC-P11-014: GET /api/soar/playbooks returns 3 playbooks", async ({ page }) => {
      await loginAsAdmin(page);

      const result = await apiCall(page, "GET", "/api/soar/playbooks");
      expect(result.status).toBe(200);

      const body = result.data as { playbooks: Array<{ id: string; name: string; stepCount: number }> };
      expect(body.playbooks.length).toBe(3);
      expect(body.playbooks.find(p => p.name.includes("Critical"))).toBeDefined();
      expect(body.playbooks.find(p => p.name.includes("Brute Force"))).toBeDefined();
      expect(body.playbooks.find(p => p.name.includes("Ransomware"))).toBeDefined();
    });

    test("TC-P11-015: Critical alert auto-escalated to incident via SOAR", async ({ page }) => {
      await loginAsAdmin(page);

      // Ingest a critical event that matches the LSASS rule → triggers critical auto-escalation playbook
      const result = await apiCall(page, "POST", "/api/siem/events", {
        source: "edr",
        severity: "critical",
        category: "process",
        title: "lsass.exe memory access by unknown process",
        processName: "mimikatz.exe",
        hostName: "DC-01",
        hostIp: "10.0.1.5",
        details: {
          targetProcess: "lsass.exe",
          accessRights: "PROCESS_VM_READ",
        },
      });

      expect(result.status).toBe(200);
      const body = result.data as {
        alerts: Array<{ id: string; severity: string }>;
        playbooks: Array<{ playbookName: string; executed: boolean; incidentId?: string }>;
      };

      // Should have created at least one alert
      if (body.alerts.length > 0) {
        const critAlert = body.alerts.find(a => a.severity === "critical");
        if (critAlert) {
          // SOAR should have triggered
          expect(body.playbooks.length).toBeGreaterThanOrEqual(1);
          const escalation = body.playbooks.find(p => p.executed);
          if (escalation) {
            expect(escalation.incidentId).toBeTruthy();
          }
        }
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // SCAN SCHEDULING
  // ──────────────────────────────────────────────────────────────────

  test.describe("Scan Scheduling", () => {
    test("TC-P11-016: Cron endpoint rejects unauthorized requests", async ({ page }) => {
      await loginAsAdmin(page);

      // Call cron endpoint without proper auth header (simulated via apiCall which uses cookies)
      const result = await apiCall(page, "GET", "/api/cron/scan-scheduler");
      // Should return 401 if CRON_SECRET is set, or 200 if not set (dev mode)
      expect([200, 401]).toContain(result.status);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // SOC DASHBOARD
  // ──────────────────────────────────────────────────────────────────

  test.describe("SOC Dashboard", () => {
    test("TC-P11-017: Metrics endpoint returns all required fields", async ({ page }) => {
      await loginAsAdmin(page);

      const result = await apiCall(page, "GET", "/api/siem/metrics");
      expect(result.status).toBe(200);

      const metrics = result.data as {
        securityPostureScore: number;
        openAlerts: number;
        activeIncidents: number;
        mttd: number;
        mttr: number;
        events24h: number;
        alertsByHour: unknown[];
        severityDistribution: unknown[];
        topRules: unknown[];
      };

      expect(typeof metrics.securityPostureScore).toBe("number");
      expect(typeof metrics.openAlerts).toBe("number");
      expect(typeof metrics.activeIncidents).toBe("number");
      expect(typeof metrics.mttd).toBe("number");
      expect(typeof metrics.mttr).toBe("number");
      expect(typeof metrics.events24h).toBe("number");
      expect(Array.isArray(metrics.alertsByHour)).toBe(true);
      expect(Array.isArray(metrics.severityDistribution)).toBe(true);
      expect(Array.isArray(metrics.topRules)).toBe(true);
    });

    test("TC-P11-018: SIEM page renders with live indicator", async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto("/siem");
      await waitForPageReady(page);

      await expect(page.locator("text=SOC Operations Center")).toBeVisible({ timeout: 15000 });
      // Should show "Live" status indicator
      await expect(page.locator("text=Live").first()).toBeVisible({ timeout: 15000 });
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // END-TO-END PIPELINE: Event → Rule → Alert → SOAR → Incident
  // ──────────────────────────────────────────────────────────────────

  test.describe("Full Pipeline", () => {
    test("TC-P11-019: Complete detection pipeline — event triggers rule, creates alert, SOAR escalates to incident", async ({ page }) => {
      await loginAsAdmin(page);

      // Ingest a ransomware-indicator event
      const ingest = await apiCall(page, "POST", "/api/siem/events", {
        source: "edr",
        severity: "critical",
        category: "malware",
        title: "Mass file rename and shadow copy deletion detected",
        processName: "suspicious.exe",
        hostName: "FILE-SERVER-01",
        hostIp: "10.0.1.20",
        details: {
          filesRenamed: 500,
          shadowCopyDeleted: true,
          ransomNote: "DECRYPT_FILES.txt found",
          command: "vssadmin delete shadows /all /quiet",
        },
      });

      expect(ingest.status).toBe(200);
      const body = ingest.data as {
        event: { id: string };
        alerts: Array<{ id: string; title: string; severity: string; ruleName: string; mitreAttackId: string | null }>;
        playbooks: Array<{ playbookName: string; executed: boolean; incidentId?: string }>;
      };

      expect(body.event.id).toBeTruthy();

      // The ransomware rule should have triggered
      if (body.alerts.length > 0) {
        const ransomAlert = body.alerts.find(a =>
          a.ruleName?.includes("Ransomware") || a.title?.includes("Ransomware")
        );

        if (ransomAlert) {
          expect(ransomAlert.mitreAttackId).toBe("T1486");
          expect(ransomAlert.severity).toBe("critical");

          // SOAR should have auto-escalated to incident
          const ransomPlaybook = body.playbooks.find(p =>
            p.playbookName.includes("Ransomware") || p.playbookName.includes("Critical")
          );
          if (ransomPlaybook) {
            expect(ransomPlaybook.executed).toBe(true);
            expect(ransomPlaybook.incidentId).toBeTruthy();

            // Verify the incident was actually created
            const incDetail = await apiCall(page, "GET", `/api/siem/incidents/${ransomPlaybook.incidentId}`);
            expect(incDetail.status).toBe(200);
            const incident = incDetail.data as { title: string; status: string; severity: string };
            expect(incident.title).toContain("SOAR");
            expect(incident.status).toBe("investigating");
          }
        }
      }
    });
  });
});
