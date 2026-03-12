// NSE Script Output Parsers — Extract structured findings from Nmap NSE script results

import type { NmapScript } from './types';
import type { CheckResult } from '../types';

// Parse vulners NSE script output — extracts CVE IDs and CVSS scores
export function parseVulnersOutput(scripts: NmapScript[], port: number, service: string): CheckResult[] {
  const results: CheckResult[] = [];
  const vulnersScript = scripts.find((s) => s.id === 'vulners');
  if (!vulnersScript) return results;

  // vulners output format:
  // cpe:/a:apache:http_server:2.4.49:
  //   CVE-2021-41773  9.8  https://vulners.com/cve/CVE-2021-41773
  //   CVE-2021-42013  9.8  https://vulners.com/cve/CVE-2021-42013
  const lines = vulnersScript.output.split('\n');
  const cvePattern = /^\s+(CVE-\d{4}-\d+)\s+([\d.]+)\s+/;

  for (const line of lines) {
    const match = line.match(cvePattern);
    if (match) {
      const cveId = match[1];
      const cvss = parseFloat(match[2]);

      let severity: CheckResult['severity'] = 'info';
      if (cvss >= 9.0) severity = 'critical';
      else if (cvss >= 7.0) severity = 'high';
      else if (cvss >= 4.0) severity = 'medium';
      else if (cvss >= 0.1) severity = 'low';

      results.push({
        title: `${cveId} — ${service} on port ${port}`,
        severity,
        description: `Vulnerability ${cveId} (CVSS ${cvss}) detected on ${service} service running on port ${port}. This was identified by the Nmap vulners NSE script.`,
        remediation: `Update ${service} to the latest version. Check vendor advisories for ${cveId} and apply the recommended patch or configuration change.`,
        cveId,
        cvssScore: cvss,
        details: {
          source: 'nmap-vulners',
          port,
          service,
          cvss,
          cveId,
        },
      });
    }
  }

  return results;
}

// Parse ssl-enum-ciphers output — extracts weak cipher suites
export function parseSslEnumCiphers(scripts: NmapScript[], port: number): CheckResult[] {
  const results: CheckResult[] = [];
  const sslScript = scripts.find((s) => s.id === 'ssl-enum-ciphers');
  if (!sslScript) return results;

  const output = sslScript.output;

  // Check for weak protocols
  const weakProtocols = ['TLSv1.0', 'TLSv1.1', 'SSLv3', 'SSLv2'];
  for (const proto of weakProtocols) {
    if (output.includes(proto)) {
      results.push({
        title: `Weak ${proto} Protocol Supported (Port ${port})`,
        severity: proto.startsWith('SSL') ? 'critical' : 'medium',
        description: `The server on port ${port} supports ${proto}, which is deprecated and vulnerable to known attacks (POODLE, BEAST, etc.).`,
        remediation: `Disable ${proto} on the server. Only allow TLS 1.2 and TLS 1.3. Update the server configuration to remove support for legacy protocols.`,
        cveId: proto === 'SSLv3' ? 'CVE-2014-3566' : undefined,
        cvssScore: proto.startsWith('SSL') ? 7.5 : 5.3,
        details: {
          source: 'nmap-ssl-enum-ciphers',
          port,
          protocol: proto,
          vulnId: 'weak-ssl-protocol',
        },
      });
    }
  }

  // Check for weak ciphers
  const weakCipherPatterns = [
    { pattern: /RC4/i, name: 'RC4', severity: 'high' as const, cvss: 7.5 },
    { pattern: /DES(?!3)/i, name: 'DES', severity: 'high' as const, cvss: 7.5 },
    { pattern: /NULL/i, name: 'NULL', severity: 'critical' as const, cvss: 9.1 },
    { pattern: /EXPORT/i, name: 'EXPORT', severity: 'critical' as const, cvss: 9.1 },
    { pattern: /MD5/i, name: 'MD5', severity: 'medium' as const, cvss: 5.3 },
  ];

  for (const { pattern, name, severity, cvss } of weakCipherPatterns) {
    if (pattern.test(output)) {
      results.push({
        title: `Weak ${name} Cipher Suite Detected (Port ${port})`,
        severity,
        description: `The server on port ${port} supports ${name} cipher suites, which are cryptographically weak and vulnerable to attacks.`,
        remediation: `Remove ${name} cipher suites from the server configuration. Use only strong ciphers like AES-GCM, ChaCha20-Poly1305.`,
        cvssScore: cvss,
        details: {
          source: 'nmap-ssl-enum-ciphers',
          port,
          weakCipher: name,
          vulnId: 'weak-ssl-ciphers',
        },
      });
    }
  }

  // Check cipher strength grading
  const gradeMatch = output.match(/least strength:\s*(\w)/);
  if (gradeMatch && ['D', 'E', 'F'].includes(gradeMatch[1])) {
    results.push({
      title: `Poor SSL/TLS Cipher Strength Grade ${gradeMatch[1]} (Port ${port})`,
      severity: 'high',
      description: `The overall SSL/TLS cipher strength on port ${port} is rated ${gradeMatch[1]}. This indicates significant cryptographic weakness.`,
      remediation: 'Review and harden the TLS cipher suite configuration. Prioritize AES-256-GCM and ChaCha20 ciphers. Disable all weak and medium-strength ciphers.',
      cvssScore: 7.0,
      details: {
        source: 'nmap-ssl-enum-ciphers',
        port,
        grade: gradeMatch[1],
        vulnId: 'weak-ssl-ciphers',
      },
    });
  }

  return results;
}

