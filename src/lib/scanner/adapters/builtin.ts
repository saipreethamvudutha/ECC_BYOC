/**
 * Built-in Scanner Adapter
 *
 * Uses all check modules with pure TypeScript / Node.js built-ins.
 * Zero external dependencies.
 */

import { ScannerAdapter, CheckModule } from "../types";
import { httpHeadersCheck } from "../checks/http-headers";
import { sslTlsCheck } from "../checks/ssl-tls";
import { portScanCheck } from "../checks/port-scan";
import { exposedPanelsCheck } from "../checks/exposed-panels";
import { infoDisclosureCheck } from "../checks/info-disclosure";
import { commonCvesCheck } from "../checks/common-cves";
import { dnsChecksCheck } from "../checks/dns-checks";
import { cloudMisconfigCheck } from "../checks/cloud-misconfig";

// All available check modules
const ALL_CHECKS: CheckModule[] = [
  httpHeadersCheck,
  sslTlsCheck,
  portScanCheck,
  exposedPanelsCheck,
  infoDisclosureCheck,
  commonCvesCheck,
  dnsChecksCheck,
  cloudMisconfigCheck,
];

// Check modules by scan type
const CHECKS_BY_TYPE: Record<string, string[]> = {
  vulnerability: [
    "http-headers",
    "ssl-tls",
    "exposed-panels",
    "info-disclosure",
    "common-cves",
    "cloud-misconfig",
  ],
  port: [
    "port-scan",
    "http-headers",
  ],
  compliance: [
    "http-headers",
    "ssl-tls",
    "dns-checks",
    "info-disclosure",
  ],
  full: [
    "http-headers",
    "ssl-tls",
    "port-scan",
    "exposed-panels",
    "info-disclosure",
    "common-cves",
    "dns-checks",
    "cloud-misconfig",
  ],
};

export const builtinAdapter: ScannerAdapter = {
  name: "builtin",

  getCheckModules(scanType: string): CheckModule[] {
    const checkIds = CHECKS_BY_TYPE[scanType] || CHECKS_BY_TYPE.full;
    return ALL_CHECKS.filter((c) => checkIds.includes(c.id));
  },
};
