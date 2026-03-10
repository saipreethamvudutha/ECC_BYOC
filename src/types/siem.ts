/**
 * BYOC SIEM TypeScript Interfaces
 * Used by: SIEM API responses, SOC Dashboard UI, Detail pages
 */

// ─── SIEM Event (ECS-normalized) ────────────────────────────────

export interface SiemEventDetail {
  id: string;
  source: string;
  severity: string;
  category: string;
  title: string;
  details: Record<string, unknown>;
  sourceIp: string | null;
  sourcePort: number | null;
  destIp: string | null;
  destPort: number | null;
  protocol: string | null;
  direction: string | null;
  userName: string | null;
  userDomain: string | null;
  eventOutcome: string | null;
  eventAction: string | null;
  processName: string | null;
  processPid: number | null;
  processParentName: string | null;
  processExecutable: string | null;
  hostName: string | null;
  hostIp: string | null;
  geoCountry: string | null;
  geoCity: string | null;
  threatIntelHit: boolean;
  assetCriticality: string | null;
  dataset: string | null;
  module: string | null;
  logLevel: string | null;
  createdAt: string;
}

// ─── SIEM Alert (with MITRE & Scoring) ──────────────────────────

export interface SiemAlertItem {
  id: string;
  severity: string;
  title: string;
  description: string | null;
  status: string;
  assignedTo: string | null;
  assignedToName: string | null;
  mitreAttackId: string | null;
  mitreTactic: string | null;
  mitreTechnique: string | null;
  confidenceScore: number | null;
  priorityScore: number | null;
  incidentId: string | null;
  ruleName: string | null;
  createdAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
}

export interface SiemAlertDetail extends SiemAlertItem {
  assetCriticalityWeight: string | null;
  impactedUsers: string[];
  impactedAssets: string[];
  relatedAlertIds: string[];
  threatIntel: Record<string, unknown>;
  containedAt: string | null;
  closedAt: string | null;
  event: SiemEventDetail | null;
  rule: SiemRuleItem | null;
}

// ─── SIEM Rule ──────────────────────────────────────────────────

export interface SiemRuleItem {
  id: string;
  name: string;
  description: string | null;
  ruleType: string;
  severity: string;
  isActive: boolean;
  mitreAttackId: string | null;
  mitreTactic: string | null;
  mitreTechnique: string | null;
  confidenceLevel: number;
  falsePositiveRate: number;
  truePositiveCount: number;
  falsePositiveCount: number;
  lastTriggeredAt: string | null;
  category: string | null;
  dataSources: string[];
  alertCount?: number;
  createdAt: string;
}

export interface SiemRuleDetail extends SiemRuleItem {
  condition: Record<string, unknown>;
  createdById: string | null;
}

// ─── SIEM Incident (Case Management) ────────────────────────────

export interface SiemIncidentItem {
  id: string;
  title: string;
  description: string | null;
  severity: string;
  status: string;
  priority: string;
  assignedTo: string | null;
  assignedToName: string | null;
  alertCount: number;
  slaBreached: boolean;
  detectedAt: string;
  createdAt: string;
}

export interface TimelineEntry {
  timestamp: string;
  action: string;
  actor: string;
  details: string;
}

export interface EvidenceItem {
  type: string;
  name: string;
  addedAt: string;
  addedBy: string;
}

export interface RemediationStep {
  step: string;
  status: "pending" | "in_progress" | "completed";
  assignee: string | null;
  completedAt: string | null;
}

export interface SiemIncidentDetail extends SiemIncidentItem {
  escalatedBy: string | null;
  escalatedByName: string | null;
  impactSummary: string | null;
  impactedUsers: string[];
  impactedAssets: string[];
  rootCause: string | null;
  remediationSteps: RemediationStep[];
  timeline: TimelineEntry[];
  evidence: EvidenceItem[];
  mitreTactics: string[];
  mitreTechniques: string[];
  complianceMapping: { framework: string; control: string }[];
  acknowledgedAt: string | null;
  containedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  alerts: SiemAlertItem[];
}

// ─── SOC Metrics ────────────────────────────────────────────────

export interface SocMetrics {
  securityPostureScore: number;
  openAlerts: number;
  activeIncidents: number;
  mttd: number; // Mean Time to Detect (minutes)
  mttr: number; // Mean Time to Respond (hours)
  events24h: number;
  alertsByHour: { hour: string; count: number }[];
  severityDistribution: { severity: string; count: number }[];
  topRules: { name: string; mitreAttackId: string; alertCount: number }[];
  topAssets: { asset: string; alertCount: number }[];
  recentAlerts: SiemAlertItem[];
}
