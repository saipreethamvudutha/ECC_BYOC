/**
 * BYOC SOAR Playbook System
 *
 * Phase 11: Simple automated response playbooks triggered on alert creation.
 * Definitions stored as code constants (no DB model needed).
 * Execution records saved as timeline entries on auto-created incidents.
 */

import { prisma } from "@/lib/prisma";
import { v4 as uuid } from "uuid";

// ─── Types ───────────────────────────────────────────────────────

export interface PlaybookTrigger {
  type: "alert_created";
  conditions: {
    severity?: string[];
    category?: string[];
    mitreTactic?: string[];
    ruleNameContains?: string;
  };
}

export interface PlaybookStep {
  id: string;
  action:
    | "escalate_to_incident"
    | "update_alert_status"
    | "add_timeline_entry"
    | "set_priority";
  params: Record<string, unknown>;
}

export interface PlaybookDef {
  id: string;
  name: string;
  description: string;
  trigger: PlaybookTrigger;
  steps: PlaybookStep[];
}

export interface PlaybookExecResult {
  playbookId: string;
  playbookName: string;
  executed: boolean;
  incidentId?: string;
  stepsExecuted: string[];
}

// ─── Playbook Definitions ────────────────────────────────────────

export const PLAYBOOKS: PlaybookDef[] = [
  {
    id: "critical-auto-escalation",
    name: "Critical Alert Auto-Escalation",
    description:
      "Automatically escalate critical severity alerts to incidents for immediate investigation.",
    trigger: {
      type: "alert_created",
      conditions: { severity: ["critical"] },
    },
    steps: [
      {
        id: "step-1",
        action: "escalate_to_incident",
        params: { priority: "critical" },
      },
      {
        id: "step-2",
        action: "add_timeline_entry",
        params: {
          message:
            "Auto-escalated by SOAR playbook: Critical Alert Auto-Escalation",
        },
      },
    ],
  },
  {
    id: "brute-force-response",
    name: "Brute Force Response",
    description:
      "Auto-contain host and escalate to incident when brute force attack is detected.",
    trigger: {
      type: "alert_created",
      conditions: { ruleNameContains: "Brute Force" },
    },
    steps: [
      {
        id: "step-1",
        action: "update_alert_status",
        params: { status: "contained" },
      },
      {
        id: "step-2",
        action: "escalate_to_incident",
        params: { priority: "high" },
      },
      {
        id: "step-3",
        action: "add_timeline_entry",
        params: {
          message:
            "Auto-contained by SOAR: Brute Force Response playbook. Source IP should be blocked at firewall.",
        },
      },
    ],
  },
  {
    id: "ransomware-isolation",
    name: "Ransomware Isolation",
    description:
      "Emergency response: auto-escalate and contain host on ransomware indicator detection.",
    trigger: {
      type: "alert_created",
      conditions: {
        ruleNameContains: "Ransomware",
        severity: ["critical"],
      },
    },
    steps: [
      {
        id: "step-1",
        action: "escalate_to_incident",
        params: { priority: "critical" },
      },
      {
        id: "step-2",
        action: "update_alert_status",
        params: { status: "contained" },
      },
      {
        id: "step-3",
        action: "add_timeline_entry",
        params: {
          message:
            "EMERGENCY: Ransomware isolation triggered by SOAR. Affected host auto-contained. Initiate network isolation procedure.",
        },
      },
    ],
  },
];

// ─── Matching Logic ──────────────────────────────────────────────

/**
 * Find all playbooks whose trigger conditions match the given alert.
 */
export function findMatchingPlaybooks(
  alert: { severity: string; title: string; mitreAttackId?: string | null; mitreTactic?: string | null },
  ruleName?: string
): PlaybookDef[] {
  return PLAYBOOKS.filter((pb) => {
    const cond = pb.trigger.conditions;

    // Severity match
    if (cond.severity && !cond.severity.includes(alert.severity)) return false;

    // Rule name contains
    if (cond.ruleNameContains) {
      const alertTitle = (alert.title || "").toLowerCase();
      const rName = (ruleName || "").toLowerCase();
      const needle = cond.ruleNameContains.toLowerCase();
      if (!alertTitle.includes(needle) && !rName.includes(needle)) return false;
    }

    // MITRE tactic match
    if (cond.mitreTactic && alert.mitreTactic) {
      if (!cond.mitreTactic.includes(alert.mitreTactic)) return false;
    }

    return true;
  });
}