// Parse ssh-auth-methods output
export function parseSshAuthMethods(scripts: NmapScript[]): CheckResult[] {
  const results: CheckResult[] = [];
  const sshScript = scripts.find((s) => s.id === 'ssh-auth-methods');
  if (!sshScript) return results;

  const output = sshScript.output;

  if (output.includes('password')) {
    results.push({
      title: 'SSH Password Authentication Enabled',
      severity: 'medium',
      description: 'The SSH server allows password-based authentication, which is susceptible to brute-force attacks. Key-based authentication is preferred.',
      remediation: 'Disable password authentication in sshd_config: set PasswordAuthentication no. Use SSH key pairs for authentication.',
      cvssScore: 5.3,
      details: {
        source: 'nmap-ssh-auth-methods',
        vulnId: 'ssh-password-auth-enabled',
        cisControl: 'CIS 5.2.5',
      },
    });
  }

  if (output.includes('none_auth')) {
    results.push({
      title: 'SSH Allows Authentication Without Credentials',
      severity: 'critical',
      description: 'The SSH server allows connections without any authentication. This is a critical security misconfiguration.',
      remediation: 'Immediately configure SSH to require authentication. Review sshd_config and ensure PermitEmptyPasswords is set to no.',
      cvssScore: 10.0,
      details: {
        source: 'nmap-ssh-auth-methods',
        vulnId: 'ssh-no-auth',
      },
    });
  }

  return results;
}

