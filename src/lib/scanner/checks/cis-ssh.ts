/**
 * CIS v8.1 Linux Benchmark — SSH-Based Check Modules
 * 12 CheckModule implementations covering ~55 CIS controls via authenticated SSH.
 *
 * All modules:
 *   - Return [] immediately if config?.credential is absent (graceful skip)
 *   - Return single info-severity result on SSH failure (graceful degradation)
 *   - Emit cisControlId, cisLevel, checkModuleId, detectionMethod in details
 */

import { CheckModule, CheckResult } from '../types';
import { PlainCredential } from '../vault';
import { createSshConnection, runSshCommand, closeSshConnection } from '../connectors/ssh-client';
import { getCisControl } from './cis-mappings';

// ─── Shared helpers ───────────────────────────────────────────────

function extractHost(target: string): string {
  let host = target;
  host = host.replace(/^https?:\/\//, '');
  host = host.split('/')[0];
  host = host.split(':')[0];
  return host;
}

function buildCisFinding(
  control: { id: string; level: 1 | 2; title: string; remediation: string },
  severity: CheckResult['severity'],
  description: string,
  checkModuleId: string,
  currentValue?: string,
  expectedValue?: string,
  extra?: Record<string, unknown>
): CheckResult {
  return {
    title: `CIS ${control.id} — ${control.title}`,
    severity,
    description,
    remediation: control.remediation,
    details: {
      cisControlId: control.id,
      cisLevel: control.level,
      checkModuleId,
      detectionMethod: 'authenticated',
      ...(currentValue !== undefined && { currentValue }),
      ...(expectedValue !== undefined && { expectedValue }),
      ...extra,
    },
  };
}

function sshError(host: string, error: unknown, checkModuleId: string): CheckResult {
  return {
    title: `SSH Connection Failed — ${host}`,
    severity: 'info',
    description: `Could not establish SSH connection for CIS benchmark checks: ${error instanceof Error ? error.message : String(error)}`,
    remediation: 'Verify SSH credentials, network connectivity, and firewall rules.',
    details: { checkModuleId, detectionMethod: 'authenticated', error: String(error) },
  };
}

// ═══════════════════════════════════════════════════════════════════
// Module 1: Filesystem Mount Options (CIS 1.1.x)
// ═══════════════════════════════════════════════════════════════════

export const cisFilesystemMountsCheck: CheckModule = {
  id: 'cis-filesystem-mounts',
  name: 'CIS 1.1.x — Filesystem Mount Security',

  async run(target: string, config?: Record<string, unknown>): Promise<CheckResult[]> {
    const credential = config?.credential as PlainCredential | undefined;
    if (!credential) return [];

    const host = extractHost(target);
    const results: CheckResult[] = [];

    let client;
    try {
      client = await createSshConnection(host, credential.defaultPort ?? 22, credential);
    } catch (err) {
      return [sshError(host, err, this.id)];
    }

    try {
      const { stdout } = await runSshCommand(client, 'findmnt -n -o TARGET,OPTIONS 2>/dev/null || mount 2>/dev/null');
      const lines = stdout.toLowerCase();

      const checks = [
        { target: '/tmp', opts: ['nodev', 'nosuid', 'noexec'], ids: ['1.1.2', '1.1.3', '1.1.4'] },
        { target: '/var/tmp', opts: ['nodev', 'nosuid', 'noexec'], ids: ['1.1.5', '1.1.6', '1.1.7'] },
        { target: '/dev/shm', opts: ['nodev', 'nosuid', 'noexec'], ids: ['1.1.8', '1.1.9', '1.1.10'] },
      ];

      for (const check of checks) {
        const mountLine = lines.split('\n').find((l) => l.includes(check.target));
        if (!mountLine) {
          const ctrl = getCisControl(check.ids[0]);
          if (ctrl) {
            results.push(buildCisFinding(
              ctrl, 'medium',
              `${check.target} does not appear to be separately mounted. Mount options cannot be verified.`,
              this.id, 'not separately mounted', 'separate partition with nodev,nosuid,noexec'
            ));
          }
          continue;
        }
        for (let i = 0; i < check.opts.length; i++) {
          const opt = check.opts[i];
          const ctrl = getCisControl(check.ids[i]);
          if (!ctrl) continue;
          if (!mountLine.includes(opt)) {
            results.push(buildCisFinding(
              ctrl, 'medium',
              `${check.target} is mounted without the '${opt}' option.`,
              this.id, `missing ${opt}`, `${opt} in mount options`
            ));
          }
        }
      }

      // Check sticky bit on world-writable directories
      const { stdout: wwDirs } = await runSshCommand(
        client,
        "find / -xdev -type d \\( -perm -0002 -a ! -perm -1000 \\) 2>/dev/null | head -20"
      );
      const wwList = wwDirs.trim().split('\n').filter(Boolean);
      if (wwList.length > 0) {
        const ctrl = getCisControl('1.1.22');
        if (ctrl) {
          results.push(buildCisFinding(
            ctrl, 'medium',
            `Found ${wwList.length} world-writable director${wwList.length === 1 ? 'y' : 'ies'} without the sticky bit: ${wwList.slice(0, 5).join(', ')}${wwList.length > 5 ? ` ... and ${wwList.length - 5} more` : ''}`,
            this.id, `${wwList.length} directories without sticky bit`, 'sticky bit set on all world-writable dirs',
            { directories: wwList }
          ));
        }
      }

      return results;
    } finally {
      closeSshConnection(client);
    }
  },
};

// ═══════════════════════════════════════════════════════════════════
// Module 2: Unnecessary Services (CIS 2.x)
// ═══════════════════════════════════════════════════════════════════

const UNNECESSARY_SERVICES = [
  { name: 'xinetd', controlId: '2.1.1', title: 'xinetd' },
  { name: 'avahi-daemon', controlId: '2.1.2', title: 'Avahi Daemon' },
  { name: 'cups', controlId: '2.1.3', title: 'CUPS Printing' },
  { name: 'isc-dhcp-server', controlId: '2.2.1', title: 'DHCP Server' },
  { name: 'slapd', controlId: '2.2.1', title: 'LDAP Server' },
  { name: 'nfs-server', controlId: '2.2.1', title: 'NFS Server' },
  { name: 'bind9', controlId: '2.2.1', title: 'DNS Server (BIND)' },
  { name: 'vsftpd', controlId: '2.2.1', title: 'FTP Server (vsftpd)' },
  { name: 'apache2', controlId: '2.2.1', title: 'Apache HTTP Server' },
  { name: 'smbd', controlId: '2.2.1', title: 'Samba File Server' },
  { name: 'squid', controlId: '2.2.1', title: 'Squid Proxy' },
  { name: 'snmpd', controlId: '2.2.1', title: 'SNMP Daemon' },
  { name: 'rsync', controlId: '2.3.4', title: 'rsync Service' },
  { name: 'nis', controlId: '2.3.1', title: 'NIS/YP Client' },
];

export const cisUnnecessaryServicesCheck: CheckModule = {
  id: 'cis-unnecessary-services',
  name: 'CIS 2.x — Unnecessary Services',

  async run(target: string, config?: Record<string, unknown>): Promise<CheckResult[]> {
    const credential = config?.credential as PlainCredential | undefined;
    if (!credential) return [];

    const host = extractHost(target);
    const results: CheckResult[] = [];

    let client;
    try {
      client = await createSshConnection(host, credential.defaultPort ?? 22, credential);
    } catch (err) {
      return [sshError(host, err, this.id)];
    }

    try {
      for (const svc of UNNECESSARY_SERVICES) {
        const { stdout } = await runSshCommand(
          client,
          `systemctl is-enabled ${svc.name} 2>/dev/null || echo "not-found"`
        );
        const state = stdout.trim().toLowerCase();
        if (state === 'enabled' || state === 'static') {
          const ctrl = getCisControl(svc.controlId);
          if (ctrl) {
            results.push(buildCisFinding(
              { ...ctrl, title: `${svc.title} is enabled` }, 'medium',
              `${svc.title} (${svc.name}) is enabled and may be running. This service is typically unnecessary on servers and increases attack surface.`,
              this.id, state, 'disabled',
              { serviceName: svc.name }
            ));
          }
        }
      }
      return results;
    } finally {
      closeSshConnection(client);
    }
  },
};

// ═══════════════════════════════════════════════════════════════════
// Module 3: Network Parameters (CIS 3.x)
// ═══════════════════════════════════════════════════════════════════

const NETWORK_PARAMS = [
  { param: 'net.ipv4.ip_forward', expected: '0', controlId: '3.1.1', severity: 'medium' as const },
  { param: 'net.ipv4.conf.all.send_redirects', expected: '0', controlId: '3.1.2', severity: 'medium' as const },
  { param: 'net.ipv4.conf.default.send_redirects', expected: '0', controlId: '3.1.2', severity: 'medium' as const },
  { param: 'net.ipv4.conf.all.accept_source_route', expected: '0', controlId: '3.2.1', severity: 'medium' as const },
  { param: 'net.ipv4.conf.all.accept_redirects', expected: '0', controlId: '3.2.2', severity: 'medium' as const },
  { param: 'net.ipv4.conf.all.secure_redirects', expected: '0', controlId: '3.2.2', severity: 'medium' as const },
  { param: 'net.ipv4.conf.all.log_martians', expected: '1', controlId: '3.2.4', severity: 'low' as const },
  { param: 'net.ipv4.tcp_syncookies', expected: '1', controlId: '3.3.1', severity: 'high' as const },
  { param: 'net.ipv6.conf.all.accept_ra', expected: '0', controlId: '3.4.1', severity: 'low' as const },
];

export const cisNetworkParametersCheck: CheckModule = {
  id: 'cis-network-parameters',
  name: 'CIS 3.x — Network Parameters',

  async run(target: string, config?: Record<string, unknown>): Promise<CheckResult[]> {
    const credential = config?.credential as PlainCredential | undefined;
    if (!credential) return [];

    const host = extractHost(target);
    const results: CheckResult[] = [];

    let client;
    try {
      client = await createSshConnection(host, credential.defaultPort ?? 22, credential);
    } catch (err) {
      return [sshError(host, err, this.id)];
    }

    try {
      for (const p of NETWORK_PARAMS) {
        const { stdout } = await runSshCommand(client, `sysctl ${p.param} 2>/dev/null`);
        const match = stdout.match(/=\s*(\d+)/);
        const currentValue = match ? match[1] : null;

        if (currentValue === null) continue; // param doesn't exist on this OS

        if (currentValue !== p.expected) {
          const ctrl = getCisControl(p.controlId);
          if (ctrl) {
            results.push(buildCisFinding(
              ctrl, p.severity,
              `Kernel parameter ${p.param} is set to ${currentValue} but should be ${p.expected}.`,
              this.id, currentValue, p.expected,
              { parameter: p.param }
            ));
          }
        }
      }
      return results;
    } finally {
      closeSshConnection(client);
    }
  },
};

// ═══════════════════════════════════════════════════════════════════
// Module 4: Auditd Service (CIS 4.1.1–4.1.3)
// ═══════════════════════════════════════════════════════════════════

export const cisAuditdServiceCheck: CheckModule = {
  id: 'cis-auditd-service',
  name: 'CIS 4.1.1–4.1.3 — auditd Service',

  async run(target: string, config?: Record<string, unknown>): Promise<CheckResult[]> {
    const credential = config?.credential as PlainCredential | undefined;
    if (!credential) return [];

    const host = extractHost(target);
    const results: CheckResult[] = [];

    let client;
    try {
      client = await createSshConnection(host, credential.defaultPort ?? 22, credential);
    } catch (err) {
      return [sshError(host, err, this.id)];
    }

    try {
      const { stdout: activeOut } = await runSshCommand(client, 'systemctl is-active auditd 2>/dev/null || echo "inactive"');
      const isActive = activeOut.trim() === 'active';

      if (!isActive) {
        const ctrl = getCisControl('4.1.2');
        if (ctrl) {
          results.push(buildCisFinding(
            ctrl, 'high',
            'The auditd service is not running. System call auditing is disabled.',
            this.id, activeOut.trim(), 'active'
          ));
        }
      }

      const { stdout: enabledOut } = await runSshCommand(client, 'systemctl is-enabled auditd 2>/dev/null || echo "disabled"');
      if (!enabledOut.trim().startsWith('enabled')) {
        const ctrl = getCisControl('4.1.2');
        if (ctrl) {
          results.push(buildCisFinding(
            ctrl, 'high',
            'The auditd service is not enabled to start on boot.',
            this.id, enabledOut.trim(), 'enabled'
          ));
        }
      }

      // Check for audit=1 in kernel cmdline
      const { stdout: cmdline } = await runSshCommand(client, 'cat /proc/cmdline 2>/dev/null');
      if (!cmdline.includes('audit=1')) {
        const ctrl = getCisControl('4.1.3');
        if (ctrl) {
          results.push(buildCisFinding(
            ctrl, 'medium',
            'The audit=1 kernel parameter is not set. Processes starting before auditd may not be audited.',
            this.id, 'audit=1 not in kernel cmdline', 'audit=1 in GRUB_CMDLINE_LINUX'
          ));
        }
      }

      return results;
    } finally {
      closeSshConnection(client);
    }
  },
};

// ═══════════════════════════════════════════════════════════════════
// Module 5: Auditd Rules (CIS 4.1.4–4.1.17)
// ═══════════════════════════════════════════════════════════════════

export const cisAuditdRulesCheck: CheckModule = {
  id: 'cis-auditd-rules',
  name: 'CIS 4.1.4–4.1.17 — auditd Rules',

  async run(target: string, config?: Record<string, unknown>): Promise<CheckResult[]> {
    const credential = config?.credential as PlainCredential | undefined;
    if (!credential) return [];

    const host = extractHost(target);
    const results: CheckResult[] = [];

    let client;
    try {
      client = await createSshConnection(host, credential.defaultPort ?? 22, credential);
    } catch (err) {
      return [sshError(host, err, this.id)];
    }

    try {
      const { stdout: rules } = await runSshCommand(client, 'auditctl -l 2>/dev/null || cat /etc/audit/rules.d/*.rules 2>/dev/null || echo ""');
      const rulesText = rules.toLowerCase();

      const ruleChecks = [
        { keyword: 'shadow', controlId: '4.1.6', desc: '/etc/shadow write access', label: 'identity changes' },
        { keyword: 'passwd', controlId: '4.1.6', desc: '/etc/passwd modifications', label: 'identity changes' },
        { keyword: 'sudoers', controlId: '4.1.6', desc: '/etc/sudoers changes', label: 'sudoers audit' },
        { keyword: 'privileged', controlId: '4.1.10', desc: 'privileged command execution', label: 'privileged commands' },
        { keyword: '/etc/hosts', controlId: '4.1.7', desc: 'network environment changes', label: 'network changes' },
      ];

      for (const rc of ruleChecks) {
        if (!rulesText.includes(rc.keyword)) {
          const ctrl = getCisControl(rc.controlId);
          if (ctrl) {
            results.push(buildCisFinding(
              ctrl, 'medium',
              `No audit rule found for ${rc.desc}. Security events for ${rc.label} may not be logged.`,
              this.id, 'rule absent', `audit rule covering ${rc.keyword}`
            ));
          }
        }
      }

      // Check immutability (-e 2)
      if (!rulesText.includes('-e 2')) {
        const ctrl = getCisControl('4.1.17');
        if (ctrl) {
          results.push(buildCisFinding(
            ctrl, 'medium',
            'Audit configuration is not immutable (-e 2 not found). Rules can be modified without a reboot.',
            this.id, '-e 2 absent', '-e 2 as last audit rule'
          ));
        }
      }

      return results;
    } finally {
      closeSshConnection(client);
    }
  },
};

// ═══════════════════════════════════════════════════════════════════
// Module 6: rsyslog (CIS 4.2.x)
// ═══════════════════════════════════════════════════════════════════

export const cisRsyslogCheck: CheckModule = {
  id: 'cis-rsyslog',
  name: 'CIS 4.2.x — rsyslog Configuration',

  async run(target: string, config?: Record<string, unknown>): Promise<CheckResult[]> {
    const credential = config?.credential as PlainCredential | undefined;
    if (!credential) return [];

    const host = extractHost(target);
    const results: CheckResult[] = [];

    let client;
    try {
      client = await createSshConnection(host, credential.defaultPort ?? 22, credential);
    } catch (err) {
      return [sshError(host, err, this.id)];
    }

    try {
      const { stdout: activeOut } = await runSshCommand(client, 'systemctl is-active rsyslog syslog 2>/dev/null | head -1 || echo "inactive"');
      if (activeOut.trim() !== 'active') {
        const ctrl = getCisControl('4.2.2');
        if (ctrl) {
          results.push(buildCisFinding(
            ctrl, 'high',
            'rsyslog (or syslog) is not active. System logs may not be captured.',
            this.id, activeOut.trim(), 'active'
          ));
        }
      }

      const { stdout: conf } = await runSshCommand(client, 'cat /etc/rsyslog.conf 2>/dev/null || echo ""');

      // Check FileCreateMode
      const modeMatch = conf.match(/\$FileCreateMode\s+([0-9]+)/i);
      if (modeMatch) {
        const mode = parseInt(modeMatch[1], 8);
        if (mode & 0o022) { // group/world writable
          const ctrl = getCisControl('4.2.2');
          if (ctrl) {
            results.push(buildCisFinding(
              ctrl, 'medium',
              `rsyslog FileCreateMode is ${modeMatch[1]} — log files may be group or world-writable.`,
              this.id, modeMatch[1], '0640 or more restrictive'
            ));
          }
        }
      }

      return results;
    } finally {
      closeSshConnection(client);
    }
  },
};

// ═══════════════════════════════════════════════════════════════════
// Module 7: Cron Permissions (CIS 5.1.x)
// ═══════════════════════════════════════════════════════════════════

export const cisCronPermissionsCheck: CheckModule = {
  id: 'cis-cron-permissions',
  name: 'CIS 5.1.x — Cron Permissions',

  async run(target: string, config?: Record<string, unknown>): Promise<CheckResult[]> {
    const credential = config?.credential as PlainCredential | undefined;
    if (!credential) return [];

    const host = extractHost(target);
    const results: CheckResult[] = [];

    let client;
    try {
      client = await createSshConnection(host, credential.defaultPort ?? 22, credential);
    } catch (err) {
      return [sshError(host, err, this.id)];
    }

    try {
      const cronPaths = ['/etc/crontab', '/etc/cron.hourly', '/etc/cron.daily', '/etc/cron.weekly', '/etc/cron.monthly', '/etc/cron.d'];

      for (const p of cronPaths) {
        const { stdout } = await runSshCommand(client, `stat -c '%a %U %G' ${p} 2>/dev/null || echo "not-found"`);
        if (stdout.trim() === 'not-found') continue;

        const parts = stdout.trim().split(' ');
        const mode = parts[0];
        const owner = parts[1];
        const group = parts[2];
        const ctrl = getCisControl('5.1.2');

        if (owner !== 'root' || group !== 'root') {
          if (ctrl) {
            results.push(buildCisFinding(
              ctrl, 'high',
              `${p} is owned by ${owner}:${group} — should be root:root.`,
              this.id, `${owner}:${group}`, 'root:root',
              { path: p }
            ));
          }
        }

        const modeNum = parseInt(mode, 8);
        if (modeNum & 0o022) {
          if (ctrl) {
            results.push(buildCisFinding(
              ctrl, 'medium',
              `${p} has permissions ${mode} — group or world-writable cron files allow privilege escalation.`,
              this.id, mode, '600 or 700',
              { path: p }
            ));
          }
        }
      }

      return results;
    } finally {
      closeSshConnection(client);
    }
  },
};

// ═══════════════════════════════════════════════════════════════════
// Module 8: SSH Hardening Deep (CIS 5.2.x)
// ═══════════════════════════════════════════════════════════════════

const WEAK_CIPHERS = ['arcfour', 'blowfish', 'cast128', '3des', 'aes128-cbc', 'aes192-cbc', 'aes256-cbc'];
const WEAK_MACS = ['hmac-md5', 'hmac-sha1', 'umac-64', 'hmac-ripemd160'];
const WEAK_KEX = ['diffie-hellman-group1-sha1', 'diffie-hellman-group14-sha1', 'gss-group1-sha1'];

export const cisSshHardeningCheck: CheckModule = {
  id: 'cis-ssh-hardening',
  name: 'CIS 5.2.1–5.2.22 — SSH Hardening (Deep)',

  async run(target: string, config?: Record<string, unknown>): Promise<CheckResult[]> {
    const credential = config?.credential as PlainCredential | undefined;
    if (!credential) return [];

    const host = extractHost(target);
    const results: CheckResult[] = [];

    let client;
    try {
      client = await createSshConnection(host, credential.defaultPort ?? 22, credential);
    } catch (err) {
      return [sshError(host, err, this.id)];
    }

    try {
      const { stdout } = await runSshCommand(client, 'sshd -T 2>/dev/null');
      const conf = stdout.toLowerCase();

      function val(key: string): string | null {
        const m = conf.match(new RegExp(`^${key}\\s+(.+)$`, 'm'));
        return m ? m[1].trim() : null;
      }

      // MaxAuthTries
      const maxAuthTries = val('maxauthtries');
      if (maxAuthTries && parseInt(maxAuthTries, 10) > 4) {
        const ctrl = getCisControl('5.2.4');
        if (ctrl) results.push(buildCisFinding(ctrl, 'medium', `MaxAuthTries is ${maxAuthTries} — should be ≤4 to limit brute-force attempts.`, this.id, maxAuthTries, '≤4'));
      }

      // IgnoreRhosts
      const ignoreRhosts = val('ignorerhosts');
      if (ignoreRhosts === 'no') {
        const ctrl = getCisControl('5.2.5');
        if (ctrl) results.push(buildCisFinding(ctrl, 'medium', 'IgnoreRhosts is set to no — rhosts files are a security risk.', this.id, 'no', 'yes'));
      }

      // HostbasedAuthentication
      const hostbasedAuth = val('hostbasedauthentication');
      if (hostbasedAuth === 'yes') {
        const ctrl = getCisControl('5.2.6');
        if (ctrl) results.push(buildCisFinding(ctrl, 'high', 'HostbasedAuthentication is enabled — host-based auth is insecure.', this.id, 'yes', 'no'));
      }

      // PermitRootLogin
      const permitRoot = val('permitrootlogin');
      if (permitRoot && permitRoot !== 'no') {
        const ctrl = getCisControl('5.2.7');
        if (ctrl) results.push(buildCisFinding(ctrl, 'critical', `PermitRootLogin is '${permitRoot}' — direct root SSH access should be disabled.`, this.id, permitRoot, 'no'));
      }

      // PermitEmptyPasswords
      const emptyPwd = val('permitemptypasswords');
      if (emptyPwd === 'yes') {
        const ctrl = getCisControl('5.2.8');
        if (ctrl) results.push(buildCisFinding(ctrl, 'critical', 'PermitEmptyPasswords is enabled — accounts with no password can be accessed via SSH.', this.id, 'yes', 'no'));
      }

      // LoginGraceTime
      const graceTime = val('logingracetime');
      if (graceTime) {
        const seconds = graceTime.endsWith('m') ? parseInt(graceTime, 10) * 60 : parseInt(graceTime, 10);
        if (seconds > 60) {
          const ctrl = getCisControl('5.2.10');
          if (ctrl) results.push(buildCisFinding(ctrl, 'low', `LoginGraceTime is ${graceTime} — should be 60 seconds or less.`, this.id, graceTime, '60'));
        }
      }

      // Banner
      const banner = val('banner');
      if (!banner || banner === 'none') {
        const ctrl = getCisControl('5.2.15');
        if (ctrl) results.push(buildCisFinding(ctrl, 'low', 'No SSH warning banner is configured. Legal deterrence is absent.', this.id, banner ?? 'none', '/etc/issue.net'));
      }

      // Ciphers
      const ciphers = val('ciphers');
      if (ciphers) {
        const active = ciphers.split(',').map((c) => c.trim());
        const weak = active.filter((c) => WEAK_CIPHERS.some((w) => c.includes(w)));
        if (weak.length > 0) {
          const ctrl = getCisControl('5.2.11');
          if (ctrl) results.push(buildCisFinding(ctrl, 'high', `Weak SSH ciphers in use: ${weak.join(', ')}`, this.id, weak.join(', '), 'approved ciphers only (AES-CTR, AES-GCM)', { weakCiphers: weak }));
        }
      }

      // MACs
      const macs = val('macs');
      if (macs) {
        const active = macs.split(',').map((m) => m.trim());
        const weak = active.filter((m) => WEAK_MACS.some((w) => m.includes(w)));
        if (weak.length > 0) {
          const ctrl = getCisControl('5.2.12');
          if (ctrl) results.push(buildCisFinding(ctrl, 'high', `Weak SSH MAC algorithms in use: ${weak.join(', ')}`, this.id, weak.join(', '), 'hmac-sha2-256 / hmac-sha2-512 only', { weakMACs: weak }));
        }
      }

      // KexAlgorithms
      const kex = val('kexalgorithms');
      if (kex) {
        const active = kex.split(',').map((k) => k.trim());
        const weak = active.filter((k) => WEAK_KEX.some((w) => k.includes(w)));
        if (weak.length > 0) {
          const ctrl = getCisControl('5.2.13');
          if (ctrl) results.push(buildCisFinding(ctrl, 'high', `Weak key exchange algorithms in use: ${weak.join(', ')}`, this.id, weak.join(', '), 'curve25519-sha256, diffie-hellman-group14-sha256', { weakKex: weak }));
        }
      }

      return results;
    } finally {
      closeSshConnection(client);
    }
  },
};

// ═══════════════════════════════════════════════════════════════════
// Module 9: PAM / Password Policy (CIS 5.3.x, 5.4.x)
// ═══════════════════════════════════════════════════════════════════

export const cisPamPasswordCheck: CheckModule = {
  id: 'cis-pam-password',
  name: 'CIS 5.3.x–5.4.x — PAM Password Policy',

  async run(target: string, config?: Record<string, unknown>): Promise<CheckResult[]> {
    const credential = config?.credential as PlainCredential | undefined;
    if (!credential) return [];

    const host = extractHost(target);
    const results: CheckResult[] = [];

    let client;
    try {
      client = await createSshConnection(host, credential.defaultPort ?? 22, credential);
    } catch (err) {
      return [sshError(host, err, this.id)];
    }

    try {
      // pwquality
      const { stdout: pwq } = await runSshCommand(client, 'cat /etc/security/pwquality.conf 2>/dev/null || echo ""');
      const minlenMatch = pwq.match(/^\s*minlen\s*=\s*(\d+)/m);
      if (!minlenMatch || parseInt(minlenMatch[1], 10) < 14) {
        const ctrl = getCisControl('5.4.1');
        if (ctrl) {
          results.push(buildCisFinding(
            ctrl, 'medium',
            `Password minimum length is ${minlenMatch ? minlenMatch[1] : 'not configured'} — should be 14 or more characters.`,
            this.id, minlenMatch ? minlenMatch[1] : 'not set', '14'
          ));
        }
      }

      // faillock / pam_tally
      const { stdout: pam } = await runSshCommand(client, 'grep -E "pam_faillock|pam_tally" /etc/pam.d/system-auth /etc/pam.d/password-auth 2>/dev/null || echo ""');
      if (!pam.trim()) {
        const ctrl = getCisControl('5.4.2');
        if (ctrl) {
          results.push(buildCisFinding(
            ctrl, 'high',
            'No account lockout policy (pam_faillock or pam_tally) found in PAM configuration. Brute-force attacks are not mitigated.',
            this.id, 'no lockout configured', 'pam_faillock deny=5 unlock_time=900'
          ));
        }
      }

      // login.defs
      const { stdout: loginDefs } = await runSshCommand(client, 'cat /etc/login.defs 2>/dev/null || echo ""');

      const passMaxMatch = loginDefs.match(/^\s*PASS_MAX_DAYS\s+(\d+)/m);
      if (passMaxMatch) {
        const days = parseInt(passMaxMatch[1], 10);
        if (days > 365) {
          const ctrl = getCisControl('5.4.4');
          if (ctrl) {
            results.push(buildCisFinding(
              ctrl, 'medium',
              `PASS_MAX_DAYS is ${days} — password expiry should be 365 days or less.`,
              this.id, String(days), '365'
            ));
          }
        }
      } else {
        const ctrl = getCisControl('5.4.4');
        if (ctrl) {
          results.push(buildCisFinding(
            ctrl, 'low',
            'PASS_MAX_DAYS is not configured in /etc/login.defs.',
            this.id, 'not set', '365'
          ));
        }
      }

      const passMinMatch = loginDefs.match(/^\s*PASS_MIN_DAYS\s+(\d+)/m);
      if (passMinMatch) {
        const days = parseInt(passMinMatch[1], 10);
        if (days < 7) {
          const ctrl = getCisControl('5.4.5');
          if (ctrl) {
            results.push(buildCisFinding(
              ctrl, 'low',
              `PASS_MIN_DAYS is ${days} — minimum days between password changes should be 7 or more.`,
              this.id, String(days), '7'
            ));
          }
        }
      }

      return results;
    } finally {
      closeSshConnection(client);
    }
  },
};

// ═══════════════════════════════════════════════════════════════════
// Module 10: Sudo Hardening (CIS 5.3.4–5.3.5)
// ═══════════════════════════════════════════════════════════════════

export const cisSudoHardeningCheck: CheckModule = {
  id: 'cis-sudo-hardening',
  name: 'CIS 5.3.4–5.3.5 — Sudo Hardening',

  async run(target: string, config?: Record<string, unknown>): Promise<CheckResult[]> {
    const credential = config?.credential as PlainCredential | undefined;
    if (!credential) return [];

    const host = extractHost(target);
    const results: CheckResult[] = [];

    let client;
    try {
      client = await createSshConnection(host, credential.defaultPort ?? 22, credential);
    } catch (err) {
      return [sshError(host, err, this.id)];
    }

    try {
      const { stdout } = await runSshCommand(
        client,
        'cat /etc/sudoers /etc/sudoers.d/* 2>/dev/null | grep -v "^#" | grep -v "^$"'
      );
      const sudoConf = stdout.toLowerCase();

      // use_pty
      if (!sudoConf.includes('use_pty')) {
        const ctrl = getCisControl('5.3.4');
        if (ctrl) {
          results.push(buildCisFinding(
            ctrl, 'medium',
            'Sudo "use_pty" is not configured. This allows commands to be run in background without a terminal, enabling privilege escalation.',
            this.id, 'use_pty absent', 'Defaults use_pty in /etc/sudoers'
          ));
        }
      }

      // log_file
      if (!sudoConf.includes('logfile') && !sudoConf.includes('log_file')) {
        const ctrl = getCisControl('5.3.5');
        if (ctrl) {
          results.push(buildCisFinding(
            ctrl, 'medium',
            'Sudo log file is not configured. Privileged command execution may not be fully audited.',
            this.id, 'logfile absent', 'Defaults logfile="/var/log/sudo.log"'
          ));
        }
      }

      // NOPASSWD check
      const nopasswdLines = stdout.split('\n').filter((l) => l.includes('NOPASSWD'));
      if (nopasswdLines.length > 0) {
        results.push({
          title: 'CIS 5.3.1 — NOPASSWD sudo entries detected',
          severity: 'high',
          description: `Found ${nopasswdLines.length} sudo rule(s) with NOPASSWD — these allow privilege escalation without authentication: ${nopasswdLines.slice(0, 3).join('; ')}`,
          remediation: 'Remove NOPASSWD from sudo rules unless absolutely required. Require password confirmation for all sudo access.',
          details: {
            cisControlId: '5.3.1',
            cisLevel: 1,
            checkModuleId: this.id,
            detectionMethod: 'authenticated',
            nopasswdRules: nopasswdLines,
          },
        });
      }

      return results;
    } finally {
      closeSshConnection(client);
    }
  },
};

// ═══════════════════════════════════════════════════════════════════
// Module 11: User & Group Audit (CIS 6.2.x)
// ═══════════════════════════════════════════════════════════════════

export const cisUserGroupAuditCheck: CheckModule = {
  id: 'cis-user-group-audit',
  name: 'CIS 6.2.x — User & Group Integrity',

  async run(target: string, config?: Record<string, unknown>): Promise<CheckResult[]> {
    const credential = config?.credential as PlainCredential | undefined;
    if (!credential) return [];

    const host = extractHost(target);
    const results: CheckResult[] = [];

    let client;
    try {
      client = await createSshConnection(host, credential.defaultPort ?? 22, credential);
    } catch (err) {
      return [sshError(host, err, this.id)];
    }

    try {
      // Empty passwords in shadow
      const { stdout: emptyPwd } = await runSshCommand(
        client,
        "awk -F: '($2 == \"\") {print $1}' /etc/shadow 2>/dev/null"
      );
      const emptyAccounts = emptyPwd.trim().split('\n').filter(Boolean);
      if (emptyAccounts.length > 0) {
        const ctrl = getCisControl('6.2.1');
        if (ctrl) {
          results.push(buildCisFinding(
            ctrl, 'critical',
            `${emptyAccounts.length} account(s) have empty passwords: ${emptyAccounts.join(', ')}. These can be accessed without credentials.`,
            this.id, `${emptyAccounts.length} empty-password accounts`, '0',
            { accounts: emptyAccounts }
          ));
        }
      }

      // UID 0 non-root accounts
      const { stdout: uid0 } = await runSshCommand(
        client,
        "awk -F: '($3 == 0 && $1 != \"root\") {print $1}' /etc/passwd 2>/dev/null"
      );
      const uid0Accounts = uid0.trim().split('\n').filter(Boolean);
      if (uid0Accounts.length > 0) {
        const ctrl = getCisControl('6.2.5');
        if (ctrl) {
          results.push(buildCisFinding(
            ctrl, 'critical',
            `Non-root accounts with UID 0 found: ${uid0Accounts.join(', ')}. These have full root privileges.`,
            this.id, uid0Accounts.join(', '), 'root only',
            { accounts: uid0Accounts }
          ));
        }
      }

      // Duplicate UIDs
      const { stdout: passwdContent } = await runSshCommand(client, "cat /etc/passwd 2>/dev/null");
      const uids = passwdContent.split('\n').filter(Boolean).map((l) => l.split(':')[2]);
      const dupUids = uids.filter((uid, idx) => uids.indexOf(uid) !== idx);
      const uniqueDups = [...new Set(dupUids)];
      if (uniqueDups.length > 0) {
        const ctrl = getCisControl('6.2.9');
        if (ctrl) {
          results.push(buildCisFinding(
            ctrl, 'high',
            `Duplicate UIDs found: ${uniqueDups.join(', ')}. Multiple accounts sharing a UID can access each other's files.`,
            this.id, `${uniqueDups.length} duplicate UIDs`, 'all UIDs unique',
            { duplicateUids: uniqueDups }
          ));
        }
      }

      // Duplicate GIDs
      const { stdout: groupContent } = await runSshCommand(client, "cat /etc/group 2>/dev/null");
      const gids = groupContent.split('\n').filter(Boolean).map((l) => l.split(':')[2]);
      const dupGids = gids.filter((gid, idx) => gids.indexOf(gid) !== idx);
      const uniqueGidDups = [...new Set(dupGids)];
      if (uniqueGidDups.length > 0) {
        const ctrl = getCisControl('6.2.10');
        if (ctrl) {
          results.push(buildCisFinding(
            ctrl, 'medium',
            `Duplicate GIDs found: ${uniqueGidDups.join(', ')}. Multiple groups sharing a GID can cause unintended access.`,
            this.id, `${uniqueGidDups.length} duplicate GIDs`, 'all GIDs unique',
            { duplicateGids: uniqueGidDups }
          ));
        }
      }

      return results;
    } finally {
      closeSshConnection(client);
    }
  },
};

// ═══════════════════════════════════════════════════════════════════
// Module 12: File Integrity (CIS 6.1.x)
// ═══════════════════════════════════════════════════════════════════

export const cisFileIntegrityCheck: CheckModule = {
  id: 'cis-file-integrity',
  name: 'CIS 6.1.x — File Permissions & Integrity',

  async run(target: string, config?: Record<string, unknown>): Promise<CheckResult[]> {
    const credential = config?.credential as PlainCredential | undefined;
    if (!credential) return [];

    const host = extractHost(target);
    const results: CheckResult[] = [];

    let client;
    try {
      client = await createSshConnection(host, credential.defaultPort ?? 22, credential);
    } catch (err) {
      return [sshError(host, err, this.id)];
    }

    try {
      // Critical file permissions
      const filePerm = [
        { path: '/etc/passwd', expected: '644', controlId: '6.1.1' },
        { path: '/etc/shadow', expected: '640', controlId: '6.1.2' },
        { path: '/etc/group', expected: '644', controlId: '6.1.3' },
        { path: '/etc/gshadow', expected: '640', controlId: '6.1.3' },
      ];

      for (const fp of filePerm) {
        const { stdout } = await runSshCommand(client, `stat -c '%a %U %G' ${fp.path} 2>/dev/null || echo "not-found"`);
        if (stdout.trim() === 'not-found') continue;

        const parts = stdout.trim().split(' ');
        const mode = parts[0];
        const owner = parts[1];
        const group = parts[2];
        const ctrl = getCisControl(fp.controlId);

        if (owner !== 'root') {
          if (ctrl) {
            results.push(buildCisFinding(
              ctrl, 'high',
              `${fp.path} is owned by '${owner}' — should be owned by root.`,
              this.id, owner, 'root',
              { path: fp.path }
            ));
          }
        }

        const modeNum = parseInt(mode, 8);
        if (modeNum & 0o002) { // world-writable
          if (ctrl) {
            results.push(buildCisFinding(
              ctrl, 'critical',
              `${fp.path} is world-writable (mode ${mode}). Any user can modify this critical system file.`,
              this.id, mode, fp.expected,
              { path: fp.path }
            ));
          }
        } else if (modeNum & 0o020) { // group-writable for shadow files
          if (['/etc/shadow', '/etc/gshadow'].includes(fp.path) && ctrl) {
            results.push(buildCisFinding(
              ctrl, 'high',
              `${fp.path} is group-writable (mode ${mode}) — password hashes may be modifiable.`,
              this.id, mode, fp.expected,
              { path: fp.path }
            ));
          }
        }
      }

      // World-writable files
      const { stdout: wwFiles } = await runSshCommand(
        client,
        "find / -xdev -type f -perm -0002 ! -path '/proc/*' ! -path '/sys/*' 2>/dev/null | head -20"
      );
      const wwList = wwFiles.trim().split('\n').filter(Boolean);
      if (wwList.length > 0) {
        const ctrl = getCisControl('6.1.6');
        if (ctrl) {
          results.push(buildCisFinding(
            ctrl, 'medium',
            `Found ${wwList.length} world-writable file(s): ${wwList.slice(0, 5).join(', ')}${wwList.length > 5 ? ` and ${wwList.length - 5} more` : ''}`,
            this.id, `${wwList.length} world-writable files`, '0',
            { files: wwList }
          ));
        }
      }

      // Unowned files
      const { stdout: unowned } = await runSshCommand(
        client,
        "find / -xdev \\( -nouser -o -nogroup \\) ! -path '/proc/*' ! -path '/sys/*' 2>/dev/null | head -10"
      );
      const unownedList = unowned.trim().split('\n').filter(Boolean);
      if (unownedList.length > 0) {
        const ctrl = getCisControl('6.1.10');
        if (ctrl) {
          results.push(buildCisFinding(
            ctrl, 'medium',
            `Found ${unownedList.length} unowned file(s)/director(ies) with no valid user or group owner: ${unownedList.slice(0, 5).join(', ')}`,
            this.id, `${unownedList.length} unowned items`, '0',
            { files: unownedList }
          ));
        }
      }

      return results;
    } finally {
      closeSshConnection(client);
    }
  },
};

// ─── Export all 12 modules as array ──────────────────────────────

export const cisSshChecks = [
  cisFilesystemMountsCheck,
  cisUnnecessaryServicesCheck,
  cisNetworkParametersCheck,
  cisAuditdServiceCheck,
  cisAuditdRulesCheck,
  cisRsyslogCheck,
  cisCronPermissionsCheck,
  cisSshHardeningCheck,
  cisPamPasswordCheck,
  cisSudoHardeningCheck,
  cisUserGroupAuditCheck,
  cisFileIntegrityCheck,
];
