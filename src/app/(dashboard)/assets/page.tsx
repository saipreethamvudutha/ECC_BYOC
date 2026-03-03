"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Server,
  Monitor,
  Network,
  Cloud,
  AppWindow,
  Database,
  Plus,
  Search,
  Layers,
  Tag,
  ChevronDown,
  X,
} from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils";

interface AssetTag {
  id: string;
  key: string;
  value: string;
  color: string | null;
}

interface AssetItem {
  id: string;
  name: string;
  type: string;
  ipAddress: string | null;
  hostname: string | null;
  os: string | null;
  criticality: string;
  status: string;
  tags: string[];
  assetTags: AssetTag[];
  group: { id: string; name: string } | null;
  lastScanAt: string | null;
  createdAt: string;
}

const typeIcons: Record<string, React.ElementType> = {
  server: Server,
  workstation: Monitor,
  network_device: Network,
  cloud_resource: Cloud,
  application: AppWindow,
  database: Database,
};

const typeLabels: Record<string, string> = {
  server: "Server",
  workstation: "Workstation",
  network_device: "Network Device",
  cloud_resource: "Cloud Resource",
  application: "Application",
  database: "Database",
};

const criticalityVariants: Record<string, "critical" | "high" | "medium" | "low" | "info"> = {
  critical: "critical",
  high: "high",
  medium: "medium",
  low: "low",
};

const statusVariants: Record<string, "success" | "secondary" | "destructive"> = {
  active: "success",
  inactive: "secondary",
  decommissioned: "destructive",
};

