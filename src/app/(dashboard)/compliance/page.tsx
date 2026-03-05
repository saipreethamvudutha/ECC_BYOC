"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  XCircle,
  MinusCircle,
  HelpCircle,
  FileText,
  Download,
} from "lucide-react";
import { cn, complianceScoreColor, statusColor } from "@/lib/utils";
import { PageGate } from "@/components/rbac/PageGate";

interface ComplianceControl {
  id: string;
  controlId: string;
  title: string;
  description: string | null;
  category: string | null;
  status: string;
  lastAssessedAt: string | null;
  nextReviewAt: string | null;
}

interface Framework {
  id: string;
  name: string;
  version: string;
  description: string | null;
  isActive: boolean;
  stats: {
    total: number;
    compliant: number;
    partial: number;
    nonCompliant: number;
    notAssessed: number;
    notApplicable: number;
    score: number;
  };
  controls: ComplianceControl[];
}

const statusIcons: Record<string, React.ElementType> = {
  compliant: CheckCircle2,
  partially_compliant: AlertCircle,
  non_compliant: XCircle,
  not_assessed: HelpCircle,
  not_applicable: MinusCircle,
};

const statusLabels: Record<string, string> = {
  compliant: "Compliant",
  partially_compliant: "Partial",
  non_compliant: "Non-Compliant",
  not_assessed: "Not Assessed",
  not_applicable: "N/A",
};

const iconColors: Record<string, string> = {
  compliant: "text-emerald-400",
  partially_compliant: "text-yellow-400",
  non_compliant: "text-red-400",
  not_assessed: "text-slate-400",
  not_applicable: "text-slate-500",
};

const statusVariants: Record<string, "success" | "warning" | "destructive" | "secondary" | "info"> = {
  compliant: "success",
  partially_compliant: "warning",
  non_compliant: "destructive",
  not_assessed: "secondary",
  not_applicable: "info",
};

export default function CompliancePage() {
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedFramework, setExpandedFramework] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [editingControl, setEditingControl] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  function loadData() {
    fetch("/api/compliance")
      .then((res) => res.json())
      .then((data) => {
        setFrameworks(data);
        if (data.length > 0 && !expandedFramework) setExpandedFramework(data[0].id);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadData();
  }, []);

  async function updateControlStatus(controlId: string, newStatus: string) {
    setUpdating(true);
    try {
      const res = await fetch("/api/compliance/update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ controlId, status: newStatus }),
      });
      if (res.ok) {
        loadData();
      }
    } catch (error) {
      console.error("Update error:", error);
    } finally {
      setUpdating(false);
      setEditingControl(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Loading compliance data...</p>
        </div>
      </div>
    );
  }

  // Get unique categories for the expanded framework
  const expandedFw = frameworks.find((fw) => fw.id === expandedFramework);
  const categories = expandedFw
    ? [...new Set(expandedFw.controls.map((c) => c.category).filter(Boolean))]
    : [];

  const filteredControls = expandedFw?.controls.filter(
    (c) => !categoryFilter || c.category === categoryFilter
  );

  return (
    <PageGate capability="scan.policy.view" title="Compliance">
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-7 h-7 text-emerald-400" />
            Compliance Center
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Track GDPR, PCI DSS, and HIPAA compliance across your organization
          </p>
        </div>
        <Button variant="outline" size="sm">
          <Download className="w-4 h-4 mr-2" />
          Export Report
        </Button>
      </div>

      {/* Overall Score Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {frameworks.map((fw) => (
          <Card
            key={fw.id}
            className={cn(
              "cursor-pointer transition-all duration-200 hover:border-cyan-500/30",
              expandedFramework === fw.id && "border-cyan-500/30 glow-cyan"
            )}
            onClick={() => {
              setExpandedFramework(fw.id);
              setCategoryFilter(null);
            }}
          >
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-white">{fw.name}</h3>
                  <p className="text-xs text-slate-500">Version {fw.version}</p>
                </div>
                <div className={cn("text-3xl font-bold", complianceScoreColor(fw.stats.score))}>
                  {fw.stats.score}%
                </div>
              </div>

              {/* Progress bar */}
              <div className="flex h-3 rounded-full overflow-hidden bg-slate-800 mb-3">
                <div className="bg-emerald-500 transition-all duration-700" style={{ width: `${(fw.stats.compliant / fw.stats.total) * 100}%` }} />
                <div className="bg-yellow-500 transition-all duration-700" style={{ width: `${(fw.stats.partial / fw.stats.total) * 100}%` }} />
                <div className="bg-red-500 transition-all duration-700" style={{ width: `${(fw.stats.nonCompliant / fw.stats.total) * 100}%` }} />
                <div className="bg-slate-600 transition-all duration-700" style={{ width: `${(fw.stats.notAssessed / fw.stats.total) * 100}%` }} />
              </div>

              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <p className="text-lg font-bold text-emerald-400">{fw.stats.compliant}</p>
                  <p className="text-[10px] text-slate-500">Compliant</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-yellow-400">{fw.stats.partial}</p>
                  <p className="text-[10px] text-slate-500">Partial</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-red-400">{fw.stats.nonCompliant}</p>
                  <p className="text-[10px] text-slate-500">Non-Comp</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-slate-400">{fw.stats.notAssessed}</p>
                  <p className="text-[10px] text-slate-500">Pending</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Detailed Controls */}
      {expandedFw && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                {expandedFw.name} Controls ({expandedFw.controls.length})
              </CardTitle>
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant={categoryFilter === null ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setCategoryFilter(null)}
                >
                  All
                </Button>
                {categories.map((cat) => (
                  <Button
                    key={cat}
                    variant={categoryFilter === cat ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setCategoryFilter(cat === categoryFilter ? null : cat)}
                  >
                    {cat}
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {filteredControls?.map((control) => {
                const Icon = statusIcons[control.status] || HelpCircle;
                return (
                  <div
                    key={control.id}
                    className="flex items-center gap-4 p-4 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 transition-all border border-transparent hover:border-slate-700"
                  >
                    <Icon className={cn("w-5 h-5 flex-shrink-0", iconColors[control.status])} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-cyan-400">{control.controlId}</span>
                        <span className="text-sm font-medium text-white">{control.title}</span>
                      </div>
                      {control.description && (
                        <p className="text-xs text-slate-500 mt-0.5 truncate">{control.description}</p>
                      )}
                    </div>
                    {control.category && (
                      <Badge variant="outline" className="text-[10px] hidden md:inline-flex">
                        {control.category}
                      </Badge>
                    )}
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingControl(editingControl === control.id ? null : control.id);
                        }}
                        className="cursor-pointer"
                      >
                        <Badge variant={statusVariants[control.status] || "secondary"}>
                          {statusLabels[control.status] || control.status}
                        </Badge>
                      </button>
                      {editingControl === control.id && (
                        <div className="absolute right-0 top-8 z-50 w-48 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl py-1 overflow-hidden">
                          {Object.entries(statusLabels).map(([key, label]) => (
                            <button
                              key={key}
                              onClick={() => updateControlStatus(control.id, key)}
                              disabled={updating}
                              className={cn(
                                "w-full px-3 py-2 text-left text-sm hover:bg-slate-800 transition-all flex items-center gap-2",
                                control.status === key ? "text-cyan-400 bg-cyan-500/5" : "text-slate-300"
                              )}
                            >
                              {React.createElement(statusIcons[key] || HelpCircle, {
                                className: cn("w-4 h-4", iconColors[key]),
                              })}
                              {label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
    </PageGate>
  );
}
