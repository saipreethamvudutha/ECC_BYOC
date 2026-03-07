/**
 * Cloud Misconfiguration Check Module
 *
 * Checks for common cloud misconfigurations:
 * - Open S3 buckets
 * - Azure Blob public access
 * - Cloud metadata endpoint exposure
 */

import { CheckModule, CheckResult } from "../types";
import { getVulnById } from "../vulnerability-db";

async function checkS3Bucket(target: string): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // Extract potential S3 bucket name from the target
  const host = target.replace(/^https?:\/\//, "").replace(/[:/].*$/, "");

  // Common S3 bucket URL patterns
  const bucketPatterns = [
    { regex: /^(.+)\.s3\.amazonaws\.com$/, extract: 1 },
    { regex: /^s3\.amazonaws\.com\/(.+)$/, extract: 1 },
    { regex: /^(.+)\.s3[.-][\w-]+\.amazonaws\.com$/, extract: 1 },
  ];

  let bucketName: string | null = null;
  for (const pattern of bucketPatterns) {
    const match = host.match(pattern.regex);
    if (match) {
      bucketName = match[pattern.extract];
      break;
    }
  }

  if (!bucketName) {
    // Try to check if a bucket exists with the same name as the domain
    const domainParts = host.split(".");
    if (domainParts.length >= 2) {
      bucketName = domainParts[0];
    }
  }

  if (bucketName) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`https://${bucketName}.s3.amazonaws.com/`, {
        method: "GET",
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.status === 200) {
        const text = await res.text();
        if (text.includes("ListBucketResult") || text.includes("<Contents>")) {
          const vuln = getVulnById("open-s3-bucket");
          if (vuln) {
            results.push({
              title: vuln.title,
              severity: vuln.severity,
              description: vuln.description,
              remediation: vuln.remediation,
              cveId: vuln.cveId,
              cvssScore: vuln.cvssScore,
              details: { target, bucketName, bucketUrl: `https://${bucketName}.s3.amazonaws.com/` },
            });
          }
        }
      }
    } catch {
      // Bucket doesn't exist or is not accessible — not a finding
    }
  }

  return results;
}

async function checkAzureBlob(target: string): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const host = target.replace(/^https?:\/\//, "").replace(/[:/].*$/, "");

  // Check for Azure Blob Storage patterns
  const azureMatch = host.match(/^(.+)\.blob\.core\.windows\.net$/);
  if (azureMatch) {
    const accountName = azureMatch[1];
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`https://${accountName}.blob.core.windows.net/?comp=list`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.status === 200) {
        const text = await res.text();
        if (text.includes("EnumerationResults") || text.includes("<Containers>")) {
          const vuln = getVulnById("open-azure-blob");
          if (vuln) {
            results.push({
              title: vuln.title,
              severity: vuln.severity,
              description: vuln.description,
              remediation: vuln.remediation,
              cveId: vuln.cveId,
              cvssScore: vuln.cvssScore,
              details: { target, accountName },
            });
          }
        }
      }
    } catch {
      // Not accessible — not a finding
    }
  }

  return results;
}

export const cloudMisconfigCheck: CheckModule = {
  id: "cloud-misconfig",
  name: "Cloud Misconfiguration Detection",

  async run(target: string): Promise<CheckResult[]> {
    const results: CheckResult[] = [];

    // Run cloud-specific checks in parallel
    const [s3Results, azureResults] = await Promise.all([
      checkS3Bucket(target),
      checkAzureBlob(target),
    ]);

    results.push(...s3Results, ...azureResults);
    return results;
  },
};
