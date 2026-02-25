import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";

const prisma = new PrismaClient();

// All permissions from the BYOC resource map
const PERMISSIONS = [
  // Dashboard
  { module: "dashboard", resource: "overview", action: "view", description: "View dashboard overview" },
  { module: "dashboard", resource: "widgets", action: "view", description: "View dashboard widgets" },
  // Scans
  { module: "scans", resource: "jobs", action: "view", description: "View scan jobs" },
  { module: "scans", resource: "jobs", action: "create", description: "Create scan jobs" },
  { module: "scans", resource: "jobs", action: "edit", description: "Edit scan jobs" },
  { module: "scans", resource: "jobs", action: "delete", description: "Delete scan jobs" },
  { module: "scans", resource: "jobs", action: "execute", description: "Execute scans" },
  { module: "scans", resource: "jobs", action: "cancel", description: "Cancel running scans" },
  { module: "scans", resource: "schedules", action: "view", description: "View scan schedules" },
  { module: "scans", resource: "schedules", action: "create", description: "Create scan schedules" },
  { module: "scans", resource: "schedules", action: "edit", description: "Edit scan schedules" },
  { module: "scans", resource: "schedules", action: "delete", description: "Delete scan schedules" },
  { module: "scans", resource: "results", action: "view", description: "View scan results" },
  { module: "scans", resource: "results", action: "export", description: "Export scan results" },
  { module: "scans", resource: "policies", action: "view", description: "View scan policies" },
  { module: "scans", resource: "policies", action: "edit", description: "Edit scan policies" },
  { module: "scans", resource: "policies", action: "delete", description: "Delete scan policies" },
  // Assets
  { module: "assets", resource: "inventory", action: "view", description: "View asset inventory" },
  { module: "assets", resource: "inventory", action: "create", description: "Add assets" },
  { module: "assets", resource: "inventory", action: "edit", description: "Edit assets" },
  { module: "assets", resource: "inventory", action: "delete", description: "Delete assets" },
  { module: "assets", resource: "inventory", action: "import", description: "Import assets" },
  { module: "assets", resource: "inventory", action: "export", description: "Export assets" },
  { module: "assets", resource: "groups", action: "view", description: "View asset groups" },
  { module: "assets", resource: "groups", action: "create", description: "Create asset groups" },
  { module: "assets", resource: "groups", action: "edit", description: "Edit asset groups" },
  { module: "assets", resource: "groups", action: "delete", description: "Delete asset groups" },
  { module: "assets", resource: "tags", action: "view", description: "View asset tags" },
  { module: "assets", resource: "tags", action: "create", description: "Create asset tags" },
  { module: "assets", resource: "tags", action: "edit", description: "Edit asset tags" },
  { module: "assets", resource: "tags", action: "delete", description: "Delete asset tags" },
  { module: "assets", resource: "criticality", action: "view", description: "View asset criticality" },
  { module: "assets", resource: "criticality", action: "edit", description: "Edit asset criticality" },
  // Risk Scoring
  { module: "risk", resource: "scores", action: "view", description: "View risk scores" },
  { module: "risk", resource: "scores", action: "edit", description: "Edit risk scores" },
  { module: "risk", resource: "overrides", action: "view", description: "View risk overrides" },
  { module: "risk", resource: "overrides", action: "override", description: "Override risk scores" },
  { module: "risk", resource: "thresholds", action: "view", description: "View risk thresholds" },
  { module: "risk", resource: "thresholds", action: "edit", description: "Edit risk thresholds" },
  // Reports
  { module: "reports", resource: "generated", action: "view", description: "View reports" },
  { module: "reports", resource: "generated", action: "create", description: "Generate reports" },
  { module: "reports", resource: "generated", action: "delete", description: "Delete reports" },
  { module: "reports", resource: "generated", action: "export", description: "Export reports" },
  { module: "reports", resource: "templates", action: "view", description: "View report templates" },
  { module: "reports", resource: "templates", action: "create", description: "Create report templates" },
  { module: "reports", resource: "templates", action: "edit", description: "Edit report templates" },
  { module: "reports", resource: "templates", action: "delete", description: "Delete report templates" },
  { module: "reports", resource: "scheduled", action: "view", description: "View scheduled reports" },
  { module: "reports", resource: "scheduled", action: "schedule", description: "Schedule reports" },
  // AI Actions
  { module: "ai", resource: "actions", action: "view", description: "View AI actions" },
  { module: "ai", resource: "approvals", action: "view", description: "View AI approvals" },
  { module: "ai", resource: "approvals", action: "approve", description: "Approve AI actions" },
  { module: "ai", resource: "approvals", action: "reject", description: "Reject AI actions" },
  { module: "ai", resource: "config", action: "view", description: "View AI configuration" },
  { module: "ai", resource: "config", action: "configure", description: "Configure AI settings" },
  // SIEM
  { module: "siem", resource: "events", action: "view", description: "View SIEM events" },
  { module: "siem", resource: "events", action: "create", description: "Create SIEM events" },
  { module: "siem", resource: "alerts", action: "view", description: "View SIEM alerts" },
  { module: "siem", resource: "alerts", action: "create", description: "Create SIEM alerts" },
  { module: "siem", resource: "alerts", action: "edit", description: "Edit SIEM alerts" },
  { module: "siem", resource: "alerts", action: "acknowledge", description: "Acknowledge alerts" },
  { module: "siem", resource: "alerts", action: "escalate", description: "Escalate alerts" },
  { module: "siem", resource: "rules", action: "view", description: "View SIEM rules" },
  { module: "siem", resource: "rules", action: "create", description: "Create SIEM rules" },
  { module: "siem", resource: "rules", action: "edit", description: "Edit SIEM rules" },
  { module: "siem", resource: "rules", action: "delete", description: "Delete SIEM rules" },
  { module: "siem", resource: "integrations", action: "view", description: "View SIEM integrations" },
  { module: "siem", resource: "integrations", action: "create", description: "Create SIEM integrations" },
  { module: "siem", resource: "integrations", action: "edit", description: "Edit SIEM integrations" },
  { module: "siem", resource: "integrations", action: "delete", description: "Delete SIEM integrations" },
  // Settings
  { module: "settings", resource: "org", action: "view", description: "View org settings" },
  { module: "settings", resource: "org", action: "edit", description: "Edit org settings" },
  { module: "settings", resource: "users", action: "view", description: "View users" },
  { module: "settings", resource: "users", action: "create", description: "Create/invite users" },
  { module: "settings", resource: "users", action: "edit", description: "Edit users" },
  { module: "settings", resource: "users", action: "delete", description: "Delete users" },
  { module: "settings", resource: "roles", action: "view", description: "View roles" },
  { module: "settings", resource: "roles", action: "create", description: "Create roles" },
  { module: "settings", resource: "roles", action: "edit", description: "Edit roles" },
  { module: "settings", resource: "roles", action: "delete", description: "Delete roles" },
  { module: "settings", resource: "api_keys", action: "view", description: "View API keys" },
  { module: "settings", resource: "api_keys", action: "create", description: "Create API keys" },
  { module: "settings", resource: "api_keys", action: "edit", description: "Edit API keys" },
  { module: "settings", resource: "api_keys", action: "delete", description: "Delete API keys" },
  { module: "settings", resource: "integrations", action: "view", description: "View integrations" },
  { module: "settings", resource: "integrations", action: "create", description: "Create integrations" },
  { module: "settings", resource: "integrations", action: "edit", description: "Edit integrations" },
  { module: "settings", resource: "integrations", action: "delete", description: "Delete integrations" },
  { module: "settings", resource: "billing", action: "view", description: "View billing" },
  { module: "settings", resource: "billing", action: "edit", description: "Edit billing" },
  // Compliance
  { module: "compliance", resource: "frameworks", action: "view", description: "View compliance frameworks" },
  { module: "compliance", resource: "frameworks", action: "create", description: "Create compliance frameworks" },
  { module: "compliance", resource: "frameworks", action: "edit", description: "Edit compliance frameworks" },
  { module: "compliance", resource: "controls", action: "view", description: "View compliance controls" },
  { module: "compliance", resource: "controls", action: "edit", description: "Edit compliance controls" },
  { module: "compliance", resource: "assessments", action: "view", description: "View compliance assessments" },
  { module: "compliance", resource: "assessments", action: "create", description: "Create compliance assessments" },
  { module: "compliance", resource: "assessments", action: "edit", description: "Edit compliance assessments" },
  // System
  { module: "system", resource: "audit_log", action: "view", description: "View audit log" },
  { module: "system", resource: "audit_log", action: "export", description: "Export audit log" },
  { module: "system", resource: "health", action: "view", description: "View system health" },
  { module: "system", resource: "tenant", action: "manage", description: "Manage tenant settings" },
];

