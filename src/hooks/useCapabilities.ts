"use client";

/**
 * BYOC Frontend RBAC Hooks — v2
 *
 * Provides capability-based access control for React components.
 * Loaded once at app init via /api/auth/me/capabilities, then
 * evaluated synchronously for zero-latency UI gating.
 *
 * Usage:
 *   const { can, canAny, canAll, hasGlobalScope, loading } = useCapabilities();
 *
 *   if (can("scan.execute")) { ... }
 *   if (canAny("admin.user.view", "admin.user.manage")) { ... }
 *   if (canAll("scan.create", "scan.execute")) { ... }
 */

import React, { useState, useEffect, useCallback, useContext, type ReactNode } from "react";

// ─── Types ──────────────────────────────────────────────────────

interface CapabilityProfile {
  capabilities: string[];
  denied: string[];
  roles: string[];
  globalScope: boolean;
}

interface CapabilityContextValue {
  profile: CapabilityProfile | null;
  loading: boolean;
  error: string | null;
  can: (capability: string) => boolean;
  canAny: (...capabilities: string[]) => boolean;
  canAll: (...capabilities: string[]) => boolean;
  hasGlobalScope: () => boolean;
  hasRole: (roleSlug: string) => boolean;
  reload: () => Promise<void>;
}

// ─── Context ────────────────────────────────────────────────────

const CapabilityContext = React.createContext<CapabilityContextValue | null>(null);

// ─── Provider ───────────────────────────────────────────────────

export function CapabilityProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<CapabilityProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/auth/me/capabilities");
      if (!res.ok) {
        if (res.status === 401) {
          setProfile(null);
          return;
        }
        throw new Error(`Failed to load capabilities: ${res.status}`);
      }
      const data = await res.json();
      setProfile(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load capabilities");
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const can = useCallback(
    (capability: string): boolean => {
      if (!profile) return false;
      if (profile.denied.includes(capability)) return false;
      return profile.capabilities.includes(capability);
    },
    [profile]
  );

  const canAny = useCallback(
    (...capabilities: string[]): boolean => {
      return capabilities.some((c) => can(c));
    },
    [can]
  );

  const canAll = useCallback(
    (...capabilities: string[]): boolean => {
      return capabilities.every((c) => can(c));
    },
    [can]
  );

  const hasGlobalScope = useCallback((): boolean => {
    return profile?.globalScope ?? false;
  }, [profile]);

  const hasRole = useCallback(
    (roleSlug: string): boolean => {
      return profile?.roles.includes(roleSlug) ?? false;
    },
    [profile]
  );

  const contextValue: CapabilityContextValue = {
    profile,
    loading,
    error,
    can,
    canAny,
    canAll,
    hasGlobalScope,
    hasRole,
    reload: loadProfile,
  };

  return React.createElement(CapabilityContext, { value: contextValue }, children);
}

// ─── Hook ───────────────────────────────────────────────────────

export function useCapabilities(): CapabilityContextValue {
  const ctx = useContext(CapabilityContext);
  if (!ctx) {
    throw new Error("useCapabilities must be used within a CapabilityProvider");
  }
  return ctx;
}