export default function AssetsPage() {
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const tagDropdownRef = useRef<HTMLDivElement>(null);

  // Close tag dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        tagDropdownRef.current &&
        !tagDropdownRef.current.contains(event.target as Node)
      ) {
        setTagDropdownOpen(false);
      }
    }
    if (tagDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [tagDropdownOpen]);

  useEffect(() => {
    fetch("/api/assets")
      .then((res) => res.json())
      .then(setAssets)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Loading asset inventory...</p>
        </div>
      </div>
    );
  }

  // Collect all unique tags from loaded assets
  const uniqueTags = Array.from(
    new Map(
      assets.flatMap((a) =>
        (a.assetTags || []).map((t) => [`${t.key}:${t.value}`, t] as const)
      )
    ).values()
  );

  const filteredAssets = assets.filter((a) => {
    const matchesSearch =
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.hostname?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.ipAddress?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTag =
      !selectedTag ||
      (a.assetTags || []).some((t) => `${t.key}:${t.value}` === selectedTag);
    return matchesSearch && matchesTag;
  });

  const activeCount = assets.filter((a) => a.status === "active").length;
  const criticalCount = assets.filter((a) => a.criticality === "critical").length;
  const highCount = assets.filter((a) => a.criticality === "high").length;
  const unscannedCount = assets.filter((a) => !a.lastScanAt).length;

  // Count by type
  const typeCounts: Record<string, number> = {};
  for (const a of assets) {
    typeCounts[a.type] = (typeCounts[a.type] || 0) + 1;
  }

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Server className="w-7 h-7 text-cyan-400" />
            Asset Inventory
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Manage and monitor all assets across your organization
          </p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Add Asset
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: "Total Assets", value: assets.length, icon: Layers, color: "text-cyan-400" },
          { label: "Active", value: activeCount, icon: Server, color: "text-emerald-400" },
          { label: "Critical Assets", value: criticalCount, icon: Server, color: "text-red-400" },
          { label: "High Priority", value: highCount, icon: Server, color: "text-orange-400" },
          { label: "Unscanned", value: unscannedCount, icon: Search, color: "text-yellow-400" },
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

      {/* Search & Tag Filter */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search by name, hostname, or IP address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50"
          />
        </div>

        {/* Tag Filter Dropdown */}
        <div className="relative" ref={tagDropdownRef}>
          <Button
            variant="outline"
            className="gap-2 text-sm"
            onClick={() => setTagDropdownOpen(!tagDropdownOpen)}
          >
            <Tag className="w-4 h-4" />
            {selectedTag ? selectedTag : "Filter by tag"}
            <ChevronDown className="w-3 h-3" />
          </Button>
          {selectedTag && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSelectedTag(null);
              }}
              className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-slate-600 hover:bg-slate-500 text-white flex items-center justify-center"
            >
              <X className="w-3 h-3" />
            </button>
          )}
          {tagDropdownOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 w-64 max-h-64 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 shadow-xl">
              {uniqueTags.length === 0 ? (
                <div className="p-3 text-xs text-slate-500 text-center">
                  No tags available
                </div>
              ) : (
                <div className="py-1">
                  {uniqueTags.map((tag) => {
                    const tagKey = `${tag.key}:${tag.value}`;
                    const bgColor = tag.color || "#06b6d4";
                    return (
                      <button
                        key={tag.id}
                        onClick={() => {
                          setSelectedTag(
                            selectedTag === tagKey ? null : tagKey
                          );
                          setTagDropdownOpen(false);
                        }}
                        className={cn(
                          "w-full text-left px-3 py-2 text-sm hover:bg-slate-800 flex items-center gap-2 transition-colors",
                          selectedTag === tagKey && "bg-slate-800"
                        )}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: bgColor }}
                        />
                        <span className="text-slate-300 truncate">
                          {tag.key}:{tag.value}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Asset List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Assets ({filteredAssets.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Table Header */}
          <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr_1fr] gap-4 px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider border-b border-slate-800 mb-2">
            <span>Name</span>
            <span>Type</span>
            <span>IP / Hostname</span>
            <span>OS</span>
            <span>Criticality</span>
            <span>Tags</span>
            <span>Group</span>
            <span>Status</span>
          </div>
          <div className="space-y-1">
            {filteredAssets.map((asset) => {
              const TypeIcon = typeIcons[asset.type] || Server;
              return (
                <div
                  key={asset.id}
                  className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr_1fr] gap-4 items-center p-4 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 transition-all cursor-pointer border border-transparent hover:border-slate-700"
                >
                  {/* Name */}
                  <div className="flex items-center gap-3 min-w-0">
                    <TypeIcon className="w-5 h-5 text-cyan-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{asset.name}</p>
                      {asset.lastScanAt && (
                        <p className="text-[10px] text-slate-500">
                          Last scan: {formatDateTime(asset.lastScanAt)}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Type */}
                  <div>
                    <Badge variant="outline" className="text-[10px]">
                      {typeLabels[asset.type] || asset.type}
                    </Badge>
                  </div>

                  {/* IP / Hostname */}
                  <div className="min-w-0">
                    <p className="text-sm text-slate-300 font-mono truncate">
                      {asset.ipAddress || "-"}
                    </p>
                    {asset.hostname && (
                      <p className="text-[10px] text-slate-500 truncate">{asset.hostname}</p>
                    )}
                  </div>

                  {/* OS */}
                  <div>
                    <p className="text-sm text-slate-400 truncate">{asset.os || "-"}</p>
                  </div>

                  {/* Criticality */}
                  <div>
                    <Badge variant={criticalityVariants[asset.criticality] || "secondary"}>
                      {asset.criticality}
                    </Badge>
                  </div>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1">
                    {(asset.assetTags || []).length > 0 ? (
                      asset.assetTags.map((tag) => (
                        <Badge
                          key={tag.id}
                          variant="outline"
                          className="text-[10px] px-1.5 py-0"
                          style={{
                            borderColor: tag.color || "#06b6d4",
                            color: tag.color || "#06b6d4",
                          }}
                        >
                          {tag.key}:{tag.value}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-slate-500">-</span>
                    )}
                  </div>

                  {/* Group */}
                  <div>
                    <p className="text-sm text-slate-400 truncate">
                      {asset.group?.name || "-"}
                    </p>
                  </div>

                  {/* Status */}
                  <div>
                    <Badge variant={statusVariants[asset.status] || "secondary"}>
                      {asset.status}
                    </Badge>
                  </div>
                </div>
              );
            })}
            {filteredAssets.length === 0 && (
              <div className="text-center py-12 text-slate-500">
                <Server className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>
                  {searchQuery || selectedTag
                    ? "No assets match your filters."
                    : "No assets found. Add your first asset to get started."}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
