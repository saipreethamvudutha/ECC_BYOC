import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";
import { CAPABILITIES, BUILTIN_ROLES } from "../src/lib/capabilities";

const prisma = new PrismaClient();

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  BYOC Database Seed — RBAC v2 (Two-Axis Model)");
  console.log("═══════════════════════════════════════════════════════════\n");

  // ─── 1. Seed Capabilities (39, system-wide) ────────────────────
  console.log("📋 Seeding 39 capabilities across 8 modules...");

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

  // ─── 2. Create Demo Tenant ──────────────────────────────────────
  console.log("🏢 Creating demo tenant...");
  const tenant = await prisma.tenant.upsert({
    where: { slug: "acme-corp" },
    update: {},
    create: {
      id: uuid(),
      name: "Acme Corporation",
      slug: "acme-corp",
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

  // ─── 3. Create Built-in Roles (7) ──────────────────────────────
  console.log("🔐 Creating 7 built-in roles...");

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
    console.log(`   🔒 ${roleDef.name} (${roleDef.capabilities.length}/39 capabilities)`);
  }
  console.log("");

  // ─── 4. Assign Capabilities to Roles ────────────────────────────
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

  // ─── 5. Create Demo Users ──────────────────────────────────────
  console.log("👤 Creating demo users...");
  const passwordHash = await bcrypt.hash("Admin123!", 12);

  const superAdmin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: "admin@acme.co" } },
    update: {},
    create: {
      id: uuid(),
      tenantId: tenant.id,
      email: "admin@acme.co",
      name: "Rahul Sharma",
      passwordHash,
      status: "active",
      mfaEnabled: true,
      department: "Security Operations",
    },
  });

  const analyst = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: "priya@acme.co" } },
    update: {},
    create: {
      id: uuid(),
      tenantId: tenant.id,
      email: "priya@acme.co",
      name: "Priya Mehta",
      passwordHash,
      status: "active",
      department: "SOC Team",
    },
  });

  const auditor = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: "amit@acme.co" } },
    update: {},
    create: {
      id: uuid(),
      tenantId: tenant.id,
      email: "amit@acme.co",
      name: "Amit Kumar",
      passwordHash,
      status: "active",
      department: "Compliance",
    },
  });

  const remediationUser = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: "sara@acme.co" } },
    update: {},
    create: {
      id: uuid(),
      tenantId: tenant.id,
      email: "sara@acme.co",
      name: "Sara Joshi",
      passwordHash,
      status: "active",
      department: "Engineering",
    },
  });

  console.log("   ✅ 4 demo users created\n");

  // ─── 6. Assign Roles to Users ──────────────────────────────────
  console.log("🔗 Assigning roles to users...");

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: superAdmin.id, roleId: roleMap["platform-admin"] } },
    update: {},
    create: { id: uuid(), userId: superAdmin.id, roleId: roleMap["platform-admin"] },
  });
  console.log("   Rahul Sharma → Platform Administrator");

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: analyst.id, roleId: roleMap["security-analyst"] } },
    update: {},
    create: { id: uuid(), userId: analyst.id, roleId: roleMap["security-analyst"] },
  });
  console.log("   Priya Mehta  → Security Analyst");

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: auditor.id, roleId: roleMap["auditor"] } },
    update: {},
    create: { id: uuid(), userId: auditor.id, roleId: roleMap["auditor"] },
  });
  console.log("   Amit Kumar   → Auditor");

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: remediationUser.id, roleId: roleMap["remediation-user"] } },
    update: {},
    create: { id: uuid(), userId: remediationUser.id, roleId: roleMap["remediation-user"] },
  });
  console.log("   Sara Joshi   → Remediation User\n");

  // ─── 7. Seed Tags ──────────────────────────────────────────────
  console.log("🏷️  Seeding tags...");

  const tagDefs = [
    { key: "env", value: "production", color: "#ef4444" },
    { key: "env", value: "staging", color: "#f59e0b" },
    { key: "env", value: "development", color: "#22c55e" },
    { key: "region", value: "mumbai", color: "#3b82f6" },
    { key: "region", value: "delhi", color: "#8b5cf6" },
    { key: "region", value: "bangalore", color: "#06b6d4" },
    { key: "team", value: "payments", color: "#ec4899" },
    { key: "team", value: "platform", color: "#14b8a6" },
    { key: "team", value: "infra", color: "#f97316" },
    { key: "compliance", value: "pci-dss", color: "#6366f1" },
    { key: "compliance", value: "hipaa", color: "#a855f7" },
    { key: "criticality", value: "critical", color: "#dc2626" },
    { key: "criticality", value: "high", color: "#ea580c" },
    { key: "criticality", value: "medium", color: "#ca8a04" },
    { key: "criticality", value: "low", color: "#16a34a" },
  ];

  const tagMap: Record<string, string> = {};

  for (const t of tagDefs) {
    const tag = await prisma.tag.upsert({
      where: { tenantId_key_value: { tenantId: tenant.id, key: t.key, value: t.value } },
      update: { color: t.color },
      create: {
        id: uuid(),
        tenantId: tenant.id,
        key: t.key,
        value: t.value,
        color: t.color,
      },
    });
    tagMap[`${t.key}:${t.value}`] = tag.id;
  }
  console.log(`   ✅ ${tagDefs.length} tags seeded\n`);

  // ─── 8. Seed Scopes ────────────────────────────────────────────
  console.log("🔭 Seeding data scopes...");

  const scopeDefs = [
    { name: "Global", description: "All assets — unrestricted access", isGlobal: true, tagFilter: "{}" },
    { name: "Production Mumbai", description: "Production assets in Mumbai region", isGlobal: false, tagFilter: JSON.stringify({ env: ["production"], region: ["mumbai"] }) },
    { name: "Production Delhi", description: "Production assets in Delhi region", isGlobal: false, tagFilter: JSON.stringify({ env: ["production"], region: ["delhi"] }) },
    { name: "Staging All", description: "All staging environment assets", isGlobal: false, tagFilter: JSON.stringify({ env: ["staging"] }) },
    { name: "Payments Team", description: "All assets owned by the Payments team", isGlobal: false, tagFilter: JSON.stringify({ team: ["payments"] }) },
    { name: "PCI Assets", description: "Assets subject to PCI DSS compliance", isGlobal: false, tagFilter: JSON.stringify({ compliance: ["pci-dss"] }) },
  ];

  const scopeMap: Record<string, string> = {};

  for (const s of scopeDefs) {
    const scope = await prisma.scope.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: s.name } },
      update: { description: s.description, tagFilter: s.tagFilter, isGlobal: s.isGlobal },
      create: { id: uuid(), tenantId: tenant.id, ...s },
    });
    scopeMap[s.name] = scope.id;
  }
  console.log(`   ✅ ${scopeDefs.length} scopes seeded\n`);

  // ─── 9. Assign Scopes to Users ─────────────────────────────────
  console.log("🔗 Assigning scopes to users...");

  await prisma.userScope.upsert({
    where: { userId_scopeId: { userId: analyst.id, scopeId: scopeMap["Production Mumbai"] } },
    update: {},
    create: { userId: analyst.id, scopeId: scopeMap["Production Mumbai"] },
  });
  console.log("   Priya Mehta  → Production Mumbai");

  await prisma.userScope.upsert({
    where: { userId_scopeId: { userId: auditor.id, scopeId: scopeMap["Global"] } },
    update: {},
    create: { userId: auditor.id, scopeId: scopeMap["Global"] },
  });
  console.log("   Amit Kumar   → Global");

  await prisma.userScope.upsert({
    where: { userId_scopeId: { userId: remediationUser.id, scopeId: scopeMap["Payments Team"] } },
    update: {},
    create: { userId: remediationUser.id, scopeId: scopeMap["Payments Team"] },
  });
  console.log("   Sara Joshi   → Payments Team\n");

  // ─── 10. Seed Compliance Frameworks ─────────────────────────────
  console.log("📊 Seeding compliance frameworks...");

  const gdpr = await prisma.complianceFramework.upsert({
    where: { tenantId_name_version: { tenantId: tenant.id, name: "GDPR", version: "2016/679" } },
    update: {},
    create: { id: uuid(), tenantId: tenant.id, name: "GDPR", version: "2016/679", description: "General Data Protection Regulation" },
  });

  const pciDss = await prisma.complianceFramework.upsert({
    where: { tenantId_name_version: { tenantId: tenant.id, name: "PCI DSS", version: "4.0" } },
    update: {},
    create: { id: uuid(), tenantId: tenant.id, name: "PCI DSS", version: "4.0", description: "Payment Card Industry Data Security Standard" },
  });

  const hipaa = await prisma.complianceFramework.upsert({
    where: { tenantId_name_version: { tenantId: tenant.id, name: "HIPAA", version: "2013" } },
    update: {},
    create: { id: uuid(), tenantId: tenant.id, name: "HIPAA", version: "2013", description: "Health Insurance Portability and Accountability Act" },
  });

  const gdprControls = [
    { controlId: "Art. 5", title: "Principles of Processing", category: "Data Protection", status: "compliant" },
    { controlId: "Art. 6", title: "Lawfulness of Processing", category: "Data Protection", status: "compliant" },
    { controlId: "Art. 12", title: "Transparent Information", category: "Data Subject Rights", status: "partially_compliant" },
    { controlId: "Art. 15", title: "Right of Access", category: "Data Subject Rights", status: "compliant" },
    { controlId: "Art. 17", title: "Right to Erasure", category: "Data Subject Rights", status: "partially_compliant" },
    { controlId: "Art. 25", title: "Data Protection by Design", category: "Technical Measures", status: "compliant" },
    { controlId: "Art. 30", title: "Records of Processing", category: "Accountability", status: "non_compliant" },
    { controlId: "Art. 32", title: "Security of Processing", category: "Technical Measures", status: "compliant" },
    { controlId: "Art. 33", title: "Breach Notification (Authority)", category: "Breach Management", status: "partially_compliant" },
    { controlId: "Art. 35", title: "Data Protection Impact Assessment", category: "Risk Management", status: "not_assessed" },
  ];
  for (const ctrl of gdprControls) {
    await prisma.complianceControl.upsert({
      where: { frameworkId_controlId: { frameworkId: gdpr.id, controlId: ctrl.controlId } },
      update: {}, create: { id: uuid(), tenantId: tenant.id, frameworkId: gdpr.id, ...ctrl },
    });
  }

  const pciControls = [
    { controlId: "Req. 1", title: "Install and Maintain Network Security Controls", category: "Network Security", status: "compliant" },
    { controlId: "Req. 2", title: "Apply Secure Configurations", category: "System Security", status: "partially_compliant" },
    { controlId: "Req. 3", title: "Protect Stored Account Data", category: "Data Protection", status: "compliant" },
    { controlId: "Req. 4", title: "Protect Data with Strong Cryptography", category: "Cryptography", status: "compliant" },
    { controlId: "Req. 5", title: "Protect from Malicious Software", category: "Malware Protection", status: "partially_compliant" },
    { controlId: "Req. 6", title: "Develop and Maintain Secure Systems", category: "Application Security", status: "non_compliant" },
    { controlId: "Req. 7", title: "Restrict Access by Business Need", category: "Access Control", status: "compliant" },
    { controlId: "Req. 8", title: "Identify Users and Authenticate Access", category: "Authentication", status: "compliant" },
    { controlId: "Req. 9", title: "Restrict Physical Access", category: "Physical Security", status: "not_assessed" },
    { controlId: "Req. 10", title: "Log and Monitor All Access", category: "Logging & Monitoring", status: "partially_compliant" },
    { controlId: "Req. 11", title: "Test Security Regularly", category: "Security Testing", status: "compliant" },
    { controlId: "Req. 12", title: "Support Information Security with Policies", category: "Policy", status: "partially_compliant" },
  ];
  for (const ctrl of pciControls) {
    await prisma.complianceControl.upsert({
      where: { frameworkId_controlId: { frameworkId: pciDss.id, controlId: ctrl.controlId } },
      update: {}, create: { id: uuid(), tenantId: tenant.id, frameworkId: pciDss.id, ...ctrl },
    });
  }

  const hipaaControls = [
    { controlId: "164.308(a)(1)", title: "Security Management Process", category: "Administrative Safeguards", status: "compliant" },
    { controlId: "164.308(a)(3)", title: "Workforce Security", category: "Administrative Safeguards", status: "partially_compliant" },
    { controlId: "164.308(a)(4)", title: "Information Access Management", category: "Administrative Safeguards", status: "compliant" },
    { controlId: "164.308(a)(5)", title: "Security Awareness and Training", category: "Administrative Safeguards", status: "non_compliant" },
    { controlId: "164.310(a)", title: "Facility Access Controls", category: "Physical Safeguards", status: "not_assessed" },
    { controlId: "164.310(d)", title: "Device and Media Controls", category: "Physical Safeguards", status: "partially_compliant" },
    { controlId: "164.312(a)", title: "Access Control", category: "Technical Safeguards", status: "compliant" },
    { controlId: "164.312(b)", title: "Audit Controls", category: "Technical Safeguards", status: "compliant" },
    { controlId: "164.312(c)", title: "Integrity", category: "Technical Safeguards", status: "partially_compliant" },
    { controlId: "164.312(d)", title: "Person or Entity Authentication", category: "Technical Safeguards", status: "compliant" },
    { controlId: "164.312(e)", title: "Transmission Security", category: "Technical Safeguards", status: "compliant" },
  ];
  for (const ctrl of hipaaControls) {
    await prisma.complianceControl.upsert({
      where: { frameworkId_controlId: { frameworkId: hipaa.id, controlId: ctrl.controlId } },
      update: {}, create: { id: uuid(), tenantId: tenant.id, frameworkId: hipaa.id, ...ctrl },
    });
  }
  console.log("   ✅ 3 frameworks, 33 controls\n");

  // ─── 11. Seed Demo Assets ──────────────────────────────────────
  console.log("💻 Seeding demo assets with tags...");

  const prodGroup = await prisma.assetGroup.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: "production" } },
    update: {},
    create: { id: uuid(), tenantId: tenant.id, name: "Production", slug: "production", description: "Production environment assets" },
  });

  const stagingGroup = await prisma.assetGroup.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: "staging" } },
    update: {},
    create: { id: uuid(), tenantId: tenant.id, name: "Staging", slug: "staging", description: "Staging environment assets" },
  });

  const demoAssets = [
    { name: "web-prod-01", type: "server", ipAddress: "10.0.1.10", hostname: "web-prod-01.acme.co", os: "Ubuntu 22.04 LTS", criticality: "critical", groupId: prodGroup.id, tagKeys: ["env:production", "region:mumbai", "team:platform", "criticality:critical"] },
    { name: "db-prod-01", type: "database", ipAddress: "10.0.1.20", hostname: "db-prod-01.acme.co", os: "Ubuntu 22.04 LTS", criticality: "critical", groupId: prodGroup.id, tagKeys: ["env:production", "region:mumbai", "team:payments", "compliance:pci-dss", "criticality:critical"] },
    { name: "app-prod-01", type: "server", ipAddress: "10.0.1.30", hostname: "app-prod-01.acme.co", os: "Ubuntu 22.04 LTS", criticality: "high", groupId: prodGroup.id, tagKeys: ["env:production", "region:mumbai", "team:payments", "criticality:high"] },
    { name: "api-gateway", type: "cloud_resource", ipAddress: "10.0.1.40", hostname: "api.acme.co", criticality: "critical", groupId: prodGroup.id, tagKeys: ["env:production", "region:mumbai", "team:platform", "criticality:critical"] },
    { name: "web-prod-delhi", type: "server", ipAddress: "10.0.3.10", hostname: "web-prod-delhi.acme.co", os: "Ubuntu 22.04 LTS", criticality: "high", groupId: prodGroup.id, tagKeys: ["env:production", "region:delhi", "team:platform", "criticality:high"] },
    { name: "web-staging-01", type: "server", ipAddress: "10.0.2.10", hostname: "web-staging.acme.co", os: "Ubuntu 22.04 LTS", criticality: "medium", groupId: stagingGroup.id, tagKeys: ["env:staging", "region:mumbai", "team:platform", "criticality:medium"] },
    { name: "fw-edge-01", type: "network_device", ipAddress: "10.0.0.1", hostname: "fw-edge-01.acme.co", criticality: "critical", tagKeys: ["env:production", "region:mumbai", "team:infra", "criticality:critical"] },
    { name: "switch-core-01", type: "network_device", ipAddress: "10.0.0.2", hostname: "switch-core.acme.co", criticality: "high", tagKeys: ["env:production", "region:mumbai", "team:infra", "criticality:high"] },
    { name: "laptop-rs-001", type: "workstation", ipAddress: "192.168.1.100", hostname: "DESKTOP-RS001", os: "Windows 11 Pro", criticality: "medium", tagKeys: ["env:production", "team:payments", "criticality:medium"] },
  ];

  for (const assetDef of demoAssets) {
    const { tagKeys, ...assetData } = assetDef;
    const asset = await prisma.asset.upsert({
      where: { id: uuid() },
      update: {},
      create: { id: uuid(), tenantId: tenant.id, ...assetData },
    });

    if (tagKeys) {
      for (const tagKey of tagKeys) {
        const tagId = tagMap[tagKey];
        if (tagId) {
          await prisma.assetTag.upsert({
            where: { assetId_tagId: { assetId: asset.id, tagId } },
            update: {},
            create: { assetId: asset.id, tagId, appliedBy: "seed" },
          });
        }
      }
    }
  }
  console.log(`   ✅ ${demoAssets.length} assets with tags\n`);

  // ─── 12. Seed Demo Scan ────────────────────────────────────────
  console.log("🔍 Seeding demo scan...");
  const scan = await prisma.scan.create({
    data: {
      id: uuid(), tenantId: tenant.id,
      name: "Weekly Vulnerability Scan", type: "vulnerability", status: "completed",
      targets: JSON.stringify(["10.0.1.0/24"]),
      startedAt: new Date(Date.now() - 3600000), completedAt: new Date(),
      createdById: superAdmin.id,
    },
  });

  const findings = [
    { severity: "critical", title: "CVE-2024-1234: Remote Code Execution in OpenSSL", cveId: "CVE-2024-1234", cvssScore: 9.8 },
    { severity: "high", title: "CVE-2024-5678: SQL Injection in API Endpoint", cveId: "CVE-2024-5678", cvssScore: 8.5 },
    { severity: "high", title: "Outdated TLS 1.1 Configuration Detected", cvssScore: 7.5 },
    { severity: "medium", title: "Missing HTTP Security Headers (HSTS, CSP)", cvssScore: 5.3 },
    { severity: "medium", title: "Default SSH Port Exposed", cvssScore: 4.8 },
    { severity: "low", title: "Server Version Information Disclosure", cvssScore: 3.1 },
    { severity: "info", title: "Open Port 443 (HTTPS) Detected", cvssScore: 0.0 },
  ];
  for (const f of findings) {
    await prisma.scanResult.create({ data: { id: uuid(), tenantId: tenant.id, scanId: scan.id, ...f } });
  }

  // ─── 13. Seed SIEM Data ────────────────────────────────────────
  console.log("🛡️  Seeding SIEM data...");
  const siemEvents = [
    { source: "firewall", severity: "high", category: "network", title: "Blocked brute-force attempt from 203.0.113.42", sourceIp: "203.0.113.42", destIp: "10.0.1.10" },
    { source: "ids", severity: "critical", category: "malware", title: "Malware signature detected: Cobalt Strike beacon", sourceIp: "10.0.1.100", destIp: "198.51.100.55" },
    { source: "endpoint", severity: "medium", category: "policy_violation", title: "Unauthorized USB device connected on DESKTOP-RS001" },
    { source: "application", severity: "high", category: "authentication", title: "Multiple failed login attempts for admin@acme.co", sourceIp: "203.0.113.99" },
    { source: "cloud", severity: "low", category: "system", title: "AWS IAM policy change detected in production account" },
  ];
  for (const evt of siemEvents) {
    await prisma.siemEvent.create({ data: { id: uuid(), tenantId: tenant.id, ...evt } });
  }

  // ─── 14. Seed Audit Log ────────────────────────────────────────
  console.log("📝 Seeding audit log...");
  const auditEntries = [
    { actorId: superAdmin.id, actorType: "user", action: "user.login", result: "success", details: JSON.stringify({ method: "password" }) },
    { actorId: superAdmin.id, actorType: "user", action: "role.assigned", resourceType: "user", resourceId: analyst.id, result: "success", details: JSON.stringify({ role: "security-analyst", target: "priya@acme.co" }) },
    { actorId: analyst.id, actorType: "user", action: "scan.executed", resourceType: "scan", resourceId: scan.id, result: "success", details: JSON.stringify({ type: "vulnerability", targets: 8 }) },
    { actorId: auditor.id, actorType: "user", action: "capability.check:admin.role.manage", result: "denied", details: JSON.stringify({ capability: "admin.role.manage" }) },
    { actorType: "ai_agent", action: "ai.action.executed", result: "success", details: JSON.stringify({ type: "patch", target: "app-prod-01", approvedBy: superAdmin.id }) },
  ];
  for (const entry of auditEntries) {
    await prisma.auditLog.create({ data: { id: uuid(), tenantId: tenant.id, ...entry } });
  }

  // ─── Summary ───────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  ✅ SEED COMPLETED SUCCESSFULLY — RBAC v2");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  39 capabilities · 7 roles · 15 tags · 6 scopes");
  console.log("  4 users · 9 assets · 3 compliance frameworks");
  console.log("");
  console.log("  Demo Credentials:");
  console.log("  ├─ Platform Admin:    admin@acme.co / Admin123!");
  console.log("  ├─ Security Analyst:  priya@acme.co / Admin123!");
  console.log("  ├─ Auditor:           amit@acme.co  / Admin123!");
  console.log("  └─ Remediation User:  sara@acme.co  / Admin123!");
  console.log("═══════════════════════════════════════════════════════════");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
