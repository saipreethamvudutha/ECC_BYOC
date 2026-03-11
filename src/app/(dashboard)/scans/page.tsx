"use client";

import { useEffect, useState } from "react";
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
  Scan,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  Plus,
  RefreshCw,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils";
import { PageGate } from "@/components/rbac/PageGate";
import { Gate } from "@/components/rbac/Gate";
import { useRouter } from "next/navigation";

interface ScanItem {
  id: string;
  name: string;
  type: string;
  status: string;
  targets: string[];
  resultsCount: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

const statusConfig: Record<string, { icon: React.ElementType; color: string; badge: "success" | "warning" | "destructive" | "secondary" | "default" }> = {
  completed: { icon: CheckCircle2, color: "text-emerald-400", badge: "success" },
  running: { icon: Loader2, color: "text-cyan-400", badge: "default" },
  queued: { icon: Clock, color: "text-yellow-400", badge: "warning" },
  failed: { icon: XCircle, color: "text-red-400", badge: "destructive" },
  cancelled: { icon: XCircle, color: "text-slate-400", badge: "secondary" },
};

const typeLabels: Record<string, string> = {
  vulnerability: "Vulnerability Scan",
  port: "Port Scan",
  compliance: "Compliance Scan",
  full: "Full Assessment",
  discovery: "Asset Discovery",
};

const PAGE_SIZE = 20;

export default function ScansPage() {
  const [scans, setScans] = useState<ScanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewScan, setShowNewScan] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const router = useRouter();
  const [scanForm, setScanForm] = useState({
    name: "",
    type: "vulnerability",
    targets: "",
  });

  function loadScans() {
    fetch("/api/scans")
      .then((res) => {
        if (!res.ok) return [];
        return res.json();
      })
      .then((data) => setScans(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadScans();
    // Auto-refresh every 15s to pick up running scan status changes
    const interval = setInterval(loadScans, 15000);
    return () => clearInterval(interval);
  }, []);

  // Pagination
  const totalPages = Math.ceil(scans.length / PAGE_SIZE);
  const paginatedScans = scans.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  async function handleDeleteScan(scanId: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Delete this scan and all its findings? This cannot be undone.")) return;
    setDeleting(scanId);
    try {
      const res = await fetch(`/api/scans/${scanId}`, { method: "DELETE" });
      if (res.ok) loadScans();
    } catch (error) {
      console.error("Delete scan error:", error);
    } finally {
      setDeleting(null);
    }
  }

  async function handleCreateScan() {
    if (!scanForm.name || !scanForm.targets) return;
    setCreating(true);

    try {
      const res = await fetch("/api/scans/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: scanForm.name,
          type: scanForm.type,
          targets: scanForm.targets.split(",").map((t) => t.trim()),
        }),
      });

      if (res.ok) {
        setShowNewScan(false);
        setScanForm({ name: "", type: "vulnerability", targets: "" });
        loadScans();
        // Auto-refresh to pick up scan completion
        setTimeout(loadScans, 3000);
        setTimeout(loadScans, 8000);
      }
    } catch (error) {
      console.error("Create scan error:", error);
    } finally {
      setCreating(false);
    }
  }

  return (
    <PageGate capability="scan.view" title="Scans">
    {loading ? (
      <div className="flex items-center justify-center h-full">
        <div className="w-12 h-12 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin" />
      </div>
    ) : (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Scan className="w-7 h-7 text-cyan-400" />
            Scans
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Manage vulnerability scans and security assessments
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadScans}>
            <RefreshCw className="w-4 h-4 mr-1" />
            Refresh
          </Button>
          <Gate capability="scan.create">
            <Button onClick={() => setShowNewScan(true)}>
              <Plus className="w-4 h-4 mr-2" />
              New Scan
            </Button>
          </Gate>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "Total Scans", value: scans.length, icon: Scan, color: "text-cyan-400" },
          { label: "Running", value: scans.filter(s => s.status === "running" || s.status === "queued").length, icon: Loader2, color: "text-yellow-400" },
          { label: "Completed", value: scans.filter(s => s.status === "completed").length, icon: CheckCircle2, color: "text-emerald-400" },
          { label: "Total Findings", value: scans.reduce((sum, s) => sum + s.resultsCount, 0), icon: AlertTriangle, color: "text-orange-400" },
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

      {/* Scan list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scan History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {paginatedScans.map((scan) => {
              const config = statusConfig[scan.status] || statusConfig.queued;
              const StatusIcon = config.icon;
              return (
                <div
                  key={scan.id}
                  onClick={() => router.push(`/scans/${scan.id}`)}
                  className="flex items-center gap-4 p-4 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 transition-all cursor-pointer border border-transparent hover:border-slate-700"
                >
                  <StatusIcon className={cn("w-5 h-5 flex-shrink-0", config.color, scan.status === "running" && "animate-spin")} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{scan.name}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {typeLabels[scan.type] || scan.type}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Targets: {scan.targets.join(", ")} | {scan.resultsCount} findings
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0 flex items-center gap-3">
                    <div>
                      <Badge variant={config.badge}>{scan.status}</Badge>
                      <p className="text-[10px] text-slate-500 mt-1">
                        {scan.completedAt
                          ? formatDateTime(scan.completedAt)
                          : scan.startedAt
                          ? `Started ${formatDateTime(scan.startedAt)}`
                          : formatDateTime(scan.createdAt)}
                      </p>
                    </div>
                    <Gate capability="scan.create">
                      <button
                        className="p-1.5 rounded hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-colors"
                        title="Delete scan"
                        onClick={(e) => handleDeleteScan(scan.id, e)}
                        disabled={deleting === scan.id}
                      >
                        {deleting === scan.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    </Gate>
                  </div>
                </div>
              );
            })}
            {scans.length === 0 && (
              <div className="text-center py-12 text-slate-500">
                <Scan className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No scans yet. Run your first security scan.</p>
              </div>
            )}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-slate-800">
              <p className="text-xs text-slate-500">
                Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, scans.length)} of {scans.length} scans
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm text-slate-400">Page {currentPage} of {totalPages}</span>
                <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* New Scan Dialog */}
      <Dialog open={showNewScan} onOpenChange={setShowNewScan}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Scan</DialogTitle>
            <DialogDescription>
              Configure and launch a new security scan against your assets.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Scan Name</label>
              <Input
                placeholder="e.g., Weekly Vulnerability Scan"
                value={scanForm.name}
                onChange={(e) => setScanForm({ ...scanForm, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Scan Type</label>
              <div className="grid grid-cols-2 gap-2">
                {(["vulnerability", "port", "compliance", "full", "discovery"] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setScanForm({ ...scanForm, type })}
                    className={cn(
                      "p-3 rounded-lg border text-sm text-left transition-all",
                      scanForm.type === type
                        ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-400"
                        : "border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300"
                    )}
                  >
                    <span className="font-medium">{typeLabels[type]}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Targets</label>
              <Input
                placeholder="e.g., 10.0.1.0/24, 10.0.2.0/24"
                value={scanForm.targets}
                onChange={(e) => setScanForm({ ...scanForm, targets: e.target.value })}
              />
              <p className="text-xs text-slate-500">Comma-separated IP addresses or CIDR ranges</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewScan(false)}>Cancel</Button>
            <Button onClick={handleCreateScan} disabled={creating || !scanForm.name || !scanForm.targets}>
              {creating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Scan className="w-4 h-4" />
                  Launch Scan
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    )}
    </PageGate>
  );
}
