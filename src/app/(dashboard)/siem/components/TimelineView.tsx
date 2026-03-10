"use client";

import { cn, formatDateTime } from "@/lib/utils";
import { Clock, CheckCircle, AlertTriangle, Shield, Search, XCircle } from "lucide-react";

interface TimelineEntry {
  timestamp: string;
  action: string;
  actor: string;
  details: string;
}

const actionIcons: Record<string, { icon: React.ElementType; color: string }> = {
  detected: { icon: AlertTriangle, color: "text-red-400" },
  acknowledged: { icon: CheckCircle, color: "text-yellow-400" },
  investigation_started: { icon: Search, color: "text-blue-400" },
  containment_initiated: { icon: Shield, color: "text-orange-400" },
  contained: { icon: Shield, color: "text-orange-400" },
  evidence_collected: { icon: Search, color: "text-cyan-400" },
  investigated: { icon: Search, color: "text-blue-400" },
  resolved: { icon: CheckCircle, color: "text-emerald-400" },
  closed: { icon: XCircle, color: "text-slate-400" },
};

export function TimelineView({ entries }: { entries: TimelineEntry[] }) {
  if (!entries || entries.length === 0) {
    return <p className="text-sm text-slate-500 py-4">No timeline entries yet.</p>;
  }

  return (
    <div className="relative pl-6 space-y-4">
      {/* Vertical line */}
      <div className="absolute left-2.5 top-2 bottom-2 w-px bg-slate-700" />

      {entries.map((entry, i) => {
        const meta = actionIcons[entry.action] || { icon: Clock, color: "text-slate-400" };
        const Icon = meta.icon;

        return (
          <div key={i} className="relative">
            {/* Dot */}
            <div className={cn("absolute -left-3.5 top-1 w-5 h-5 rounded-full bg-slate-900 border-2 border-slate-700 flex items-center justify-center")}>
              <Icon className={cn("w-3 h-3", meta.color)} />
            </div>

            <div className="ml-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-white capitalize">
                  {entry.action.replace(/_/g, " ")}
                </span>
                <span className="text-[10px] text-slate-500">
                  by {entry.actor}
                </span>
                <span className="text-[10px] text-slate-600">
                  {formatDateTime(entry.timestamp)}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">{entry.details}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
