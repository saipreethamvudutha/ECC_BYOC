export interface DashboardStats {
  totalAssets: number;
  criticalVulnerabilities: number;
  activeScans: number;
  complianceScore: number;
  openAlerts: number;
  pendingAiActions: number;
  riskScore: number;
  totalFindings: number;
}

export interface SeverityCount {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

export interface ComplianceOverview {
  framework: string;
  version: string;
  totalControls: number;
  compliant: number;
  partiallyCompliant: number;
  nonCompliant: number;
  notAssessed: number;
  score: number;
}

export interface RecentActivity {
  id: string;
  action: string;
  actorName: string;
  actorType: string;
  result: string;
  details: string;
  createdAt: string;
}

export type ComplianceStatus =
  | "compliant"
  | "partially_compliant"
  | "non_compliant"
  | "not_assessed"
  | "not_applicable";

export type Severity = "critical" | "high" | "medium" | "low" | "info";
