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

  const statusMap: Record<string, string> = {
    approve: "approved",
    reject: "rejected",
    execute: "executed",
  };

  const dateMap: Record<string, Record<string, Date>> = {
    approve: { approvedAt: new Date() },
    execute: { executedAt: new Date() },
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
