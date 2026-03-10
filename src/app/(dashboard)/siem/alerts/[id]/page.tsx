"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, ShieldAlert, User, Server, Clock,
  AlertTriangle, CheckCircle, Shield, XCircle, Siren,
} from "lucide-react";
import { cn, formatDateTime, formatRelativeTime } from "@/lib/utils";
import { PageGate } from "@/components/rbac/PageGate";
import { MitreTag } from "../../components/MitreTag";
import { useCapabilities } from "@/hooks/useCapabilities";

/* eslint-disable @typescript-eslint/no-explicit-any */

const statusColors: Record<string, string> = {
  open: "bg-red-500/10 text-red-400 border-red-500/20",
  triaging: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  investigating: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  contained: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  resolved: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  closed: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  false_positive: "bg-slate-500/10 text-slate-500 border-slate-500/20",
};

const severityVariants: Record<string, "critical" | "high" | "medium" | "low" | "info"> = {
  critical: "critical", high: "high", medium: "medium", low: "low", info: "info",
};

export default function AlertDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { can } = useCapabilities();
  const [alert, setAlert] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const loadAlert = useCallback(async () => {
    try {
      const res = await fetch(`/api/siem/alerts/${params.id}`);
      if (res.ok) setAlert(await res.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [params.id]);

  useEffect(() => { loadAlert(); }, [loadAlert]);

  const updateStatus = async (newStatus: string) => {
    setUpdating(true);
    try {
      const res = await fetch(`/api/siem/alerts/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) await loadAlert();
    } catch (e) { console.error(e); }
    setUpdating(false);
  };

  const escalate = async () => {
    setUpdating(true);
    try {
      const res = await fetch(`/api/siem/alerts/${params.id}/escalate`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        router.push(`/siem/incidents/${data.id}`);
      }
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

  if (!alert) {
    return (
      <div className="text-center py-20 text-slate-500">
        <AlertTriangle className="w-12 h-12 mx-auto mb-3" />
        <p>Alert not found.</p>
        <Button variant="ghost" onClick={() => router.push("/siem")} className="mt-4">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to SIEM
        </Button>
      </div>
    );
  }

  const impactedUsers = alert.impactedUsers || [];
  const impactedAssets = alert.impactedAssets || [];

  return (
    <PageGate capability="siem.view" title="Alert Detail">
    <div className="space-y-6 max-w-[1200px] mx-auto">
      {/* Back */}
      <button onClick={() => router.push("/siem")} className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to SOC Dashboard
      </button>

      {/* Header */}
      <div className="flex items-start gap-4 flex-wrap">
        <Badge variant={severityVariants[alert.severity] || "info"} className="text-sm px-3 py-1">{alert.severity}</Badge>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-white">{alert.title}</h1>
          {alert.description && <p className="text-sm text-slate-400 mt-1">{alert.description}</p>}
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <MitreTag attackId={alert.mitreAttackId} tactic={alert.mitreTactic} technique={alert.mitreTechnique} size="md" />
            <span className={cn("text-xs px-2 py-1 rounded border", statusColors[alert.status])}>{alert.status.replace("_", " ")}</span>
            {alert.confidenceScore && <span className="text-xs text-slate-500">Confidence: {alert.confidenceScore}%</span>}
            {alert.priorityScore && <span className="text-xs text-slate-500">Priority: {alert.priorityScore}</span>}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      {can("siem.acknowledge") && (
        <Card>
          <CardContent className="py-3 flex items-center gap-2 flex-wrap">
            {alert.status === "open" && (
              <Button size="sm" variant="outline" onClick={() => updateStatus("triaging")} disabled={updating}>
                <CheckCircle className="w-3 h-3 mr-1" /> Acknowledge
              </Button>
            )}
            {(alert.status === "open" || alert.status === "triaging") && (
              <Button size="sm" variant="outline" onClick={() => updateStatus("investigating")} disabled={updating}>
                <Shield className="w-3 h-3 mr-1" /> Investigate
              </Button>
            )}
            {(alert.status === "investigating") && (
              <Button size="sm" variant="outline" onClick={() => updateStatus("contained")} disabled={updating}>
                <ShieldAlert className="w-3 h-3 mr-1" /> Contain
              </Button>
            )}
            {(alert.status === "contained" || alert.status === "investigating") && (
              <Button size="sm" variant="outline" onClick={() => updateStatus("resolved")} disabled={updating}>
                <CheckCircle className="w-3 h-3 mr-1" /> Resolve
              </Button>
            )}
            {alert.status === "resolved" && (
              <Button size="sm" variant="outline" onClick={() => updateStatus("closed")} disabled={updating}>
                <XCircle className="w-3 h-3 mr-1" /> Close
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => updateStatus("false_positive")} disabled={updating}>
              Mark False Positive
            </Button>
            {can("siem.escalate") && !alert.incidentId && (
              <Button size="sm" className="bg-orange-500 hover:bg-orange-600 text-white ml-auto" onClick={escalate} disabled={updating}>
                <Siren className="w-3 h-3 mr-1" /> Escalate to Incident
              </Button>
            )}
            {alert.incidentId && (
              <Button size="sm" variant="ghost" className="ml-auto text-cyan-400" onClick={() => router.push(`/siem/incidents/${alert.incidentId}`)}>
                <Siren className="w-3 h-3 mr-1" /> View Incident
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Investigation Context */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Investigation Context</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {impactedUsers.length > 0 && (
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Impacted Users</p>
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
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Impacted Assets</p>
                <div className="flex flex-wrap gap-1">
                  {impactedAssets.map((a: string) => (
                    <span key={a} className="text-xs bg-slate-800 px-2 py-1 rounded flex items-center gap-1 font-mono">
                      <Server className="w-3 h-3 text-slate-500" /> {a}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {alert.ruleName && (
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Detection Rule</p>
                <p className="text-xs text-white">{alert.ruleName}</p>
              </div>
            )}
            {alert.assignedToName && (
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Assigned To</p>
                <p className="text-xs text-white">{alert.assignedToName}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Timestamps */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Lifecycle Timestamps</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {[
              { label: "Created", value: alert.createdAt },
              { label: "Acknowledged", value: alert.acknowledgedAt },
              { label: "Contained", value: alert.containedAt },
              { label: "Resolved", value: alert.resolvedAt },
              { label: "Closed", value: alert.closedAt },
            ].map(t => t.value && (
              <div key={t.label} className="flex items-center gap-2">
                <Clock className="w-3 h-3 text-slate-500" />
                <span className="text-xs text-slate-500 w-24">{t.label}:</span>
                <span className="text-xs text-white">{formatDateTime(t.value)}</span>
                <span className="text-[10px] text-slate-600">({formatRelativeTime(t.value)})</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Triggering Event */}
      {alert.event && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Triggering Event</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Source", value: alert.event.source },
                { label: "Category", value: alert.event.category },
                { label: "Source IP", value: alert.event.sourceIp },
                { label: "Dest IP", value: alert.event.destIp },
                { label: "Protocol", value: alert.event.protocol },
                { label: "Direction", value: alert.event.direction },
                { label: "User", value: alert.event.userName },
                { label: "Host", value: alert.event.hostName },
                { label: "Process", value: alert.event.processName },
                { label: "Geo", value: alert.event.geoCountry ? `${alert.event.geoCity || ""} ${alert.event.geoCountry}` : null },
                { label: "Threat Intel", value: alert.event.threatIntelHit ? "Match" : null },
                { label: "Dataset", value: alert.event.dataset },
              ].filter(f => f.value).map(f => (
                <div key={f.label}>
                  <p className="text-[10px] text-slate-500 uppercase">{f.label}</p>
                  <p className="text-xs text-white font-mono">{f.value}</p>
                </div>
              ))}
            </div>
            {alert.event.details && Object.keys(alert.event.details).length > 0 && (
              <div className="mt-3 p-3 bg-slate-900 rounded-lg">
                <p className="text-[10px] text-slate-500 uppercase mb-1">Event Details</p>
                <pre className="text-[10px] text-slate-300 font-mono whitespace-pre-wrap overflow-auto max-h-32">
                  {JSON.stringify(alert.event.details, null, 2)}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
    </PageGate>
  );
}
