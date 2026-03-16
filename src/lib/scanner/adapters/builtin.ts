/**
 * Built-in Scanner Adapter (Enhanced — Phase 8)
 *
 * Uses all check modules with pure TypeScript / Node.js built-ins.
 * Zero external dependencies.
 *
 * Phase 8 additions:
 * - 4 new check modules for enterprise asset discovery
 * - "discovery" scan type for client's Asset Discovery workflow
 * - Enhanced port scan (100+ ports with UDP)
 * - Cloud inventory with AWS/Azure/GCP detection
 *
 * Phase 12A: getActiveAdapter() dynamically selects nmap or builtin adapter
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
// Phase 8: Enterprise Asset Discovery modules
import { networkDiscoveryCheck } from "../checks/network-discovery";
import { serviceDetectionCheck } from "../checks/service-detection";
import { osFingerprintCheck } from "../checks/os-fingerprint";
import { cloudInventoryCheck } from "../checks/cloud-inventory";
// Phase 12A: Nmap adapter
import { isNmapAvailable } from "../nmap";
import { nmapAdapter } from "./nmap";

// All available check modules (12 total: 8 original + 4 new)
const ALL_CHECKS: CheckModule[] = [
  httpHeadersCheck,
  sslTlsCheck,
  portScanCheck,
  exposedPanelsCheck,
  infoDisclosureCheck,
  commonCvesCheck,
  dnsChecksCheck,
  cloudMisconfigCheck,
  // Phase 8
  networkDiscoveryCheck,
  serviceDetectionCheck,
  osFingerprintCheck,
  cloudInventoryCheck,
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
    // Phase 8: include discovery modules in full scan
    "service-detection",
    "os-fingerprint",
    "cloud-inventory",
  ],
  // Phase 8: Enterprise Asset Discovery scan type
  discovery: [
    "network-discovery",
    "port-scan",
    "service-detection",
    "os-fingerprint",
    "cloud-inventory",
    "dns-checks",
    "cloud-misconfig",
  ],
  // Phase 12C: Authenticated scan (builtin fallback — no SSH/WinRM in builtin)
  authenticated: [
    "http-headers",
    "ssl-tls",
    "port-scan",
    "service-detection",
    "os-fingerprint",
  ],
};

export const builtinAdapter: ScannerAdapter = {
  name: "builtin",

  getCheckModules(scanType: string): CheckModule[] {
    const checkIds = CHECKS_BY_TYPE[scanType] || CHECKS_BY_TYPE.full;
    return ALL_CHECKS.filter((c) => checkIds.includes(c.id));
  },
};

/**
 * Dynamic adapter selection — returns nmap adapter if Nmap is installed,
 * otherwise falls back to the builtin Node.js adapter.
 */
let cachedAdapter: ScannerAdapter | null = null;
let cacheTime = 0;
const CACHE_TTL = 60000; // 1 minute

export async function getActiveAdapter(): Promise<ScannerAdapter> {
  const now = Date.now();
  if (cachedAdapter && now - cacheTime < CACHE_TTL) {
    return cachedAdapter;
  }

  const nmapOk = await isNmapAvailable();
  cachedAdapter = nmapOk ? nmapAdapter : builtinAdapter;
  cacheTime = now;

  console.log(`[Scanner] Active adapter: ${cachedAdapter.name}`);
  return cachedAdapter;
}
