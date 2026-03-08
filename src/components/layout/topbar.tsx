"use client";

import { Bell, Search, User, LogOut, Settings, ChevronDown, AlertTriangle, Shield, ShieldAlert, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";
import { useState, useRef, useEffect, useCallback } from "react";

interface Alert {
  id: string;
  title: string;
  severity: string;
  status: string;
  source: string;
  createdAt: string;
}

interface TopbarProps {
  user?: {
    name: string;
    email: string;
    roles: string[];
    tenantName: string;
  };
}

export function Topbar({ user }: TopbarProps) {
  const router = useRouter();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertCount, setAlertCount] = useState(0);
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch alert count on mount
  useEffect(() => {
    fetch("/api/siem")
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.alerts) {
          const open = data.alerts.filter((a: Alert) => a.status === "open" || a.status === "investigating");
          setAlertCount(open.length);
          setAlerts(open.slice(0, 5));
        }
      })
      .catch(() => {});
  }, []);

  const handleNotificationClick = useCallback(() => {
    setShowNotifications((prev) => !prev);
    setShowUserMenu(false);
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const severityIcon = (severity: string) => {
    switch (severity) {
      case "critical": return <ShieldAlert className="w-4 h-4 text-red-400" />;
      case "high": return <AlertTriangle className="w-4 h-4 text-orange-400" />;
      case "medium": return <Shield className="w-4 h-4 text-yellow-400" />;
      default: return <Shield className="w-4 h-4 text-blue-400" />;
    }
  };

  const severityColor = (severity: string) => {
    switch (severity) {
      case "critical": return "text-red-400 bg-red-500/10 border-red-500/20";
      case "high": return "text-orange-400 bg-orange-500/10 border-orange-500/20";
      case "medium": return "text-yellow-400 bg-yellow-500/10 border-yellow-500/20";
      default: return "text-blue-400 bg-blue-500/10 border-blue-500/20";
    }
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <header className="h-16 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md flex items-center justify-between px-6 sticky top-0 z-40">
      {/* Search */}
      <div className="flex items-center gap-4 flex-1 max-w-xl">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input
            placeholder="Search assets, scans, alerts..."
            className="pl-10 bg-slate-900/50 border-slate-800 focus:border-cyan-500/30"
          />
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <Button
            variant="ghost"
            size="icon"
            className="relative cursor-pointer"
            onClick={handleNotificationClick}
            data-testid="notification-bell"
          >
            <Bell className="w-5 h-5 text-slate-400" />
            {alertCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center animate-pulse">
                {alertCount}
              </span>
            )}
          </Button>

          {showNotifications && (
            <div className="absolute right-0 top-12 w-80 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl shadow-black/50 z-50 overflow-hidden">
              {/* Header */}
              <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-cyan-400" />
                  <span className="text-sm font-semibold text-white">Alerts</span>
                </div>
                {alertCount > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 font-medium">
                    {alertCount} open
                  </span>
                )}
              </div>

              {/* Alert list */}
              <div className="max-h-80 overflow-y-auto">
                {alerts.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <Shield className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">All clear! No open alerts.</p>
                  </div>
                ) : (
                  alerts.map((alert) => (
                    <div
                      key={alert.id}
                      className="px-4 py-3 border-b border-slate-800/50 hover:bg-slate-800/50 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5">{severityIcon(alert.severity)}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">{alert.title}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${severityColor(alert.severity)}`}>
                              {alert.severity}
                            </span>
                            <span className="text-[10px] text-slate-500">{alert.source}</span>
                            <span className="text-[10px] text-slate-600">{timeAgo(alert.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Footer */}
              <div className="px-4 py-2.5 border-t border-slate-800 bg-slate-900/50">
                <button
                  onClick={() => {
                    setShowNotifications(false);
                    router.push("/siem");
                  }}
                  className="flex items-center justify-center gap-2 w-full text-xs text-cyan-400 hover:text-cyan-300 transition-colors py-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  View all in SIEM
                </button>
              </div>
            </div>
          )}
        </div>

        {/* User menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-3 px-3 py-1.5 rounded-lg hover:bg-slate-800/50 transition-all cursor-pointer"
            data-testid="user-menu-button"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white text-sm font-bold">
              {user?.name?.charAt(0) || "U"}
            </div>
            <div className="hidden md:flex flex-col items-start">
              <span className="text-sm font-medium text-white">
                {user?.name || "User"}
              </span>
              <span className="text-xs text-slate-500">
                {user?.roles?.[0]?.replace(/-/g, " ") || "User"}
              </span>
            </div>
            <ChevronDown className="w-4 h-4 text-slate-500 hidden md:block" />
          </button>

          {showUserMenu && (
            <div className="absolute right-0 top-12 w-56 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl shadow-black/50 py-2 z-50">
              <div className="px-4 py-2 border-b border-slate-800">
                <p className="text-sm font-medium text-white">{user?.name}</p>
                <p className="text-xs text-slate-500">{user?.email}</p>
                <p className="text-xs text-cyan-400 mt-0.5">{user?.tenantName}</p>
              </div>
              <button
                onClick={() => { setShowUserMenu(false); router.push("/settings/users"); }}
                className="flex items-center gap-3 w-full px-4 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
              >
                <Settings className="w-4 h-4" />
                Settings
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center gap-3 w-full px-4 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-slate-800 transition-all"
                data-testid="sign-out-button"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
