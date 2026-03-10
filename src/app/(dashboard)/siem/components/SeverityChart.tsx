"use client";

import { cn } from "@/lib/utils";

interface ChartBar {
  label: string;
  value: number;
  color: string;
}

interface SeverityChartProps {
  data: ChartBar[];
  maxValue?: number;
}

const defaultColors: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-blue-500",
  info: "bg-slate-500",
};

export function SeverityChart({ data, maxValue }: SeverityChartProps) {
  const max = maxValue || Math.max(...data.map(d => d.value), 1);

  return (
    <div className="space-y-2">
      {data.map((item) => (
        <div key={item.label} className="flex items-center gap-3">
          <span className="text-xs text-slate-400 w-16 capitalize">{item.label}</span>
          <div className="flex-1 h-5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all duration-500", item.color || defaultColors[item.label] || "bg-cyan-500")}
              style={{ width: `${Math.max((item.value / max) * 100, item.value > 0 ? 4 : 0)}%` }}
            />
          </div>
          <span className="text-xs font-mono text-white w-8 text-right">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

interface AlertVolumeChartProps {
  data: { hour: string; count: number }[];
}

export function AlertVolumeChart({ data }: AlertVolumeChartProps) {
  const max = Math.max(...data.map(d => d.count), 1);

  return (
    <div className="flex items-end gap-0.5 h-20">
      {data.map((item, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
          <div
            className="w-full bg-cyan-500/60 rounded-t transition-all duration-300 hover:bg-cyan-400/80 min-h-[2px]"
            style={{ height: `${Math.max((item.count / max) * 100, item.count > 0 ? 5 : 2)}%` }}
            title={`${item.hour}: ${item.count} alerts`}
          />
          {i % 6 === 0 && (
            <span className="text-[8px] text-slate-600">{item.hour}</span>
          )}
        </div>
      ))}
    </div>
  );
}
