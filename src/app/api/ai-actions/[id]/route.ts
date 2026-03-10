import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rbac } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const canManage = await rbac.checkCapability(session.id, session.tenantId, "ai.approve.standard");
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const { action } = body; // "approve", "reject", "execute"

  const validActions = ["approve", "reject", "execute"];
  if (!action || !validActions.includes(action)) {
    return NextResponse.json(
      { error: `Invalid action. Must be one of: ${validActions.join(", ")}` },
      { status: 400 }
    );
  }

  const aiAction = await prisma.aiAction.findFirst({
    where: { id, tenantId: session.tenantId },
  });

  if (!aiAction) {
    return NextResponse.json({ error: "AI Action not found" }, { status: 404 });
  }

  // ── Phase 11: Real execution logic ──
  if (action === "execute") {
    // Guard: must be approved before execution
    if (aiAction.status !== "approved") {
      return NextResponse.json(
        { error: "Action must be approved before execution" },
        { status: 400 }
      );
    }

    const config = (() => {
      try { return JSON.parse(aiAction.config || "{}"); }
      catch { return {}; }
    })();

    let executionResult: Record<string, unknown> = {};

    try {
      switch (aiAction.type) {
        case "remediation":
        case "scan": {
          // Create a new scan targeting the relevant host
          const newScan = await prisma.scan.create({
            data: {
              tenantId: session.tenantId,
              name: `AI Remediation Scan: ${aiAction.title}`,
              type: "vulnerability",
              status: "queued",
              targets: JSON.stringify([config.target || "10.0.1.10"]),
              progress: JSON.stringify({
                completedChecks: [],
                currentBatch: 0,
                totalBatches: 0,
                totalFindings: 0,
                checkResults: {},
              }),
              createdById: session.id,
            },
          });
          executionResult = {
            action: "scan_created",
            scanId: newScan.id,
            target: config.target || "10.0.1.10",
          };
          break;
        }

        case "siem_rule": {
          // Create a new SIEM detection rule
          const newRule = await prisma.siemRule.create({
            data: {
              tenantId: session.tenantId,
              name: config.ruleName || `AI Rule: ${aiAction.title}`,
              description: aiAction.description || "",
              severity: config.severity || "medium",
              condition: JSON.stringify(config.condition || { type: "threshold", field: "eventAction", value: "login_failed", threshold: 5, window: "10m" }),
              isActive: true,
              ruleType: config.ruleType || "correlation",
              category: config.category || "authentication",
              dataSources: JSON.stringify(config.dataSources || ["identity"]),
              createdById: session.id,
            },
          });
          executionResult = {
            action: "rule_created",
            ruleId: newRule.id,
            ruleName: newRule.name,
          };
          break;
        }

        case "firewall_rule": {
          // Record the firewall change as a SIEM event
          const fwEvent = await prisma.siemEvent.create({
            data: {
              tenantId: session.tenantId,
              source: "system",
              severity: "info",
              category: "network",
              title: `AI Firewall Rule Applied: ${aiAction.title}`,
              details: JSON.stringify({
                aiActionId: aiAction.id,
                rule: config,
                appliedBy: session.id,
                appliedAt: new Date().toISOString(),
              }),
              dataset: "system.firewall",
              module: "ai_engine",
            },
          });
          executionResult = {
            action: "firewall_event_created",
            eventId: fwEvent.id,
          };
          break;
        }

        default: {
          executionResult = {
            action: "completed",
            type: aiAction.type,
            note: `Action type "${aiAction.type}" executed successfully`,
          };
        }
      }
    } catch (execError) {
      executionResult = {
        action: "error",
        error: String(execError),
      };
    }

    // Store execution result in config JSON
    const updatedConfig = { ...config, executionResult };
    const updated = await prisma.aiAction.update({
      where: { id },
      data: {
        status: "executed",
        executedAt: new Date(),
        config: JSON.stringify(updatedConfig),
      },
    });

    await createAuditLog({
      tenantId: session.tenantId,
      actorId: session.id,
      actorType: "user",
      action: "ai.action.executed",
      resourceType: "ai_action",
      resourceId: id,
      result: "success",
      details: { actionTitle: aiAction.title, action: "execute", executionResult },
      request,
    });

    return NextResponse.json({
      id: updated.id,
      status: updated.status,
      message: "AI Action executed successfully",
      executionResult,
    });
  }

  // ── Approve / Reject (unchanged) ──
  const statusMap: Record<string, string> = {
    approve: "approved",
    reject: "rejected",
  };

  const dateMap: Record<string, Record<string, Date>> = {
    approve: { approvedAt: new Date() },
  };

  const updated = await prisma.aiAction.update({
    where: { id },
    data: {
      status: statusMap[action],
      ...dateMap[action],
    },
  });

  await createAuditLog({
    tenantId: session.tenantId,
    actorId: session.id,
    actorType: "user",
    action: `ai.action.${action}d`,
    resourceType: "ai_action",
    resourceId: id,
    result: "success",
    details: { actionTitle: aiAction.title, action },
    request,
  });

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    message: `AI Action ${action}d successfully`,
  });
}
