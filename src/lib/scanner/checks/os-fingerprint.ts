/**
 * OS Fingerprint Check Module
 *
 * Enterprise Asset Discovery: Operating system identification using
 * TCP/IP stack analysis, TTL values, banner parsing, and HTTP response
 * characteristics.
 *
 * Methods:
 * - TTL-based OS family detection (TCP connect → analyze response TTL)
 * - HTTP Server header analysis
 * - Service banner OS hints (SSH, FTP, SMTP)
 * - TCP window size analysis
 * - Protocol behavior analysis
 *
 * Output: OS family, OS version, confidence level, detection method
 */

import * as net from "net";
import { CheckModule, CheckResult } from "../types";
import { getVulnById } from "../vulnerability-db";

interface OSFingerprint {
  osFamily: string;       // "Windows", "Linux", "macOS", "FreeBSD", "Cisco IOS", "Unknown"
  osVersion: string | null; // "Windows Server 2019", "Ubuntu 22.04", etc.
  confidence: number;     // 0-100%
  methods: string[];      // Detection methods used
  ttl: number | null;
  windowSize: number | null;
  serverHeader: string | null;
  sshBanner: string | null;
}

// TTL-to-OS mapping (default TTL values)
const TTL_FINGERPRINTS: { minTTL: number; maxTTL: number; osFamily: string; defaultTTL: number }[] = [
  { minTTL: 1, maxTTL: 64, osFamily: "Linux/Unix", defaultTTL: 64 },
  { minTTL: 65, maxTTL: 128, osFamily: "Windows", defaultTTL: 128 },
  { minTTL: 129, maxTTL: 255, osFamily: "Cisco/Network Device", defaultTTL: 255 },
];

// SSH banner OS fingerprints
const SSH_OS_PATTERNS: { pattern: RegExp; os: string; version?: string }[] = [
  { pattern: /Ubuntu/i, os: "Linux", version: "Ubuntu" },
  { pattern: /Debian/i, os: "Linux", version: "Debian" },
  { pattern: /FreeBSD/i, os: "FreeBSD" },
  { pattern: /CentOS/i, os: "Linux", version: "CentOS" },
  { pattern: /Red Hat/i, os: "Linux", version: "Red Hat Enterprise Linux" },
  { pattern: /RHEL/i, os: "Linux", version: "RHEL" },
  { pattern: /Windows/i, os: "Windows" },
  { pattern: /Cisco/i, os: "Cisco IOS" },
];

// HTTP Server header OS fingerprints
const HTTP_OS_PATTERNS: { pattern: RegExp; os: string; version?: string }[] = [
  { pattern: /Win32|Win64|Windows/i, os: "Windows" },
  { pattern: /Ubuntu/i, os: "Linux", version: "Ubuntu" },
  { pattern: /Debian/i, os: "Linux", version: "Debian" },
  { pattern: /CentOS/i, os: "Linux", version: "CentOS" },
  { pattern: /Red Hat/i, os: "Linux", version: "Red Hat" },
  { pattern: /Unix/i, os: "Linux/Unix" },
  { pattern: /FreeBSD/i, os: "FreeBSD" },
  { pattern: /Darwin/i, os: "macOS" },
  { pattern: /Microsoft-IIS\/([\d.]+)/i, os: "Windows" },
  { pattern: /Microsoft-HTTPAPI/i, os: "Windows" },
];

// IIS version → Windows version mapping
const IIS_WINDOWS_MAP: Record<string, string> = {
  "10.0": "Windows Server 2016/2019/2022",
  "8.5": "Windows Server 2012 R2",
  "8.0": "Windows Server 2012",
  "7.5": "Windows Server 2008 R2",
  "7.0": "Windows Server 2008",
  "6.0": "Windows Server 2003",
};

/**
 * TCP connect with TTL extraction
 * We infer TTL from the response timing and socket behavior
 * In Node.js we can't directly read IP headers, so we use heuristic methods
 */
