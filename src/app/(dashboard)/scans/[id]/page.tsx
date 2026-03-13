"use client";

import { useEffect, useState, useCallback, useMemo, use } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Scan,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Shield,
  Download,
  Play,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Server,
  Monitor,
  Wifi,
  LayoutList,
  LayoutGrid,
  Square,
  CheckSquare,
  Info,
} from "lucide-react";
import { cn, formatDateTime, severityColor } from "@/lib/utils";
import { PageGate } from "@/components/rbac/PageGate";
import { Gate } from "@/components/rbac/Gate";
import Link from "next/link";

interface AssetInfo {
  id: string;
  name: string;
  ipAddress: string | null;
  hostname: string | null;
  os: string | null;
  status: string;
  type: string;
  criticality: string;
  openPorts: number[] | null;
  services: unknown[] | null;
}

interface ScanDetail {
  id: string;
  name: string;
  type: string;
  status: string;
  targets: string[];
  progress: {
    completedChecks: string[];
    currentBatch: number;
    totalBatches: number;
    totalFindings: number;
    checkResults: Record<string, number>;
  };
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  resultsCount: number;
  severityCounts: Record<string, number>;
}

interface Finding {
  id: string;
  severity: string;
  title: string;
  description: string | null;
  cveId: string | null;
  cvssScore: number | null;
  status: string;
  remediation: string | null;
  details: Record<string, unknown>;
  asset: AssetInfo | null;
  createdAt: string;
}

interface HostGroup {
  assetId: string | null;
  name: string;
  ipAddress: string | null;
  hostname: string | null;
  os: string | null;
  status: string;
  type: string;
  findings: Finding[];
  severityCounts: Record<string, number>;
}

const typeLabels: Record<string, string> = {
  vulnerability: "Vulnerability Scan",
  port: "Port Scan",
  compliance: "Compliance Scan",
  full: "Full Assessment",
  discovery: "Asset Discovery",
  enterprise: "Enterprise Scan",
};

const statusConfig: Record<string, { icon: React.ElementType; color: string; badge: "success" | "warning" | "destructive" | "secondary" | "default" }> = {
  completed: { icon: CheckCircle2, color: "text-emerald-400", badge: "success" },
  running: { icon: Loader2, color: "text-cyan-400", badge: "default" },
  queued: { icon: Clock, color: "text-yellow-400", badge: "warning" },
  failed: { icon: XCircle, color: "text-red-400", badge: "destructive" },
  cancelled: { icon: XCircle, color: "text-slate-400", badge: "secondary" },
};

const severityIcons: Record<string, { color: string; bg: string }> = {
  critical: { color: "text-red-400", bg: "bg-red-500/20" },
  high: { color: "text-orange-400", bg: "bg-orange-500/20" },
  medium: { color: "text-yellow-400", bg: "bg-yellow-500/20" },
  low: { color: "text-blue-400", bg: "bg-blue-500/20" },
  info: { color: "text-slate-400", bg: "bg-slate-500/20" },
};

function getHostIcon(type: string) {
  switch (type) {
    case "server": return Server;
    case "network_device": return Wifi;
    default: return Monitor;
  }
}

