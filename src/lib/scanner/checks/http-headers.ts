/**
 * HTTP Security Headers Check Module
 *
 * Checks for missing or misconfigured security headers on HTTP/HTTPS targets.
 */

import { CheckModule, CheckResult } from "../types";
import { getVulnById } from "../vulnerability-db";

const SECURITY_HEADERS = [
  { header: "content-security-policy", vulnId: "missing-csp" },
  { header: "strict-transport-security", vulnId: "missing-hsts" },
  { header: "x-frame-options", vulnId: "missing-x-frame-options" },
  { header: "x-content-type-options", vulnId: "missing-x-content-type" },
  { header: "referrer-policy", vulnId: "missing-referrer-policy" },
  { header: "permissions-policy", vulnId: "missing-permissions-policy" },
];

async function fetchHeaders(target: string): Promise<{ headers: Record<string, string>; status: number } | null> {
  const urls = target.startsWith("http") ? [target] : [`https://${target}`, `http://${target}`];

  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(url, {
        method: "HEAD",
        redirect: "follow",
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const headers: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });
      return { headers, status: res.status };
    } catch {
      continue;
    }
  }
  return null;
}

export const httpHeadersCheck: CheckModule = {
  id: "http-headers",
  name: "HTTP Security Headers",

  async run(target: string): Promise<CheckResult[]> {
    const results: CheckResult[] = [];
    const response = await fetchHeaders(target);

    if (!response) {
      return []; // Target not reachable via HTTP — skip silently
    }

    const { headers } = response;

    // Check for missing security headers
    for (const { header, vulnId } of SECURITY_HEADERS) {
      if (!headers[header]) {
        const vuln = getVulnById(vulnId);
        if (vuln) {
          results.push({
            title: vuln.title,
            severity: vuln.severity,
            description: vuln.description,
            remediation: vuln.remediation,
            cveId: vuln.cveId,
            cvssScore: vuln.cvssScore,
            details: { missingHeader: header, target },
          });
        }
      }
    }

    // Check for information disclosure headers
    const serverHeader = headers["server"];
    if (serverHeader && /\d+\.\d+/.test(serverHeader)) {
      const vuln = getVulnById("server-version-exposed");
      if (vuln) {
        results.push({
          title: vuln.title,
          severity: vuln.severity,
          description: vuln.description,
          remediation: vuln.remediation,
          cvssScore: vuln.cvssScore,
          details: { serverHeader, target },
        });
      }
    }

    const poweredBy = headers["x-powered-by"];
    if (poweredBy) {
      const vuln = getVulnById("x-powered-by-exposed");
      if (vuln) {
        results.push({
          title: vuln.title,
          severity: vuln.severity,
          description: vuln.description,
          remediation: vuln.remediation,
          cvssScore: vuln.cvssScore,
          details: { poweredBy, target },
        });
      }
    }

    // Check CORS
    const corsHeader = headers["access-control-allow-origin"];
    if (corsHeader === "*") {
      const vuln = getVulnById("cors-wildcard");
      if (vuln) {
        results.push({
          title: vuln.title,
          severity: vuln.severity,
          description: vuln.description,
          remediation: vuln.remediation,
          cveId: vuln.cveId,
          cvssScore: vuln.cvssScore,
          details: { corsHeader, target },
        });
      }
    }

    return results;
  },
};
