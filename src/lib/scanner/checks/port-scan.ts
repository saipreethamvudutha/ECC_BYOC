/**
 * Port Scan Check Module
 *
 * TCP connect scan on common service ports.
 * Uses Node.js `net` module — no external dependencies.
 */

import * as net from "net";
import { CheckModule, CheckResult } from "../types";
import { getVulnById } from "../vulnerability-db";

interface PortConfig {
  port: number;
  service: string;
  vulnId?: string;
  category: "standard" | "database" | "remote-access" | "web" | "misc";
}

const PORTS_TO_SCAN: PortConfig[] = [
  { port: 21, service: "FTP", vulnId: "open-ftp-port", category: "standard" },
  { port: 22, service: "SSH", vulnId: "open-ssh-port", category: "remote-access" },
  { port: 23, service: "Telnet", vulnId: "open-telnet-port", category: "remote-access" },
  { port: 25, service: "SMTP", category: "standard" },
  { port: 53, service: "DNS", category: "standard" },
  { port: 80, service: "HTTP", category: "web" },
  { port: 110, service: "POP3", category: "standard" },
  { port: 143, service: "IMAP", category: "standard" },
  { port: 443, service: "HTTPS", category: "web" },
  { port: 445, service: "SMB", category: "misc" },
  { port: 993, service: "IMAPS", category: "standard" },
  { port: 995, service: "POP3S", category: "standard" },
  { port: 1433, service: "MSSQL", vulnId: "open-database-port", category: "database" },
  { port: 3306, service: "MySQL", vulnId: "open-database-port", category: "database" },
  { port: 3389, service: "RDP", vulnId: "open-rdp-port", category: "remote-access" },
  { port: 5432, service: "PostgreSQL", vulnId: "open-database-port", category: "database" },
  { port: 5900, service: "VNC", category: "remote-access" },
  { port: 6379, service: "Redis", vulnId: "open-database-port", category: "database" },
  { port: 8080, service: "HTTP-Alt", category: "web" },
  { port: 8443, service: "HTTPS-Alt", category: "web" },
  { port: 27017, service: "MongoDB", vulnId: "open-database-port", category: "database" },
];

// Expected open ports for web servers — don't flag these as unexpected
const EXPECTED_WEB_PORTS = [80, 443, 8080, 8443];

function checkPort(host: string, port: number, timeout = 3000): Promise<boolean> {
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

export const portScanCheck: CheckModule = {
  id: "port-scan",
  name: "Port Scan",

  async run(target: string): Promise<CheckResult[]> {
    const results: CheckResult[] = [];
    const host = target.replace(/^https?:\/\//, "").replace(/[:/].*$/, "");

    // Scan all ports concurrently (with batch limit to avoid flooding)
    const batchSize = 10;
    const openPorts: PortConfig[] = [];

    for (let i = 0; i < PORTS_TO_SCAN.length; i += batchSize) {
      const batch = PORTS_TO_SCAN.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (pc) => {
          const isOpen = await checkPort(host, pc.port);
          return { ...pc, isOpen };
        })
      );
      for (const r of batchResults) {
        if (r.isOpen) openPorts.push(r);
      }
    }

    // Generate findings for risky open ports
    for (const openPort of openPorts) {
      if (openPort.vulnId) {
        const vuln = getVulnById(openPort.vulnId);
        if (vuln) {
          results.push({
            title: `${vuln.title}`,
            severity: vuln.severity,
            description: vuln.description,
            remediation: vuln.remediation,
            cveId: vuln.cveId,
            cvssScore: vuln.cvssScore,
            details: {
              host,
              port: openPort.port,
              service: openPort.service,
              category: openPort.category,
            },
          });
        }
      } else if (!EXPECTED_WEB_PORTS.includes(openPort.port) && openPort.category === "misc") {
        // Flag unexpected non-web ports
        const vuln = getVulnById("unexpected-open-port");
        if (vuln) {
          results.push({
            title: `${vuln.title} (${openPort.service} - Port ${openPort.port})`,
            severity: vuln.severity,
            description: vuln.description,
            remediation: vuln.remediation,
            cvssScore: vuln.cvssScore,
            details: {
              host,
              port: openPort.port,
              service: openPort.service,
            },
          });
        }
      }
    }

    return results;
  },
};
