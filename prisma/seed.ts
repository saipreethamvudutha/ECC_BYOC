import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";
import { CAPABILITIES, BUILTIN_ROLES } from "../src/lib/capabilities";

const prisma = new PrismaClient();

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  BYOC Database Seed — Exargen Production");
  console.log("═══════════════════════════════════════════════════════════\n");

  // ─── 1. Seed Capabilities (system-wide) ──────────────────────────
  console.log("📋 Seeding capabilities...");

  for (const cap of CAPABILITIES) {
    await prisma.capability.upsert({
      where: { id: cap.id },
      update: {
        module: cap.module,
        name: cap.name,
        description: cap.description,
        riskLevel: cap.riskLevel,
      },
      create: {
        id: cap.id,
        module: cap.module,
        name: cap.name,
        description: cap.description,
        riskLevel: cap.riskLevel,
      },
    });
  }
  console.log(`   ✅ ${CAPABILITIES.length} capabilities seeded\n`);

  // ─── 2. Create Exargen Tenant ────────────────────────────────────
  console.log("🏢 Creating Exargen tenant...");
  const tenant = await prisma.tenant.upsert({
    where: { slug: "exargen" },
    update: { name: "Exargen", plan: "enterprise" },
    create: {
      id: uuid(),
      name: "Exargen",
      slug: "exargen",
      plan: "enterprise",
      settings: JSON.stringify({
        maxUsers: 100,
        maxCustomRoles: 25,
        maxPlatformAdmins: 2,
        features: ["sso", "scim", "compliance", "ai_actions", "siem"],
      }),
    },
  });
  console.log(`   ✅ Tenant: ${tenant.name} (${tenant.slug})\n`);

  // ─── 3. Create Built-in Roles (7) ────────────────────────────────
  console.log("🔐 Creating built-in roles...");

  const roleMap: Record<string, string> = {};

  for (const roleDef of BUILTIN_ROLES) {
    const role = await prisma.role.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: roleDef.slug } },
      update: {
        name: roleDef.name,
        description: roleDef.description,
        maxAssignments: roleDef.maxAssignments || null,
      },
      create: {
        id: uuid(),
        tenantId: tenant.id,
        name: roleDef.name,
        slug: roleDef.slug,
        description: roleDef.description,
        isBuiltin: true,
        maxAssignments: roleDef.maxAssignments || null,
      },
    });
    roleMap[roleDef.slug] = role.id;
    console.log(`   🔒 ${roleDef.name} (${roleDef.capabilities.length} capabilities)`);
  }
  console.log("");

  // ─── 4. Assign Capabilities to Roles ─────────────────────────────
  console.log("⚡ Assigning capabilities to roles...");

  for (const roleDef of BUILTIN_ROLES) {
    const roleId = roleMap[roleDef.slug];

    // Clear existing role capabilities for clean re-seed
    await prisma.roleCapability.deleteMany({ where: { roleId } });

    // Grant capabilities
    for (const capId of roleDef.capabilities) {
      await prisma.roleCapability.create({
        data: {
          roleId,
          capabilityId: capId,
          granted: true,
        },
      });
    }

    // Add explicit denials
    if (roleDef.deniedCapabilities) {
      for (const capId of roleDef.deniedCapabilities) {
        await prisma.roleCapability.upsert({
          where: { roleId_capabilityId: { roleId, capabilityId: capId } },
          update: { granted: false },
          create: {
            roleId,
            capabilityId: capId,
            granted: false,
          },
        });
      }
    }
  }
  console.log("   ✅ All role-capability mappings created\n");

  // ─── 5. Create Super Admin User ──────────────────────────────────
  console.log("👤 Creating Super Admin...");
  const passwordHash = await bcrypt.hash("Admin123!", 12);

  const superAdmin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: "admin@exargen.com" } },
    update: { passwordHash },
    create: {
      id: uuid(),
      tenantId: tenant.id,
      email: "admin@exargen.com",
      name: "Exargen Admin",
      passwordHash,
      status: "active",
      mfaEnabled: false,
      department: "Security Operations",
    },
  });
  console.log(`   ✅ ${superAdmin.name} (${superAdmin.email})\n`);

  // ─── 6. Assign Platform Admin Role ───────────────────────────────
  console.log("🔗 Assigning Platform Admin role...");

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: superAdmin.id, roleId: roleMap["platform-admin"] } },
    update: {},
    create: { id: uuid(), userId: superAdmin.id, roleId: roleMap["platform-admin"] },
  });
  console.log("   ✅ Exargen Admin → Platform Administrator\n");

  // ─── 7. Seed Global Scope ────────────────────────────────────────
  console.log("🔭 Seeding global scope...");

  const globalScope = await prisma.scope.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: "Global" } },
    update: {},
    create: {
      id: uuid(),
      tenantId: tenant.id,
      name: "Global",
      description: "All assets — unrestricted access",
      isGlobal: true,
      tagFilter: "{}",
    },
  });

  await prisma.userScope.upsert({
    where: { userId_scopeId: { userId: superAdmin.id, scopeId: globalScope.id } },
    update: {},
    create: { userId: superAdmin.id, scopeId: globalScope.id },
  });
  console.log("   ✅ Global scope assigned to admin\n");

  // ─── 8. Seed Audit Log Entry ─────────────────────────────────────
  await prisma.auditLog.create({
    data: {
      id: uuid(),
      tenantId: tenant.id,
      actorId: superAdmin.id,
      actorType: "system",
      action: "system.seed",
      result: "success",
      details: JSON.stringify({ event: "Database seeded — production bootstrap" }),
    },
  });

  // ─── Summary ─────────────────────────────────────────────────────
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  ✅ SEED COMPLETED — Exargen Production");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  ${CAPABILITIES.length} capabilities · ${BUILTIN_ROLES.length} roles · 1 scope`);
  console.log("  1 user (Super Admin)");
  console.log("");
  console.log("  Login Credentials:");
  console.log("  └─ Platform Admin:  admin@exargen.com / Admin123!");
  console.log("═══════════════════════════════════════════════════════════");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