// ─── Execution Engine ────────────────────────────────────────────

/**
 * Execute a playbook's steps for a given alert.
 * Returns execution result with incident ID if created.
 */
export async function executePlaybook(
  alertId: string,
  alertData: {
    tenantId: string;
    severity: string;
    title: string;
    description?: string | null;
    mitreAttackId?: string | null;
    mitreTactic?: string | null;
    mitreTechnique?: string | null;
    impactedUsers?: string;
    impactedAssets?: string;
  },
  playbook: PlaybookDef
): Promise<PlaybookExecResult> {
  const result: PlaybookExecResult = {
    playbookId: playbook.id,
    playbookName: playbook.name,
    executed: false,
    stepsExecuted: [],
  };

  let incidentId: string | undefined;

  try {
    for (const step of playbook.steps) {
      switch (step.action) {
        case "escalate_to_incident": {
          if (incidentId) break; // already created

          const priority = (step.params.priority as string) || "high";
          const incident = await prisma.siemIncident.create({
            data: {
              id: uuid(),
              tenantId: alertData.tenantId,
              title: `[SOAR] ${alertData.title}`,
              description: `Auto-created by SOAR playbook "${playbook.name}". ${alertData.description || ""}`,
              severity: alertData.severity,
              status: "investigating",
              priority,
              escalatedByName: `SOAR: ${playbook.name}`,
              impactedUsers: alertData.impactedUsers || "[]",
              impactedAssets: alertData.impactedAssets || "[]",
              mitreTactics: alertData.mitreTactic
                ? JSON.stringify([alertData.mitreTactic])
                : "[]",
              mitreTechniques: alertData.mitreTechnique
                ? JSON.stringify([alertData.mitreTechnique])
                : "[]",
              detectedAt: new Date(),
              acknowledgedAt: new Date(),
              timeline: JSON.stringify([
                {
                  timestamp: new Date().toISOString(),
                  action: "incident_created",
                  actor: `SOAR: ${playbook.name}`,
                  details: `Incident auto-created from alert: ${alertData.title}`,
                },
              ]),
            },
          });

          incidentId = incident.id;
          result.incidentId = incidentId;

          // Link alert to incident
          await prisma.siemAlert.update({
            where: { id: alertId },
            data: {
              incidentId: incident.id,
              status: "investigating",
              acknowledgedAt: new Date(),
            },
          });

          result.stepsExecuted.push(step.id);
          break;
        }

        case "update_alert_status": {
          const status = step.params.status as string;
          const data: Record<string, unknown> = { status };
          if (status === "contained") data.containedAt = new Date();
          if (status === "resolved") data.resolvedAt = new Date();
          if (status === "investigating") data.acknowledgedAt = new Date();

          await prisma.siemAlert.update({
            where: { id: alertId },
            data: data as any,
          });
          result.stepsExecuted.push(step.id);
          break;
        }

        case "add_timeline_entry": {
          if (!incidentId) break;
          const message = step.params.message as string;

          // Fetch current timeline, append new entry
          const incident = await prisma.siemIncident.findUnique({
            where: { id: incidentId },
            select: { timeline: true },
          });
          const timeline = (() => {
            try {
              return JSON.parse(incident?.timeline || "[]");
            } catch {
              return [];
            }
          })();

          timeline.push({
            timestamp: new Date().toISOString(),
            action: "soar_playbook",
            actor: `SOAR: ${playbook.name}`,
            details: message,
          });

          await prisma.siemIncident.update({
            where: { id: incidentId },
            data: { timeline: JSON.stringify(timeline) },
          });
          result.stepsExecuted.push(step.id);
          break;
        }

        case "set_priority": {
          if (!incidentId) break;
          const priority = step.params.priority as string;
          await prisma.siemIncident.update({
            where: { id: incidentId },
            data: { priority },
          });
          result.stepsExecuted.push(step.id);
          break;
        }
      }
    }

    result.executed = true;
  } catch (err) {
    console.error(`SOAR playbook execution error (${playbook.name}):`, err);
  }

  return result;
}