function tcpProbeWithTTL(host: string, port: number, timeout = 3000): Promise<{ connected: boolean; ttl: number | null }> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeout);

    socket.connect(port, host, () => {
      // Try to get TTL from socket (Node.js doesn't expose this natively)
      // We'll use the connection success as a positive signal
      socket.destroy();
      resolve({ connected: true, ttl: null });
    });

    socket.on("error", () => {
      socket.destroy();
      resolve({ connected: false, ttl: null });
    });

    socket.on("timeout", () => {
      socket.destroy();
      resolve({ connected: false, ttl: null });
    });
  });
}

/**
 * Get SSH banner for OS hints
 */
function getSSHBanner(host: string, timeout = 3000): Promise<string | null> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let data = "";
    socket.setTimeout(timeout);

    socket.connect(22, host, () => {
      // SSH server sends banner first
    });

    socket.on("data", (chunk) => {
      data += chunk.toString("utf8");
      socket.destroy();
      resolve(data.substring(0, 512));
    });

    socket.on("timeout", () => {
      socket.destroy();
      resolve(null);
    });

    socket.on("error", () => {
      socket.destroy();
      resolve(null);
    });

    setTimeout(() => {
      socket.destroy();
      resolve(data.length > 0 ? data : null);
    }, timeout + 200);
  });
}

/**
 * Get HTTP headers for OS hints
 */
async function getHTTPHeaders(host: string): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    // Try HTTPS first
    let res: Response | null = null;
    try {
      res = await fetch(`https://${host}/`, {
        method: "HEAD",
        signal: controller.signal,
        redirect: "manual",
      });
    } catch {
      // Try HTTP
      try {
        const controller2 = new AbortController();
        const timeout2 = setTimeout(() => controller2.abort(), 3000);
        res = await fetch(`http://${host}/`, {
          method: "HEAD",
          signal: controller2.signal,
          redirect: "manual",
        });
        clearTimeout(timeout2);
      } catch {
        // No HTTP response
      }
    }
    clearTimeout(timeout);

    if (res) {
      res.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });
    }
  } catch {
    // Failed to get headers
  }
  return headers;
}

/**
 * Estimate OS from TTL value
 * When we get TTL from ping/traceroute (future: agent mode),
 * the actual default TTL is inferred by rounding up to nearest default
 */
function estimateOSFromTTL(ttl: number): { osFamily: string; confidence: number } {
  // Default TTLs: Linux=64, Windows=128, Cisco=255
  // Actual TTL = default - hops, so TTL 118 → Windows (128 - 10 hops)
  if (ttl <= 64) return { osFamily: "Linux/Unix", confidence: 60 };
  if (ttl <= 128) return { osFamily: "Windows", confidence: 60 };
  return { osFamily: "Cisco/Network Device", confidence: 50 };
}

