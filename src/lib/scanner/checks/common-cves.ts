/**
 * Common CVE Check Module
 *
 * Checks for indicators of well-known CVEs by probing
 * specific endpoints and analyzing responses.
 */

import { CheckModule, CheckResult } from "../types";
import { getVulnById } from "../vulnerability-db";

interface CVECheck {
  vulnId: string;
  paths: string[];
  method: "GET" | "HEAD";
  headers?: Record<string, string>;
  detectFn: (status: number, headers: Record<string, string>, body: string) => boolean;
}

const CVE_CHECKS: CVECheck[] = [
  {
    // Log4Shell — check for Java-based servers with Log4j indicators
    vulnId: "log4j-indicator",
    paths: ["/"],
    method: "GET",
    headers: {},
    detectFn: (_status, headers, body) => {
      const server = headers["server"] || "";
      const powered = headers["x-powered-by"] || "";
      // Look for Java/Spring/Tomcat indicators
      const isJava =
        server.toLowerCase().includes("tomcat") ||
        server.toLowerCase().includes("jetty") ||
        powered.toLowerCase().includes("servlet") ||
        body.includes("java.lang") ||
        body.includes("org.apache");
      // Only flag if it looks like a Java server
      return isJava;
    },
  },
  {
    // Spring4Shell — check for Spring Framework indicators
    vulnId: "spring4shell-indicator",
    paths: ["/", "/actuator", "/actuator/env"],
    method: "GET",
    detectFn: (_status, headers, body) => {
      const lower = body.toLowerCase();
      return (
        lower.includes("spring") ||
        lower.includes("whitelabel error page") ||
        headers["x-application-context"] !== undefined
      );
    },
  },
  {
    // Apache path traversal (CVE-2021-41773)
    vulnId: "apache-path-traversal",
    paths: ["/"],
    method: "HEAD",
    detectFn: (_status, headers) => {
      const server = headers["server"] || "";
      // Check for vulnerable Apache versions
      return /Apache\/2\.4\.(49|50)\b/.test(server);
    },
  },
  {
    // WordPress XML-RPC
    vulnId: "wordpress-xmlrpc",
    paths: ["/xmlrpc.php"],
    method: "GET",
    detectFn: (status, _headers, body) => {
      return status === 405 || (status === 200 && body.includes("XML-RPC server accepts POST requests only"));
    },
  },
  {
    // jQuery XSS — check for outdated jQuery
    vulnId: "jquery-xss",
    paths: ["/"],
    method: "GET",
    detectFn: (_status, _headers, body) => {
      // Look for jQuery version strings in HTML
      const jqueryMatch = body.match(/jquery[.-](\d+)\.(\d+)\.(\d+)/i);
      if (jqueryMatch) {
        const [, major, minor] = jqueryMatch.map(Number);
        return major < 3 || (major === 3 && minor < 5);
      }
      // Check for CDN links to old jQuery
      return /jquery\/[123]\.\d+\.\d+\/jquery/.test(body);
    },
  },
];

async function probeEndpoint(
  baseUrl: string,
  path: string,
  method: "GET" | "HEAD",
  extraHeaders?: Record<string, string>
): Promise<{ status: number; headers: Record<string, string>; body: string } | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "BYOC-Scanner/1.0", ...extraHeaders },
    });
    clearTimeout(timeout);

    const headers: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    const body = method === "HEAD" ? "" : await res.text();
    return { status: res.status, headers, body };
  } catch {
    return null;
  }
}

export const commonCvesCheck: CheckModule = {
  id: "common-cves",
  name: "Common CVE Detection",

  async run(target: string): Promise<CheckResult[]> {
    const results: CheckResult[] = [];
    const baseUrls = target.startsWith("http") ? [target] : [`https://${target}`, `http://${target}`];

    let workingBaseUrl: string | null = null;
    for (const base of baseUrls) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        await fetch(base, { redirect: "follow", signal: controller.signal });
        clearTimeout(timeout);
        workingBaseUrl = base;
        break;
      } catch {
        continue;
      }
    }

    if (!workingBaseUrl) return [];

    for (const check of CVE_CHECKS) {
      for (const path of check.paths) {
        const response = await probeEndpoint(workingBaseUrl, path, check.method, check.headers);
        if (!response) continue;

        const detected = check.detectFn(response.status, response.headers, response.body);
        if (detected) {
          const vuln = getVulnById(check.vulnId);
          if (vuln) {
            results.push({
              title: vuln.title,
              severity: vuln.severity,
              description: vuln.description,
              remediation: vuln.remediation,
              cveId: vuln.cveId,
              cvssScore: vuln.cvssScore,
              details: { target, path, baseUrl: workingBaseUrl },
            });
          }
          break; // Found the CVE, no need to check more paths
        }
      }
    }

    return results;
  },
};
