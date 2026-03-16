/**
 * Nmap Port Scan Check Module
 * Replaces the Node.js TCP connect scan with Nmap SYN scan.
 * Produces the same details shape as the original for post-scan hook compatibility.
 */

import { CheckModule, CheckResult } from '../types';
import { isNmapAvailable, runNmap, parseNmapXml, SCAN_PROFILES } from '../nmap';
import { getVulnById } from '../vulnerability-db';

// Port category mapping (matches original port-scan.ts)
const PORT_CATEGORIES: Record<number, { service: string; category: string; risk: string; vulnId?: string }> = {
  // Databases
  1433: { service: 'MSSQL', category: 'database', risk: 'high', vulnId: 'open-database-port' },
  3306: { service: 'MySQL', category: 'database', risk: 'high', vulnId: 'open-database-port' },
  5432: { service: 'PostgreSQL', category: 'database', risk: 'high', vulnId: 'open-database-port' },
  6379: { service: 'Redis', category: 'database', risk: 'high', vulnId: 'open-database-port' },
  27017: { service: 'MongoDB', category: 'database', risk: 'high', vulnId: 'open-database-port' },
  9200: { service: 'Elasticsearch', category: 'database', risk: 'high', vulnId: 'open-database-port' },
  11211: { service: 'Memcached', category: 'database', risk: 'high', vulnId: 'open-database-port' },
  // Remote Access
  22: { service: 'SSH', category: 'remote-access', risk: 'info' },
  23: { service: 'Telnet', category: 'remote-access', risk: 'critical', vulnId: 'telnet-service-detected' },
  3389: { service: 'RDP', category: 'remote-access', risk: 'critical', vulnId: 'open-rdp-port' },
  5900: { service: 'VNC', category: 'remote-access', risk: 'high', vulnId: 'open-vnc-port' },
  // Web
  80: { service: 'HTTP', category: 'web', risk: 'info' },
  443: { service: 'HTTPS', category: 'web', risk: 'info' },
  8080: { service: 'HTTP-Alt', category: 'web', risk: 'low' },
  8443: { service: 'HTTPS-Alt', category: 'web', risk: 'low' },
  // File Transfer
  21: { service: 'FTP', category: 'file-transfer', risk: 'medium', vulnId: 'open-ftp-port' },
  445: { service: 'SMB', category: 'file-transfer', risk: 'high', vulnId: 'open-smb-port' },
  139: { service: 'NetBIOS', category: 'file-transfer', risk: 'high', vulnId: 'open-smb-port' },
  // IoT/Industrial
  502: { service: 'Modbus', category: 'iot', risk: 'critical', vulnId: 'modbus-exposed' },
  1883: { service: 'MQTT', category: 'iot', risk: 'high', vulnId: 'iot-protocol-exposed' },
  47808: { service: 'BACnet', category: 'iot', risk: 'critical', vulnId: 'bacnet-exposed' },
  // Infrastructure
  2375: { service: 'Docker-API', category: 'misc', risk: 'critical', vulnId: 'docker-api-exposed' },
  6443: { service: 'K8s-API', category: 'misc', risk: 'critical', vulnId: 'k8s-api-exposed' },
  2379: { service: 'etcd', category: 'misc', risk: 'critical', vulnId: 'etcd-exposed' },
  // DNS
  53: { service: 'DNS', category: 'dns', risk: 'info' },
  // Email
  25: { service: 'SMTP', category: 'email', risk: 'medium' },
  110: { service: 'POP3', category: 'email', risk: 'medium' },
  143: { service: 'IMAP', category: 'email', risk: 'medium' },
  // Directory
  389: { service: 'LDAP', category: 'directory', risk: 'high', vulnId: 'open-ldap-port' },
  636: { service: 'LDAPS', category: 'directory', risk: 'medium' },
  // Monitoring
  161: { service: 'SNMP', category: 'monitoring', risk: 'high', vulnId: 'open-snmp-port' },
};

