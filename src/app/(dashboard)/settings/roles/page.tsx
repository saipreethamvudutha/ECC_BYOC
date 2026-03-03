"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
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
  Plus,
  Users,
  Lock,
  Unlock,
  Copy,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
  Search,
  Loader2,
  Check,
  X,
  AlertTriangle,
  Eye,
} from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils";
import { CAPABILITY_MODULES } from "@/lib/capabilities";

// ─── Types ──────────────────────────────────────────────────────────

interface RoleItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isBuiltin: boolean;
  isActive: boolean;
  maxAssignments: number | null;
  capabilityCount: number;
  totalCapabilities: number;
  userCount: number;
  createdBy: string;
  createdAt: string;
}

interface CapabilityItem {
  id: string;
  name: string;
  description: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  granted: boolean;
  denied: boolean;
}

interface RoleUser {
  id: string;
  name: string;
  email: string;
  assignedAt: string;
}

interface RoleDetail {
  role: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    isBuiltin: boolean;
    maxAssignments: number | null;
  };
  capabilitiesByModule: Record<string, CapabilityItem[]>;
  totalCapabilities: number;
  users: RoleUser[];
}

// ─── Risk Level Badge Variant Map ───────────────────────────────────

const RISK_VARIANT: Record<string, "low" | "medium" | "high" | "critical"> = {
  low: "low",
  medium: "medium",
  high: "high",
  critical: "critical",
};

// ─── Slug Generator ─────────────────────────────────────────────────

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// ─── Module Collapsible Section ─────────────────────────────────────