// Parse ssh2-enum-algos output — check for weak algorithms
export function parseSsh2EnumAlgos(scripts: NmapScript[]): CheckResult[] {
  const results: CheckResult[] = [];
  const sshAlgoScript = scripts.find((s) => s.id === 'ssh2-enum-algos');
  if (!sshAlgoScript) return results;

  const output = sshAlgoScript.output;

  const weakKex = ['diffie-hellman-group1-sha1', 'diffie-hellman-group14-sha1', 'diffie-hellman-group-exchange-sha1'];
  const weakCiphers = ['3des-cbc', 'aes128-cbc', 'aes192-cbc', 'aes256-cbc', 'blowfish-cbc', 'arcfour'];
  const weakMacs = ['hmac-md5', 'hmac-sha1', 'hmac-sha1-96', 'hmac-md5-96'];

  const foundWeakKex = weakKex.filter((k) => output.includes(k));
  const foundWeakCiphers = weakCiphers.filter((c) => output.includes(c));
  const foundWeakMacs = weakMacs.filter((m) => output.includes(m));

  if (foundWeakKex.length > 0) {
    results.push({
      title: 'Weak SSH Key Exchange Algorithms',
      severity: 'medium',
      description: `SSH server supports weak key exchange algorithms: ${foundWeakKex.join(', ')}. These use SHA-1 which is cryptographically deprecated.`,
      remediation: 'Configure SSH to use only strong KEX algorithms: curve25519-sha256, diffie-hellman-group16-sha512, diffie-hellman-group18-sha512.',
      cvssScore: 5.3,
      details: {
        source: 'nmap-ssh2-enum-algos',
        weakAlgorithms: foundWeakKex,
        vulnId: 'weak-ssh-algorithms',
        cisControl: 'CIS 5.2.13',
      },
    });
  }

  if (foundWeakCiphers.length > 0) {
    results.push({
      title: 'Weak SSH Encryption Ciphers',
      severity: 'medium',
      description: `SSH server supports weak ciphers: ${foundWeakCiphers.join(', ')}. CBC-mode ciphers are vulnerable to padding oracle attacks.`,
      remediation: 'Configure SSH to use only CTR or GCM mode ciphers: aes256-gcm@openssh.com, chacha20-poly1305@openssh.com, aes256-ctr.',
      cvssScore: 5.3,
      details: {
        source: 'nmap-ssh2-enum-algos',
        weakCiphers: foundWeakCiphers,
        vulnId: 'weak-ssh-algorithms',
        cisControl: 'CIS 5.2.14',
      },
    });
  }

  if (foundWeakMacs.length > 0) {
    results.push({
      title: 'Weak SSH MAC Algorithms',
      severity: 'low',
      description: `SSH server supports weak MAC algorithms: ${foundWeakMacs.join(', ')}. MD5 and SHA-1 MACs are deprecated.`,
      remediation: 'Configure SSH to use ETM (encrypt-then-mac) variants: hmac-sha2-256-etm@openssh.com, hmac-sha2-512-etm@openssh.com.',
      cvssScore: 3.7,
      details: {
        source: 'nmap-ssh2-enum-algos',
        weakMacs: foundWeakMacs,
        vulnId: 'weak-ssh-algorithms',
        cisControl: 'CIS 5.2.15',
      },
    });
  }

  return results;
}

// Parse ftp-anon output
export function parseFtpAnon(scripts: NmapScript[]): CheckResult[] {
  const results: CheckResult[] = [];
  const ftpScript = scripts.find((s) => s.id === 'ftp-anon');
  if (!ftpScript) return results;

  if (ftpScript.output.includes('Anonymous FTP login allowed')) {
    results.push({
      title: 'FTP Anonymous Login Allowed',
      severity: 'high',
      description: 'The FTP server allows anonymous login, which means anyone can access files without authentication. This can expose sensitive data.',
      remediation: 'Disable anonymous FTP access in the FTP server configuration. Use authenticated access only with strong credentials.',
      cvssScore: 7.5,
      details: {
        source: 'nmap-ftp-anon',
        vulnId: 'ftp-anonymous-login',
        cisControl: 'CIS 9.2',
      },
    });
  }

  return results;
}

// Parse smb-security-mode output
export function parseSmbSecurityMode(scripts: NmapScript[]): CheckResult[] {
  const results: CheckResult[] = [];
  const smbScript = scripts.find((s) => s.id === 'smb-security-mode');
  if (!smbScript) return results;

  const output = smbScript.output;

  if (output.includes('message_signing: disabled') || output.includes('message_signing: optional')) {
    results.push({
      title: 'SMB Message Signing Not Required',
      severity: 'medium',
      description: 'SMB message signing is not enforced on this host. This allows man-in-the-middle attacks on SMB connections, potentially leading to credential theft or data manipulation.',
      remediation: 'Enable SMB signing: on Windows, set "Microsoft network server: Digitally sign communications (always)" to Enabled via Group Policy.',
      cvssScore: 5.9,
      details: {
        source: 'nmap-smb-security-mode',
        vulnId: 'smb-signing-disabled',
        cisControl: 'CIS 2.3.8',
      },
    });
  }

  if (output.includes('account_used: guest')) {
    results.push({
      title: 'SMB Guest Access Enabled',
      severity: 'high',
      description: 'The SMB server allows guest access, which permits unauthenticated users to access shared resources.',
      remediation: 'Disable SMB guest access. On Windows, disable the Guest account and restrict anonymous SMB access via Group Policy.',
      cvssScore: 7.5,
      details: {
        source: 'nmap-smb-security-mode',
        vulnId: 'smb-guest-access',
      },
    });
  }

  return results;
}

