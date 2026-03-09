/**
 * Network Discovery Check Module
 *
 * Enterprise Asset Discovery: CIDR subnet parsing, host alive detection
 * via TCP probes, IP enumeration, and network topology awareness.
 *
 * Methods:
 * - CIDR subnet parsing (e.g., 10.0.1.0/24 → 254 hosts)
 * - TCP SYN-like probes on common ports for host discovery
 * - Parallel batch scanning with configurable concurrency
 * - Network device identification from response patterns
 *
 * Output: Live host IPs, hostnames, estimated device types
 */

import * as net from "net";
import * as dns from "dns";
import { CheckModule, CheckResult } from "../types";
import { getVulnById } from "../vulnerability-db";

// Common ports for host alive detection (fast TCP connect)
const DISCOVERY_PORTS = [80, 443, 22, 445, 3389, 8080, 21, 23, 25, 53, 135, 139, 161, 993, 8443];

// Network device indicator ports
const NETWORK_DEVICE_PORTS = [161, 162, 179, 520, 1812, 1813];
const PRINTER_PORTS = [515, 631, 9100];
const IOT_PORTS = [502, 1883, 5683, 8883, 47808]; // Modbus, MQTT, CoAP, BACnet

interface DiscoveredHost {
  ip: string;
  hostname: string | null;
  openPorts: number[];
  deviceType: string; // server, network_device, printer, iot_device, workstation, unknown
  ttl: number | null;
}

/**
 * Parse CIDR notation to generate IP list
 * e.g., "192.168.1.0/24" → ["192.168.1.1", ..., "192.168.1.254"]
 */
