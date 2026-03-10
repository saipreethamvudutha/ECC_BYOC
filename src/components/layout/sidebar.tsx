"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Scan,
  Server,
  Target,
  FileText,
  Bot,
  Bell,
  Settings,
  Shield,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { useCapabilities } from "@/hooks/useCapabilities";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  /** v2 capability required to see this nav item. Omit = always visible. */
  capability?: string;
}

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard, capability: "dash.view" },
  { label: "Scans", href: "/scans", icon: Scan, capability: "scan.view" },
  { label: "Assets", href: "/assets", icon: Server, capability: "asset.view" },
  { label: "Risk Scoring", href: "/risk-scoring", icon: Target, capability: "risk.view" },
  { label: "Compliance", href: "/compliance", icon: ShieldCheck, capability: "compliance.view" },
  { label: "Reports", href: "/reports", icon: FileText, capability: "report.view" },
  { label: "AI Actions", href: "/ai-actions", icon: Bot, capability: "ai.view" },
  { label: "SIEM / SOC", href: "/siem", icon: ShieldAlert, capability: "siem.view" },
  { label: "Settings", href: "/settings/users", icon: Settings, capability: "admin.user.view" },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { can, loading } = useCapabilities();

  // Filter nav items based on user capabilities
  const visibleItems = navItems.filter(
    (item) => !item.capability || loading || can(item.capability)
  );

  return (
    <aside
      className={cn(
        "flex flex-col h-screen bg-slate-950 border-r border-slate-800 transition-all duration-300 sticky top-0",
        collapsed ? "w-[72px]" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-slate-800">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/20">
          <Shield className="w-5 h-5 text-white" />
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-lg font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
              BYOC
            </span>
            <span className="text-[10px] text-slate-500 -mt-1 tracking-widest uppercase">
              Cybersecurity
            </span>
          </div>
        )}
      </div>

      {/* Navigation — capability-gated */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
        {visibleItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group",
                isActive
                  ? "bg-gradient-to-r from-cyan-500/10 to-blue-500/10 text-cyan-400 border border-cyan-500/20"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/50"
              )}
            >
              <item.icon
                className={cn(
                  "w-5 h-5 flex-shrink-0 transition-colors",
                  isActive
                    ? "text-cyan-400"
                    : "text-slate-500 group-hover:text-slate-300"
                )}
              />
              {!collapsed && <span>{item.label}</span>}
              {isActive && !collapsed && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-lg shadow-cyan-400/50" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Collapse button */}
      <div className="p-2 border-t border-slate-800">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center justify-center w-full py-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 transition-all"
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>
    </aside>
  );
}
