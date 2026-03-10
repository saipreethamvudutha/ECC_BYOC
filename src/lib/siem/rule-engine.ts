/**
 * BYOC SIEM Detection Rule Evaluation Engine
 *
 * Phase 11: Makes the 12 MITRE ATT&CK-mapped detection rules operational.
 * Evaluates incoming events against active rules and returns matches.
 *
 * Design: Synchronous evaluation within API request lifecycle.
 * Most rules use in-memory field matching (no DB queries).
 * Only threshold, sequence, geo_velocity, and beacon_detection need historical lookups.
 */

import { prisma } from "@/lib/prisma";

// ─── Types ───────────────────────────────────────────────────────

export interface RuleMatch {
  ruleId: string;
  ruleName: string;
  severity: string;
  confidence: number;
  mitreAttackId: string | null;
  mitreTactic: string | null;
  mitreTechnique: string | null;
  matchDetails: Record<string, unknown>;
}

interface SiemEventInput {
  id: string;
  tenantId: string;
  source: string;
  severity: string;
  category: string;
  title: string;
  details: string;
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
  createdAt: Date;
}

interface SiemRuleInput {
  id: string;
  tenantId: string;
  name: string;
  severity: string;
  ruleType: string;
  condition: string; // JSON
  isActive: boolean;
  confidenceLevel: number;
  mitreAttackId: string | null;
  mitreTactic: string | null;
  mitreTechnique: string | null;
  category: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────

/** Parse time window string ("10m", "1h", "24h", "1d") to milliseconds */
export function parseWindow(window: string): number {
  const match = window.match(/^(\d+)(m|h|d)$/);
  if (!match) return 600000; // default 10 minutes
  const num = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = { m: 60000, h: 3600000, d: 86400000 };
  return num * (multipliers[unit] || 60000);
}

/** Safely parse JSON condition from rule */
function parseCondition(conditionStr: string): Record<string, unknown> {
  try {
    return JSON.parse(conditionStr);
  } catch {
    return {};
  }
}

/** Safely parse event details JSON */
function parseDetails(detailsStr: string): Record<string, unknown> {
  try {
    return JSON.parse(detailsStr);
  } catch {
    return {};
  }
}

/** Compute priority score from severity, confidence, and asset criticality */
export function computePriority(
  severity: string,
  confidence: number,
  assetCriticality: string | null
): number {
  const severityWeights: Record<string, number> = {
    critical: 100,
    high: 75,
    medium: 50,
    low: 25,
  };
  const criticalityWeights: Record<string, number> = {
    critical: 1.5,
    high: 1.2,
    medium: 1.0,
    low: 0.8,
  };
  const sevScore = severityWeights[severity] || 50;
  const critScore = criticalityWeights[assetCriticality || "medium"] || 1.0;
  return Math.min(100, Math.round(sevScore * (confidence / 100) * critScore));
}

// ─── Rule Evaluators ─────────────────────────────────────────────

/**
 * threshold: Count events matching field=value within time window.
 * If count >= threshold, trigger.
 */
async function evaluateThreshold(
  event: SiemEventInput,
  condition: Record<string, unknown>
): Promise<RuleMatch | null> {
  const field = condition.field as string;
  const value = condition.value as string;
  const threshold = (condition.threshold as number) || 10;
  const window = parseWindow((condition.window as string) || "10m");
  const groupBy = condition.groupBy as string | undefined;

  // Check if this event even matches the field/value
  const eventField = (event as unknown as Record<string, unknown>)[field];
  const details = parseDetails(event.details);
  const detailField = details[field];
  if (eventField !== value && detailField !== value) return null;

  // Count matching events in the time window
  const windowStart = new Date(Date.now() - window);
  const where: Record<string, unknown> = {
    tenantId: event.tenantId,
    createdAt: { gte: windowStart },
  };

  // Add field filter
  if (field === "eventAction") where.eventAction = value;
  else if (field === "category") where.category = value;
  else if (field === "severity") where.severity = value;
  else if (field === "source") where.source = value;

  // Add groupBy constraint (e.g., same sourceIp)
  if (groupBy && (event as unknown as Record<string, unknown>)[groupBy]) {
    where[groupBy] = (event as unknown as Record<string, unknown>)[groupBy];
  }

  const count = await prisma.siemEvent.count({ where: where as any });

  if (count >= threshold) {
    return {
      ruleId: "",
      ruleName: "",
      severity: "",
      confidence: 0,
      mitreAttackId: null,
      mitreTactic: null,
      mitreTechnique: null,
      matchDetails: {
        reason: `Threshold exceeded: ${count} events (threshold: ${threshold}) in ${condition.window}`,
        count,
        threshold,
        window: condition.window,
        groupBy: groupBy
          ? `${groupBy}=${(event as unknown as Record<string, unknown>)[groupBy]}`
          : undefined,
      },
    };
  }

  return null;
}

/**
 * sequence: Check if required event actions exist in window.
 * E.g., account_created then privilege_escalation for same userName.
 */
async function evaluateSequence(
  event: SiemEventInput,
  condition: Record<string, unknown>
): Promise<RuleMatch | null> {
  const events = condition.events as Array<Record<string, string>> | undefined;
  if (!events || events.length === 0) return null;
  const window = parseWindow((condition.window as string) || "24h");

  // Check if the current event matches the LAST event in the sequence
  const lastSeqEvent = events[events.length - 1];
  if (
    lastSeqEvent.eventAction &&
    event.eventAction !== lastSeqEvent.eventAction
  )
    return null;

  // Look for preceding events in the sequence
  const windowStart = new Date(Date.now() - window);
  for (let i = 0; i < events.length - 1; i++) {
    const seqDef = events[i];
    const where: Record<string, unknown> = {
      tenantId: event.tenantId,
      createdAt: { gte: windowStart },
    };
    if (seqDef.eventAction) where.eventAction = seqDef.eventAction;
    // Same user context
    if (event.userName) where.userName = event.userName;

    const found = await prisma.siemEvent.findFirst({ where: where as any });
    if (!found) return null;
  }

  return {
    ruleId: "",
    ruleName: "",
    severity: "",
    confidence: 0,
    mitreAttackId: null,
    mitreTactic: null,
    mitreTechnique: null,
    matchDetails: {
      reason: `Event sequence detected: ${events.map((e) => e.eventAction).join(" → ")}`,
      user: event.userName,
    },
  };
}

/**
 * process_match: Match processName against a list of known-bad processes.
 * Optionally check commandLineContains in details.
 */
function evaluateProcessMatch(
  event: SiemEventInput,
  condition: Record<string, unknown>
): RuleMatch | null {
  const processNames = condition.processName as string[] | undefined;
  if (!processNames || !event.processName) return null;

  const matched = processNames.some(
    (p) => event.processName?.toLowerCase() === p.toLowerCase()
  );
  if (!matched) return null;

  // Optional command-line check
  const cmdContains = condition.commandLineContains as string[] | undefined;
  if (cmdContains) {
    const details = parseDetails(event.details);
    const cmdLine =
      (details.commandLine as string) || event.processExecutable || "";
    const cmdMatched = cmdContains.some((c) =>
      cmdLine.toLowerCase().includes(c.toLowerCase())
    );
    if (!cmdMatched) return null;
  }

  return {
    ruleId: "",
    ruleName: "",
    severity: "",
    confidence: 0,
    mitreAttackId: null,
    mitreTactic: null,
    mitreTechnique: null,
    matchDetails: {
      reason: `Process match: ${event.processName}`,
      processName: event.processName,
      pid: event.processPid,
    },
  };
}

/**
 * process_access: Detect access to sensitive processes (e.g., lsass.exe).
 */
function evaluateProcessAccess(
  event: SiemEventInput,
  condition: Record<string, unknown>
): RuleMatch | null {
  const targetProcess = (condition.targetProcess as string)?.toLowerCase();
  if (!targetProcess) return null;

  // Check if the event title/details mention the target process
  const title = event.title.toLowerCase();
  const details = parseDetails(event.details);
  const detailStr = JSON.stringify(details).toLowerCase();

  const mentionsTarget =
    title.includes(targetProcess) || detailStr.includes(targetProcess);
  if (!mentionsTarget) return null;

  // Check exclusions
  const excludeProcesses = condition.excludeProcesses as string[] | undefined;
  if (excludeProcesses && event.processName) {
    const isExcluded = excludeProcesses.some(
      (p) => event.processName?.toLowerCase() === p.toLowerCase()
    );
    if (isExcluded) return null;
  }

  return {
    ruleId: "",
    ruleName: "",
    severity: "",
    confidence: 0,
    mitreAttackId: null,
    mitreTactic: null,
    mitreTechnique: null,
    matchDetails: {
      reason: `Sensitive process access: ${targetProcess} accessed by ${event.processName || "unknown"}`,
      sourceProcess: event.processName,
      targetProcess,
    },
  };
}

/**
 * network_process: Match process making network connections on suspicious ports.
 */
function evaluateNetworkProcess(
  event: SiemEventInput,
  condition: Record<string, unknown>
): RuleMatch | null {
  const processNames = condition.processName as string[] | undefined;
  const destPorts = condition.destPorts as number[] | undefined;
  if (!processNames || !event.processName) return null;

  const procMatch = processNames.some(
    (p) => event.processName?.toLowerCase() === p.toLowerCase()
  );
  if (!procMatch) return null;

  // If destPorts specified, check if event destPort matches
  if (destPorts && event.destPort) {
    if (!destPorts.includes(event.destPort)) return null;
  }

  return {
    ruleId: "",
    ruleName: "",
    severity: "",
    confidence: 0,
    mitreAttackId: null,
    mitreTactic: null,
    mitreTechnique: null,
    matchDetails: {
      reason: `Lateral movement tool detected: ${event.processName} → port ${event.destPort}`,
      processName: event.processName,
      destIp: event.destIp,
      destPort: event.destPort,
    },
  };
}

/**
 * geo_velocity: Detect impossible travel by comparing login locations.
 */
async function evaluateGeoVelocity(
  event: SiemEventInput,
  condition: Record<string, unknown>
): Promise<RuleMatch | null> {
  // Only applies to successful authentication events
  if (!event.userName || !event.geoCountry) return null;
  const requireSuccess = condition.requireSuccess as boolean;
  if (requireSuccess && event.eventOutcome !== "success") return null;

  const window = parseWindow((condition.window as string) || "24h");
  const windowStart = new Date(Date.now() - window);

  // Find previous successful login for same user
  const prevLogin = await prisma.siemEvent.findFirst({
    where: {
      tenantId: event.tenantId,
      userName: event.userName,
      eventOutcome: "success",
      geoCountry: { not: null },
      category: "authentication",
      createdAt: { gte: windowStart },
      id: { not: event.id },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!prevLogin || !prevLogin.geoCountry) return null;

  // If different country → impossible travel alert
  if (prevLogin.geoCountry !== event.geoCountry) {
    return {
      ruleId: "",
      ruleName: "",
      severity: "",
      confidence: 0,
      mitreAttackId: null,
      mitreTactic: null,
      mitreTechnique: null,
      matchDetails: {
        reason: `Impossible travel: ${prevLogin.geoCountry} → ${event.geoCountry} for user ${event.userName}`,
        previousCountry: prevLogin.geoCountry,
        currentCountry: event.geoCountry,
        user: event.userName,
        timeDeltaMs: event.createdAt.getTime() - prevLogin.createdAt.getTime(),
      },
    };
  }

  return null;
}

/**
 * dns_anomaly: Detect DNS tunneling by checking query characteristics.
 */
function evaluateDnsAnomaly(
  event: SiemEventInput,
  condition: Record<string, unknown>
): RuleMatch | null {
  if (event.category !== "dns") return null;

  const maxQueryLength = (condition.maxQueryLength as number) || 100;
  const entropyThreshold = (condition.entropyThreshold as number) || 3.5;

  const details = parseDetails(event.details);
  const queryName =
    (details.queryName as string) || (details.domain as string) || event.title;

  // Check query length
  if (queryName.length > maxQueryLength) {
    return {
      ruleId: "",
      ruleName: "",
      severity: "",
      confidence: 0,
      mitreAttackId: null,
      mitreTactic: null,
      mitreTechnique: null,
      matchDetails: {
        reason: `DNS tunneling indicator: query length ${queryName.length} > ${maxQueryLength}`,
        queryLength: queryName.length,
        domain: queryName.substring(0, 50),
      },
    };
  }

  // Check entropy
  const entropy = calculateEntropy(queryName);
  if (entropy > entropyThreshold) {
    return {
      ruleId: "",
      ruleName: "",
      severity: "",
      confidence: 0,
      mitreAttackId: null,
      mitreTactic: null,
      mitreTechnique: null,
      matchDetails: {
        reason: `DNS tunneling indicator: high entropy ${entropy.toFixed(2)} > ${entropyThreshold}`,
        entropy: Math.round(entropy * 100) / 100,
        domain: queryName.substring(0, 50),
      },
    };
  }

  return null;
}

/** Shannon entropy calculation for a string */
function calculateEntropy(s: string): number {
  const freq: Record<string, number> = {};
  for (const c of s) freq[c] = (freq[c] || 0) + 1;
  const len = s.length;
  let entropy = 0;
  for (const count of Object.values(freq)) {
    const p = count / len;
    if (p > 0) entropy -= p * Math.log2(p);
  }
  return entropy;
}

/**
 * volume_threshold: Detect large data transfers (exfiltration).
 */
function evaluateVolumeThreshold(
  event: SiemEventInput,
  condition: Record<string, unknown>
): RuleMatch | null {
  if (event.category !== "data_exfil" && event.category !== "network")
    return null;

  const thresholdBytes = (condition.thresholdBytes as number) || 1073741824; // 1 GB
  const direction = condition.direction as string;

  // Check direction
  if (direction && event.direction && event.direction !== direction) return null;

  // Check details for byte counts
  const details = parseDetails(event.details);
  const bytesOut =
    (details.bytesOut as number) ||
    (details.transferSize as number) ||
    (details.bytes as number) ||
    0;

  if (bytesOut >= thresholdBytes) {
    return {
      ruleId: "",
      ruleName: "",
      severity: "",
      confidence: 0,
      mitreAttackId: null,
      mitreTactic: null,
      mitreTechnique: null,
      matchDetails: {
        reason: `Large data transfer: ${(bytesOut / 1073741824).toFixed(2)} GB (threshold: ${(thresholdBytes / 1073741824).toFixed(2)} GB)`,
        bytesTransferred: bytesOut,
        destination: event.destIp,
      },
    };
  }

  // Also trigger on title/details keywords
  const titleLower = event.title.toLowerCase();
  if (
    titleLower.includes("exfil") ||
    titleLower.includes("large upload") ||
    titleLower.includes("data transfer")
  ) {
    return {
      ruleId: "",
      ruleName: "",
      severity: "",
      confidence: 0,
      mitreAttackId: null,
      mitreTactic: null,
      mitreTechnique: null,
      matchDetails: {
        reason: `Data exfiltration indicator detected in event title`,
        title: event.title,
      },
    };
  }

  return null;
}

/**
 * beacon_detection: Detect C2 beaconing patterns (regular intervals to same dest).
 */
async function evaluateBeaconDetection(
  event: SiemEventInput,
  condition: Record<string, unknown>
): Promise<RuleMatch | null> {
  if (!event.destIp || event.category !== "network") return null;

  const excludeStandardPorts = condition.excludeStandardPorts as number[] | undefined;
  if (excludeStandardPorts && event.destPort) {
    if (excludeStandardPorts.includes(event.destPort)) return null;
  }

  const minDuration = parseWindow((condition.minDuration as string) || "1h");
  const windowStart = new Date(Date.now() - minDuration);

  // Count recent connections to same destination
  const count = await prisma.siemEvent.count({
    where: {
      tenantId: event.tenantId,
      destIp: event.destIp,
      category: "network",
      createdAt: { gte: windowStart },
    },
  });

  // If multiple connections to same non-standard destination in the window
  if (count >= 5) {
    return {
      ruleId: "",
      ruleName: "",
      severity: "",
      confidence: 0,
      mitreAttackId: null,
      mitreTactic: null,
      mitreTechnique: null,
      matchDetails: {
        reason: `C2 beaconing pattern: ${count} connections to ${event.destIp} on port ${event.destPort}`,
        destIp: event.destIp,
        destPort: event.destPort,
        connectionCount: count,
      },
    };
  }

  return null;
}

/**
 * iam_policy: Detect dangerous IAM policy changes in cloud environments.
 */
function evaluateIamPolicy(
  event: SiemEventInput,
  condition: Record<string, unknown>
): RuleMatch | null {
  if (event.category !== "cloud_iam") return null;

  const dangerousActions = condition.dangerousActions as string[] | undefined;
  if (!dangerousActions) return null;

  const details = parseDetails(event.details);
  const eventActionStr =
    event.eventAction || (details.action as string) || "";
  const policyActions = (details.policyActions as string[]) || [];
  const resource = (details.resource as string) || "";

  // Check if any dangerous IAM action is present
  const allActions = [eventActionStr, ...policyActions];
  const matched = dangerousActions.some((da) =>
    allActions.some((a) => a.toLowerCase().includes(da.toLowerCase()))
  );
  if (!matched) return null;

  // Check for wildcard resource
  const wantWildcard = condition.resource === "*";
  if (wantWildcard && resource !== "*" && !resource.includes("*")) return null;

  return {
    ruleId: "",
    ruleName: "",
    severity: "",
    confidence: 0,
    mitreAttackId: null,
    mitreTactic: null,
    mitreTechnique: null,
    matchDetails: {
      reason: `Cloud IAM privilege escalation: dangerous action with wildcard resource`,
      actions: allActions.filter(Boolean),
      resource,
      user: event.userName,
    },
  };
}

/**
 * ransomware_pattern: Detect multi-indicator ransomware behavior.
 */
function evaluateRansomwarePattern(
  event: SiemEventInput,
  condition: Record<string, unknown>
): RuleMatch | null {
  if (event.category !== "malware" && event.category !== "ransomware")
    return null;

  const indicators = condition.indicators as Array<Record<string, unknown>> | undefined;
  const minIndicators = (condition.minIndicators as number) || 2;
  if (!indicators) return null;

  const titleLower = event.title.toLowerCase();
  const details = parseDetails(event.details);
  const detailStr = JSON.stringify(details).toLowerCase();
  let matchCount = 0;
  const matchedIndicators: string[] = [];

  for (const indicator of indicators) {
    const type = indicator.type as string;
    if (type === "mass_rename") {
      if (
        titleLower.includes("rename") ||
        titleLower.includes("encrypt") ||
        detailStr.includes("rename")
      ) {
        matchCount++;
        matchedIndicators.push("mass_rename");
      }
    } else if (type === "shadow_copy_delete") {
      const cmd = (indicator.command as string)?.toLowerCase() || "vssadmin";
      if (
        titleLower.includes("shadow") ||
        titleLower.includes("vssadmin") ||
        detailStr.includes(cmd)
      ) {
        matchCount++;
        matchedIndicators.push("shadow_copy_delete");
      }
    } else if (type === "ransom_note") {
      const patterns = (indicator.filePatterns as string[]) || [];
      const hasNote = patterns.some(
        (p) =>
          titleLower.includes(p.toLowerCase().replace("*", "")) ||
          detailStr.includes(p.toLowerCase().replace("*", ""))
      );
      if (hasNote) {
        matchCount++;
        matchedIndicators.push("ransom_note");
      }
    }
  }

  if (matchCount >= minIndicators) {
    return {
      ruleId: "",
      ruleName: "",
      severity: "",
      confidence: 0,
      mitreAttackId: null,
      mitreTactic: null,
      mitreTechnique: null,
      matchDetails: {
        reason: `Ransomware indicators: ${matchCount}/${minIndicators} indicators matched`,
        matchedIndicators,
        host: event.hostName,
      },
    };
  }

  return null;
}

// ─── Category Compatibility ─────────────────────────────────────

/**
 * Maps rule categories to event categories they should match.
 * Rule category "endpoint" should match events with category "process", etc.
 */
const CATEGORY_COMPAT: Record<string, string[]> = {
  endpoint: ["endpoint", "process", "malware", "ransomware"],
  network: ["network", "dns", "lateral_movement", "data_exfil"],
  authentication: ["authentication", "identity"],
  identity: ["identity", "authentication"],
  cloud: ["cloud", "cloud_iam"],
  process: ["process", "endpoint"],
};

function categoryMatches(ruleCategory: string | null, eventCategory: string): boolean {
  if (!ruleCategory) return true;
  if (ruleCategory === eventCategory) return true;
  const compat = CATEGORY_COMPAT[ruleCategory];
  return compat ? compat.includes(eventCategory) : false;
}

// ─── Main Evaluation Entry Point ─────────────────────────────────

/**
 * Evaluate a single event against all active rules.
 * Returns array of rule matches (may be empty).
 */
export async function evaluateRules(
  event: SiemEventInput,
  rules: SiemRuleInput[]
): Promise<RuleMatch[]> {
  const matches: RuleMatch[] = [];

  for (const rule of rules) {
    if (!rule.isActive) continue;

    // Skip rules that don't match the event's category (with compatibility)
    if (!categoryMatches(rule.category, event.category)) continue;

    const condition = parseCondition(rule.condition);
    const condType = condition.type as string;
    if (!condType) continue;

    let match: RuleMatch | null = null;

    try {
      switch (condType) {
        case "threshold":
          match = await evaluateThreshold(event, condition);
          break;
        case "sequence":
          match = await evaluateSequence(event, condition);
          break;
        case "process_match":
          match = evaluateProcessMatch(event, condition);
          break;
        case "process_access":
          match = evaluateProcessAccess(event, condition);
          break;
        case "network_process":
          match = evaluateNetworkProcess(event, condition);
          break;
        case "geo_velocity":
          match = await evaluateGeoVelocity(event, condition);
          break;
        case "dns_anomaly":
          match = evaluateDnsAnomaly(event, condition);
          break;
        case "volume_threshold":
          match = evaluateVolumeThreshold(event, condition);
          break;
        case "beacon_detection":
          match = await evaluateBeaconDetection(event, condition);
          break;
        case "iam_policy":
          match = evaluateIamPolicy(event, condition);
          break;
        case "ransomware_pattern":
          match = evaluateRansomwarePattern(event, condition);
          break;
        default:
          // Unknown condition type — skip
          break;
      }
    } catch (err) {
      console.error(`Rule evaluation error for rule ${rule.name}:`, err);
      continue;
    }

    if (match) {
      // Fill in rule metadata
      match.ruleId = rule.id;
      match.ruleName = rule.name;
      match.severity = rule.severity;
      match.confidence = rule.confidenceLevel;
      match.mitreAttackId = rule.mitreAttackId;
      match.mitreTactic = rule.mitreTactic;
      match.mitreTechnique = rule.mitreTechnique;
      matches.push(match);
    }
  }

  return matches;
}

/**
 * Create a SiemAlert from a rule match and update rule stats.
 */
export async function createAlertFromMatch(
  match: RuleMatch,
  event: SiemEventInput,
  tenantId: string
): Promise<{
  id: string;
  title: string;
  severity: string;
  status: string;
  ruleName: string;
  mitreAttackId: string | null;
}> {
  const alert = await prisma.siemAlert.create({
    data: {
      tenantId,
      ruleId: match.ruleId,
      eventId: event.id,
      severity: match.severity,
      title: `${match.ruleName}: ${event.title}`,
      description: `Detection rule "${match.ruleName}" triggered. ${(match.matchDetails.reason as string) || ""}`,
      status: "open",
      mitreAttackId: match.mitreAttackId,
      mitreTactic: match.mitreTactic,
      mitreTechnique: match.mitreTechnique,
      confidenceScore: match.confidence,
      priorityScore: computePriority(
        match.severity,
        match.confidence,
        event.assetCriticality
      ),
      assetCriticalityWeight: event.assetCriticality,
      impactedAssets: event.hostName
        ? JSON.stringify([event.hostName])
        : "[]",
      impactedUsers: event.userName
        ? JSON.stringify([event.userName])
        : "[]",
    },
  });

  // Update rule stats
  await prisma.siemRule.update({
    where: { id: match.ruleId },
    data: {
      lastTriggeredAt: new Date(),
      truePositiveCount: { increment: 1 },
    },
  });

  return {
    id: alert.id,
    title: alert.title,
    severity: alert.severity,
    status: alert.status,
    ruleName: match.ruleName,
    mitreAttackId: match.mitreAttackId,
  };
}
