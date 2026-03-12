/**
 * Nmap Authentication Audit Check Module
 * Checks SSH, FTP, SMB, SNMP authentication configuration:
 * - SSH auth methods (password vs key)
 * - SSH algorithm strength
 * - FTP anonymous access
 * - SMB security mode and guest access
 * - SNMP accessibility
 */

import { CheckModule, CheckResult } from '../types';
import { isNmapAvailable, runNmap, parseNmapXml, SCAN_PROFILES } from '../nmap';
import {
  parseSshAuthMethods,
  parseSsh2EnumAlgos,
  parseFtpAnon,
  parseSmbSecurityMode,
  parseSnmpInfo,
} from '../nmap/nse-parsers';

export const nmapAuthScanCheck: CheckModule = {
  id: 'auth-scan',
  name: 'Authentication Audit (NSE)',

  async run(target: string): Promise<CheckResult[]> {
    if (!(await isNmapAvailable())) {
      throw new Error('Nmap not available for authentication audit');
    }

    const host = extractHost(target);
    const results: CheckResult[] = [];

    try {
      const profile = SCAN_PROFILES['auth-scan'];
      const { xml } = await runNmap([...profile.args, host], profile.timeout);
      const scanResult = parseNmapXml(xml);

      if (scanResult.hosts.length === 0) return results;

      const hostResult = scanResult.hosts[0];
      const openPorts = hostResult.ports.filter((p) => p.state === 'open');

      if (openPorts.length === 0) {
        results.push({
          title: `Auth Audit: No Target Services Found on ${host}`,
          severity: 'info',
          description: `No SSH, FTP, SMB, or SNMP services found open on ${host}. Ports 22, 21, 445, 139, 161 were all filtered or closed.`,
          remediation: 'No action required if these services are intentionally disabled.',
          details: { host, scanEngine: 'nmap' },
        });
        return results;
      }

      // Process each port's scripts
      for (const port of openPorts) {
        if (port.scripts.length === 0) continue;

        // SSH checks (port 22 typically)
        if (port.service?.name === 'ssh' || port.number === 22) {
          results.push(...parseSshAuthMethods(port.scripts));
          results.push(...parseSsh2EnumAlgos(port.scripts));
        }

        // FTP checks (port 21)
        if (port.service?.name === 'ftp' || port.number === 21) {
          results.push(...parseFtpAnon(port.scripts));
        }

        // SMB checks (ports 445, 139)
        if (port.service?.name?.includes('smb') || port.service?.name?.includes('microsoft-ds') ||
            port.number === 445 || port.number === 139) {
          results.push(...parseSmbSecurityMode(port.scripts));
        }

        // SNMP checks (port 161)
        if (port.service?.name === 'snmp' || port.number === 161) {
          results.push(...parseSnmpInfo(port.scripts));
        }
      }

      // Add summary
      const issueCount = results.filter((r) => r.severity !== 'info').length;
      if (issueCount > 0) {
        results.unshift({
          title: `Auth Audit: ${issueCount} Issues Found on ${host}`,
          severity: results.some((r) => r.severity === 'critical') ? 'critical' :
                   results.some((r) => r.severity === 'high') ? 'high' : 'medium',
          description: `Authentication audit of ${host} found ${issueCount} configuration issues across ` +
            `${openPorts.length} services (SSH, FTP, SMB, SNMP).`,
          remediation: 'Review and harden authentication configurations for all services. Prioritize critical and high severity issues.',
          details: {
            host,
            issueCount,
            servicesChecked: openPorts.map((p) => `${p.number}/${p.service?.name || 'unknown'}`),
            scanEngine: 'nmap',
          },
        });
      } else {
        results.push({
          title: `Auth Audit: No Issues on ${host}`,
          severity: 'info',
          description: `Authentication audit of ${host} found no issues. Services checked: ${openPorts.map((p) => `${p.number}/${p.service?.name || 'unknown'}`).join(', ')}.`,
          remediation: 'No action required. Continue monitoring authentication configurations.',
          details: { host, scanEngine: 'nmap' },
        });
      }

      return results;
    } catch (error) {
      console.error(`[NmapAuthScan] Error scanning ${host}: ${error}`);
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
