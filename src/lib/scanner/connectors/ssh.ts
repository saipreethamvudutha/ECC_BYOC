/**
 * SSH Authenticated Check Modules (8 total)
 * Each implements CheckModule, runs one category of Linux audit commands.
 * If config.credential is absent, returns [] (graceful skip).
 * If SSH fails, returns single info-severity finding describing the error.
 */

import type { CheckModule, CheckResult } from '../types';
import type { PlainCredential } from '../vault';
import { createSshConnection, runSshCommand, closeSshConnection } from './ssh-client';

function credentialFromConfig(config?: Record<string, unknown>): PlainCredential | null {
  if (!config?.credential) return null;
  return config.credential as PlainCredential;
}

function sshErrorResult(target: string, checkName: string, error: unknown): CheckResult {
  const msg = error instanceof Error ? error.message : String(error);
  return {
    title: `SSH Auth Failed: ${checkName} on ${target}`,
    severity: 'info',
    description: `Could not connect via SSH to perform ${checkName} check. Error: ${msg}`,
    remediation: 'Verify SSH credentials, ensure SSH is enabled on the target, and check firewall rules allow port 22.',
    details: { checkModule: `ssh-${checkName.toLowerCase().replace(/\s+/g, '-')}`, target, error: msg },
  };
}

// ─── 1. OS Information ───────────────────────────────────────────
export const sshOsInfoCheck: CheckModule = {
  id: 'ssh-os-info',
  name: 'SSH: OS Information',

  async run(target: string, config?: Record<string, unknown>): Promise<CheckResult[]> {
    const credential = credentialFromConfig(config);
    if (!credential) return [];

    const host = target.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
    const port = credential.defaultPort ?? 22;

    let client;
    try {
      client = await createSshConnection(host, port, credential);
      const result = await runSshCommand(client, 'uname -a && echo "---" && cat /etc/os-release 2>/dev/null || cat /etc/redhat-release 2>/dev/null');

      return [{
        title: `OS Inventory: ${host}`,
        severity: 'info',
        description: `SSH authenticated OS discovery completed for ${host}.`,
        remediation: 'Ensure OS is up to date and not end-of-life.',
        details: {
          checkModule: 'ssh-os-info',
          target: host,
          rawOutput: result.stdout,
          scanEngine: 'ssh',
        },
      }];
    } catch (err) {
      return [sshErrorResult(host, 'OS Info', err)];
    } finally {
      if (client) closeSshConnection(client);
    }
  },
};

// ─── 2. User Accounts ────────────────────────────────────────────
export const sshUserAccountsCheck: CheckModule = {
  id: 'ssh-user-accounts',
  name: 'SSH: User Accounts',

  async run(target: string, config?: Record<string, unknown>): Promise<CheckResult[]> {
    const credential = credentialFromConfig(config);
    if (!credential) return [];

    const host = target.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
    const port = credential.defaultPort ?? 22;

    let client;
    try {
      client = await createSshConnection(host, port, credential);
      const result = await runSshCommand(
        client,
        "awk -F: '($3>=1000 && $7!~/nologin/ && $7!~/false/ && $1!=\"nobody\") {print $1\":\"$3\":\"$6\":\"$7}' /etc/passwd"
      );

      const accounts = result.stdout.split('\n').filter(Boolean).map(line => {
        const [username, uid, home, shell] = line.split(':');
        return { username, uid: parseInt(uid), home, shell };
      });

      const findings: CheckResult[] = [];

      if (accounts.length > 0) {
        findings.push({
          title: `${accounts.length} Active User Account(s) on ${host}`,
          severity: 'info',
          description: `Found ${accounts.length} active user accounts with login shell.`,
          remediation: 'Review user accounts and remove any that are no longer needed. Enforce least-privilege access.',
          details: { checkModule: 'ssh-user-accounts', target: host, accounts, scanEngine: 'ssh' },
        });
      }

      // Flag any UID 0 accounts beyond root
      const uid0Extras = accounts.filter(a => a.uid === 0 && a.username !== 'root');
      if (uid0Extras.length > 0) {
        findings.push({
          title: `Non-Root UID 0 Account(s) Detected on ${host}`,
          severity: 'critical',
          description: `Found ${uid0Extras.length} account(s) with UID 0 (root equivalent): ${uid0Extras.map(a => a.username).join(', ')}.`,
          remediation: 'Immediately investigate and remove unauthorized UID 0 accounts.',
          details: { checkModule: 'ssh-user-accounts', target: host, uid0Accounts: uid0Extras, scanEngine: 'ssh' },
        });
      }

      return findings;
    } catch (err) {
      return [sshErrorResult(host, 'User Accounts', err)];
    } finally {
      if (client) closeSshConnection(client);
    }
  },
};

