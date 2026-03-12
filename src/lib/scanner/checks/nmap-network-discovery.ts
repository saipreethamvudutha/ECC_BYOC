/**
 * Nmap Network Discovery Check Module
 * Replaces TCP probe-based discovery with Nmap -sn (ICMP + TCP + ARP ping sweep).
 * Preserves details.deviceType, details.hosts[] for post-scan hooks.
 */

import { CheckModule, CheckResult } from '../types';
import { isNmapAvailable, runNmap, parseNmapXml, SCAN_PROFILES } from '../nmap';

export const nmapNetworkDiscoveryCheck: CheckModule = {
  id: 'network-discovery',
  name: 'Network Discovery (Nmap -sn)',

  async run(target: string): Promise<CheckResult[]> {
    if (!(await isNmapAvailable())) {
      throw new Error('Nmap not available for network discovery');
    }

    const results: CheckResult[] = [];

    try {
      const profile = SCAN_PROFILES['discovery'];
      const { xml } = await runNmap([...profile.args, target], profile.timeout);
      const scanResult = parseNmapXml(xml);

      const liveHosts = scanResult.hosts.filter((h) => h.status === 'up');

      if (liveHosts.length === 0) {
        results.push({
          title: `No Live Hosts Found: ${target}`,
          severity: 'info',
          description: `Nmap ping sweep found no live hosts at ${target}. The hosts may be behind a firewall that blocks ICMP/TCP probes.`,
          remediation: 'Verify network connectivity. Try an authenticated scan or use different discovery techniques.',
          details: {
            target,
            liveHosts: 0,
            hosts: [],
            discoveryMethod: 'nmap-ping-sweep',
            scanEngine: 'nmap',
          },
        });
        return results;
      }

      // Classify devices
      const hostDetails = liveHosts.map((h) => {
        const deviceType = classifyDevice(h.ports.filter((p) => p.state === 'open').map((p) => p.number), h.vendor);
        return {
          ip: h.ip,
          hostname: h.hostname,
          macAddress: h.macAddress,
          vendor: h.vendor,
          openPorts: h.ports.filter((p) => p.state === 'open').map((p) => p.number),
          deviceType,
          distance: h.distance,
        };
      });

      // Summary finding
      results.push({
        title: `Network Discovery: ${liveHosts.length} Live Hosts Found`,
        severity: 'info',
        description: `Nmap ping sweep discovered ${liveHosts.length} live hosts at ${target}. ` +
          `Device types: ${summarizeDeviceTypes(hostDetails)}.`,
        remediation: 'Review all discovered hosts and ensure they are authorized on the network. Investigate any unknown or unexpected devices.',
        details: {
          target,
          subnetSize: estimateSubnetSize(target),
          liveHosts: liveHosts.length,
          hosts: hostDetails,
          discoveryMethod: 'nmap-ping-sweep',
          scanEngine: 'nmap',
        },
      });

      // Separate findings for network devices
      const networkDevices = hostDetails.filter((h) => h.deviceType === 'network_device');
      if (networkDevices.length > 0) {
        results.push({
          title: `${networkDevices.length} Network Devices Discovered`,
          severity: 'info',
          description: `Found ${networkDevices.length} network infrastructure devices: ${networkDevices.map((d) => `${d.ip} (${d.vendor || 'unknown vendor'})`).join(', ')}.`,
          remediation: 'Ensure all network devices have current firmware, strong authentication, and restricted management access.',
          details: {
            deviceType: 'network_device',
            devices: networkDevices,
            vulnId: 'network-device-discovered',
            scanEngine: 'nmap',
          },
        });
      }

      // Separate findings for IoT devices
      const iotDevices = hostDetails.filter((h) => h.deviceType === 'iot_device');
      if (iotDevices.length > 0) {
        results.push({
          title: `${iotDevices.length} IoT Devices Discovered`,
          severity: 'medium',
          description: `Found ${iotDevices.length} IoT/industrial devices: ${iotDevices.map((d) => `${d.ip} (${d.vendor || 'unknown'})`).join(', ')}. IoT devices often have weak security controls.`,
          remediation: 'Segment IoT devices onto a separate VLAN. Disable unnecessary protocols. Change default credentials. Monitor traffic for anomalies.',
          cvssScore: 5.3,
          details: {
            deviceType: 'iot_device',
            devices: iotDevices,
            vulnId: 'iot-device-discovered',
            scanEngine: 'nmap',
          },
        });
      }

      // Unknown devices
      const unknownDevices = hostDetails.filter((h) => h.deviceType === 'unknown');
      if (unknownDevices.length > 0) {
        results.push({
          title: `${unknownDevices.length} Unidentified Devices`,
          severity: 'low',
          description: `Found ${unknownDevices.length} devices that could not be classified. These may need manual investigation.`,
          remediation: 'Investigate unidentified devices to determine their purpose and ownership. Remove unauthorized devices from the network.',
          details: {
            deviceType: 'unknown',
            devices: unknownDevices,
            vulnId: 'unidentified-device',
            scanEngine: 'nmap',
          },
        });
      }

      return results;
    } catch (error) {
      console.error(`[NmapNetworkDiscovery] Error scanning ${target}: ${error}`);
      throw error;
    }
  },
};

function classifyDevice(
  openPorts: number[],
  vendor: string | null
): 'server' | 'workstation' | 'network_device' | 'printer' | 'iot_device' | 'unknown' {
  const portSet = new Set(openPorts);
  const v = (vendor || '').toLowerCase();

  // Network device vendors
  if (['cisco', 'juniper', 'arista', 'mikrotik', 'ubiquiti', 'fortinet', 'palo alto'].some((nv) => v.includes(nv))) {
    return 'network_device';
  }

  // Network device ports
  if (portSet.has(161) || portSet.has(179) || portSet.has(1812) || portSet.has(520)) {
    return 'network_device';
  }

  // Printer
  if (portSet.has(515) || portSet.has(631) || portSet.has(9100)) return 'printer';
  if (['hp', 'epson', 'canon', 'brother', 'lexmark', 'xerox'].some((pv) => v.includes(pv))) return 'printer';

  // IoT
  if (portSet.has(502) || portSet.has(1883) || portSet.has(5683) || portSet.has(47808)) return 'iot_device';

  // Server
  const webPorts = [80, 443, 8080, 8443];
  const dbPorts = [3306, 5432, 1433, 6379, 27017];
  const hasWeb = webPorts.some((p) => portSet.has(p));
  const hasDb = dbPorts.some((p) => portSet.has(p));
  if (hasWeb || hasDb || portSet.has(22)) return 'server';

  // Workstation
  if (portSet.has(3389) || portSet.has(445)) return 'workstation';

  return 'unknown';
}

function estimateSubnetSize(target: string): number {
  const cidrMatch = target.match(/\/(\d+)$/);
  if (cidrMatch) {
    const prefix = parseInt(cidrMatch[1]);
    return Math.pow(2, 32 - prefix) - 2;
  }
  return 1;
}

function summarizeDeviceTypes(hosts: Array<{ deviceType: string }>): string {
  const counts: Record<string, number> = {};
  for (const h of hosts) {
    counts[h.deviceType] = (counts[h.deviceType] || 0) + 1;
  }
  return Object.entries(counts).map(([type, count]) => `${count} ${type}`).join(', ');
}
