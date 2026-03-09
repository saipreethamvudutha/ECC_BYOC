/**
 * Service Detection Check Module
 *
 * Enterprise Asset Discovery: TCP banner grabbing and service version
 * identification. Connects to open ports, reads service banners, and
 * identifies software names and versions.
 *
 * Methods:
 * - TCP connect + banner read (first 1024 bytes)
 * - Protocol-specific probes (HTTP, SMTP, FTP, SSH, etc.)
 * - Version extraction via regex patterns
 * - Service fingerprinting database
 *
 * Output: Service names, versions, protocol details per port
 */

import * as net from "net";
import { CheckModule, CheckResult } from "../types";
import { getVulnById } from "../vulnerability-db";

interface ServiceInfo {
  port: number;
  protocol: string;
  service: string;
  version: string | null;
  banner: string;
  product: string | null;
  extraInfo: string | null;
}

// Ports to grab banners from (common services that send banners)
const BANNER_PORTS = [
  21, 22, 23, 25, 80, 110, 143, 443, 445, 587,
  993, 995, 1433, 3306, 3389, 5432, 5900, 6379,
  8080, 8443, 9200, 27017,
];

// Protocol probes — what to send to elicit a response
const PROTOCOL_PROBES: Record<number, { probe: string; tls?: boolean }> = {
  80: { probe: "GET / HTTP/1.0\r\nHost: target\r\n\r\n" },
  443: { probe: "GET / HTTP/1.0\r\nHost: target\r\n\r\n", tls: true },
  8080: { probe: "GET / HTTP/1.0\r\nHost: target\r\n\r\n" },
  8443: { probe: "GET / HTTP/1.0\r\nHost: target\r\n\r\n", tls: true },
  // Others are banner-grab (server sends first)
};

// Service identification patterns
const SERVICE_PATTERNS: { pattern: RegExp; service: string; product: string; versionGroup?: number }[] = [
  // SSH
  { pattern: /SSH-[\d.]+-OpenSSH[_-](\S+)/i, service: "ssh", product: "OpenSSH", versionGroup: 1 },
  { pattern: /SSH-[\d.]+-dropbear[_-]?(\S*)/i, service: "ssh", product: "Dropbear SSH", versionGroup: 1 },
  { pattern: /SSH-[\d.]+-([\S]+)/i, service: "ssh", product: "SSH", versionGroup: 1 },

  // HTTP Servers
  { pattern: /Server:\s*Apache\/([\d.]+)/i, service: "http", product: "Apache httpd", versionGroup: 1 },
  { pattern: /Server:\s*nginx\/([\d.]+)/i, service: "http", product: "nginx", versionGroup: 1 },
  { pattern: /Server:\s*Microsoft-IIS\/([\d.]+)/i, service: "http", product: "Microsoft IIS", versionGroup: 1 },
  { pattern: /Server:\s*LiteSpeed/i, service: "http", product: "LiteSpeed", versionGroup: undefined },
  { pattern: /Server:\s*cloudflare/i, service: "http", product: "Cloudflare", versionGroup: undefined },
  { pattern: /Server:\s*AmazonS3/i, service: "http", product: "Amazon S3", versionGroup: undefined },
  { pattern: /X-Powered-By:\s*Express/i, service: "http", product: "Express.js", versionGroup: undefined },
  { pattern: /X-Powered-By:\s*PHP\/([\d.]+)/i, service: "http", product: "PHP", versionGroup: 1 },
  { pattern: /X-Powered-By:\s*ASP\.NET/i, service: "http", product: "ASP.NET", versionGroup: undefined },

  // FTP
  { pattern: /220[- ].*vsftpd\s+([\d.]+)/i, service: "ftp", product: "vsftpd", versionGroup: 1 },
  { pattern: /220[- ].*ProFTPD\s+([\d.]+)/i, service: "ftp", product: "ProFTPD", versionGroup: 1 },
  { pattern: /220[- ].*FileZilla Server\s+([\d.]+)/i, service: "ftp", product: "FileZilla Server", versionGroup: 1 },
  { pattern: /220[- ].*Pure-FTPd/i, service: "ftp", product: "Pure-FTPd", versionGroup: undefined },
  { pattern: /220[- ].*Microsoft FTP/i, service: "ftp", product: "Microsoft FTP", versionGroup: undefined },
  { pattern: /220[- ]/i, service: "ftp", product: "FTP", versionGroup: undefined },

  // SMTP
  { pattern: /220[- ].*Postfix/i, service: "smtp", product: "Postfix", versionGroup: undefined },
  { pattern: /220[- ].*Exim\s+([\d.]+)/i, service: "smtp", product: "Exim", versionGroup: 1 },
  { pattern: /220[- ].*Microsoft ESMTP/i, service: "smtp", product: "Microsoft Exchange", versionGroup: undefined },
  { pattern: /220[- ].*Sendmail/i, service: "smtp", product: "Sendmail", versionGroup: undefined },

  // Databases
  { pattern: /mysql_native_password/i, service: "mysql", product: "MySQL", versionGroup: undefined },
  { pattern: /([\d.]+)-MariaDB/i, service: "mysql", product: "MariaDB", versionGroup: 1 },
  { pattern: /PostgreSQL/i, service: "postgresql", product: "PostgreSQL", versionGroup: undefined },
  { pattern: /Redis.*v=([\d.]+)/i, service: "redis", product: "Redis", versionGroup: 1 },
  { pattern: /-REDIS/i, service: "redis", product: "Redis", versionGroup: undefined },
  { pattern: /MongoDB/i, service: "mongodb", product: "MongoDB", versionGroup: undefined },

  // RDP
  { pattern: /\x03\x00/i, service: "rdp", product: "RDP", versionGroup: undefined },

  // Telnet
  { pattern: /login:/i, service: "telnet", product: "Telnet", versionGroup: undefined },

  // Elasticsearch
  { pattern: /elasticsearch/i, service: "elasticsearch", product: "Elasticsearch", versionGroup: undefined },

  // Network devices
  { pattern: /Cisco/i, service: "network", product: "Cisco IOS", versionGroup: undefined },
  { pattern: /MikroTik/i, service: "network", product: "MikroTik RouterOS", versionGroup: undefined },
  { pattern: /Ubiquiti/i, service: "network", product: "Ubiquiti", versionGroup: undefined },
  { pattern: /FortiGate/i, service: "firewall", product: "Fortinet FortiGate", versionGroup: undefined },
  { pattern: /pfSense/i, service: "firewall", product: "pfSense", versionGroup: undefined },
];