// ─── 3. Sudo Configuration ──────────────────────────────────────
export const sshSudoConfigCheck: CheckModule = {
  id: 'ssh-sudo-config',
  name: 'SSH: Sudo Configuration',

  async run(target: string, config?: Record<string, unknown>): Promise<CheckResult[]> {
    const credential = credentialFromConfig(config);
    if (!credential) return [];

    const host = target.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
    const port = credential.defaultPort ?? 22;

    let client;
    try {
      client = await createSshConnection(host, port, credential);
      const result = await runSshCommand(
        client,
        "grep -rE 'NOPASSWD' /etc/sudoers /etc/sudoers.d/ 2>/dev/null | grep -v '^#'"
      );

      const findings: CheckResult[] = [];
      if (result.stdout) {
        const lines = result.stdout.split('\n').filter(Boolean);
        findings.push({
          title: `NOPASSWD Sudo Rule(s) Found on ${host}`,
          severity: 'high',
          description: `Found ${lines.length} sudo rule(s) allowing passwordless privilege escalation: ${lines.slice(0, 3).join('; ')}`,
          remediation: 'Remove NOPASSWD from sudo rules unless absolutely required. Require password for all sudo operations.',
          details: { checkModule: 'ssh-sudo-config', target: host, nopasswdRules: lines, scanEngine: 'ssh' },
        });
      }
      return findings;
    } catch (err) {
      return [sshErrorResult(host, 'Sudo Config', err)];
    } finally {
      if (client) closeSshConnection(client);
    }
  },
};

// ─── 4. Listening Services ──────────────────────────────────────
export const sshListeningServicesCheck: CheckModule = {
  id: 'ssh-listening-services',
  name: 'SSH: Listening Services',

  async run(target: string, config?: Record<string, unknown>): Promise<CheckResult[]> {
    const credential = credentialFromConfig(config);
    if (!credential) return [];

    const host = target.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
    const port = credential.defaultPort ?? 22;

    let client;
    try {
      client = await createSshConnection(host, port, credential);
      const result = await runSshCommand(
        client,
        "ss -tlnpu 2>/dev/null || netstat -tlnpu 2>/dev/null | grep LISTEN"
      );

      return [{
        title: `Listening Services on ${host} (Authenticated View)`,
        severity: 'info',
        description: `SSH-authenticated view of all listening TCP/UDP services including localhost-only services not visible to external port scans.`,
        remediation: 'Review all listening services. Disable any services not required for business operations.',
        details: { checkModule: 'ssh-listening-services', target: host, rawOutput: result.stdout, scanEngine: 'ssh' },
      }];
    } catch (err) {
      return [sshErrorResult(host, 'Listening Services', err)];
    } finally {
      if (client) closeSshConnection(client);
    }
  },
};

