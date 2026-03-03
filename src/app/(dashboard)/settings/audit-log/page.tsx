"use client";

import { useEffect, useState, useCallback } from "react";
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
  ShieldCheck,
  ShieldX,
  ChevronDown,
  ChevronRight,
  Loader2,
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
  userAgent: string | null;
  result: string;
  severity: string;
  category: string;
  createdAt: string;
}

interface IntegrityResult {
  valid: boolean;
  totalRecords: number;
  checkedAt: string;
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

const severityDotColors: Record<string, string> = {
  info: "bg-blue-400",
  low: "bg-cyan-400",
  medium: "bg-yellow-400",
  high: "bg-orange-400",
  critical: "bg-red-500",
};

const severityBadgeVariants: Record<string, "info" | "low" | "medium" | "high" | "critical"> = {
  info: "info",
  low: "low",
  medium: "medium",
  high: "high",
  critical: "critical",
};

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [availableFilters, setAvailableFilters] = useState<{ actions: string[]; categories: string[] }>({
    actions: [],
    categories: [],
  });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [integrity, setIntegrity] = useState<IntegrityResult | null>(null);

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [resultFilter, setResultFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Expandable row state
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchLogs = useCallback(
    async (cursor?: string) => {
      const params = new URLSearchParams();
      if (categoryFilter) params.set("category", categoryFilter);
      if (resultFilter) params.set("result", resultFilter);
      if (severityFilter) params.set("severity", severityFilter);
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      if (cursor) params.set("cursor", cursor);
      params.set("limit", "50");

      const res = await fetch(`/api/audit-log?${params}`);
      if (!res.ok) return;
      const data = await res.json();

      if (cursor) {
        setLogs((prev) => [...prev, ...data.logs]);
      } else {
        setLogs(data.logs);
      }
      setNextCursor(data.nextCursor);
      setTotalCount(data.totalCount);
      if (data.filters) {
        setAvailableFilters(data.filters);
      }
    },
    [categoryFilter, resultFilter, severityFilter, dateFrom, dateTo]
  );

  // Initial load and refetch when filters change
  useEffect(() => {
    setLoading(true);
    fetchLogs()
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [fetchLogs]);

  // Fetch integrity on mount
  useEffect(() => {
    fetch("/api/audit-log/integrity")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setIntegrity(data);
      })
      .catch(() => {});
  }, []);

