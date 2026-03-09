"use client";

import { useEffect, useState, use } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Server,
  Shield,
  AlertTriangle,
  Clock,
  Globe,
  Tag,
} from "lucide-react";
import { cn, formatDateTime, severityColor } from "@/lib/utils";
import { PageGate } from "@/components/rbac/PageGate";
import Link from "next/link";

interface ServiceInfo {
  port: number;
  protocol?: string;
  service: string;
  product?: string;
  version?: string;
  banner?: string;
}

interface AssetDetail {
  id: string;
  name: string;
  type: string;
  ipAddress: string | null;
  hostname: string | null;
  os: string | null;
  criticality: string;
  status: string;
  groupName: string | null;
  lastScanAt: string | null;
  createdAt: string;
  tags: { id: string; key: string; value: string; color: string | null }[];
  riskScore: number;
  severityCounts: Record<string, number>;
  // Phase 8: Discovery fields
  macAddress: string | null;
  manufacturer: string | null;
  model: string | null;
  firmware: string | null;
  networkRole: string | null;
  services: ServiceInfo[];
  openPorts: number[];
  discoveryMethod: string | null;
  discoveredAt: string | null;
  findings: {
    id: string;
    severity: string;
    title: string;
    description: string | null;
    cveId: string | null;
    cvssScore: number | null;
    status: string;
    remediation: string | null;
    scanId: string | null;
    scanName: string | null;
    createdAt: string;
  }[];
}

const criticalityColors: Record<string, string> = {
  critical: "text-red-400 bg-red-500/10 border-red-500/20",
  high: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  medium: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  low: "text-blue-400 bg-blue-500/10 border-blue-500/20",
};

const typeIcons: Record<string, string> = {
  server: "Server",
  workstation: "Workstation",
  network_device: "Network Device",
  cloud_resource: "Cloud Resource",
  application: "Application",
  database: "Database",
  container: "Container",
  iot_device: "IoT Device",
};

