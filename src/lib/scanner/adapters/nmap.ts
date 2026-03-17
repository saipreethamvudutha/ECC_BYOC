/**
 * Nmap Scanner Adapter
 * Replaces 4 check modules with Nmap-powered versions and adds 3 enterprise modules.
 * Keeps 8 HTTP-based modules unchanged.
 * Falls back to builtin adapter if Nmap not available.
 */

import { CheckModule, ScannerAdapter } from '../types';

// Nmap-powered replacements (same IDs as originals)
import { nmapPortScanCheck } from '../checks/nmap-port-scan';
import { sshOsInfoCheck, sshUserAccountsCheck, sshSudoConfigCheck, sshListeningServicesCheck, sshInstalledPackagesCheck, sshFilePermissionsCheck, sshCronJobsCheck, sshSshdConfigCheck } from '../connectors/ssh';
import { winrmOsInfoCheck, winrmLocalUsersCheck, winrmLocalAdminsCheck, winrmServicesCheck, winrmInstalledSoftwareCheck, winrmFirewallRulesCheck, winrmPatchesCheck } from '../connectors/winrm';
import { nmapServiceDetectionCheck } from '../checks/nmap-service-detection';
import { nmapOSFingerprintCheck } from '../checks/nmap-os-fingerprint';
import { nmapNetworkDiscoveryCheck } from '../checks/nmap-network-discovery';

// Enterprise-only modules (new IDs)
import { nmapVulnScriptsCheck } from '../checks/nmap-vuln-scripts';
import { nmapAuthScanCheck } from '../checks/nmap-auth-scan';
import { cisBenchmarkCheck } from '../checks/cis-benchmark';

// CIS v8.1 SSH-based check modules (Phase 12D)
import { cisSshChecks } from '../checks/cis-ssh';

// HTTP-based modules (unchanged from builtin)
import { httpHeadersCheck } from '../checks/http-headers';
import { sslTlsCheck } from '../checks/ssl-tls';
import { exposedPanelsCheck } from '../checks/exposed-panels';
import { infoDisclosureCheck } from '../checks/info-disclosure';
import { commonCvesCheck } from '../checks/common-cves';
import { dnsChecksCheck } from '../checks/dns-checks';
import { cloudMisconfigCheck } from '../checks/cloud-misconfig';
import { cloudInventoryCheck } from '../checks/cloud-inventory';

const CHECKS_BY_TYPE: Record<string, CheckModule[]> = {
  vulnerability: [
    httpHeadersCheck,
    sslTlsCheck,
    nmapPortScanCheck,
    exposedPanelsCheck,
    infoDisclosureCheck,
    commonCvesCheck,
    cloudMisconfigCheck,
    nmapVulnScriptsCheck,
  ],

  port: [
    nmapPortScanCheck,
    httpHeadersCheck,
    nmapServiceDetectionCheck,
  ],

  compliance: [
    httpHeadersCheck,
    sslTlsCheck,
    dnsChecksCheck,
    infoDisclosureCheck,
    cisBenchmarkCheck,
    nmapAuthScanCheck,
    ...cisSshChecks,
  ],

  full: [
    httpHeadersCheck,
    sslTlsCheck,
    nmapPortScanCheck,
    exposedPanelsCheck,
    infoDisclosureCheck,
    commonCvesCheck,
    dnsChecksCheck,
    cloudMisconfigCheck,
    nmapServiceDetectionCheck,
    nmapOSFingerprintCheck,
    cloudInventoryCheck,
    nmapVulnScriptsCheck,
  ],

  discovery: [
    nmapNetworkDiscoveryCheck,
    nmapPortScanCheck,
    nmapServiceDetectionCheck,
    nmapOSFingerprintCheck,
    cloudInventoryCheck,
    dnsChecksCheck,
    cloudMisconfigCheck,
  ],

  enterprise: [
    httpHeadersCheck,
    sslTlsCheck,
    nmapPortScanCheck,
    exposedPanelsCheck,
    infoDisclosureCheck,
    commonCvesCheck,
    dnsChecksCheck,
    cloudMisconfigCheck,
    nmapServiceDetectionCheck,
    nmapOSFingerprintCheck,
    cloudInventoryCheck,
    nmapVulnScriptsCheck,
    nmapAuthScanCheck,
    cisBenchmarkCheck,
    ...cisSshChecks,
  ],

  authenticated: [
    nmapPortScanCheck,
    nmapServiceDetectionCheck,
    nmapOSFingerprintCheck,
    sshOsInfoCheck,
    sshUserAccountsCheck,
    sshSudoConfigCheck,
    sshListeningServicesCheck,
    sshInstalledPackagesCheck,
    sshFilePermissionsCheck,
    sshCronJobsCheck,
    sshSshdConfigCheck,
    ...cisSshChecks,
    winrmOsInfoCheck,
    winrmLocalUsersCheck,
    winrmLocalAdminsCheck,
    winrmServicesCheck,
    winrmInstalledSoftwareCheck,
    winrmFirewallRulesCheck,
    winrmPatchesCheck,
  ],
};

export const nmapAdapter: ScannerAdapter = {
  name: 'nmap',

  getCheckModules(scanType: string): CheckModule[] {
    return CHECKS_BY_TYPE[scanType] || CHECKS_BY_TYPE['vulnerability'];
  },
};