/**
 * Grab banner from a TCP port
 */
function grabBanner(host: string, port: number, timeout = 3000): Promise<string | null> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let data = "";
    socket.setTimeout(timeout);

    socket.connect(port, host, () => {
      // For HTTP ports, send a probe
      const probe = PROTOCOL_PROBES[port];
      if (probe && !probe.tls) {
        socket.write(probe.probe.replace("target", host));
      }
      // Otherwise wait for server to send banner
    });

    socket.on("data", (chunk) => {
      data += chunk.toString("utf8", 0, Math.min(chunk.length, 1024));
      if (data.length >= 1024) {
        socket.destroy();
        resolve(data.substring(0, 1024));
      }
    });

    socket.on("timeout", () => {
      socket.destroy();
      resolve(data.length > 0 ? data.substring(0, 1024) : null);
    });

    socket.on("error", () => {
      socket.destroy();
      resolve(data.length > 0 ? data.substring(0, 1024) : null);
    });

    socket.on("close", () => {
      resolve(data.length > 0 ? data.substring(0, 1024) : null);
    });

    // Safety timeout
    setTimeout(() => {
      socket.destroy();
      resolve(data.length > 0 ? data.substring(0, 1024) : null);
    }, timeout + 500);
  });
}

/**
 * Identify service from banner
 */
function identifyService(port: number, banner: string): Partial<ServiceInfo> {
  for (const pat of SERVICE_PATTERNS) {
    const match = banner.match(pat.pattern);
    if (match) {
      return {
        service: pat.service,
        product: pat.product,
        version: pat.versionGroup !== undefined ? match[pat.versionGroup] || null : null,
      };
    }
  }

  // Fallback: identify by port
  const portServices: Record<number, string> = {
    21: "ftp", 22: "ssh", 23: "telnet", 25: "smtp", 53: "dns",
    80: "http", 110: "pop3", 143: "imap", 443: "https", 445: "smb",
    587: "smtp", 993: "imaps", 995: "pop3s", 1433: "mssql",
    3306: "mysql", 3389: "rdp", 5432: "postgresql", 5900: "vnc",
    6379: "redis", 8080: "http-proxy", 8443: "https-alt",
    9200: "elasticsearch", 27017: "mongodb",
  };

  return {
    service: portServices[port] || "unknown",
    product: null,
    version: null,
  };
}

/**
 * Grab banner via HTTPS (for TLS ports)
 */
async function grabHTTPSBanner(host: string, port: number): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`https://${host}:${port}/`, {
      method: "HEAD",
      signal: controller.signal,
      // @ts-expect-error - Node.js fetch option
      rejectUnauthorized: false,
    });
    clearTimeout(timeout);

    const headers: string[] = [];
    res.headers.forEach((value, key) => {
      headers.push(`${key}: ${value}`);
    });
    return `HTTP/${res.status}\r\n${headers.join("\r\n")}`;
  } catch {
    return null;
  }
}

