import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ roleId: string }> }
) {
  const { roleId } = await params;

  const role = await prisma.role.findUnique({
    where: { id: roleId },
    include: {
      permissions: {
        where: { granted: true },
        include: {
          permission: true,
        },
      },
    },
  });

  if (!role) {
    return NextResponse.json({ error: "Role not found" }, { status: 404 });
  }

  // Group permissions by module
  const permissionsByModule: Record<
    string,
    { resource: string; action: string; description: string }[]
  > = {};

  for (const rp of role.permissions) {
    const mod = rp.permission.module;
    if (!permissionsByModule[mod]) permissionsByModule[mod] = [];
    permissionsByModule[mod].push({
      resource: rp.permission.resource,
      action: rp.permission.action,
      description: rp.permission.description || "",
    });
  }

  return NextResponse.json({
    role: {
      id: role.id,
      name: role.name,
      slug: role.slug,
      description: role.description,
    },
    permissionsByModule,
    totalPermissions: role.permissions.length,
  });
}
