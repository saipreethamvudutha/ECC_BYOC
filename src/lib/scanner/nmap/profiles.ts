// Nmap Scan Profiles — Pre-defined argument sets for different scan scenarios

import type { NmapScanProfile } from './types';

export const SCAN_PROFILES: Record<string, NmapScanProfile> = {
  // Fast SYN scan of top 1000 ports with light service detection
  'quick-syn': {
    name: 'Quick SYN Scan',
    args: ['-sS', '-T4', '--top-ports', '1000', '-sV', '--version-light', '--open'],
    timeout: 120000,
    description: 'Fast SYN scan of top 1000 ports with light version detection',
  },

  // Full 65535 TCP port scan with version detection
  'full-tcp': {
    name: 'Full TCP Scan',
    args: ['-sS', '-p-', '-T3', '-sV', '--open'],
    timeout: 600000,
    description: 'Complete 65535 TCP port scan with version detection',
  },

  // OS fingerprinting via TCP/IP stack analysis
  'os-detect': {
    name: 'OS Detection',
    args: ['-sS', '-O', '--osscan-guess', '-T4', '--top-ports', '200', '--open'],
    timeout: 120000,
    description: 'OS fingerprinting with TCP/IP stack analysis (90%+ accuracy)',
  },

  // Detailed service and version identification
  'service-version': {
    name: 'Service Version Detection',
    args: ['-sV', '--version-all', '-T3', '--top-ports', '1000', '--open'],
    timeout: 180000,
    description: 'Detailed service and version identification using Nmap probe database',
  },

  // Ping sweep for live host detection (network discovery)
  'discovery': {
    name: 'Host Discovery',
    args: ['-sn', '-PE', '-PS80,443,22,3389', '-PA80,443', '-PP'],
    timeout: 120000,
    description: 'Ping sweep for live host detection using ICMP + TCP probes',
  },

  // NSE vulnerability detection scripts
  'vuln-scripts': {
    name: 'Vulnerability Scripts',
    args: [
      '-sV', '--script',
      'vulners,ssl-enum-ciphers,http-security-headers,smb-vuln-ms17-010,smb-vuln-ms08-067',
      '-T3', '--top-ports', '1000', '--open',
    ],
    timeout: 300000,
    description: 'NSE vulnerability detection — CVE lookup, SSL audit, SMB vulns',
  },

  // Combined scan: ports + services + OS + default scripts
  'combined': {
    name: 'Combined Scan',
    args: ['-sS', '-sV', '-O', '--osscan-guess', '-sC', '-T3', '--top-ports', '1000', '--open'],
    timeout: 300000,
    description: 'Port scan + service detection + OS fingerprint + default scripts',
  },

  // SSH/FTP/SMB authentication checks
  'auth-scan': {
    name: 'Authentication Audit',
    args: [
      '-sV', '--script',
      'ssh-auth-methods,ssh2-enum-algos,ftp-anon,smb-security-mode,snmp-info',
      '-p', '22,21,445,139,161',
      '-T3',
    ],
    timeout: 120000,
    description: 'Audit SSH, FTP, SMB, SNMP authentication and security configuration',
  },

  // CIS Benchmark-relevant checks
  'cis-baseline': {
    name: 'CIS Baseline Scan',
    args: [
      '-sV', '--script',
      'ssl-enum-ciphers,ssh2-enum-algos,ftp-anon,smb-security-mode,http-security-headers,snmp-info',
      '-T3', '--top-ports', '1000', '--open',
    ],
    timeout: 300000,
    description: 'CIS v8.1 relevant security controls — SSL, SSH, SMB, FTP, SNMP',
  },

  // UDP scan of common services
  'udp-scan': {
    name: 'UDP Service Scan',
    args: ['-sU', '-T4', '--top-ports', '50', '-sV', '--open'],
    timeout: 300000,
    description: 'UDP scan of top 50 ports — DNS, NTP, SNMP, DHCP, TFTP',
  },
};

// Get profile by scan type mapping
export function getProfileForScanType(scanType: string): NmapScanProfile {
  const typeToProfile: Record<string, string> = {
    'vulnerability': 'combined',
    'port': 'quick-syn',
    'compliance': 'cis-baseline',
    'full': 'combined',
    'discovery': 'discovery',
    'enterprise': 'combined',
  };

  const profileKey = typeToProfile[scanType] || 'quick-syn';
  return SCAN_PROFILES[profileKey];
}