export const nmapPortScanCheck: CheckModule = {
  id: 'port-scan',
  name: 'Port Scan (Nmap SYN)',

  async run(target: string, config?: Record<string, unknown>): Promise<CheckResult[]> {
    if (!(await isNmapAvailable())) {
      throw new Error('Nmap not available for port scan');
    }

    const host = extractHost(target);
    const profile = config?.fullScan ? SCAN_PROFILES['full-tcp'] : SCAN_PROFILES['quick-syn'];
    const results: CheckResult[] = [];

    // Custom port range support (validated against allowlist before passing to nmap)
    const portRange = config?.portRange as string | undefined;
    if (portRange && !/^[0-9,\-TU]+$/.test(portRange)) {
      throw new Error('[NmapPortScan] Invalid port range format. Use digits, commas, hyphens, T (TCP), U (UDP) only.');
    }

    const nmapArgs = portRange
      ? ['-sS', '-sV', '-T4', '-p', portRange, '--open']
      : [...profile.args];

    try {
      const { xml } = await runNmap([...nmapArgs, host], profile.timeout);
      const scanResult = parseNmapXml(xml);

      if (scanResult.hosts.length === 0) return results;

      const hostResult = scanResult.hosts[0];
      const openPorts = hostResult.ports.filter((p) => p.state === 'open');

      if (openPorts.length === 0) return results;

      // Build ports array matching original format
      const portsData = openPorts.map((p) => {
        const known = PORT_CATEGORIES[p.number];
        const serviceName = p.service?.name || known?.service || 'unknown';
        const category = known?.category || categorizePort(p.number, serviceName);
        const risk = known?.risk || 'info';

        return {
          port: p.number,
          protocol: p.protocol,
          state: p.state,
          service: serviceName,
          product: p.service?.product || null,
          version: p.service?.version || null,
          category,
          risk,
        };
      });

      // Port summary finding
      results.push({
        title: `Open Ports Detected: ${openPorts.length} ports on ${host}`,
        severity: 'info',
        description: `Nmap SYN scan found ${openPorts.length} open ports on ${host}. Services: ${portsData.map((p) => `${p.port}/${p.service}`).join(', ')}.`,
        remediation: 'Review all open ports and close unnecessary services. Restrict access using firewall rules to allow only required ports.',
        details: {
          host,
          totalOpen: openPorts.length,
          tcpOpen: openPorts.filter((p) => p.protocol === 'tcp').length,
          udpOpen: openPorts.filter((p) => p.protocol === 'udp').length,
          ports: portsData,
          scanEngine: 'nmap',
          scanType: profile.name,
          scanDuration: scanResult.scanInfo.elapsed,
        },
      });

      // Individual findings for risky ports
      for (const port of portsData) {
        const known = PORT_CATEGORIES[port.port];
        if (known?.vulnId) {
          const vuln = getVulnById(known.vulnId);
          if (vuln) {
            results.push({
              title: `${vuln.title} — ${port.service} (${port.port}/${port.protocol})`,
              severity: vuln.severity as CheckResult['severity'],
              description: `${vuln.description} Service: ${port.product || port.service} ${port.version || ''}`.trim(),
              remediation: vuln.remediation,
              cveId: vuln.cveId,
              cvssScore: vuln.cvssScore,
              details: {
                port: port.port,
                protocol: port.protocol,
                service: port.service,
                product: port.product,
                version: port.version,
                category: port.category,
                vulnId: known.vulnId,
                scanEngine: 'nmap',
              },
            });
          }
        }
      }

      return results;
    } catch (error) {
      console.error(`[NmapPortScan] Error scanning ${host}: ${error}`);
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

function categorizePort(port: number, service: string): string {
  if ([80, 443, 8080, 8443, 3000, 5000, 8000, 9090].includes(port)) return 'web';
  if ([3306, 5432, 6379, 27017, 1433, 9200].includes(port)) return 'database';
  if ([22, 23, 3389, 5900].includes(port)) return 'remote-access';
  if ([25, 110, 143, 993, 995, 587].includes(port)) return 'email';
  if ([21, 69, 445, 139, 2049].includes(port)) return 'file-transfer';
  if (service.toLowerCase().includes('http')) return 'web';
  if (service.toLowerCase().includes('sql') || service.toLowerCase().includes('db')) return 'database';
  return 'misc';
}
