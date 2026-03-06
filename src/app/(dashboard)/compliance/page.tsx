"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
  Plus,
  X,
  Loader2,
  History,
  Settings2,
  User,
} from "lucide-react";
import { cn, complianceScoreColor } from "@/lib/utils";
import { PageGate } from "@/components/rbac/PageGate";
import { Gate } from "@/components/rbac/Gate";

// ── Interfaces ──────────────────────────────────────────────────────────────

interface ComplianceControl {
  id: string;
  controlId: string;
  title: string;
  description: string | null;
  category: string | null;
  status: string;
  evidence: string[];
  notes: string | null;
  assignedTo: string | null;
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

interface AssessmentHistoryItem {
  id: string;
  assessorName: string;
  assessorEmail: string | null;
  status: string;
  findings: string | null;
  evidence: string[];
  remediationPlan: string | null;
  dueDate: string | null;
  createdAt: string;
}

// ── Status Lookup Tables ────────────────────────────────────────────────────

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

const dotColors: Record<string, string> = {
  compliant: "bg-emerald-400",
  partially_compliant: "bg-yellow-400",
  non_compliant: "bg-red-400",
  not_assessed: "bg-slate-400",
  not_applicable: "bg-slate-500",
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

// ── Component ───────────────────────────────────────────────────────────────

export default function CompliancePage() {
  // Main data
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedFramework, setExpandedFramework] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  // Feature 1: Assessment Dialog
  const [assessDialogOpen, setAssessDialogOpen] = useState(false);
  const [assessControl, setAssessControl] = useState<ComplianceControl | null>(null);
  const [assessStatus, setAssessStatus] = useState("");
  const [assessNotes, setAssessNotes] = useState("");
  const [assessEvidence, setAssessEvidence] = useState<string[]>([]);
  const [assessEvidenceInput, setAssessEvidenceInput] = useState("");
  const [assessRemediation, setAssessRemediation] = useState("");
  const [assessDueDate, setAssessDueDate] = useState("");
  const [assessError, setAssessError] = useState("");

  // Feature 2: Assessment History
  const [expandedControlId, setExpandedControlId] = useState<string | null>(null);
  const [historyData, setHistoryData] = useState<AssessmentHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Feature 3: Export
  const [exportFramework, setExportFramework] = useState("all");

  // Feature 4: Framework Management
  const [manageOpen, setManageOpen] = useState(false);
  const [allFrameworks, setAllFrameworks] = useState<Framework[]>([]);
  const [manageSaving, setManageSaving] = useState<string | null>(null);

  // ── Data Loading ────────────────────────────────────────────────────────

  function loadData() {
    fetch("/api/compliance")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setFrameworks(data);
          if (data.length > 0 && !expandedFramework) setExpandedFramework(data[0].id);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadData();
  }, []);

  // ── Feature 1: Assessment Dialog Handlers ───────────────────────────────

  function openAssessDialog(control: ComplianceControl) {
    setAssessControl(control);
    setAssessStatus(control.status);
    setAssessNotes(control.notes || "");
    setAssessEvidence(control.evidence || []);
    setAssessEvidenceInput("");
    setAssessRemediation("");
    setAssessDueDate("");
    setAssessError("");
    setAssessDialogOpen(true);
  }

  function addEvidenceItem() {
    const trimmed = assessEvidenceInput.trim();
    if (trimmed && !assessEvidence.includes(trimmed)) {
      setAssessEvidence([...assessEvidence, trimmed]);
      setAssessEvidenceInput("");
    }
  }

  function removeEvidenceItem(index: number) {
    setAssessEvidence(assessEvidence.filter((_, i) => i !== index));
  }

  async function submitAssessment() {
    if (!assessControl) return;
    setUpdating(true);
    setAssessError("");
    try {
      const res = await fetch("/api/compliance/update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          controlId: assessControl.id,
          status: assessStatus,
          notes: assessNotes || undefined,
          evidence: assessEvidence.length > 0 ? assessEvidence : undefined,
          remediationPlan: assessRemediation || undefined,
          dueDate: assessDueDate || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setAssessError(err.error || "Failed to update");
        return;
      }
      setAssessDialogOpen(false);
      loadData();
      // Refresh history if this control was expanded
      if (expandedControlId === assessControl.id) {
        fetchHistory(assessControl.id);
      }
    } catch {
      setAssessError("Network error");
    } finally {
      setUpdating(false);
    }
  }