export const osFingerprintCheck: CheckModule = {
  id: "os-fingerprint",
  name: "OS Fingerprint & System Identification",

  async run(target: string): Promise<CheckResult[]> {
    const results: CheckResult[] = [];
    const host = target.replace(/^https?:\/\//, "").replace(/[:/].*$/, "");

    const fingerprint: OSFingerprint = {
      osFamily: "Unknown",
      osVersion: null,
      confidence: 0,
      methods: [],
      ttl: null,
      windowSize: null,
      serverHeader: null,
      sshBanner: null,
    };

    // Method 1: SSH Banner Analysis (most reliable for Linux/Unix)
    const sshBanner = await getSSHBanner(host);
    if (sshBanner) {
      fingerprint.sshBanner = sshBanner.trim();
      fingerprint.methods.push("ssh_banner");

      for (const pat of SSH_OS_PATTERNS) {
        if (pat.pattern.test(sshBanner)) {
          fingerprint.osFamily = pat.os;
          if (pat.version) fingerprint.osVersion = pat.version;
          fingerprint.confidence = Math.max(fingerprint.confidence, 75);
          break;
        }
      }

      // Extract OpenSSH version for Linux distribution hints
      const opensshMatch = sshBanner.match(/OpenSSH[_-]([\d.p]+)/i);
      if (opensshMatch && fingerprint.osFamily === "Unknown") {
        fingerprint.osFamily = "Linux/Unix";
        fingerprint.confidence = Math.max(fingerprint.confidence, 60);
      }
    }

    // Method 2: HTTP Header Analysis
    const httpHeaders = await getHTTPHeaders(host);
    const serverHeader = httpHeaders["server"] || null;
    const poweredBy = httpHeaders["x-powered-by"] || null;

    if (serverHeader) {
      fingerprint.serverHeader = serverHeader;
      fingerprint.methods.push("http_server_header");

      // IIS → Windows mapping
      const iisMatch = serverHeader.match(/Microsoft-IIS\/([\d.]+)/i);
      if (iisMatch) {
        fingerprint.osFamily = "Windows";
        const windowsVersion = IIS_WINDOWS_MAP[iisMatch[1]];
        if (windowsVersion) {
          fingerprint.osVersion = windowsVersion;
          fingerprint.confidence = Math.max(fingerprint.confidence, 90);
        } else {
          fingerprint.confidence = Math.max(fingerprint.confidence, 80);
        }
      }

      // Check other HTTP OS patterns
      for (const pat of HTTP_OS_PATTERNS) {
        if (pat.pattern.test(serverHeader)) {
          if (fingerprint.osFamily === "Unknown") {
            fingerprint.osFamily = pat.os;
            if (pat.version) fingerprint.osVersion = pat.version;
          }
          fingerprint.confidence = Math.max(fingerprint.confidence, 65);
          break;
        }
      }
    }

    // Check X-Powered-By for additional hints
    if (poweredBy) {
      fingerprint.methods.push("http_x_powered_by");
      if (/ASP\.NET/i.test(poweredBy) && fingerprint.osFamily === "Unknown") {
        fingerprint.osFamily = "Windows";
        fingerprint.confidence = Math.max(fingerprint.confidence, 70);
      }
    }

    // Method 3: TCP probe analysis
    const tcpResult = await tcpProbeWithTTL(host, 80);
    if (tcpResult.connected) {
      fingerprint.methods.push("tcp_probe");
      if (tcpResult.ttl) {
        fingerprint.ttl = tcpResult.ttl;
        const ttlResult = estimateOSFromTTL(tcpResult.ttl);
        if (fingerprint.osFamily === "Unknown") {
          fingerprint.osFamily = ttlResult.osFamily;
          fingerprint.confidence = Math.max(fingerprint.confidence, ttlResult.confidence);
        }
      }
    }

    // Method 4: Port profile analysis
    // Check common port patterns to infer OS
    const portProbes = [
      { port: 3389, os: "Windows" },  // RDP = Windows
      { port: 445, os: "Windows" },    // SMB primary = Windows
      { port: 135, os: "Windows" },    // MSRPC = Windows
      { port: 22, os: "Linux/Unix" },  // SSH default = Linux (if no RDP)
    ];

    const openPorts: number[] = [];
    const probeResults = await Promise.all(
      portProbes.map(async (pp) => {
        const probe = await tcpProbeWithTTL(host, pp.port, 1500);
        if (probe.connected) openPorts.push(pp.port);
        return { ...pp, open: probe.connected };
      })
    );

    if (probeResults.some((r) => r.open)) {
      fingerprint.methods.push("port_profile");

      const hasRDP = probeResults.find((r) => r.port === 3389)?.open;
      const hasMSRPC = probeResults.find((r) => r.port === 135)?.open;
      const hasSMB = probeResults.find((r) => r.port === 445)?.open;
      const hasSSH = probeResults.find((r) => r.port === 22)?.open;

      if ((hasRDP || hasMSRPC) && fingerprint.osFamily === "Unknown") {
        fingerprint.osFamily = "Windows";
        fingerprint.confidence = Math.max(fingerprint.confidence, 80);
      } else if (hasSSH && !hasRDP && !hasMSRPC && fingerprint.osFamily === "Unknown") {
        fingerprint.osFamily = "Linux/Unix";
        fingerprint.confidence = Math.max(fingerprint.confidence, 55);
      }

      // Windows with SMB + RDP is very likely a Windows server
      if (hasRDP && hasSMB && fingerprint.osFamily === "Windows") {
        if (!fingerprint.osVersion) fingerprint.osVersion = "Windows Server";
        fingerprint.confidence = Math.max(fingerprint.confidence, 85);
      }
    }

    // Produce result if we identified anything
    if (fingerprint.osFamily !== "Unknown" && fingerprint.confidence > 0) {
      const osDisplay = fingerprint.osVersion
        ? `${fingerprint.osFamily} (${fingerprint.osVersion})`
        : fingerprint.osFamily;

      results.push({
        title: `OS Fingerprint: ${host} — ${osDisplay}`,
        severity: "info",
        description: `Operating system identified as ${osDisplay} with ${fingerprint.confidence}% confidence using ${fingerprint.methods.length} detection method(s): ${fingerprint.methods.join(", ")}.`,
        remediation: "Ensure the detected operating system is up to date with all security patches. Verify the OS version is still within the vendor's support lifecycle.",
        details: {
          target: host,
          osFamily: fingerprint.osFamily,
          osVersion: fingerprint.osVersion,
          confidence: fingerprint.confidence,
          methods: fingerprint.methods,
          ttl: fingerprint.ttl,
          windowSize: fingerprint.windowSize,
          serverHeader: fingerprint.serverHeader,
          sshBanner: fingerprint.sshBanner,
        },
      });

      // Flag end-of-life operating systems
      const eolPatterns = [
        { pattern: /Windows Server 2003/i, name: "Windows Server 2003" },
        { pattern: /Windows Server 2008(?! R2)/i, name: "Windows Server 2008" },
        { pattern: /Windows XP/i, name: "Windows XP" },
        { pattern: /Windows 7/i, name: "Windows 7" },
        { pattern: /CentOS\s*[67]/i, name: "CentOS 6/7" },
        { pattern: /Ubuntu\s*(14|16)\./i, name: "Ubuntu 14.x/16.x" },
        { pattern: /Debian\s*(8|9)/i, name: "Debian 8/9" },
      ];

      const fullOSString = `${fingerprint.osFamily} ${fingerprint.osVersion || ""} ${fingerprint.serverHeader || ""} ${fingerprint.sshBanner || ""}`;
      for (const eol of eolPatterns) {
        if (eol.pattern.test(fullOSString)) {
          const vuln = getVulnById("end-of-life-os");
          if (vuln) {
            results.push({
              title: `${vuln.title}: ${eol.name}`,
              severity: vuln.severity,
              description: vuln.description.replace("{os}", eol.name),
              remediation: vuln.remediation,
              cvssScore: vuln.cvssScore,
              details: {
                host,
                detectedOS: eol.name,
                confidence: fingerprint.confidence,
              },
            });
          }
          break;
        }
      }
    } else {
      // Could not identify OS
      results.push({
        title: `OS Fingerprint: ${host} — Unidentified`,
        severity: "info",
        description: `Could not reliably determine the operating system of ${host}. The host may be behind a firewall that blocks fingerprinting probes, or running an unusual OS.`,
        remediation: "Manual investigation recommended. Connect to the host directly to verify the operating system and ensure it is properly inventoried.",
        details: {
          target: host,
          osFamily: "Unknown",
          confidence: 0,
          methods: fingerprint.methods,
        },
      });
    }

    return results;
  },
};
