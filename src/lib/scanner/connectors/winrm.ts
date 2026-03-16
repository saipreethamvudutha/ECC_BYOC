/**
 * WinRM Authenticated Check Modules (7 total)
 * Each implements CheckModule for Windows system auditing via WinRM.
 * If config.credential is absent or credentialType !== winrm_password, returns [].
 * If WinRM fails, returns single info-severity finding with error description.
 */

import type { CheckModule, CheckResult } from '../types';
import type { PlainCredential } from '../vault';
import { runWinRMCommand } from './winrm-client';

function credentialFromConfig(config?: Record<string, unknown>): PlainCredential | null {
  if (!config?.credential) return null;
  const cred = config.credential as PlainCredential;
  if (!cred.credentialType.startsWith('winrm')) return null;
  return cred;
}

function winrmErrorResult(target: string, checkName: string, error: unknown): CheckResult {
  const msg = error instanceof Error ? error.message : String(error);
  return {
    title: `WinRM Auth Failed: ${checkName} on ${target}`,
    severity: 'info',
    description: `Could not connect via WinRM to perform ${checkName} check. Error: ${msg}`,
    remediation: 'Verify WinRM credentials, ensure WinRM is enabled (winrm quickconfig), and check firewall allows port 5985/5986.',
    details: { checkModule: `winrm-${checkName.toLowerCase().replace(/\s+/g, '-')}`, target, error: msg },
  };
}

function buildWinRMConfig(host: string, credential: PlainCredential) {
  return {
    host,
    port: credential.defaultPort ?? undefined,
    scheme: (credential.winrmScheme as 'http' | 'https') ?? 'http',
    username: credential.username,
    password: credential.secret,
  };
}

function extractHost(target: string): string {
  return target.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
}

// ─── 1. OS Information ───────────────────────────────────────────
export const winrmOsInfoCheck: CheckModule = {
  id: 'winrm-os-info',
  name: 'WinRM: OS Information',

  async run(target: string, config?: Record<string, unknown>): Promise<CheckResult[]> {
    const credential = credentialFromConfig(config);
    if (!credential) return [];
    const host = extractHost(target);
    try {
      const result = await runWinRMCommand(
        buildWinRMConfig(host, credential),
        "Get-WmiObject Win32_OperatingSystem | Select-Object Caption,Version,BuildNumber,ServicePackMajorVersion | ConvertTo-Json"
      );
      return [{
        title: `Windows OS Inventory: ${host}`,
        severity: 'info',
        description: `WinRM authenticated OS discovery for ${host}.`,
        remediation: 'Ensure Windows is updated to the latest supported version.',
        details: { checkModule: 'winrm-os-info', target: host, rawOutput: result.stdout, scanEngine: 'winrm' },
      }];
    } catch (err) {
      return [winrmErrorResult(host, 'OS Info', err)];
    }
  },
};

// ─── 2. Local Users ─────────────────────────────────────────────
export const winrmLocalUsersCheck: CheckModule = {
  id: 'winrm-local-users',
  name: 'WinRM: Local Users',

  async run(target: string, config?: Record<string, unknown>): Promise<CheckResult[]> {
    const credential = credentialFromConfig(config);
    if (!credential) return [];
    const host = extractHost(target);
    try {
      const result = await runWinRMCommand(
        buildWinRMConfig(host, credential),
        "Get-LocalUser | Select-Object Name,Enabled,LastLogon,PasswordExpires | ConvertTo-Json"
      );
      return [{
        title: `Local User Accounts on ${host}`,
        severity: 'info',
        description: `WinRM authenticated local user account inventory for ${host}.`,
        remediation: 'Disable or remove unused local accounts. Enforce account expiration policies.',
        details: { checkModule: 'winrm-local-users', target: host, rawOutput: result.stdout, scanEngine: 'winrm' },
      }];
    } catch (err) {
      return [winrmErrorResult(host, 'Local Users', err)];
    }
  },
};

// ─── 3. Local Administrators ────────────────────────────────────
export const winrmLocalAdminsCheck: CheckModule = {
  id: 'winrm-local-admins',
  name: 'WinRM: Local Administrators',

  async run(target: string, config?: Record<string, unknown>): Promise<CheckResult[]> {
    const credential = credentialFromConfig(config);
    if (!credential) return [];
    const host = extractHost(target);
    try {
      const result = await runWinRMCommand(
        buildWinRMConfig(host, credential),
        "Get-LocalGroupMember -Group 'Administrators' | Select-Object Name,PrincipalSource,ObjectClass | ConvertTo-Json"
      );
      return [{
        title: `Local Administrators on ${host}`,
        severity: 'info',
        description: `Members of the local Administrators group on ${host}.`,
        remediation: 'Review administrator group membership. Follow principle of least privilege.',
        details: { checkModule: 'winrm-local-admins', target: host, rawOutput: result.stdout, scanEngine: 'winrm' },
      }];
    } catch (err) {
      return [winrmErrorResult(host, 'Local Admins', err)];
    }
  },
};

