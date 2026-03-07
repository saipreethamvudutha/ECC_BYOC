/**
 * Information Disclosure Check Module
 *
 * Checks for exposed sensitive files, directory listings,
 * and error message leakage.
 */

import { CheckModule, CheckResult } from "../types";
import { getVulnById } from "../vulnerability-db";

interface FileCheck {
  path: string;
  vulnId: string;
  signatures: string[];
  contentType?: string;
}

const SENSITIVE_FILES: FileCheck[] = [
  {
    path: "/.env",
    vulnId: "env-file-exposed",
    signatures: ["DB_", "DATABASE_URL", "API_KEY", "SECRET", "PASSWORD", "TOKEN"],
  },
  {
    path: "/.git/config",
    vulnId: "git-directory-exposed",
    signatures: ["[core]", "[remote", "repositoryformatversion", "bare ="],
  },
  {
    path: "/.git/HEAD",
    vulnId: "git-directory-exposed",
    signatures: ["ref: refs/heads/", "ref: refs/"],
  },
  {
    path: "/backup.sql",
    vulnId: "backup-file-exposed",
    signatures: ["CREATE TABLE", "INSERT INTO", "DROP TABLE", "mysqldump"],
  },
  {
    path: "/db.sql",
    vulnId: "backup-file-exposed",
    signatures: ["CREATE TABLE", "INSERT INTO", "DROP TABLE"],
  },
  {
    path: "/backup.zip",
    vulnId: "backup-file-exposed",
    signatures: [], // Check by status code + content-type
    contentType: "application/zip",
  },
  {
    path: "/config.php.bak",
    vulnId: "backup-file-exposed",
    signatures: ["<?php", "password", "database"],
  },
];

async function checkFile(baseUrl: string, file: FileCheck): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${baseUrl}${file.path}`, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "BYOC-Scanner/1.0" },
    });
    clearTimeout(timeout);

    if (res.status !== 200) return false;

    // For binary files, check content-type
    if (file.contentType) {
      return res.headers.get("content-type")?.includes(file.contentType) ?? false;
    }

    // For text files, check signatures in content
    if (file.signatures.length > 0) {
      const text = await res.text();
      return file.signatures.some((sig) => text.includes(sig));
    }

    return false;
  } catch {
    return false;
  }
}

async function checkDirectoryListing(baseUrl: string): Promise<boolean> {
  const testPaths = ["/", "/images/", "/assets/", "/uploads/", "/static/"];

  for (const path of testPaths) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`${baseUrl}${path}`, {
        redirect: "follow",
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.status === 200) {
        const text = await res.text();
        const lower = text.toLowerCase();
        if (
          lower.includes("index of /") ||
          lower.includes("directory listing") ||
          lower.includes("<title>index of")
        ) {
          return true;
        }
      }
    } catch {
      continue;
    }
  }
  return false;
}

async function checkErrorDisclosure(baseUrl: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    // Request a path likely to trigger an error
    const res = await fetch(`${baseUrl}/nonexistent-path-${Date.now()}'`, {
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const text = await res.text();
    const lower = text.toLowerCase();
    // Check for stack traces or debug info
    return (
      lower.includes("stack trace") ||
      lower.includes("traceback") ||
      lower.includes("at module") ||
      lower.includes("exception in") ||
      lower.includes("syntax error") ||
      /at .+\.js:\d+:\d+/.test(text) ||
      /file ".*\.py", line \d+/i.test(text)
    );
  } catch {
    return false;
  }
}

export const infoDisclosureCheck: CheckModule = {
  id: "info-disclosure",
  name: "Information Disclosure",

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

    // Check sensitive files
    const foundVulns = new Set<string>();
    for (const file of SENSITIVE_FILES) {
      if (foundVulns.has(file.vulnId)) continue; // One finding per vuln type
      const found = await checkFile(workingBaseUrl, file);
      if (found) {
        foundVulns.add(file.vulnId);
        const vuln = getVulnById(file.vulnId);
        if (vuln) {
          results.push({
            title: `${vuln.title} (${file.path})`,
            severity: vuln.severity,
            description: vuln.description,
            remediation: vuln.remediation,
            cveId: vuln.cveId,
            cvssScore: vuln.cvssScore,
            details: { target, path: file.path, baseUrl: workingBaseUrl },
          });
        }
      }
    }

    // Check directory listing
    const hasDirectoryListing = await checkDirectoryListing(workingBaseUrl);
    if (hasDirectoryListing) {
      const vuln = getVulnById("directory-listing-enabled");
      if (vuln) {
        results.push({
          title: vuln.title,
          severity: vuln.severity,
          description: vuln.description,
          remediation: vuln.remediation,
          cveId: vuln.cveId,
          cvssScore: vuln.cvssScore,
          details: { target, baseUrl: workingBaseUrl },
        });
      }
    }

    // Check error disclosure
    const hasErrorDisclosure = await checkErrorDisclosure(workingBaseUrl);
    if (hasErrorDisclosure) {
      const vuln = getVulnById("error-stack-trace");
      if (vuln) {
        results.push({
          title: vuln.title,
          severity: vuln.severity,
          description: vuln.description,
          remediation: vuln.remediation,
          cveId: vuln.cveId,
          cvssScore: vuln.cvssScore,
          details: { target, baseUrl: workingBaseUrl },
        });
      }
    }

    return results;
  },
};
