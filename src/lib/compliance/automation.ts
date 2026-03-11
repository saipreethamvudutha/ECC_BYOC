/**
 * BYOC Compliance Automation Engine
 *
 * Phase 11: Automatically maps scanner findings to compliance controls.
 * After a scan completes, updates relevant compliance controls based on
 * the check module → control mapping.
 */

import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";

// ─── Scanner Check → Compliance Control Mapping ──────────────────

interface ControlMapping {
  frameworkName: string; // must match ComplianceFramework.name
  controlIdPattern: string; // partial match on ComplianceControl.controlId
}

/**
 * Maps each scanner check module to compliance controls it validates.
 * controlIdPattern is used for LIKE matching against ComplianceControl.controlId
 */
export const SCAN_TO_COMPLIANCE_MAP: Record<string, ControlMapping[]> = {
  "http-headers": [
    { frameworkName: "PCI DSS", controlIdPattern: "6" },        // Develop/Maintain Secure Systems
    { frameworkName: "NIST CSF", controlIdPattern: "PR.DS" },    // Data Security
    { frameworkName: "CIS Controls", controlIdPattern: "4" },    // Secure Configuration
    { frameworkName: "GDPR", controlIdPattern: "32" },           // Art. 32 Security of Processing
  ],
  "ssl-tls": [
    { frameworkName: "PCI DSS", controlIdPattern: "4" },         // Protect Data in Transit
    { frameworkName: "NIST CSF", controlIdPattern: "PR.DS" },    // Data Security
    { frameworkName: "CIS Controls", controlIdPattern: "3" },    // Data Protection
    { frameworkName: "HIPAA", controlIdPattern: "312(e)" },      // Transmission Security
    { frameworkName: "GDPR", controlIdPattern: "32" },           // Art. 32
  ],
  "common-cves": [
    { frameworkName: "PCI DSS", controlIdPattern: "6" },         // Develop/Maintain Secure Systems
    { frameworkName: "NIST CSF", controlIdPattern: "ID.RA" },    // Risk Assessment
    { frameworkName: "CIS Controls", controlIdPattern: "7" },    // Continuous Vulnerability Mgmt
  ],
  "exposed-panels": [
    { frameworkName: "PCI DSS", controlIdPattern: "7" },         // Restrict Access
    { frameworkName: "NIST CSF", controlIdPattern: "PR.AA" },    // Access Control
    { frameworkName: "CIS Controls", controlIdPattern: "4" },    // Secure Configuration
    { frameworkName: "HIPAA", controlIdPattern: "312(a)" },      // Access Controls
  ],
  "info-disclosure": [
    { frameworkName: "PCI DSS", controlIdPattern: "6" },
    { frameworkName: "CIS Controls", controlIdPattern: "4" },
    { frameworkName: "GDPR", controlIdPattern: "32" },
  ],
  "port-scan": [
    { frameworkName: "PCI DSS", controlIdPattern: "1" },         // Network Security Controls
    { frameworkName: "NIST CSF", controlIdPattern: "DE.CM" },    // Continuous Monitoring
    { frameworkName: "CIS Controls", controlIdPattern: "12" },   // Network Infrastructure
  ],
  "cloud-misconfig": [
    { frameworkName: "PCI DSS", controlIdPattern: "2" },         // Secure Configurations
    { frameworkName: "NIST CSF", controlIdPattern: "PR.PS" },    // Platform Security
    { frameworkName: "CIS Controls", controlIdPattern: "4" },
  ],
  "dns-checks": [
    { frameworkName: "NIST CSF", controlIdPattern: "DE.CM" },
    { frameworkName: "CIS Controls", controlIdPattern: "9" },    // Email/Web Protections
  ],
};

// ─── Severity → Compliance Status ────────────────────────────────

function severityToComplianceStatus(
  worstSeverity: string
): string {
  if (worstSeverity === "critical" || worstSeverity === "high") {
    return "non_compliant";
  }
  if (worstSeverity === "medium") {
    return "partially_compliant";
  }
  return "compliant"; // low, info, or no findings
}

const SEVERITY_ORDER: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

// ─── Main Automation Function ────────────────────────────────────

/**
 * After a scan completes, map findings to compliance controls and auto-update.
 * Returns count of updated controls and created assessments.
 */
