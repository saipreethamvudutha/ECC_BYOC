import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(date: Date | string): string {
  return new Date(date).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return formatDate(date);
}

export function severityColor(severity: string): string {
  const colors: Record<string, string> = {
    critical: "text-red-500 bg-red-500/10 border-red-500/20",
    high: "text-orange-500 bg-orange-500/10 border-orange-500/20",
    medium: "text-yellow-500 bg-yellow-500/10 border-yellow-500/20",
    low: "text-blue-500 bg-blue-500/10 border-blue-500/20",
    info: "text-slate-400 bg-slate-500/10 border-slate-500/20",
  };
  return colors[severity] || colors.info;
}

export function statusColor(status: string): string {
  const colors: Record<string, string> = {
    active: "text-emerald-400 bg-emerald-500/10",
    compliant: "text-emerald-400 bg-emerald-500/10",
    completed: "text-emerald-400 bg-emerald-500/10",
    success: "text-emerald-400 bg-emerald-500/10",
    approved: "text-emerald-400 bg-emerald-500/10",
    running: "text-cyan-400 bg-cyan-500/10",
    in_progress: "text-cyan-400 bg-cyan-500/10",
    investigating: "text-cyan-400 bg-cyan-500/10",
    partially_compliant: "text-yellow-400 bg-yellow-500/10",
    pending: "text-yellow-400 bg-yellow-500/10",
    queued: "text-yellow-400 bg-yellow-500/10",
    invited: "text-yellow-400 bg-yellow-500/10",
    non_compliant: "text-red-400 bg-red-500/10",
    failed: "text-red-400 bg-red-500/10",
    denied: "text-red-400 bg-red-500/10",
    suspended: "text-red-400 bg-red-500/10",
    rejected: "text-red-400 bg-red-500/10",
    not_assessed: "text-slate-400 bg-slate-500/10",
    deactivated: "text-slate-400 bg-slate-500/10",
    expired: "text-slate-400 bg-slate-500/10",
    open: "text-orange-400 bg-orange-500/10",
    acknowledged: "text-blue-400 bg-blue-500/10",
    resolved: "text-emerald-400 bg-emerald-500/10",
    false_positive: "text-slate-400 bg-slate-500/10",
    not_applicable: "text-slate-400 bg-slate-500/10",
  };
  return colors[status] || "text-slate-400 bg-slate-500/10";
}

export function complianceScoreColor(score: number): string {
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-yellow-400";
  if (score >= 40) return "text-orange-400";
  return "text-red-400";
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + "...";
}