  const handleLoadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      await fetchLogs(nextCursor);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMore(false);
    }
  };

  const buildExportParams = () => {
    const params = new URLSearchParams();
    if (categoryFilter) params.set("category", categoryFilter);
    if (resultFilter) params.set("result", resultFilter);
    if (severityFilter) params.set("severity", severityFilter);
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    return params.toString();
  };

  const handleExport = (format: "csv" | "json") => {
    const qs = buildExportParams();
    window.location.href = `/api/audit-log/export?format=${format}${qs ? `&${qs}` : ""}`;
  };

  // Client-side search filtering on loaded logs
  const filteredLogs = logs.filter((log) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      log.actorName.toLowerCase().includes(q) ||
      log.action.toLowerCase().includes(q) ||
      (log.actorEmail && log.actorEmail.toLowerCase().includes(q))
    );
  });

  // Stats computed from loaded logs
  const successCount = logs.filter((l) => l.result === "success").length;
  const deniedCount = logs.filter((l) => l.result === "denied").length;
  const errorCount = logs.filter((l) => l.result === "error").length;

  const results = ["success", "denied", "error"];
  const severities = ["info", "low", "medium", "high", "critical"];

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

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "Total Events", value: totalCount, icon: ScrollText, color: "text-cyan-400" },
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

      {/* Integrity Badge + Export */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          {integrity && (
            <div
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium",
                integrity.valid
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                  : "bg-red-500/10 border-red-500/30 text-red-400"
              )}
            >
              {integrity.valid ? (
                <ShieldCheck className="w-4 h-4" />
              ) : (
                <ShieldX className="w-4 h-4" />
              )}
              {integrity.valid ? "Chain Valid" : "Chain Broken"}
              <span className="text-xs opacity-70 ml-1">
                ({integrity.totalRecords} records)
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => handleExport("csv")}>
            <Download className="w-4 h-4 mr-1" />
            Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport("json")}>
            <Download className="w-4 h-4 mr-1" />
            Export JSON
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        {/* Search */}
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

        {/* Date Range */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">From:</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700 text-sm text-white focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50"
          />
          <span className="text-xs text-slate-500">To:</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700 text-sm text-white focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50"
          />
        </div>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        {/* Category Dropdown */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-500" />
          <span className="text-xs text-slate-500">Category:</span>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700 text-sm text-white focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50"
          >
            <option value="">All Categories</option>
            {availableFilters.categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
              </option>
            ))}
          </select>
        </div>

        {/* Result Filter Buttons */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Result:</span>
          <Button
            variant={resultFilter === "" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setResultFilter("")}
          >
            All
          </Button>
          {results.map((r) => (
            <Button
              key={r}
              variant={resultFilter === r ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setResultFilter(r === resultFilter ? "" : r)}
            >
              {r.charAt(0).toUpperCase() + r.slice(1)}
            </Button>
          ))}
        </div>

        {/* Severity Dropdown */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Severity:</span>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700 text-sm text-white focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50"
          >
            <option value="">All Severities</option>
            {severities.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Audit Log List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Audit Log ({filteredLogs.length}{totalCount > logs.length ? ` of ${totalCount}` : ""})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {filteredLogs.map((log) => {
              const ActorIcon = actorTypeIcons[log.actorType] || User;
              const isExpanded = expandedId === log.id;

              return (
                <div key={log.id}>
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : log.id)}
                    className="flex items-start gap-3 p-4 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 transition-all border border-transparent hover:border-slate-700 cursor-pointer"
                  >
                    {/* Severity dot */}
                    <div className="flex items-center gap-2 flex-shrink-0 pt-1">
                      <span
                        className={cn(
                          "w-2.5 h-2.5 rounded-full flex-shrink-0",
                          severityDotColors[log.severity] || severityDotColors.info
                        )}
                      />
                    </div>

                    {/* Actor icon */}
                    <div
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                        log.actorType === "ai_agent"
                          ? "bg-purple-500/20 text-purple-400"
                          : log.actorType === "system"
                          ? "bg-slate-500/20 text-slate-400"
                          : "bg-cyan-500/20 text-cyan-400"
                      )}
                    >
                      <ActorIcon className="w-4 h-4" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-white">{log.actorName}</span>
                        <span className="text-xs text-slate-500">{log.action}</span>
                        {log.category && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {log.category.replace(/_/g, " ")}
                          </Badge>
                        )}
                      </div>
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

                    {/* Right side */}
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-2">
                          {log.severity && (
                            <Badge
                              variant={severityBadgeVariants[log.severity] || "info"}
                              className="text-[10px]"
                            >
                              {log.severity}
                            </Badge>
                          )}
                          <Badge variant={resultVariants[log.result] || "secondary"}>
                            {log.result}
                          </Badge>
                        </div>
                        <span className="text-[10px] text-slate-500">
                          {formatRelativeTime(log.createdAt)}
                        </span>
                      </div>
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-slate-500" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-500" />
                      )}
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="ml-12 mt-1 mb-2 p-4 rounded-lg bg-slate-900/80 border border-slate-800 space-y-3">
                      <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs">
                        <div>
                          <span className="text-slate-500">Event ID:</span>
                          <span className="ml-2 text-slate-300 font-mono">{log.id}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Timestamp:</span>
                          <span className="ml-2 text-slate-300">{formatDateTime(log.createdAt)}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Actor:</span>
                          <span className="ml-2 text-slate-300">
                            {log.actorName} ({log.actorType})
                          </span>
                        </div>
                        {log.actorEmail && (
                          <div>
                            <span className="text-slate-500">Email:</span>
                            <span className="ml-2 text-slate-300">{log.actorEmail}</span>
                          </div>
                        )}
                        <div>
                          <span className="text-slate-500">Action:</span>
                          <span className="ml-2 text-slate-300">{log.action}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Result:</span>
                          <span className="ml-2 text-slate-300">{log.result}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Severity:</span>
                          <span className="ml-2 text-slate-300">{log.severity || "info"}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Category:</span>
                          <span className="ml-2 text-slate-300">{log.category || "N/A"}</span>
                        </div>
                        {log.ipAddress && (
                          <div>
                            <span className="text-slate-500">IP Address:</span>
                            <span className="ml-2 text-slate-300">{log.ipAddress}</span>
                          </div>
                        )}
                        {log.resourceType && (
                          <div>
                            <span className="text-slate-500">Resource:</span>
                            <span className="ml-2 text-slate-300">
                              {log.resourceType} {log.resourceId ? `(${log.resourceId})` : ""}
                            </span>
                          </div>
                        )}
                      </div>
                      {log.userAgent && (
                        <div className="text-xs">
                          <span className="text-slate-500">User Agent:</span>
                          <p className="mt-1 text-slate-400 font-mono text-[11px] break-all bg-slate-950/50 p-2 rounded">
                            {log.userAgent}
                          </p>
                        </div>
                      )}
                      {Object.keys(log.details).length > 0 && (
                        <div className="text-xs">
                          <span className="text-slate-500">Details:</span>
                          <pre className="mt-1 text-slate-400 font-mono text-[11px] bg-slate-950/50 p-3 rounded overflow-x-auto">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {filteredLogs.length === 0 && (
              <div className="text-center py-12 text-slate-500">
                <ScrollText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>
                  {searchQuery || resultFilter || categoryFilter || severityFilter || dateFrom || dateTo
                    ? "No audit logs match your filters."
                    : "No audit logs recorded yet."}
                </p>
              </div>
            )}
          </div>

          {/* Load More */}
          {nextCursor && (
            <div className="flex justify-center mt-6">
              <Button
                variant="outline"
                onClick={handleLoadMore}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Loading...
                  </>
                ) : (
                  "Load More"
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
