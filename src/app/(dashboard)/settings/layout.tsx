"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Users, ShieldCheck, Key, ScrollText, Settings, Target, Monitor, ShieldAlert, Globe } from "lucide-react";

const settingsTabs = [
  { label: "Users", href: "/settings/users", icon: Users },
  { label: "Roles", href: "/settings/roles", icon: ShieldCheck },
  { label: "API Keys", href: "/settings/api-keys", icon: Key },
  { label: "Scopes", href: "/settings/scopes", icon: Target },
  { label: "Identity", href: "/settings/identity", icon: Globe },
  { label: "Sessions", href: "/settings/sessions", icon: Monitor },
  { label: "Security", href: "/settings/security", icon: ShieldAlert },
  { label: "Audit Log", href: "/settings/audit-log", icon: ScrollText },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Settings className="w-7 h-7 text-cyan-400" />
          Settings
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Manage users, roles, API keys, and system configuration
        </p>
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-slate-800">
        <nav className="flex gap-1">
          {settingsTabs.map((tab) => {
            const isActive = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all border-b-2 -mb-px",
                  isActive
                    ? "text-cyan-400 border-cyan-400"
                    : "text-slate-400 border-transparent hover:text-white hover:border-slate-600"
                )}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      {children}
    </div>
  );
}