function CapabilityModuleSection({
  moduleId,
  capabilities,
  grantedSet,
  readOnly,
  onToggle,
  searchFilter,
}: {
  moduleId: string;
  capabilities: CapabilityItem[];
  grantedSet: Set<string>;
  readOnly: boolean;
  onToggle: (capId: string) => void;
  searchFilter: string;
}) {
  const [expanded, setExpanded] = useState(true);
  const moduleMeta = CAPABILITY_MODULES.find((m) => m.id === moduleId);
  const moduleName = moduleMeta?.name ?? moduleId;

  const filtered = searchFilter
    ? capabilities.filter(
        (c) =>
          c.name.toLowerCase().includes(searchFilter) ||
          c.description.toLowerCase().includes(searchFilter) ||
          c.id.toLowerCase().includes(searchFilter)
      )
    : capabilities;

  if (filtered.length === 0) return null;

  const grantedCount = filtered.filter((c) => grantedSet.has(c.id)).length;

  return (
    <div className="border border-slate-800 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 bg-slate-800/40 hover:bg-slate-800/60 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-400" />
          )}
          <span className="text-sm font-medium text-white">{moduleName}</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {grantedCount}/{filtered.length}
          </Badge>
        </div>
      </button>
      {expanded && (
        <div className="divide-y divide-slate-800/50">
          {filtered.map((cap) => {
            const isGranted = grantedSet.has(cap.id);
            return (
              <label
                key={cap.id}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5 transition-colors",
                  readOnly
                    ? "cursor-default"
                    : "cursor-pointer hover:bg-slate-800/30"
                )}
              >
                <input
                  type="checkbox"
                  checked={isGranted}
                  disabled={readOnly}
                  onChange={() => onToggle(cap.id)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500/50 focus:ring-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "text-sm",
                        isGranted ? "text-white" : "text-slate-400"
                      )}
                    >
                      {cap.name}
                    </span>
                    <Badge
                      variant={RISK_VARIANT[cap.riskLevel] ?? "low"}
                      className="text-[10px] px-1.5 py-0"
                    >
                      {cap.riskLevel}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">
                    {cap.description}
                  </p>
                </div>
                {isGranted ? (
                  <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                ) : (
                  <X className="w-4 h-4 text-slate-600 flex-shrink-0" />
                )}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Capability Matrix (shared between create & edit) ───────────────

function CapabilityMatrix({
  capabilitiesByModule,
  grantedSet,
  readOnly,
  onToggle,
  totalCapabilities,
}: {
  capabilitiesByModule: Record<string, CapabilityItem[]>;
  grantedSet: Set<string>;
  readOnly: boolean;
  onToggle: (capId: string) => void;
  totalCapabilities: number;
}) {
  const [capSearch, setCapSearch] = useState("");
  const searchLower = capSearch.toLowerCase();

  const grantedCount = grantedSet.size;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-slate-300">
          Capability Matrix
        </h4>
        <span className="text-xs text-slate-500">
          {grantedCount} of {totalCapabilities} capabilities granted
        </span>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <Input
          placeholder="Filter capabilities..."
          value={capSearch}
          onChange={(e) => setCapSearch(e.target.value)}
          className="pl-9 h-8 text-xs"
        />
      </div>
      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
        {CAPABILITY_MODULES.map((mod) => {
          const caps = capabilitiesByModule[mod.id];
          if (!caps || caps.length === 0) return null;
          return (
            <CapabilityModuleSection
              key={mod.id}
              moduleId={mod.id}
              capabilities={caps}
              grantedSet={grantedSet}
              readOnly={readOnly}
              onToggle={onToggle}
              searchFilter={searchLower}
            />
          );
        })}
      </div>
      <div className="pt-2 border-t border-slate-800">
        <p className="text-xs text-slate-400 text-center">
          <span className="text-cyan-400 font-semibold">{grantedCount}</span> of{" "}
          <span className="text-white font-semibold">{totalCapabilities}</span>{" "}
          capabilities granted
        </p>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// MAIN PAGE COMPONENT
// ═════════════════════════════════════════════════════════════════════

export default function RolesPage() {
  // ─── State: Role List ───────────────────────────────────────────
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [loading, setLoading] = useState(true);

  // ─── State: Dialogs ─────────────────────────────────────────────
  const [detailOpen, setDetailOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // ─── State: Role Detail / Editor ────────────────────────────────
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState<RoleDetail | null>(null);
  const [editGranted, setEditGranted] = useState<Set<string>>(new Set());
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [saving, setSaving] = useState(false);

  // ─── State: Create Role ─────────────────────────────────────────
  const [createName, setCreateName] = useState("");
  const [createSlug, setCreateSlug] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createBasedOn, setCreateBasedOn] = useState("");
  const [createGranted, setCreateGranted] = useState<Set<string>>(new Set());
  const [createCapsByModule, setCreateCapsByModule] = useState<
    Record<string, CapabilityItem[]>
  >({});
  const [createTotalCaps, setCreateTotalCaps] = useState(0);
  const [createLoading, setCreateLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  // ─── State: Clone Role ──────────────────────────────────────────
  const [cloneSourceRole, setCloneSourceRole] = useState<RoleItem | null>(null);
  const [cloneName, setCloneName] = useState("");
  const [cloneSlug, setCloneSlug] = useState("");
  const [cloneDescription, setCloneDescription] = useState("");
  const [cloning, setCloning] = useState(false);

  // ─── State: Delete Role ─────────────────────────────────────────
  const [deleteRole, setDeleteRole] = useState<RoleItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ─── Fetch Roles ────────────────────────────────────────────────

  const fetchRoles = useCallback(() => {
    setLoading(true);
    fetch("/api/roles")
      .then((res) => res.json())
      .then(setRoles)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  // ─── Derived Data ───────────────────────────────────────────────

  const builtinRoles = useMemo(
    () => roles.filter((r) => r.isBuiltin),
    [roles]
  );
  const customRoles = useMemo(
    () => roles.filter((r) => !r.isBuiltin),
    [roles]
  );
  const totalUsers = useMemo(
    () => roles.reduce((sum, r) => sum + r.userCount, 0),
    [roles]
  );

  // ─── Open Role Detail ───────────────────────────────────────────

  const openDetail = useCallback(async (roleId: string) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailData(null);
    try {
      const res = await fetch(`/api/roles/${roleId}`);
      if (!res.ok) throw new Error("Failed to load role detail");
      const data: RoleDetail = await res.json();
      setDetailData(data);
      // Build the granted set from API data
      const granted = new Set<string>();
      for (const caps of Object.values(data.capabilitiesByModule)) {
        for (const cap of caps) {
          if (cap.granted) granted.add(cap.id);
        }
      }
      setEditGranted(granted);
      setEditName(data.role.name);
      setEditDescription(data.role.description ?? "");
    } catch (err) {
      console.error(err);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // ─── Toggle Capability in Edit ──────────────────────────────────

  const toggleEditCapability = useCallback((capId: string) => {
    setEditGranted((prev) => {
      const next = new Set(prev);
      if (next.has(capId)) {
        next.delete(capId);
      } else {
        next.add(capId);
      }
      return next;
    });
  }, []);

  // ─── Save Role (Edit) ──────────────────────────────────────────

  const saveRole = useCallback(async () => {
    if (!detailData) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/roles/${detailData.role.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName,
          description: editDescription || null,
          capabilities: Array.from(editGranted),
        }),
      });
      if (!res.ok) throw new Error("Failed to save role");
      setDetailOpen(false);
      fetchRoles();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }, [detailData, editName, editDescription, editGranted, fetchRoles]);

  // ─── Open Create Dialog ─────────────────────────────────────────

  const openCreate = useCallback(async () => {
    setCreateName("");
    setCreateSlug("");
    setCreateDescription("");
    setCreateBasedOn("");
    setCreateGranted(new Set());
    setCreateOpen(true);
    setCreateLoading(true);
    try {
      // Fetch any role detail to get the full capability list with module grouping
      // We'll use the first role as a template for the capability structure
      const firstRole = roles[0];
      if (firstRole) {
        const res = await fetch(`/api/roles/${firstRole.id}`);
        if (res.ok) {
          const data: RoleDetail = await res.json();
          // Clear all grants for a new role
          const cleanCaps: Record<string, CapabilityItem[]> = {};
          for (const [mod, caps] of Object.entries(data.capabilitiesByModule)) {
            cleanCaps[mod] = caps.map((c) => ({
              ...c,
              granted: false,
              denied: false,
            }));
          }
          setCreateCapsByModule(cleanCaps);
          setCreateTotalCaps(data.totalCapabilities);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCreateLoading(false);
    }
  }, [roles]);

  // ─── Handle "Based on" role selection for Create ─────────────────

  const handleBasedOnChange = useCallback(
    async (roleId: string) => {
      setCreateBasedOn(roleId);
      if (!roleId) {
        setCreateGranted(new Set());
        return;
      }
      try {
        const res = await fetch(`/api/roles/${roleId}`);
        if (res.ok) {
          const data: RoleDetail = await res.json();
          const granted = new Set<string>();
          for (const caps of Object.values(data.capabilitiesByModule)) {
            for (const cap of caps) {
              if (cap.granted) granted.add(cap.id);
            }
          }
          setCreateGranted(granted);
        }
      } catch (err) {
        console.error(err);
      }
    },
    []
  );

  // ─── Toggle Capability in Create ────────────────────────────────

  const toggleCreateCapability = useCallback((capId: string) => {
    setCreateGranted((prev) => {
      const next = new Set(prev);
      if (next.has(capId)) {
        next.delete(capId);
      } else {
        next.add(capId);
      }
      return next;
    });
  }, []);

  // ─── Submit Create ──────────────────────────────────────────────

  const submitCreate = useCallback(async () => {
    if (!createName.trim() || !createSlug.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName.trim(),
          slug: createSlug.trim(),
          description: createDescription.trim() || null,
          capabilities: Array.from(createGranted),
        }),
      });
      if (!res.ok) throw new Error("Failed to create role");
      setCreateOpen(false);
      fetchRoles();
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  }, [createName, createSlug, createDescription, createGranted, fetchRoles]);

  // ─── Open Clone Dialog ──────────────────────────────────────────

  const openClone = useCallback((role: RoleItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setCloneSourceRole(role);
    setCloneName(`Copy of ${role.name}`);
    setCloneSlug(`${role.slug}-copy`);
    setCloneDescription("");
    setCloneOpen(true);
  }, []);

  // ─── Submit Clone ───────────────────────────────────────────────

  const submitClone = useCallback(async () => {
    if (!cloneSourceRole || !cloneName.trim() || !cloneSlug.trim()) return;
    setCloning(true);
    try {
      const res = await fetch(`/api/roles/${cloneSourceRole.id}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: cloneName.trim(),
          slug: cloneSlug.trim(),
          description: cloneDescription.trim() || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to clone role");
      const data = await res.json();
      setCloneOpen(false);
      fetchRoles();
      // Open the new role in the editor
      if (data.id) {
        setTimeout(() => openDetail(data.id), 300);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCloning(false);
    }
  }, [cloneSourceRole, cloneName, cloneSlug, cloneDescription, fetchRoles, openDetail]);

  // ─── Open Delete Dialog ─────────────────────────────────────────

  const openDelete = useCallback((role: RoleItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteRole(role);
    setDeleteOpen(true);
  }, []);

  // ─── Submit Delete ──────────────────────────────────────────────

  const submitDelete = useCallback(async () => {
    if (!deleteRole) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/roles/${deleteRole.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete role");
      setDeleteOpen(false);
      setDeleteRole(null);
      fetchRoles();
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(false);
    }
  }, [deleteRole, fetchRoles]);

  // ─── Loading State ──────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Loading roles...</p>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════

  return (
    <div className="space-y-6">
      {/* ─── Summary Stats ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          {
            label: "Total Roles",
            value: roles.length,
            icon: ShieldCheck,
            color: "text-cyan-400",
          },
          {
            label: "Built-in",
            value: builtinRoles.length,
            icon: Lock,
            color: "text-blue-400",
          },
          {
            label: "Custom",
            value: customRoles.length,
            icon: Unlock,
            color: "text-purple-400",
          },
          {
            label: "Users Assigned",
            value: totalUsers,
            icon: Users,
            color: "text-emerald-400",
          },
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

      {/* ─── Create Role Button ─────────────────────────────────── */}
      <div className="flex justify-end">
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" />
          Create Role
        </Button>
      </div>

      {/* ─── Built-in Roles ─────────────────────────────────────── */}
      {builtinRoles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Lock className="w-4 h-4 text-blue-400" />
              Built-in Roles
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {builtinRoles.map((role) => (
                <div
                  key={role.id}
                  onClick={() => openDetail(role.id)}
                  className="flex items-center gap-4 p-4 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 transition-all cursor-pointer border border-transparent hover:border-slate-700 group"
                >
                  <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                    <ShieldCheck className="w-5 h-5 text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">
                        {role.name}
                      </span>
                      <Badge variant="info">Built-in</Badge>
                      {!role.isActive && (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </div>
                    {role.description && (
                      <p className="text-xs text-slate-500 mt-0.5 truncate">
                        {role.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-6 flex-shrink-0">
                    <div className="text-center">
                      <p className="text-sm font-bold text-white">
                        {role.capabilityCount}
                      </p>
                      <p className="text-[10px] text-slate-500">Capabilities</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-bold text-white">
                        {role.userCount}
                      </p>
                      <p className="text-[10px] text-slate-500">Users</p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDetail(role.id);
                        }}
                        title="View role"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => openClone(role, e)}
                        title="Clone role"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Custom Roles ───────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Unlock className="w-4 h-4 text-purple-400" />
            Custom Roles
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {customRoles.map((role) => (
              <div
                key={role.id}
                onClick={() => openDetail(role.id)}
                className="flex items-center gap-4 p-4 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 transition-all cursor-pointer border border-transparent hover:border-slate-700 group"
              >
                <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                  <ShieldCheck className="w-5 h-5 text-purple-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">
                      {role.name}
                    </span>
                    {!role.isActive && (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </div>
                  {role.description && (
                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                      {role.description}
                    </p>
                  )}
                  <p className="text-[10px] text-slate-600 mt-0.5">
                    Created by {role.createdBy} on{" "}
                    {formatDateTime(role.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-6 flex-shrink-0">
                  <div className="text-center">
                    <p className="text-sm font-bold text-white">
                      {role.capabilityCount}
                    </p>
                    <p className="text-[10px] text-slate-500">Capabilities</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-white">
                      {role.userCount}
                    </p>
                    <p className="text-[10px] text-slate-500">Users</p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        openDetail(role.id);
                      }}
                      title="Edit role"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => openClone(role, e)}
                      title="Clone role"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => openDelete(role, e)}
                      title="Delete role"
                      className="hover:text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {customRoles.length === 0 && (
              <div className="text-center py-12 text-slate-500">
                <ShieldCheck className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No custom roles created yet.</p>
                <p className="text-xs text-slate-600 mt-1">
                  Create custom roles to define granular capabilities for your
                  team.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ROLE DETAIL / EDITOR DIALOG                                */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {detailLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
                <p className="text-sm text-slate-400">Loading role details...</p>
              </div>
            </div>
          ) : detailData ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ShieldCheck
                    className={cn(
                      "w-5 h-5",
                      detailData.role.isBuiltin
                        ? "text-blue-400"
                        : "text-purple-400"
                    )}
                  />
                  {detailData.role.isBuiltin ? (
                    <span>{detailData.role.name}</span>
                  ) : (
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="h-8 text-base font-semibold bg-transparent border-slate-700 max-w-xs"
                    />
                  )}
                  {detailData.role.isBuiltin && (
                    <Badge variant="info">Built-in</Badge>
                  )}
                </DialogTitle>
                <DialogDescription>
                  {detailData.role.isBuiltin ? (
                    <span>{detailData.role.description}</span>
                  ) : (
                    <textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder="Role description..."
                      rows={2}
                      className="w-full mt-1 rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-300 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 resize-none"
                    />
                  )}
                </DialogDescription>
                {detailData.role.isBuiltin && (
                  <div className="pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        setDetailOpen(false);
                        const fakeRole: RoleItem = {
                          id: detailData.role.id,
                          name: detailData.role.name,
                          slug: detailData.role.slug,
                          description: detailData.role.description,
                          isBuiltin: true,
                          isActive: true,
                          maxAssignments: detailData.role.maxAssignments,
                          capabilityCount: editGranted.size,
                          totalCapabilities: detailData.totalCapabilities,
                          userCount: detailData.users.length,
                          createdBy: "",
                          createdAt: "",
                        };
                        setTimeout(() => openClone(fakeRole, e), 200);
                      }}
                    >
                      <Copy className="w-3.5 h-3.5 mr-1.5" />
                      Clone to customize
                    </Button>
                  </div>
                )}
              </DialogHeader>

              {/* Capability Matrix */}
              <div className="mt-2">
                <CapabilityMatrix
                  capabilitiesByModule={detailData.capabilitiesByModule}
                  grantedSet={editGranted}
                  readOnly={detailData.role.isBuiltin}
                  onToggle={toggleEditCapability}
                  totalCapabilities={detailData.totalCapabilities}
                />
              </div>

              {/* Assigned Users */}
              {detailData.users.length > 0 && (
                <div className="mt-4 space-y-2">
                  <h4 className="text-sm font-medium text-slate-300 flex items-center gap-2">
                    <Users className="w-4 h-4 text-slate-400" />
                    Assigned Users ({detailData.users.length})
                  </h4>
                  <div className="space-y-1 max-h-[150px] overflow-y-auto">
                    {detailData.users.map((user) => (
                      <div
                        key={user.id}
                        className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-800/30"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-[10px] font-bold text-white">
                            {user.name
                              ? user.name
                                  .split(" ")
                                  .map((n) => n[0])
                                  .join("")
                                  .toUpperCase()
                                  .slice(0, 2)
                              : user.email[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="text-xs text-white font-medium">
                              {user.name || user.email}
                            </p>
                            {user.name && (
                              <p className="text-[10px] text-slate-500">
                                {user.email}
                              </p>
                            )}
                          </div>
                        </div>
                        <p className="text-[10px] text-slate-600">
                          Assigned {formatDateTime(user.assignedAt)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Footer */}
              {!detailData.role.isBuiltin && (
                <DialogFooter className="mt-4">
                  <Button
                    variant="outline"
                    onClick={() => setDetailOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button onClick={saveRole} disabled={saving || !editName.trim()}>
                    {saving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        Save Changes
                      </>
                    )}
                  </Button>
                </DialogFooter>
              )}
            </>
          ) : (
            <div className="text-center py-12 text-slate-500">
              <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-yellow-500" />
              <p className="text-sm">Failed to load role details.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* CREATE ROLE DIALOG                                         */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-cyan-400" />
              Create Custom Role
            </DialogTitle>
            <DialogDescription>
              Define a new role with specific capabilities for your team.
            </DialogDescription>
          </DialogHeader>

          {createLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-cyan-500 animate-spin" />
            </div>
          ) : (
            <>
              <div className="space-y-4 mt-2">
                {/* Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-400">
                    Role Name
                  </label>
                  <Input
                    placeholder="e.g. Junior Analyst"
                    value={createName}
                    onChange={(e) => {
                      setCreateName(e.target.value);
                      setCreateSlug(generateSlug(e.target.value));
                    }}
                  />
                </div>

                {/* Slug */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-400">
                    Slug
                  </label>
                  <Input
                    placeholder="junior-analyst"
                    value={createSlug}
                    onChange={(e) => setCreateSlug(generateSlug(e.target.value))}
                    className="font-mono text-xs"
                  />
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-400">
                    Description
                  </label>
                  <textarea
                    placeholder="What this role is for..."
                    value={createDescription}
                    onChange={(e) => setCreateDescription(e.target.value)}
                    rows={2}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 resize-none"
                  />
                </div>

                {/* Based On */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-400">
                    Based on (optional)
                  </label>
                  <select
                    value={createBasedOn}
                    onChange={(e) => handleBasedOnChange(e.target.value)}
                    className="w-full h-10 rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50"
                  >
                    <option value="">Start from scratch</option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                        {r.isBuiltin ? " (Built-in)" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Capability Matrix */}
                {Object.keys(createCapsByModule).length > 0 && (
                  <CapabilityMatrix
                    capabilitiesByModule={createCapsByModule}
                    grantedSet={createGranted}
                    readOnly={false}
                    onToggle={toggleCreateCapability}
                    totalCapabilities={createTotalCaps}
                  />
                )}
              </div>

              <DialogFooter className="mt-4">
                <Button
                  variant="outline"
                  onClick={() => setCreateOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={submitCreate}
                  disabled={creating || !createName.trim() || !createSlug.trim()}
                >
                  {creating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Create Role
                    </>
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* CLONE ROLE DIALOG                                          */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <Dialog open={cloneOpen} onOpenChange={setCloneOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Copy className="w-5 h-5 text-cyan-400" />
              Clone Role
            </DialogTitle>
            <DialogDescription>
              Create a new custom role based on{" "}
              <span className="text-white font-medium">
                {cloneSourceRole?.name}
              </span>
              . The new role will inherit all capabilities from the original.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            {/* Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">
                New Role Name
              </label>
              <Input
                value={cloneName}
                onChange={(e) => {
                  setCloneName(e.target.value);
                  setCloneSlug(generateSlug(e.target.value));
                }}
              />
            </div>

            {/* Slug */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">Slug</label>
              <Input
                value={cloneSlug}
                onChange={(e) => setCloneSlug(generateSlug(e.target.value))}
                className="font-mono text-xs"
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">
                Description (optional)
              </label>
              <textarea
                placeholder="What this role variant is for..."
                value={cloneDescription}
                onChange={(e) => setCloneDescription(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 resize-none"
              />
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setCloneOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={submitClone}
              disabled={cloning || !cloneName.trim() || !cloneSlug.trim()}
            >
              {cloning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Cloning...
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Clone Role
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* DELETE CONFIRMATION DIALOG                                 */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <Trash2 className="w-5 h-5" />
              Delete Role
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this role? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>

          {deleteRole && (
            <div className="mt-2 space-y-3">
              <div className="p-4 rounded-lg bg-red-500/5 border border-red-500/20">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="w-8 h-8 text-red-400" />
                  <div>
                    <p className="text-sm font-medium text-white">
                      {deleteRole.name}
                    </p>
                    <p className="text-xs text-slate-400">
                      {deleteRole.slug}
                    </p>
                  </div>
                </div>
              </div>

              {deleteRole.userCount > 0 && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20">
                  <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-yellow-400 font-medium">
                      Warning: {deleteRole.userCount} user
                      {deleteRole.userCount === 1 ? "" : "s"} currently assigned
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      These users will lose all capabilities granted by this
                      role. Make sure they have other roles assigned or their
                      access may be affected.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={submitDelete}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  Delete Role
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
