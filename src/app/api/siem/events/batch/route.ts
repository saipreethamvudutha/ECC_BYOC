/**
 * POST /api/siem/events/batch — Batch event ingestion (max 100 events)
 *
 * Phase 11: Bulk ingestion endpoint for high-volume log sources.
 * Loads rules once, evaluates each event, creates alerts + SOAR.
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
} from "@/lib/soar/playbooks";

const MAX_BATCH_SIZE = 100;

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

  let body: { events?: unknown[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { events } = body;
  if (!Array.isArray(events)) {
    return NextResponse.json(
      { error: "Body must contain an 'events' array" },
      { status: 400 }
    );
  }

  if (events.length === 0) {
    return NextResponse.json(
      { error: "Events array cannot be empty" },
      { status: 400 }
    );
  }

  if (events.length > MAX_BATCH_SIZE) {
    return NextResponse.json(
      { error: `Batch size exceeds maximum of ${MAX_BATCH_SIZE} events` },
      { status: 400 }
    );
  }

  // Validate all events before processing
  for (let i = 0; i < events.length; i++) {
    const evt = events[i] as Record<string, unknown>;
    if (!evt.source || !evt.severity || !evt.category || !evt.title) {
      return NextResponse.json(
        { error: `Event at index ${i} missing required fields: source, severity, category, title` },
        { status: 400 }
      );
    }
    if (!VALID_SOURCES.includes(evt.source as string)) {
      return NextResponse.json(
        { error: `Event at index ${i}: invalid source "${evt.source}"` },
        { status: 400 }
      );
    }
    if (!VALID_SEVERITIES.includes(evt.severity as string)) {
      return NextResponse.json(
        { error: `Event at index ${i}: invalid severity "${evt.severity}"` },
        { status: 400 }
      );
    }
    if (!VALID_CATEGORIES.includes(evt.category as string)) {
      return NextResponse.json(
        { error: `Event at index ${i}: invalid category "${evt.category}"` },
        { status: 400 }
      );
    }
  }

  // Load active rules once
  const rules = await prisma.siemRule.findMany({
    where: { tenantId: session.tenantId, isActive: true },
  });

  const allAlerts: Array<{
    id: string;
    title: string;
    severity: string;
    ruleName: string;
  }> = [];
  const allPlaybooks: Array<{ playbookName: string; incidentId?: string }> = [];
  let ingestedCount = 0;

  // Process each event
  for (const evtData of events) {
    const evt = evtData as Record<string, unknown>;

    const event = await prisma.siemEvent.create({
      data: {
        tenantId: session.tenantId,
        source: evt.source as string,
        severity: evt.severity as string,
        category: evt.category as string,
        title: evt.title as string,
        details: evt.details ? JSON.stringify(evt.details) : "{}",
        sourceIp: (evt.sourceIp as string) || null,
        sourcePort: evt.sourcePort ? Number(evt.sourcePort) : null,
        destIp: (evt.destIp as string) || null,
        destPort: evt.destPort ? Number(evt.destPort) : null,
        protocol: (evt.protocol as string) || null,
        direction: (evt.direction as string) || null,
        userName: (evt.userName as string) || null,
        userDomain: (evt.userDomain as string) || null,
        eventOutcome: (evt.eventOutcome as string) || null,
        eventAction: (evt.eventAction as string) || null,
        processName: (evt.processName as string) || null,
        processPid: evt.processPid ? Number(evt.processPid) : null,
        processParentName: (evt.processParentName as string) || null,
        processExecutable: (evt.processExecutable as string) || null,
        hostName: (evt.hostName as string) || null,
        hostIp: (evt.hostIp as string) || null,
        geoCountry: (evt.geoCountry as string) || null,
        geoCity: (evt.geoCity as string) || null,
        threatIntelHit: Boolean(evt.threatIntelHit),
        assetCriticality: (evt.assetCriticality as string) || null,
        dataset: (evt.dataset as string) || null,
        module: (evt.module as string) || null,
        logLevel: (evt.logLevel as string) || null,
      },
    });

    ingestedCount++;

    // Evaluate rules
    const matches = await evaluateRules(event, rules);

    for (const match of matches) {
      const alert = await createAlertFromMatch(match, event, session.tenantId);
      allAlerts.push({
        id: alert.id,
        title: alert.title,
        severity: alert.severity,
        ruleName: alert.ruleName,
      });

      // SOAR
      const pbs = findMatchingPlaybooks(
        { severity: alert.severity, title: alert.title, mitreAttackId: alert.mitreAttackId },
        match.ruleName
      );
      for (const pb of pbs) {
        const result = await executePlaybook(
          alert.id,
          {
            tenantId: session.tenantId,
            severity: alert.severity,
            title: alert.title,
            mitreAttackId: match.mitreAttackId,
            mitreTactic: match.mitreTactic,
            mitreTechnique: match.mitreTechnique,
          },
          pb
        );
        if (result.executed) {
          allPlaybooks.push({
            playbookName: result.playbookName,
            incidentId: result.incidentId,
          });
        }
      }
    }
  }

  // Audit
  await createAuditLog({
    tenantId: session.tenantId,
    actorId: session.id,
    actorType: "user",
    action: "siem.event.batch_ingested",
    resourceType: "siem_event",
    result: "success",
    details: {
      count: ingestedCount,
      alertsGenerated: allAlerts.length,
      playbooksTriggered: allPlaybooks.length,
    },
    request,
  });

  return NextResponse.json({
    ingested: ingestedCount,
    alerts: allAlerts,
    playbooks: allPlaybooks,
  });
}