// Parse smb-vuln-ms17-010 (EternalBlue) output
export function parseSmbVulnMs17010(scripts: NmapScript[]): CheckResult[] {
  const results: CheckResult[] = [];
  const smbScript = scripts.find((s) => s.id === 'smb-vuln-ms17-010');
  if (!smbScript) return results;

  if (smbScript.output.includes('VULNERABLE')) {
    results.push({
      title: 'MS17-010 EternalBlue SMB Vulnerability',
      severity: 'critical',
      description: 'The host is vulnerable to the EternalBlue exploit (MS17-010). This vulnerability was used in the WannaCry and NotPetya ransomware attacks and allows remote code execution.',
      remediation: 'Apply Microsoft security update MS17-010 immediately. If patching is not possible, disable SMBv1 and restrict SMB traffic at the network level.',
      cveId: 'CVE-2017-0144',
      cvssScore: 8.1,
      details: {
        source: 'nmap-smb-vuln-ms17-010',
        vulnId: 'smb-eternalblue',
        mitreTechnique: 'T1210',
      },
    });
  }

  return results;
}

// Parse snmp-info output
export function parseSnmpInfo(scripts: NmapScript[]): CheckResult[] {
  const results: CheckResult[] = [];
  const snmpScript = scripts.find((s) => s.id === 'snmp-info');
  if (!snmpScript) return results;

  // If SNMP responds, it often means default community string is in use
  if (snmpScript.output.length > 0) {
    results.push({
      title: 'SNMP Service Accessible',
      severity: 'medium',
      description: 'SNMP service is accessible and responded to queries. If using default community strings (public/private), this exposes device configuration details.',
      remediation: 'Change SNMP community strings from default values. Use SNMPv3 with authentication and encryption. Restrict SNMP access to management networks only.',
      cvssScore: 5.3,
      details: {
        source: 'nmap-snmp-info',
        vulnId: 'snmp-default-community',
        cisControl: 'CIS 4.8',
        snmpInfo: snmpScript.output.substring(0, 500),
      },
    });
  }

  return results;
}

// Parse http-security-headers output
export function parseHttpSecurityHeaders(scripts: NmapScript[], port: number): CheckResult[] {
  const results: CheckResult[] = [];
  const httpScript = scripts.find((s) => s.id === 'http-security-headers');
  if (!httpScript) return results;

  const output = httpScript.output;

  const headerChecks = [
    { header: 'Strict-Transport-Security', vulnId: 'missing-hsts', severity: 'medium' as const, cvss: 5.3 },
    { header: 'Content-Security-Policy', vulnId: 'missing-csp', severity: 'medium' as const, cvss: 5.3 },
    { header: 'X-Frame-Options', vulnId: 'missing-x-frame-options', severity: 'medium' as const, cvss: 4.3 },
    { header: 'X-Content-Type-Options', vulnId: 'missing-x-content-type-options', severity: 'low' as const, cvss: 3.1 },
  ];

  for (const check of headerChecks) {
    if (output.includes(`MISSING: ${check.header}`) || output.includes(`Header ${check.header} is missing`)) {
      results.push({
        title: `Missing ${check.header} Header (Port ${port})`,
        severity: check.severity,
        description: `The HTTP response on port ${port} is missing the ${check.header} header, which is a recommended security header.`,
        remediation: `Add the ${check.header} header to your web server or application configuration.`,
        cvssScore: check.cvss,
        details: {
          source: 'nmap-http-security-headers',
          port,
          missingHeader: check.header,
          vulnId: check.vulnId,
        },
      });
    }
  }

  return results;
}
