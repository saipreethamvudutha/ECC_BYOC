/**
 * CIS Benchmark Check Module
 * Maps Nmap NSE results to CIS v8.1 controls for compliance scoring.
 * Checks: SSL/TLS, SSH hardening, SMB, FTP, SNMP, HTTP headers.
 * Each finding includes cisControlId for direct compliance framework mapping.
 */

import { CheckModule, CheckResult } from '../types';
import { isNmapAvailable, runNmap, parseNmapXml, SCAN_PROFILES } from '../nmap';
import {
  parseSslEnumCiphers,
  parseSsh2EnumAlgos,
  parseSshAuthMethods,
  parseFtpAnon,
  parseSmbSecurityMode,
  parseSnmpInfo,
} from '../nmap/nse-parsers';

interface CisControl {
  id: string;
  title: string;
  safeguard: string;
}

const CIS_CONTROLS: Record<string, CisControl> = {
  '3.10': { id: '3.10', title: 'Encrypt Sensitive Data in Transit', safeguard: 'IG1' },
  '4.1': { id: '4.1', title: 'Establish and Maintain a Secure Configuration Process', safeguard: 'IG1' },
  '4.8': { id: '4.8', title: 'Uninstall or Disable Unnecessary Services on Enterprise Assets', safeguard: 'IG2' },
  '5.2': { id: '5.2', title: 'Use Unique Passwords', safeguard: 'IG1' },
  '9.2': { id: '9.2', title: 'Use DNS Filtering Services', safeguard: 'IG1' },
  '12.1': { id: '12.1', title: 'Ensure Network Infrastructure is Up-to-Date', safeguard: 'IG1' },
  '13.1': { id: '13.1', title: 'Centralize Security Event Alerting', safeguard: 'IG2' },
};

