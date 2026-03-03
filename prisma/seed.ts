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

  // ─── 8. Seed Tags (11) ──────────────────────────────────────────
  console.log("🏷️  Seeding tags...");

  const tagDefinitions = [
    { key: "env", value: "production", color: "#10b981" },
    { key: "env", value: "staging", color: "#f59e0b" },
    { key: "env", value: "development", color: "#6366f1" },
    { key: "region", value: "us-east-1", color: "#3b82f6" },
    { key: "region", value: "eu-west-1", color: "#3b82f6" },
    { key: "region", value: "ap-south-1", color: "#3b82f6" },
    { key: "team", value: "platform", color: "#a855f7" },
    { key: "team", value: "security", color: "#a855f7" },
    { key: "team", value: "data", color: "#a855f7" },
    { key: "criticality", value: "tier-1", color: "#ef4444" },
    { key: "criticality", value: "tier-2", color: "#f97316" },
  ];

  const tagMap: Record<string, string> = {};

  for (const tagDef of tagDefinitions) {
    const tag = await prisma.tag.upsert({
      where: {
        tenantId_key_value: { tenantId: tenant.id, key: tagDef.key, value: tagDef.value },
      },
      update: { color: tagDef.color },
      create: {
        id: uuid(),
        tenantId: tenant.id,
        key: tagDef.key,
        value: tagDef.value,
        color: tagDef.color,
      },
    });
    tagMap[`${tagDef.key}:${tagDef.value}`] = tag.id;
  }
  console.log(`   ✅ ${tagDefinitions.length} tags seeded\n`);

  // ─── 9. Seed Assets (12) with Tag Assignments ──────────────────
  console.log("💻 Seeding assets...");

  const assetDefinitions = [
    { name: "exg-web-prod-01", type: "server", hostname: "exg-web-prod-01.exargen.io", ipAddress: "10.0.1.10", os: "Ubuntu 22.04 LTS", criticality: "critical", tags: ["env:production", "region:us-east-1", "team:platform", "criticality:tier-1"] },
    { name: "exg-web-prod-02", type: "server", hostname: "exg-web-prod-02.exargen.io", ipAddress: "10.0.1.11", os: "Ubuntu 22.04 LTS", criticality: "critical", tags: ["env:production", "region:us-east-1", "team:platform", "criticality:tier-1"] },
    { name: "exg-api-prod-01", type: "server", hostname: "exg-api-prod-01.exargen.io", ipAddress: "10.0.2.10", os: "Ubuntu 22.04 LTS", criticality: "critical", tags: ["env:production", "region:us-east-1", "team:platform", "criticality:tier-1"] },
    { name: "exg-db-prod-01", type: "database", hostname: "exg-db-prod-01.exargen.io", ipAddress: "10.0.3.10", os: "PostgreSQL 16", criticality: "critical", tags: ["env:production", "region:us-east-1", "team:data", "criticality:tier-1"] },
    { name: "exg-web-staging-01", type: "server", hostname: "exg-web-staging-01.exargen.io", ipAddress: "10.1.1.10", os: "Ubuntu 22.04 LTS", criticality: "medium", tags: ["env:staging", "region:us-east-1", "team:platform"] },
    { name: "exg-api-staging-01", type: "server", hostname: "exg-api-staging-01.exargen.io", ipAddress: "10.1.2.10", os: "Ubuntu 22.04 LTS", criticality: "medium", tags: ["env:staging", "region:us-east-1", "team:platform"] },
    { name: "exg-siem-prod-01", type: "server", hostname: "exg-siem-prod-01.exargen.io", ipAddress: "10.0.5.10", os: "CentOS 8", criticality: "high", tags: ["env:production", "region:us-east-1", "team:security", "criticality:tier-1"] },
    { name: "exg-fw-prod-01", type: "network_device", hostname: "exg-fw-prod-01.exargen.io", ipAddress: "10.0.0.1", os: "Palo Alto PAN-OS 11", criticality: "critical", tags: ["env:production", "region:us-east-1", "team:security", "criticality:tier-1"] },
    { name: "exg-vpn-eu-01", type: "network_device", hostname: "exg-vpn-eu-01.exargen.io", ipAddress: "10.2.0.1", os: "WireGuard", criticality: "high", tags: ["env:production", "region:eu-west-1", "team:security", "criticality:tier-2"] },
    { name: "exg-web-eu-01", type: "server", hostname: "exg-web-eu-01.exargen.io", ipAddress: "10.2.1.10", os: "Ubuntu 22.04 LTS", criticality: "high", tags: ["env:production", "region:eu-west-1", "team:platform", "criticality:tier-2"] },
    { name: "exg-app-dev-01", type: "cloud_resource", hostname: "exg-app-dev-01.exargen.io", ipAddress: "10.3.1.10", os: "AWS ECS Fargate", criticality: "low", tags: ["env:development", "region:ap-south-1", "team:platform"] },
    { name: "exg-ml-data-01", type: "server", hostname: "exg-ml-data-01.exargen.io", ipAddress: "10.0.6.10", os: "Ubuntu 22.04 LTS", criticality: "high", tags: ["env:production", "region:us-east-1", "team:data", "criticality:tier-2"] },
  ];

  for (const assetDef of assetDefinitions) {
    // Check if asset already exists (no unique constraint on tenantId+name)
    let asset = await prisma.asset.findFirst({
      where: { tenantId: tenant.id, name: assetDef.name },
    });

    if (!asset) {
      asset = await prisma.asset.create({
        data: {
          id: uuid(),
          tenantId: tenant.id,
          name: assetDef.name,
          type: assetDef.type,
          hostname: assetDef.hostname,
          ipAddress: assetDef.ipAddress,
          os: assetDef.os,
          criticality: assetDef.criticality,
          status: "active",
        },
      });
    }

    // Assign tags
    for (const tagRef of assetDef.tags) {
      const tagId = tagMap[tagRef];
      if (tagId) {
        await prisma.assetTag.upsert({
          where: { assetId_tagId: { assetId: asset.id, tagId } },
          update: {},
          create: { assetId: asset.id, tagId },
        });
      }
    }
  }
  console.log(`   ✅ ${assetDefinitions.length} assets seeded with tags\n`);

  // ─── 10. Seed Named Scopes (5) ─────────────────────────────────
  console.log("🔭 Seeding scopes...");

  const scopeDefinitions = [
    {
      name: "Production Only",
      description: "All production environment assets",
      tagFilter: { env: ["production"] },
      isGlobal: false,
    },
    {
      name: "US East Production",
      description: "Production assets in US East region",
      tagFilter: { env: ["production"], region: ["us-east-1"] },
      isGlobal: false,
    },
    {
      name: "EU Operations",
      description: "All EU-based assets",
      tagFilter: { region: ["eu-west-1"] },
      isGlobal: false,
    },
    {
      name: "Security Team",
      description: "Assets managed by the security team",
      tagFilter: { team: ["security"] },
      isGlobal: false,
    },
    {
      name: "PCI Zone",
      description: "Tier-1 critical production assets subject to PCI DSS",
      tagFilter: { env: ["production"], criticality: ["tier-1"] },
      isGlobal: false,
    },
  ];

  for (const scopeDef of scopeDefinitions) {
    await prisma.scope.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: scopeDef.name } },
      update: {
        description: scopeDef.description,
        tagFilter: JSON.stringify(scopeDef.tagFilter),
      },
      create: {
        id: uuid(),
        tenantId: tenant.id,
        name: scopeDef.name,
        description: scopeDef.description,
        tagFilter: JSON.stringify(scopeDef.tagFilter),
        isGlobal: scopeDef.isGlobal,
        createdById: superAdmin.id,
      },
    });
  }
  console.log(`   ✅ ${scopeDefinitions.length} named scopes + 1 global scope seeded\n`);

  // ─── 11. Seed Auto-Tag Rules (3) ───────────────────────────────
  console.log("⚙️  Seeding auto-tag rules...");

  const autoTagRules = [
    {
      name: "Production servers",
      description: "Auto-tag servers with 'prod' in hostname as production",
      condition: { field: "hostname", operator: "contains", value: "prod" },
      tagKey: "env:production",
    },
    {
      name: "EU region assets",
      description: "Auto-tag assets with 'eu' in hostname as EU West",
      condition: { field: "hostname", operator: "contains", value: "eu" },
      tagKey: "region:eu-west-1",
    },
    {
      name: "Database tier-1",
      description: "Auto-tag database assets as tier-1 critical",
      condition: { field: "type", operator: "equals", value: "database" },
      tagKey: "criticality:tier-1",
    },
  ];

  for (const ruleDef of autoTagRules) {
    const tagId = tagMap[ruleDef.tagKey];
    if (tagId) {
      await prisma.autoTagRule.upsert({
        where: { tenantId_name: { tenantId: tenant.id, name: ruleDef.name } },
        update: {
          description: ruleDef.description,
          condition: JSON.stringify(ruleDef.condition),
          tagId,
        },
        create: {
          id: uuid(),
          tenantId: tenant.id,
          name: ruleDef.name,
          description: ruleDef.description,
          condition: JSON.stringify(ruleDef.condition),
          tagId,
          isActive: true,
          priority: 10,
          createdById: superAdmin.id,
        },
      });
    }
  }
  console.log(`   ✅ ${autoTagRules.length} auto-tag rules seeded\n`);

  // ─── 12. Seed Audit Log Entry ──────────────────────────────────
  await prisma.auditLog.create({
    data: {
      id: uuid(),
      tenantId: tenant.id,
      actorId: superAdmin.id,
      actorType: "system",
      action: "system.seed",
      result: "success",
      details: JSON.stringify({ event: "Database seeded — Phase 2 production bootstrap" }),
    },
  });

  // ─── Summary ─────────────────────────────────────────────────────
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  ✅ SEED COMPLETED — Exargen Production (Phase 2)");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  ${CAPABILITIES.length} capabilities · ${BUILTIN_ROLES.length} roles · 6 scopes`);
  console.log(`  ${tagDefinitions.length} tags · ${assetDefinitions.length} assets · ${autoTagRules.length} auto-tag rules`);
  console.log("  1 user (Super Admin)");
  console.log("");
  console.log("  Login Credentials:");
  console.log("  └─ Platform Admin:  admin@exargen.com / Admin123!");
  console.log("═══════════════════════════════════════════════════════════");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
