/**
 * Nmap Service Detection Check Module
 * Replaces banner-grabbing regex with Nmap -sV (12,000+ probe signatures).
 * Extracts CPE strings for NVD CVE enrichment.
 * Preserves details.services[] shape for post-scan hooks.
 */

import { CheckModule, CheckResult } from '../types';
import { isNmapAvailable, runNmap, parseNmapXml, SCAN_PROFILES, parseVulnersOutput } from '../nmap';
import { enrichServicesWithCves } from '../nmap/cpe-mapper';
import { getVulnById } from '../vulnerability-db';

export const nmapServiceDetectionCheck: CheckModule = {
  id: 'service-detection',
  name: 'Service Detection (Nmap -sV)',

  async run(target: string, config?: Record<string, unknown>): Promise<CheckResult[]> {
    if (!(await isNmapAvailable())) {
      throw new Error('Nmap not available for service detection');
    }

    const host = extractHost(target);
    const results: CheckResult[] = [];

    try {
      // Run service version detection with vulners script for CVE lookup
      const args = ['-sV', '--version-all', '--script', 'vulners', '-T3', '--top-ports', '1000', '--open', host];
      const { xml } = await runNmap(args, 300000);
      const scanResult = parseNmapXml(xml);

      if (scanResult.hosts.length === 0) return results;

      const hostResult = scanResult.hosts[0];
      const openPorts = hostResult.ports.filter((p) => p.state === 'open' && p.service);

      if (openPorts.length === 0) return results;

      // Build services array matching original format
      const servicesData = openPorts.map((p) => ({
        port: p.number,
        protocol: p.protocol,
        service: p.service!.name,
        product: p.service!.product,
        version: p.service!.version,
        extraInfo: p.service!.extraInfo,
        cpe: p.service!.cpe,
        confidence: p.service!.confidence,
        method: p.service!.method,
      }));

      // Main service detection result
      results.push({
        title: `${servicesData.length} Services Detected on ${host}`,
        severity: 'info',
        description: `Nmap version detection identified ${servicesData.length} services: ${servicesData.map((s) => `${s.port}/${s.service} (${s.product || 'unknown'} ${s.version || ''})`).join(', ')}.`,
        remediation: 'Review all detected services and ensure they are required. Remove or restrict access to unnecessary services.',
        details: {
          target: host,
          serviceCount: servicesData.length,
          services: servicesData,
          scanEngine: 'nmap',
        },
      });

      // Check for outdated/vulnerable service versions
      for (const svc of servicesData) {
        const vulnCheck = checkServiceVersion(svc);
        if (vulnCheck) {
          results.push(vulnCheck);
        }
      }

      // Parse vulners NSE script output for CVE findings
      for (const port of openPorts) {
        if (port.scripts.length > 0) {
          const vulnResults = parseVulnersOutput(port.scripts, port.number, port.service?.name || 'unknown');
          results.push(...vulnResults);
        }
      }

      // NVD CPE enrichment (if enabled and services have CPEs)
      const enableNvd = config?.enableNvd !== false;
      if (enableNvd) {
        const servicesWithCpe = openPorts
          .filter((p) => p.service && p.service.cpe.length > 0)
          .map((p) => ({ port: p.number, service: p.service! }));

        if (servicesWithCpe.length > 0) {
          try {
            const enriched = await enrichServicesWithCves(servicesWithCpe, 5);
            for (const { cves } of enriched) {
              results.push(...cves);
            }
          } catch (error) {
            console.warn(`[NmapServiceDetection] NVD enrichment failed: ${error}`);
          }
        }
      }

      return results;
    } catch (error) {
      console.error(`[NmapServiceDetection] Error scanning ${host}: ${error}`);
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

function checkServiceVersion(svc: {
  port: number;
  service: string;
  product: string | null;
  version: string | null;
}): CheckResult | null {
  if (!svc.version) return null;

  const product = (svc.product || '').toLowerCase();
  const version = svc.version;

  // OpenSSH < 8.0
  if (product.includes('openssh')) {
    const major = parseInt(version.split('.')[0]);
    if (major > 0 && major < 8) {
      const vuln = getVulnById('outdated-ssh-version');
      return {
        title: `Outdated OpenSSH ${version} (Port ${svc.port})`,
        severity: 'medium',
        description: `OpenSSH ${version} is outdated. Versions below 8.0 have known vulnerabilities including user enumeration and memory corruption issues.`,
        remediation: vuln?.remediation || 'Update OpenSSH to version 9.x or later.',
        cvssScore: 5.3,
        details: {
          port: svc.port, service: svc.service, product: svc.product,
          version, vulnId: 'outdated-ssh-version', scanEngine: 'nmap',
        },
      };
    }
  }

  // Apache < 2.4.50
  if (product.includes('apache') && product.includes('http')) {
    const parts = version.split('.');
    const minor = parseInt(parts[1] || '0');
    const patch = parseInt(parts[2] || '0');
    if (minor < 4 || (minor === 4 && patch < 50)) {
      return {
        title: `Outdated Apache ${version} (Port ${svc.port})`,
        severity: 'high',
        description: `Apache HTTP Server ${version} has known vulnerabilities including CVE-2021-41773 (path traversal) and CVE-2021-42013.`,
        remediation: 'Update Apache HTTP Server to 2.4.54 or later.',
        cveId: 'CVE-2021-41773',
        cvssScore: 7.5,
        details: {
          port: svc.port, service: svc.service, product: svc.product,
          version, vulnId: 'outdated-web-server', scanEngine: 'nmap',
        },
      };
    }
  }

  // nginx < 1.22
  if (product.includes('nginx')) {
    const parts = version.split('.');
    const minor = parseInt(parts[1] || '0');
    if (parseInt(parts[0]) === 1 && minor < 22) {
      return {
        title: `Outdated nginx ${version} (Port ${svc.port})`,
        severity: 'medium',
        description: `nginx ${version} is outdated and may have known security vulnerabilities.`,
        remediation: 'Update nginx to 1.24 or later.',
        cvssScore: 5.3,
        details: {
          port: svc.port, service: svc.service, product: svc.product,
          version, vulnId: 'outdated-web-server', scanEngine: 'nmap',
        },
      };
    }
  }

  // Telnet service
  if (svc.service === 'telnet') {
    return {
      title: `Telnet Service Detected (Port ${svc.port})`,
      severity: 'critical',
      description: 'Telnet transmits all data including credentials in plaintext. This service should never be used in production.',
      remediation: 'Disable Telnet and use SSH for remote access.',
      cvssScore: 9.1,
      details: {
        port: svc.port, service: svc.service, vulnId: 'telnet-service-detected', scanEngine: 'nmap',
      },
    };
  }

  return null;
}
