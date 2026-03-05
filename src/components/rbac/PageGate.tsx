"use client";

/**
 * BYOC PageGate — Full-Page Capability-Based Access Control
 *
 * Wraps an entire page and shows a professional "Access Denied" screen
 * when the user lacks the required capability. Unlike <Gate> which just
 * hides content, PageGate shows a full-page message with guidance.
 *
 * Usage:
 *   <PageGate capability="scan.view" title="Scans">
 *     <ScansPageContent />
 *   </PageGate>
 */

import { type ReactNode } from "react";
import { ShieldX, ArrowLeft } from "lucide-react";
import { useCapabilities } from "@/hooks/useCapabilities";
import Link from "next/link";

interface PageGateProps {
  /** Single capability or array of capabilities required */
  capability: string | string[];
  /** "any" = user needs at least one, "all" = user needs every one */
  mode?: "any" | "all";
  /** Page title shown in the denied message */
  title: string;
  /** The page content to render if access is granted */
  children: ReactNode;
}

export function PageGate({
  capability,
  mode = "any",
  title,
  children,
}: PageGateProps) {
  const { can, canAny, canAll, loading } = useCapabilities();

  // Show nothing while capabilities are loading (prevents flash)
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  const caps = Array.isArray(capability) ? capability : [capability];
  const allowed = mode === "all" ? canAll(...caps) : canAny(...caps);

  if (allowed) {
    return <>{children}</>;
  }

  // Access Denied — professional, on-brand full-page message
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-6 max-w-md text-center">
        {/* Icon */}
        <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20">
          <ShieldX className="w-8 h-8 text-red-400" />
        </div>

        {/* Title */}
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-white">Access Denied</h2>
          <p className="text-sm text-slate-400 leading-relaxed">
            You don&apos;t have permission to access <strong className="text-slate-300">{title}</strong>.
            Contact your administrator to request the required role or capabilities.
          </p>
        </div>

        {/* Capability info */}
        <div className="w-full rounded-lg border border-slate-700/50 bg-slate-900/50 p-4">
          <p className="text-xs text-slate-500 mb-2 uppercase tracking-wider font-medium">
            Required {caps.length > 1 ? "capabilities" : "capability"}
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            {caps.map((c) => (
              <span
                key={c}
                className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-mono bg-slate-800 text-slate-300 border border-slate-700"
              >
                {c}
              </span>
            ))}
          </div>
        </div>

        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}
