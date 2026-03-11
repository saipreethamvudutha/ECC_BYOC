import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rbac } from "@/lib/rbac";
import { createAuditLog } from "@/lib/audit";

/**
 * POST /api/siem/alerts/[id]/feedback
 *
 * Provide feedback on an alert (true_positive, false_positive).
 * Updates alert status and adjusts rule accuracy metrics.
 *
 * Body: { verdict: "true_positive" | "false_positive", notes?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const canAck = await rbac.checkCapability(session.id, session.tenantId, "siem.acknowledge");
  if (!canAck) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const alert = await prisma.siemAlert.findFirst({
    where: { id, tenantId: session.tenantId },
    select: { id: true, status: true, title: true, ruleId: true },
  });

  if (!alert) return NextResponse.json({ error: "Alert not found" }, { status: 404 });

  const body = await request.json();
  const { verdict, notes } = body;

  if (!verdict || !["true_positive", "false_positive"].includes(verdict)) {
    return NextResponse.json(
      { error: "verdict must be 'true_positive' or 'false_positive'" },
      { status: 400 }
    );
  }

  const newStatus = verdict === "false_positive" ? "false_positive" : "resolved";
  const now = new Date();

  await prisma.siemAlert.update({
    where: { id },
    data: {
      status: newStatus,
      resolvedAt: verdict === "true_positive" ? now : undefined,
      closedAt: now,
      description: notes
        ? (alert.title + ` | Feedback: ${notes}`)
        : undefined,
    },
  });

  // Update rule accuracy metrics
  if (alert.ruleId) {
    const rule = await prisma.siemRule.findUnique({
      where: { id: alert.ruleId },
      select: { truePositiveCount: true, falsePositiveCount: true },
    });

    if (rule) {
      if (verdict === "false_positive") {
        const newFp = rule.falsePositiveCount + 1;
        const total = rule.truePositiveCount + newFp;
        await prisma.siemRule.update({
          where: { id: alert.ruleId },
          data: {
            falsePositiveCount: { increment: 1 },
            falsePositiveRate: total > 0 ? Math.round((newFp / total) * 10000) / 10000 : 0,
          },
        });
      } else {
        const newTp = rule.truePositiveCount + 1;
        const total = newTp + rule.falsePositiveCount;
        await prisma.siemRule.update({
          where: { id: alert.ruleId },
          data: {
            truePositiveCount: { increment: 1 },
            falsePositiveRate: total > 0 ? Math.round((rule.falsePositiveCount / total) * 10000) / 10000 : 0,
          },
        });
      }
    }
  }

  await createAuditLog({
    tenantId: session.tenantId,
    actorId: session.id,
    actorType: "user",
    action: "siem.alert.feedback",
    resourceType: "siem_alert",
    resourceId: id,
    result: "success",
    details: { verdict, notes, previousStatus: alert.status, newStatus },
    request,
  });

  return NextResponse.json({
    id,
    status: newStatus,
    verdict,
    message: `Alert marked as ${verdict}`,
  });
}
