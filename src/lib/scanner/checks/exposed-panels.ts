/**
 * Exposed Panels Check Module
 *
 * Checks for publicly accessible admin panels, debug endpoints,
 * and sensitive interfaces.
 */

import { CheckModule, CheckResult } from "../types";
import { getVulnById } from "../vulnerability-db";

interface PanelCheck {
  paths: string[];
  vulnId: string;
  signatures: string[]; // HTML content indicators
}

const PANEL_CHECKS: PanelCheck[] = [
  {
    paths: ["/admin", "/wp-admin", "/administrator", "/admin/login", "/manage", "/backend"],
    vulnId: "exposed-admin-panel",
    signatures: ["login", "admin", "dashboard", "sign in", "password"],
  },
  {
    paths: ["/phpmyadmin", "/pma", "/phpMyAdmin", "/myadmin"],
    vulnId: "exposed-phpmyadmin",
    signatures: ["phpmyadmin", "phpMyAdmin", "mysql"],
  },
  {
    paths: ["/swagger", "/swagger-ui", "/api-docs", "/docs", "/graphql", "/graphiql", "/playground"],
    vulnId: "exposed-api-docs",
    signatures: ["swagger", "openapi", "graphql", "playground", "api documentation"],
  },
  {
    paths: ["/debug", "/debug/vars", "/_profiler", "/metrics", "/actuator", "/actuator/health", "/__debug__"],
    vulnId: "exposed-debug-endpoint",
    signatures: ["debug", "metrics", "profiler", "actuator", "cmdline", "memstats"],
  },
];

async function checkPath(baseUrl: string, path: string, signatures: string[]): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${baseUrl}${path}`, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "BYOC-Scanner/1.0" },
    });
    clearTimeout(timeout);

    // Only flag if we get a 200 and the content matches signatures
    if (res.status === 200) {
      const text = await res.text();
      const lower = text.toLowerCase();
      return signatures.some((sig) => lower.includes(sig));
    }
    return false;
  } catch {
    return false;
  }
}

export const exposedPanelsCheck: CheckModule = {
  id: "exposed-panels",
  name: "Exposed Panels Detection",

  async run(target: string): Promise<CheckResult[]> {
    const results: CheckResult[] = [];
    const baseUrls = target.startsWith("http") ? [target] : [`https://${target}`, `http://${target}`];

    let workingBaseUrl: string | null = null;

    // Find a working base URL first
    for (const base of baseUrls) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(base, { redirect: "follow", signal: controller.signal });
        clearTimeout(timeout);
        if (res.ok || res.status < 500) {
          workingBaseUrl = base;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!workingBaseUrl) return [];

    // Check each panel type
    for (const check of PANEL_CHECKS) {
      for (const path of check.paths) {
        const found = await checkPath(workingBaseUrl, path, check.signatures);
        if (found) {
          const vuln = getVulnById(check.vulnId);
          if (vuln) {
            results.push({
              title: `${vuln.title} (${path})`,
              severity: vuln.severity,
              description: vuln.description,
              remediation: vuln.remediation,
              cveId: vuln.cveId,
              cvssScore: vuln.cvssScore,
              details: { target, path, baseUrl: workingBaseUrl },
            });
          }
          break; // One finding per panel type is enough
        }
      }
    }

    return results;
  },
};
