/**
 * BYOC RBAC Engine v2 — Two-Axis Permission Resolution
 *
 * Axis 1: Capability Check — does the user's role set include this capability?
 * Axis 2: Scope Check     — is the target resource within the user's tag scope?
 *
 * Both must pass. Either failing = denied.
 *
 * Key design decisions:
 *  - Capabilities are dot-delimited IDs (e.g. "scan.execute", "admin.user.manage")
 *  - Roles are cumulative: effective capabilities = union of all assigned roles
 *  - Deny wins: if any role explicitly denies a capability, it's denied
 *  - Hierarchy walk: role capabilities include parent role capabilities
 *  - In-memory cache with 5-minute TTL per user profile
 */

import { prisma } from "./prisma";
import { createAuditLog } from "./audit";

// ─── Types ──────────────────────────────────────────────────────

export interface UserProfile {
  /** Set of granted capability IDs (e.g. "scan.execute") */
  granted: Set<string>;
  /** Set of explicitly denied capability IDs */
  denied: Set<string>;
  /** Tag filters from assigned scopes (for Phase 2) */
  tagFilters: Array<Record<string, string[]>>;
  /** True if any assigned scope is global (admins) */
  globalScope: boolean;
  /** Role slugs for display */
  roles: string[];
}

export interface SerializedProfile {
  capabilities: string[];
  denied: string[];
  roles: string[];
  globalScope: boolean;
}

// ─── Cache ──────────────────────────────────────────────────────

