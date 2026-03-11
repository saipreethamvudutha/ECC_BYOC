"use client";

import { useEffect, useState, use } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Server,
  Shield,
  AlertTriangle,
  Clock,
  Globe,
  Tag,
  Pencil,
  Save,
  X,
  Plus,
  Trash2,
  Loader2,
} from "lucide-react";
import { cn, formatDateTime, severityColor } from "@/lib/utils";
import { PageGate } from "@/components/rbac/PageGate";
import { Gate } from "@/components/rbac/Gate";
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
  // Phase 9: Inventory fields
  serialNumber: string | null;
  biosUuid: string | null;
  physicalLocation: string | null;
  assetOwner: string | null;
  subnet: string | null;
  vlan: string | null;
  installedSoftware: { name: string; version: string; vendor?: string; installedAt?: string }[];
  userAccounts: { username: string; role: string; lastLogin?: string; status: string }[];
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

const CRITICALITY_OPTIONS = ["critical", "high", "medium", "low"];
const ASSET_TYPES = [
  "server", "workstation", "network_device", "cloud_resource", "application",
  "database", "iot_device", "mobile_device", "virtual_machine", "container", "firewall", "load_balancer",
];

export default function AssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [asset, setAsset] = useState<AssetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", type: "", criticality: "", ipAddress: "", hostname: "", os: "", physicalLocation: "", assetOwner: "" });
  const [newTagKey, setNewTagKey] = useState("");
  const [newTagValue, setNewTagValue] = useState("");
  const [addingTag, setAddingTag] = useState(false);

  function loadAsset() {
    fetch(`/api/assets/${id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setAsset(data);
        if (data) setEditForm({
          name: data.name || "", type: data.type || "", criticality: data.criticality || "",
          ipAddress: data.ipAddress || "", hostname: data.hostname || "", os: data.os || "",
          physicalLocation: data.physicalLocation || "", assetOwner: data.assetOwner || "",
        });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadAsset(); }, [id]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/assets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (res.ok) { setEditing(false); loadAsset(); }
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  }

  async function handleAddTag() {
    if (!newTagKey || !newTagValue) return;
    setAddingTag(true);
    try {
      const res = await fetch(`/api/assets/${id}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: newTagKey, value: newTagValue }),
      });
      if (res.ok) { setNewTagKey(""); setNewTagValue(""); loadAsset(); }
    } catch (e) { console.error(e); }
    finally { setAddingTag(false); }
  }

  async function handleRemoveTag(tagId: string) {
    try {
      const res = await fetch(`/api/assets/${id}/tags/${tagId}`, { method: "DELETE" });
      if (res.ok) loadAsset();
    } catch (e) { console.error(e); }
  }

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
            <div className="flex items-center justify-between">
              <div>
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
              <Gate capability="asset.edit">
                {editing ? (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSave} disabled={saving}>
                      {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                      Save
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
                      <X className="w-4 h-4 mr-1" /> Cancel
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                    <Pencil className="w-4 h-4 mr-1" /> Edit Asset
                  </Button>
                )}
              </Gate>
            </div>
          </div>

          {/* Inline Edit Form */}
          {editing && (
            <Card>
              <CardHeader><CardTitle className="text-base">Edit Asset Details</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="text-xs text-slate-500">Name</label>
                    <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="mt-1" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Type</label>
                    <select value={editForm.type} onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
                      className="mt-1 w-full rounded-md bg-slate-800 border border-slate-700 text-white text-sm px-3 py-2">
                      {ASSET_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Criticality</label>
                    <select value={editForm.criticality} onChange={(e) => setEditForm({ ...editForm, criticality: e.target.value })}
                      className="mt-1 w-full rounded-md bg-slate-800 border border-slate-700 text-white text-sm px-3 py-2">
                      {CRITICALITY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">IP Address</label>
                    <Input value={editForm.ipAddress} onChange={(e) => setEditForm({ ...editForm, ipAddress: e.target.value })} className="mt-1" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Hostname</label>
                    <Input value={editForm.hostname} onChange={(e) => setEditForm({ ...editForm, hostname: e.target.value })} className="mt-1" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">OS</label>
                    <Input value={editForm.os} onChange={(e) => setEditForm({ ...editForm, os: e.target.value })} className="mt-1" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Owner</label>
                    <Input value={editForm.assetOwner} onChange={(e) => setEditForm({ ...editForm, assetOwner: e.target.value })} className="mt-1" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Physical Location</label>
                    <Input value={editForm.physicalLocation} onChange={(e) => setEditForm({ ...editForm, physicalLocation: e.target.value })} className="mt-1" />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

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
              <div className="mt-4">
                <p className="text-slate-500 text-sm mb-2 flex items-center gap-1">
                  <Tag className="w-3 h-3" /> Tags
                </p>
                <div className="flex flex-wrap gap-2">
                  {asset.tags.map((tag) => (
                    <Badge key={tag.id} variant="outline" className="text-xs flex items-center gap-1">
                      {tag.key}: {tag.value}
                      <Gate capability="asset.edit">
                        <button onClick={() => handleRemoveTag(tag.id)} className="ml-1 hover:text-red-400 transition-colors">
                          <X className="w-3 h-3" />
                        </button>
                      </Gate>
                    </Badge>
                  ))}
                  {asset.tags.length === 0 && <span className="text-xs text-slate-600">No tags</span>}
                </div>
                <Gate capability="asset.edit">
                  <div className="flex items-center gap-2 mt-2">
                    <Input placeholder="Key" value={newTagKey} onChange={(e) => setNewTagKey(e.target.value)} className="w-28 h-8 text-xs" />
                    <Input placeholder="Value" value={newTagValue} onChange={(e) => setNewTagValue(e.target.value)} className="w-28 h-8 text-xs" />
                    <Button size="sm" variant="outline" onClick={handleAddTag} disabled={addingTag || !newTagKey || !newTagValue} className="h-8 text-xs">
                      {addingTag ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3 mr-1" />} Add Tag
                    </Button>
                  </div>
                </Gate>
              </div>
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

          {/* Inventory Details (Phase 9) */}
          {(asset.serialNumber || asset.biosUuid || asset.physicalLocation || asset.assetOwner || asset.subnet || asset.vlan) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Inventory Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  {asset.serialNumber && (
                    <div>
                      <p className="text-slate-500">Serial Number</p>
                      <p className="text-white mt-1 font-mono">{asset.serialNumber}</p>
                    </div>
                  )}
                  {asset.biosUuid && (
                    <div>
                      <p className="text-slate-500">BIOS UUID</p>
                      <p className="text-white mt-1 font-mono text-xs">{asset.biosUuid}</p>
                    </div>
                  )}
                  {asset.physicalLocation && (
                    <div>
                      <p className="text-slate-500">Physical Location</p>
                      <p className="text-white mt-1">{asset.physicalLocation}</p>
                    </div>
                  )}
                  {asset.assetOwner && (
                    <div>
                      <p className="text-slate-500">Asset Owner</p>
                      <p className="text-white mt-1">{asset.assetOwner}</p>
                    </div>
                  )}
                  {asset.subnet && (
                    <div>
                      <p className="text-slate-500">Subnet</p>
                      <p className="text-white mt-1 font-mono">{asset.subnet}</p>
                    </div>
                  )}
                  {asset.vlan && (
                    <div>
                      <p className="text-slate-500">VLAN</p>
                      <p className="text-white mt-1 font-mono">{asset.vlan}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Installed Software (Phase 9) */}
          {asset.installedSoftware.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Installed Software ({asset.installedSoftware.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="border border-slate-800 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-800/50">
                        <th className="px-3 py-2 text-left text-slate-400 font-medium">Name</th>
                        <th className="px-3 py-2 text-left text-slate-400 font-medium">Version</th>
                        <th className="px-3 py-2 text-left text-slate-400 font-medium">Vendor</th>
                        <th className="px-3 py-2 text-left text-slate-400 font-medium">Installed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {asset.installedSoftware.map((sw, idx) => (
                        <tr key={idx} className="border-t border-slate-800/50">
                          <td className="px-3 py-2 text-white">{sw.name}</td>
                          <td className="px-3 py-2 text-cyan-400 font-mono text-xs">{sw.version}</td>
                          <td className="px-3 py-2 text-slate-300">{sw.vendor || "—"}</td>
                          <td className="px-3 py-2 text-slate-300 text-xs">{sw.installedAt ? formatDateTime(sw.installedAt) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* User Accounts (Phase 9) */}
          {asset.userAccounts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">User Accounts ({asset.userAccounts.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="border border-slate-800 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-800/50">
                        <th className="px-3 py-2 text-left text-slate-400 font-medium">Username</th>
                        <th className="px-3 py-2 text-left text-slate-400 font-medium">Role</th>
                        <th className="px-3 py-2 text-left text-slate-400 font-medium">Last Login</th>
                        <th className="px-3 py-2 text-left text-slate-400 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {asset.userAccounts.map((acc, idx) => (
                        <tr key={idx} className="border-t border-slate-800/50">
                          <td className="px-3 py-2 text-white font-mono">{acc.username}</td>
                          <td className="px-3 py-2 text-slate-300 capitalize">{acc.role}</td>
                          <td className="px-3 py-2 text-slate-300 text-xs">{acc.lastLogin ? formatDateTime(acc.lastLogin) : "—"}</td>
                          <td className="px-3 py-2">
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px]",
                                acc.status === "active" ? "text-emerald-400 border-emerald-500/30" :
                                acc.status === "disabled" ? "text-yellow-400 border-yellow-500/30" :
                                "text-red-400 border-red-500/30"
                              )}
                            >
                              {acc.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