async function main() {
  console.log("Seeding database...");

  // 1. Create all permissions
  console.log("Creating permissions...");
  const permissionMap: Record<string, string> = {};

  for (const perm of PERMISSIONS) {
    const created = await prisma.permission.upsert({
      where: {
        module_resource_action: {
          module: perm.module,
          resource: perm.resource,
          action: perm.action,
        },
      },
      update: {},
      create: {
        id: uuid(),
        ...perm,
      },
    });
    permissionMap[`${perm.module}.${perm.resource}:${perm.action}`] = created.id;
  }
  console.log(`  Created ${Object.keys(permissionMap).length} permissions`);

  // 2. Create demo tenant
  console.log("Creating demo tenant...");
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
        features: ["sso", "scim", "compliance", "ai_actions", "siem"],
      }),
    },
  });

  // 3. Create built-in roles with hierarchy
  console.log("Creating built-in roles...");

  // Viewer (base level)
  const viewerRole = await prisma.role.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: "viewer" } },
    update: {},
    create: {
      id: uuid(),
      tenantId: tenant.id,
      name: "Viewer",
      slug: "viewer",
      description: "Stakeholders who need dashboards and reports only",
      isBuiltin: true,
    },
  });

  // Security Analyst (inherits Viewer)
  const analystRole = await prisma.role.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: "security-analyst" } },
    update: {},
    create: {
      id: uuid(),
      tenantId: tenant.id,
      name: "Security Analyst",
      slug: "security-analyst",
      description: "Primary operator. Runs scans, triages findings, manages assets, handles SIEM",
      isBuiltin: true,
      parentRoleId: viewerRole.id,
    },
  });

  // Auditor (read-only, inherits Viewer)
  const auditorRole = await prisma.role.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: "auditor" } },
    update: {},
    create: {
      id: uuid(),
      tenantId: tenant.id,
      name: "Auditor",
      slug: "auditor",
      description: "Compliance auditors, external reviewers. View everything, change nothing",
      isBuiltin: true,
      parentRoleId: viewerRole.id,
    },
  });

  // Org Admin (inherits Analyst + Auditor capabilities)
  const orgAdminRole = await prisma.role.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: "org-admin" } },
    update: {},
    create: {
      id: uuid(),
      tenantId: tenant.id,
      name: "Org Admin",
      slug: "org-admin",
      description: "IT/Security leadership. Full operational access minus billing and org deletion",
      isBuiltin: true,
      parentRoleId: analystRole.id,
    },
  });

  // Super Admin (top level)
  const superAdminRole = await prisma.role.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: "super-admin" } },
    update: {},
    create: {
      id: uuid(),
      tenantId: tenant.id,
      name: "Super Admin",
      slug: "super-admin",
      description: "Tenant owner. Full unrestricted access",
      isBuiltin: true,
      parentRoleId: orgAdminRole.id,
    },
  });

  // API Service Account role
  const apiRole = await prisma.role.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: "api-service" } },
    update: {},
    create: {
      id: uuid(),
      tenantId: tenant.id,
      name: "API Service Account",
      slug: "api-service",
      description: "Machine-to-machine access for CI/CD pipelines and integrations",
      isBuiltin: true,
    },
  });

  // 4. Assign permissions to roles
  console.log("Assigning permissions to roles...");

  // Helper to assign permissions
  async function assignPermissions(roleId: string, permKeys: string[], granted = true) {
    for (const key of permKeys) {
      const permId = permissionMap[key];
      if (!permId) {
        console.warn(`  Warning: Permission ${key} not found`);
        continue;
      }
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId: permId } },
        update: { granted },
        create: { id: uuid(), roleId, permissionId: permId, granted },
      });
    }
  }

  // Viewer permissions
  await assignPermissions(viewerRole.id, [
    "dashboard.overview:view", "dashboard.widgets:view",
    "risk.scores:view",
    "reports.generated:view", "reports.generated:export",
  ]);

  // Auditor permissions (view + export everything)
  const allViewPerms = Object.keys(permissionMap).filter(
    k => k.endsWith(":view") || k.endsWith(":export")
  );
  await assignPermissions(auditorRole.id, allViewPerms);

  // Security Analyst permissions
  await assignPermissions(analystRole.id, [
    "dashboard.overview:view", "dashboard.widgets:view",
    "scans.jobs:view", "scans.jobs:create", "scans.jobs:execute", "scans.jobs:cancel",
    "scans.schedules:view", "scans.schedules:create", "scans.schedules:edit",
    "scans.results:view", "scans.results:export",
    "scans.policies:view",
    "assets.inventory:view", "assets.inventory:edit", "assets.inventory:import", "assets.inventory:export",
    "assets.groups:view", "assets.groups:edit",
    "assets.tags:view", "assets.tags:create", "assets.tags:edit",
    "assets.criticality:view",
    "risk.scores:view", "risk.overrides:override",
    "reports.generated:view", "reports.generated:create", "reports.generated:export",
    "reports.templates:view",
    "reports.scheduled:view", "reports.scheduled:schedule",
    "ai.actions:view", "ai.approvals:approve", "ai.approvals:reject",
    "siem.events:view", "siem.alerts:view", "siem.alerts:create",
    "siem.alerts:acknowledge", "siem.alerts:escalate",
    "siem.rules:view",
    "compliance.frameworks:view", "compliance.controls:view", "compliance.assessments:view",
    "settings.api_keys:view", "settings.api_keys:create",
    "system.audit_log:view",
  ]);

  // Org Admin: all permissions except billing edit and tenant manage
  const allPermKeys = Object.keys(permissionMap);
  await assignPermissions(orgAdminRole.id, allPermKeys);
  await assignPermissions(orgAdminRole.id, [
    "settings.billing:edit",
    "system.tenant:manage",
  ], false); // explicitly deny

  // Super Admin: everything
  await assignPermissions(superAdminRole.id, allPermKeys);

  // 5. Create demo users
  console.log("Creating demo users...");
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
    },
  });

  // 6. Assign roles to users
  console.log("Assigning roles...");
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: superAdmin.id, roleId: superAdminRole.id } },
    update: {},
    create: { id: uuid(), userId: superAdmin.id, roleId: superAdminRole.id },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: analyst.id, roleId: analystRole.id } },
    update: {},
    create: { id: uuid(), userId: analyst.id, roleId: analystRole.id },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: auditor.id, roleId: auditorRole.id } },
    update: {},
    create: { id: uuid(), userId: auditor.id, roleId: auditorRole.id },
  });

  // 7. Seed compliance frameworks
  console.log("Creating compliance frameworks...");

  const gdpr = await prisma.complianceFramework.upsert({
    where: { tenantId_name_version: { tenantId: tenant.id, name: "GDPR", version: "2016/679" } },
    update: {},
    create: {
      id: uuid(),
      tenantId: tenant.id,
      name: "GDPR",
      version: "2016/679",
      description: "General Data Protection Regulation - EU data privacy and protection law",
    },
  });

  const pciDss = await prisma.complianceFramework.upsert({
    where: { tenantId_name_version: { tenantId: tenant.id, name: "PCI DSS", version: "4.0" } },
    update: {},
    create: {
      id: uuid(),
      tenantId: tenant.id,
      name: "PCI DSS",
      version: "4.0",
      description: "Payment Card Industry Data Security Standard",
    },
  });

  const hipaa = await prisma.complianceFramework.upsert({
    where: { tenantId_name_version: { tenantId: tenant.id, name: "HIPAA", version: "2013" } },
    update: {},
    create: {
      id: uuid(),
      tenantId: tenant.id,
      name: "HIPAA",
      version: "2013",
      description: "Health Insurance Portability and Accountability Act",
    },
  });

  // GDPR Controls
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
      update: {},
      create: {
        id: uuid(),
        tenantId: tenant.id,
        frameworkId: gdpr.id,
        ...ctrl,
      },
    });
  }

  // PCI DSS Controls
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
      update: {},
      create: {
        id: uuid(),
        tenantId: tenant.id,
        frameworkId: pciDss.id,
        ...ctrl,
      },
    });
  }

  // HIPAA Controls
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
      update: {},
      create: {
        id: uuid(),
        tenantId: tenant.id,
        frameworkId: hipaa.id,
        ...ctrl,
      },
    });
  }

  // 8. Seed demo assets
  console.log("Creating demo assets...");
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
    { name: "web-prod-01", type: "server", ipAddress: "10.0.1.10", hostname: "web-prod-01.acme.co", os: "Ubuntu 22.04 LTS", criticality: "critical", groupId: prodGroup.id },
    { name: "db-prod-01", type: "database", ipAddress: "10.0.1.20", hostname: "db-prod-01.acme.co", os: "Ubuntu 22.04 LTS", criticality: "critical", groupId: prodGroup.id },
    { name: "app-prod-01", type: "server", ipAddress: "10.0.1.30", hostname: "app-prod-01.acme.co", os: "Ubuntu 22.04 LTS", criticality: "high", groupId: prodGroup.id },
    { name: "api-gateway", type: "cloud_resource", ipAddress: "10.0.1.40", hostname: "api.acme.co", criticality: "critical", groupId: prodGroup.id },
    { name: "web-staging-01", type: "server", ipAddress: "10.0.2.10", hostname: "web-staging.acme.co", os: "Ubuntu 22.04 LTS", criticality: "medium", groupId: stagingGroup.id },
    { name: "fw-edge-01", type: "network_device", ipAddress: "10.0.0.1", hostname: "fw-edge-01.acme.co", criticality: "critical" },
    { name: "switch-core-01", type: "network_device", ipAddress: "10.0.0.2", hostname: "switch-core.acme.co", criticality: "high" },
    { name: "laptop-rs-001", type: "workstation", ipAddress: "192.168.1.100", hostname: "DESKTOP-RS001", os: "Windows 11 Pro", criticality: "medium" },
  ];

  for (const asset of demoAssets) {
    await prisma.asset.upsert({
      where: { id: uuid() },
      update: {},
      create: { id: uuid(), tenantId: tenant.id, ...asset },
    });
  }

  // 9. Seed demo scan
  console.log("Creating demo scans...");
  const scan = await prisma.scan.create({
    data: {
      id: uuid(),
      tenantId: tenant.id,
      name: "Weekly Vulnerability Scan",
      type: "vulnerability",
      status: "completed",
      targets: JSON.stringify(["10.0.1.0/24"]),
      startedAt: new Date(Date.now() - 3600000),
      completedAt: new Date(),
      createdById: superAdmin.id,
    },
  });

  // Seed scan results
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
    await prisma.scanResult.create({
      data: { id: uuid(), tenantId: tenant.id, scanId: scan.id, ...f },
    });
  }

  // 10. Seed SIEM events
  console.log("Creating SIEM demo data...");
  const siemEvents = [
    { source: "firewall", severity: "high", category: "network", title: "Blocked brute-force attempt from 203.0.113.42", sourceIp: "203.0.113.42", destIp: "10.0.1.10" },
    { source: "ids", severity: "critical", category: "malware", title: "Malware signature detected: Cobalt Strike beacon", sourceIp: "10.0.1.100", destIp: "198.51.100.55" },
    { source: "endpoint", severity: "medium", category: "policy_violation", title: "Unauthorized USB device connected on DESKTOP-RS001" },
    { source: "application", severity: "high", category: "authentication", title: "Multiple failed login attempts for admin@acme.co", sourceIp: "203.0.113.99" },
    { source: "cloud", severity: "low", category: "system", title: "AWS IAM policy change detected in production account" },
  ];

  for (const evt of siemEvents) {
    await prisma.siemEvent.create({
      data: { id: uuid(), tenantId: tenant.id, ...evt },
    });
  }

  // Seed audit log entries
  console.log("Creating audit log entries...");
  const auditEntries = [
    { actorId: superAdmin.id, actorType: "user", action: "user.login", result: "success", details: JSON.stringify({ method: "password" }) },
    { actorId: superAdmin.id, actorType: "user", action: "role.assigned", resourceType: "user", resourceId: analyst.id, result: "success", details: JSON.stringify({ role: "security-analyst", target: "priya@acme.co" }) },
    { actorId: analyst.id, actorType: "user", action: "scan.executed", resourceType: "scan", resourceId: scan.id, result: "success", details: JSON.stringify({ type: "vulnerability", targets: 8 }) },
    { actorId: auditor.id, actorType: "user", action: "settings.roles:edit", result: "denied", details: JSON.stringify({ attempted: "edit org-admin role" }) },
    { actorType: "ai_agent", action: "ai.action.executed", result: "success", details: JSON.stringify({ type: "patch", target: "app-prod-01", approvedBy: superAdmin.id }) },
  ];

  for (const entry of auditEntries) {
    await prisma.auditLog.create({
      data: { id: uuid(), tenantId: tenant.id, ...entry },
    });
  }

  console.log("\nSeed completed successfully!");
  console.log("─────────────────────────────────");
  console.log("Demo credentials:");
  console.log("  Super Admin: admin@acme.co / Admin123!");
  console.log("  Analyst:     priya@acme.co / Admin123!");
  console.log("  Auditor:     amit@acme.co  / Admin123!");
  console.log("─────────────────────────────────");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
