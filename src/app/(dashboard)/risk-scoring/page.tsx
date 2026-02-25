"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Target,
  Shield,
  AlertTriangle,
  Server,
  ShieldCheck,
  Bell,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DashboardStats {
  totalAssets: number;
  criticalVulnerabilities: number;
  activeScans: number;
  complianceScore: number;
  openAlerts: number;
  pendingAiActions: number;
  riskScore: number;
  totalFindings: number;
}

interface SeverityCount {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

interface RiskData {
  stats: DashboardStats;
  severityCounts: SeverityCount;
}

function riskColor(score: number): string {
  if (score >= 75) return "text-red-400";
  if (score >= 50) return "text-orange-400";
  if (score >= 25) return "text-yellow-400";
  return "text-emerald-400";
}

function riskLabel(score: number): string {
  if (score >= 75) return "Critical";
  if (score >= 50) return "High";
  if (score >= 25) return "Medium";
  return "Low";
}

function riskBadgeVariant(score: number): "critical" | "high" | "medium" | "low" {
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
}

export default function RiskScoringPage() {
  const [data, setData] = useState<RiskData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard")
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
          <p className="text-slate-400 text-sm">Calculating risk scores...</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { stats, severityCounts } = data;
  const riskScore = stats.riskScore;

  // Calculate risk breakdown factors
  const vulnRisk = Math.min(100, severityCounts.critical * 10 + severityCounts.high * 5);
  const complianceRisk = Math.max(0, 100 - stats.complianceScore);
  const alertRisk = Math.min(100, stats.openAlerts * 8);
  const coverageRisk = stats.totalAssets > 0 ? Math.min(100, Math.round((1 - stats.activeScans / Math.max(stats.totalAssets, 1)) * 30)) : 0;

  const riskFactors = [
    {
      label: "Vulnerability Risk",
      description: "Based on critical and high severity vulnerabilities in your environment",
      score: vulnRisk,
      icon: AlertTriangle,
      details: `${severityCounts.critical} critical, ${severityCounts.high} high findings`,
    },
    {
      label: "Compliance Risk",
      description: "Derived from compliance framework assessment gaps and failures",
      score: complianceRisk,
      icon: ShieldCheck,
      details: `${stats.complianceScore}% compliance score`,
    },
    {
      label: "Threat Risk",
      description: "Active alerts and unresolved security incidents",
      score: alertRisk,
      icon: Bell,
      details: `${stats.openAlerts} open alerts`,
    },
    {
      label: "Coverage Risk",
      description: "Asset scanning coverage and monitoring gaps",
      score: coverageRisk,
      icon: Server,
      details: `${stats.totalAssets} assets tracked`,
    },
  ];

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Target className="w-7 h-7 text-cyan-400" />
          Risk Scoring
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Comprehensive risk assessment of your security posture
        </p>
      </div>

      {/* Overall Risk Score Card */}
      <Card className="overflow-hidden">
        <CardContent className="p-8">
          <div className="flex flex-col md:flex-row items-center gap-8">
            {/* Score Circle */}
            <div className="relative w-48 h-48 flex-shrink-0">
              <svg className="w-48 h-48 transform -rotate-90" viewBox="0 0 120 120">
                <circle
                  cx="60"
                  cy="60"
                  r="52"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="none"
                  className="text-slate-800"
                />
                <circle
                  cx="60"
                  cy="60"
                  r="52"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="none"
                  strokeDasharray={`${(riskScore / 100) * 327} 327`}
                  strokeLinecap="round"
                  className={riskColor(riskScore)}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={cn("text-4xl font-bold", riskColor(riskScore))}>
                  {riskScore}
                </span>
                <span className="text-xs text-slate-500">/ 100</span>
              </div>
            </div>

            {/* Score Details */}
            <div className="flex-1 text-center md:text-left">
              <div className="flex items-center gap-3 justify-center md:justify-start">
                <h2 className="text-2xl font-bold text-white">Overall Risk Score</h2>
                <Badge variant={riskBadgeVariant(riskScore)}>
                  {riskLabel(riskScore)}
                </Badge>
              </div>
              <p className="text-slate-400 text-sm mt-2 max-w-lg">
                Your organization&apos;s risk score is calculated from vulnerability findings,
                compliance posture, active threats, and asset coverage. A lower score
                indicates a stronger security posture.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                <div className="text-center">
                  <p className="text-lg font-bold text-white">{stats.totalFindings}</p>
                  <p className="text-[10px] text-slate-500">Total Findings</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-red-400">{severityCounts.critical}</p>
                  <p className="text-[10px] text-slate-500">Critical</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-white">{stats.complianceScore}%</p>
                  <p className="text-[10px] text-slate-500">Compliance</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-orange-400">{stats.openAlerts}</p>
                  <p className="text-[10px] text-slate-500">Open Alerts</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Risk Breakdown */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">Risk Breakdown</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {riskFactors.map((factor) => (
            <Card key={factor.label}>
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
                    factor.score >= 50 ? "bg-red-500/10" : factor.score >= 25 ? "bg-yellow-500/10" : "bg-emerald-500/10"
                  )}>
                    <factor.icon className={cn("w-5 h-5", riskColor(factor.score))} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-white">{factor.label}</h3>
                      <span className={cn("text-lg font-bold", riskColor(factor.score))}>
                        {factor.score}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{factor.description}</p>
                    <div className="mt-3">
                      <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-1000",
                            factor.score >= 75 ? "bg-red-500" : factor.score >= 50 ? "bg-orange-500" : factor.score >= 25 ? "bg-yellow-500" : "bg-emerald-500"
                          )}
                          style={{ width: `${factor.score}%` }}
                        />
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-600 mt-2">{factor.details}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Severity Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-5 h-5 text-cyan-400" />
            Finding Severity Distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {(["critical", "high", "medium", "low", "info"] as const).map((severity) => {
              const count = severityCounts[severity];
              const total = stats.totalFindings || 1;
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
                  <span className="text-sm font-mono text-slate-300 w-12 text-right">{count}</span>
                  <span className="text-xs text-slate-500 w-10 text-right">{pct}%</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
