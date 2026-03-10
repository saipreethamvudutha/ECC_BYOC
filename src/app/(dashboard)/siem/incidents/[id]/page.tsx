"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Siren, User, Server, Clock, AlertTriangle,
  Shield, FileText, Link2, CheckCircle, XCircle,
} from "lucide-react";
import { cn, formatDateTime, formatRelativeTime } from "@/lib/utils";
import { PageGate } from "@/components/rbac/PageGate";
import { MitreTag } from "../../components/MitreTag";
import { TimelineView } from "../../components/TimelineView";
import { useCapabilities } from "@/hooks/useCapabilities";

/* eslint-disable @typescript-eslint/no-explicit-any */

const statusColors: Record<string, string> = {
  open: "bg-red-500/10 text-red-400 border-red-500/20",
  investigating: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  contained: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  eradicated: "bg-teal-500/10 text-teal-400 border-teal-500/20",
  recovered: "bg-green-500/10 text-green-400 border-green-500/20",
  closed: "bg-slate-500/10 text-slate-400 border-slate-500/20",
};

const severityVariants: Record<string, "critical" | "high" | "medium" | "low" | "info"> = {
  critical: "critical", high: "high", medium: "medium", low: "low", info: "info",
};

export default function IncidentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { can } = useCapabilities();
  const [incident, setIncident] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const loadIncident = useCallback(async () => {
    try {
      const res = await fetch(`/api/siem/incidents/${params.id}`);
      if (res.ok) setIncident(await res.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [params.id]);

  useEffect(() => { loadIncident(); }, [loadIncident]);

  const updateStatus = async (newStatus: string) => {
    setUpdating(true);
    try {
      const res = await fetch(`/api/siem/incidents/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: newStatus,
          timelineEntry: { action: `Status changed to ${newStatus}`, details: `Incident status updated to ${newStatus}` },
        }),
      });
      if (res.ok) await loadIncident();
    } catch (e) { console.error(e); }
    setUpdating(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-10 h-10 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!incident) {
    return (
      <div className="text-center py-20 text-slate-500">
        <Siren className="w-12 h-12 mx-auto mb-3" />
        <p>Incident not found.</p>
        <Button variant="ghost" onClick={() => router.push("/siem")} className="mt-4">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to SIEM
        </Button>
      </div>
    );
  }

  const timeline = incident.timeline || [];
  const evidence = incident.evidence || [];
  const impactedUsers = incident.impactedUsers || [];
  const impactedAssets = incident.impactedAssets || [];
  const mitreTactics = incident.mitreTactics || [];
  const mitreTechniques = incident.mitreTechniques || [];
  const complianceMapping = incident.complianceMapping || [];
  const remediationSteps = incident.remediationSteps || [];
  const alerts = incident.alerts || [];

  return (
    <PageGate capability="siem.view" title="Incident Detail">
    <div className="space-y-6 max-w-[1200px] mx-auto">
      {/* Back */}
      <button onClick={() => router.push("/siem")} className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to SOC Dashboard
      </button>

      {/* Header */}
      <div className="flex items-start gap-4 flex-wrap">
        <Badge variant={severityVariants[incident.severity] || "info"} className="text-sm px-3 py-1">{incident.severity}</Badge>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-white">{incident.title}</h1>
          {incident.description && <p className="text-sm text-slate-400 mt-1">{incident.description}</p>}
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className={cn("text-xs px-2 py-1 rounded border", statusColors[incident.status])}>{incident.status}</span>
            <span className="text-xs text-slate-500 capitalize">Priority: {incident.priority}</span>
            {incident.slaBreached && (
              <span className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-400 border border-red-500/30">SLA Breached</span>
            )}
            {incident.assignedToName && (
              <span className="text-xs text-slate-500">Assigned: {incident.assignedToName}</span>
            )}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      {can("siem.incident.manage") && (
        <Card>
          <CardContent className="py-3 flex items-center gap-2 flex-wrap">
            {incident.status === "open" && (
              <Button size="sm" variant="outline" onClick={() => updateStatus("investigating")} disabled={updating}>
                <Shield className="w-3 h-3 mr-1" /> Start Investigation
              </Button>
            )}
            {incident.status === "investigating" && (
              <Button size="sm" variant="outline" onClick={() => updateStatus("contained")} disabled={updating}>
                <Shield className="w-3 h-3 mr-1" /> Mark Contained
              </Button>
            )}
            {incident.status === "contained" && (
              <Button size="sm" variant="outline" onClick={() => updateStatus("eradicated")} disabled={updating}>
                <CheckCircle className="w-3 h-3 mr-1" /> Mark Eradicated
              </Button>
            )}
            {(incident.status === "eradicated" || incident.status === "contained") && (
              <Button size="sm" variant="outline" onClick={() => updateStatus("recovered")} disabled={updating}>
                <CheckCircle className="w-3 h-3 mr-1" /> Mark Recovered
              </Button>
            )}
            {(incident.status === "recovered" || incident.status === "eradicated") && (
              <Button size="sm" variant="outline" onClick={() => updateStatus("closed")} disabled={updating}>
                <XCircle className="w-3 h-3 mr-1" /> Close Incident
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* MITRE ATT&CK */}
      {(mitreTactics.length > 0 || mitreTechniques.length > 0) && (
        <Card>
          <CardHeader><CardTitle className="text-sm">MITRE ATT&CK Coverage</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {mitreTechniques.map((t: string, i: number) => (
                <MitreTag key={i} attackId={t} tactic={mitreTactics[i]} size="md" />
              ))}
              {mitreTactics.filter((_: string, i: number) => i >= mitreTechniques.length).map((t: string, i: number) => (
                <MitreTag key={`t-${i}`} tactic={t} size="md" />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Timeline */}
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Clock className="w-4 h-4 text-cyan-400" /> Timeline</CardTitle></CardHeader>
          <CardContent><TimelineView entries={timeline} /></CardContent>
        </Card>

        {/* Impact */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Impact Analysis</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {incident.impactSummary && (
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Summary</p>
                <p className="text-xs text-white">{incident.impactSummary}</p>
              </div>
            )}
            {impactedUsers.length > 0 && (
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Impacted Users ({impactedUsers.length})</p>
                <div className="flex flex-wrap gap-1">
                  {impactedUsers.map((u: string) => (
                    <span key={u} className="text-xs bg-slate-800 px-2 py-1 rounded flex items-center gap-1">
                      <User className="w-3 h-3 text-slate-500" /> {u}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {impactedAssets.length > 0 && (
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Impacted Assets ({impactedAssets.length})</p>
                <div className="flex flex-wrap gap-1">
                  {impactedAssets.map((a: string) => (
                    <span key={a} className="text-xs bg-slate-800 px-2 py-1 rounded flex items-center gap-1 font-mono">
                      <Server className="w-3 h-3 text-slate-500" /> {a}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Linked Alerts */}
      {alerts.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Link2 className="w-4 h-4 text-cyan-400" /> Linked Alerts ({alerts.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1">
              {alerts.map((a: any) => (
                <div
                  key={a.id}
                  className="flex items-center gap-3 p-2 rounded hover:bg-slate-800/40 cursor-pointer transition-all"
                  onClick={() => router.push(`/siem/alerts/${a.id}`)}
                >
                  <Badge variant={severityVariants[a.severity] || "info"} className="text-[10px]">{a.severity}</Badge>
                  <span className="text-xs text-white truncate flex-1">{a.title}</span>
                  {a.mitreAttackId && <MitreTag attackId={a.mitreAttackId} />}
                  <span className="text-[10px] text-slate-600">{formatRelativeTime(a.createdAt)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Root Cause */}
        {incident.rootCause && (
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-orange-400" /> Root Cause Analysis</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-slate-300">{incident.rootCause}</p>
            </CardContent>
          </Card>
        )}

        {/* Evidence */}
        {evidence.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><FileText className="w-4 h-4 text-cyan-400" /> Evidence ({evidence.length})</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {evidence.map((e: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 p-2 rounded bg-slate-800/30">
                    <FileText className="w-4 h-4 text-slate-500" />
                    <div className="flex-1">
                      <p className="text-xs text-white">{e.name}</p>
                      <p className="text-[10px] text-slate-500">{e.type} • {e.addedAt ? formatDateTime(e.addedAt) : ""}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Remediation Steps */}
      {remediationSteps.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Remediation Steps</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {remediationSteps.map((s: any, i: number) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded bg-slate-800/30">
                  <span className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[10px]",
                    s.status === "completed" ? "bg-emerald-500/20 text-emerald-400" :
                    s.status === "in_progress" ? "bg-blue-500/20 text-blue-400" :
                    "bg-slate-700 text-slate-500"
                  )}>
                    {s.status === "completed" ? "✓" : i + 1}
                  </span>
                  <span className={cn("text-xs flex-1", s.status === "completed" ? "text-slate-400 line-through" : "text-white")}>{s.step}</span>
                  {s.assignee && <span className="text-[10px] text-slate-500">{s.assignee}</span>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Compliance Mapping */}
      {complianceMapping.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Compliance Mapping</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {complianceMapping.map((c: any, i: number) => (
                <span key={i} className="text-xs bg-slate-800 px-2 py-1 rounded">
                  <span className="text-cyan-400 font-medium">{c.framework}</span>
                  <span className="text-slate-500 mx-1">•</span>
                  <span className="text-slate-300">{c.control}</span>
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Timestamps */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Lifecycle Timestamps</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: "Detected", value: incident.detectedAt },
              { label: "Acknowledged", value: incident.acknowledgedAt },
              { label: "Contained", value: incident.containedAt },
              { label: "Resolved", value: incident.resolvedAt },
              { label: "Closed", value: incident.closedAt },
              { label: "Created", value: incident.createdAt },
            ].map(t => t.value && (
              <div key={t.label}>
                <p className="text-[10px] text-slate-500 uppercase">{t.label}</p>
                <p className="text-xs text-white">{formatDateTime(t.value)}</p>
                <p className="text-[10px] text-slate-600">{formatRelativeTime(t.value)}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
    </PageGate>
  );
}