// ─── 5. Installed Packages ──────────────────────────────────────
export const sshInstalledPackagesCheck: CheckModule = {
  id: 'ssh-installed-packages',
  name: 'SSH: Installed Packages',

  async run(target: string, config?: Record<string, unknown>): Promise<CheckResult[]> {
    const credential = credentialFromConfig(config);
    if (!credential) return [];

    const host = target.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
    const port = credential.defaultPort ?? 22;

    let client;
    try {
      client = await createSshConnection(host, port, credential);
      // Try dpkg (Debian/Ubuntu) first, then rpm (RHEL/CentOS)
      const result = await runSshCommand(
        client,
        "dpkg --list 2>/dev/null | awk 'NR>5 && /^ii/ {print $2\" \"$3}' | head -200 || rpm -qa --qf '%{NAME} %{VERSION}\\n' 2>/dev/null | head -200"
      );

      const packages = result.stdout.split('\n').filter(Boolean).map(line => {
        const parts = line.trim().split(' ');
        return { name: parts[0], version: parts.slice(1).join(' ') };
      });

      return [{
        title: `Software Inventory: ${packages.length} Package(s) on ${host}`,
        severity: 'info',
        description: `Authenticated software inventory retrieved. ${packages.length} installed packages found.`,
        remediation: 'Keep all software up to date. Remove unused packages to reduce attack surface.',
        details: { checkModule: 'ssh-installed-packages', target: host, packageCount: packages.length, packages: packages.slice(0, 50), scanEngine: 'ssh' },
      }];
    } catch (err) {
      return [sshErrorResult(host, 'Installed Packages', err)];
    } finally {
      if (client) closeSshConnection(client);
    }
  },
};

// ─── 6. File Permissions ────────────────────────────────────────
export const sshFilePermissionsCheck: CheckModule = {
  id: 'ssh-file-permissions',
  name: 'SSH: Sensitive File Permissions',

  async run(target: string, config?: Record<string, unknown>): Promise<CheckResult[]> {
    const credential = credentialFromConfig(config);
    if (!credential) return [];

    const host = target.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
    const port = credential.defaultPort ?? 22;

    let client;
    try {
      client = await createSshConnection(host, port, credential);
      const result = await runSshCommand(
        client,
        "stat -c '%n %a %U %G' /etc/passwd /etc/shadow /etc/sudoers /etc/ssh/sshd_config 2>/dev/null"
      );

      const findings: CheckResult[] = [];
      const lines = result.stdout.split('\n').filter(Boolean);

      for (const line of lines) {
        const parts = line.split(' ');
        const [filePath, perms] = parts;
        const permsNum = parseInt(perms, 8);

        // /etc/shadow should be 640 or more restrictive
        if (filePath === '/etc/shadow' && (permsNum & 0o004) !== 0) {
          findings.push({
            title: `/etc/shadow World-Readable on ${host}`,
            severity: 'critical',
            description: `The /etc/shadow file (containing password hashes) has world-readable permissions (${perms}). This exposes all password hashes to any local user.`,
            remediation: 'Run: chmod 640 /etc/shadow && chown root:shadow /etc/shadow',
            details: { checkModule: 'ssh-file-permissions', target: host, file: filePath, permissions: perms, scanEngine: 'ssh' },
          });
        }
      }

      if (findings.length === 0) {
        findings.push({
          title: `Sensitive File Permissions OK on ${host}`,
          severity: 'info',
          description: `Checked permissions for critical files (/etc/passwd, /etc/shadow, /etc/sudoers, sshd_config). No critical misconfigurations found.`,
          remediation: 'Continue monitoring file permissions as part of regular security hardening reviews.',
          details: { checkModule: 'ssh-file-permissions', target: host, files: lines, scanEngine: 'ssh' },
        });
      }

      return findings;
    } catch (err) {
      return [sshErrorResult(host, 'File Permissions', err)];
    } finally {
      if (client) closeSshConnection(client);
    }
  },
};