export const serviceDetectionCheck: CheckModule = {
  id: "service-detection",
  name: "Service & Version Detection",

  async run(target: string): Promise<CheckResult[]> {
    const results: CheckResult[] = [];
    const host = target.replace(/^https?:\/\//, "").replace(/[:/].*$/, "");
    const detectedServices: ServiceInfo[] = [];

    // Grab banners from common ports in parallel (batches of 5)
    const batchSize = 5;
    for (let i = 0; i < BANNER_PORTS.length; i += batchSize) {
      const batch = BANNER_PORTS.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (port) => {
          let banner: string | null = null;

          // Use HTTPS for TLS ports
          if (PROTOCOL_PROBES[port]?.tls) {
            banner = await grabHTTPSBanner(host, port);
          }

          // Fall back to TCP banner grab
          if (!banner) {
            banner = await grabBanner(host, port);
          }

          if (banner) {
            const identified = identifyService(port, banner);
            return {
              port,
              protocol: "tcp",
              service: identified.service || "unknown",
              version: identified.version || null,
              banner: banner.substring(0, 256), // Truncate for storage
              product: identified.product || null,
              extraInfo: null,
            } as ServiceInfo;
          }
          return null;
        })
      );

      for (const result of batchResults) {
        if (result) detectedServices.push(result);
      }
    }

    if (detectedServices.length > 0) {
      // Main service detection result
      results.push({
        title: `Service Detection: ${detectedServices.length} Services Identified on ${host}`,
        severity: "info",
        description: `Service version detection identified ${detectedServices.length} running service(s) on ${host}. Service information includes software product, version, and protocol details.`,
        remediation: "Review all detected services. Ensure only required services are running. Update any services with known vulnerabilities to their latest versions.",
        details: {
          target: host,
          serviceCount: detectedServices.length,
          services: detectedServices.map((s) => ({
            port: s.port,
            protocol: s.protocol,
            service: s.service,
            product: s.product,
            version: s.version,
            banner: s.banner,
          })),
        },
      });

      // Check for outdated/vulnerable services
      for (const svc of detectedServices) {
        // Flag outdated SSH versions
        if (svc.product === "OpenSSH" && svc.version) {
          const majorVersion = parseFloat(svc.version);
          if (majorVersion < 8.0) {
            const vuln = getVulnById("outdated-ssh-version");
            if (vuln) {
              results.push({
                title: `${vuln.title}: OpenSSH ${svc.version}`,
                severity: vuln.severity,
                description: vuln.description,
                remediation: vuln.remediation,
                cveId: vuln.cveId,
                cvssScore: vuln.cvssScore,
                details: { host, port: svc.port, product: svc.product, version: svc.version },
              });
            }
          }
        }

        // Flag outdated Apache
        if (svc.product === "Apache httpd" && svc.version) {
          const parts = svc.version.split(".").map(Number);
          if (parts[0] === 2 && parts[1] < 4) {
            const vuln = getVulnById("outdated-web-server");
            if (vuln) {
              results.push({
                title: `${vuln.title}: Apache ${svc.version}`,
                severity: vuln.severity,
                description: vuln.description,
                remediation: vuln.remediation,
                cvssScore: vuln.cvssScore,
                details: { host, port: svc.port, product: svc.product, version: svc.version },
              });
            }
          }
        }

        // Flag outdated nginx
        if (svc.product === "nginx" && svc.version) {
          const parts = svc.version.split(".").map(Number);
          if (parts[0] === 1 && parts[1] < 20) {
            const vuln = getVulnById("outdated-web-server");
            if (vuln) {
              results.push({
                title: `${vuln.title}: nginx ${svc.version}`,
                severity: vuln.severity,
                description: vuln.description,
                remediation: vuln.remediation,
                cvssScore: vuln.cvssScore,
                details: { host, port: svc.port, product: svc.product, version: svc.version },
              });
            }
          }
        }

        // Flag Telnet service
        if (svc.service === "telnet") {
          const vuln = getVulnById("telnet-service-detected");
          if (vuln) {
            results.push({
              title: vuln.title,
              severity: vuln.severity,
              description: vuln.description,
              remediation: vuln.remediation,
              cvssScore: vuln.cvssScore,
              details: { host, port: svc.port, product: svc.product },
            });
          }
        }

        // Flag unencrypted database services
        if (["mysql", "postgresql", "redis", "mongodb", "mssql"].includes(svc.service)) {
          const vuln = getVulnById("exposed-database-service");
          if (vuln) {
            results.push({
              title: `${vuln.title}: ${svc.product || svc.service} on port ${svc.port}`,
              severity: vuln.severity,
              description: vuln.description,
              remediation: vuln.remediation,
              cvssScore: vuln.cvssScore,
              details: {
                host,
                port: svc.port,
                service: svc.service,
                product: svc.product,
                version: svc.version,
              },
            });
          }
        }
      }
    }

    return results;
  },
};
