"use client";

import { CapabilityProvider } from "@/hooks/useCapabilities";

/**
 * Client-side providers wrapper for the dashboard layout.
 *
 * The dashboard layout is a server component (it calls getSession()),
 * so we need this thin client wrapper to provide React contexts
 * (like CapabilityProvider) to all child pages.
 */
export function DashboardProviders({ children }: { children: React.ReactNode }) {
  return <CapabilityProvider>{children}</CapabilityProvider>;
}
