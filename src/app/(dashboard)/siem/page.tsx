"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Bell,
  AlertTriangle,
  ShieldAlert,
  Activity,
  Filter,
  ArrowRightLeft,
} from "lucide-react";
import { cn, formatDateTime, formatRelativeTime } from "@/lib/utils";
import { PageGate } from "@/components/rbac/PageGate";

interface SiemEvent {
  id: string;
  source: string;
  severity: string;
  category: string;
  title: string;
  details: Record<string, unknown>;
  sourceIp: string | null;
  destIp: string | null;
  createdAt: string;
}

interface SiemAlertItem {
  id: string;
  severity: string;
  title: string;
  description: string | null;
  status: string;
  ruleName: string | null;
  assignedTo: string | null;
  createdAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
}

interface SiemData {
  events: SiemEvent[];
  alerts: SiemAlertItem[];
}

const severityVariants: Record<string, "critical" | "high" | "medium" | "low" | "info"> = {
  critical: "critical",
  high: "high",
  medium: "medium",
  low: "low",
  info: "info",
};

const alertStatusVariants: Record<string, "destructive" | "warning" | "default" | "success" | "secondary"> = {
  open: "destructive",
  investigating: "default",
  acknowledged: "warning",
  resolved: "success",
  false_positive: "secondary",
};

const sourceLabels: Record<string, string> = {
  firewall: "Firewall",
  ids: "IDS/IPS",
  endpoint: "Endpoint",
  cloud: "Cloud",
  application: "Application",
};

const categoryLabels: Record<string, string> = {
  authentication: "Authentication",
  network: "Network",
  malware: "Malware",
  policy_violation: "Policy Violation",
  system: "System",
};

export default function SiemPage() {
  const [data, setData] = useState<SiemData | null>(null);
  const [loading, setLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"events" | "alerts">("events");

  useEffect(() => {
    fetch("/api/siem")
      .then((res) => res.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Loading SIEM data...</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const events = data.events;
  const alerts = data.alerts;

  const criticalEvents = events.filter((e) => e.severity === "critical").length;
  const highEvents = events.filter((e) => e.severity === "high").length;
  const openAlerts = alerts.filter((a) => a.status === "open").length;
  const investigatingAlerts = alerts.filter((a) => a.status === "investigating").length;

  const filteredEvents = severityFilter
    ? events.filter((e) => e.severity === severityFilter)
    : events;

  const filteredAlerts = severityFilter
    ? alerts.filter((a) => a.severity === severityFilter)
    : alerts;

  const severities = ["critical", "high", "medium", "low", "info"];

  return (
    <PageGate capability="siem.view" title="SIEM">
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Bell className="w-7 h-7 text-cyan-400" />
            SIEM Dashboard
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Security event monitoring, alerts, and threat detection
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Activity className="w-3 h-3 text-emerald-400" />
          Live monitoring
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "Total Events", value: events.length, icon: Activity, color: "text-cyan-400" },
          { label: "Critical Events", value: criticalEvents, icon: ShieldAlert, color: "text-red-400" },
          { label: "Open Alerts", value: openAlerts, icon: AlertTriangle, color: "text-orange-400" },
          { label: "Investigating", value: investigatingAlerts, icon: Bell, color: "text-yellow-400" },
        ].map((stat) => (
          <Card key={stat.label} className="stat-card">
            <CardContent className="p-4 flex items-center gap-4">
              <stat.icon className={cn("w-8 h-8", stat.color)} />
              <div>
                <p className="text-2xl font-bold text-white">{stat.value}</p>
                <p className="text-xs text-slate-400">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs + Severity Filter */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2">
          <Button
            variant={activeTab === "events" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("events")}
          >
            Events ({events.length})
          </Button>
          <Button
            variant={activeTab === "alerts" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("alerts")}
          >
            Alerts ({alerts.length})
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-500" />
          <Button
            variant={severityFilter === null ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setSeverityFilter(null)}
          >
            All
          </Button>
          {severities.map((sev) => (
            <Button
              key={sev}
              variant={severityFilter === sev ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setSeverityFilter(sev === severityFilter ? null : sev)}
            >
              {sev.charAt(0).toUpperCase() + sev.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      {/* Events Tab */}
      {activeTab === "events" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Security Events ({filteredEvents.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {filteredEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex items-start gap-4 p-4 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 transition-all cursor-pointer border border-transparent hover:border-slate-700"
                >
                  <div className="flex-shrink-0 mt-0.5">
                    <Badge variant={severityVariants[event.severity] || "info"}>
                      {event.severity}
                    </Badge>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-white">{event.title}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {sourceLabels[event.source] || event.source}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">
                        {categoryLabels[event.category] || event.category}
                      </Badge>
                    </div>
                    {(event.sourceIp || event.destIp) && (
                      <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-500">
                        {event.sourceIp && (
                          <span className="font-mono">{event.sourceIp}</span>
                        )}
                        {event.sourceIp && event.destIp && (
                          <ArrowRightLeft className="w-3 h-3 text-slate-600" />
                        )}
                        {event.destIp && (
                          <span className="font-mono">{event.destIp}</span>
                        )}
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-500 flex-shrink-0 whitespace-nowrap">
                    {formatRelativeTime(event.createdAt)}
                  </span>
                </div>
              ))}
              {filteredEvents.length === 0 && (
                <div className="text-center py-12 text-slate-500">
                  <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>
                    {severityFilter
                      ? `No ${severityFilter} events found.`
                      : "No security events recorded yet."}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Alerts Tab */}
      {activeTab === "alerts" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Security Alerts ({filteredAlerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {filteredAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-start gap-4 p-4 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 transition-all cursor-pointer border border-transparent hover:border-slate-700"
                >
                  <div className="flex-shrink-0 mt-0.5">
                    <Badge variant={severityVariants[alert.severity] || "info"}>
                      {alert.severity}
                    </Badge>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white">{alert.title}</p>
                    {alert.description && (
                      <p className="text-xs text-slate-500 mt-0.5 truncate">{alert.description}</p>
                    )}
                    {alert.ruleName && (
                      <p className="text-[10px] text-slate-600 mt-1">
                        Rule: {alert.ruleName}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <Badge variant={alertStatusVariants[alert.status] || "secondary"}>
                      {alert.status.replace("_", " ")}
                    </Badge>
                    <span className="text-[10px] text-slate-500">
                      {formatRelativeTime(alert.createdAt)}
                    </span>
                  </div>
                </div>
              ))}
              {filteredAlerts.length === 0 && (
                <div className="text-center py-12 text-slate-500">
                  <Bell className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>
                    {severityFilter
                      ? `No ${severityFilter} alerts found.`
                      : "No alerts. Your environment looks secure."}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
    </PageGate>
  );
}
