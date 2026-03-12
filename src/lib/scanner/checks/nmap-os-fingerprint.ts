/**
 * Nmap OS Fingerprint Check Module
 * Replaces heuristic port-profile detection with Nmap -O TCP/IP stack analysis.
 * Preserves details.osFamily, details.osVersion, details.confidence for post-scan hooks.
 */

import { CheckModule, CheckResult } from '../types';
import { isNmapAvailable, runNmap, parseNmapXml, SCAN_PROFILES } from '../nmap';

const EOL_OS_PATTERNS = [
  { pattern: /Windows Server 2003/i, name: 'Windows Server 2003', eol: '2015-07-14' },
  { pattern: /Windows Server 2008(?! R2)/i, name: 'Windows Server 2008', eol: '2020-01-14' },
  { pattern: /Windows Server 2008 R2/i, name: 'Windows Server 2008 R2', eol: '2020-01-14' },
  { pattern: /Windows XP/i, name: 'Windows XP', eol: '2014-04-08' },
  { pattern: /Windows 7/i, name: 'Windows 7', eol: '2020-01-14' },
  { pattern: /Windows Vista/i, name: 'Windows Vista', eol: '2017-04-11' },
  { pattern: /Windows 8(?!\.1)/i, name: 'Windows 8', eol: '2016-01-12' },
  { pattern: /CentOS (?:Linux )?6/i, name: 'CentOS 6', eol: '2020-11-30' },
  { pattern: /CentOS (?:Linux )?7/i, name: 'CentOS 7', eol: '2024-06-30' },
  { pattern: /Ubuntu 14/i, name: 'Ubuntu 14.04', eol: '2019-04-25' },
  { pattern: /Ubuntu 16/i, name: 'Ubuntu 16.04', eol: '2021-04-30' },
  { pattern: /Ubuntu 18/i, name: 'Ubuntu 18.04', eol: '2023-05-31' },
  { pattern: /Debian 8/i, name: 'Debian 8 (Jessie)', eol: '2020-06-30' },
  { pattern: /Debian 9/i, name: 'Debian 9 (Stretch)', eol: '2022-06-30' },
  { pattern: /Red Hat.*6\./i, name: 'RHEL 6', eol: '2020-11-30' },
  { pattern: /SUSE.*11/i, name: 'SLES 11', eol: '2019-03-31' },
];

export const nmapOSFingerprintCheck: CheckModule = {
  id: 'os-fingerprint',
  name: 'OS Fingerprint (Nmap -O)',

  async run(target: string): Promise<CheckResult[]> {
    if (!(await isNmapAvailable())) {
      throw new Error('Nmap not available for OS fingerprinting');
    }

    const host = extractHost(target);
    const results: CheckResult[] = [];

    try {
      const profile = SCAN_PROFILES['os-detect'];
      const { xml } = await runNmap([...profile.args, host], profile.timeout);
      const scanResult = parseNmapXml(xml);

      if (scanResult.hosts.length === 0) return results;

      const hostResult = scanResult.hosts[0];
      const os = hostResult.os;

      if (!os) {
        results.push({
          title: `OS Detection Inconclusive for ${host}`,
          severity: 'info',
          description: `Nmap TCP/IP stack fingerprinting could not determine the operating system of ${host}. The host may be behind a firewall that alters packet characteristics.`,
          remediation: 'No action required. Consider running an authenticated scan for definitive OS identification.',
          details: {
            osFamily: 'Unknown',
            osVersion: null,
            confidence: 0,
            methods: ['nmap-tcp-ip-stack'],
            scanEngine: 'nmap',
          },
        });
        return results;
      }

      // Determine OS family
      const osFamily = normalizeOSFamily(os.family, os.name);
      const osVersion = os.generation || extractVersion(os.name);
      const confidence = os.accuracy;

      // Main OS detection result
      const osDisplay = osVersion ? `${osFamily} (${osVersion})` : osFamily;
      results.push({
        title: `OS Detected: ${osDisplay} — ${confidence}% confidence`,
        severity: 'info',
        description: `Nmap TCP/IP stack fingerprinting identified ${host} as running ${os.name} (${osFamily} family). Detection confidence: ${confidence}%. CPE: ${os.cpe.join(', ') || 'N/A'}.`,
        remediation: 'Ensure the operating system is up-to-date with the latest security patches. Verify the OS version matches your inventory records.',
        details: {
          osFamily,
          osVersion,
          confidence,
          osName: os.name,
          osCpe: os.cpe,
          methods: ['nmap-tcp-ip-stack'],
          macAddress: hostResult.macAddress,
          vendor: hostResult.vendor,
          distance: hostResult.distance,
          uptime: hostResult.uptime,
          scanEngine: 'nmap',
        },
      });

      // Check for EOL operating systems
      for (const eol of EOL_OS_PATTERNS) {
        if (eol.pattern.test(os.name)) {
          results.push({
            title: `End-of-Life OS: ${eol.name}`,
            severity: 'critical',
            description: `${host} is running ${eol.name}, which reached end-of-life on ${eol.eol}. This OS no longer receives security patches, leaving it vulnerable to known exploits.`,
            remediation: `Upgrade ${host} to a supported operating system version immediately. ${eol.name} no longer receives security updates from the vendor.`,
            cvssScore: 9.8,
            details: {
              osFamily,
              osVersion,
              eolOs: eol.name,
              eolDate: eol.eol,
              vulnId: 'end-of-life-os',
              scanEngine: 'nmap',
            },
          });
          break;
        }
      }

      return results;
    } catch (error) {
      console.error(`[NmapOSFingerprint] Error scanning ${host}: ${error}`);
      throw error;
    }
  },
};

function extractHost(target: string): string {
  let host = target;
  host = host.replace(/^https?:\/\//, '');
  host = host.split('/')[0];
  host = host.split(':')[0];
  return host;
}

function normalizeOSFamily(family: string, name: string): string {
  const f = family.toLowerCase();
  const n = name.toLowerCase();

  if (f.includes('windows') || n.includes('windows')) return 'Windows';
  if (f.includes('linux') || n.includes('linux')) return 'Linux';
  if (f.includes('freebsd') || n.includes('freebsd')) return 'FreeBSD';
  if (f.includes('macos') || n.includes('mac os') || n.includes('apple')) return 'macOS';
  if (n.includes('cisco') || n.includes('ios')) return 'Cisco IOS';
  if (n.includes('junos') || n.includes('juniper')) return 'Juniper JunOS';
  if (n.includes('fortinet') || n.includes('fortigate')) return 'FortiOS';
  if (n.includes('palo alto') || n.includes('pan-os')) return 'PAN-OS';

  return family || 'Unknown';
}

function extractVersion(osName: string): string | null {
  // Try to extract version numbers
  const versionMatch = osName.match(/(\d+(?:\.\d+)+)/);
  return versionMatch ? versionMatch[1] : null;
}