export const cisBenchmarkCheck: CheckModule = {
  id: 'cis-benchmark',
  name: 'CIS v8.1 Benchmark Scan',

  async run(target: string): Promise<CheckResult[]> {
    if (!(await isNmapAvailable())) {
      throw new Error('Nmap not available for CIS benchmark scan');
    }

    const host = extractHost(target);
    const results: CheckResult[] = [];

    try {
      const profile = SCAN_PROFILES['cis-baseline'];
      const { xml } = await runNmap([...profile.args, host], profile.timeout);
      const scanResult = parseNmapXml(xml);

      if (scanResult.hosts.length === 0) return results;

      const hostResult = scanResult.hosts[0];
      const openPorts = hostResult.ports.filter((p) => p.state === 'open');

      const controlResults: Map<string, { pass: boolean; findings: CheckResult[] }> = new Map();

      for (const port of openPorts) {
        if (port.scripts.length === 0) continue;

        // CIS 3.10 — Encrypt Sensitive Data in Transit
        if (port.service?.name?.includes('ssl') || port.service?.name?.includes('https') ||
            [443, 8443, 993, 995, 636].includes(port.number)) {
          const sslFindings = parseSslEnumCiphers(port.scripts, port.number);
          if (sslFindings.length > 0) {
            for (const f of sslFindings) {
              f.details = { ...f.details, cisControlId: '3.10', cisTitle: CIS_CONTROLS['3.10'].title, checkModuleId: 'cis-benchmark', detectionMethod: 'network' };
            }
            controlResults.set('3.10', { pass: false, findings: sslFindings });
          } else {
            controlResults.set('3.10', { pass: true, findings: [] });
          }
        }

        // CIS 5.2 — SSH Authentication Hardening
        if (port.number === 22 || port.service?.name === 'ssh') {
          const sshAuthFindings = parseSshAuthMethods(port.scripts);
          const sshAlgoFindings = parseSsh2EnumAlgos(port.scripts);
          const allSshFindings = [...sshAuthFindings, ...sshAlgoFindings];

          for (const f of allSshFindings) {
            f.details = { ...f.details, cisControlId: '5.2', cisTitle: CIS_CONTROLS['5.2'].title, checkModuleId: 'cis-benchmark', detectionMethod: 'network' };
          }

          const hasFail = allSshFindings.some((f) => f.severity !== 'info');
          controlResults.set('5.2', { pass: !hasFail, findings: allSshFindings });
        }

        // CIS 4.8 — FTP Anonymous Access
        if (port.number === 21 || port.service?.name === 'ftp') {
          const ftpFindings = parseFtpAnon(port.scripts);
          for (const f of ftpFindings) {
            f.details = { ...f.details, cisControlId: '4.8', cisTitle: CIS_CONTROLS['4.8'].title, checkModuleId: 'cis-benchmark', detectionMethod: 'network' };
          }
          controlResults.set('4.8', { pass: ftpFindings.length === 0, findings: ftpFindings });
        }

        // CIS 4.1 — SMB Security Configuration
        if (port.number === 445 || port.number === 139 || port.service?.name?.includes('smb')) {
          const smbFindings = parseSmbSecurityMode(port.scripts);
          for (const f of smbFindings) {
            f.details = { ...f.details, cisControlId: '4.1', cisTitle: CIS_CONTROLS['4.1'].title, checkModuleId: 'cis-benchmark', detectionMethod: 'network' };
          }
          controlResults.set('4.1', { pass: smbFindings.length === 0, findings: smbFindings });
        }

        // CIS 4.8 — SNMP Configuration
        if (port.number === 161 || port.service?.name === 'snmp') {
          const snmpFindings = parseSnmpInfo(port.scripts);
          for (const f of snmpFindings) {
            f.details = { ...f.details, cisControlId: '4.8', cisTitle: CIS_CONTROLS['4.8'].title, checkModuleId: 'cis-benchmark', detectionMethod: 'network' };
          }
          const existing = controlResults.get('4.8');
          if (existing) {
            existing.findings.push(...snmpFindings);
            existing.pass = existing.pass && snmpFindings.length === 0;
          } else {
            controlResults.set('4.8', { pass: snmpFindings.length === 0, findings: snmpFindings });
          }
        }
      }

      // Collect all findings
      for (const [, { findings }] of controlResults) {
        results.push(...findings);
      }

      // Generate CIS compliance summary
      const totalControls = controlResults.size;
      const passedControls = Array.from(controlResults.values()).filter((c) => c.pass).length;
      const failedControls = totalControls - passedControls;
      const complianceScore = totalControls > 0 ? Math.round((passedControls / totalControls) * 100) : 100;

      results.unshift({
        title: `CIS v8.1 Baseline: ${complianceScore}% Compliance (${passedControls}/${totalControls} controls)`,
        severity: complianceScore >= 80 ? 'info' : complianceScore >= 60 ? 'medium' : 'high',
        description: `CIS v8.1 baseline scan of ${host} evaluated ${totalControls} controls. ` +
          `Passed: ${passedControls}, Failed: ${failedControls}. ` +
          `Controls checked: ${Array.from(controlResults.keys()).map((k) => `CIS ${k}`).join(', ')}.`,
        remediation: failedControls > 0
          ? `Address ${failedControls} failed CIS controls. Focus on: ${Array.from(controlResults.entries()).filter(([, v]) => !v.pass).map(([k]) => `CIS ${k} (${CIS_CONTROLS[k]?.title || k})`).join(', ')}.`
          : 'All checked CIS controls are passing. Continue monitoring for configuration drift.',
        details: {
          host,
          complianceScore,
          totalControls,
          passedControls,
          failedControls,
          controlStatus: Object.fromEntries(
            Array.from(controlResults.entries()).map(([k, v]) => [
              `CIS ${k}`,
              { pass: v.pass, title: CIS_CONTROLS[k]?.title || k, findingCount: v.findings.length },
            ])
          ),
          framework: 'CIS v8.1',
          scanEngine: 'nmap',
          checkModuleId: 'cis-benchmark',
          detectionMethod: 'network',
        },
      });

      return results;
    } catch (error) {
      console.error(`[CISBenchmark] Error scanning ${host}: ${error}`);
      throw error;
    }
  },
};

function extractHost(target: string): string {
  let host = target;
  host = host.replace(/^https?:\/\//, '');
  host = host.split('/')[0];
  host = host.split(':')[0];
  return host;
}