export default function AssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [asset, setAsset] = useState<AssetDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/assets/${id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setAsset(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  const riskColor = (score: number) => {
    if (score >= 75) return "text-red-400";
    if (score >= 50) return "text-orange-400";
    if (score >= 25) return "text-yellow-400";
    return "text-emerald-400";
  };

  return (
    <PageGate capability="asset.view" title="Asset Detail">
      {loading ? (
        <div className="flex items-center justify-center h-full">
          <div className="w-12 h-12 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin" />
        </div>
      ) : !asset ? (
        <div className="text-center py-20 text-slate-500">Asset not found.</div>
      ) : (
        <div className="space-y-6 max-w-[1600px] mx-auto">
          {/* Header */}
          <div>
            <Link href="/assets" className="text-sm text-slate-400 hover:text-slate-300 flex items-center gap-1 mb-2">
              <ArrowLeft className="w-4 h-4" /> Back to Assets
            </Link>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Server className="w-7 h-7 text-cyan-400" />
              {asset.name}
            </h1>
            <div className="flex items-center gap-3 mt-2">
              <Badge variant="outline">{typeIcons[asset.type] || asset.type}</Badge>
              <Badge variant="outline" className={criticalityColors[asset.criticality]}>
                {asset.criticality} criticality
              </Badge>
              <Badge variant={asset.status === "active" ? "success" : "secondary"}>
                {asset.status}
              </Badge>
            </div>
          </div>

          {/* Info Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="stat-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Shield className={cn("w-8 h-8", riskColor(asset.riskScore))} />
                  <div>
                    <p className={cn("text-2xl font-bold", riskColor(asset.riskScore))}>{asset.riskScore}</p>
                    <p className="text-xs text-slate-400">Risk Score</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="stat-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-8 h-8 text-orange-400" />
                  <div>
                    <p className="text-2xl font-bold text-white">{asset.findings.filter(f => f.status === "open").length}</p>
                    <p className="text-xs text-slate-400">Open Findings</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="stat-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Clock className="w-8 h-8 text-cyan-400" />
                  <div>
                    <p className="text-sm font-medium text-white">
                      {asset.lastScanAt ? formatDateTime(asset.lastScanAt) : "Never"}
                    </p>
                    <p className="text-xs text-slate-400">Last Scanned</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="stat-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Globe className="w-8 h-8 text-slate-400" />
                  <div>
                    <p className="text-sm font-medium text-white font-mono">
                      {asset.ipAddress || asset.hostname || "—"}
                    </p>
                    <p className="text-xs text-slate-400">{asset.ipAddress ? "IP Address" : "Hostname"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Asset Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Asset Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-slate-500">Hostname</p>
                  <p className="text-white mt-1 font-mono">{asset.hostname || "—"}</p>
                </div>
                <div>
                  <p className="text-slate-500">IP Address</p>
                  <p className="text-white mt-1 font-mono">{asset.ipAddress || "—"}</p>
                </div>
                <div>
                  <p className="text-slate-500">OS</p>
                  <p className="text-white mt-1">{asset.os || "Unknown"}</p>
                </div>
                <div>
                  <p className="text-slate-500">Group</p>
                  <p className="text-white mt-1">{asset.groupName || "Ungrouped"}</p>
                </div>
              </div>
              {asset.tags.length > 0 && (
                <div className="mt-4">
                  <p className="text-slate-500 text-sm mb-2 flex items-center gap-1">
                    <Tag className="w-3 h-3" /> Tags
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {asset.tags.map((tag) => (
                      <Badge key={tag.id} variant="outline" className="text-xs">
                        {tag.key}: {tag.value}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Discovery Details (Phase 8) */}
          {(asset.services.length > 0 || asset.openPorts.length > 0 || asset.manufacturer || asset.networkRole) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Discovery Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  {asset.manufacturer && (
                    <div>
                      <p className="text-slate-500">Manufacturer</p>
                      <p className="text-white mt-1">{asset.manufacturer}</p>
                    </div>
                  )}
                  {asset.model && (
                    <div>
                      <p className="text-slate-500">Model</p>
                      <p className="text-white mt-1">{asset.model}</p>
                    </div>
                  )}
                  {asset.networkRole && (
                    <div>
                      <p className="text-slate-500">Network Role</p>
                      <p className="text-white mt-1 capitalize">{asset.networkRole.replace(/_/g, " ")}</p>
                    </div>
                  )}
                  {asset.discoveryMethod && (
                    <div>
                      <p className="text-slate-500">Discovery Method</p>
                      <p className="text-white mt-1 capitalize">{asset.discoveryMethod.replace(/_/g, " ")}</p>
                    </div>
                  )}
                  {asset.firmware && (
                    <div>
                      <p className="text-slate-500">Firmware</p>
                      <p className="text-white mt-1 font-mono text-xs">{asset.firmware}</p>
                    </div>
                  )}
                  {asset.macAddress && (
                    <div>
                      <p className="text-slate-500">MAC Address</p>
                      <p className="text-white mt-1 font-mono text-xs">{asset.macAddress}</p>
                    </div>
                  )}
                </div>

                {asset.openPorts.length > 0 && (
                  <div>
                    <p className="text-slate-500 text-sm mb-2">Open Ports ({asset.openPorts.length})</p>
                    <div className="flex flex-wrap gap-1.5">
                      {asset.openPorts.map((port) => (
                        <span key={port} className="px-2 py-0.5 rounded bg-slate-800 text-xs font-mono text-cyan-400 border border-slate-700">
                          {port}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {asset.services.length > 0 && (
                  <div>
                    <p className="text-slate-500 text-sm mb-2">Detected Services ({asset.services.length})</p>
                    <div className="border border-slate-800 rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-800/50">
                            <th className="px-3 py-2 text-left text-slate-400 font-medium">Port</th>
                            <th className="px-3 py-2 text-left text-slate-400 font-medium">Service</th>
                            <th className="px-3 py-2 text-left text-slate-400 font-medium">Product</th>
                            <th className="px-3 py-2 text-left text-slate-400 font-medium">Version</th>
                          </tr>
                        </thead>
                        <tbody>
                          {asset.services.map((svc, idx) => (
                            <tr key={idx} className="border-t border-slate-800/50">
                              <td className="px-3 py-2 font-mono text-cyan-400">{svc.port}</td>
                              <td className="px-3 py-2 text-white">{svc.service}</td>
                              <td className="px-3 py-2 text-slate-300">{svc.product || "—"}</td>
                              <td className="px-3 py-2 text-slate-300 font-mono text-xs">{svc.version || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Severity Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Vulnerability Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                {(["critical", "high", "medium", "low", "info"] as const).map((sev) => {
                  const count = asset.severityCounts[sev] || 0;
                  return (
                    <div key={sev} className="flex items-center gap-2">
                      <div className={cn("w-3 h-3 rounded-full", severityColor(sev).split(" ")[1])} />
                      <span className="text-sm capitalize text-slate-400">{sev}</span>
                      <span className="text-sm font-bold text-white">{count}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Findings */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Related Findings ({asset.findings.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {asset.findings.map((finding) => (
                  <div
                    key={finding.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 transition-all"
                  >
                    <Badge variant="outline" className={cn("text-[10px] w-16 justify-center flex-shrink-0", severityColor(finding.severity))}>
                      {finding.severity}
                    </Badge>
                    <span className="text-sm text-white flex-1 min-w-0 truncate">{finding.title}</span>
                    {finding.cveId && (
                      <span className="text-xs text-cyan-400 font-mono flex-shrink-0">{finding.cveId}</span>
                    )}
                    {finding.scanName && (
                      <Link
                        href={`/scans/${finding.scanId}`}
                        className="text-xs text-slate-400 hover:text-cyan-400 flex-shrink-0"
                      >
                        {finding.scanName}
                      </Link>
                    )}
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] flex-shrink-0",
                        finding.status === "open" ? "text-orange-400" : "text-slate-400"
                      )}
                    >
                      {finding.status}
                    </Badge>
                  </div>
                ))}
                {asset.findings.length === 0 && (
                  <div className="text-center py-12 text-slate-500">
                    <Shield className="w-12 h-12 mx-auto mb-3 opacity-50 text-emerald-400" />
                    <p>No vulnerabilities found for this asset.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </PageGate>
  );
}
