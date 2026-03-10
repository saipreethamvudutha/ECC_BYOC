/**
 * BYOC Capability Registry v2
 *
 * 50 capabilities across 9 modules. Each capability is a named,
 * atomic ability that can be assigned to roles.
 *
 * This file is the single source of truth for all capabilities.
 * Used by: seed script, RBAC engine, frontend hooks.
 */

export interface CapabilityDef {
  id: string;
  module: string;
  name: string;
  description: string;
  riskLevel: "low" | "medium" | "high" | "critical";
}

// ─── Master Capability Registry ──────────────────────────────────

export const CAPABILITIES: CapabilityDef[] = [
  // ── Dashboard (2) ──
  { id: "dash.view", module: "dash", name: "View Dashboard", description: "Access the main dashboard with KPIs and widgets", riskLevel: "low" },
  { id: "dash.customize", module: "dash", name: "Customize Dashboard", description: "Rearrange widgets, pin/unpin, set personal defaults", riskLevel: "low" },

  // ── Scans (7) ──
  { id: "scan.view", module: "scan", name: "View Scans", description: "See scan jobs, schedules, and historical results", riskLevel: "low" },
  { id: "scan.create", module: "scan", name: "Create Scans", description: "Configure new scan jobs (targets, depth, schedule)", riskLevel: "medium" },
  { id: "scan.execute", module: "scan", name: "Execute Scans", description: "Launch/pause/resume/cancel scan jobs", riskLevel: "medium" },
  { id: "scan.schedule", module: "scan", name: "Schedule Scans", description: "Set up recurring scan schedules", riskLevel: "medium" },
  { id: "scan.policy.view", module: "scan", name: "View Scan Policies", description: "See scan policy configurations", riskLevel: "low" },
  { id: "scan.policy.manage", module: "scan", name: "Manage Scan Policies", description: "Create, edit, delete scan policies and profiles", riskLevel: "high" },
  { id: "scan.export", module: "scan", name: "Export Scan Results", description: "Download scan results as CSV/JSON/PDF", riskLevel: "low" },

  // ── Assets (7) ──
  { id: "asset.view", module: "asset", name: "View Assets", description: "See asset inventory within assigned scope", riskLevel: "low" },
  { id: "asset.edit", module: "asset", name: "Edit Assets", description: "Modify asset metadata, criticality, ownership", riskLevel: "medium" },
  { id: "asset.create", module: "asset", name: "Create Assets", description: "Manually add assets to inventory", riskLevel: "medium" },
  { id: "asset.delete", module: "asset", name: "Delete Assets", description: "Remove assets from inventory", riskLevel: "high" },
  { id: "asset.import", module: "asset", name: "Import Assets", description: "Bulk import via CSV/API", riskLevel: "medium" },
  { id: "asset.export", module: "asset", name: "Export Assets", description: "Bulk export asset data", riskLevel: "low" },
  { id: "asset.tag.manage", module: "asset", name: "Manage Asset Tags", description: "Create, edit, delete tags on assets", riskLevel: "medium" },

  // ── Risk Scoring (3) ──
  { id: "risk.view", module: "risk", name: "View Risk Scores", description: "See AI-prioritized risk scores", riskLevel: "low" },
  { id: "risk.override", module: "risk", name: "Override Risk Score", description: "Manually adjust an AI-generated risk score with justification", riskLevel: "high" },
  { id: "risk.threshold.manage", module: "risk", name: "Manage Thresholds", description: "Set risk score thresholds and alerting boundaries", riskLevel: "high" },

  // ── Reports (5) ──
  { id: "report.view", module: "report", name: "View Reports", description: "Access generated reports", riskLevel: "low" },
  { id: "report.create", module: "report", name: "Create Reports", description: "Generate new reports (on-demand)", riskLevel: "low" },
  { id: "report.schedule", module: "report", name: "Schedule Reports", description: "Set up recurring report generation", riskLevel: "medium" },
  { id: "report.template.manage", module: "report", name: "Manage Templates", description: "Create and edit report templates", riskLevel: "medium" },
  { id: "report.export", module: "report", name: "Export Reports", description: "Download reports as CSV/PDF", riskLevel: "low" },

  // ── Compliance (4) ──
  { id: "compliance.view", module: "compliance", name: "View Compliance", description: "View compliance frameworks, controls, and assessment statuses", riskLevel: "low" },
  { id: "compliance.assess", module: "compliance", name: "Assess Controls", description: "Update control assessment status, findings, and evidence", riskLevel: "medium" },
  { id: "compliance.manage", module: "compliance", name: "Manage Frameworks", description: "Manage compliance framework settings and activation", riskLevel: "high" },
  { id: "compliance.export", module: "compliance", name: "Export Compliance", description: "Export compliance reports and audit data", riskLevel: "low" },

  // ── AI Actions (4) ──
  { id: "ai.view", module: "ai", name: "View AI Actions", description: "See the AI action feed and history", riskLevel: "low" },
  { id: "ai.approve.standard", module: "ai", name: "Approve Standard AI Actions", description: "Approve medium-risk AI recommendations", riskLevel: "medium" },
  { id: "ai.approve.critical", module: "ai", name: "Approve Critical AI Actions", description: "Approve high-risk AI actions (firewall, critical patches)", riskLevel: "critical" },
  { id: "ai.configure", module: "ai", name: "Configure AI Behavior", description: "Set AI autonomy levels, auto-approval rules, and behavioral boundaries", riskLevel: "critical" },

  // ── SIEM / SOC (9) ──
  { id: "siem.view", module: "siem", name: "View SIEM Events", description: "Access security events, alerts, and SOC dashboard", riskLevel: "low" },
  { id: "siem.acknowledge", module: "siem", name: "Acknowledge Alerts", description: "Mark alerts as reviewed/acknowledged", riskLevel: "low" },
  { id: "siem.escalate", module: "siem", name: "Escalate Alerts", description: "Escalate alerts to incidents and higher-priority queues", riskLevel: "medium" },
  { id: "siem.investigate", module: "siem", name: "Investigate Incidents", description: "Update incident status, add evidence, timeline entries", riskLevel: "medium" },
  { id: "siem.rule.manage", module: "siem", name: "Manage SIEM Rules", description: "Create, edit, toggle, delete detection rules", riskLevel: "high" },
  { id: "siem.incident.manage", module: "siem", name: "Manage Incidents", description: "Create, assign, close incidents and manage case lifecycle", riskLevel: "high" },
  { id: "siem.integration.manage", module: "siem", name: "Manage SIEM Integrations", description: "Configure log sources, forwarding, and external SIEM connectors", riskLevel: "high" },
  { id: "siem.hunt", module: "siem", name: "Threat Hunting", description: "Execute threat hunting queries and manage hunt library", riskLevel: "medium" },
  { id: "siem.export", module: "siem", name: "Export SIEM Data", description: "Export events, alerts, incidents, and reports", riskLevel: "low" },

  // ── Administration (13) ──
  { id: "admin.user.view", module: "admin", name: "View Users", description: "See user list and profiles", riskLevel: "low" },
  { id: "admin.user.manage", module: "admin", name: "Manage Users", description: "Invite, suspend, reactivate, delete users", riskLevel: "high" },
  { id: "admin.role.view", module: "admin", name: "View Roles", description: "See role definitions and assignments", riskLevel: "low" },
  { id: "admin.role.manage", module: "admin", name: "Manage Roles", description: "Create, edit, delete custom roles. Assign/revoke roles.", riskLevel: "critical" },
  { id: "admin.apikey.manage", module: "admin", name: "Manage API Keys", description: "Create, rotate, revoke API keys", riskLevel: "high" },
  { id: "admin.org.manage", module: "admin", name: "Manage Organization", description: "Edit org settings, SSO config, integrations", riskLevel: "critical" },
  { id: "admin.billing.manage", module: "admin", name: "Manage Billing", description: "View/edit subscription, billing, invoices", riskLevel: "critical" },
  { id: "admin.audit.view", module: "admin", name: "View Audit Log", description: "Access full audit trail", riskLevel: "low" },
  { id: "admin.audit.export", module: "admin", name: "Export Audit Log", description: "Download audit logs", riskLevel: "medium" },
  { id: "admin.sso.view", module: "admin", name: "View SSO Configuration", description: "See configured SSO providers and SCIM status", riskLevel: "low" },
  { id: "admin.sso.manage", module: "admin", name: "Manage SSO", description: "Configure SSO providers, enable/disable, manage secrets", riskLevel: "critical" },
  { id: "admin.scim.view", module: "admin", name: "View SCIM Configuration", description: "See SCIM tokens and sync status", riskLevel: "low" },
  { id: "admin.scim.manage", module: "admin", name: "Manage SCIM", description: "Create/revoke SCIM tokens, configure provisioning", riskLevel: "high" },
];

