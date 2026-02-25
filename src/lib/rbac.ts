import { prisma } from "./prisma";

interface EffectivePermissions {
  granted: Set<string>;
  denied: Set<string>;
  scopes: Record<string, Record<string, unknown>>;
}

// In-memory permission cache (per-process, cleared on restart)
const permissionCache = new Map<string, { data: EffectivePermissions; expiresAt: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export class RBACEngine {
  /**
   * Main entry point. Returns true if the user has the specified permission.
   * Permission format: "module.resource:action" e.g. "scans.jobs:execute"
   */
  async checkPermission(
    userId: string,
    tenantId: string,
    permission: string,
    resourceContext?: Record<string, unknown>
  ): Promise<boolean> {
    const [moduleResource, action] = permission.split(":");
    if (!moduleResource || !action) return false;

    const [module, resource] = moduleResource.split(".");
    if (!module || !resource) return false;

    // Load effective permissions (cached)
    const effective = await this.getEffectivePermissions(userId, tenantId);

    // Check explicit denials first
    const denyKey = `${module}.${resource}:${action}`;
    if (effective.denied.has(denyKey)) {
      await this.logAccess(userId, tenantId, permission, "denied");
      return false;
    }

    // Check grants (direct match)
    if (!effective.granted.has(denyKey)) {
      // Check wildcard grants: module.*:action
      const wildcardKey = `${module}.*:${action}`;
      if (!effective.granted.has(wildcardKey)) {
        await this.logAccess(userId, tenantId, permission, "denied");
        return false;
      }
    }

    // Check resource-level scope (ABAC layer)
    if (resourceContext) {
      const scope = effective.scopes[denyKey];
      if (scope && !this.checkScope(scope, resourceContext)) {
        await this.logAccess(userId, tenantId, permission, "denied_scope");
        return false;
      }
    }

    await this.logAccess(userId, tenantId, permission, "granted");
    return true;
  }

  /**
   * Get all effective permissions for a user including inherited ones.
   */
  async getEffectivePermissions(userId: string, tenantId: string): Promise<EffectivePermissions> {
    const cacheKey = `${tenantId}:${userId}`;
    const cached = permissionCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    // Get all active roles for this user
    const userRoles = await prisma.userRole.findMany({
      where: {
        userId,
        role: { tenantId, isActive: true },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      include: { role: true },
    });

    const granted = new Set<string>();
    const denied = new Set<string>();
    const scopes: Record<string, Record<string, unknown>> = {};
    const visited = new Set<string>();

    // For each role, collect permissions walking up hierarchy
    for (const ur of userRoles) {
      await this.collectPermissions(ur.roleId, granted, denied, scopes, visited);
    }

    const result: EffectivePermissions = { granted, denied, scopes };
    permissionCache.set(cacheKey, { data: result, expiresAt: Date.now() + CACHE_TTL });
    return result;
  }

  /**
   * Get permissions as serializable arrays (for API responses)
   */
  async getPermissionsList(userId: string, tenantId: string) {
    const effective = await this.getEffectivePermissions(userId, tenantId);
    return {
      granted: Array.from(effective.granted),
      denied: Array.from(effective.denied),
    };
  }

  private async collectPermissions(
    roleId: string,
    granted: Set<string>,
    denied: Set<string>,
    scopes: Record<string, Record<string, unknown>>,
    visited: Set<string>
  ): Promise<void> {
    if (visited.has(roleId)) return;
    visited.add(roleId);

    const rolePermissions = await prisma.rolePermission.findMany({
      where: { roleId },
      include: { permission: true },
    });

    for (const rp of rolePermissions) {
      const key = `${rp.permission.module}.${rp.permission.resource}:${rp.permission.action}`;
      if (rp.granted) {
        granted.add(key);
        if (rp.scope && rp.scope !== "{}") {
          try {
            scopes[key] = JSON.parse(rp.scope);
          } catch {
            // skip invalid scope
          }
        }
      } else {
        denied.add(key);
      }
    }

    // Walk up to parent role
    const role = await prisma.role.findUnique({
      where: { id: roleId },
      select: { parentRoleId: true },
    });
    if (role?.parentRoleId) {
      await this.collectPermissions(role.parentRoleId, granted, denied, scopes, visited);
    }
  }

  private checkScope(scope: Record<string, unknown>, context: Record<string, unknown>): boolean {
    for (const [key, allowedValues] of Object.entries(scope)) {
      if (key in context) {
        if (Array.isArray(allowedValues)) {
          if (!allowedValues.includes(context[key])) return false;
        } else if (context[key] !== allowedValues) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Invalidate permission cache when roles/permissions change.
   */
  invalidateCache(tenantId: string, userId?: string): void {
    if (userId) {
      permissionCache.delete(`${tenantId}:${userId}`);
    } else {
      for (const key of permissionCache.keys()) {
        if (key.startsWith(`${tenantId}:`)) {
          permissionCache.delete(key);
        }
      }
    }
  }

  private async logAccess(
    userId: string,
    tenantId: string,
    permission: string,
    result: string
  ): Promise<void> {
    // Non-blocking audit log — fire and forget for permission checks
    // Only log denials to avoid log flood
    if (result !== "granted") {
      prisma.auditLog
        .create({
          data: {
            tenantId,
            actorId: userId,
            actorType: "user",
            action: `permission.check:${permission}`,
            result,
            details: JSON.stringify({ permission }),
          },
        })
        .catch(() => {
          /* swallow errors — audit log should never break the app */
        });
    }
  }
}

export const rbac = new RBACEngine();