function parseCIDR(cidr: string): string[] {
  const parts = cidr.split("/");
  if (parts.length !== 2) return [cidr]; // Not CIDR, return as-is

  const ip = parts[0];
  const prefix = parseInt(parts[1], 10);
  if (isNaN(prefix) || prefix < 0 || prefix > 32) return [cidr];

  const ipParts = ip.split(".").map(Number);
  if (ipParts.length !== 4 || ipParts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return [cidr];
  }

  const ipNum = (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  const network = (ipNum & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;

  // Limit to /20 (4094 hosts) to prevent excessive scanning
  const hostCount = broadcast - network - 1;
  if (hostCount > 4094 || hostCount < 1) {
    // For /32 (single host) or too large
    if (prefix === 32) return [ip];
    return [ip]; // Return the base IP for subnets too large
  }

  const ips: string[] = [];
  for (let i = network + 1; i < broadcast && ips.length < 4094; i++) {
    const a = (i >>> 24) & 255;
    const b = (i >>> 16) & 255;
    const c = (i >>> 8) & 255;
    const d = i & 255;
    ips.push(`${a}.${b}.${c}.${d}`);
  }
  return ips;
}

/**
 * Check if a host is alive by attempting TCP connect on fast ports
 */
function probeHost(host: string, port: number, timeout = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeout);
    socket.connect(port, host, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

/**
 * Discover which ports are open on a host (fast sweep)
 */
async function discoverOpenPorts(host: string, ports: number[]): Promise<number[]> {
  const results = await Promise.all(
    ports.map(async (port) => {
      const isOpen = await probeHost(host, port, 1200);
      return { port, isOpen };
    })
  );
  return results.filter((r) => r.isOpen).map((r) => r.port);
}

/**
 * Reverse DNS lookup
 */
function reverseLookup(ip: string): Promise<string | null> {
  return new Promise((resolve) => {
    dns.reverse(ip, (err, hostnames) => {
      if (err || !hostnames?.length) resolve(null);
      else resolve(hostnames[0]);
    });
  });
}

/**
 * Determine device type based on open ports
 */
function classifyDevice(openPorts: number[]): string {
  const hasNetworkDevicePorts = NETWORK_DEVICE_PORTS.some((p) => openPorts.includes(p));
  const hasPrinterPorts = PRINTER_PORTS.some((p) => openPorts.includes(p));
  const hasIoTPorts = IOT_PORTS.some((p) => openPorts.includes(p));
  const hasWebPorts = [80, 443, 8080, 8443].some((p) => openPorts.includes(p));
  const hasSSH = openPorts.includes(22);
  const hasRDP = openPorts.includes(3389);
  const hasSMB = openPorts.includes(445);
  const hasDB = [3306, 5432, 1433, 27017, 6379].some((p) => openPorts.includes(p));

  if (hasNetworkDevicePorts) return "network_device";
  if (hasPrinterPorts) return "printer";
  if (hasIoTPorts) return "iot_device";
  if (hasDB && hasWebPorts) return "server";
  if (hasRDP && hasSMB && !hasWebPorts) return "workstation";
  if (hasWebPorts || hasSSH) return "server";
  if (hasSMB) return "workstation";

  return "unknown";
}

export const networkDiscoveryCheck: CheckModule = {
  id: "network-discovery",
  name: "Network Discovery & Host Enumeration",

  async run(target: string): Promise<CheckResult[]> {
    const results: CheckResult[] = [];
    const host = target.replace(/^https?:\/\//, "").replace(/[:/].*$/, "");

    // Determine if target is a CIDR range or single host
    const isCIDR = host.includes("/");
    const isIP = /^\d+\.\d+\.\d+\.\d+/.test(host);

    if (isCIDR) {
      // CIDR subnet scanning
      const ips = parseCIDR(host);
      const discoveredHosts: DiscoveredHost[] = [];

      // Scan in batches of 20 to avoid overwhelming
      const batchSize = 20;
      for (let i = 0; i < ips.length && i < 254; i += batchSize) {
        const batch = ips.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(async (ip) => {
            // Quick alive check on port 80 and 443
            const alive = await probeHost(ip, 80, 800) || await probeHost(ip, 443, 800);
            if (!alive) return null;

            // Full port discovery on alive hosts
            const openPorts = await discoverOpenPorts(ip, DISCOVERY_PORTS);
            if (openPorts.length === 0) return null;

            const hostname = await reverseLookup(ip);
            const deviceType = classifyDevice(openPorts);

            return {
              ip,
              hostname,
              openPorts,
              deviceType,
              ttl: null,
            } as DiscoveredHost;
          })
        );

        for (const result of batchResults) {
          if (result) discoveredHosts.push(result);
        }
      }

      // Create discovery results
      if (discoveredHosts.length > 0) {
        results.push({
          title: `Network Discovery: ${discoveredHosts.length} Live Hosts Found in ${host}`,
          severity: "info",
          description: `Subnet enumeration discovered ${discoveredHosts.length} active hosts in the ${host} network range. Each host was identified through TCP port probing on common service ports.`,
          remediation: "Review all discovered hosts to ensure they are authorized. Decommission or isolate any unauthorized devices. Maintain an accurate asset inventory.",
          details: {
            target: host,
            subnetSize: ips.length,
            liveHosts: discoveredHosts.length,
            hosts: discoveredHosts.map((h) => ({
              ip: h.ip,
              hostname: h.hostname,
              openPorts: h.openPorts,
              deviceType: h.deviceType,
            })),
            discoveryMethod: "tcp_probe",
          },
        });

        // Flag network devices
        const networkDevices = discoveredHosts.filter((h) => h.deviceType === "network_device");
        if (networkDevices.length > 0) {
          const vuln = getVulnById("network-device-discovered");
          if (vuln) {
            results.push({
              title: vuln.title,
              severity: vuln.severity,
              description: vuln.description,
              remediation: vuln.remediation,
              cvssScore: vuln.cvssScore,
              details: {
                devices: networkDevices.map((d) => ({
                  ip: d.ip,
                  hostname: d.hostname,
                  openPorts: d.openPorts,
                })),
                count: networkDevices.length,
              },
            });
          }
        }

        // Flag IoT devices
        const iotDevices = discoveredHosts.filter((h) => h.deviceType === "iot_device");
        if (iotDevices.length > 0) {
          const vuln = getVulnById("iot-device-discovered");
          if (vuln) {
            results.push({
              title: vuln.title,
              severity: vuln.severity,
              description: vuln.description,
              remediation: vuln.remediation,
              cvssScore: vuln.cvssScore,
              details: {
                devices: iotDevices.map((d) => ({
                  ip: d.ip,
                  hostname: d.hostname,
                  openPorts: d.openPorts,
                })),
                count: iotDevices.length,
              },
            });
          }
        }

        // Flag unidentified devices
        const unknownDevices = discoveredHosts.filter((h) => h.deviceType === "unknown");
        if (unknownDevices.length > 0) {
          const vuln = getVulnById("unidentified-device");
          if (vuln) {
            results.push({
              title: vuln.title,
              severity: vuln.severity,
              description: vuln.description,
              remediation: vuln.remediation,
              cvssScore: vuln.cvssScore,
              details: {
                devices: unknownDevices.map((d) => ({
                  ip: d.ip,
                  hostname: d.hostname,
                  openPorts: d.openPorts,
                })),
                count: unknownDevices.length,
              },
            });
          }
        }
      }
    } else if (isIP) {
      // Single IP discovery
      const openPorts = await discoverOpenPorts(host, DISCOVERY_PORTS);
      const hostname = await reverseLookup(host);
      const deviceType = classifyDevice(openPorts);

      if (openPorts.length > 0) {
        results.push({
          title: `Host Discovery: ${host} is Active`,
          severity: "info",
          description: `Host ${host}${hostname ? ` (${hostname})` : ""} was found active with ${openPorts.length} open port(s). Device classification: ${deviceType}.`,
          remediation: "Verify this host is authorized and properly inventoried. Ensure all open services are required and properly secured.",
          details: {
            target: host,
            hostname,
            openPorts,
            deviceType,
            discoveryMethod: "tcp_probe",
          },
        });
      }
    } else {
      // Hostname - resolve and probe
      try {
        const addresses = await new Promise<string[]>((resolve) => {
          dns.resolve4(host, (err, addrs) => {
            if (err) resolve([]);
            else resolve(addrs);
          });
        });

        if (addresses.length > 0) {
          const openPorts = await discoverOpenPorts(addresses[0], DISCOVERY_PORTS);
          const deviceType = classifyDevice(openPorts);

          results.push({
            title: `Host Discovery: ${host} Resolved`,
            severity: "info",
            description: `Hostname ${host} resolved to ${addresses.join(", ")} with ${openPorts.length} open port(s). Device classification: ${deviceType}.`,
            remediation: "Verify DNS records are accurate and the host is properly inventoried in the asset management system.",
            details: {
              target: host,
              resolvedIPs: addresses,
              openPorts,
              deviceType,
              discoveryMethod: "dns_resolve_tcp_probe",
            },
          });
        }
      } catch {
        // DNS resolution failed — not a finding
      }
    }

    return results;
  },
};