// ─── Built-in Role Definitions ───────────────────────────────────

export interface RoleDef {
  slug: string;
  name: string;
  description: string;
  maxAssignments?: number;
  capabilities: string[];
  deniedCapabilities?: string[];
}

/**
 * 7 built-in roles following industry patterns
 * (Tenable, Qualys, CrowdStrike, Splunk, Wiz, Prisma Cloud)
 */
export const BUILTIN_ROLES: RoleDef[] = [
  {
    slug: "platform-admin",
    name: "Platform Administrator",
    description: "Tenant owner. Unrestricted. Maximum 2 per organization.",
    maxAssignments: 2,
    capabilities: CAPABILITIES.map((c) => c.id), // All 50
  },
  {
    slug: "org-admin",
    name: "Organization Administrator",
    description: "IT/Security leadership. Full operational access minus billing and org deletion.",
    capabilities: CAPABILITIES.map((c) => c.id).filter(
      (id) => !["admin.billing.manage"].includes(id)
    ),
    deniedCapabilities: ["admin.billing.manage"],
  },
  {
    slug: "security-analyst",
    name: "Security Analyst",
    description: "Primary SOC operator. Runs scans, triages findings, handles SIEM, approves standard AI actions.",
    capabilities: [
      "dash.view", "dash.customize",
      "scan.view", "scan.create", "scan.execute", "scan.schedule", "scan.export",
      "scan.policy.view",
      "asset.view", "asset.edit", "asset.import", "asset.export",
      "risk.view", "risk.override",
      "compliance.view", "compliance.assess", "compliance.export",
      "report.view", "report.create", "report.schedule", "report.export",
      "ai.view", "ai.approve.standard",
      "siem.view", "siem.acknowledge", "siem.escalate", "siem.investigate", "siem.hunt", "siem.export",
      "admin.apikey.manage",
      "admin.audit.view",
    ],
  },
  {
    slug: "auditor",
    name: "Auditor",
    description: "Compliance reviewers and external auditors. Read-everything, change-nothing.",
    capabilities: [
      "dash.view",
      "scan.view", "scan.export",
      "scan.policy.view",
      "asset.view", "asset.export",
      "risk.view",
      "compliance.view", "compliance.export",
      "report.view", "report.export",
      "ai.view",
      "siem.view", "siem.export",
      "admin.audit.view", "admin.audit.export",
      "admin.user.view", "admin.role.view",
      "admin.sso.view", "admin.scim.view",
    ],
  },
  {
    slug: "viewer",
    name: "Viewer",
    description: "Stakeholders, executives, board members. Dashboards and reports only.",
    capabilities: [
      "dash.view",
      "risk.view",
      "report.view", "report.export",
    ],
  },
  {
    slug: "remediation-user",
    name: "Remediation User",
    description: "Teams responsible for fixing findings. Can view results and update remediation tickets.",
    capabilities: [
      "dash.view",
      "scan.view",
      "asset.view",
      "risk.view",
      "compliance.view",
      "report.view",
    ],
  },
  {
    slug: "api-service",
    name: "API Service Account",
    description: "Machine-to-machine access. Capability set selected per key at creation time.",
    capabilities: [
      "scan.view", "scan.create", "scan.execute",
      "asset.view", "asset.import",
      "report.view", "report.export",
      "siem.view",
    ],
  },
];

// ─── Capability Modules for UI grouping ──────────────────────────

export const CAPABILITY_MODULES = [
  { id: "dash", name: "Dashboard", icon: "BarChart3" },
  { id: "scan", name: "Scans", icon: "Search" },
  { id: "asset", name: "Assets", icon: "Server" },
  { id: "risk", name: "Risk Scoring", icon: "AlertTriangle" },
  { id: "compliance", name: "Compliance", icon: "ShieldCheck" },
  { id: "report", name: "Reports", icon: "FileText" },
  { id: "ai", name: "AI Actions", icon: "Brain" },
  { id: "siem", name: "SIEM / SOC", icon: "ShieldAlert" },
  { id: "admin", name: "Administration", icon: "Settings" },
] as const;

/**
 * Get capabilities grouped by module for UI display.
 */
export function getCapabilitiesByModule(): Record<string, CapabilityDef[]> {
  const grouped: Record<string, CapabilityDef[]> = {};
  for (const cap of CAPABILITIES) {
    if (!grouped[cap.module]) {
      grouped[cap.module] = [];
    }
    grouped[cap.module].push(cap);
  }
  return grouped;
}
