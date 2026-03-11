import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";
import crypto from "crypto";
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
    { name: "exg-web-prod-01", type: "server", hostname: "exg-web-prod-01.exargen.io", ipAddress: "10.0.1.10", os: "Ubuntu 22.04 LTS", criticality: "critical", assetOwner: "Platform Engineering", tags: ["env:production", "region:us-east-1", "team:platform", "criticality:tier-1"] },
    { name: "exg-web-prod-02", type: "server", hostname: "exg-web-prod-02.exargen.io", ipAddress: "10.0.1.11", os: "Ubuntu 22.04 LTS", criticality: "critical", assetOwner: "Platform Engineering", tags: ["env:production", "region:us-east-1", "team:platform", "criticality:tier-1"] },
    { name: "exg-api-prod-01", type: "server", hostname: "exg-api-prod-01.exargen.io", ipAddress: "10.0.2.10", os: "Ubuntu 22.04 LTS", criticality: "critical", assetOwner: "Platform Engineering", tags: ["env:production", "region:us-east-1", "team:platform", "criticality:tier-1"] },
    { name: "exg-db-prod-01", type: "database", hostname: "exg-db-prod-01.exargen.io", ipAddress: "10.0.3.10", os: "PostgreSQL 16", criticality: "critical", assetOwner: "Data Engineering", tags: ["env:production", "region:us-east-1", "team:data", "criticality:tier-1"] },
    { name: "exg-web-staging-01", type: "server", hostname: "exg-web-staging-01.exargen.io", ipAddress: "10.1.1.10", os: "Ubuntu 22.04 LTS", criticality: "medium", assetOwner: "Platform Engineering", tags: ["env:staging", "region:us-east-1", "team:platform"] },
    { name: "exg-api-staging-01", type: "server", hostname: "exg-api-staging-01.exargen.io", ipAddress: "10.1.2.10", os: "Ubuntu 22.04 LTS", criticality: "medium", assetOwner: "Platform Engineering", tags: ["env:staging", "region:us-east-1", "team:platform"] },
    { name: "exg-siem-prod-01", type: "server", hostname: "exg-siem-prod-01.exargen.io", ipAddress: "10.0.5.10", os: "CentOS 8", criticality: "high", assetOwner: "Security Operations", tags: ["env:production", "region:us-east-1", "team:security", "criticality:tier-1"] },
    { name: "exg-fw-prod-01", type: "network_device", hostname: "exg-fw-prod-01.exargen.io", ipAddress: "10.0.0.1", os: "Palo Alto PAN-OS 11", criticality: "critical", assetOwner: "Security Operations", tags: ["env:production", "region:us-east-1", "team:security", "criticality:tier-1"] },
    { name: "exg-vpn-eu-01", type: "network_device", hostname: "exg-vpn-eu-01.exargen.io", ipAddress: "10.2.0.1", os: "WireGuard", criticality: "high", assetOwner: "Security Operations", tags: ["env:production", "region:eu-west-1", "team:security", "criticality:tier-2"] },
    { name: "exg-web-eu-01", type: "server", hostname: "exg-web-eu-01.exargen.io", ipAddress: "10.2.1.10", os: "Ubuntu 22.04 LTS", criticality: "high", assetOwner: "EU Operations", tags: ["env:production", "region:eu-west-1", "team:platform", "criticality:tier-2"] },
    { name: "exg-app-dev-01", type: "cloud_resource", hostname: "exg-app-dev-01.exargen.io", ipAddress: "10.3.1.10", os: "AWS ECS Fargate", criticality: "low", assetOwner: "DevOps", tags: ["env:development", "region:ap-south-1", "team:platform"] },
    { name: "exg-ml-data-01", type: "server", hostname: "exg-ml-data-01.exargen.io", ipAddress: "10.0.6.10", os: "Ubuntu 22.04 LTS", criticality: "high", assetOwner: "Data Engineering", tags: ["env:production", "region:us-east-1", "team:data", "criticality:tier-2"] },
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
          assetOwner: assetDef.assetOwner || null,
          status: "active",
        },
      });
    } else {
      // Update existing asset to ensure seed data is current
      asset = await prisma.asset.update({
        where: { id: asset.id },
        data: {
          type: assetDef.type,
          hostname: assetDef.hostname,
          ipAddress: assetDef.ipAddress,
          os: assetDef.os,
          criticality: assetDef.criticality,
          assetOwner: assetDef.assetOwner || null,
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

  // ─── 12. Seed Audit Events with Hash Chain ────────────────────
  console.log("📝 Seeding audit events with hash chain...");

  function computeHash(prevHash: string, tenantId: string, action: string, actorId: string | null, timestamp: string): string {
    const payload = `${prevHash}|${tenantId}|${action}|${actorId || "system"}|${timestamp}`;
    return crypto.createHash("sha256").update(payload).digest("hex");
  }

  // Clear existing audit logs for clean re-seed
  await prisma.auditLog.deleteMany({ where: { tenantId: tenant.id } });

  const DAY = 24 * 60 * 60 * 1000;
  const HOUR = 60 * 60 * 1000;
  const MIN = 60 * 1000;

  const auditEvents = [
    {
      action: "system.seed",
      actorId: null,
      actorType: "system",
      resourceType: null,
      resourceId: null,
      result: "success",
      details: { event: "Database seeded — Phase 4 production bootstrap" },
      ipAddress: null,
      userAgent: null,
      offset: 4 * DAY + 6 * HOUR,
    },
    {
      action: "user.login",
      actorId: superAdmin.id,
      actorType: "user",
      resourceType: "user",
      resourceId: superAdmin.id,
      result: "success",
      details: { method: "password", mfa: false },
      ipAddress: "203.0.113.42",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0",
      offset: 4 * DAY + 5 * HOUR,
    },
    {
      action: "role.created",
      actorId: superAdmin.id,
      actorType: "user",
      resourceType: "role",
      resourceId: roleMap["platform-admin"],
      result: "success",
      details: { roleName: "Platform Administrator", capabilities: 42 },
      ipAddress: "203.0.113.42",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0",
      offset: 4 * DAY + 4 * HOUR + 30 * MIN,
    },
    {
      action: "user.invited",
      actorId: superAdmin.id,
      actorType: "user",
      resourceType: "user",
      resourceId: null,
      result: "success",
      details: { email: "analyst@exargen.com", role: "Security Analyst" },
      ipAddress: "203.0.113.42",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0",
      offset: 3 * DAY + 8 * HOUR,
    },
    {
      action: "user.login_failed",
      actorId: null,
      actorType: "user",
      resourceType: "user",
      resourceId: null,
      result: "denied",
      details: { email: "analyst@exargen.com", reason: "invalid_password", attempt: 1 },
      ipAddress: "198.51.100.17",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15",
      offset: 3 * DAY + 2 * HOUR,
    },
    {
      action: "user.login_failed",
      actorId: null,
      actorType: "user",
      resourceType: "user",
      resourceId: null,
      result: "denied",
      details: { email: "analyst@exargen.com", reason: "invalid_password", attempt: 2 },
      ipAddress: "198.51.100.17",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15",
      offset: 3 * DAY + 2 * HOUR - 30000,
    },
    {
      action: "user.login",
      actorId: superAdmin.id,
      actorType: "user",
      resourceType: "user",
      resourceId: superAdmin.id,
      result: "success",
      details: { method: "password", mfa: false },
      ipAddress: "198.51.100.17",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15",
      offset: 2 * DAY + 10 * HOUR,
    },
    {
      action: "asset.created",
      actorId: superAdmin.id,
      actorType: "user",
      resourceType: "asset",
      resourceId: null,
      result: "success",
      details: { assetName: "exg-web-prod-01", type: "server" },
      ipAddress: "203.0.113.42",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0",
      offset: 2 * DAY + 9 * HOUR,
    },
    {
      action: "scan.started",
      actorId: superAdmin.id,
      actorType: "user",
      resourceType: "scan",
      resourceId: null,
      result: "success",
      details: { scanType: "vulnerability", targets: 12 },
      ipAddress: "203.0.113.42",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0",
      offset: 2 * DAY + 6 * HOUR,
    },
    {
      action: "scan.completed",
      actorId: null,
      actorType: "system",
      resourceType: "scan",
      resourceId: null,
      result: "success",
      details: { scanType: "vulnerability", findings: 47, critical: 3, high: 12, medium: 18, low: 14 },
      ipAddress: null,
      userAgent: null,
      offset: 2 * DAY + 5 * HOUR,
    },
    {
      action: "compliance.update",
      actorId: superAdmin.id,
      actorType: "user",
      resourceType: "compliance",
      resourceId: null,
      result: "success",
      details: { framework: "PCI DSS v4.0", controlsUpdated: 4, status: "partial" },
      ipAddress: "203.0.113.42",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0",
      offset: 1 * DAY + 14 * HOUR,
    },
    {
      action: "report.generated",
      actorId: superAdmin.id,
      actorType: "user",
      resourceType: "report",
      resourceId: null,
      result: "success",
      details: { reportType: "executive_summary", format: "pdf", period: "2026-Q1" },
      ipAddress: "203.0.113.42",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0",
      offset: 1 * DAY + 12 * HOUR,
    },
    {
      action: "role.assigned",
      actorId: superAdmin.id,
      actorType: "user",
      resourceType: "user_role",
      resourceId: null,
      result: "success",
      details: { userId: "analyst-placeholder", role: "Security Analyst" },
      ipAddress: "203.0.113.42",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0",
      offset: 1 * DAY + 8 * HOUR,
    },
    {
      action: "apikey.created",
      actorId: superAdmin.id,
      actorType: "user",
      resourceType: "api_key",
      resourceId: null,
      result: "success",
      details: { keyName: "SIEM Integration Key", permissions: ["read:alerts", "write:events"], expiresIn: "90d" },
      ipAddress: "203.0.113.42",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0",
      offset: 12 * HOUR,
    },
    {
      action: "user.login",
      actorId: superAdmin.id,
      actorType: "user",
      resourceType: "user",
      resourceId: superAdmin.id,
      result: "success",
      details: { method: "password", mfa: false },
      ipAddress: "203.0.113.42",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0",
      offset: 2 * HOUR,
    },
  ];

  // Map action → category
  function getCategory(action: string): string {
    if (action.startsWith("user.login") || action === "user.login_failed") return "auth";
    if (action.startsWith("role.") || action.startsWith("capability.")) return "rbac";
    if (["asset.created", "tag.", "scope.", "scan.started", "scan.completed", "compliance.update", "report.generated"].some(p => action.startsWith(p) || action === p)) return "data";
    if (action.startsWith("user.") && !action.startsWith("user.login")) return "admin";
    if (action.startsWith("apikey.")) return "security";
    return "system";
  }

  // Map action → severity
  function getSeverity(action: string): string {
    if (action === "user.login_failed") return "medium";
    if (action === "user.suspended") return "high";
    if (action === "account.locked") return "critical";
    if (["role.created", "user.invited", "apikey.created"].includes(action)) return "low";
    return "info";
  }

  let prevHash = "GENESIS";

  for (const evt of auditEvents) {
    const timestamp = new Date(Date.now() - evt.offset);
    const hash = computeHash(prevHash, tenant.id, evt.action, evt.actorId, timestamp.toISOString());
    prevHash = hash;

    await prisma.auditLog.create({
      data: {
        id: uuid(),
        tenantId: tenant.id,
        actorId: evt.actorId,
        actorType: evt.actorType,
        action: evt.action,
        resourceType: evt.resourceType,
        resourceId: evt.resourceId,
        result: evt.result,
        details: JSON.stringify(evt.details),
        category: getCategory(evt.action),
        severity: getSeverity(evt.action),
        ipAddress: evt.ipAddress,
        userAgent: evt.userAgent,
        integrityHash: hash,
        createdAt: timestamp,
      },
    });
  }
  console.log(`   ✅ ${auditEvents.length} audit events seeded with SHA-256 hash chain\n`);

  // ─── 13. Seed Demo Sessions ──────────────────────────────────────
  console.log("🔑 Seeding demo sessions...");

  // Clear existing sessions for clean re-seed
  await prisma.session.deleteMany({ where: { tenantId: tenant.id } });

  const sessionDefinitions = [
    {
      device: "Chrome on Windows 11",
      ipAddress: "203.0.113.42",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0",
      city: "San Francisco",
      country: "US",
      isActive: true,
      revokedAt: null as Date | null,
      lastActiveOffset: 5 * MIN,
      expiresOffset: -(7 * DAY),   // 7 days from now (negative = future)
    },
    {
      device: "Safari on macOS",
      ipAddress: "198.51.100.17",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15",
      city: "London",
      country: "GB",
      isActive: true,
      revokedAt: null as Date | null,
      lastActiveOffset: 3 * HOUR,
      expiresOffset: -(5 * DAY),   // 5 days from now
    },
    {
      device: "Firefox on Linux",
      ipAddress: "192.0.2.88",
      userAgent: "Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0",
      city: "Berlin",
      country: "DE",
      isActive: false,
      revokedAt: new Date(Date.now() - 2 * DAY) as Date | null,
      lastActiveOffset: 3 * DAY,
      expiresOffset: 1 * DAY,      // already expired (positive = past)
    },
  ];

  for (let i = 0; i < sessionDefinitions.length; i++) {
    const sess = sessionDefinitions[i];
    await prisma.session.create({
      data: {
        id: uuid(),
        tenantId: tenant.id,
        userId: superAdmin.id,
        tokenHash: crypto.createHash("sha256").update(`demo-session-${i}`).digest("hex"),
        ipAddress: sess.ipAddress,
        userAgent: sess.userAgent,
        device: sess.device,
        city: sess.city,
        country: sess.country,
        isActive: sess.isActive,
        lastActiveAt: new Date(Date.now() - sess.lastActiveOffset),
        expiresAt: new Date(Date.now() - sess.expiresOffset),
        revokedAt: sess.revokedAt,
      },
    });
  }
  console.log(`   ✅ ${sessionDefinitions.length} demo sessions seeded\n`);

  // ─── 14. Seed Compliance Frameworks & Controls ──────────────────
  console.log("📋 Seeding compliance frameworks...");

  // Clean existing compliance data for re-seed
  await prisma.complianceControl.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.complianceFramework.deleteMany({ where: { tenantId: tenant.id } });

  const gdprFw = await prisma.complianceFramework.create({
    data: {
      id: uuid(),
      tenantId: tenant.id,
      name: "GDPR",
      version: "2016/679",
      description: "General Data Protection Regulation — EU data privacy and security law",
      isActive: true,
    },
  });

  const pciDssFw = await prisma.complianceFramework.create({
    data: {
      id: uuid(),
      tenantId: tenant.id,
      name: "PCI DSS",
      version: "4.0",
      description: "Payment Card Industry Data Security Standard",
      isActive: true,
    },
  });

  const hipaaFw = await prisma.complianceFramework.create({
    data: {
      id: uuid(),
      tenantId: tenant.id,
      name: "HIPAA",
      version: "2013",
      description: "Health Insurance Portability and Accountability Act — Security Rule",
      isActive: true,
    },
  });

  const cisFw = await prisma.complianceFramework.create({
    data: {
      id: uuid(),
      tenantId: tenant.id,
      name: "CIS Controls",
      version: "8.1",
      description: "CIS Critical Security Controls v8.1 — Prioritized cybersecurity best practices",
      isActive: true,
    },
  });

  const nistCsfFw = await prisma.complianceFramework.create({
    data: {
      id: uuid(),
      tenantId: tenant.id,
      name: "NIST CSF",
      version: "2.0",
      description: "NIST Cybersecurity Framework 2.0 — Govern, Identify, Protect, Detect, Respond, Recover",
      isActive: true,
    },
  });

  // GDPR controls (10 controls)
  const gdprControls = [
    { controlId: "Art. 5", title: "Principles of Processing", category: "Data Protection", status: "compliant" },
    { controlId: "Art. 6", title: "Lawfulness of Processing", category: "Data Protection", status: "compliant" },
    { controlId: "Art. 12", title: "Transparent Communication", category: "Transparency", status: "compliant" },
    { controlId: "Art. 17", title: "Right to Erasure", category: "Data Subject Rights", status: "partially_compliant" },
    { controlId: "Art. 20", title: "Right to Data Portability", category: "Data Subject Rights", status: "partially_compliant" },
    { controlId: "Art. 25", title: "Data Protection by Design", category: "Technical Measures", status: "compliant" },
    { controlId: "Art. 30", title: "Records of Processing", category: "Documentation", status: "compliant" },
    { controlId: "Art. 32", title: "Security of Processing", category: "Technical Measures", status: "compliant" },
    { controlId: "Art. 33", title: "Breach Notification (72h)", category: "Incident Response", status: "non_compliant" },
    { controlId: "Art. 35", title: "Data Protection Impact Assessment", category: "Risk Assessment", status: "not_assessed" },
  ];

  // PCI DSS controls (12 controls)
  const pciDssControls = [
    { controlId: "Req. 1", title: "Install and Maintain Network Security Controls", category: "Network Security", status: "compliant" },
    { controlId: "Req. 2", title: "Apply Secure Configurations", category: "System Security", status: "compliant" },
    { controlId: "Req. 3", title: "Protect Stored Account Data", category: "Data Protection", status: "partially_compliant" },
    { controlId: "Req. 4", title: "Protect Cardholder Data in Transit", category: "Encryption", status: "compliant" },
    { controlId: "Req. 5", title: "Protect Against Malicious Software", category: "Malware Protection", status: "compliant" },
    { controlId: "Req. 6", title: "Develop and Maintain Secure Systems", category: "Secure Development", status: "partially_compliant" },
    { controlId: "Req. 7", title: "Restrict Access by Business Need", category: "Access Control", status: "compliant" },
    { controlId: "Req. 8", title: "Identify Users and Authenticate", category: "Authentication", status: "compliant" },
    { controlId: "Req. 9", title: "Restrict Physical Access", category: "Physical Security", status: "not_assessed" },
    { controlId: "Req. 10", title: "Log and Monitor Access", category: "Monitoring", status: "compliant" },
    { controlId: "Req. 11", title: "Test Security Regularly", category: "Security Testing", status: "non_compliant" },
    { controlId: "Req. 12", title: "Maintain Information Security Policy", category: "Policy", status: "partially_compliant" },
  ];

  // HIPAA controls (11 controls)
  const hipaaControls = [
    { controlId: "164.308(a)(1)", title: "Security Management Process", category: "Administrative", status: "compliant" },
    { controlId: "164.308(a)(3)", title: "Workforce Security", category: "Administrative", status: "compliant" },
    { controlId: "164.308(a)(4)", title: "Information Access Management", category: "Administrative", status: "partially_compliant" },
    { controlId: "164.308(a)(5)", title: "Security Awareness Training", category: "Administrative", status: "non_compliant" },
    { controlId: "164.308(a)(6)", title: "Security Incident Procedures", category: "Administrative", status: "partially_compliant" },
    { controlId: "164.308(a)(7)", title: "Contingency Plan", category: "Administrative", status: "not_assessed" },
    { controlId: "164.310(a)", title: "Facility Access Controls", category: "Physical", status: "compliant" },
    { controlId: "164.310(d)", title: "Device and Media Controls", category: "Physical", status: "compliant" },
    { controlId: "164.312(a)", title: "Access Control (Technical)", category: "Technical", status: "compliant" },
    { controlId: "164.312(c)", title: "Integrity Controls", category: "Technical", status: "compliant" },
    { controlId: "164.312(e)", title: "Transmission Security", category: "Technical", status: "compliant" },
  ];

  // CIS Controls v8.1 (18 control groups)
  const cisControls = [
    { controlId: "CIS.1", title: "Inventory and Control of Enterprise Assets", category: "Asset Management", status: "compliant" },
    { controlId: "CIS.2", title: "Inventory and Control of Software Assets", category: "Asset Management", status: "partially_compliant" },
    { controlId: "CIS.3", title: "Data Protection", category: "Data Protection", status: "partially_compliant" },
    { controlId: "CIS.4", title: "Secure Configuration of Enterprise Assets and Software", category: "Configuration Management", status: "compliant" },
    { controlId: "CIS.5", title: "Account Management", category: "Identity & Access", status: "compliant" },
    { controlId: "CIS.6", title: "Access Control Management", category: "Identity & Access", status: "compliant" },
    { controlId: "CIS.7", title: "Continuous Vulnerability Management", category: "Vulnerability Management", status: "non_compliant" },
    { controlId: "CIS.8", title: "Audit Log Management", category: "Audit & Accountability", status: "compliant" },
    { controlId: "CIS.9", title: "Email and Web Browser Protections", category: "Network Defense", status: "partially_compliant" },
    { controlId: "CIS.10", title: "Malware Defenses", category: "Endpoint Security", status: "compliant" },
    { controlId: "CIS.11", title: "Data Recovery", category: "Data Protection", status: "not_assessed" },
    { controlId: "CIS.12", title: "Network Infrastructure Management", category: "Network Security", status: "compliant" },
    { controlId: "CIS.13", title: "Network Monitoring and Defense", category: "Network Defense", status: "partially_compliant" },
    { controlId: "CIS.14", title: "Security Awareness and Skills Training", category: "Workforce Security", status: "non_compliant" },
    { controlId: "CIS.15", title: "Service Provider Management", category: "Third-Party Risk", status: "not_assessed" },
    { controlId: "CIS.16", title: "Application Software Security", category: "Secure Development", status: "partially_compliant" },
    { controlId: "CIS.17", title: "Incident Response Management", category: "Incident Response", status: "compliant" },
    { controlId: "CIS.18", title: "Penetration Testing", category: "Security Testing", status: "non_compliant" },
  ];

  // NIST CSF 2.0 (22 category-level controls across 6 functions)
  const nistCsfControls = [
    // GOVERN function
    { controlId: "GV.OC", title: "Organizational Context", category: "GOVERN", status: "compliant" },
    { controlId: "GV.RM", title: "Risk Management Strategy", category: "GOVERN", status: "partially_compliant" },
    { controlId: "GV.RR", title: "Roles, Responsibilities, and Authorities", category: "GOVERN", status: "compliant" },
    { controlId: "GV.PO", title: "Policy", category: "GOVERN", status: "partially_compliant" },
    { controlId: "GV.OV", title: "Oversight", category: "GOVERN", status: "compliant" },
    { controlId: "GV.SC", title: "Cybersecurity Supply Chain Risk Management", category: "GOVERN", status: "not_assessed" },
    // IDENTIFY function
    { controlId: "ID.AM", title: "Asset Management", category: "IDENTIFY", status: "compliant" },
    { controlId: "ID.RA", title: "Risk Assessment", category: "IDENTIFY", status: "partially_compliant" },
    { controlId: "ID.IM", title: "Improvement", category: "IDENTIFY", status: "not_assessed" },
    // PROTECT function
    { controlId: "PR.AA", title: "Identity Management, Authentication, and Access Control", category: "PROTECT", status: "compliant" },
    { controlId: "PR.AT", title: "Awareness and Training", category: "PROTECT", status: "non_compliant" },
    { controlId: "PR.DS", title: "Data Security", category: "PROTECT", status: "compliant" },
    { controlId: "PR.PS", title: "Platform Security", category: "PROTECT", status: "compliant" },
    { controlId: "PR.IR", title: "Technology Infrastructure Resilience", category: "PROTECT", status: "partially_compliant" },
    // DETECT function
    { controlId: "DE.CM", title: "Continuous Monitoring", category: "DETECT", status: "partially_compliant" },
    { controlId: "DE.AE", title: "Adverse Event Analysis", category: "DETECT", status: "compliant" },
    // RESPOND function
    { controlId: "RS.MA", title: "Incident Management", category: "RESPOND", status: "compliant" },
    { controlId: "RS.AN", title: "Incident Analysis", category: "RESPOND", status: "partially_compliant" },
    { controlId: "RS.CO", title: "Incident Response Reporting and Communication", category: "RESPOND", status: "non_compliant" },
    { controlId: "RS.MI", title: "Incident Mitigation", category: "RESPOND", status: "compliant" },
    // RECOVER function
    { controlId: "RC.RP", title: "Incident Recovery Plan Execution", category: "RECOVER", status: "not_assessed" },
    { controlId: "RC.CO", title: "Incident Recovery Communication", category: "RECOVER", status: "partially_compliant" },
  ];

  const allControls = [
    ...gdprControls.map(c => ({ ...c, frameworkId: gdprFw.id })),
    ...pciDssControls.map(c => ({ ...c, frameworkId: pciDssFw.id })),
    ...hipaaControls.map(c => ({ ...c, frameworkId: hipaaFw.id })),
    ...cisControls.map(c => ({ ...c, frameworkId: cisFw.id })),
    ...nistCsfControls.map(c => ({ ...c, frameworkId: nistCsfFw.id })),
  ];

  for (const ctrl of allControls) {
    await prisma.complianceControl.upsert({
      where: {
        frameworkId_controlId: {
          frameworkId: ctrl.frameworkId,
          controlId: ctrl.controlId,
        },
      },
      update: {
        title: ctrl.title,
        category: ctrl.category,
        status: ctrl.status,
      },
      create: {
        id: uuid(),
        tenantId: tenant.id,
        frameworkId: ctrl.frameworkId,
        controlId: ctrl.controlId,
        title: ctrl.title,
        category: ctrl.category,
        status: ctrl.status,
        lastAssessedAt: ctrl.status !== "not_assessed" ? new Date(Date.now() - Math.random() * 7 * DAY) : null,
        nextReviewAt: new Date(Date.now() + 30 * DAY + Math.random() * 60 * DAY),
      },
    });
  }
  console.log(`   ✅ 5 frameworks, ${allControls.length} controls seeded\n`);

  // ─── 15. Clean Up Leftover Test Data ──────────────────────────────
  console.log("🧹 Cleaning up leftover test data...");

  // Remove non-builtin custom roles (leftover from E2E tests)
  const customRoleCleanup = await prisma.role.deleteMany({
    where: { tenantId: tenant.id, isBuiltin: false },
  });
  if (customRoleCleanup.count > 0) {
    console.log(`   🧹 Removed ${customRoleCleanup.count} leftover custom roles`);
  }

  // Remove test users (anyone not in the seed list)
  const seedEmails = ["admin@exargen.com", "analyst@exargen.com", "auditor@exargen.com", "viewer@exargen.com", "orgadmin@exargen.com"];
  const testUserCleanup = await prisma.user.deleteMany({
    where: { tenantId: tenant.id, email: { notIn: seedEmails } },
  });
  if (testUserCleanup.count > 0) {
    console.log(`   🧹 Removed ${testUserCleanup.count} leftover test users`);
  }
  console.log("   ✅ Cleanup complete\n");

  // ─── 16. Seed Demo Users (4 roles for manual testing) ────────────
  console.log("👥 Creating demo users with different roles...");

  const demoUsers = [
    {
      email: "analyst@exargen.com",
      name: "Sarah Chen",
      password: "Analyst123!",
      department: "Security Operations",
      roleSlug: "security-analyst",
      scopeName: "Production Only",
    },
    {
      email: "auditor@exargen.com",
      name: "James Wilson",
      password: "Auditor123!",
      department: "Compliance & Audit",
      roleSlug: "auditor",
      scopeName: "Global",
    },
    {
      email: "viewer@exargen.com",
      name: "Emily Rodriguez",
      password: "Viewer123!",
      department: "Executive",
      roleSlug: "viewer",
      scopeName: "EU Operations",
    },
    {
      email: "orgadmin@exargen.com",
      name: "Michael Park",
      password: "OrgAdmin123!",
      department: "IT Administration",
      roleSlug: "org-admin",
      scopeName: "Global",
    },
  ];

  for (const userDef of demoUsers) {
    const userHash = await bcrypt.hash(userDef.password, 12);

    const demoUser = await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: userDef.email } },
      update: { passwordHash: userHash, name: userDef.name, department: userDef.department },
      create: {
        id: uuid(),
        tenantId: tenant.id,
        email: userDef.email,
        name: userDef.name,
        passwordHash: userHash,
        status: "active",
        mfaEnabled: false,
        department: userDef.department,
      },
    });

    // Assign role — clean existing roles first to prevent stale multi-role assignments
    const demoRoleId = roleMap[userDef.roleSlug];
    if (demoRoleId) {
      await prisma.userRole.deleteMany({ where: { userId: demoUser.id } });
      await prisma.userRole.create({
        data: { id: uuid(), userId: demoUser.id, roleId: demoRoleId },
      });
    }

    // Assign scope
    const demoScope = await prisma.scope.findFirst({
      where: { tenantId: tenant.id, name: userDef.scopeName },
    });
    if (demoScope) {
      await prisma.userScope.upsert({
        where: { userId_scopeId: { userId: demoUser.id, scopeId: demoScope.id } },
        update: {},
        create: { userId: demoUser.id, scopeId: demoScope.id },
      });
    }

    console.log(`   👤 ${demoUser.name} (${demoUser.email}) → ${userDef.roleSlug} / ${userDef.scopeName}`);
  }
  console.log(`   ✅ ${demoUsers.length} demo users created\n`);

  // ─── 17. Seed Scans & Findings (Phase 7) ───────────────────────
  console.log("🔍 Seeding scans and findings...");

  // Clean old scan data for re-seed
  await prisma.scanResult.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.scan.deleteMany({ where: { tenantId: tenant.id } });

  // Find some assets to link findings to
  const prodWebAsset = await prisma.asset.findFirst({ where: { tenantId: tenant.id, name: "exg-web-prod-01" } });
  const prodApiAsset = await prisma.asset.findFirst({ where: { tenantId: tenant.id, name: "exg-api-prod-01" } });
  const prodDbAsset = await prisma.asset.findFirst({ where: { tenantId: tenant.id, name: "exg-db-prod-01" } });
  const stagingAsset = await prisma.asset.findFirst({ where: { tenantId: tenant.id, name: "exg-web-staging-01" } });
  const firewallAsset = await prisma.asset.findFirst({ where: { tenantId: tenant.id, name: "exg-fw-prod-01" } });

  const scan1 = await prisma.scan.create({
    data: {
      id: uuid(), tenantId: tenant.id, name: "Infrastructure Vulnerability Scan",
      type: "vulnerability", status: "completed",
      targets: JSON.stringify(["10.0.1.10", "10.0.2.10", "10.0.3.10"]),
      progress: JSON.stringify({ completedChecks: ["http-headers", "ssl-tls", "exposed-panels", "info-disclosure", "common-cves", "cloud-misconfig"], currentBatch: 3, totalBatches: 3, totalFindings: 12, checkResults: { "http-headers": 4, "ssl-tls": 2, "exposed-panels": 1, "info-disclosure": 2, "common-cves": 2, "cloud-misconfig": 1 } }),
      startedAt: new Date(Date.now() - 2 * DAY), completedAt: new Date(Date.now() - 2 * DAY + 45000),
      createdById: superAdmin.id,
    },
  });

  const scan2 = await prisma.scan.create({
    data: {
      id: uuid(), tenantId: tenant.id, name: "Network Port Assessment",
      type: "port", status: "completed",
      targets: JSON.stringify(["10.0.1.10", "10.0.1.11", "10.0.0.1"]),
      progress: JSON.stringify({ completedChecks: ["port-scan", "http-headers"], currentBatch: 1, totalBatches: 1, totalFindings: 8, checkResults: { "port-scan": 6, "http-headers": 2 } }),
      startedAt: new Date(Date.now() - 1 * DAY), completedAt: new Date(Date.now() - 1 * DAY + 30000),
      createdById: superAdmin.id,
    },
  });

  const scan3 = await prisma.scan.create({
    data: {
      id: uuid(), tenantId: tenant.id, name: "Cloud Configuration Audit",
      type: "compliance", status: "completed",
      targets: JSON.stringify(["10.1.1.10", "10.3.1.10"]),
      progress: JSON.stringify({ completedChecks: ["http-headers", "ssl-tls", "dns-checks", "info-disclosure"], currentBatch: 2, totalBatches: 2, totalFindings: 10, checkResults: { "http-headers": 3, "ssl-tls": 2, "dns-checks": 3, "info-disclosure": 2 } }),
      startedAt: new Date(Date.now() - 12 * HOUR), completedAt: new Date(Date.now() - 12 * HOUR + 35000),
      createdById: superAdmin.id,
    },
  });

  // Update asset lastScanAt
  if (prodWebAsset) await prisma.asset.update({ where: { id: prodWebAsset.id }, data: { lastScanAt: new Date(Date.now() - 2 * DAY) } });
  if (prodApiAsset) await prisma.asset.update({ where: { id: prodApiAsset.id }, data: { lastScanAt: new Date(Date.now() - 2 * DAY) } });
  if (prodDbAsset) await prisma.asset.update({ where: { id: prodDbAsset.id }, data: { lastScanAt: new Date(Date.now() - 2 * DAY) } });
  if (stagingAsset) await prisma.asset.update({ where: { id: stagingAsset.id }, data: { lastScanAt: new Date(Date.now() - 12 * HOUR) } });

  // Scan 1 findings (12)
  const scan1Findings = [
    { severity: "critical", title: "Potential Log4Shell (Log4j RCE) Vulnerability", cveId: "CVE-2021-44228", cvssScore: 10.0, description: "The server may be vulnerable to Log4Shell, a critical RCE in Apache Log4j 2.x.", remediation: "Update Log4j to version 2.17.1 or later.", assetId: prodApiAsset?.id, details: { checkModule: "common-cves", target: "10.0.2.10" } },
    { severity: "critical", title: "Environment File (.env) Accessible", cveId: "CWE-200", cvssScore: 9.8, description: "The .env file is publicly accessible, exposing database credentials and API keys.", remediation: "Block access to .env files. Rotate all exposed credentials immediately.", assetId: prodWebAsset?.id, details: { checkModule: "info-disclosure", path: "/.env", target: "10.0.1.10" } },
    { severity: "high", title: "SSL/TLS Certificate Expiring Within 30 Days", cvssScore: 7.4, description: "The SSL/TLS certificate will expire in 18 days.", remediation: "Renew the SSL/TLS certificate before expiration.", assetId: prodWebAsset?.id, details: { checkModule: "ssl-tls", daysUntilExpiry: 18, target: "10.0.1.10" } },
    { severity: "high", title: "Database Port Exposed to Network", cvssScore: 8.1, description: "PostgreSQL port 5432 is directly accessible from untrusted networks.", remediation: "Restrict database access to application servers only via firewall rules.", assetId: prodDbAsset?.id, details: { checkModule: "port-scan", port: 5432, service: "PostgreSQL", target: "10.0.3.10" } },
    { severity: "high", title: "Administrative Panel Exposed (/admin)", cvssScore: 7.5, description: "An administrative interface is publicly accessible.", remediation: "Restrict admin panel access to internal networks or VPN.", assetId: prodWebAsset?.id, details: { checkModule: "exposed-panels", path: "/admin", target: "10.0.1.10" } },
    { severity: "medium", title: "Missing Content-Security-Policy Header", cvssScore: 5.4, description: "CSP header not set, leaving the application vulnerable to XSS and code injection.", remediation: "Add a Content-Security-Policy header with a restrictive policy.", assetId: prodWebAsset?.id, details: { checkModule: "http-headers", target: "10.0.1.10" } },
    { severity: "medium", title: "Missing Strict-Transport-Security Header", cveId: "CWE-319", cvssScore: 5.9, description: "HSTS header not set, users vulnerable to SSL stripping attacks.", remediation: "Add Strict-Transport-Security: max-age=31536000; includeSubDomains; preload", assetId: prodApiAsset?.id, details: { checkModule: "http-headers", target: "10.0.2.10" } },
    { severity: "medium", title: "Detailed Error Messages Exposed", cveId: "CWE-209", cvssScore: 5.3, description: "The application returns stack traces to end users.", remediation: "Display generic error pages in production. Set DEBUG=false.", assetId: prodApiAsset?.id, details: { checkModule: "info-disclosure", target: "10.0.2.10" } },
    { severity: "medium", title: "Missing X-Frame-Options Header", cvssScore: 4.3, description: "Site vulnerable to clickjacking attacks.", remediation: "Add X-Frame-Options: DENY or SAMEORIGIN", assetId: prodWebAsset?.id, details: { checkModule: "http-headers", target: "10.0.1.10" } },
    { severity: "low", title: "Server Version Information Disclosed", cvssScore: 3.7, description: "The Server header reveals specific software version information.", remediation: "Configure the web server to suppress the Server header.", assetId: prodWebAsset?.id, details: { checkModule: "http-headers", serverHeader: "nginx/1.24.0", target: "10.0.1.10" } },
    { severity: "low", title: "Missing Referrer-Policy Header", cvssScore: 3.1, description: "Referrer information may leak sensitive URL data to third-party sites.", remediation: "Add Referrer-Policy: strict-origin-when-cross-origin", assetId: prodApiAsset?.id, details: { checkModule: "http-headers", target: "10.0.2.10" } },
    { severity: "info", title: "SSH Port (22) Open", cvssScore: 0, description: "SSH port 22 is open and accepting connections.", remediation: "Restrict SSH access via firewall rules to known IP ranges.", assetId: prodWebAsset?.id, details: { checkModule: "port-scan", port: 22, target: "10.0.1.10" } },
  ];

  // Scan 2 findings (8)
  const scan2Findings = [
    { severity: "critical", title: "RDP Port (3389) Open — BlueKeep Risk", cveId: "CVE-2019-0708", cvssScore: 9.8, description: "RDP port exposed, vulnerable to BlueKeep remote code execution.", remediation: "Disable RDP or use NLA, restrict access via VPN.", assetId: prodWebAsset?.id, details: { checkModule: "port-scan", port: 3389, target: "10.0.1.10" } },
    { severity: "high", title: "Telnet Port (23) Open — Unencrypted Protocol", cvssScore: 8.1, description: "Telnet transmits all data including credentials in plaintext.", remediation: "Disable Telnet and use SSH for remote access.", assetId: null, details: { checkModule: "port-scan", port: 23, target: "10.0.0.1" } },
    { severity: "high", title: "Database Port Exposed to Network (MySQL 3306)", cvssScore: 8.1, description: "MySQL port 3306 is directly accessible from untrusted networks.", remediation: "Restrict database access via firewall rules.", assetId: null, details: { checkModule: "port-scan", port: 3306, target: "10.0.1.11" } },
    { severity: "medium", title: "FTP Port (21) Open — Unencrypted File Transfer", cvssScore: 6.5, description: "FTP transmits credentials and data in plaintext.", remediation: "Replace FTP with SFTP. Disable anonymous access.", assetId: prodWebAsset?.id, details: { checkModule: "port-scan", port: 21, target: "10.0.1.10" } },
    { severity: "medium", title: "Missing Content-Security-Policy Header", cvssScore: 5.4, description: "CSP not set on secondary web server.", remediation: "Add Content-Security-Policy header.", assetId: null, details: { checkModule: "http-headers", target: "10.0.1.11" } },
    { severity: "medium", title: "Unexpected Open Port Detected (SMB 445)", cvssScore: 5.3, description: "SMB port 445 is open, potentially exposing file shares.", remediation: "Investigate and close if not needed.", assetId: prodWebAsset?.id, details: { checkModule: "port-scan", port: 445, target: "10.0.1.10" } },
    { severity: "low", title: "X-Powered-By Header Exposed", cvssScore: 3.7, description: "X-Powered-By reveals technology stack (Express).", remediation: "Remove X-Powered-By header.", assetId: prodWebAsset?.id, details: { checkModule: "http-headers", poweredBy: "Express", target: "10.0.1.10" } },
    { severity: "info", title: "SSH Port (22) Open", cvssScore: 0, description: "SSH is accessible on the firewall device.", remediation: "Restrict to management VLAN.", assetId: null, details: { checkModule: "port-scan", port: 22, target: "10.0.0.1" } },
  ];

  // Scan 3 findings (10)
  const scan3Findings = [
    { severity: "high", title: "Self-Signed SSL/TLS Certificate Detected", cveId: "CWE-295", cvssScore: 7.5, description: "Server uses a self-signed certificate, vulnerable to MITM attacks.", remediation: "Replace with a certificate from a trusted CA.", assetId: stagingAsset?.id, details: { checkModule: "ssl-tls", target: "10.1.1.10" } },
    { severity: "high", title: "Weak SSL/TLS Protocol Supported (TLS 1.0/1.1)", cveId: "CVE-2014-3566", cvssScore: 7.5, description: "Server supports deprecated TLS versions with known vulnerabilities.", remediation: "Disable TLS 1.0 and 1.1. Support only TLS 1.2+.", assetId: stagingAsset?.id, details: { checkModule: "ssl-tls", weakProtocols: ["TLS 1.0"], target: "10.1.1.10" } },
    { severity: "medium", title: "Missing SPF Record", cvssScore: 5.3, description: "No SPF record found, enabling email spoofing.", remediation: "Add SPF TXT record to DNS.", assetId: null, details: { checkModule: "dns-checks", domain: "exargen.io", target: "10.1.1.10" } },
    { severity: "medium", title: "Missing DMARC Record", cvssScore: 5.3, description: "No DMARC record found, no email authentication reporting.", remediation: "Add DMARC TXT record at _dmarc.exargen.io.", assetId: null, details: { checkModule: "dns-checks", domain: "exargen.io", target: "10.1.1.10" } },
    { severity: "medium", title: "Missing Content-Security-Policy Header", cvssScore: 5.4, description: "CSP not set on staging server.", remediation: "Add Content-Security-Policy header.", assetId: stagingAsset?.id, details: { checkModule: "http-headers", target: "10.1.1.10" } },
    { severity: "medium", title: "Directory Listing Enabled", cveId: "CWE-548", cvssScore: 5.3, description: "Web server has directory listing enabled.", remediation: "Disable directory listing. For Nginx: autoindex off;", assetId: null, details: { checkModule: "info-disclosure", target: "10.3.1.10" } },
    { severity: "medium", title: "Git Repository (.git) Exposed", cveId: "CWE-538", cvssScore: 9.1, description: "The .git directory is accessible, allowing source code reconstruction.", remediation: "Block access to .git directories.", assetId: null, details: { checkModule: "info-disclosure", target: "10.3.1.10" } },
    { severity: "low", title: "Missing DNSSEC", cvssScore: 3.7, description: "DNSSEC not configured for the domain.", remediation: "Enable DNSSEC through your DNS provider.", assetId: null, details: { checkModule: "dns-checks", target: "10.1.1.10" } },
    { severity: "low", title: "Missing Permissions-Policy Header", cvssScore: 2.6, description: "Browser features like camera/microphone not restricted.", remediation: "Add Permissions-Policy header.", assetId: stagingAsset?.id, details: { checkModule: "http-headers", target: "10.1.1.10" } },
    { severity: "low", title: "Missing X-Content-Type-Options Header", cvssScore: 3.1, description: "Browsers may perform MIME-type sniffing.", remediation: "Add X-Content-Type-Options: nosniff", assetId: stagingAsset?.id, details: { checkModule: "http-headers", target: "10.1.1.10" } },
  ];

  for (const findings of [
    { scanId: scan1.id, items: scan1Findings },
    { scanId: scan2.id, items: scan2Findings },
    { scanId: scan3.id, items: scan3Findings },
  ]) {
    await prisma.scanResult.createMany({
      data: findings.items.map(f => ({
        id: uuid(),
        tenantId: tenant.id,
        scanId: findings.scanId,
        severity: f.severity,
        title: f.title,
        description: f.description,
        cveId: f.cveId || null,
        cvssScore: f.cvssScore,
        status: "open",
        remediation: f.remediation,
        assetId: f.assetId || null,
        details: JSON.stringify(f.details),
      })),
    });
  }
  // Phase 8: Scan 4 — Asset Discovery scan
  const scan4 = await prisma.scan.create({
    data: {
      id: uuid(), tenantId: tenant.id, name: "Enterprise Asset Discovery",
      type: "discovery", status: "completed",
      targets: JSON.stringify(["10.0.1.10", "10.0.2.10", "10.0.3.10", "10.0.0.1"]),
      progress: JSON.stringify({ completedChecks: ["network-discovery", "port-scan", "service-detection", "os-fingerprint", "cloud-inventory", "dns-checks", "cloud-misconfig"], currentBatch: 4, totalBatches: 4, totalFindings: 8, checkResults: { "network-discovery": 1, "port-scan": 2, "service-detection": 1, "os-fingerprint": 2, "cloud-inventory": 1, "dns-checks": 0, "cloud-misconfig": 1 } }),
      startedAt: new Date(Date.now() - 6 * HOUR), completedAt: new Date(Date.now() - 6 * HOUR + 45000),
      createdById: superAdmin.id,
    },
  });

  const scan4Findings = [
    { severity: "info", title: "Host Discovery: 10.0.1.10 is Active", description: "Host 10.0.1.10 was found active with 8 open ports. Device classification: server.", remediation: "Verify host is authorized and properly inventoried.", assetId: prodWebAsset?.id, details: { checkModule: "network-discovery", target: "10.0.1.10", hostname: "exg-web-prod-01", openPorts: [22, 80, 443, 8080], deviceType: "server", discoveryMethod: "tcp_probe" } },
    { severity: "info", title: "OS Fingerprint: 10.0.1.10 — Linux (Ubuntu)", description: "Operating system identified as Linux (Ubuntu) with 75% confidence using ssh_banner, http_server_header methods.", remediation: "Ensure OS is up to date with all security patches.", assetId: prodWebAsset?.id, details: { checkModule: "os-fingerprint", target: "10.0.1.10", osFamily: "Linux", osVersion: "Ubuntu", confidence: 75, methods: ["ssh_banner", "http_server_header"] } },
    { severity: "info", title: "OS Fingerprint: 10.0.0.1 — Cisco/Network Device", description: "Operating system identified as Cisco IOS with 60% confidence using port_profile method.", remediation: "Ensure network device firmware is up to date.", assetId: null, details: { checkModule: "os-fingerprint", target: "10.0.0.1", osFamily: "Cisco/Network Device", osVersion: "Cisco IOS", confidence: 60, methods: ["port_profile"] } },
    { severity: "info", title: "Service Detection: 4 Services Identified on 10.0.1.10", description: "Service version detection identified 4 running services on 10.0.1.10.", remediation: "Review all detected services. Update any with known vulnerabilities.", assetId: prodWebAsset?.id, details: { checkModule: "service-detection", target: "10.0.1.10", serviceCount: 4, services: [{ port: 22, protocol: "tcp", service: "ssh", product: "OpenSSH", version: "8.9p1", banner: "SSH-2.0-OpenSSH_8.9p1 Ubuntu-3ubuntu0.6" }, { port: 80, protocol: "tcp", service: "http", product: "nginx", version: "1.24.0", banner: "HTTP/1.1 200 OK\r\nServer: nginx/1.24.0" }, { port: 443, protocol: "tcp", service: "https", product: "nginx", version: "1.24.0", banner: null }, { port: 5432, protocol: "tcp", service: "postgresql", product: "PostgreSQL", version: null, banner: null }] } },
    { severity: "info", title: "Port Scan Summary: 12 Open Ports on 10.0.1.10", description: "TCP/UDP port scan discovered 12 open TCP ports and 0 responsive UDP services.", remediation: "Review all open ports and ensure only required services are exposed.", assetId: prodWebAsset?.id, details: { checkModule: "port-scan", target: "10.0.1.10", totalOpen: 12, tcpOpen: 12, udpOpen: 0, ports: [{ port: 22, protocol: "tcp", service: "SSH", category: "remote-access" }, { port: 80, protocol: "tcp", service: "HTTP", category: "web" }, { port: 443, protocol: "tcp", service: "HTTPS", category: "web" }, { port: 3306, protocol: "tcp", service: "MySQL", category: "database" }, { port: 5432, protocol: "tcp", service: "PostgreSQL", category: "database" }, { port: 8080, protocol: "tcp", service: "HTTP-Alt", category: "web" }] } },
    { severity: "high", title: "Outdated SSH Server Version: OpenSSH 7.6", cveId: "CVE-2023-38408", cvssScore: 7.5, description: "The SSH server is running an outdated version with known security vulnerabilities.", remediation: "Update OpenSSH to version 9.x or later.", assetId: prodApiAsset?.id, details: { checkModule: "service-detection", host: "10.0.2.10", port: 22, product: "OpenSSH", version: "7.6" } },
    { severity: "info", title: "Cloud Inventory: exg-web-prod-01 — Amazon Web Services", description: "Cloud infrastructure detected. Provider: Amazon Web Services. 2 cloud services identified.", remediation: "Ensure all cloud resources are properly tagged and inventoried.", assetId: prodWebAsset?.id, details: { checkModule: "cloud-inventory", target: "10.0.1.10", provider: "aws", providerName: "Amazon Web Services", services: ["CloudFront CDN", "EC2 Instance"], containers: false, kubernetes: false } },
    { severity: "high", title: "Database Service Exposed: PostgreSQL on port 5432", cvssScore: 8.1, description: "A database service is network-accessible and revealed its software product via service banner.", remediation: "Restrict database access to application servers only via firewall rules.", assetId: prodDbAsset?.id, details: { checkModule: "service-detection", host: "10.0.3.10", port: 5432, service: "postgresql", product: "PostgreSQL", version: "15.4" } },
  ];

  for (const findings of [
    { scanId: scan4.id, items: scan4Findings },
  ]) {
    await prisma.scanResult.createMany({
      data: findings.items.map(f => ({
        id: uuid(),
        tenantId: tenant.id,
        scanId: findings.scanId,
        severity: f.severity,
        title: f.title,
        description: f.description,
        cveId: ("cveId" in f ? f.cveId : null) as string | null,
        cvssScore: ("cvssScore" in f ? f.cvssScore : null) as number | null,
        status: "open",
        remediation: f.remediation,
        assetId: f.assetId || null,
        details: JSON.stringify(f.details),
      })),
    });
  }

  // Phase 8: Enrich existing assets with discovery data
  if (prodWebAsset) {
    await prisma.asset.update({
      where: { id: prodWebAsset.id },
      data: {
        os: "Linux (Ubuntu)",
        discoveryMethod: "scanner",
        discoveredAt: new Date(Date.now() - 6 * HOUR),
        manufacturer: "Amazon Web Services",
        networkRole: "server",
        openPorts: JSON.stringify([22, 80, 443, 3306, 5432, 8080]),
        services: JSON.stringify([
          { port: 22, protocol: "tcp", service: "ssh", product: "OpenSSH", version: "8.9p1" },
          { port: 80, protocol: "tcp", service: "http", product: "nginx", version: "1.24.0" },
          { port: 443, protocol: "tcp", service: "https", product: "nginx", version: "1.24.0" },
          { port: 5432, protocol: "tcp", service: "postgresql", product: "PostgreSQL", version: "15.4" },
        ]),
      },
    });
  }
  if (prodApiAsset) {
    await prisma.asset.update({
      where: { id: prodApiAsset.id },
      data: {
        os: "Linux (Ubuntu)",
        discoveryMethod: "scanner",
        discoveredAt: new Date(Date.now() - 6 * HOUR),
        manufacturer: "Amazon Web Services",
        networkRole: "server",
        openPorts: JSON.stringify([22, 80, 443, 3000]),
        services: JSON.stringify([
          { port: 22, protocol: "tcp", service: "ssh", product: "OpenSSH", version: "7.6" },
          { port: 80, protocol: "tcp", service: "http", product: "Express.js", version: null },
          { port: 443, protocol: "tcp", service: "https", product: "Express.js", version: null },
          { port: 3000, protocol: "tcp", service: "http", product: "Node.js", version: "18.x" },
        ]),
      },
    });
  }
  if (prodDbAsset) {
    await prisma.asset.update({
      where: { id: prodDbAsset.id },
      data: {
        discoveryMethod: "scanner",
        discoveredAt: new Date(Date.now() - 6 * HOUR),
        networkRole: "server",
        openPorts: JSON.stringify([22, 5432]),
        services: JSON.stringify([
          { port: 22, protocol: "tcp", service: "ssh", product: "OpenSSH", version: "8.9p1" },
          { port: 5432, protocol: "tcp", service: "postgresql", product: "PostgreSQL", version: "15.4" },
        ]),
      },
    });
  }

  // Phase 9: Enrich assets with inventory fields (Client Step 2)
  if (prodWebAsset) {
    await prisma.asset.update({
      where: { id: prodWebAsset.id },
      data: {
        serialNumber: "SN-2024-WEB-0847",
        biosUuid: "4c4c4544-0034-4810-8057-b7c04f575231",
        physicalLocation: "DC-Mumbai-R12-U24",
        assetOwner: "Platform Engineering",
        subnet: "10.0.1.0/24",
        vlan: "VLAN-100",
        installedSoftware: JSON.stringify([
          { name: "nginx", version: "1.24.0", vendor: "F5 / Nginx Inc", installedAt: "2024-08-15T10:00:00Z" },
          { name: "Node.js", version: "20.11.0", vendor: "OpenJS Foundation", installedAt: "2024-09-01T14:30:00Z" },
          { name: "OpenSSH", version: "8.9p1", vendor: "OpenBSD Project", installedAt: "2024-06-20T09:00:00Z" },
          { name: "PostgreSQL Client", version: "15.4", vendor: "PostgreSQL Global Dev Group", installedAt: "2024-07-10T11:00:00Z" },
        ]),
        userAccounts: JSON.stringify([
          { username: "deploy-svc", role: "service", lastLogin: "2026-03-08T22:15:00Z", status: "active" },
          { username: "www-data", role: "service", lastLogin: null, status: "active" },
          { username: "admin-ops", role: "admin", lastLogin: "2026-03-07T14:30:00Z", status: "active" },
        ]),
      },
    });
  }
  if (prodApiAsset) {
    await prisma.asset.update({
      where: { id: prodApiAsset.id },
      data: {
        serialNumber: "SN-2024-API-1293",
        biosUuid: "4c4c4544-0034-4810-8057-b7c04f575232",
        physicalLocation: "DC-Mumbai-R12-U26",
        assetOwner: "Platform Engineering",
        subnet: "10.0.1.0/24",
        vlan: "VLAN-100",
        installedSoftware: JSON.stringify([
          { name: "Node.js", version: "20.11.0", vendor: "OpenJS Foundation", installedAt: "2024-09-01T14:30:00Z" },
          { name: "PM2", version: "5.3.1", vendor: "Keymetrics", installedAt: "2024-09-02T10:00:00Z" },
          { name: "OpenSSH", version: "7.6p1", vendor: "OpenBSD Project", installedAt: "2023-01-15T09:00:00Z" },
        ]),
        userAccounts: JSON.stringify([
          { username: "deploy-svc", role: "service", lastLogin: "2026-03-08T22:15:00Z", status: "active" },
          { username: "node-app", role: "service", lastLogin: null, status: "active" },
          { username: "admin-ops", role: "admin", lastLogin: "2026-03-07T10:00:00Z", status: "active" },
        ]),
      },
    });
  }
  if (prodDbAsset) {
    await prisma.asset.update({
      where: { id: prodDbAsset.id },
      data: {
        serialNumber: "SN-2024-DB-0562",
        biosUuid: "4c4c4544-0034-4810-8057-b7c04f575233",
        physicalLocation: "DC-Mumbai-R14-U08",
        assetOwner: "Database Operations",
        subnet: "10.0.2.0/24",
        vlan: "VLAN-200",
        installedSoftware: JSON.stringify([
          { name: "PostgreSQL", version: "15.4", vendor: "PostgreSQL Global Dev Group", installedAt: "2024-07-10T11:00:00Z" },
          { name: "pgBouncer", version: "1.21.0", vendor: "PgBouncer Contributors", installedAt: "2024-08-01T09:00:00Z" },
          { name: "OpenSSH", version: "8.9p1", vendor: "OpenBSD Project", installedAt: "2024-06-20T09:00:00Z" },
        ]),
        userAccounts: JSON.stringify([
          { username: "postgres", role: "admin", lastLogin: "2026-03-09T01:00:00Z", status: "active" },
          { username: "replicator", role: "replication", lastLogin: "2026-03-09T00:00:00Z", status: "active" },
          { username: "app_readonly", role: "readonly", lastLogin: "2026-03-08T23:45:00Z", status: "active" },
          { username: "backup-svc", role: "backup", lastLogin: "2026-03-09T02:00:00Z", status: "active" },
        ]),
      },
    });
  }
  if (firewallAsset) {
    await prisma.asset.update({
      where: { id: firewallAsset.id },
      data: {
        serialNumber: "SN-2024-FW-0100",
        physicalLocation: "DC-Mumbai-R01-U01",
        assetOwner: "Network Operations",
        subnet: "10.0.0.0/24",
        vlan: "VLAN-1",
        installedSoftware: JSON.stringify([
          { name: "PAN-OS", version: "11.1.2", vendor: "Palo Alto Networks", installedAt: "2024-10-15T08:00:00Z" },
        ]),
        userAccounts: JSON.stringify([
          { username: "admin", role: "admin", lastLogin: "2026-03-08T16:00:00Z", status: "active" },
          { username: "readonly-audit", role: "readonly", lastLogin: "2026-03-07T09:00:00Z", status: "active" },
          { username: "legacy-admin", role: "admin", lastLogin: "2025-11-01T10:00:00Z", status: "disabled" },
        ]),
      },
    });
  }

  console.log(`   ✅ 4 scans, ${scan1Findings.length + scan2Findings.length + scan3Findings.length + scan4Findings.length} findings seeded\n`);

  // ─── 18. Seed SIEM Rules, Events, Alerts & Incidents (Enterprise SOC) ───
  console.log("🔔 Seeding enterprise SIEM data...");

  await prisma.siemAlert.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.siemIncident.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.siemEvent.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.siemRule.deleteMany({ where: { tenantId: tenant.id } });

  // ── 12 Detection Rules (MITRE ATT&CK mapped) ──
  const rulesDefs = [
    { name: "Brute Force / Password Spray", severity: "high", ruleType: "correlation", mitreAttackId: "T1110", mitreTactic: "Credential Access", mitreTechnique: "Brute Force", category: "authentication", confidenceLevel: 85, dataSources: ["endpoint","identity"], condition: { type: "threshold", field: "eventAction", value: "login_failed", threshold: 10, window: "5m", groupBy: "sourceIp" } },
    { name: "Impossible Travel Login", severity: "high", ruleType: "behavioral", mitreAttackId: "T1078", mitreTactic: "Initial Access", mitreTechnique: "Valid Accounts", category: "authentication", confidenceLevel: 80, dataSources: ["identity","geo"], condition: { type: "geo_velocity", requireSuccess: true, window: "1h" } },
    { name: "New Admin Account Created", severity: "high", ruleType: "correlation", mitreAttackId: "T1136", mitreTactic: "Persistence", mitreTechnique: "Create Account", category: "identity", confidenceLevel: 90, dataSources: ["identity","directory"], condition: { type: "sequence", events: [{ eventAction: "account_created" }, { eventAction: "privilege_escalation" }], window: "24h" } },
    { name: "Scheduled Task / Cron Creation", severity: "medium", ruleType: "correlation", mitreAttackId: "T1053", mitreTactic: "Execution", mitreTechnique: "Scheduled Task/Job", category: "endpoint", confidenceLevel: 70, dataSources: ["endpoint"], condition: { type: "process_match", processName: ["schtasks.exe","crontab","at.exe"] } },
    { name: "PowerShell Encoded Command", severity: "high", ruleType: "correlation", mitreAttackId: "T1059.001", mitreTactic: "Execution", mitreTechnique: "PowerShell", category: "endpoint", confidenceLevel: 88, dataSources: ["endpoint"], condition: { type: "process_match", processName: ["powershell.exe","pwsh.exe"], commandLineContains: ["-EncodedCommand","-enc ","-e "] } },
    { name: "LSASS Memory Access", severity: "critical", ruleType: "correlation", mitreAttackId: "T1003.001", mitreTactic: "Credential Access", mitreTechnique: "LSASS Memory", category: "endpoint", confidenceLevel: 95, dataSources: ["endpoint","edr"], condition: { type: "process_access", targetProcess: "lsass.exe", excludeProcesses: ["csrss.exe","services.exe","svchost.exe","wininit.exe"] } },
    { name: "Lateral Movement via PsExec/WMI", severity: "high", ruleType: "correlation", mitreAttackId: "T1021", mitreTactic: "Lateral Movement", mitreTechnique: "Remote Services", category: "network", confidenceLevel: 82, dataSources: ["endpoint","network"], condition: { type: "network_process", processName: ["psexec.exe","wmic.exe","psexesvc.exe"], destPorts: [445, 135, 5985, 5986] } },
    { name: "DNS Tunneling Detected", severity: "high", ruleType: "anomaly", mitreAttackId: "T1071.004", mitreTactic: "Command and Control", mitreTechnique: "DNS", category: "dns", confidenceLevel: 75, dataSources: ["dns","network"], condition: { type: "dns_anomaly", maxQueryLength: 100, entropyThreshold: 3.5 } },
    { name: "Data Exfiltration — Large Upload", severity: "critical", ruleType: "anomaly", mitreAttackId: "T1048", mitreTactic: "Exfiltration", mitreTechnique: "Exfiltration Over Alternative Protocol", category: "network", confidenceLevel: 78, dataSources: ["network","proxy"], condition: { type: "volume_threshold", thresholdBytes: 104857600, direction: "outbound" } },
    { name: "C2 Beaconing Pattern", severity: "critical", ruleType: "behavioral", mitreAttackId: "T1071", mitreTactic: "Command and Control", mitreTechnique: "Application Layer Protocol", category: "network", confidenceLevel: 85, dataSources: ["network","proxy","dns"], condition: { type: "beacon_detection", excludeStandardPorts: [80, 443, 53], minDuration: "1h" } },
    { name: "Cloud IAM Privilege Escalation", severity: "critical", ruleType: "correlation", mitreAttackId: "T1078.004", mitreTactic: "Privilege Escalation", mitreTechnique: "Cloud Accounts", category: "cloud", confidenceLevel: 92, dataSources: ["cloud","identity"], condition: { type: "iam_policy", dangerousActions: ["iam:PutRolePolicy","iam:AttachRolePolicy","sts:AssumeRole"], resource: "*" } },
    { name: "Ransomware Indicators", severity: "critical", ruleType: "correlation", mitreAttackId: "T1486", mitreTactic: "Impact", mitreTechnique: "Data Encrypted for Impact", category: "endpoint", confidenceLevel: 96, dataSources: ["endpoint","edr"], condition: { type: "ransomware_pattern", minIndicators: 2, indicators: [{ type: "mass_rename" }, { type: "shadow_copy_delete", command: "vssadmin" }, { type: "ransom_note", filePatterns: ["*readme*","*ransom*","*decrypt*"] }] } },
  ];

  const siemRules: { id: string; name: string; mitreAttackId?: string; mitreTactic?: string; mitreTechnique?: string; severity: string }[] = [];
  for (const r of rulesDefs) {
    const rule = await prisma.siemRule.create({
      data: {
        id: uuid(), tenantId: tenant.id,
        name: r.name, description: `Detection rule: ${r.name}`,
        severity: r.severity, isActive: true,
        ruleType: r.ruleType, mitreAttackId: r.mitreAttackId,
        mitreTactic: r.mitreTactic, mitreTechnique: r.mitreTechnique,
        confidenceLevel: r.confidenceLevel, category: r.category,
        dataSources: JSON.stringify(r.dataSources),
        condition: JSON.stringify(r.condition),
      },
    });
    siemRules.push({ id: rule.id, name: r.name, mitreAttackId: r.mitreAttackId, mitreTactic: r.mitreTactic, mitreTechnique: r.mitreTechnique, severity: r.severity });
  }
  const ruleByName = (n: string) => siemRules.find(r => r.name.includes(n))!;

  // ── ~65 Events across all categories ──
  const eventDefs: {
    source: string; severity: string; category: string; title: string;
    sourceIp?: string | null; destIp?: string | null; sourcePort?: number; destPort?: number;
    protocol?: string; direction?: string; userName?: string; userDomain?: string;
    eventOutcome?: string; eventAction?: string; processName?: string; processPid?: number;
    processParentName?: string; processExecutable?: string; hostName?: string; hostIp?: string;
    geoCountry?: string; geoCity?: string; threatIntelHit?: boolean; assetCriticality?: string;
    dataset?: string; module?: string; logLevel?: string; offset: number;
  }[] = [
    // Auth events (12)
    { source: "auth", severity: "info", category: "authentication", title: "User login successful: admin@exargen.com", sourceIp: "203.0.113.42", userName: "admin@exargen.com", eventOutcome: "success", eventAction: "login", geoCountry: "US", geoCity: "New York", dataset: "auth.login", hostName: "exg-idp-01", offset: 3 * HOUR },
    { source: "auth", severity: "info", category: "authentication", title: "User login successful: soc-analyst@exargen.com", sourceIp: "203.0.113.55", userName: "soc-analyst@exargen.com", eventOutcome: "success", eventAction: "login", geoCountry: "US", geoCity: "Chicago", dataset: "auth.login", hostName: "exg-idp-01", offset: 4 * HOUR },
    { source: "auth", severity: "medium", category: "authentication", title: "Failed login attempt: unknown@exargen.com", sourceIp: "198.51.100.17", userName: "unknown@exargen.com", eventOutcome: "failure", eventAction: "login", geoCountry: "RU", geoCity: "Moscow", threatIntelHit: true, dataset: "auth.login", hostName: "exg-idp-01", offset: 5 * HOUR },
    { source: "auth", severity: "high", category: "authentication", title: "Multiple failed logins: brute force suspected", sourceIp: "198.51.100.17", userName: "admin@exargen.com", eventOutcome: "failure", eventAction: "login", geoCountry: "RU", geoCity: "Moscow", threatIntelHit: true, dataset: "auth.login", hostName: "exg-idp-01", offset: 5 * HOUR + 30000 },
    { source: "auth", severity: "high", category: "authentication", title: "Password spray detected — 15 accounts targeted", sourceIp: "198.51.100.17", destIp: "10.0.1.5", userName: "spray-target", eventOutcome: "failure", eventAction: "login", geoCountry: "RU", geoCity: "Moscow", threatIntelHit: true, dataset: "auth.login", hostName: "exg-idp-01", offset: 5 * HOUR + 60000 },
    { source: "auth", severity: "info", category: "authentication", title: "MFA verification successful: admin@exargen.com", sourceIp: "203.0.113.42", userName: "admin@exargen.com", eventOutcome: "success", eventAction: "mfa_verify", geoCountry: "US", geoCity: "New York", dataset: "auth.mfa", hostName: "exg-idp-01", offset: 2 * HOUR },
    { source: "auth", severity: "high", category: "authentication", title: "Impossible travel: login from Moscow after NYC login", sourceIp: "91.207.6.14", userName: "admin@exargen.com", eventOutcome: "success", eventAction: "login", geoCountry: "RU", geoCity: "Moscow", threatIntelHit: true, dataset: "auth.login", hostName: "exg-idp-01", offset: 1 * HOUR },
    { source: "auth", severity: "high", category: "authentication", title: "Admin account created: backdoor-admin@exargen.com", sourceIp: "10.0.1.50", userName: "backdoor-admin@exargen.com", eventOutcome: "success", eventAction: "account_created", userDomain: "EXARGEN", dataset: "auth.admin", hostName: "exg-dc-01", offset: 8 * HOUR },
    { source: "auth", severity: "medium", category: "authentication", title: "Privilege escalation: user promoted to admin", sourceIp: "10.0.1.50", userName: "dev-user@exargen.com", eventOutcome: "success", eventAction: "privilege_escalation", userDomain: "EXARGEN", dataset: "auth.admin", hostName: "exg-dc-01", offset: 7 * HOUR },
    { source: "auth", severity: "info", category: "authentication", title: "User logout: soc-analyst@exargen.com", sourceIp: "203.0.113.55", userName: "soc-analyst@exargen.com", eventOutcome: "success", eventAction: "logout", dataset: "auth.login", hostName: "exg-idp-01", offset: 1 * HOUR },
    { source: "auth", severity: "medium", category: "authentication", title: "Account locked after 5 failed attempts", sourceIp: "198.51.100.22", userName: "finance@exargen.com", eventOutcome: "failure", eventAction: "login", geoCountry: "CN", geoCity: "Beijing", dataset: "auth.login", hostName: "exg-idp-01", offset: 6 * HOUR },
    { source: "auth", severity: "info", category: "authentication", title: "Password changed: dev-user@exargen.com", sourceIp: "10.0.1.60", userName: "dev-user@exargen.com", eventOutcome: "success", eventAction: "login", dataset: "auth.admin", hostName: "exg-idp-01", offset: 12 * HOUR },
    // Network events (10)
    { source: "firewall", severity: "medium", category: "network", title: "Firewall block: inbound SSH from external IP", sourceIp: "185.220.101.34", destIp: "10.0.1.10", sourcePort: 44521, destPort: 22, protocol: "tcp", direction: "inbound", threatIntelHit: true, dataset: "network.firewall", module: "palo_alto", hostName: "exg-fw-01", offset: 6 * HOUR },
    { source: "firewall", severity: "high", category: "network", title: "Port scan detected from internal host", sourceIp: "10.0.2.50", destIp: "10.0.1.0/24", sourcePort: 55000, destPort: 0, protocol: "tcp", direction: "internal", dataset: "network.firewall", module: "palo_alto", hostName: "exg-fw-01", offset: 4 * HOUR },
    { source: "network", severity: "high", category: "network", title: "Lateral movement: PsExec connection to domain controller", sourceIp: "10.0.2.50", destIp: "10.0.1.5", sourcePort: 49152, destPort: 445, protocol: "tcp", direction: "internal", processName: "psexec.exe", userName: "EXARGEN\\compromised-svc", dataset: "network.flow", module: "crowdstrike", hostName: "exg-ws-042", offset: 3 * HOUR + 30000 },
    { source: "network", severity: "medium", category: "network", title: "Suspicious outbound connection to Tor exit node", sourceIp: "10.0.2.50", destIp: "185.220.101.1", sourcePort: 51200, destPort: 443, protocol: "tcp", direction: "outbound", threatIntelHit: true, dataset: "network.flow", module: "palo_alto", hostName: "exg-ws-042", geoCountry: "DE", offset: 2 * HOUR + 10000 },
    { source: "firewall", severity: "low", category: "network", title: "Firewall allow: HTTPS to CDN", sourceIp: "10.0.1.10", destIp: "104.18.32.7", sourcePort: 38421, destPort: 443, protocol: "tcp", direction: "outbound", dataset: "network.firewall", module: "palo_alto", hostName: "exg-fw-01", offset: 1 * HOUR },
    { source: "network", severity: "critical", category: "network", title: "C2 beaconing pattern detected — 10.0.2.50 to 185.143.223.77", sourceIp: "10.0.2.50", destIp: "185.143.223.77", sourcePort: 49300, destPort: 443, protocol: "https", direction: "outbound", threatIntelHit: true, dataset: "network.flow", module: "crowdstrike", hostName: "exg-ws-042", geoCountry: "UA", offset: 2 * HOUR },
    { source: "network", severity: "critical", category: "network", title: "Large data upload to external storage — 250MB in 10min", sourceIp: "10.0.2.50", destIp: "52.216.100.45", sourcePort: 50100, destPort: 443, protocol: "https", direction: "outbound", dataset: "network.flow", module: "palo_alto", hostName: "exg-ws-042", geoCountry: "US", assetCriticality: "high", offset: 1 * HOUR + 30000 },
    { source: "dns", severity: "high", category: "network", title: "DNS tunneling: high-entropy subdomain queries to c2.evil.example", sourceIp: "10.0.2.50", destIp: "10.0.1.2", destPort: 53, protocol: "dns", direction: "internal", dataset: "network.dns", module: "infoblox", hostName: "exg-ws-042", offset: 2 * HOUR + 5000 },
    { source: "dns", severity: "medium", category: "network", title: "DGA domain query: xk7rf2m9p4.biz resolved", sourceIp: "10.0.3.15", destIp: "10.0.1.2", destPort: 53, protocol: "dns", direction: "internal", dataset: "network.dns", module: "infoblox", hostName: "exg-db-01", offset: 5 * HOUR },
    { source: "dns", severity: "low", category: "network", title: "DNS query for known ad tracker domain", sourceIp: "10.0.1.60", destIp: "10.0.1.2", destPort: 53, protocol: "dns", direction: "internal", dataset: "network.dns", hostName: "exg-ws-015", offset: 8 * HOUR },
    // Process/Endpoint events (8)
    { source: "endpoint", severity: "high", category: "process", title: "PowerShell encoded command execution detected", sourceIp: "10.0.2.50", processName: "powershell.exe", processPid: 4892, processParentName: "cmd.exe", processExecutable: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe -EncodedCommand SGVsbG8gV29ybGQ=", hostName: "exg-ws-042", hostIp: "10.0.2.50", userName: "EXARGEN\\compromised-svc", dataset: "endpoint.process", module: "crowdstrike", offset: 4 * HOUR },
    { source: "endpoint", severity: "critical", category: "process", title: "LSASS memory access by non-system process", sourceIp: "10.0.2.50", processName: "mimikatz.exe", processPid: 6712, processParentName: "powershell.exe", processExecutable: "C:\\Users\\Public\\mimikatz.exe", hostName: "exg-ws-042", hostIp: "10.0.2.50", userName: "SYSTEM", dataset: "endpoint.process", module: "crowdstrike", assetCriticality: "high", offset: 3 * HOUR + 45000 },
    { source: "endpoint", severity: "medium", category: "process", title: "Scheduled task created: Windows Update Helper", sourceIp: "10.0.2.50", processName: "schtasks.exe", processPid: 3201, processParentName: "powershell.exe", processExecutable: "C:\\Windows\\System32\\schtasks.exe", hostName: "exg-ws-042", hostIp: "10.0.2.50", userName: "EXARGEN\\compromised-svc", dataset: "endpoint.process", module: "crowdstrike", offset: 3 * HOUR + 50000 },
    { source: "endpoint", severity: "critical", category: "process", title: "Ransomware indicator: mass file encryption in progress", sourceIp: "10.0.3.15", processName: "svchost-helper.exe", processPid: 8844, processParentName: "explorer.exe", processExecutable: "C:\\Users\\Public\\svchost-helper.exe", hostName: "exg-db-01", hostIp: "10.0.3.15", userName: "EXARGEN\\db-admin", dataset: "endpoint.process", module: "crowdstrike", assetCriticality: "critical", offset: 30 * 60000 },
    { source: "endpoint", severity: "critical", category: "process", title: "Shadow copy deletion detected", sourceIp: "10.0.3.15", processName: "vssadmin.exe", processPid: 9102, processParentName: "svchost-helper.exe", processExecutable: "C:\\Windows\\System32\\vssadmin.exe delete shadows /all", hostName: "exg-db-01", hostIp: "10.0.3.15", userName: "SYSTEM", dataset: "endpoint.process", module: "crowdstrike", assetCriticality: "critical", offset: 28 * 60000 },
    { source: "endpoint", severity: "high", category: "process", title: "Suspicious executable in temp directory", sourceIp: "10.0.1.60", processName: "update-helper.exe", processPid: 5501, processParentName: "outlook.exe", processExecutable: "C:\\Users\\jsmith\\AppData\\Local\\Temp\\update-helper.exe", hostName: "exg-ws-015", hostIp: "10.0.1.60", userName: "EXARGEN\\jsmith", dataset: "endpoint.process", module: "crowdstrike", offset: 10 * HOUR },
    { source: "endpoint", severity: "medium", category: "process", title: "WMI remote execution to multiple hosts", sourceIp: "10.0.2.50", processName: "wmic.exe", processPid: 7120, processParentName: "cmd.exe", processExecutable: "C:\\Windows\\System32\\wbem\\WMIC.exe", hostName: "exg-ws-042", hostIp: "10.0.2.50", destIp: "10.0.1.5", userName: "EXARGEN\\compromised-svc", dataset: "endpoint.process", module: "crowdstrike", offset: 3 * HOUR + 20000 },
    { source: "endpoint", severity: "info", category: "process", title: "Antivirus definition update completed", sourceIp: "10.0.1.10", processName: "MsMpEng.exe", processPid: 1200, hostName: "exg-web-prod-01", hostIp: "10.0.1.10", dataset: "endpoint.process", module: "defender", offset: 12 * HOUR },
    // Cloud IAM events (6)
    { source: "cloud", severity: "critical", category: "cloud", title: "IAM role escalation: ReadOnly → AdministratorAccess", sourceIp: "10.0.5.10", userName: "dev-user@exargen.com", eventOutcome: "success", eventAction: "privilege_escalation", dataset: "cloud.iam", module: "aws_cloudtrail", geoCountry: "US", hostName: "aws-account-prod", offset: 6 * HOUR },
    { source: "cloud", severity: "high", category: "cloud", title: "New IAM policy attached with wildcard permissions", sourceIp: "10.0.5.10", userName: "dev-user@exargen.com", eventOutcome: "success", eventAction: "account_created", dataset: "cloud.iam", module: "aws_cloudtrail", geoCountry: "US", hostName: "aws-account-prod", offset: 6 * HOUR + 5000 },
    { source: "cloud", severity: "medium", category: "cloud", title: "S3 bucket policy modified: public read enabled", sourceIp: "10.0.5.10", userName: "dev-user@exargen.com", eventOutcome: "success", eventAction: "privilege_escalation", dataset: "cloud.storage", module: "aws_cloudtrail", hostName: "aws-account-prod", offset: 5 * HOUR + 30000 },
    { source: "cloud", severity: "high", category: "cloud", title: "AssumeRole from unfamiliar external account", sourceIp: "198.51.100.88", userName: "arn:aws:iam::112233:role/cross-account", eventOutcome: "success", eventAction: "login", dataset: "cloud.iam", module: "aws_cloudtrail", geoCountry: "SG", hostName: "aws-account-prod", offset: 4 * HOUR + 20000 },
    { source: "cloud", severity: "info", category: "cloud", title: "CloudTrail logging configuration verified", sourceIp: "10.0.5.10", userName: "security-audit@exargen.com", eventOutcome: "success", dataset: "cloud.audit", module: "aws_cloudtrail", hostName: "aws-account-prod", offset: 18 * HOUR },
    { source: "cloud", severity: "low", category: "cloud", title: "Lambda function invocation count exceeded threshold", sourceIp: null, dataset: "cloud.compute", module: "aws_cloudwatch", hostName: "aws-account-prod", offset: 14 * HOUR },
    // Scanner events (6)
    { source: "scanner", severity: "critical", category: "vulnerability", title: "[Scan] Potential Log4Shell (Log4j RCE) Vulnerability", sourceIp: "10.0.2.10", destIp: "10.0.2.10", dataset: "scanner.vulnerability", module: "byoc_scanner", hostName: "exg-api-prod-01", hostIp: "10.0.2.10", assetCriticality: "critical", offset: 2 * DAY },
    { source: "scanner", severity: "critical", category: "vulnerability", title: "[Scan] Environment File (.env) Accessible", sourceIp: "10.0.1.10", destIp: "10.0.1.10", dataset: "scanner.vulnerability", module: "byoc_scanner", hostName: "exg-web-prod-01", hostIp: "10.0.1.10", assetCriticality: "high", offset: 2 * DAY - 5000 },
    { source: "scanner", severity: "critical", category: "vulnerability", title: "[Scan] RDP Port (3389) Open — BlueKeep Risk", sourceIp: "10.0.1.10", destIp: "10.0.1.10", destPort: 3389, protocol: "tcp", dataset: "scanner.vulnerability", module: "byoc_scanner", hostName: "exg-web-prod-01", hostIp: "10.0.1.10", assetCriticality: "high", offset: 1 * DAY },
    { source: "scanner", severity: "high", category: "vulnerability", title: "[Scan] Database Port Exposed to Network", sourceIp: "10.0.3.10", destIp: "10.0.3.10", destPort: 5432, protocol: "tcp", dataset: "scanner.vulnerability", module: "byoc_scanner", hostName: "exg-db-01", hostIp: "10.0.3.10", assetCriticality: "critical", offset: 2 * DAY - 10000 },
    { source: "scanner", severity: "high", category: "vulnerability", title: "[Scan] SSL/TLS Certificate Expiring Within 30 Days", sourceIp: "10.0.1.10", destIp: "10.0.1.10", destPort: 443, protocol: "tcp", dataset: "scanner.vulnerability", module: "byoc_scanner", hostName: "exg-web-prod-01", hostIp: "10.0.1.10", offset: 2 * DAY - 15000 },
    { source: "scanner", severity: "high", category: "vulnerability", title: "[Scan] Admin Panel Exposed", sourceIp: "10.0.1.10", destIp: "10.0.1.10", destPort: 8443, protocol: "tcp", dataset: "scanner.vulnerability", module: "byoc_scanner", hostName: "exg-web-prod-01", hostIp: "10.0.1.10", offset: 2 * DAY - 20000 },
    // System events (5)
    { source: "system", severity: "info", category: "system", title: "Vulnerability scan started: Infrastructure Vulnerability Scan", dataset: "system.audit", hostName: "exg-scanner-01", offset: 2 * DAY + 1000 },
    { source: "system", severity: "info", category: "system", title: "Vulnerability scan completed: 12 findings discovered", dataset: "system.audit", hostName: "exg-scanner-01", offset: 2 * DAY - 45000 },
    { source: "system", severity: "low", category: "system", title: "Security policy updated: password complexity requirements changed", sourceIp: "203.0.113.42", userName: "admin@exargen.com", dataset: "system.policy", hostName: "exg-dc-01", offset: 4 * HOUR },
    { source: "system", severity: "info", category: "system", title: "Firewall rules synchronized across cluster", dataset: "system.config", hostName: "exg-fw-01", offset: 16 * HOUR },
    { source: "system", severity: "info", category: "system", title: "SIEM correlation engine restarted", dataset: "system.health", hostName: "exg-siem-01", offset: 20 * HOUR },
  ];

  const eventIds: string[] = [];
  for (const evt of eventDefs) {
    const { offset, ...rest } = evt;
    const created = await prisma.siemEvent.create({
      data: {
        id: uuid(), tenantId: tenant.id,
        ...rest,
        sourceIp: rest.sourceIp ?? null, destIp: rest.destIp ?? null,
        sourcePort: rest.sourcePort ?? null, destPort: rest.destPort ?? null,
        protocol: rest.protocol ?? null, direction: rest.direction ?? null,
        userName: rest.userName ?? null, userDomain: rest.userDomain ?? null,
        eventOutcome: rest.eventOutcome ?? null, eventAction: rest.eventAction ?? null,
        processName: rest.processName ?? null, processPid: rest.processPid ?? null,
        processParentName: rest.processParentName ?? null,
        processExecutable: rest.processExecutable ?? null,
        hostName: rest.hostName ?? null, hostIp: rest.hostIp ?? null,
        geoCountry: rest.geoCountry ?? null, geoCity: rest.geoCity ?? null,
        threatIntelHit: rest.threatIntelHit ?? false,
        assetCriticality: rest.assetCriticality ?? null,
        dataset: rest.dataset ?? null, module: rest.module ?? null,
        logLevel: rest.logLevel ?? null,
        details: JSON.stringify({ automated: rest.source === "scanner" }),
        createdAt: new Date(Date.now() - offset),
      },
    });
    eventIds.push(created.id);
  }

  // ── 25 Alerts across all statuses ──
  const alertDefs: {
    severity: string; title: string; description: string; status: string;
    ruleName: string; mitreAttackId?: string; mitreTactic?: string; mitreTechnique?: string;
    confidenceScore?: number; priorityScore?: number; assignedToName?: string;
    impactedUsers?: string[]; impactedAssets?: string[];
    eventIndex: number; offset: number;
    acknowledgedAt?: number; containedAt?: number; closedAt?: number;
  }[] = [
    // 5 open
    { severity: "critical", title: "Ransomware: Mass file encryption on exg-db-01", description: "Mass file encryption detected with shadow copy deletion on critical database server", status: "open", ruleName: "Ransomware", mitreAttackId: "T1486", mitreTactic: "Impact", mitreTechnique: "Data Encrypted for Impact", confidenceScore: 96, priorityScore: 99, impactedAssets: ["exg-db-01"], impactedUsers: ["EXARGEN\\db-admin"], eventIndex: 35, offset: 30 * 60000 },
    { severity: "critical", title: "C2 Beaconing: exg-ws-042 → 185.143.223.77", description: "Periodic HTTPS connections matching C2 beaconing pattern detected", status: "open", ruleName: "C2 Beaconing", mitreAttackId: "T1071", mitreTactic: "Command and Control", mitreTechnique: "Application Layer Protocol", confidenceScore: 85, priorityScore: 95, impactedAssets: ["exg-ws-042"], impactedUsers: ["EXARGEN\\compromised-svc"], eventIndex: 17, offset: 2 * HOUR },
    { severity: "critical", title: "LSASS Memory Access: Credential dumping on exg-ws-042", description: "mimikatz.exe accessed LSASS memory for credential extraction", status: "open", ruleName: "LSASS", mitreAttackId: "T1003.001", mitreTactic: "Credential Access", mitreTechnique: "LSASS Memory", confidenceScore: 95, priorityScore: 97, impactedAssets: ["exg-ws-042"], impactedUsers: ["SYSTEM"], eventIndex: 23, offset: 3 * HOUR + 45000 },
    { severity: "high", title: "Impossible Travel: admin@exargen.com NYC→Moscow in <1hr", description: "Login from Moscow 45 minutes after New York session", status: "open", ruleName: "Impossible Travel", mitreAttackId: "T1078", mitreTactic: "Initial Access", mitreTechnique: "Valid Accounts", confidenceScore: 80, priorityScore: 82, impactedUsers: ["admin@exargen.com"], eventIndex: 6, offset: 1 * HOUR },
    { severity: "critical", title: "Data Exfiltration: 250MB upload from exg-ws-042", description: "Large data upload to external S3-compatible storage detected", status: "open", ruleName: "Data Exfil", mitreAttackId: "T1048", mitreTactic: "Exfiltration", mitreTechnique: "Exfiltration Over Alternative Protocol", confidenceScore: 78, priorityScore: 90, impactedAssets: ["exg-ws-042"], impactedUsers: ["EXARGEN\\compromised-svc"], eventIndex: 19, offset: 1 * HOUR + 30000 },
    // 4 triaging
    { severity: "high", title: "Brute Force: 15 failed logins from 198.51.100.17", description: "Multiple failed login attempts from Russian IP against admin account", status: "triaging", ruleName: "Brute Force", mitreAttackId: "T1110", mitreTactic: "Credential Access", mitreTechnique: "Brute Force", confidenceScore: 85, priorityScore: 78, impactedUsers: ["admin@exargen.com","finance@exargen.com"], assignedToName: "SOC Analyst", eventIndex: 3, offset: 5 * HOUR, acknowledgedAt: 5 * HOUR - 15 * 60000 },
    { severity: "high", title: "New Admin Account: backdoor-admin@exargen.com", description: "Unauthorized admin account created outside change window", status: "triaging", ruleName: "New Admin", mitreAttackId: "T1136", mitreTactic: "Persistence", mitreTechnique: "Create Account", confidenceScore: 90, priorityScore: 85, impactedUsers: ["backdoor-admin@exargen.com"], impactedAssets: ["exg-dc-01"], assignedToName: "SOC Lead", eventIndex: 7, offset: 8 * HOUR, acknowledgedAt: 8 * HOUR - 30 * 60000 },
    { severity: "high", title: "DNS Tunneling: exg-ws-042 querying c2.evil.example", description: "High-entropy subdomain queries consistent with DNS tunneling C2 channel", status: "triaging", ruleName: "DNS Tunneling", mitreAttackId: "T1071.004", mitreTactic: "Command and Control", mitreTechnique: "DNS", confidenceScore: 75, priorityScore: 72, impactedAssets: ["exg-ws-042"], assignedToName: "SOC Analyst", eventIndex: 20, offset: 2 * HOUR + 5000, acknowledgedAt: 2 * HOUR },
    { severity: "medium", title: "Scheduled Task Creation: Windows Update Helper", description: "Suspicious scheduled task created via PowerShell on compromised workstation", status: "triaging", ruleName: "Scheduled Task", mitreAttackId: "T1053", mitreTactic: "Execution", mitreTechnique: "Scheduled Task/Job", confidenceScore: 70, priorityScore: 55, impactedAssets: ["exg-ws-042"], assignedToName: "SOC Analyst", eventIndex: 25, offset: 3 * HOUR + 50000, acknowledgedAt: 3 * HOUR + 40000 },
    // 5 investigating
    { severity: "high", title: "PowerShell Encoded Command on exg-ws-042", description: "Base64-encoded PowerShell command execution detected", status: "investigating", ruleName: "PowerShell", mitreAttackId: "T1059.001", mitreTactic: "Execution", mitreTechnique: "PowerShell", confidenceScore: 88, priorityScore: 80, impactedAssets: ["exg-ws-042"], impactedUsers: ["EXARGEN\\compromised-svc"], assignedToName: "SOC Lead", eventIndex: 22, offset: 4 * HOUR, acknowledgedAt: 4 * HOUR - 10 * 60000 },
    { severity: "high", title: "Lateral Movement via PsExec: exg-ws-042 → exg-dc-01", description: "PsExec used to execute commands on domain controller", status: "investigating", ruleName: "Lateral Movement", mitreAttackId: "T1021", mitreTactic: "Lateral Movement", mitreTechnique: "Remote Services", confidenceScore: 82, priorityScore: 85, impactedAssets: ["exg-ws-042","exg-dc-01"], impactedUsers: ["EXARGEN\\compromised-svc"], assignedToName: "SOC Lead", eventIndex: 14, offset: 3 * HOUR + 30000, acknowledgedAt: 3 * HOUR + 20000 },
    { severity: "critical", title: "Cloud IAM Escalation: ReadOnly → AdministratorAccess", description: "IAM role escalated to full admin in production AWS account", status: "investigating", ruleName: "Cloud IAM", mitreAttackId: "T1078.004", mitreTactic: "Privilege Escalation", mitreTechnique: "Cloud Accounts", confidenceScore: 92, priorityScore: 93, impactedUsers: ["dev-user@exargen.com"], impactedAssets: ["aws-account-prod"], assignedToName: "Cloud Security", eventIndex: 37, offset: 6 * HOUR, acknowledgedAt: 6 * HOUR - 20 * 60000 },
    { severity: "critical", title: "Critical: Potential Log4Shell (Log4j RCE) Vulnerability", description: "Critical vulnerability found during Infrastructure Vulnerability Scan", status: "investigating", ruleName: "Ransomware", mitreAttackId: "T1486", mitreTactic: "Impact", confidenceScore: 90, priorityScore: 92, impactedAssets: ["exg-api-prod-01"], assignedToName: "SOC Lead", eventIndex: 42, offset: 2 * DAY, acknowledgedAt: 2 * DAY - 2 * HOUR },
    { severity: "high", title: "Suspicious executable via Outlook: exg-ws-015", description: "update-helper.exe spawned from outlook.exe in user temp directory", status: "investigating", ruleName: "PowerShell", confidenceScore: 70, priorityScore: 65, impactedAssets: ["exg-ws-015"], impactedUsers: ["EXARGEN\\jsmith"], assignedToName: "SOC Analyst", eventIndex: 28, offset: 10 * HOUR, acknowledgedAt: 10 * HOUR - 1 * HOUR },
    // 3 contained
    { severity: "critical", title: "Critical: Environment File (.env) Accessible", description: "Sensitive configuration exposed on production web server", status: "contained", ruleName: "Ransomware", confidenceScore: 95, priorityScore: 94, impactedAssets: ["exg-web-prod-01"], assignedToName: "DevOps Lead", eventIndex: 43, offset: 2 * DAY - 5000, acknowledgedAt: 2 * DAY - 5000 - 1 * HOUR, containedAt: 2 * DAY - 5000 - 4 * HOUR },
    { severity: "high", title: "Port scan from internal host exg-ws-042", description: "Internal port scan targeting /24 subnet from compromised host", status: "contained", ruleName: "Lateral Movement", confidenceScore: 85, priorityScore: 75, impactedAssets: ["exg-ws-042","10.0.1.0/24"], assignedToName: "SOC Lead", eventIndex: 13, offset: 4 * HOUR, acknowledgedAt: 4 * HOUR - 15 * 60000, containedAt: 4 * HOUR - 2 * HOUR },
    { severity: "medium", title: "DGA domain resolution on exg-db-01", description: "Domain generation algorithm queries detected from database server", status: "contained", ruleName: "DNS Tunneling", mitreAttackId: "T1071.004", mitreTactic: "Command and Control", mitreTechnique: "DNS", confidenceScore: 72, priorityScore: 60, impactedAssets: ["exg-db-01"], assignedToName: "SOC Analyst", eventIndex: 21, offset: 5 * HOUR, acknowledgedAt: 5 * HOUR - 30 * 60000, containedAt: 5 * HOUR - 2 * HOUR },
    // 4 resolved
    { severity: "critical", title: "Critical: RDP Port (3389) Open — BlueKeep Risk", description: "BlueKeep-vulnerable RDP exposed on production server", status: "resolved", ruleName: "Ransomware", confidenceScore: 98, priorityScore: 96, impactedAssets: ["exg-web-prod-01"], assignedToName: "DevOps Lead", eventIndex: 44, offset: 1 * DAY, acknowledgedAt: 1 * DAY - 1 * HOUR, containedAt: 1 * DAY - 3 * HOUR, closedAt: 1 * DAY - 8 * HOUR },
    { severity: "high", title: "External SSH brute force attempt blocked", description: "Automated SSH brute force from Tor exit node blocked by firewall", status: "resolved", ruleName: "Brute Force", mitreAttackId: "T1110", mitreTactic: "Credential Access", mitreTechnique: "Brute Force", confidenceScore: 90, priorityScore: 70, impactedAssets: ["exg-fw-01"], assignedToName: "SOC Analyst", eventIndex: 12, offset: 6 * HOUR, acknowledgedAt: 6 * HOUR - 20 * 60000, containedAt: 6 * HOUR - 1 * HOUR, closedAt: 6 * HOUR - 3 * HOUR },
    { severity: "medium", title: "Tor exit node outbound connection blocked", description: "Outbound connection to known Tor exit node from compromised host", status: "resolved", ruleName: "C2 Beaconing", confidenceScore: 80, priorityScore: 60, impactedAssets: ["exg-ws-042"], assignedToName: "SOC Analyst", eventIndex: 15, offset: 2 * HOUR + 10000, acknowledgedAt: 2 * HOUR, containedAt: 1 * HOUR + 50000, closedAt: 1 * HOUR },
    { severity: "high", title: "S3 bucket public access enabled", description: "Production S3 bucket policy changed to allow public read access", status: "resolved", ruleName: "Cloud IAM", mitreAttackId: "T1078.004", mitreTactic: "Privilege Escalation", mitreTechnique: "Cloud Accounts", confidenceScore: 88, priorityScore: 80, impactedAssets: ["aws-account-prod"], impactedUsers: ["dev-user@exargen.com"], assignedToName: "Cloud Security", eventIndex: 39, offset: 5 * HOUR + 30000, acknowledgedAt: 5 * HOUR + 20000, containedAt: 5 * HOUR, closedAt: 4 * HOUR },
    // 2 closed
    { severity: "medium", title: "Account lockout: finance@exargen.com", description: "Account locked after 5 failed login attempts from Chinese IP", status: "closed", ruleName: "Brute Force", mitreAttackId: "T1110", mitreTactic: "Credential Access", mitreTechnique: "Brute Force", confidenceScore: 85, priorityScore: 50, impactedUsers: ["finance@exargen.com"], assignedToName: "SOC Analyst", eventIndex: 10, offset: 6 * HOUR, acknowledgedAt: 6 * HOUR - 10 * 60000, closedAt: 5 * HOUR },
    { severity: "low", title: "Ad tracker DNS query — informational", description: "DNS query for known advertising tracker domain", status: "closed", ruleName: "DNS Tunneling", confidenceScore: 30, priorityScore: 10, impactedAssets: ["exg-ws-015"], eventIndex: 21, offset: 8 * HOUR, closedAt: 7 * HOUR },
    // 2 false_positive
    { severity: "medium", title: "False Positive: Lambda invocation spike", description: "Lambda spike was due to scheduled batch processing — not anomalous", status: "false_positive", ruleName: "C2 Beaconing", confidenceScore: 20, priorityScore: 15, eventIndex: 43, offset: 14 * HOUR, closedAt: 13 * HOUR },
    { severity: "low", title: "False Positive: Antivirus update traffic", description: "Periodic outbound connections were Windows Defender definition updates", status: "false_positive", ruleName: "C2 Beaconing", confidenceScore: 10, priorityScore: 5, impactedAssets: ["exg-web-prod-01"], eventIndex: 29, offset: 12 * HOUR, closedAt: 11 * HOUR },
  ];

  const alertIds: string[] = [];
  for (const a of alertDefs) {
    const rule = ruleByName(a.ruleName);
    const eIdx = Math.min(a.eventIndex, eventIds.length - 1);
    const created = await prisma.siemAlert.create({
      data: {
        id: uuid(), tenantId: tenant.id,
        ruleId: rule.id, eventId: eventIds[eIdx],
        severity: a.severity, title: a.title,
        description: a.description, status: a.status,
        mitreAttackId: a.mitreAttackId ?? rule.mitreAttackId ?? null,
        mitreTactic: a.mitreTactic ?? rule.mitreTactic ?? null,
        mitreTechnique: a.mitreTechnique ?? rule.mitreTechnique ?? null,
        confidenceScore: a.confidenceScore ?? null,
        priorityScore: a.priorityScore ?? null,
        assignedToName: a.assignedToName ?? null,
        impactedUsers: JSON.stringify(a.impactedUsers ?? []),
        impactedAssets: JSON.stringify(a.impactedAssets ?? []),
        createdAt: new Date(Date.now() - a.offset),
        acknowledgedAt: a.acknowledgedAt ? new Date(Date.now() - a.acknowledgedAt) : null,
        containedAt: a.containedAt ? new Date(Date.now() - a.containedAt) : null,
        closedAt: a.closedAt ? new Date(Date.now() - a.closedAt) : null,
      },
    });
    alertIds.push(created.id);
  }

  // ── Update rule counters (lastTriggeredAt, truePositiveCount) ──
  // Count alerts per rule and update metrics so testers see realistic data
  const alertCountByRule: Record<string, number> = {};
  for (const a of alertDefs) {
    const rule = ruleByName(a.ruleName);
    alertCountByRule[rule.id] = (alertCountByRule[rule.id] || 0) + 1;
  }
  for (const [ruleId, count] of Object.entries(alertCountByRule)) {
    await prisma.siemRule.update({
      where: { id: ruleId },
      data: {
        lastTriggeredAt: new Date(Date.now() - 30 * 60000),
        truePositiveCount: count,
      },
    });
  }

  // ── 5 Incidents ──
  const incidentDefs = [
    {
      title: "Active Ransomware Attack — exg-db-01",
      description: "Ransomware attack in progress targeting database server with file encryption and shadow copy deletion",
      severity: "critical", status: "investigating", priority: "critical",
      assignedToName: "SOC Lead", impactSummary: "Critical database server under active ransomware attack. File encryption detected with VSS shadow copy deletion. Potential data loss for production databases.",
      impactedUsers: ["EXARGEN\\db-admin"], impactedAssets: ["exg-db-01","exg-ws-042"],
      rootCause: "Initial compromise via phishing email → lateral movement → credential theft → ransomware deployment",
      mitreTactics: ["Execution","Credential Access","Lateral Movement","Impact"],
      mitreTechniques: ["T1059.001","T1003.001","T1021","T1486"],
      slaBreached: false, detectedOffset: 30 * 60000,
      alertIndices: [0, 2, 10, 11],
      timeline: [
        { timestamp: -35 * 60000, action: "detected", actor: "SIEM Correlation Engine", details: "Mass file encryption detected on exg-db-01" },
        { timestamp: -30 * 60000, action: "acknowledged", actor: "SOC Analyst", details: "Alert escalated to incident — ransomware indicators confirmed" },
        { timestamp: -25 * 60000, action: "investigation_started", actor: "SOC Lead", details: "Investigation initiated — correlating with prior C2 and lateral movement alerts" },
        { timestamp: -20 * 60000, action: "evidence_collected", actor: "SOC Lead", details: "Memory dump and disk image collected from exg-db-01" },
      ],
      evidence: [
        { type: "memory_dump", name: "exg-db-01-memdump-20260310.raw", addedAt: -20 * 60000 },
        { type: "disk_image", name: "exg-db-01-disk-20260310.e01", addedAt: -18 * 60000 },
        { type: "log_export", name: "crowdstrike-exg-db-01-events.json", addedAt: -15 * 60000 },
      ],
      remediationSteps: [
        { step: "Isolate exg-db-01 from network", status: "completed", assignee: "Network Team" },
        { step: "Disable compromised service account", status: "completed", assignee: "IAM Team" },
        { step: "Collect forensic evidence", status: "in_progress", assignee: "SOC Lead" },
        { step: "Restore from clean backup", status: "pending", assignee: "DBA Team" },
        { step: "Reset all domain credentials", status: "pending", assignee: "IAM Team" },
      ],
      complianceMapping: [
        { framework: "NIST CSF 2.0", control: "RS.AN-01" }, { framework: "NIST CSF 2.0", control: "RS.MI-01" },
        { framework: "CIS v8.1", control: "17.1" }, { framework: "PCI DSS", control: "12.10" },
      ],
    },
    {
      title: "Brute Force Campaign — External Credential Attack",
      description: "Sustained brute force and password spray campaign targeting multiple user accounts from Russian IP range",
      severity: "high", status: "contained", priority: "high",
      assignedToName: "SOC Analyst", impactSummary: "Multiple accounts targeted by brute force from 198.51.100.17. One account locked, no confirmed compromise. IP blocked at firewall.",
      impactedUsers: ["admin@exargen.com","finance@exargen.com","unknown@exargen.com"],
      impactedAssets: ["exg-idp-01","exg-fw-01"],
      rootCause: "Automated credential stuffing attack from known malicious IP range in Russia",
      mitreTactics: ["Credential Access","Initial Access"],
      mitreTechniques: ["T1110","T1078"],
      slaBreached: false, detectedOffset: 5 * HOUR,
      acknowledgedOffset: 5 * HOUR - 15 * 60000, containedOffset: 5 * HOUR - 2 * HOUR,
      alertIndices: [5, 6, 18, 22],
      timeline: [
        { timestamp: -(5 * HOUR + 30000), action: "detected", actor: "SIEM Correlation Engine", details: "Multiple failed login attempts from single IP exceeds threshold" },
        { timestamp: -(5 * HOUR), action: "acknowledged", actor: "SOC Analyst", details: "Brute force pattern confirmed — 15 accounts targeted in 30 minutes" },
        { timestamp: -(4 * HOUR + 30000), action: "investigation_started", actor: "SOC Analyst", details: "IP reputation checked — known malicious, ThreatIntel hit confirmed" },
        { timestamp: -(4 * HOUR), action: "containment_initiated", actor: "SOC Analyst", details: "IP 198.51.100.17 blocked at perimeter firewall" },
        { timestamp: -(3 * HOUR), action: "contained", actor: "Network Team", details: "Entire /24 subnet blocked. No successful authentications from source IP confirmed." },
      ],
      evidence: [
        { type: "log_export", name: "auth-failures-198.51.100.17.json", addedAt: -(4 * HOUR) },
        { type: "threat_intel", name: "ip-reputation-198.51.100.17.pdf", addedAt: -(4 * HOUR + 15 * 60000) },
      ],
      remediationSteps: [
        { step: "Block source IP at perimeter firewall", status: "completed", assignee: "Network Team" },
        { step: "Block /24 subnet", status: "completed", assignee: "Network Team" },
        { step: "Force password reset for targeted accounts", status: "completed", assignee: "IAM Team" },
        { step: "Enable enhanced monitoring for auth events", status: "in_progress", assignee: "SOC Analyst" },
      ],
      complianceMapping: [
        { framework: "NIST CSF 2.0", control: "PR.AC-07" }, { framework: "CIS v8.1", control: "6.2" },
      ],
    },
    {
      title: "Data Exfiltration Attempt — Compromised Workstation",
      description: "250MB data upload to external storage from compromised workstation exg-ws-042, linked to C2 beaconing",
      severity: "high", status: "recovered", priority: "high",
      assignedToName: "SOC Lead", impactSummary: "Compromised workstation exg-ws-042 used to exfiltrate ~250MB to external S3 storage. C2 channel identified and neutralized. Data loss assessment pending.",
      impactedUsers: ["EXARGEN\\compromised-svc"], impactedAssets: ["exg-ws-042"],
      rootCause: "Phishing email delivered malicious executable → C2 established → data exfiltrated via HTTPS to attacker-controlled S3 bucket",
      mitreTactics: ["Command and Control","Exfiltration","Execution"],
      mitreTechniques: ["T1071","T1048","T1059.001"],
      slaBreached: false, detectedOffset: 2 * HOUR,
      acknowledgedOffset: 2 * HOUR - 10 * 60000, containedOffset: 1 * HOUR + 30000, resolvedOffset: 30 * 60000,
      alertIndices: [1, 4, 9, 19],
      timeline: [
        { timestamp: -(2 * HOUR + 10000), action: "detected", actor: "SIEM Anomaly Engine", details: "Large data upload anomaly detected from exg-ws-042" },
        { timestamp: -(2 * HOUR), action: "acknowledged", actor: "SOC Analyst", details: "Correlated with C2 beaconing alert — confirmed data exfiltration" },
        { timestamp: -(1 * HOUR + 40000), action: "investigation_started", actor: "SOC Lead", details: "Full network traffic analysis initiated" },
        { timestamp: -(1 * HOUR + 30000), action: "containment_initiated", actor: "SOC Lead", details: "Workstation isolated from network. Outbound connections blocked." },
        { timestamp: -(1 * HOUR), action: "contained", actor: "Network Team", details: "All C2 IPs blocked at firewall. DNS sinkhole for C2 domains activated." },
        { timestamp: -(30 * 60000), action: "resolved", actor: "SOC Lead", details: "Workstation reimaged. Service account credentials rotated. Monitoring enhanced." },
      ],
      evidence: [
        { type: "pcap", name: "exg-ws-042-exfil-traffic.pcap", addedAt: -(1 * HOUR + 30000) },
        { type: "malware_sample", name: "update-helper.exe.zip", addedAt: -(1 * HOUR) },
        { type: "log_export", name: "network-flows-exg-ws-042.json", addedAt: -(1 * HOUR + 20000) },
      ],
      remediationSteps: [
        { step: "Isolate compromised workstation", status: "completed", assignee: "Network Team" },
        { step: "Block C2 infrastructure at all layers", status: "completed", assignee: "Network Team" },
        { step: "Rotate compromised service account", status: "completed", assignee: "IAM Team" },
        { step: "Reimage workstation from clean image", status: "completed", assignee: "Desktop Team" },
        { step: "Conduct data loss impact assessment", status: "in_progress", assignee: "Compliance Team" },
      ],
      complianceMapping: [
        { framework: "NIST CSF 2.0", control: "DE.AE-02" }, { framework: "NIST CSF 2.0", control: "RS.AN-01" },
        { framework: "GDPR", control: "Art. 33" }, { framework: "PCI DSS", control: "12.10.1" },
      ],
    },
    {
      title: "False Positive Investigation — Lambda Spike",
      description: "Lambda invocation spike initially flagged as C2 beaconing was confirmed as scheduled batch processing",
      severity: "medium", status: "closed", priority: "low",
      assignedToName: "SOC Analyst", impactSummary: "No actual security impact. Lambda spike was caused by scheduled monthly batch processing job.",
      impactedAssets: ["aws-account-prod"],
      rootCause: "Scheduled monthly batch processing job caused Lambda invocation spike matching C2 beaconing detection pattern",
      mitreTactics: ["Command and Control"], mitreTechniques: ["T1071"],
      slaBreached: false, detectedOffset: 14 * HOUR,
      acknowledgedOffset: 14 * HOUR - 30 * 60000, resolvedOffset: 13 * HOUR + 30000, closedOffset: 13 * HOUR,
      alertIndices: [23],
      timeline: [
        { timestamp: -(14 * HOUR), action: "detected", actor: "SIEM Behavioral Engine", details: "Periodic connection pattern matched C2 beaconing rule" },
        { timestamp: -(14 * HOUR - 30 * 60000), action: "acknowledged", actor: "SOC Analyst", details: "Alert reviewed — source is Lambda function, not endpoint" },
        { timestamp: -(14 * HOUR - 45 * 60000), action: "investigated", actor: "SOC Analyst", details: "CloudWatch logs confirm scheduled batch job. Pattern matches monthly schedule." },
        { timestamp: -(13 * HOUR + 30000), action: "resolved", actor: "SOC Analyst", details: "Confirmed false positive. Rule tuning recommended." },
        { timestamp: -(13 * HOUR), action: "closed", actor: "SOC Lead", details: "Closed as false positive. C2 beaconing rule updated with Lambda exclusion." },
      ],
      evidence: [
        { type: "log_export", name: "cloudwatch-lambda-invocations.json", addedAt: -(14 * HOUR - 45 * 60000) },
      ],
      remediationSteps: [
        { step: "Verify Lambda invocation source", status: "completed", assignee: "SOC Analyst" },
        { step: "Update C2 beaconing rule with Lambda exclusion", status: "completed", assignee: "SOC Lead" },
      ],
      complianceMapping: [],
    },
    {
      title: "Cloud IAM Privilege Escalation — AWS Production",
      description: "Developer account escalated IAM permissions to full admin in production AWS account, followed by S3 policy modification",
      severity: "critical", status: "investigating", priority: "critical",
      assignedToName: "Cloud Security", impactSummary: "Developer dev-user@exargen.com escalated own IAM role to AdministratorAccess. S3 bucket policy modified to allow public read. Potential data exposure.",
      impactedUsers: ["dev-user@exargen.com"], impactedAssets: ["aws-account-prod"],
      mitreTactics: ["Privilege Escalation","Initial Access"],
      mitreTechniques: ["T1078.004"],
      slaBreached: true, detectedOffset: 6 * HOUR,
      acknowledgedOffset: 6 * HOUR - 20 * 60000,
      alertIndices: [12, 21],
      timeline: [
        { timestamp: -(6 * HOUR), action: "detected", actor: "SIEM Correlation Engine", details: "IAM role escalation from ReadOnly to AdministratorAccess detected" },
        { timestamp: -(6 * HOUR - 20 * 60000), action: "acknowledged", actor: "Cloud Security", details: "Confirmed unauthorized escalation — no change request or approval found" },
        { timestamp: -(6 * HOUR - 30 * 60000), action: "investigation_started", actor: "Cloud Security", details: "CloudTrail analysis initiated — mapping all actions taken with elevated permissions" },
        { timestamp: -(5 * HOUR + 30000), action: "evidence_collected", actor: "Cloud Security", details: "S3 bucket public access modification discovered — checking for data exposure" },
      ],
      evidence: [
        { type: "log_export", name: "cloudtrail-dev-user-actions.json", addedAt: -(6 * HOUR - 30 * 60000) },
        { type: "config_snapshot", name: "s3-bucket-policy-before-after.json", addedAt: -(5 * HOUR + 30000) },
      ],
      remediationSteps: [
        { step: "Revoke AdministratorAccess from dev-user", status: "completed", assignee: "Cloud Security" },
        { step: "Revert S3 bucket policy to private", status: "completed", assignee: "Cloud Security" },
        { step: "Audit all actions performed with elevated permissions", status: "in_progress", assignee: "Cloud Security" },
        { step: "Implement SCP to prevent self-escalation", status: "pending", assignee: "Cloud Architecture" },
        { step: "Review IAM policy attachment permissions", status: "pending", assignee: "Cloud Architecture" },
      ],
      complianceMapping: [
        { framework: "NIST CSF 2.0", control: "PR.AC-04" }, { framework: "CIS v8.1", control: "5.4" },
        { framework: "PCI DSS", control: "7.1" },
      ],
    },
  ];

  const siemIncidents: string[] = [];
  for (const inc of incidentDefs) {
    const timelineJson = inc.timeline.map(t => ({
      ...t, timestamp: new Date(Date.now() + t.timestamp).toISOString(),
    }));
    const evidenceJson = inc.evidence.map(e => ({
      ...e, addedAt: new Date(Date.now() + e.addedAt).toISOString(),
    }));

    const incident = await prisma.siemIncident.create({
      data: {
        id: uuid(), tenantId: tenant.id,
        title: inc.title, description: inc.description,
        severity: inc.severity, status: inc.status, priority: inc.priority,
        assignedToName: inc.assignedToName ?? null,
        impactSummary: inc.impactSummary ?? null,
        impactedUsers: JSON.stringify(inc.impactedUsers ?? []),
        impactedAssets: JSON.stringify(inc.impactedAssets ?? []),
        rootCause: inc.rootCause ?? null,
        mitreTactics: JSON.stringify(inc.mitreTactics ?? []),
        mitreTechniques: JSON.stringify(inc.mitreTechniques ?? []),
        timeline: JSON.stringify(timelineJson),
        evidence: JSON.stringify(evidenceJson),
        remediationSteps: JSON.stringify(inc.remediationSteps ?? []),
        complianceMapping: JSON.stringify(inc.complianceMapping ?? []),
        slaBreached: inc.slaBreached ?? false,
        detectedAt: new Date(Date.now() - inc.detectedOffset),
        acknowledgedAt: inc.acknowledgedOffset ? new Date(Date.now() - inc.acknowledgedOffset) : null,
        containedAt: inc.containedOffset ? new Date(Date.now() - inc.containedOffset) : null,
        resolvedAt: inc.resolvedOffset ? new Date(Date.now() - inc.resolvedOffset) : null,
        closedAt: inc.closedOffset ? new Date(Date.now() - inc.closedOffset) : null,
      },
    });
    siemIncidents.push(incident.id);

    // Link alerts to incident
    for (const ai of inc.alertIndices) {
      if (ai < alertIds.length) {
        await prisma.siemAlert.update({
          where: { id: alertIds[ai] },
          data: { incidentId: incident.id },
        });
      }
    }
  }

  console.log(`   ✅ ${siemRules.length} rules, ${eventIds.length} events, ${alertIds.length} alerts, ${siemIncidents.length} incidents seeded\n`);

  // ─── 19. Seed AI Actions (Phase 7) ───────────────────────────────
  console.log("🤖 Seeding AI actions...");

  await prisma.aiAction.deleteMany({ where: { tenantId: tenant.id } });

  const aiActions = [
    { type: "remediation", title: "Remediate: Potential Log4Shell (Log4j RCE) Vulnerability", description: "Update Log4j to version 2.17.1 or later on API server 10.0.2.10", riskLevel: "critical", status: "pending", config: { scanId: scan1.id, cveId: "CVE-2021-44228", target: "10.0.2.10", action: "patch" } },
    { type: "remediation", title: "Remediate: Environment File (.env) Accessible", description: "Block access to .env files on web server. Rotate all exposed credentials.", riskLevel: "critical", status: "pending", config: { scanId: scan1.id, target: "10.0.1.10", action: "config_change" } },
    { type: "remediation", title: "Remediate: RDP Port (3389) Exposed", description: "Disable RDP or restrict access via VPN on 10.0.1.10", riskLevel: "critical", status: "pending", config: { scanId: scan2.id, cveId: "CVE-2019-0708", target: "10.0.1.10", action: "firewall_rule" } },
    { type: "patch", title: "Apply SSL Certificate Renewal", description: "Renew SSL/TLS certificate for exg-web-prod-01 before expiry in 18 days", riskLevel: "high", status: "pending", config: { scanId: scan1.id, target: "10.0.1.10", action: "cert_renewal" } },
    { type: "firewall_rule", title: "Block Database Port External Access", description: "Add firewall rule to restrict PostgreSQL 5432 to application servers only", riskLevel: "high", status: "approved", config: { scanId: scan1.id, target: "10.0.3.10", port: 5432, action: "firewall_rule" }, approvedAt: new Date(Date.now() - 1 * DAY) },
    { type: "patch", title: "Disable TLS 1.0/1.1 on Staging", description: "Configure staging server to support only TLS 1.2 and TLS 1.3", riskLevel: "medium", status: "approved", config: { scanId: scan3.id, target: "10.1.1.10", action: "config_change" }, approvedAt: new Date(Date.now() - 8 * HOUR) },
    { type: "remediation", title: "Remove .git Directory from Web Root", description: "Block access to .git directory on development server 10.3.1.10", riskLevel: "high", status: "executed", config: { scanId: scan3.id, target: "10.3.1.10", action: "config_change" }, approvedAt: new Date(Date.now() - 10 * HOUR), executedAt: new Date(Date.now() - 9 * HOUR) },
    { type: "siem_rule", title: "Create SIEM Rule for Telnet Access", description: "Monitor and alert on any Telnet (port 23) connection attempts", riskLevel: "medium", status: "rejected", config: { target: "10.0.0.1", port: 23, action: "monitoring" } },
  ];

  for (const action of aiActions) {
    await prisma.aiAction.create({
      data: {
        id: uuid(), tenantId: tenant.id,
        type: action.type, title: action.title, description: action.description,
        riskLevel: action.riskLevel, status: action.status,
        config: JSON.stringify(action.config),
        approvedAt: (action as Record<string, unknown>).approvedAt as Date | undefined,
        executedAt: (action as Record<string, unknown>).executedAt as Date | undefined,
      },
    });
  }
  console.log(`   ✅ ${aiActions.length} AI actions seeded\n`);

  // ─── Summary ─────────────────────────────────────────────────────
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  ✅ SEED COMPLETED — Exargen Production (Phase 10 — Enterprise SOC)");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  ${CAPABILITIES.length} capabilities · ${BUILTIN_ROLES.length} roles · 6 scopes`);
  console.log(`  ${tagDefinitions.length} tags · ${assetDefinitions.length} assets · ${autoTagRules.length} auto-tag rules`);
  console.log(`  ${auditEvents.length} audit events (hash-chained) · ${sessionDefinitions.length} sessions`);
  console.log(`  4 scans · 30 findings · ${siemRules.length} SIEM rules · ${eventIds.length} events · ${alertIds.length} alerts · ${siemIncidents.length} incidents`);
  console.log(`  ${aiActions.length} AI actions · 5 users (1 admin + ${demoUsers.length} demo users)`);
  console.log("");
  console.log("  Login Credentials:");
  console.log("  ├─ Platform Admin:     admin@exargen.com    / Admin123!");
  console.log("  ├─ Security Analyst:   analyst@exargen.com  / Analyst123!");
  console.log("  ├─ Auditor:            auditor@exargen.com  / Auditor123!");
  console.log("  ├─ Viewer:             viewer@exargen.com   / Viewer123!");
  console.log("  └─ Org Admin:          orgadmin@exargen.com / OrgAdmin123!");
  console.log("═══════════════════════════════════════════════════════════");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