// ─── 4. Running Services ────────────────────────────────────────
export const winrmServicesCheck: CheckModule = {
  id: 'winrm-services',
  name: 'WinRM: Running Services',

  async run(target: string, config?: Record<string, unknown>): Promise<CheckResult[]> {
    const credential = credentialFromConfig(config);
    if (!credential) return [];
    const host = extractHost(target);
    try {
      const result = await runWinRMCommand(
        buildWinRMConfig(host, credential),
        "Get-Service | Where-Object {$_.Status -eq 'Running'} | Select-Object Name,DisplayName,StartType | ConvertTo-Json"
      );
      return [{
        title: `Running Services on ${host}`,
        severity: 'info',
        description: `Authenticated inventory of running Windows services on ${host}.`,
        remediation: 'Disable unnecessary services to reduce attack surface.',
        details: { checkModule: 'winrm-services', target: host, rawOutput: result.stdout, scanEngine: 'winrm' },
      }];
    } catch (err) {
      return [winrmErrorResult(host, 'Services', err)];
    }
  },
};

// ─── 5. Installed Software ──────────────────────────────────────
export const winrmInstalledSoftwareCheck: CheckModule = {
  id: 'winrm-installed-software',
  name: 'WinRM: Installed Software',

  async run(target: string, config?: Record<string, unknown>): Promise<CheckResult[]> {
    const credential = credentialFromConfig(config);
    if (!credential) return [];
    const host = extractHost(target);
    try {
      const result = await runWinRMCommand(
        buildWinRMConfig(host, credential),
        "Get-ItemProperty HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\* | Where-Object {$_.DisplayName} | Select-Object DisplayName,DisplayVersion,Publisher | ConvertTo-Json"
      );
      return [{
        title: `Installed Software on ${host}`,
        severity: 'info',
        description: `Software inventory from Windows registry for ${host}.`,
        remediation: 'Uninstall unsupported or end-of-life software. Keep all applications updated.',
        details: { checkModule: 'winrm-installed-software', target: host, rawOutput: result.stdout.substring(0, 5000), scanEngine: 'winrm' },
      }];
    } catch (err) {
      return [winrmErrorResult(host, 'Installed Software', err)];
    }
  },
};

// ─── 6. Firewall Rules ──────────────────────────────────────────
export const winrmFirewallRulesCheck: CheckModule = {
  id: 'winrm-firewall-rules',
  name: 'WinRM: Firewall Rules',

  async run(target: string, config?: Record<string, unknown>): Promise<CheckResult[]> {
    const credential = credentialFromConfig(config);
    if (!credential) return [];
    const host = extractHost(target);
    try {
      const result = await runWinRMCommand(
        buildWinRMConfig(host, credential),
        "Get-NetFirewallRule | Where-Object {$_.Enabled -eq $true -and $_.Direction -eq 'Inbound' -and $_.Action -eq 'Allow'} | Select-Object DisplayName,Profile,Protocol,LocalPort | ConvertTo-Json"
      );
      return [{
        title: `Inbound Firewall Rules on ${host}`,
        severity: 'info',
        description: `Active inbound allow firewall rules on ${host}.`,
        remediation: 'Review all inbound allow rules. Disable rules that permit unnecessary access.',
        details: { checkModule: 'winrm-firewall-rules', target: host, rawOutput: result.stdout, scanEngine: 'winrm' },
      }];
    } catch (err) {
      return [winrmErrorResult(host, 'Firewall Rules', err)];
    }
  },
};

// ─── 7. Patch Status ────────────────────────────────────────────
export const winrmPatchesCheck: CheckModule = {
  id: 'winrm-patches',
  name: 'WinRM: Patch Status',

  async run(target: string, config?: Record<string, unknown>): Promise<CheckResult[]> {
    const credential = credentialFromConfig(config);
    if (!credential) return [];
    const host = extractHost(target);
    try {
      const result = await runWinRMCommand(
        buildWinRMConfig(host, credential),
        "Get-HotFix | Sort-Object InstalledOn -Descending | Select-Object -First 20 | Select-Object HotFixID,Description,InstalledOn | ConvertTo-Json"
      );

      const findings: CheckResult[] = [];

      // Check if last patch was more than 30 days ago
      try {
        const patches = JSON.parse(result.stdout || '[]');
        const patchArray = Array.isArray(patches) ? patches : [patches];
        if (patchArray.length > 0 && patchArray[0].InstalledOn) {
          const lastPatch = new Date(patchArray[0].InstalledOn);
          const daysSinceLastPatch = Math.floor((Date.now() - lastPatch.getTime()) / (1000 * 60 * 60 * 24));
          if (daysSinceLastPatch > 30) {
            findings.push({
              title: `No Patches Applied in ${daysSinceLastPatch} Days on ${host}`,
              severity: 'high',
              description: `The last Windows patch was applied ${daysSinceLastPatch} days ago. Systems should be patched at least monthly.`,
              remediation: 'Apply all pending Windows updates immediately. Enable automatic updates or establish a regular patch management cycle.',
              details: { checkModule: 'winrm-patches', target: host, daysSinceLastPatch, lastPatchDate: lastPatch.toISOString(), scanEngine: 'winrm' },
            });
          }
        }
      } catch {
        // JSON parse failed, still return raw output
      }

      findings.push({
        title: `Patch History on ${host}`,
        severity: 'info',
        description: `Recent Windows patch history for ${host}.`,
        remediation: 'Maintain a regular patching schedule.',
        details: { checkModule: 'winrm-patches', target: host, rawOutput: result.stdout, scanEngine: 'winrm' },
      });

      return findings;
    } catch (err) {
      return [winrmErrorResult(host, 'Patches', err)];
    }
  },
};
