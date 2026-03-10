/**
 * BYOC Core Detection Rule Library
 *
 * 12 detection rules matching the client scope document (SIEM Step 5).
 * Each rule maps to a specific MITRE ATT&CK technique.
 *
 * Used by: seed script, rule management UI, scanner integration.
 */

export interface DetectionRuleDef {
  name: string;
  description: string;
  ruleType: "correlation" | "behavioral" | "threat_intel" | "anomaly";
  severity: "critical" | "high" | "medium" | "low";
  confidenceLevel: number;
  mitreAttackId: string;
  mitreTactic: string;
  mitreTechnique: string;
  category: string;
  dataSources: string[];
  condition: Record<string, unknown>;
}

export const DETECTION_RULES: DetectionRuleDef[] = [
  // ── 1. Brute Force / Password Spray (T1110) ──
  {
    name: "Brute Force / Password Spray",
    description: "Detects >=10 authentication failures across >=3 accounts from same source IP in 10 minutes. Indicates credential stuffing or password spray attack.",
    ruleType: "correlation",
    severity: "high",
    confidenceLevel: 85,
    mitreAttackId: "T1110",
    mitreTactic: "Credential Access",
    mitreTechnique: "Brute Force / Password Spray",
    category: "authentication",
    dataSources: ["identity", "application", "endpoint"],
    condition: {
      type: "threshold",
      field: "eventAction",
      value: "login_failed",
      threshold: 10,
      uniqueAccounts: 3,
      window: "10m",
      groupBy: "sourceIp",
    },
  },

  // ── 2. Impossible Travel (T1078) ──
  {
    name: "Impossible Travel",
    description: "Same user authenticates from two geographic locations physically impossible to travel between in the elapsed time. Indicates compromised credentials.",
    ruleType: "behavioral",
    severity: "high",
    confidenceLevel: 80,
    mitreAttackId: "T1078",
    mitreTactic: "Initial Access",
    mitreTechnique: "Valid Accounts — Impossible Travel",
    category: "authentication",
    dataSources: ["identity", "application"],
    condition: {
      type: "geo_velocity",
      field: "userName",
      maxSpeedKmh: 900,
      window: "24h",
      requireSuccess: true,
    },
  },

  // ── 3. New Admin Account Created (T1136) ──
  {
    name: "New Admin Account Created",
    description: "New account created AND added to privileged group within 24 hours, especially after-hours. Indicates persistence attempt.",
    ruleType: "correlation",
    severity: "high",
    confidenceLevel: 90,
    mitreAttackId: "T1136",
    mitreTactic: "Persistence",
    mitreTechnique: "Create Account",
    category: "authentication",
    dataSources: ["identity", "endpoint"],
    condition: {
      type: "sequence",
      events: [
        { eventAction: "account_created" },
        { eventAction: "privilege_escalation", group: "Administrators" },
      ],
      window: "24h",
      afterHoursBoost: true,
    },
  },

  // ── 4. Scheduled Task / Cron Creation (T1053) ──
  {
    name: "Scheduled Task / Cron Creation",
    description: "New scheduled task or cron job created by a non-admin user or on a non-standard system. Common persistence mechanism.",
    ruleType: "correlation",
    severity: "medium",
    confidenceLevel: 70,
    mitreAttackId: "T1053",
    mitreTactic: "Execution",
    mitreTechnique: "Scheduled Task/Job",
    category: "process",
    dataSources: ["endpoint"],
    condition: {
      type: "process_match",
      processName: ["schtasks.exe", "at.exe", "crontab"],
      excludeAdmins: true,
      excludeServers: false,
    },
  },

  // ── 5. PowerShell Encoded Command (T1059.001) ──
  {
    name: "PowerShell Encoded Command",
    description: "PowerShell process launched with -EncodedCommand or -Enc flags. Common malware obfuscation technique to hide malicious scripts.",
    ruleType: "correlation",
    severity: "high",
    confidenceLevel: 88,
    mitreAttackId: "T1059.001",
    mitreTactic: "Execution",
    mitreTechnique: "Command and Scripting Interpreter: PowerShell",
    category: "process",
    dataSources: ["endpoint", "edr"],
    condition: {
      type: "process_match",
      processName: ["powershell.exe", "pwsh.exe"],
      commandLineContains: ["-EncodedCommand", "-Enc ", "-ec ", "-e "],
    },
  },

  // ── 6. LSASS Memory Access (T1003.001) ──
  {
    name: "LSASS Memory Access",
    description: "Non-system process opening LSASS.exe with PROCESS_VM_READ access. Indicates credential dumping attempt (Mimikatz, comsvcs.dll).",
    ruleType: "correlation",
    severity: "critical",
    confidenceLevel: 95,
    mitreAttackId: "T1003.001",
    mitreTactic: "Credential Access",
    mitreTechnique: "OS Credential Dumping: LSASS Memory",
    category: "process",
    dataSources: ["endpoint", "edr"],
    condition: {
      type: "process_access",
      targetProcess: "lsass.exe",
      accessRights: "PROCESS_VM_READ",
      excludeProcesses: ["svchost.exe", "csrss.exe", "MsMpEng.exe"],
    },
  },

  // ── 7. Lateral Movement via PsExec/WMI (T1021) ──
  {
    name: "Lateral Movement via PsExec/WMI",
    description: "Remote process execution via PsExec, WMI, or SMB from a workstation (not server) to another host. Indicates lateral movement.",
    ruleType: "correlation",
    severity: "high",
    confidenceLevel: 82,
    mitreAttackId: "T1021",
    mitreTactic: "Lateral Movement",
    mitreTechnique: "Remote Services",
    category: "lateral_movement",
    dataSources: ["endpoint", "network", "edr"],
    condition: {
      type: "network_process",
      processName: ["PsExec.exe", "PsExec64.exe", "wmic.exe"],
      destPorts: [445, 135, 5985, 5986],
      sourceType: "workstation",
    },
  },

  // ── 8. DNS Tunneling (T1071.004) ──
  {
    name: "DNS Tunneling",
    description: "Single DNS query longer than 100 chars, or >1000 DNS queries/min to same domain, high entropy domains. Indicates data exfiltration via DNS.",
    ruleType: "anomaly",
    severity: "high",
    confidenceLevel: 75,
    mitreAttackId: "T1071.004",
    mitreTactic: "Command and Control",
    mitreTechnique: "Application Layer Protocol: DNS",
    category: "dns",
    dataSources: ["dns", "network", "firewall"],
    condition: {
      type: "dns_anomaly",
      maxQueryLength: 100,
      maxQueriesPerMin: 1000,
      entropyThreshold: 3.5,
      groupBy: "domain",
    },
  },

  // ── 9. Data Exfiltration — Large Upload (T1048) ──
  {
    name: "Data Exfiltration — Large Upload",
    description: "Outbound data transfer >1 GB to a non-corporate IP in a single session, especially to cloud storage providers. Indicates data theft.",
    ruleType: "anomaly",
    severity: "critical",
    confidenceLevel: 78,
    mitreAttackId: "T1048",
    mitreTactic: "Exfiltration",
    mitreTechnique: "Exfiltration Over Alternative Protocol",
    category: "data_exfil",
    dataSources: ["network", "firewall", "cloud"],
    condition: {
      type: "volume_threshold",
      direction: "outbound",
      thresholdBytes: 1073741824, // 1 GB
      excludeCorporateIps: true,
      window: "1h",
    },
  },

  // ── 10. C2 Beaconing (T1071) ──
  {
    name: "C2 Beaconing",
    description: "Regular interval outbound connections (jitter <10%) to same external IP over >1 hour on non-standard ports. Indicates command-and-control communication.",
    ruleType: "behavioral",
    severity: "critical",
    confidenceLevel: 72,
    mitreAttackId: "T1071",
    mitreTactic: "Command and Control",
    mitreTechnique: "Application Layer Protocol",
    category: "network",
    dataSources: ["network", "firewall", "endpoint"],
    condition: {
      type: "beacon_detection",
      jitterThreshold: 0.1,
      minDuration: "1h",
      excludeStandardPorts: [80, 443, 53],
      groupBy: "destIp",
    },
  },

  // ── 11. Cloud IAM Privilege Escalation (T1078.004) ──
  {
    name: "Cloud IAM Privilege Escalation",
    description: "IAM policy attached that allows iam:PassRole or sts:AssumeRole with wildcard (*) resource. Indicates unauthorized privilege escalation in cloud.",
    ruleType: "correlation",
    severity: "critical",
    confidenceLevel: 92,
    mitreAttackId: "T1078.004",
    mitreTactic: "Privilege Escalation",
    mitreTechnique: "Valid Accounts: Cloud Accounts",
    category: "cloud_iam",
    dataSources: ["cloud"],
    condition: {
      type: "iam_policy",
      dangerousActions: ["iam:PassRole", "sts:AssumeRole", "iam:CreatePolicyVersion", "iam:AttachUserPolicy"],
      resource: "*",
      excludeServiceAccounts: true,
    },
  },

  // ── 12. Ransomware Indicators (T1486) ──
  {
    name: "Ransomware Indicators",
    description: "Mass file rename/extension change (>100 files/min) + shadow copy deletion + desktop.ini modification. Strong ransomware indicators.",
    ruleType: "correlation",
    severity: "critical",
    confidenceLevel: 96,
    mitreAttackId: "T1486",
    mitreTactic: "Impact",
    mitreTechnique: "Data Encrypted for Impact",
    category: "malware",
    dataSources: ["endpoint", "edr"],
    condition: {
      type: "ransomware_pattern",
      indicators: [
        { type: "mass_rename", threshold: 100, window: "1m" },
        { type: "shadow_copy_delete", command: "vssadmin delete shadows" },
        { type: "ransom_note", filePatterns: ["README.txt", "DECRYPT_*.txt", "HOW_TO_*.html"] },
      ],
      minIndicators: 2,
    },
  },
];

/**
 * Get MITRE ATT&CK tactic color for UI display.
 */
export function getMitreTacticColor(tactic: string): string {
  const colors: Record<string, string> = {
    "Initial Access": "text-blue-400",
    "Execution": "text-orange-400",
    "Persistence": "text-yellow-400",
    "Privilege Escalation": "text-red-400",
    "Credential Access": "text-purple-400",
    "Lateral Movement": "text-pink-400",
    "Command and Control": "text-rose-400",
    "Exfiltration": "text-red-500",
    "Impact": "text-red-600",
  };
  return colors[tactic] || "text-slate-400";
}
