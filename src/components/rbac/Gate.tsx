"use client";

/**
 * BYOC Gate Component — Capability-Based UI Access Control
 *
 * Conditionally renders children based on the user's capabilities.
 * Replaces v1's PermissionGate with the v2 capability model.
 *
 * Usage:
 *   <Gate capability="scan.execute">
 *     <button>Run Scan</button>
 *   </Gate>
 *
 *   <Gate capability={["admin.user.manage", "admin.role.manage"]} mode="all">
 *     <AdminPanel />
 *   </Gate>
 *
 *   <Gate capability="admin.billing.manage" fallback={<UpgradeBanner />}>
 *     <BillingSettings />
 *   </Gate>
 */

import { type ReactNode } from "react";
import { useCapabilities } from "@/hooks/useCapabilities";

interface GateProps {
  /** Single capability or array of capabilities to check */
  capability: string | string[];
  /** "any" = user needs at least one capability, "all" = user needs all */
  mode?: "any" | "all";
  /** Content to render if access is denied */
  fallback?: ReactNode;
  /** Content to render if access is granted */
  children: ReactNode;
}

export function Gate({
  capability,
  mode = "any",
  fallback = null,
  children,
}: GateProps) {
  const { can, canAny, canAll, loading } = useCapabilities();

  // Don't render anything while loading capabilities
  if (loading) return null;

  const caps = Array.isArray(capability) ? capability : [capability];
  const allowed = mode === "all" ? canAll(...caps) : canAny(...caps);

  return allowed ? <>{children}</> : <>{fallback}</>;
}

/**
 * GateMessage — Shows a styled "access denied" message instead of hiding content.
 * Used in settings pages where users should know the section exists.
 */
interface GateMessageProps {
  capability: string | string[];
  mode?: "any" | "all";
  message?: string;
  children: ReactNode;
}

export function GateMessage({
  capability,
  mode = "any",
  message = "You don't have permission to access this section.",
  children,
}: GateMessageProps) {
  return (
    <Gate
      capability={capability}
      mode={mode}
      fallback={
        <div className="rounded-lg border border-slate-700/50 bg-slate-900/50 p-6 text-center">
          <p className="text-sm text-slate-400">{message}</p>
        </div>
      }
    >
      {children}
    </Gate>
  );
}
