/**
 * POST /api/siem/events — Single event ingestion with real-time rule evaluation
 *
 * Phase 11: The core SIEM ingestion pipeline.
 * 1. Validates + stores the event
 * 2. Evaluates all active detection rules
 * 3. Creates alerts for rule matches
 * 4. Triggers SOAR playbooks on new alerts
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rbac } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";
import { evaluateRules, createAlertFromMatch } from "@/lib/siem/rule-engine";
import {
  findMatchingPlaybooks,
  executePlaybook,
  type PlaybookExecResult,
} from "@/lib/soar/playbooks";

const VALID_SOURCES = [
  "firewall", "ids", "endpoint", "cloud", "application",
  "edr", "waf", "identity", "database", "dns", "scanner", "system",
];
const VALID_SEVERITIES = ["critical", "high", "medium", "low", "info"];
const VALID_CATEGORIES = [
  "authentication", "network", "malware", "policy_violation", "system",
  "process", "dns", "cloud_iam", "data_exfil", "lateral_movement", "ransomware",
  "vulnerability",
];

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const canIngest = await rbac.checkCapability(
    session.id,
    session.tenantId,
    "siem.integration.manage"
  );
  if (!canIngest) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate required fields
  const { source, severity, category, title } = body;
  if (!source || !severity || !category || !title) {
    return NextResponse.json(
      { error: "Missing required fields: source, severity, category, title" },
      { status: 400 }
    );
  }

  if (!VALID_SOURCES.includes(source as string)) {
    return NextResponse.json(
      { error: `Invalid source. Must be one of: ${VALID_SOURCES.join(", ")}` },
      { status: 400 }
    );
  }
  if (!VALID_SEVERITIES.includes(severity as string)) {
    return NextResponse.json(
      { error: `Invalid severity. Must be one of: ${VALID_SEVERITIES.join(", ")}` },
      { status: 400 }
    );
  }
  if (!VALID_CATEGORIES.includes(category as string)) {
    return NextResponse.json(
      { error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(", ")}` },
      { status: 400 }
    );
  }

  // Create the event
  const event = await prisma.siemEvent.create({
    data: {
      tenantId: session.tenantId,
      source: source as string,
      severity: severity as string,
      category: category as string,
      title: title as string,
      details: body.details ? JSON.stringify(body.details) : "{}",
      sourceIp: (body.sourceIp as string) || null,
      sourcePort: body.sourcePort ? Number(body.sourcePort) : null,
      destIp: (body.destIp as string) || null,
      destPort: body.destPort ? Number(body.destPort) : null,
      protocol: (body.protocol as string) || null,
      direction: (body.direction as string) || null,
      userName: (body.userName as string) || null,
      userDomain: (body.userDomain as string) || null,
      eventOutcome: (body.eventOutcome as string) || null,
      eventAction: (body.eventAction as string) || null,
      processName: (body.processName as string) || null,
      processPid: body.processPid ? Number(body.processPid) : null,
      processParentName: (body.processParentName as string) || null,
      processExecutable: (body.processExecutable as string) || null,
      hostName: (body.hostName as string) || null,
      hostIp: (body.hostIp as string) || null,
      geoCountry: (body.geoCountry as string) || null,
      geoCity: (body.geoCity as string) || null,
      threatIntelHit: Boolean(body.threatIntelHit),
      assetCriticality: (body.assetCriticality as string) || null,
      dataset: (body.dataset as string) || null,
      module: (body.module as string) || null,
      logLevel: (body.logLevel as string) || null,
      raw: (body.raw as string) || null,
    },
  });

  // ── Rule Evaluation ──
  const rules = await prisma.siemRule.findMany({
    where: { tenantId: session.tenantId, isActive: true },
  });

  const matches = await evaluateRules(event, rules);

  // ── Alert Creation + SOAR ──
  const alerts: Array<{
    id: string;
    title: string;
    severity: string;
    status: string;
    ruleName: string;
    mitreAttackId: string | null;
  }> = [];
  const playbookResults: PlaybookExecResult[] = [];

  for (const match of matches) {
    const alert = await createAlertFromMatch(match, event, session.tenantId);
    alerts.push(alert);

    // SOAR: Find and execute matching playbooks
    const matchingPlaybooks = findMatchingPlaybooks(
      {
        severity: alert.severity,
        title: alert.title,
        mitreAttackId: alert.mitreAttackId,
      },
      match.ruleName
    );

    for (const playbook of matchingPlaybooks) {
      const pbResult = await executePlaybook(
        alert.id,
        {
          tenantId: session.tenantId,
          severity: alert.severity,
          title: alert.title,
          description: match.matchDetails.reason as string,
          mitreAttackId: match.mitreAttackId,
          mitreTactic: match.mitreTactic,
          mitreTechnique: match.mitreTechnique,
          impactedUsers: event.userName ? JSON.stringify([event.userName]) : "[]",
          impactedAssets: event.hostName ? JSON.stringify([event.hostName]) : "[]",
        },
        playbook
      );
      playbookResults.push(pbResult);
    }
  }

  // Audit log
  await createAuditLog({
    tenantId: session.tenantId,
    actorId: session.id,
    actorType: "user",
    action: "siem.event.ingested",
    resourceType: "siem_event",
    resourceId: event.id,
    result: "success",
    details: {
      source: event.source,
      category: event.category,
      severity: event.severity,
      alertsGenerated: alerts.length,
      playbooksTriggered: playbookResults.filter((p) => p.executed).length,
    },
    request,
  });

  return NextResponse.json({
    event: { id: event.id },
    alerts,
    playbooks: playbookResults,
  });
}