  // ── Feature 2: Assessment History ───────────────────────────────────────

  async function fetchHistory(controlId: string) {
    setHistoryLoading(true);
    setHistoryData([]);
    try {
      const res = await fetch(`/api/compliance/history?controlId=${controlId}`);
      if (res.ok) {
        const data = await res.json();
        setHistoryData(data.assessments || []);
      }
    } catch (error) {
      console.error("Failed to fetch history:", error);
    } finally {
      setHistoryLoading(false);
    }
  }

  function toggleControlExpand(controlId: string) {
    if (expandedControlId === controlId) {
      setExpandedControlId(null);
    } else {
      setExpandedControlId(controlId);
      fetchHistory(controlId);
    }
  }

  // ── Feature 3: Export ───────────────────────────────────────────────────

  function handleExport(format: "csv" | "json") {
    const params = new URLSearchParams({ format });
    if (exportFramework !== "all") params.set("framework", exportFramework);
    window.location.href = `/api/compliance/export?${params}`;
  }

  // ── Feature 4: Framework Management ─────────────────────────────────────

  function loadAllFrameworks() {
    fetch("/api/compliance?includeInactive=true")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setAllFrameworks(data);
      })
      .catch(console.error);
  }

  async function toggleFramework(fwId: string, isActive: boolean) {
    setManageSaving(fwId);
    try {
      const res = await fetch(`/api/compliance/frameworks/${fwId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (res.ok) {
        loadAllFrameworks();
        loadData();
      }
    } catch (error) {
      console.error("Failed to update framework:", error);
    } finally {
      setManageSaving(null);
    }
  }

  // ── Loading State ───────────────────────────────────────────────────────

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

  // ── Derived Data ────────────────────────────────────────────────────────

  const expandedFw = frameworks.find((fw) => fw.id === expandedFramework);
  const categories = expandedFw
    ? [...new Set(expandedFw.controls.map((c) => c.category).filter(Boolean))]
    : [];

  const filteredControls = expandedFw?.controls.filter(
    (c) => !categoryFilter || c.category === categoryFilter
  );

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <PageGate capability="compliance.view" title="Compliance">
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-7 h-7 text-emerald-400" />
            Compliance Center
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Track compliance across GDPR, PCI DSS, HIPAA, CIS, and NIST frameworks
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Feature 4: Manage Frameworks */}
          <Gate capability="compliance.manage">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { loadAllFrameworks(); setManageOpen(true); }}
            >
              <Settings2 className="w-4 h-4 mr-2" />
              Manage
            </Button>
          </Gate>

          {/* Feature 3: Export */}
          <Gate capability="compliance.export">
            <div className="flex items-center gap-2">
              <select
                value={exportFramework}
                onChange={(e) => setExportFramework(e.target.value)}
                className="h-9 px-3 rounded-lg bg-slate-800/50 border border-slate-700 text-sm text-white focus:outline-none focus:border-cyan-500/50"
              >
                <option value="all">All Frameworks</option>
                {frameworks.map((fw) => (
                  <option key={fw.id} value={fw.id}>{fw.name}</option>
                ))}
              </select>
              <Button variant="outline" size="sm" onClick={() => handleExport("csv")}>
                <Download className="w-4 h-4 mr-1" />
                CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleExport("json")}>
                <Download className="w-4 h-4 mr-1" />
                JSON
              </Button>
            </div>
          </Gate>
        </div>
      </div>

      {/* ── Summary Stats ───────────────────────────────────────────────── */}
      {frameworks.length > 0 && (() => {
        const totalControls = frameworks.reduce((sum, fw) => sum + fw.stats.total, 0);
        const totalCompliant = frameworks.reduce((sum, fw) => sum + fw.stats.compliant, 0);
        const totalPartial = frameworks.reduce((sum, fw) => sum + fw.stats.partial, 0);
        const totalNonCompliant = frameworks.reduce((sum, fw) => sum + fw.stats.nonCompliant, 0);
        const totalNotAssessed = frameworks.reduce((sum, fw) => sum + fw.stats.notAssessed, 0);
        const totalNotApplicable = frameworks.reduce((sum, fw) => sum + fw.stats.notApplicable, 0);
        const applicableTotal = totalControls - totalNotApplicable;
        const overallScore = applicableTotal > 0
          ? Math.round(((totalCompliant + totalPartial * 0.5) / applicableTotal) * 100)
          : 0;
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
            <Card className="bg-slate-900/50">
              <CardContent className="p-4 text-center">
                <p className={cn("text-2xl font-bold", complianceScoreColor(overallScore))}>{overallScore}%</p>
                <p className="text-[11px] text-slate-500 mt-1">Overall Score</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-900/50">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-white">{frameworks.length}</p>
                <p className="text-[11px] text-slate-500 mt-1">Frameworks</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-900/50">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-white">{totalControls}</p>
                <p className="text-[11px] text-slate-500 mt-1">Total Controls</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-900/50">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-emerald-400">{totalCompliant}</p>
                <p className="text-[11px] text-slate-500 mt-1">Compliant</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-900/50">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-red-400">{totalNonCompliant}</p>
                <p className="text-[11px] text-slate-500 mt-1">Non-Compliant</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-900/50">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-slate-400">{totalNotAssessed}</p>
                <p className="text-[11px] text-slate-500 mt-1">Not Assessed</p>
              </CardContent>
            </Card>
          </div>
        );
      })()}

      {/* ── Framework Cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
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
              setExpandedControlId(null);
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

      {/* ── Detailed Controls ───────────────────────────────────────────── */}
      {expandedFw && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
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
                const isExpanded = expandedControlId === control.id;
                return (
                  <div key={control.id}>
                    {/* Control Row */}
                    <div
                      className={cn(
                        "flex items-center gap-4 p-4 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 transition-all border cursor-pointer",
                        isExpanded ? "border-slate-600 bg-slate-800/50" : "border-transparent hover:border-slate-700"
                      )}
                      onClick={() => toggleControlExpand(control.id)}
                    >
                      {/* Chevron */}
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-slate-500 flex-shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" />
                      )}

                      {/* Status icon */}
                      <Icon className={cn("w-5 h-5 flex-shrink-0", iconColors[control.status])} />

                      {/* Control info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-cyan-400">{control.controlId}</span>
                          <span className="text-sm font-medium text-white">{control.title}</span>
                        </div>
                        {control.description && (
                          <p className="text-xs text-slate-500 mt-0.5 truncate">{control.description}</p>
                        )}
                      </div>

                      {/* Category badge */}
                      {control.category && (
                        <Badge variant="outline" className="text-[10px] hidden md:inline-flex">
                          {control.category}
                        </Badge>
                      )}

                      {/* Evidence count badge */}
                      {control.evidence && control.evidence.length > 0 && (
                        <Badge variant="info" className="text-[10px] hidden md:inline-flex">
                          <FileText className="w-3 h-3 mr-1" />
                          {control.evidence.length}
                        </Badge>
                      )}

                      {/* Status badge — clickable for users with compliance.assess */}
                      <Gate
                        capability="compliance.assess"
                        fallback={
                          <Badge variant={statusVariants[control.status] || "secondary"}>
                            {statusLabels[control.status] || control.status}
                          </Badge>
                        }
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openAssessDialog(control);
                          }}
                          className="cursor-pointer"
                          title="Click to assess this control"
                        >
                          <Badge variant={statusVariants[control.status] || "secondary"} className="hover:ring-2 hover:ring-cyan-500/30 transition-all">
                            {statusLabels[control.status] || control.status}
                          </Badge>
                        </button>
                      </Gate>
                    </div>

                    {/* Feature 2: Expanded Assessment History */}
                    {isExpanded && (
                      <div className="ml-8 mt-1 mb-2 p-4 rounded-lg bg-slate-900/80 border border-slate-800 space-y-3">
                        <h4 className="text-sm font-medium text-white flex items-center gap-2">
                          <History className="w-4 h-4 text-cyan-400" />
                          Assessment History
                        </h4>

                        {/* Control metadata */}
                        <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                          {control.lastAssessedAt && (
                            <span>Last assessed: {formatRelativeTime(control.lastAssessedAt)}</span>
                          )}
                          {control.nextReviewAt && (
                            <span>Next review: {new Date(control.nextReviewAt).toLocaleDateString()}</span>
                          )}
                          {control.notes && (
                            <span className="text-slate-400">Notes: {control.notes}</span>
                          )}
                        </div>

                        {/* Current evidence */}
                        {control.evidence && control.evidence.length > 0 && (
                          <div className="flex gap-1.5 flex-wrap">
                            {control.evidence.map((ev, i) => (
                              <Badge key={i} variant="outline" className="text-[10px]">
                                <FileText className="w-3 h-3 mr-1" />
                                {ev}
                              </Badge>
                            ))}
                          </div>
                        )}

                        {/* Timeline */}
                        {historyLoading ? (
                          <div className="flex items-center gap-2 py-4 justify-center">
                            <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                            <span className="text-xs text-slate-400">Loading history...</span>
                          </div>
                        ) : historyData.length === 0 ? (
                          <p className="text-xs text-slate-500 py-4 text-center">
                            No assessments recorded yet. Click the status badge to create the first assessment.
                          </p>
                        ) : (
                          <div className="space-y-0">
                            {historyData.map((entry, idx) => (
                              <div key={entry.id} className="flex gap-3 text-xs">
                                {/* Timeline connector */}
                                <div className="flex flex-col items-center">
                                  <div className={cn(
                                    "w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0",
                                    dotColors[entry.status] || "bg-slate-400"
                                  )} />
                                  {idx < historyData.length - 1 && (
                                    <div className="w-px flex-1 bg-slate-700 mt-1" />
                                  )}
                                </div>

                                {/* Entry content */}
                                <div className="flex-1 pb-4">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-slate-300 font-medium flex items-center gap-1">
                                      <User className="w-3 h-3 text-slate-500" />
                                      {entry.assessorName}
                                    </span>
                                    <Badge variant={statusVariants[entry.status] || "secondary"} className="text-[10px]">
                                      {statusLabels[entry.status] || entry.status}
                                    </Badge>
                                    <span className="text-slate-500">
                                      {formatRelativeTime(entry.createdAt)}
                                    </span>
                                  </div>
                                  {entry.findings && (
                                    <p className="text-slate-400 mt-1">{entry.findings}</p>
                                  )}
                                  {entry.evidence.length > 0 && (
                                    <div className="flex gap-1 flex-wrap mt-1">
                                      {entry.evidence.map((ev, i) => (
                                        <Badge key={i} variant="outline" className="text-[10px]">
                                          <FileText className="w-3 h-3 mr-1" />
                                          {ev}
                                        </Badge>
                                      ))}
                                    </div>
                                  )}
                                  {entry.remediationPlan && (
                                    <p className="text-amber-400/70 mt-1 text-[11px]">
                                      Remediation: {entry.remediationPlan}
                                    </p>
                                  )}
                                  {entry.dueDate && (
                                    <p className="text-slate-500 mt-0.5 text-[11px]">
                                      Due: {new Date(entry.dueDate).toLocaleDateString()}
                                    </p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Feature 1: Assessment Dialog ─────────────────────────────────── */}
      <Dialog open={assessDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setAssessControl(null);
          setAssessError("");
        }
        setAssessDialogOpen(open);
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {assessControl && React.createElement(
                statusIcons[assessControl.status] || HelpCircle,
                { className: cn("w-5 h-5", iconColors[assessControl?.status || ""]) }
              )}
              Assess Control
            </DialogTitle>
            <DialogDescription>
              {assessControl && (
                <span className="text-cyan-400 font-mono">{assessControl.controlId}</span>
              )}
              {" "}{assessControl?.title}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Status */}
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1 block">Status</label>
              <select
                value={assessStatus}
                onChange={(e) => setAssessStatus(e.target.value)}
                className="w-full h-10 px-3 rounded-lg bg-slate-800/50 border border-slate-700 text-sm text-white focus:outline-none focus:border-cyan-500/50"
              >
                {Object.entries(statusLabels).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>

            {/* Findings / Notes */}
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1 block">Findings / Notes</label>
              <textarea
                value={assessNotes}
                onChange={(e) => setAssessNotes(e.target.value)}
                placeholder="Describe assessment findings, observations, or rationale..."
                rows={3}
                className="w-full px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 resize-none"
              />
            </div>

            {/* Evidence References */}
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1 block">
                Evidence References
              </label>
              <p className="text-[11px] text-slate-500 mb-2">
                Add references to supporting documents, reports, or URLs.
              </p>
              <div className="flex gap-2">
                <Input
                  value={assessEvidenceInput}
                  onChange={(e) => setAssessEvidenceInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addEvidenceItem(); } }}
                  placeholder="e.g. SOC2 Report Q3 2025"
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addEvidenceItem}
                  disabled={!assessEvidenceInput.trim()}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {assessEvidence.length > 0 && (
                <div className="flex gap-1.5 flex-wrap mt-2">
                  {assessEvidence.map((item, i) => (
                    <Badge key={i} variant="outline" className="text-[10px] gap-1 pr-1">
                      <FileText className="w-3 h-3" />
                      {item}
                      <button onClick={() => removeEvidenceItem(i)} className="ml-1 hover:text-red-400">
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Remediation Plan — shown for non-compliant / partial */}
            {(assessStatus === "non_compliant" || assessStatus === "partially_compliant") && (
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1 block">
                  Remediation Plan <span className="text-slate-600">(optional)</span>
                </label>
                <textarea
                  value={assessRemediation}
                  onChange={(e) => setAssessRemediation(e.target.value)}
                  placeholder="Describe steps to achieve compliance..."
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 resize-none"
                />
              </div>
            )}

            {/* Due Date */}
            {(assessStatus === "non_compliant" || assessStatus === "partially_compliant") && (
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1 block">
                  Remediation Due Date <span className="text-slate-600">(optional)</span>
                </label>
                <Input
                  type="date"
                  value={assessDueDate}
                  onChange={(e) => setAssessDueDate(e.target.value)}
                  className="w-full"
                />
              </div>
            )}

            {/* Error */}
            {assessError && (
              <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {assessError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAssessDialogOpen(false)} disabled={updating}>
              Cancel
            </Button>
            <Button onClick={submitAssessment} disabled={updating}>
              {updating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Submit Assessment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Feature 4: Manage Frameworks Dialog ──────────────────────────── */}
      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-cyan-400" />
              Manage Frameworks
            </DialogTitle>
            <DialogDescription>
              Toggle frameworks on or off. Deactivated frameworks are hidden from the
              main view but all data is preserved.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {allFrameworks.map((fw) => (
              <div
                key={fw.id}
                className="flex items-center justify-between p-3 rounded-lg bg-slate-800/30 border border-slate-700/50"
              >
                <div>
                  <p className="text-sm font-medium text-white">{fw.name}</p>
                  <p className="text-xs text-slate-500">
                    v{fw.version} &middot; {fw.stats.total} controls &middot; {fw.stats.score}% score
                  </p>
                </div>
                <button
                  onClick={() => toggleFramework(fw.id, !fw.isActive)}
                  disabled={manageSaving === fw.id}
                  className={cn(
                    "relative w-11 h-6 rounded-full transition-colors flex-shrink-0",
                    fw.isActive ? "bg-emerald-500" : "bg-slate-600"
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform",
                      fw.isActive && "translate-x-5"
                    )}
                  />
                </button>
              </div>
            ))}
            {allFrameworks.length === 0 && (
              <p className="text-xs text-slate-500 text-center py-4">
                No frameworks found.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManageOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </PageGate>
  );
}