export default function ScanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [scan, setScan] = useState<ScanDetail | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [expandedFinding, setExpandedFinding] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grouped" | "flat">("grouped");
  const [expandedHosts, setExpandedHosts] = useState<Set<string>>(new Set());

  // Onboarding state
  const [onboardMode, setOnboardMode] = useState(false);
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
  const [onboarding, setOnboarding] = useState(false);
  const [onboardSuccess, setOnboardSuccess] = useState<string | null>(null);

  const loadScan = useCallback(async () => {
    try {
      const res = await fetch(`/api/scans/${id}`);
      if (res.ok) {
        const data = await res.json();
        setScan(data);
      }
    } catch (err) {
      console.error("Failed to load scan:", err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadFindings = useCallback(async () => {
    try {
      const res = await fetch(`/api/scans/${id}/results?limit=100`);
      if (res.ok) {
        const data = await res.json();
        setFindings(data.results || []);
      }
    } catch (err) {
      console.error("Failed to load findings:", err);
    }
  }, [id]);

  useEffect(() => {
    loadScan();
    loadFindings();
  }, [loadScan, loadFindings]);

  // Group findings by host
  const hostGroups = useMemo(() => {
    const groups = new Map<string, HostGroup>();
    for (const f of findings) {
      const key = f.asset?.id || f.asset?.name || "unknown";
      if (!groups.has(key)) {
        groups.set(key, {
          assetId: f.asset?.id || null,
          name: f.asset?.name || "Unknown Host",
          ipAddress: f.asset?.ipAddress || null,
          hostname: f.asset?.hostname || null,
          os: f.asset?.os || null,
          status: f.asset?.status || "unknown",
          type: f.asset?.type || "server",
          findings: [],
          severityCounts: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
        });
      }
      const group = groups.get(key)!;
      group.findings.push(f);
      group.severityCounts[f.severity] = (group.severityCounts[f.severity] || 0) + 1;
    }
    return Array.from(groups.values());
  }, [findings]);

  // Count discovered hosts
  const discoveredHosts = useMemo(
    () => hostGroups.filter((h) => h.status === "discovered"),
    [hostGroups]
  );

  // Auto-expand all hosts on first load
  useEffect(() => {
    if (hostGroups.length > 0 && expandedHosts.size === 0) {
      setExpandedHosts(new Set(hostGroups.map((h) => h.assetId || h.name)));
    }
  }, [hostGroups, expandedHosts.size]);

  async function handleExecute() {
    setExecuting(true);
    try {
      let status = "running";
      while (status === "running") {
        const res = await fetch(`/api/scans/${id}/execute`, { method: "POST" });
        if (!res.ok) break;
        const result = await res.json();
        status = result.status;
        await loadScan();
        if (status === "running") {
          await loadFindings();
        }
      }
      await loadScan();
      await loadFindings();
    } catch (err) {
      console.error("Execution error:", err);
    } finally {
      setExecuting(false);
    }
  }

  async function handleUpdateFindingStatus(findingId: string, newStatus: string) {
    setUpdatingStatus(findingId);
    try {
      const res = await fetch(`/api/scans/${id}/results/${findingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setFindings((prev) =>
          prev.map((f) => (f.id === findingId ? { ...f, status: newStatus } : f))
        );
        await loadScan();
      }
    } catch (err) {
      console.error("Update error:", err);
    } finally {
      setUpdatingStatus(null);
    }
  }

  async function handleOnboard() {
    if (selectedAssets.size === 0) return;
    setOnboarding(true);
    try {
      const res = await fetch(`/api/scans/${id}/onboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetIds: Array.from(selectedAssets) }),
      });
      if (res.ok) {
        const data = await res.json();
        setOnboardSuccess(`${data.onboarded} asset${data.onboarded !== 1 ? "s" : ""} onboarded to inventory`);
        setOnboardMode(false);
        setSelectedAssets(new Set());
        // Reload to get updated statuses
        await loadFindings();
        setTimeout(() => setOnboardSuccess(null), 5000);
      }
    } catch (err) {
      console.error("Onboard error:", err);
    } finally {
      setOnboarding(false);
    }
  }

  function toggleHost(hostKey: string) {
    setExpandedHosts((prev) => {
      const next = new Set(prev);
      if (next.has(hostKey)) {
        next.delete(hostKey);
      } else {
        next.add(hostKey);
      }
      return next;
    });
  }

  function toggleAssetSelection(assetId: string) {
    setSelectedAssets((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }
      return next;
    });
  }

  function selectAllDiscovered() {
    const allIds = discoveredHosts.filter((h) => h.assetId).map((h) => h.assetId!);
    setSelectedAssets(new Set(allIds));
  }

  function deselectAll() {
    setSelectedAssets(new Set());
  }

  const progressPercent = scan?.progress?.totalBatches
    ? Math.round((scan.progress.currentBatch / scan.progress.totalBatches) * 100)
    : 0;

  // Render a single finding row
  function renderFinding(finding: Finding) {
    const isExpanded = expandedFinding === finding.id;
    const sevConfig = severityIcons[finding.severity] || severityIcons.info;

    return (
      <div key={finding.id} className="rounded-lg border border-transparent hover:border-slate-700 transition-all">
        <div
          className="flex items-center gap-3 p-3 cursor-pointer hover:bg-slate-800/30"
          onClick={() => setExpandedFinding(isExpanded ? null : finding.id)}
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-slate-500 flex-shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" />
          )}
          <div className={cn("w-2 h-2 rounded-full flex-shrink-0", sevConfig.bg, sevConfig.color)} />
          <Badge variant="outline" className={cn("text-[10px] flex-shrink-0 w-16 justify-center", severityColor(finding.severity))}>
            {finding.severity}
          </Badge>
          <span className="text-sm text-white flex-1 min-w-0 truncate">{finding.title}</span>
          {finding.cveId && (
            <span className="text-xs text-cyan-400 font-mono flex-shrink-0">{finding.cveId}</span>
          )}
          {finding.cvssScore != null && finding.cvssScore > 0 && (
            <span className="text-xs text-slate-400 flex-shrink-0">
              CVSS: {finding.cvssScore.toFixed(1)}
            </span>
          )}
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] flex-shrink-0",
              finding.status === "open" ? "text-orange-400 border-orange-500/30" :
              finding.status === "resolved" ? "text-emerald-400 border-emerald-500/30" :
              "text-slate-400 border-slate-500/30"
            )}
          >
            {finding.status}
          </Badge>
        </div>

        {isExpanded && (
          <div className="px-12 pb-4 space-y-3">
            {finding.description && (
              <div>
                <p className="text-xs text-slate-500 mb-1">Description</p>
                <p className="text-sm text-slate-300">{finding.description}</p>
              </div>
            )}
            {finding.remediation && (
              <div>
                <p className="text-xs text-slate-500 mb-1">Remediation</p>
                <p className="text-sm text-emerald-300">{finding.remediation}</p>
              </div>
            )}
            {finding.cveId && (
              <div>
                <p className="text-xs text-slate-500 mb-1">CVE Reference</p>
                <a
                  href={`https://nvd.nist.gov/vuln/detail/${finding.cveId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-cyan-400 hover:underline inline-flex items-center gap-1"
                >
                  {finding.cveId} <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
            {finding.asset && (
              <div>
                <p className="text-xs text-slate-500 mb-1">Affected Asset</p>
                <Link
                  href={`/assets/${finding.asset.id}`}
                  className="text-sm text-cyan-400 hover:underline"
                >
                  {finding.asset.name} {finding.asset.ipAddress ? `(${finding.asset.ipAddress})` : ""}
                </Link>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              {finding.status === "open" && (
                <>
                  <Button size="sm" variant="outline" disabled={updatingStatus === finding.id}
                    onClick={(e) => { e.stopPropagation(); handleUpdateFindingStatus(finding.id, "acknowledged"); }}>
                    Acknowledge
                  </Button>
                  <Button size="sm" variant="outline" disabled={updatingStatus === finding.id}
                    onClick={(e) => { e.stopPropagation(); handleUpdateFindingStatus(finding.id, "resolved"); }}>
                    Resolve
                  </Button>
                  <Button size="sm" variant="outline" disabled={updatingStatus === finding.id}
                    onClick={(e) => { e.stopPropagation(); handleUpdateFindingStatus(finding.id, "false_positive"); }}>
                    False Positive
                  </Button>
                </>
              )}
              {finding.status !== "open" && (
                <Button size="sm" variant="outline" disabled={updatingStatus === finding.id}
                  onClick={(e) => { e.stopPropagation(); handleUpdateFindingStatus(finding.id, "open"); }}>
                  Reopen
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <PageGate capability="scan.view" title="Scan Detail">
      {loading ? (
        <div className="flex items-center justify-center h-full">
          <div className="w-12 h-12 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin" />
        </div>
      ) : !scan ? (
        <div className="text-center py-20 text-slate-500">Scan not found.</div>
      ) : (
        <div className="space-y-6 max-w-[1600px] mx-auto">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <Link href="/scans" className="text-sm text-slate-400 hover:text-slate-300 flex items-center gap-1 mb-2">
                <ArrowLeft className="w-4 h-4" /> Back to Scans
              </Link>
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                <Scan className="w-7 h-7 text-cyan-400" />
                {scan.name}
              </h1>
              <div className="flex items-center gap-3 mt-2">
                <Badge variant="outline">{typeLabels[scan.type] || scan.type}</Badge>
                <Badge variant={statusConfig[scan.status]?.badge || "secondary"}>
                  {scan.status}
                </Badge>
                <span className="text-xs text-slate-500">
                  Created {formatDateTime(scan.createdAt)}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              {(scan.status === "queued" || scan.status === "running") && (
                <Button onClick={handleExecute} disabled={executing}>
                  {executing ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Scanning...</>
                  ) : (
                    <><Play className="w-4 h-4 mr-1" /> {scan.status === "running" ? "Resume" : "Execute"}</>
                  )}
                </Button>
              )}
              {scan.status === "completed" && (
                <Button
                  variant="outline"
                  onClick={() => window.open(`/api/scans/${id}/export?format=csv`, "_blank")}
                >
                  <Download className="w-4 h-4 mr-1" /> Export CSV
                </Button>
              )}
            </div>
          </div>

          {/* Progress Bar (during execution) */}
          {(scan.status === "running" || executing) && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-300">Scan Progress</span>
                  <span className="text-sm text-cyan-400 font-mono">{progressPercent}%</span>
                </div>
                <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-cyan-500 rounded-full transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Batch {scan.progress.currentBatch} of {scan.progress.totalBatches} |{" "}
                  {scan.progress.completedChecks.length} checks completed |{" "}
                  {scan.progress.totalFindings} findings so far
                </p>
              </CardContent>
            </Card>
          )}

          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {(["critical", "high", "medium", "low", "info"] as const).map((sev) => {
              const count = scan.severityCounts[sev] || 0;
              const config = severityIcons[sev];
              return (
                <Card key={sev} className="stat-card">
                  <CardContent className="p-4 text-center">
                    <div className={cn("inline-flex items-center justify-center w-10 h-10 rounded-full mb-2", config.bg)}>
                      <Shield className={cn("w-5 h-5", config.color)} />
                    </div>
                    <p className="text-2xl font-bold text-white">{count}</p>
                    <p className="text-xs text-slate-400 capitalize">{sev}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Scan Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Scan Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-slate-500">Targets</p>
                  <div className="mt-1 space-y-1">
                    {scan.targets.map((t, i) => (
                      <p key={i} className="text-white font-mono text-xs">{t}</p>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-slate-500">Started</p>
                  <p className="text-white mt-1">{scan.startedAt ? formatDateTime(scan.startedAt) : "Not started"}</p>
                </div>
                <div>
                  <p className="text-slate-500">Completed</p>
                  <p className="text-white mt-1">{scan.completedAt ? formatDateTime(scan.completedAt) : "—"}</p>
                </div>
                <div>
                  <p className="text-slate-500">Total Findings</p>
                  <p className="text-white mt-1 text-lg font-semibold">{scan.resultsCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Onboarding Banner */}
          {scan.status === "completed" && discoveredHosts.length > 0 && !onboardMode && (
            <Gate capability="asset.create">
              <Card className="border-amber-500/30 bg-amber-500/5">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                      <Info className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                      <p className="text-sm text-white font-medium">
                        {discoveredHosts.length} discovered host{discoveredHosts.length !== 1 ? "s" : ""} not yet in your asset inventory
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Select which hosts to onboard as managed assets
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={() => {
                      setOnboardMode(true);
                      selectAllDiscovered();
                    }}
                    className="bg-amber-600 hover:bg-amber-500 text-white"
                  >
                    <CheckSquare className="w-4 h-4 mr-1" />
                    Select &amp; Onboard
                  </Button>
                </CardContent>
              </Card>
            </Gate>
          )}

          {/* Onboard Success */}
          {onboardSuccess && (
            <Card className="border-emerald-500/30 bg-emerald-500/5">
              <CardContent className="p-4 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <p className="text-sm text-emerald-300">{onboardSuccess}</p>
              </CardContent>
            </Card>
          )}

          {/* Findings Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-orange-400" />
                  Findings ({findings.length})
                  {hostGroups.length > 0 && (
                    <span className="text-xs text-slate-500 font-normal ml-2">
                      across {hostGroups.length} host{hostGroups.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </CardTitle>
                <div className="flex items-center gap-2">
                  {/* View mode toggle */}
                  <div className="flex rounded-md border border-slate-700 overflow-hidden">
                    <button
                      onClick={() => setViewMode("grouped")}
                      className={cn(
                        "px-3 py-1.5 text-xs flex items-center gap-1 transition-colors",
                        viewMode === "grouped"
                          ? "bg-slate-700 text-white"
                          : "text-slate-400 hover:text-slate-300"
                      )}
                    >
                      <LayoutGrid className="w-3.5 h-3.5" /> Grouped
                    </button>
                    <button
                      onClick={() => setViewMode("flat")}
                      className={cn(
                        "px-3 py-1.5 text-xs flex items-center gap-1 transition-colors",
                        viewMode === "flat"
                          ? "bg-slate-700 text-white"
                          : "text-slate-400 hover:text-slate-300"
                      )}
                    >
                      <LayoutList className="w-3.5 h-3.5" /> Flat
                    </button>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Onboard mode toolbar */}
              {onboardMode && (
                <div className="flex items-center justify-between mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-amber-300">
                      {selectedAssets.size} host{selectedAssets.size !== 1 ? "s" : ""} selected
                    </span>
                    <button
                      onClick={selectAllDiscovered}
                      className="text-xs text-cyan-400 hover:text-cyan-300"
                    >
                      Select All
                    </button>
                    <button
                      onClick={deselectAll}
                      className="text-xs text-slate-400 hover:text-slate-300"
                    >
                      Deselect All
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setOnboardMode(false);
                        setSelectedAssets(new Set());
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleOnboard}
                      disabled={selectedAssets.size === 0 || onboarding}
                      className="bg-emerald-600 hover:bg-emerald-500"
                    >
                      {onboarding ? (
                        <><Loader2 className="w-3 h-3 animate-spin mr-1" /> Onboarding...</>
                      ) : (
                        <>Onboard {selectedAssets.size} Asset{selectedAssets.size !== 1 ? "s" : ""}</>
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* ---- GROUPED VIEW ---- */}
              {viewMode === "grouped" && hostGroups.length > 0 && (
                <div className="space-y-3">
                  {hostGroups.map((host) => {
                    const hostKey = host.assetId || host.name;
                    const isExpanded = expandedHosts.has(hostKey);
                    const HostIcon = getHostIcon(host.type);
                    const isDiscovered = host.status === "discovered";
                    const isSelected = host.assetId ? selectedAssets.has(host.assetId) : false;

                    return (
                      <div key={hostKey} className="rounded-lg border border-slate-700/50 overflow-hidden">
                        {/* Host header */}
                        <div
                          className={cn(
                            "flex items-center gap-3 p-3 cursor-pointer transition-colors",
                            isExpanded ? "bg-slate-800/50" : "hover:bg-slate-800/30"
                          )}
                          onClick={() => toggleHost(hostKey)}
                        >
                          {/* Onboard checkbox */}
                          {onboardMode && isDiscovered && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (host.assetId) toggleAssetSelection(host.assetId);
                              }}
                              className="flex-shrink-0"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-5 h-5 text-cyan-400" />
                              ) : (
                                <Square className="w-5 h-5 text-slate-500" />
                              )}
                            </button>
                          )}
                          {onboardMode && !isDiscovered && (
                            <div className="w-5 flex-shrink-0" />
                          )}

                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-slate-500 flex-shrink-0" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" />
                          )}

                          <div className="w-8 h-8 rounded-lg bg-slate-700/50 flex items-center justify-center flex-shrink-0">
                            <HostIcon className="w-4 h-4 text-cyan-400" />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-white font-mono font-medium">
                                {host.ipAddress || host.hostname || host.name}
                              </span>
                              {host.hostname && host.ipAddress && (
                                <span className="text-xs text-slate-500">({host.hostname})</span>
                              )}
                              {host.os && (
                                <Badge variant="outline" className="text-[10px] text-slate-400">
                                  {host.os}
                                </Badge>
                              )}
                            </div>
                          </div>

                          {/* Severity pills */}
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {(["critical", "high", "medium", "low", "info"] as const).map((sev) => {
                              const count = host.severityCounts[sev] || 0;
                              if (count === 0) return null;
                              const config = severityIcons[sev];
                              return (
                                <span
                                  key={sev}
                                  className={cn(
                                    "inline-flex items-center justify-center text-[10px] font-bold rounded-full w-6 h-6",
                                    config.bg, config.color
                                  )}
                                  title={`${count} ${sev}`}
                                >
                                  {count}
                                </span>
                              );
                            })}
                          </div>

                          {/* Status badge */}
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] flex-shrink-0",
                              isDiscovered
                                ? "text-amber-400 border-amber-500/30"
                                : "text-emerald-400 border-emerald-500/30"
                            )}
                          >
                            {isDiscovered ? "Discovered" : "Managed"}
                          </Badge>

                          <span className="text-xs text-slate-500 flex-shrink-0">
                            {host.findings.length} finding{host.findings.length !== 1 ? "s" : ""}
                          </span>
                        </div>

                        {/* Nested findings */}
                        {isExpanded && (
                          <div className="border-t border-slate-700/30 pl-4">
                            <div className="space-y-0.5">
                              {host.findings.map((f) => renderFinding(f))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ---- FLAT VIEW ---- */}
              {viewMode === "flat" && (
                <div className="space-y-1">
                  {findings.map((finding) => renderFinding(finding))}
                </div>
              )}

              {/* Empty states */}
              {findings.length === 0 && scan.status === "completed" && (
                <div className="text-center py-12 text-slate-500">
                  <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-50 text-emerald-400" />
                  <p>No vulnerabilities found. The target appears secure.</p>
                </div>
              )}
              {findings.length === 0 && scan.status !== "completed" && (
                <div className="text-center py-12 text-slate-500">
                  <Scan className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No findings yet. Execute the scan to start.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </PageGate>
  );
}
