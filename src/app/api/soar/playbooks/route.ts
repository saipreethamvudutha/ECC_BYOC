/**
 * GET /api/soar/playbooks — List SOAR playbook definitions
 *
 * Phase 11: Returns all registered playbooks with their trigger conditions and steps.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { rbac } from "@/lib/rbac";
import { PLAYBOOKS } from "@/lib/soar/playbooks";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const canView = await rbac.checkCapability(
    session.id,
    session.tenantId,
    "siem.view"
  );
  if (!canView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    playbooks: PLAYBOOKS.map((pb) => ({
      id: pb.id,
      name: pb.name,
      description: pb.description,
      trigger: pb.trigger,
      stepCount: pb.steps.length,
      steps: pb.steps.map((s) => ({
        id: s.id,
        action: s.action,
        params: s.params,
      })),
    })),
  });
}
