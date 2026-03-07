/**
 * SSL/TLS Check Module
 *
 * Checks SSL/TLS certificate validity, expiration, protocol version, and hostname match.
 */

import * as tls from "tls";
import * as net from "net";
import { CheckModule, CheckResult } from "../types";
import { getVulnById } from "../vulnerability-db";

interface CertInfo {
  valid: boolean;
  validFrom: Date;
  validTo: Date;
  issuer: string;
  subject: string;
  selfSigned: boolean;
  daysUntilExpiry: number;
  hostname: string;
  protocol: string;
  authorized: boolean;
  subjectAltNames?: string[];
}

function getCertInfo(host: string, port = 443): Promise<CertInfo | null> {
  return new Promise((resolve) => {
    const socket = tls.connect(
      {
        host,
        port,
        servername: host,
        rejectUnauthorized: false,
        timeout: 5000,
      },
      () => {
        const cert = socket.getPeerCertificate();
        if (!cert || !cert.valid_from) {
          socket.destroy();
          resolve(null);
          return;
        }

        const validFrom = new Date(cert.valid_from);
        const validTo = new Date(cert.valid_to);
        const now = new Date();
        const daysUntilExpiry = Math.floor((validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const selfSigned = cert.issuer && cert.subject
          ? JSON.stringify(cert.issuer) === JSON.stringify(cert.subject)
          : false;

        const san = cert.subjectaltname
          ? cert.subjectaltname.split(", ").map((s: string) => s.replace("DNS:", ""))
          : [];

        resolve({
          valid: now >= validFrom && now <= validTo,
          validFrom,
          validTo,
          issuer: typeof cert.issuer === "object" ? (cert.issuer as unknown as Record<string, string>).O || "Unknown" : String(cert.issuer),
          subject: typeof cert.subject === "object" ? (cert.subject as unknown as Record<string, string>).CN || "Unknown" : String(cert.subject),
          selfSigned,
          daysUntilExpiry,
          hostname: host,
          protocol: socket.getProtocol() || "unknown",
          authorized: socket.authorized,
          subjectAltNames: san,
        });

        socket.destroy();
      }
    );

    socket.on("error", () => {
      resolve(null);
    });

    socket.on("timeout", () => {
      socket.destroy();
      resolve(null);
    });
  });
}

function checkWeakProtocol(host: string, protocol: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = tls.connect(
      {
        host,
        port: 443,
        servername: host,
        rejectUnauthorized: false,
        maxVersion: protocol as tls.SecureVersion,
        minVersion: protocol as tls.SecureVersion,
        timeout: 3000,
      },
      () => {
        resolve(true);
        socket.destroy();
      }
    );
    socket.on("error", () => resolve(false));
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

export const sslTlsCheck: CheckModule = {
  id: "ssl-tls",
  name: "SSL/TLS Analysis",

  async run(target: string): Promise<CheckResult[]> {
    const results: CheckResult[] = [];
    const host = target.replace(/^https?:\/\//, "").replace(/[:/].*$/, "");

    // Check if port 443 is open first
    const portOpen = await new Promise<boolean>((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(3000);
      socket.connect(443, host, () => {
        socket.destroy();
        resolve(true);
      });
      socket.on("error", () => resolve(false));
      socket.on("timeout", () => {
        socket.destroy();
        resolve(false);
      });
    });

    if (!portOpen) return [];

    const certInfo = await getCertInfo(host);
    if (!certInfo) return [];

    // Check certificate expiry
    if (!certInfo.valid || certInfo.daysUntilExpiry < 0) {
      const vuln = getVulnById("ssl-cert-expired");
      if (vuln) {
        results.push({
          title: vuln.title,
          severity: vuln.severity,
          description: vuln.description,
          remediation: vuln.remediation,
          cveId: vuln.cveId,
          cvssScore: vuln.cvssScore,
          details: { host, validTo: certInfo.validTo.toISOString(), daysExpired: Math.abs(certInfo.daysUntilExpiry) },
        });
      }
    } else if (certInfo.daysUntilExpiry <= 30) {
      const vuln = getVulnById("ssl-cert-expiring-soon");
      if (vuln) {
        results.push({
          title: vuln.title,
          severity: vuln.severity,
          description: vuln.description,
          remediation: vuln.remediation,
          cvssScore: vuln.cvssScore,
          details: { host, validTo: certInfo.validTo.toISOString(), daysUntilExpiry: certInfo.daysUntilExpiry },
        });
      }
    }

    // Check self-signed
    if (certInfo.selfSigned) {
      const vuln = getVulnById("ssl-self-signed");
      if (vuln) {
        results.push({
          title: vuln.title,
          severity: vuln.severity,
          description: vuln.description,
          remediation: vuln.remediation,
          cveId: vuln.cveId,
          cvssScore: vuln.cvssScore,
          details: { host, issuer: certInfo.issuer, subject: certInfo.subject },
        });
      }
    }

    // Check hostname mismatch
    if (!certInfo.authorized && !certInfo.selfSigned) {
      const vuln = getVulnById("ssl-hostname-mismatch");
      if (vuln) {
        results.push({
          title: vuln.title,
          severity: vuln.severity,
          description: vuln.description,
          remediation: vuln.remediation,
          cveId: vuln.cveId,
          cvssScore: vuln.cvssScore,
          details: { host, certSubject: certInfo.subject, sans: certInfo.subjectAltNames },
        });
      }
    }

    // Check for weak protocols (TLS 1.0/1.1)
    const tls10 = await checkWeakProtocol(host, "TLSv1");
    const tls11 = await checkWeakProtocol(host, "TLSv1.1");
    if (tls10 || tls11) {
      const vuln = getVulnById("ssl-weak-protocol");
      if (vuln) {
        const weakProtos = [];
        if (tls10) weakProtos.push("TLS 1.0");
        if (tls11) weakProtos.push("TLS 1.1");
        results.push({
          title: vuln.title,
          severity: vuln.severity,
          description: vuln.description,
          remediation: vuln.remediation,
          cveId: vuln.cveId,
          cvssScore: vuln.cvssScore,
          details: { host, weakProtocols: weakProtos, currentProtocol: certInfo.protocol },
        });
      }
    }

    return results;
  },
};
