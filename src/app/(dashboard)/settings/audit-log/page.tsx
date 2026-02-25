"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ScrollText,
  Search,
  Filter,
  User,
  Bot,
  Key,
  Settings,
  Download,
} from "lucide-react";
import { cn, formatDateTime, formatRelativeTime } from "@/lib/utils";

interface AuditLogItem {
  id: string;
  actorName: string;
  actorEmail: string | null;
  actorType: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  details: Record<string, unknown>;
  ipAddress: string | null;
  result: string;
  createdAt: string;
}

const actorTypeIcons: Record<string, React.ElementType> = {
  user: User,
  api_key: Key,
  system: Settings,
  ai_agent: Bot,
};

const resultVariants: Record<string, "success" | "destructive" | "warning" | "secondary"> = {
  success: "success",
  denied: "destructive",
  error: "warning",
};

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [resultFilter, setResultFilter] = useState<string | null>(null);
  const [actorTypeFilter, setActorTypeFilter] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/audit-log")
      .then((res) => res.json())
      .then(setLogs)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Loading audit logs...</p>
        </div>
      </div>
    );
  }

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      !searchQuery ||
      log.actorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.actorEmail && log.actorEmail.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesResult = !resultFilter || log.result === resultFilter;
    const matchesActorType = !actorTypeFilter || log.actorType === actorTypeFilter;
    return matchesSearch && matchesResult && matchesActorType;
  });

  const successCount = logs.filter((l) => l.result === "success").length;
  const deniedCount = logs.filter((l) => l.result === "denied").length;
  const errorCount = logs.filter((l) => l.result === "error").length;

  const results = ["success", "denied", "error"];
  const actorTypes = [...new Set(logs.map((l) => l.actorType))];

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "Total Events", value: logs.length, icon: ScrollText, color: "text-cyan-400" },
          { label: "Successful", value: successCount, icon: ScrollText, color: "text-emerald-400" },
          { label: "Denied", value: deniedCount, icon: ScrollText, color: "text-red-400" },
          { label: "Errors", value: errorCount, icon: ScrollText, color: "text-yellow-400" },
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

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search by actor, action, or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-500" />
          <span className="text-xs text-slate-500">Result:</span>
          <Button
            variant={resultFilter === null ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setResultFilter(null)}
          >
            All
          </Button>
          {results.map((r) => (
            <Button
              key={r}
              variant={resultFilter === r ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setResultFilter(r === resultFilter ? null : r)}
            >
              {r.charAt(0).toUpperCase() + r.slice(1)}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Actor:</span>
          <Button
            variant={actorTypeFilter === null ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setActorTypeFilter(null)}
          >
            All
          </Button>
          {actorTypes.map((at) => (
            <Button
              key={at}
              variant={actorTypeFilter === at ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setActorTypeFilter(at === actorTypeFilter ? null : at)}
            >
              {at.replace("_", " ")}
            </Button>
          ))}
        </div>

        <Button variant="outline" size="sm">
          <Download className="w-4 h-4 mr-2" />
          Export
        </Button>
      </div>

      {/* Audit Log List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Audit Log ({filteredLogs.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {filteredLogs.map((log) => {
              const ActorIcon = actorTypeIcons[log.actorType] || User;
              const detailStr = Object.keys(log.details).length > 0
                ? Object.entries(log.details)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(", ")
                : null;

              return (
                <div
                  key={log.id}
                  className="flex items-start gap-3 p-4 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 transition-all border border-transparent hover:border-slate-700"
                >
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                    log.actorType === "ai_agent"
                      ? "bg-purple-500/20 text-purple-400"
                      : log.actorType === "system"
                      ? "bg-slate-500/20 text-slate-400"
                      : "bg-cyan-500/20 text-cyan-400"
                  )}>
                    <ActorIcon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-white">{log.actorName}</span>
                      <span className="text-xs text-slate-500">{log.action}</span>
                    </div>
                    {detailStr && (
                      <p className="text-xs text-slate-500 mt-0.5 truncate">{detailStr}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-600">
                      {log.ipAddress && <span>IP: {log.ipAddress}</span>}
                      {log.resourceType && (
                        <span>
                          Resource: {log.resourceType}
                          {log.resourceId && ` (${log.resourceId.slice(0, 8)}...)`}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <Badge variant={resultVariants[log.result] || "secondary"}>
                      {log.result}
                    </Badge>
                    <span className="text-[10px] text-slate-500">
                      {formatRelativeTime(log.createdAt)}
                    </span>
                  </div>
                </div>
              );
            })}
            {filteredLogs.length === 0 && (
              <div className="text-center py-12 text-slate-500">
                <ScrollText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>
                  {searchQuery || resultFilter || actorTypeFilter
                    ? "No audit logs match your filters."
                    : "No audit logs recorded yet."}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
