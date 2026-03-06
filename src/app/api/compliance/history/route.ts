import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rbac } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/**
 * GET /api/compliance/history?controlId=xxx
 *
 * Returns all ComplianceAssessment records for a specific control,
 * ordered by most recent first. Resolves assessor names.
 *
 * Capability: compliance.view
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const canView = await rbac.checkCapability(
      session.id, session.tenantId, "compliance.view"
    );
    if (!canView) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const controlId = searchParams.get("controlId");

    if (!controlId) {
      return NextResponse.json(
        { error: "controlId query parameter is required" },
        { status: 400 }
      );
    }

    // Verify control belongs to tenant
    const control = await prisma.complianceControl.findFirst({
      where: { id: controlId, tenantId: session.tenantId },
    });
    if (!control) {
      return NextResponse.json({ error: "Control not found" }, { status: 404 });
    }

    const assessments = await prisma.complianceAssessment.findMany({
      where: {
        controlId,
        tenantId: session.tenantId,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    // Resolve assessor names in one query
    const assessorIds = [
      ...new Set(assessments.map((a) => a.assessorId).filter(Boolean)),
    ] as string[];

    const users = assessorIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: assessorIds } },
          select: { id: true, name: true, email: true },
        })
      : [];

    const userMap = new Map(users.map((u) => [u.id, u]));

    const result = assessments.map((a) => {
      const assessor = a.assessorId ? userMap.get(a.assessorId) : null;
      return {
        id: a.id,
        assessorName: assessor?.name || "System",
        assessorEmail: assessor?.email || null,
        status: a.status,
        findings: a.findings,
        evidence: JSON.parse(a.evidence || "[]") as string[],
        remediationPlan: a.remediationPlan,
        dueDate: a.dueDate?.toISOString() || null,
        createdAt: a.createdAt.toISOString(),
      };
    });

    return NextResponse.json({
      controlId,
      controlLabel: control.controlId,
      assessments: result,
    });
  } catch (error) {
    console.error("[API] compliance/history error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
