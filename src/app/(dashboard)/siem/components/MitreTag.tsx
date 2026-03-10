"use client";

import { cn } from "@/lib/utils";

const tacticColors: Record<string, string> = {
  "Initial Access": "bg-purple-500/10 text-purple-400 border-purple-500/20",
  "Execution": "bg-red-500/10 text-red-400 border-red-500/20",
  "Persistence": "bg-orange-500/10 text-orange-400 border-orange-500/20",
  "Privilege Escalation": "bg-amber-500/10 text-amber-400 border-amber-500/20",
  "Credential Access": "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  "Lateral Movement": "bg-lime-500/10 text-lime-400 border-lime-500/20",
  "Command and Control": "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  "Exfiltration": "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  "Impact": "bg-rose-500/10 text-rose-400 border-rose-500/20",
};

interface MitreTagProps {
  attackId?: string | null;
  tactic?: string | null;
  technique?: string | null;
  size?: "sm" | "md";
}

export function MitreTag({ attackId, tactic, technique, size = "sm" }: MitreTagProps) {
  if (!attackId && !tactic) return null;

  const colorClass = tactic
    ? tacticColors[tactic] || "bg-slate-500/10 text-slate-400 border-slate-500/20"
    : "bg-purple-500/10 text-purple-400 border-purple-500/20";

  const textSize = size === "sm" ? "text-[10px]" : "text-xs";

  return (
    <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded border font-mono", colorClass, textSize)}>
      {attackId && <span className="font-bold">{attackId}</span>}
      {tactic && !technique && <span>{tactic}</span>}
      {technique && <span className="opacity-80 truncate max-w-[160px]">{technique}</span>}
    </span>
  );
}
