/**
 * Scanner Engine Type Definitions
 *
 * Core interfaces for the BYOC vulnerability scanner.
 * All check modules implement CheckModule; the engine orchestrates execution.
 */

export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type FindingStatus = "open" | "acknowledged" | "resolved" | "false_positive";

export interface CheckResult {
  title: string;
  severity: Severity;
  description: string;
  remediation: string;
  cveId?: string;
  cvssScore?: number;
  details: Record<string, unknown>;
}

export interface CheckModule {
  id: string;
  name: string;
  run(target: string, config?: Record<string, unknown>): Promise<CheckResult[]>;
}

export interface ScanProgress {
  completedChecks: string[];
  currentBatch: number;
  totalBatches: number;
  totalFindings: number;
  checkResults: Record<string, number>; // checkId → finding count
}

export interface BatchResult {
  status: "running" | "completed" | "failed";
  progress: ScanProgress;
  newFindings: number;
}

export interface VulnEntry {
  id: string;
  cveId?: string;
  title: string;
  severity: Severity;
  cvssScore: number;
  description: string;
  remediation: string;
  category: string;
}

export interface ScannerAdapter {
  name: string;
  getCheckModules(scanType: string): CheckModule[];
}
