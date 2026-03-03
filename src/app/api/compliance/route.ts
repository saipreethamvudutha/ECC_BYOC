import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rbac } from "@/lib/rbac";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // No dedicated compliance capability — use dash.view (compliance visible to anyone with dashboard access)
  const canView = await rbac.checkCapability(session.id, session.tenantId, "dash.view");
  if (!canView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const frameworks = await prisma.complianceFramework.findMany({
    where: { tenantId: session.tenantId },
    include: {
      controls: {
        orderBy: { controlId: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  const result = frameworks.map((fw) => {
    const total = fw.controls.length;
    const compliant = fw.controls.filter((c) => c.status === "compliant").length;
    const partial = fw.controls.filter((c) => c.status === "partially_compliant").length;
    const nonCompliant = fw.controls.filter((c) => c.status === "non_compliant").length;
    const notAssessed = fw.controls.filter((c) => c.status === "not_assessed").length;
    const notApplicable = fw.controls.filter((c) => c.status === "not_applicable").length;
    const applicableTotal = total - notApplicable;
    const score = applicableTotal > 0
      ? Math.round(((compliant + partial * 0.5) / applicableTotal) * 100)
      : 0;

    return {
      id: fw.id,
      name: fw.name,
      version: fw.version,
      description: fw.description,
      isActive: fw.isActive,
      stats: { total, compliant, partial, nonCompliant, notAssessed, notApplicable, score },
      controls: fw.controls.map((c) => ({
        id: c.id,
        controlId: c.controlId,
        title: c.title,
        description: c.description,
        category: c.category,
        status: c.status,
        lastAssessedAt: c.lastAssessedAt?.toISOString() || null,
        nextReviewAt: c.nextReviewAt?.toISOString() || null,
      })),
    };
  });

  return NextResponse.json(result);
}
