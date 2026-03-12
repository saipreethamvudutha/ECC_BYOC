/**
 * Nmap Vulnerability Scripts Check Module
 * Runs NSE scripts for enterprise vulnerability detection:
 * - vulners: CVE lookup per detected service
 * - ssl-enum-ciphers: SSL/TLS cipher suite audit
 * - smb-vuln-ms17-010: EternalBlue detection
 * - smb-vuln-ms08-067: Conficker detection
 * - http-security-headers: HTTP security header check
 */

import { CheckModule, CheckResult } from '../types';
import { isNmapAvailable, runNmap, parseNmapXml } from '../nmap';
import {
  parseVulnersOutput,
  parseSslEnumCiphers,
  parseHttpSecurityHeaders,
  parseSmbVulnMs17010,
} from '../nmap/nse-parsers';

export const nmapVulnScriptsCheck: CheckModule = {
  id: 'vuln-scripts',
  name: 'Vulnerability Scripts (NSE)',

  async run(target: string): Promise<CheckResult[]> {
    if (!(await isNmapAvailable())) {
      throw new Error('Nmap not available for vulnerability scripts');
    }

    const host = extractHost(target);
    const results: CheckResult[] = [];

    try {
      // Run comprehensive NSE vulnerability scripts
      const args = [
        '-sV',
        '--script',
        'vulners,ssl-enum-ciphers,http-security-headers,smb-vuln-ms17-010,smb-vuln-ms08-067',
        '-T3',
        '--top-ports', '1000',
        '--open',
        host,
      ];

      const { xml } = await runNmap(args, 300000);
      const scanResult = parseNmapXml(xml);

      if (scanResult.hosts.length === 0) return results;

      const hostResult = scanResult.hosts[0];
      const openPorts = hostResult.ports.filter((p) => p.state === 'open');

      let totalCves = 0;

      for (const port of openPorts) {
        if (port.scripts.length === 0) continue;

        // Vulners CVE detection
        const vulnResults = parseVulnersOutput(port.scripts, port.number, port.service?.name || 'unknown');
        totalCves += vulnResults.length;
        results.push(...vulnResults);

        // SSL/TLS cipher audit
        const sslResults = parseSslEnumCiphers(port.scripts, port.number);
        results.push(...sslResults);

        // HTTP security headers
        const headerResults = parseHttpSecurityHeaders(port.scripts, port.number);
        results.push(...headerResults);

        // SMB EternalBlue
        const smbResults = parseSmbVulnMs17010(port.scripts);
        results.push(...smbResults);
      }

      // Host-level scripts (not port-specific)
      if (hostResult.ports.length > 0) {
        const allScripts = hostResult.ports.flatMap((p) => p.scripts);
        // SMB scripts may appear at host level
        const smbHostResults = parseSmbVulnMs17010(allScripts);
        results.push(...smbHostResults);
      }

      // Summary if CVEs found
      if (totalCves > 0) {
        const criticalCount = results.filter((r) => r.severity === 'critical').length;
        const highCount = results.filter((r) => r.severity === 'high').length;

        // Add summary as first result
        results.unshift({
          title: `NSE Vulnerability Scan: ${totalCves} CVEs Found on ${host}`,
          severity: criticalCount > 0 ? 'critical' : highCount > 0 ? 'high' : 'medium',
          description: `Nmap NSE scripts identified ${totalCves} CVEs across ${openPorts.length} services on ${host}. ` +
            `Critical: ${criticalCount}, High: ${highCount}.`,
          remediation: 'Prioritize patching critical and high severity CVEs. Review vendor advisories for each CVE and apply recommended fixes.',
          details: {
            host,
            totalCves,
            criticalCount,
            highCount,
            servicesScanned: openPorts.length,
            scriptsUsed: ['vulners', 'ssl-enum-ciphers', 'http-security-headers', 'smb-vuln-ms17-010'],
            scanEngine: 'nmap',
          },
        });
      }

      return results;
    } catch (error) {
      console.error(`[NmapVulnScripts] Error scanning ${host}: ${error}`);
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
