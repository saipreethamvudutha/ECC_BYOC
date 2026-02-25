"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Bot,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  Shield,
  Flame,
  Scan,
  AlertTriangle,
} from "lucide-react";
import { cn, formatDateTime, formatRelativeTime } from "@/lib/utils";

interface AiActionItem {
  id: string;
  type: string;
  title: string;
  description: string | null;
  riskLevel: string;
  status: string;
  config: Record<string, unknown>;
  approvedAt: string | null;
  executedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

const typeIcons: Record<string, React.ElementType> = {
  patch: Shield,
  firewall_rule: Flame,
  risk_override: AlertTriangle,
  siem_rule: Zap,
  scan: Scan,
};

const typeLabels: Record<string, string> = {
  patch: "Patch Deployment",
  firewall_rule: "Firewall Rule",
  risk_override: "Risk Override",
  siem_rule: "SIEM Rule",
  scan: "Security Scan",
};

const statusConfig: Record<string, { icon: React.ElementType; badge: "success" | "warning" | "destructive" | "secondary" | "default" | "info" }> = {
  pending: { icon: Clock, badge: "warning" },
  approved: { icon: CheckCircle2, badge: "success" },
  rejected: { icon: XCircle, badge: "destructive" },
  executed: { icon: Zap, badge: "default" },
  expired: { icon: Clock, badge: "secondary" },
  failed: { icon: XCircle, badge: "destructive" },
};

const riskVariants: Record<string, "low" | "medium" | "high"> = {
  low: "low",
  medium: "medium",
  high: "high",
};

export default function AiActionsPage() {
  const [actions, setActions] = useState<AiActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ai-actions")
      .then((res) => res.json())
      .then(setActions)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Loading AI actions...</p>
        </div>
      </div>
    );
  }

  const pendingCount = actions.filter((a) => a.status === "pending").length;
  const approvedCount = actions.filter((a) => a.status === "approved" || a.status === "executed").length;
  const rejectedCount = actions.filter((a) => a.status === "rejected").length;

  const filteredActions = statusFilter
    ? actions.filter((a) => a.status === statusFilter)
    : actions;

  const statuses = ["pending", "approved", "rejected", "executed", "expired", "failed"];

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Bot className="w-7 h-7 text-purple-400" />
            AI Actions
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Review and manage AI-recommended security actions
          </p>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "Total Actions", value: actions.length, icon: Bot, color: "text-purple-400" },
          { label: "Pending Review", value: pendingCount, icon: Clock, color: "text-yellow-400" },
          { label: "Approved / Executed", value: approvedCount, icon: CheckCircle2, color: "text-emerald-400" },
          { label: "Rejected", value: rejectedCount, icon: XCircle, color: "text-red-400" },
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

      {/* Status Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant={statusFilter === null ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setStatusFilter(null)}
        >
          All ({actions.length})
        </Button>
        {statuses.map((s) => {
          const count = actions.filter((a) => a.status === s).length;
          if (count === 0 && s !== "pending") return null;
          return (
            <Button
              key={s}
              variant={statusFilter === s ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setStatusFilter(s === statusFilter ? null : s)}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)} ({count})
            </Button>
          );
        })}
      </div>

      {/* Actions List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Actions ({filteredActions.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {filteredActions.map((action) => {
              const TypeIcon = typeIcons[action.type] || Bot;
              const config = statusConfig[action.status] || statusConfig.pending;
              return (
                <div
                  key={action.id}
                  className="flex items-start gap-4 p-4 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 transition-all cursor-pointer border border-transparent hover:border-slate-700"
                >
                  <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                    <TypeIcon className="w-5 h-5 text-purple-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-white">{action.title}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {typeLabels[action.type] || action.type}
                      </Badge>
                      <Badge variant={riskVariants[action.riskLevel] || "medium"}>
                        {action.riskLevel} risk
                      </Badge>
                    </div>
                    {action.description && (
                      <p className="text-xs text-slate-500 mt-1 truncate">{action.description}</p>
                    )}
                    <p className="text-[10px] text-slate-600 mt-1">
                      Created {formatRelativeTime(action.createdAt)}
                      {action.approvedAt && ` | Approved ${formatRelativeTime(action.approvedAt)}`}
                      {action.executedAt && ` | Executed ${formatRelativeTime(action.executedAt)}`}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <Badge variant={config.badge}>
                      {action.status}
                    </Badge>
                    {action.status === "pending" && (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-emerald-400 hover:text-emerald-300">
                          Approve
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-red-400 hover:text-red-300">
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {filteredActions.length === 0 && (
              <div className="text-center py-12 text-slate-500">
                <Bot className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>
                  {statusFilter
                    ? `No ${statusFilter} actions found.`
                    : "No AI actions yet. The AI agent will suggest actions when threats are detected."}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