// ─── 7. Cron Jobs ───────────────────────────────────────────────
export const sshCronJobsCheck: CheckModule = {
  id: 'ssh-cron-jobs',
  name: 'SSH: Cron Jobs',

  async run(target: string, config?: Record<string, unknown>): Promise<CheckResult[]> {
    const credential = credentialFromConfig(config);
    if (!credential) return [];

    const host = target.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
    const port = credential.defaultPort ?? 22;

    let client;
    try {
      client = await createSshConnection(host, port, credential);
      const result = await runSshCommand(
        client,
        "cat /etc/crontab 2>/dev/null; ls -la /etc/cron.d/ 2>/dev/null; crontab -l 2>/dev/null"
      );

      return [{
        title: `Cron Job Inventory on ${host}`,
        severity: 'info',
        description: `System cron job configuration retrieved for ${host}. Review for unauthorized scheduled tasks.`,
        remediation: 'Audit cron jobs regularly. Remove any unrecognized or unnecessary scheduled tasks.',
        details: { checkModule: 'ssh-cron-jobs', target: host, rawOutput: result.stdout, scanEngine: 'ssh' },
      }];
    } catch (err) {
      return [sshErrorResult(host, 'Cron Jobs', err)];
    } finally {
      if (client) closeSshConnection(client);
    }
  },
};

// ─── 8. SSH Daemon Configuration ────────────────────────────────
export const sshSshdConfigCheck: CheckModule = {
  id: 'ssh-sshd-config',
  name: 'SSH: SSHD Hardening',

  async run(target: string, config?: Record<string, unknown>): Promise<CheckResult[]> {
    const credential = credentialFromConfig(config);
    if (!credential) return [];

    const host = target.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
    const port = credential.defaultPort ?? 22;

    let client;
    try {
      client = await createSshConnection(host, port, credential);
      const result = await runSshCommand(
        client,
        "sshd -T 2>/dev/null | grep -iE 'permitrootlogin|passwordauthentication|pubkeyauthentication|permitemptypasswords|x11forwarding|maxauthtries|protocol'"
      );

      const findings: CheckResult[] = [];
      const output = result.stdout.toLowerCase();

      if (output.includes('permitrootlogin yes')) {
        findings.push({
          title: `SSH Root Login Permitted on ${host}`,
          severity: 'high',
          description: 'The SSH daemon is configured to allow direct root login. This exposes the root account to brute force attacks.',
          remediation: 'Set "PermitRootLogin no" in /etc/ssh/sshd_config and restart sshd.',
          details: { checkModule: 'ssh-sshd-config', target: host, setting: 'PermitRootLogin yes', scanEngine: 'ssh' },
        });
      }

      if (output.includes('passwordauthentication yes')) {
        findings.push({
          title: `SSH Password Authentication Enabled on ${host}`,
          severity: 'medium',
          description: 'The SSH daemon allows password-based authentication, which is vulnerable to brute force attacks. Key-based authentication is recommended.',
          remediation: 'Set "PasswordAuthentication no" in /etc/ssh/sshd_config and use SSH key pairs exclusively.',
          details: { checkModule: 'ssh-sshd-config', target: host, setting: 'PasswordAuthentication yes', scanEngine: 'ssh' },
        });
      }

      if (output.includes('permitemptypasswords yes')) {
        findings.push({
          title: `SSH Empty Passwords Permitted on ${host}`,
          severity: 'critical',
          description: 'The SSH daemon allows login with empty passwords. Any account with no password set is accessible without authentication.',
          remediation: 'Set "PermitEmptyPasswords no" in /etc/ssh/sshd_config immediately.',
          details: { checkModule: 'ssh-sshd-config', target: host, setting: 'PermitEmptyPasswords yes', scanEngine: 'ssh' },
        });
      }

      if (findings.length === 0 && result.stdout) {
        findings.push({
          title: `SSH Daemon Hardening OK on ${host}`,
          severity: 'info',
          description: 'SSHD configuration check passed. Root login and password auth appear to be appropriately restricted.',
          remediation: 'Continue following SSH hardening guidelines (CIS Benchmark SSH recommendations).',
          details: { checkModule: 'ssh-sshd-config', target: host, rawOutput: result.stdout, scanEngine: 'ssh' },
        });
      }

      return findings;
    } catch (err) {
      return [sshErrorResult(host, 'SSHD Config', err)];
    } finally {
      if (client) closeSshConnection(client);
    }
  },
};
