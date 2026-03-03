"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Shield,
  Server,
  AlertTriangle,
  Scan,
  ShieldCheck,
  Bell,
  Bot,
  Target,
  TrendingUp,
  TrendingDown,
  Activity,
  Clock,
} from "lucide-react";
import { cn, complianceScoreColor, formatRelativeTime, statusColor } from "@/lib/utils";
import type { DashboardStats, ComplianceOverview, RecentActivity, SeverityCount } from "@/types";

interface DashboardData {
  stats: DashboardStats;
  severityCounts: SeverityCount;
  complianceOverview: ComplianceOverview[];
  recentActivity: RecentActivity[];
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Cache-bust to avoid stale Vercel/CDN responses
    fetch(`/api/dashboard?_t=${Date.now()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(`Dashboard API returned ${res.status}: ${body}`);
        }
        return res.json();
      })
      .then((json) => {
        // Validate shape before setting
        if (!json?.stats || typeof json.stats.totalAssets === "undefined") {
          throw new Error("Invalid dashboard response shape");
        }
        setData(json);
      })
      .catch((err) => {
        console.error("Dashboard load error:", err);
        setError(err.message || "Failed to load dashboard");
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Loading security overview...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4 text-center">
          <AlertTriangle className="w-12 h-12 text-red-400" />
          <p className="text-slate-300 text-sm">{error || "Failed to load dashboard data"}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-sm rounded-lg bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const statCards = [
    {
      label: "Total Assets",
      value: data.stats.totalAssets,
      icon: Server,
      color: "from-blue-500 to-blue-700",
      iconColor: "text-blue-400",
      bgGlow: "shadow-blue-500/10",
    },
    {
      label: "Critical Vulnerabilities",
      value: data.stats.criticalVulnerabilities,
      icon: AlertTriangle,
      color: "from-red-500 to-red-700",
      iconColor: "text-red-400",
      bgGlow: "shadow-red-500/10",
      alert: data.stats.criticalVulnerabilities > 0,
    },
    {
      label: "Risk Score",
      value: data.stats.riskScore,
      icon: Target,
      color: "from-orange-500 to-orange-700",
      iconColor: "text-orange-400",
      bgGlow: "shadow-orange-500/10",
      suffix: "/100",
    },
    {
      label: "Compliance Score",
      value: data.stats.complianceScore,
      icon: ShieldCheck,
      color: "from-emerald-500 to-emerald-700",
      iconColor: "text-emerald-400",
      bgGlow: "shadow-emerald-500/10",
      suffix: "%",
    },
    {
      label: "Open Alerts",
      value: data.stats.openAlerts,
      icon: Bell,
      color: "from-amber-500 to-amber-700",
      iconColor: "text-amber-400",
      bgGlow: "shadow-amber-500/10",
      alert: data.stats.openAlerts > 0,
    },
    {
      label: "AI Actions Pending",
      value: data.stats.pendingAiActions,
      icon: Bot,
      color: "from-purple-500 to-purple-700",
      iconColor: "text-purple-400",
      bgGlow: "shadow-purple-500/10",
    },
  ];

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Security Dashboard</h1>
          <p className="text-slate-400 text-sm mt-1">
            Real-time overview of your security posture
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Activity className="w-3 h-3 text-emerald-400 pulse-glow" />
          Live monitoring active
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.label} className={cn("stat-card relative overflow-hidden", stat.bgGlow)}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center bg-gradient-to-br",
                  stat.color,
                  "bg-opacity-10"
                )}>
                  <stat.icon className="w-5 h-5 text-white" />
                </div>
                {stat.alert && (
                  <span className="w-2 h-2 rounded-full bg-red-500 pulse-glow" />
                )}
              </div>
              <div className="space-y-1">
                <p className="text-2xl font-bold text-white">
                  {stat.value}
                  {stat.suffix && (
                    <span className="text-sm font-normal text-slate-500">{stat.suffix}</span>
                  )}
                </p>
                <p className="text-xs text-slate-400">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Middle row: Vulnerabilities + Compliance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Vulnerability Breakdown */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="w-5 h-5 text-cyan-400" />
              Vulnerability Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(["critical", "high", "medium", "low", "info"] as const).map((severity) => {
                const count = data.severityCounts[severity];
                const total = data.stats.totalFindings || 1;
                const pct = Math.round((count / total) * 100);
                const colors = {
                  critical: { bar: "bg-red-500", text: "text-red-400" },
                  high: { bar: "bg-orange-500", text: "text-orange-400" },
                  medium: { bar: "bg-yellow-500", text: "text-yellow-400" },
                  low: { bar: "bg-blue-500", text: "text-blue-400" },
                  info: { bar: "bg-slate-500", text: "text-slate-400" },
                };
                return (
                  <div key={severity} className="flex items-center gap-3">
                    <span className={cn("text-xs font-medium w-16 capitalize", colors[severity].text)}>
                      {severity}
                    </span>
                    <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all duration-1000", colors[severity].bar)}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-sm font-mono text-slate-300 w-8 text-right">{count}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 pt-4 border-t border-slate-800 flex justify-between text-sm">
              <span className="text-slate-400">Total Findings</span>
              <span className="text-white font-semibold">{data.stats.totalFindings}</span>
            </div>
          </CardContent>
        </Card>

        {/* Compliance Overview */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              Compliance Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.complianceOverview.map((fw) => (
                <div key={fw.framework} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{fw.framework}</span>
                      <Badge variant="outline" className="text-[10px]">{fw.version}</Badge>
                    </div>
                    <span className={cn("text-lg font-bold", complianceScoreColor(fw.score))}>
                      {fw.score}%
                    </span>
                  </div>
                  <div className="flex h-2 rounded-full overflow-hidden bg-slate-800">
                    <div
                      className="bg-emerald-500 transition-all duration-1000"
                      style={{ width: `${(fw.compliant / fw.totalControls) * 100}%` }}
                    />
                    <div
                      className="bg-yellow-500 transition-all duration-1000"
                      style={{ width: `${(fw.partiallyCompliant / fw.totalControls) * 100}%` }}
                    />
                    <div
                      className="bg-red-500 transition-all duration-1000"
                      style={{ width: `${(fw.nonCompliant / fw.totalControls) * 100}%` }}
                    />
                  </div>
                  <div className="flex gap-4 text-[10px] text-slate-500">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      {fw.compliant} Compliant
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-yellow-500" />
                      {fw.partiallyCompliant} Partial
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-red-500" />
                      {fw.nonCompliant} Non-compliant
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-slate-600" />
                      {fw.notAssessed} Unassessed
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-5 h-5 text-cyan-400" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {data.recentActivity.map((activity) => (
              <div
                key={activity.id}
                className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 transition-all"
              >
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0",
                  activity.actorType === "ai_agent"
                    ? "bg-purple-500/20 text-purple-400"
                    : "bg-cyan-500/20 text-cyan-400"
                )}>
                  {activity.actorType === "ai_agent" ? (
                    <Bot className="w-4 h-4" />
                  ) : (
                    activity.actorName.charAt(0)
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">
                      {activity.actorName}
                    </span>
                    <span className="text-xs text-slate-500">
                      {activity.action}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">
                    {(() => {
                      try {
                        const d = JSON.parse(activity.details);
                        return Object.entries(d).map(([k, v]) => `${k}: ${v}`).join(", ");
                      } catch {
                        return activity.details;
                      }
                    })()}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <Badge
                    variant={activity.result === "success" ? "success" : activity.result === "denied" ? "destructive" : "secondary"}
                  >
                    {activity.result}
                  </Badge>
                  <span className="text-[10px] text-slate-500">
                    {formatRelativeTime(activity.createdAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
