"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FileText,
  Download,
  BarChart3,
  ShieldCheck,
  AlertTriangle,
  FileBarChart,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
} from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils";

interface ReportItem {
  id: string;
  name: string;
  type: string;
  status: string;
  createdAt: string;
}

const reportTemplates = [
  {
    id: "vulnerability",
    name: "Vulnerability Report",
    description: "Comprehensive overview of all discovered vulnerabilities with severity breakdowns and remediation guidance.",
    icon: AlertTriangle,
    color: "text-red-400",
    bgColor: "bg-red-500/10",
  },
  {
    id: "compliance",
    name: "Compliance Report",
    description: "Detailed compliance posture across GDPR, PCI DSS, and HIPAA frameworks with control status and evidence.",
    icon: ShieldCheck,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
  },
  {
    id: "executive",
    name: "Executive Summary",
    description: "High-level security posture overview designed for leadership and stakeholder communication.",
    icon: BarChart3,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
  },
  {
    id: "technical",
    name: "Technical Report",
    description: "In-depth technical analysis of scan results, configurations, and security findings.",
    icon: FileBarChart,
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
  },
];

const statusConfig: Record<string, { icon: React.ElementType; color: string; badge: "success" | "warning" | "destructive" | "secondary" }> = {
  completed: { icon: CheckCircle2, color: "text-emerald-400", badge: "success" },
  generating: { icon: Loader2, color: "text-cyan-400", badge: "warning" },
  failed: { icon: XCircle, color: "text-red-400", badge: "destructive" },
};

export default function ReportsPage() {
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);

  function loadReports() {
    fetch("/api/reports")
      .then((res) => res.json())
      .then(setReports)
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadReports();
  }, []);

  async function handleGenerate(type: string) {
    setGenerating(type);
    try {
      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      if (res.ok) {
        loadReports();
        // Auto-refresh to pick up completion
        setTimeout(loadReports, 4000);
        setTimeout(loadReports, 8000);
      }
    } catch (error) {
      console.error("Generate error:", error);
    } finally {
      setGenerating(null);
    }
  }

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <FileText className="w-7 h-7 text-cyan-400" />
            Reports
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Generate and download security reports for your organization
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadReports}>
          <RefreshCw className="w-4 h-4 mr-1" />
          Refresh
        </Button>
      </div>

      {/* Report Templates */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">Report Templates</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {reportTemplates.map((template) => (
            <Card
              key={template.id}
              className="transition-all duration-200 hover:border-cyan-500/30"
            >
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <div className={cn("w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0", template.bgColor)}>
                    <template.icon className={cn("w-6 h-6", template.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-white">{template.name}</h3>
                    <p className="text-xs text-slate-400 mt-1">{template.description}</p>
                    <div className="mt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleGenerate(template.id)}
                        disabled={generating === template.id}
                      >
                        {generating === template.id ? (
                          <>
                            <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <FileText className="w-3 h-3 mr-2" />
                            Generate
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Generated Reports */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generated Reports ({reports.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {reports.length > 0 ? (
            <div className="space-y-2">
              {reports.map((report) => {
                const config = statusConfig[report.status] || statusConfig.generating;
                const StatusIcon = config.icon;
                return (
                  <div
                    key={report.id}
                    className="flex items-center gap-4 p-4 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 transition-all border border-transparent hover:border-slate-700"
                  >
                    <StatusIcon className={cn("w-5 h-5 flex-shrink-0", config.color, report.status === "generating" && "animate-spin")} />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-white">{report.name}</span>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {formatDateTime(report.createdAt)}
                      </p>
                    </div>
                    <Badge variant={config.badge}>{report.status}</Badge>
                    {report.status === "completed" && (
                      <Button variant="ghost" size="sm">
                        <Download className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-slate-500">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No reports generated yet.</p>
              <p className="text-xs text-slate-600 mt-1">
                Select a template above to generate your first security report.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
