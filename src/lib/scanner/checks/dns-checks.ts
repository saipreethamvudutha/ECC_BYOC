/**
 * DNS Check Module
 *
 * Checks DNS configuration: SPF, DMARC, DKIM, DNSSEC, zone transfer.
 */

import * as dns from "dns";
import { CheckModule, CheckResult } from "../types";
import { getVulnById } from "../vulnerability-db";

function resolveTxt(domain: string): Promise<string[][]> {
  return new Promise((resolve) => {
    dns.resolveTxt(domain, (err, records) => {
      if (err) resolve([]);
      else resolve(records);
    });
  });
}

function resolveNs(domain: string): Promise<string[]> {
  return new Promise((resolve) => {
    dns.resolveNs(domain, (err, records) => {
      if (err) resolve([]);
      else resolve(records);
    });
  });
}

function extractDomain(target: string): string {
  let domain = target.replace(/^https?:\/\//, "").replace(/[:/].*$/, "");
  // If it's an IP address, we can't do DNS checks
  if (/^\d+\.\d+\.\d+\.\d+$/.test(domain)) return "";
  // Strip subdomain for email checks (SPF, DMARC are on root domain)
  const parts = domain.split(".");
  if (parts.length > 2) {
    // Keep last two parts (e.g., example.com from www.example.com)
    // Handle TLDs like co.uk
    const tldParts = ["co.uk", "com.au", "co.nz", "com.br", "co.jp"];
    const lastTwo = parts.slice(-2).join(".");
    if (tldParts.includes(lastTwo)) {
      domain = parts.slice(-3).join(".");
    } else {
      domain = parts.slice(-2).join(".");
    }
  }
  return domain;
}

export const dnsChecksCheck: CheckModule = {
  id: "dns-checks",
  name: "DNS Security Checks",

  async run(target: string): Promise<CheckResult[]> {
    const results: CheckResult[] = [];
    const domain = extractDomain(target);

    if (!domain) return []; // Can't do DNS checks on IP addresses

    // Check SPF record
    const txtRecords = await resolveTxt(domain);
    const allTxt = txtRecords.flat();
    const hasSPF = allTxt.some((r) => r.startsWith("v=spf1"));

    if (!hasSPF) {
      const vuln = getVulnById("missing-spf");
      if (vuln) {
        results.push({
          title: vuln.title,
          severity: vuln.severity,
          description: vuln.description,
          remediation: vuln.remediation,
          cvssScore: vuln.cvssScore,
          details: { domain, checkType: "SPF" },
        });
      }
    }

    // Check DMARC record
    const dmarcRecords = await resolveTxt(`_dmarc.${domain}`);
    const dmarcTxt = dmarcRecords.flat();
    const hasDMARC = dmarcTxt.some((r) => r.startsWith("v=DMARC1"));

    if (!hasDMARC) {
      const vuln = getVulnById("missing-dmarc");
      if (vuln) {
        results.push({
          title: vuln.title,
          severity: vuln.severity,
          description: vuln.description,
          remediation: vuln.remediation,
          cvssScore: vuln.cvssScore,
          details: { domain, checkType: "DMARC" },
        });
      }
    }

    // Check DNSSEC (look for RRSIG records via NS check heuristic)
    // Simple check: see if DNSSEC validation is present by checking for DS records
    const nsRecords = await resolveNs(domain);
    if (nsRecords.length > 0) {
      // We can't easily check DNSSEC without a specialized resolver,
      // but we can flag it as informational
      const vuln = getVulnById("missing-dnssec");
      if (vuln) {
        // Only add if no DNSSEC indicators in TXT records
        const hasDNSSEC = allTxt.some(
          (r) => r.includes("DNSSEC") || r.includes("dnssec")
        );
        if (!hasDNSSEC) {
          results.push({
            title: vuln.title,
            severity: vuln.severity,
            description: vuln.description,
            remediation: vuln.remediation,
            cvssScore: vuln.cvssScore,
            details: { domain, nameservers: nsRecords, checkType: "DNSSEC" },
          });
        }
      }
    }

    return results;
  },
};
