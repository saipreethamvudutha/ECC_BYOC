"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ShieldAlert, Activity, AlertTriangle, Clock, Target,
  Filter, Search, ChevronRight, BookOpen, TrendingUp,
  Zap, Eye, BarChart3, Shield, Siren, FileSearch,
} from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import { PageGate } from "@/components/rbac/PageGate";
import { MitreTag } from "./components/MitreTag";
import { SeverityChart, AlertVolumeChart } from "./components/SeverityChart";

type TabId = "overview" | "alerts" | "incidents" | "rules" | "hunting";

const severityVariants: Record<string, "critical" | "high" | "medium" | "low" | "info"> = {
  critical: "critical", high: "high", medium: "medium", low: "low", info: "info",
};

const statusColors: Record<string, string> = {
  open: "bg-red-500/10 text-red-400 border-red-500/20",
  triaging: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  investigating: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  contained: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  resolved: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  closed: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  false_positive: "bg-slate-500/10 text-slate-500 border-slate-500/20",
  eradicated: "bg-teal-500/10 text-teal-400 border-teal-500/20",
  recovered: "bg-green-500/10 text-green-400 border-green-500/20",
};

/* eslint-disable @typescript-eslint/no-explicit-any */

export default function SiemPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [metrics, setMetrics] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const loadData = useCallback(async (isAutoRefresh = false) => {
    if (!isAutoRefresh) setLoading(true);
    try {
      const [metricsRes, alertsRes, incRes, rulesRes, eventsRes] = await Promise.all([
        fetch("/api/siem/metrics").then(r => r.ok ? r.json() : null),
        fetch("/api/siem?tab=alerts&limit=100").then(r => r.ok ? r.json() : null),
        fetch("/api/siem?tab=incidents&limit=50").then(r => r.ok ? r.json() : null),
        fetch("/api/siem/rules?limit=50").then(r => r.ok ? r.json() : null),
        fetch("/api/siem?tab=events&limit=50").then(r => r.ok ? r.json() : null),
      ]);
      if (metricsRes) setMetrics(metricsRes);
      if (alertsRes?.alerts) setAlerts(alertsRes.alerts);
      if (incRes?.incidents) setIncidents(incRes.incidents);
      if (rulesRes?.rules) setRules(rulesRes.rules);
      if (eventsRes?.events) setEvents(eventsRes.events);
      setLastRefresh(new Date());
    } catch (e) { console.error("SIEM load error:", e); }
    if (!isAutoRefresh) setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => loadData(true), 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Loading SOC data...</p>
        </div>
      </div>
    );
  }

  const filteredAlerts = alerts.filter(a => {
    if (severityFilter && a.severity !== severityFilter) return false;
    if (statusFilter && a.status !== statusFilter) return false;
    if (searchQuery && !a.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const filteredIncidents = incidents.filter(i => {
    if (severityFilter && i.severity !== severityFilter) return false;
    if (statusFilter && i.status !== statusFilter) return false;
    if (searchQuery && !i.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const filteredEvents = events.filter(e => {
    if (severityFilter && e.severity !== severityFilter) return false;
    if (searchQuery && !e.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const tabs: { id: TabId; label: string; icon: React.ElementType; count?: number }[] = [
    { id: "overview", label: "SOC Overview", icon: BarChart3 },
    { id: "alerts", label: "Alert Queue", icon: AlertTriangle, count: alerts.filter(a => a.status === "open" || a.status === "triaging" || a.status === "investigating").length },
    { id: "incidents", label: "Incidents", icon: Siren, count: incidents.filter(i => i.status !== "closed").length },
    { id: "rules", label: "Detection Rules", icon: BookOpen, count: rules.length },
    { id: "hunting", label: "Events", icon: FileSearch, count: events.length },
  ];

  return (
    <PageGate capability="siem.view" title="SIEM / SOC">
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ShieldAlert className="w-7 h-7 text-cyan-400" />
            SOC Operations Center
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Security event monitoring, threat detection, and incident management
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Activity className="w-3 h-3 text-emerald-400 animate-pulse" />
          <span>Live — updated {formatRelativeTime(lastRefresh.toISOString())}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-800 overflow-x-auto pb-px">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-all whitespace-nowrap",
              activeTab === tab.id
                ? "bg-slate-800/50 text-cyan-400 border-b-2 border-cyan-400"
                : "text-slate-400 hover:text-white hover:bg-slate-800/30"
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {tab.count !== undefined && (
              <span className={cn(
                "ml-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                activeTab === tab.id ? "bg-cyan-500/20 text-cyan-400" : "bg-slate-700 text-slate-400"
              )}>{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ═══ SOC OVERVIEW TAB ═══ */}
      {activeTab === "overview" && metrics && (
        <div className="space-y-6">
          {/* Stat Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: "Security Posture", value: metrics.postureScore, suffix: "/100", icon: Shield, color: metrics.postureScore >= 70 ? "text-emerald-400" : metrics.postureScore >= 40 ? "text-yellow-400" : "text-red-400" },
              { label: "Open Alerts", value: metrics.openAlerts, icon: AlertTriangle, color: "text-orange-400" },
              { label: "Active Incidents", value: metrics.activeIncidents, icon: Siren, color: "text-red-400" },
              { label: "MTTD", value: metrics.mttd ? `${Math.round(metrics.mttd)}m` : "—", icon: Eye, color: "text-cyan-400" },
              { label: "MTTR", value: metrics.mttr ? `${Math.round(metrics.mttr)}h` : "—", icon: Clock, color: "text-blue-400" },
              { label: "Events (24h)", value: metrics.totalEvents24h, icon: Activity, color: "text-emerald-400" },
            ].map(s => (
              <Card key={s.label} className="stat-card">
                <CardContent className="p-3 flex items-center gap-3">
                  <s.icon className={cn("w-7 h-7 flex-shrink-0", s.color)} />
                  <div>
                    <p className="text-xl font-bold text-white">{s.value}{s.suffix || ""}</p>
                    <p className="text-[10px] text-slate-500">{s.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-cyan-400" />
                  Alert Volume (24h)
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-3">
                {metrics.alertVolumeByHour && <AlertVolumeChart data={metrics.alertVolumeByHour} />}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-cyan-400" />
                  Severity Distribution
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-3">
                {metrics.severityDistribution && (
                  <SeverityChart data={metrics.severityDistribution.map((d: any) => ({
                    label: d.severity, value: d._count, color: ({ critical: "bg-red-500", high: "bg-orange-500", medium: "bg-yellow-500", low: "bg-blue-500" } as Record<string, string>)[d.severity as string] || "bg-slate-500",
                  }))} />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Top 5 Rules + Assets */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Top Triggered Rules</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {metrics.topRules?.slice(0, 5).map((r: any) => (
                    <div key={r.ruleId || r.ruleName} className="flex items-center justify-between p-2 rounded bg-slate-800/30">
                      <span className="text-xs text-slate-300 truncate flex-1">{r.ruleName || "Unknown"}</span>
                      <span className="text-xs font-mono text-cyan-400 ml-2">{r._count}</span>
                    </div>
                  ))}
                  {(!metrics.topRules || metrics.topRules.length === 0) && (
                    <p className="text-xs text-slate-500 py-2">No rule data yet.</p>
                  )}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Top Attacked Assets</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {metrics.topAssets?.slice(0, 5).map((a: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded bg-slate-800/30">
                      <span className="text-xs text-slate-300 font-mono">{a.asset}</span>
                      <span className="text-xs font-mono text-orange-400">{a.count} alerts</span>
                    </div>
                  ))}
                  {(!metrics.topAssets || metrics.topAssets.length === 0) && (
                    <p className="text-xs text-slate-500 py-2">No asset data yet.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Alerts */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>Recent Alerts</span>
                <Button variant="ghost" size="sm" onClick={() => setActiveTab("alerts")} className="text-xs text-cyan-400">
                  View all <ChevronRight className="w-3 h-3 ml-1" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {(metrics.recentAlerts || alerts.slice(0, 10)).map((a: any) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-3 p-2 rounded hover:bg-slate-800/40 cursor-pointer transition-all"
                    onClick={() => router.push(`/siem/alerts/${a.id}`)}
                  >
                    <Badge variant={severityVariants[a.severity] || "info"} className="text-[10px] w-16 justify-center">{a.severity}</Badge>
                    <span className="text-xs text-white truncate flex-1">{a.title}</span>
                    {a.mitreAttackId && <MitreTag attackId={a.mitreAttackId} tactic={a.mitreTactic} />}
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded border", statusColors[a.status] || "text-slate-400")}>{a.status.replace("_", " ")}</span>
                    <span className="text-[10px] text-slate-600 w-16 text-right">{formatRelativeTime(a.createdAt)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══ ALERT QUEUE TAB ═══ */}
      {activeTab === "alerts" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text" placeholder="Search alerts..."
                value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-900/50 border border-slate-800 rounded-lg text-sm text-white placeholder-slate-500 focus:border-cyan-500/30 focus:outline-none"
              />
            </div>
            <Filter className="w-4 h-4 text-slate-500" />
            {["critical", "high", "medium", "low"].map(s => (
              <Button key={s} variant={severityFilter === s ? "secondary" : "ghost"} size="sm" onClick={() => setSeverityFilter(severityFilter === s ? null : s)}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </Button>
            ))}
            <span className="text-slate-600">|</span>
            {["open", "triaging", "investigating", "contained", "resolved"].map(s => (
              <Button key={s} variant={statusFilter === s ? "secondary" : "ghost"} size="sm" onClick={() => setStatusFilter(statusFilter === s ? null : s)}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </Button>
            ))}
          </div>

          {/* Alert Table */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-800 text-xs text-slate-500">
                      <th className="text-left px-4 py-3 font-medium">Severity</th>
                      <th className="text-left px-4 py-3 font-medium">Title</th>
                      <th className="text-left px-4 py-3 font-medium">Status</th>
                      <th className="text-left px-4 py-3 font-medium">MITRE</th>
                      <th className="text-left px-4 py-3 font-medium">Score</th>
                      <th className="text-left px-4 py-3 font-medium">Assigned</th>
                      <th className="text-left px-4 py-3 font-medium">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAlerts.map(a => (
                      <tr
                        key={a.id}
                        className="border-b border-slate-800/50 hover:bg-slate-800/30 cursor-pointer transition-colors"
                        onClick={() => router.push(`/siem/alerts/${a.id}`)}
                      >
                        <td className="px-4 py-3">
                          <Badge variant={severityVariants[a.severity] || "info"}>{a.severity}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-white">{a.title}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn("text-[10px] px-2 py-1 rounded border", statusColors[a.status])}>{a.status.replace("_", " ")}</span>
                        </td>
                        <td className="px-4 py-3">
                          <MitreTag attackId={a.mitreAttackId} tactic={a.mitreTactic} />
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-mono text-slate-300">{a.priorityScore || "—"}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-slate-400">{a.assignedToName || "—"}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[10px] text-slate-500">{formatRelativeTime(a.createdAt)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredAlerts.length === 0 && (
                  <div className="text-center py-12 text-slate-500">
                    <AlertTriangle className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No alerts matching filters.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══ INCIDENTS TAB ═══ */}
      {activeTab === "incidents" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input type="text" placeholder="Search incidents..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-900/50 border border-slate-800 rounded-lg text-sm text-white placeholder-slate-500 focus:border-cyan-500/30 focus:outline-none" />
            </div>
            {["critical", "high", "medium"].map(s => (
              <Button key={s} variant={severityFilter === s ? "secondary" : "ghost"} size="sm" onClick={() => setSeverityFilter(severityFilter === s ? null : s)}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </Button>
            ))}
            <span className="text-slate-600">|</span>
            {["open", "investigating", "contained", "closed"].map(s => (
              <Button key={s} variant={statusFilter === s ? "secondary" : "ghost"} size="sm" onClick={() => setStatusFilter(statusFilter === s ? null : s)}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </Button>
            ))}
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-800 text-xs text-slate-500">
                      <th className="text-left px-4 py-3 font-medium">Severity</th>
                      <th className="text-left px-4 py-3 font-medium">Title</th>
                      <th className="text-left px-4 py-3 font-medium">Status</th>
                      <th className="text-left px-4 py-3 font-medium">Priority</th>
                      <th className="text-left px-4 py-3 font-medium"># Alerts</th>
                      <th className="text-left px-4 py-3 font-medium">Assigned</th>
                      <th className="text-left px-4 py-3 font-medium">SLA</th>
                      <th className="text-left px-4 py-3 font-medium">Detected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredIncidents.map(i => (
                      <tr key={i.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 cursor-pointer transition-colors"
                        onClick={() => router.push(`/siem/incidents/${i.id}`)}>
                        <td className="px-4 py-3"><Badge variant={severityVariants[i.severity] || "info"}>{i.severity}</Badge></td>
                        <td className="px-4 py-3"><span className="text-sm text-white">{i.title}</span></td>
                        <td className="px-4 py-3"><span className={cn("text-[10px] px-2 py-1 rounded border", statusColors[i.status])}>{i.status}</span></td>
                        <td className="px-4 py-3"><span className="text-xs text-slate-300 capitalize">{i.priority}</span></td>
                        <td className="px-4 py-3"><span className="text-xs font-mono text-cyan-400">{i.alertCount || i._count?.alerts || 0}</span></td>
                        <td className="px-4 py-3"><span className="text-xs text-slate-400">{i.assignedToName || "—"}</span></td>
                        <td className="px-4 py-3">{i.slaBreached ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30">Breached</span> : <span className="text-[10px] text-emerald-400">OK</span>}</td>
                        <td className="px-4 py-3"><span className="text-[10px] text-slate-500">{formatRelativeTime(i.detectedAt || i.createdAt)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredIncidents.length === 0 && (
                  <div className="text-center py-12 text-slate-500">
                    <Siren className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No incidents matching filters.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══ DETECTION RULES TAB ═══ */}
      {activeTab === "rules" && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-800 text-xs text-slate-500">
                      <th className="text-left px-4 py-3 font-medium">Name</th>
                      <th className="text-left px-4 py-3 font-medium">MITRE</th>
                      <th className="text-left px-4 py-3 font-medium">Severity</th>
                      <th className="text-left px-4 py-3 font-medium">Type</th>
                      <th className="text-left px-4 py-3 font-medium">Confidence</th>
                      <th className="text-left px-4 py-3 font-medium">Active</th>
                      <th className="text-left px-4 py-3 font-medium">TP / FP</th>
                      <th className="text-left px-4 py-3 font-medium">Alerts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map(r => (
                      <tr key={r.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-3"><span className="text-sm text-white">{r.name}</span></td>
                        <td className="px-4 py-3"><MitreTag attackId={r.mitreAttackId} tactic={r.mitreTactic} technique={r.mitreTechnique} /></td>
                        <td className="px-4 py-3"><Badge variant={severityVariants[r.severity] || "info"}>{r.severity}</Badge></td>
                        <td className="px-4 py-3"><span className="text-xs text-slate-400 capitalize">{r.ruleType}</span></td>
                        <td className="px-4 py-3"><span className="text-xs font-mono text-slate-300">{r.confidenceLevel}%</span></td>
                        <td className="px-4 py-3">{r.isActive ? <span className="text-emerald-400 text-xs">Active</span> : <span className="text-slate-500 text-xs">Disabled</span>}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-mono">
                            <span className="text-emerald-400">{r.truePositiveCount}</span>
                            <span className="text-slate-600"> / </span>
                            <span className="text-red-400">{r.falsePositiveCount}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3"><span className="text-xs font-mono text-cyan-400">{r.alertCount || r._count?.alerts || 0}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rules.length === 0 && (
                  <div className="text-center py-12 text-slate-500">
                    <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No detection rules configured.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══ EVENTS / HUNTING TAB ═══ */}
      {activeTab === "hunting" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input type="text" placeholder="Search events (IP, hostname, user, title)..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-900/50 border border-slate-800 rounded-lg text-sm text-white placeholder-slate-500 focus:border-cyan-500/30 focus:outline-none" />
            </div>
            {["critical", "high", "medium", "low", "info"].map(s => (
              <Button key={s} variant={severityFilter === s ? "secondary" : "ghost"} size="sm" onClick={() => setSeverityFilter(severityFilter === s ? null : s)}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </Button>
            ))}
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="space-y-0">
                {filteredEvents.map(e => (
                  <div key={e.id} className="flex items-start gap-3 px-4 py-3 border-b border-slate-800/30 hover:bg-slate-800/20 transition-colors">
                    <Badge variant={severityVariants[e.severity] || "info"} className="mt-0.5 text-[10px]">{e.severity}</Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white">{e.title}</p>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        {e.sourceIp && <span className="text-[10px] font-mono text-slate-500">{e.sourceIp}</span>}
                        {e.destIp && <span className="text-[10px] font-mono text-slate-500">→ {e.destIp}</span>}
                        {e.userName && <span className="text-[10px] text-slate-500">👤 {e.userName}</span>}
                        {e.hostName && <span className="text-[10px] text-slate-500">🖥 {e.hostName}</span>}
                        {e.processName && <span className="text-[10px] font-mono text-slate-500">⚙ {e.processName}</span>}
                        <Badge variant="outline" className="text-[8px] py-0">{e.source}</Badge>
                        <Badge variant="secondary" className="text-[8px] py-0">{e.category}</Badge>
                        {e.threatIntelHit && <span className="text-[10px] px-1 py-0 rounded bg-red-500/20 text-red-400 border border-red-500/30">⚡ Threat Intel</span>}
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-600 whitespace-nowrap">{formatRelativeTime(e.createdAt)}</span>
                  </div>
                ))}
                {filteredEvents.length === 0 && (
                  <div className="text-center py-12 text-slate-500">
                    <Zap className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No events matching filters.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
    </PageGate>
  );
}