export async function updateComplianceFromScan(
  scanId: string,
  tenantId: string
): Promise<{ updated: number; assessments: number }> {
  let updated = 0;
  let assessments = 0;

  // 1. Load scan results
  const results = await prisma.scanResult.findMany({
    where: { scanId, tenantId },
    select: { id: true, severity: true, title: true, details: true },
  });

  if (results.length === 0) return { updated: 0, assessments: 0 };

  // 2. Group findings by check module
  const findingsByModule: Record<string, { severity: string; title: string }[]> = {};

  for (const result of results) {
    let checkModule = "unknown";
    try {
      const details = JSON.parse(result.details || "{}");
      checkModule = details.checkModule || details.module || "unknown";
    } catch {
      // Try to infer from title
      const titleLower = result.title.toLowerCase();
      if (titleLower.includes("header") || titleLower.includes("csp") || titleLower.includes("hsts")) {
        checkModule = "http-headers";
      } else if (titleLower.includes("ssl") || titleLower.includes("tls") || titleLower.includes("certificate")) {
        checkModule = "ssl-tls";
      } else if (titleLower.includes("cve") || titleLower.includes("log4") || titleLower.includes("spring")) {
        checkModule = "common-cves";
      } else if (titleLower.includes("panel") || titleLower.includes("admin") || titleLower.includes("exposed")) {
        checkModule = "exposed-panels";
      } else if (titleLower.includes("disclosure") || titleLower.includes("version") || titleLower.includes("server")) {
        checkModule = "info-disclosure";
      } else if (titleLower.includes("port") || titleLower.includes("open port")) {
        checkModule = "port-scan";
      } else if (titleLower.includes("cloud") || titleLower.includes("s3") || titleLower.includes("aws")) {
        checkModule = "cloud-misconfig";
      } else if (titleLower.includes("dns") || titleLower.includes("spf") || titleLower.includes("dmarc")) {
        checkModule = "dns-checks";
      }
    }

    if (!findingsByModule[checkModule]) findingsByModule[checkModule] = [];
    findingsByModule[checkModule].push({
      severity: result.severity,
      title: result.title,
    });
  }

  // 3. Load all compliance frameworks for this tenant
  const frameworks = await prisma.complianceFramework.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, name: true },
  });

  const frameworkNameToId: Record<string, string> = {};
  for (const fw of frameworks) {
    frameworkNameToId[fw.name] = fw.id;
  }

  // 4. For each check module with findings, update mapped controls
  for (const [checkModule, findings] of Object.entries(findingsByModule)) {
    const mappings = SCAN_TO_COMPLIANCE_MAP[checkModule];
    if (!mappings) continue;

    // Determine worst severity for this check module
    let worstSeverity = "info";
    for (const f of findings) {
      if ((SEVERITY_ORDER[f.severity] || 0) > (SEVERITY_ORDER[worstSeverity] || 0)) {
        worstSeverity = f.severity;
      }
    }

    const newStatus = severityToComplianceStatus(worstSeverity);
    const findingsSummary = findings
      .map((f) => `[${f.severity.toUpperCase()}] ${f.title}`)
      .join("; ");

    for (const mapping of mappings) {
      const frameworkId = frameworkNameToId[mapping.frameworkName];
      if (!frameworkId) continue;

      // Find matching controls
      const controls = await prisma.complianceControl.findMany({
        where: {
          frameworkId,
          tenantId,
          controlId: { contains: mapping.controlIdPattern },
        },
        select: { id: true, controlId: true, status: true },
      });

      for (const control of controls) {
        // Only update if the new status is worse or the same
        const currentOrder = SEVERITY_ORDER[control.status === "non_compliant" ? "critical" : control.status === "partially_compliant" ? "medium" : "info"] || 0;
        const newOrder = SEVERITY_ORDER[worstSeverity] || 0;

        // Update control if scan findings indicate a worse status
        if (newOrder >= currentOrder || control.status === "not_assessed") {
          await prisma.complianceControl.update({
            where: { id: control.id },
            data: {
              status: newStatus,
              lastAssessedAt: new Date(),
              notes: `Auto-assessed by scanner (${checkModule}): ${findingsSummary.substring(0, 500)}`,
            },
          });
          updated++;

          // Create assessment record
          await prisma.complianceAssessment.create({
            data: {
              tenantId,
              controlId: control.id,
              assessorId: null,
              assessorType: "system",
              status: newStatus,
              findings: `Scanner module: ${checkModule}. ${findingsSummary.substring(0, 1000)}`,
              evidence: JSON.stringify([
                `Scan ID: ${scanId}`,
                `Check module: ${checkModule}`,
                `Findings count: ${findings.length}`,
                `Worst severity: ${worstSeverity}`,
              ]),
            },
          });
          assessments++;
        }
      }
    }
  }

  // Create audit trail for compliance automation
  if (updated > 0) {
    await createAuditLog({
      tenantId,
      actorId: "system",
      actorType: "system",
      action: "compliance.auto_assessed",
      resourceType: "scan",
      resourceId: scanId,
      result: "success",
      details: {
        controlsUpdated: updated,
        assessmentsCreated: assessments,
        checkModules: Object.keys(findingsByModule).filter((m) => SCAN_TO_COMPLIANCE_MAP[m]),
      },
    });
  }

  return { updated, assessments };
}