const profileCache = new Map<string, { data: UserProfile; expiresAt: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ─── Engine ─────────────────────────────────────────────────────

export class RBACEngine {
  /**
   * Main authorization entry point.
   *
   * Returns true only if the user has the capability AND
   * all target assets (if any) are within scope.
   *
   * @param userId    - The user's UUID
   * @param tenantId  - The tenant's UUID
   * @param capability - Capability ID (e.g. "scan.execute")
   * @param assetIds  - Optional: check scope for specific assets (Phase 2)
   */
  async authorize(
    userId: string,
    tenantId: string,
    capability: string,
    assetIds?: string[]
  ): Promise<boolean> {
    const profile = await this.loadProfile(userId, tenantId);

    // Step 1: Capability check — deny wins over grant
    if (!this.hasCapability(profile, capability)) {
      this.auditDenial(tenantId, userId, capability, "denied_capability");
      return false;
    }

    // Step 2: Scope check (only if asset-specific and user is not global)
    if (assetIds && assetIds.length > 0) {
      if (!profile.globalScope) {
        const outOfScope = await this.checkScope(tenantId, profile.tagFilters, assetIds);
        if (outOfScope.length > 0) {
          this.auditDenial(tenantId, userId, capability, "denied_scope");
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Check if a user has a specific capability (without scope check).
   * Use this for UI gating and simple permission checks.
   */
  async checkCapability(
    userId: string,
    tenantId: string,
    capability: string
  ): Promise<boolean> {
    const profile = await this.loadProfile(userId, tenantId);
    return this.hasCapability(profile, capability);
  }

  /**
   * Backward-compatible alias for v1 code.
   * Maps old permission strings to v2 capabilities.
   */
  async checkPermission(
    userId: string,
    tenantId: string,
    permission: string,
    _resourceContext?: Record<string, unknown>
  ): Promise<boolean> {
    // Map v1 permission format "module.resource:action" to v2 capability
    const capability = this.mapV1ToV2(permission);
    return this.checkCapability(userId, tenantId, capability);
  }

  /**
   * Get the user's full capability profile (for /me/capabilities endpoint).
   */
  async getProfile(userId: string, tenantId: string): Promise<SerializedProfile> {
    const profile = await this.loadProfile(userId, tenantId);
    return {
      capabilities: Array.from(profile.granted),
      denied: Array.from(profile.denied),
      roles: profile.roles,
      globalScope: profile.globalScope,
    };
  }

  /**
   * Get capabilities as flat arrays (backward compat for v1 getPermissionsList).
   */
  async getPermissionsList(userId: string, tenantId: string) {
    const profile = await this.loadProfile(userId, tenantId);
    return {
      granted: Array.from(profile.granted),
      denied: Array.from(profile.denied),
    };
  }

  // ─── Profile Loading (cached) ──────────────────────────────────

  async loadProfile(userId: string, tenantId: string): Promise<UserProfile> {
    const cacheKey = `${tenantId}:${userId}`;
    const cached = profileCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    // Get all active, non-expired roles for this user
    const userRoles = await prisma.userRole.findMany({
      where: {
        userId,
        role: { tenantId, isActive: true },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      include: { role: true },
    });

    // Collect capabilities by walking role hierarchy
    const granted = new Set<string>();
    const denied = new Set<string>();
    const visited = new Set<string>();
    const roleSlugs: string[] = [];

    for (const ur of userRoles) {
      roleSlugs.push(ur.role.slug);
      await this.walkRole(ur.roleId, granted, denied, visited);
    }

    // Collect scopes (Phase 2 — data scoping)
    let globalScope = false;
    const tagFilters: Array<Record<string, string[]>> = [];

    // Check if user has admin roles (platform-admin or org-admin) → implicit global scope
    const adminSlugs = ["platform-admin", "org-admin"];
    if (roleSlugs.some((s) => adminSlugs.includes(s))) {
      globalScope = true;
    } else {
      // Load user scopes from database
      try {
        const userScopes = await prisma.userScope.findMany({
          where: { userId },
          include: { scope: true },
        });

        for (const us of userScopes) {
          if (us.scope.isGlobal) {
            globalScope = true;
          } else {
            try {
              const filter = JSON.parse(us.scope.tagFilter);
              if (Object.keys(filter).length > 0) {
                tagFilters.push(filter);
              }
            } catch {
              // Skip invalid tag filter JSON
            }
          }
        }
      } catch {
        // userScopes table may not exist yet during migration
      }
    }

    const profile: UserProfile = {
      granted,
      denied,
      tagFilters,
      globalScope,
      roles: roleSlugs,
    };

    profileCache.set(cacheKey, { data: profile, expiresAt: Date.now() + CACHE_TTL });
    return profile;
  }

  // ─── Role Hierarchy Walk ───────────────────────────────────────

  private async walkRole(
    roleId: string,
    granted: Set<string>,
    denied: Set<string>,
    visited: Set<string>
  ): Promise<void> {
    if (visited.has(roleId)) return;
    visited.add(roleId);

    const roleCapabilities = await prisma.roleCapability.findMany({
      where: { roleId },
    });

    for (const rc of roleCapabilities) {
      if (rc.granted) {
        granted.add(rc.capabilityId);
      } else {
        denied.add(rc.capabilityId);
      }
    }

    // Walk up to parent role
    const role = await prisma.role.findUnique({
      where: { id: roleId },
      select: { parentRoleId: true },
    });
    if (role?.parentRoleId) {
      await this.walkRole(role.parentRoleId, granted, denied, visited);
    }
  }

  // ─── Capability Evaluation ─────────────────────────────────────

  private hasCapability(profile: UserProfile, capability: string): boolean {
    // Deny always wins (explicit deny from any role)
    if (profile.denied.has(capability)) {
      return false;
    }
    return profile.granted.has(capability);
  }

  // ─── Scope Evaluation (Phase 2) ───────────────────────────────

  private async checkScope(
    tenantId: string,
    tagFilters: Array<Record<string, string[]>>,
    assetIds: string[]
  ): Promise<string[]> {
    if (tagFilters.length === 0) {
      // No scopes assigned = no access to any specific assets
      return assetIds;
    }

    // For each asset, check if it matches ANY of the user's scope tag filters
    // A scope filter: {"env": ["production"], "region": ["mumbai"]}
    // Keys are ANDed, values within a key are ORed
    // Multiple scopes are UNIONed (asset matches if it matches ANY scope)

    const outOfScope: string[] = [];

    for (const assetId of assetIds) {
      const assetTags = await prisma.assetTag.findMany({
        where: { assetId },
        include: { tag: true },
      });

      // Build asset's tag map: key -> [values]
      const assetTagMap: Record<string, string[]> = {};
      for (const at of assetTags) {
        if (!assetTagMap[at.tag.key]) {
          assetTagMap[at.tag.key] = [];
        }
        assetTagMap[at.tag.key].push(at.tag.value);
      }

      // Check if asset matches ANY scope filter
      let matchesAnyScope = false;
      for (const filter of tagFilters) {
        let matchesThisScope = true;
        for (const [key, allowedValues] of Object.entries(filter)) {
          const assetValues = assetTagMap[key] || [];
          // OR within key: asset must have at least one matching value
          const hasMatch = allowedValues.some((v) => assetValues.includes(v));
          if (!hasMatch) {
            matchesThisScope = false;
            break;
          }
        }
        if (matchesThisScope) {
          matchesAnyScope = true;
          break;
        }
      }

      if (!matchesAnyScope) {
        outOfScope.push(assetId);
      }
    }

    return outOfScope;
  }

  // ─── v1 → v2 Permission Mapping ───────────────────────────────

  private mapV1ToV2(permission: string): string {
    // Map old "module.resource:action" format to v2 capability IDs
    const v1ToV2Map: Record<string, string> = {
      // Scans
      "scans.jobs:create": "scan.create",
      "scans.jobs:view": "scan.view",
      "scans.jobs:execute": "scan.execute",
      "scans.jobs:edit": "scan.create",
      "scans.jobs:delete": "scan.create",
      "scans.jobs:cancel": "scan.execute",
      "scans.schedules:view": "scan.schedule",
      "scans.schedules:create": "scan.schedule",
      "scans.schedules:edit": "scan.schedule",
      "scans.schedules:delete": "scan.schedule",
      "scans.results:view": "scan.view",
      "scans.results:export": "scan.export",
      "scans.policies:view": "scan.policy.view",
      "scans.policies:edit": "scan.policy.manage",
      "scans.policies:delete": "scan.policy.manage",
      // Assets
      "assets.inventory:view": "asset.view",
      "assets.inventory:create": "asset.create",
      "assets.inventory:edit": "asset.edit",
      "assets.inventory:delete": "asset.delete",
      "assets.inventory:import": "asset.import",
      "assets.inventory:export": "asset.export",
      "assets.groups:view": "asset.view",
      "assets.groups:create": "asset.edit",
      "assets.groups:edit": "asset.edit",
      "assets.groups:delete": "asset.delete",
      "assets.tags:view": "asset.view",
      "assets.tags:create": "asset.tag.manage",
      "assets.tags:edit": "asset.tag.manage",
      "assets.tags:delete": "asset.tag.manage",
      "assets.criticality:view": "asset.view",
      "assets.criticality:edit": "asset.edit",
      // Risk
      "risk.scores:view": "risk.view",
      "risk.scores:edit": "risk.override",
      "risk.overrides:view": "risk.view",
      "risk.overrides:override": "risk.override",
      "risk.thresholds:view": "risk.view",
      "risk.thresholds:edit": "risk.threshold.manage",
      // Reports
      "reports.generated:view": "report.view",
      "reports.generated:create": "report.create",
      "reports.generated:delete": "report.create",
      "reports.generated:export": "report.export",
      "reports.templates:view": "report.view",
      "reports.templates:create": "report.template.manage",
      "reports.templates:edit": "report.template.manage",
      "reports.templates:delete": "report.template.manage",
      "reports.scheduled:view": "report.schedule",
      "reports.scheduled:schedule": "report.schedule",
      // AI
      "ai.actions:view": "ai.view",
      "ai.approvals:view": "ai.view",
      "ai.approvals:approve": "ai.approve.standard",
      "ai.approvals:reject": "ai.approve.standard",
      "ai.config:view": "ai.view",
      "ai.config:configure": "ai.configure",
      // SIEM
      "siem.events:view": "siem.view",
      "siem.events:create": "siem.view",
      "siem.alerts:view": "siem.view",
      "siem.alerts:create": "siem.acknowledge",
      "siem.alerts:edit": "siem.acknowledge",
      "siem.alerts:acknowledge": "siem.acknowledge",
      "siem.alerts:escalate": "siem.escalate",
      "siem.rules:view": "siem.view",
      "siem.rules:create": "siem.rule.manage",
      "siem.rules:edit": "siem.rule.manage",
      "siem.rules:delete": "siem.rule.manage",
      "siem.integrations:view": "siem.view",
      "siem.integrations:create": "siem.integration.manage",
      "siem.integrations:edit": "siem.integration.manage",
      "siem.integrations:delete": "siem.integration.manage",
      // Settings / Admin
      "settings.org:view": "admin.org.manage",
      "settings.org:edit": "admin.org.manage",
      "settings.users:view": "admin.user.view",
      "settings.users:create": "admin.user.manage",
      "settings.users:edit": "admin.user.manage",
      "settings.users:delete": "admin.user.manage",
      "settings.roles:view": "admin.role.view",
      "settings.roles:create": "admin.role.manage",
      "settings.roles:edit": "admin.role.manage",
      "settings.roles:delete": "admin.role.manage",
      "settings.api_keys:view": "admin.apikey.manage",
      "settings.api_keys:create": "admin.apikey.manage",
      "settings.api_keys:edit": "admin.apikey.manage",
      "settings.api_keys:delete": "admin.apikey.manage",
      "settings.integrations:view": "admin.org.manage",
      "settings.integrations:create": "admin.org.manage",
      "settings.integrations:edit": "admin.org.manage",
      "settings.integrations:delete": "admin.org.manage",
      "settings.billing:view": "admin.billing.manage",
      "settings.billing:edit": "admin.billing.manage",
      // Compliance (maps to admin capabilities for now)
      "compliance.frameworks:view": "report.view",
      "compliance.frameworks:create": "admin.org.manage",
      "compliance.frameworks:edit": "admin.org.manage",
      "compliance.controls:view": "report.view",
      "compliance.controls:edit": "risk.override",
      "compliance.assessments:view": "report.view",
      "compliance.assessments:create": "report.create",
      "compliance.assessments:edit": "risk.override",
      // System
      "system.audit_log:view": "admin.audit.view",
      "system.audit_log:export": "admin.audit.export",
      "system.health:view": "dash.view",
      "system.tenant:manage": "admin.org.manage",
      // Dashboard
      "dashboard.overview:view": "dash.view",
      "dashboard.widgets:view": "dash.view",
    };

    return v1ToV2Map[permission] || permission;
  }

  // ─── Cache Management ──────────────────────────────────────────

  /**
   * Invalidate cached profile when roles/capabilities/scopes change.
   */
  invalidateCache(tenantId: string, userId?: string): void {
    if (userId) {
      profileCache.delete(`${tenantId}:${userId}`);
    } else {
      // Invalidate all users in tenant
      for (const key of profileCache.keys()) {
        if (key.startsWith(`${tenantId}:`)) {
          profileCache.delete(key);
        }
      }
    }
  }

  /**
   * Clear entire cache (e.g. after capability schema changes).
   */
  clearCache(): void {
    profileCache.clear();
  }

  // ─── Audit Logging ─────────────────────────────────────────────

  private auditDenial(
    tenantId: string,
    userId: string,
    capability: string,
    result: string
  ): void {
    // Fire-and-forget: audit log should never block authorization
    createAuditLog({
      tenantId,
      actorId: userId,
      actorType: "user",
      action: `capability.check:${capability}`,
      result: result as "denied",
      details: { capability, result },
      request: null,
    }).catch(() => {
      /* swallow errors — audit log must never break the app */
    });
  }
}

// ─── Singleton Export ────────────────────────────────────────────

export const rbac = new RBACEngine();
