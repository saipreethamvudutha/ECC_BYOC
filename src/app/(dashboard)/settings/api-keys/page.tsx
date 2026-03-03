"use client";

import { useEffect, useState, useCallback } from "react";
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
  Key,
  Plus,
  Copy,
  Trash2,
  RefreshCw,
  Shield,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { cn, formatDateTime, formatRelativeTime } from "@/lib/utils";

interface ApiKeyItem {
  id: string;
  name: string;
  keyPrefix: string;
  role: string;
  createdBy: string;
  rateLimit: number;
  isActive: boolean;
  lastUsedAt: string | null;
  expiresAt: string;
  createdAt: string;
}

interface RoleOption {
  id: string;
  name: string;
  capabilityCount: number;
}

const EXPIRY_OPTIONS = [
  { label: "30 days", value: 30 },
  { label: "60 days", value: 60 },
  { label: "90 days", value: 90 },
  { label: "180 days", value: 180 },
  { label: "365 days", value: 365 },
];

export default function ApiKeysPage() {
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createRoleId, setCreateRoleId] = useState("");
  const [createExpiry, setCreateExpiry] = useState(90);
  const [createIpAllowlist, setCreateIpAllowlist] = useState("");
  const [createRateLimit, setCreateRateLimit] = useState("1000");
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Key reveal state (shared between create and rotate)
  const [revealOpen, setRevealOpen] = useState(false);
  const [revealKey, setRevealKey] = useState("");
  const [revealKeyName, setRevealKeyName] = useState("");
  const [copied, setCopied] = useState(false);

  // Rotate dialog state
  const [rotateTarget, setRotateTarget] = useState<ApiKeyItem | null>(null);
  const [rotateSubmitting, setRotateSubmitting] = useState(false);

  // Revoke dialog state
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyItem | null>(null);
  const [revokeSubmitting, setRevokeSubmitting] = useState(false);

  const fetchApiKeys = useCallback(async () => {
    try {
      const res = await fetch("/api/api-keys");
      if (!res.ok) throw new Error("Failed to fetch API keys");
      const data = await res.json();
      setApiKeys(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load API keys");
    }
  }, []);

  const fetchRoles = useCallback(async () => {
    try {
      const res = await fetch("/api/roles");
      if (!res.ok) return;
      const data = await res.json();
      setRoles(
        data.map((r: { id: string; name: string; capabilityCount: number }) => ({
          id: r.id,
          name: r.name,
          capabilityCount: r.capabilityCount,
        }))
      );
    } catch {
      // Roles fetch is non-critical
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchApiKeys(), fetchRoles()]).finally(() =>
      setLoading(false)
    );
  }, [fetchApiKeys, fetchRoles]);

  // Stats
  const totalKeys = apiKeys.length;
  const activeKeys = apiKeys.filter((k) => k.isActive).length;
  const expiringSoon = apiKeys.filter((k) => {
    const exp = new Date(k.expiresAt).getTime();
    const now = Date.now();
    const diff = exp - now;
    return k.isActive && diff > 0 && diff < 30 * 24 * 60 * 60 * 1000;
  }).length;

  // Create API Key handler
  const handleCreate = async () => {
    if (!createName.trim()) {
      setCreateError("Name is required");
      return;
    }
    if (!createRoleId) {
      setCreateError("Please select a role");
      return;
    }

    setCreateSubmitting(true);
    setCreateError(null);

    try {
      const body: Record<string, unknown> = {
        name: createName.trim(),
        roleId: createRoleId,
        expiresInDays: createExpiry,
        rateLimit: parseInt(createRateLimit) || 1000,
      };

      if (createIpAllowlist.trim()) {
        body.ipAllowlist = createIpAllowlist
          .split(",")
          .map((ip) => ip.trim())
          .filter(Boolean);
      }

      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create API key");
      }

      const data = await res.json();

      // Close create dialog, open reveal
      setCreateOpen(false);
      resetCreateForm();
      setRevealKey(data.key);
      setRevealKeyName(data.name);
      setRevealOpen(true);

      // Refresh list
      await fetchApiKeys();
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Failed to create API key"
      );
    } finally {
      setCreateSubmitting(false);
    }
  };

  // Rotate handler
  const handleRotate = async () => {
    if (!rotateTarget) return;

    setRotateSubmitting(true);

    try {
      const res = await fetch(`/api/api-keys/${rotateTarget.id}`, {
        method: "PATCH",
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to rotate API key");
      }

      const data = await res.json();

      // Close rotate dialog, open reveal
      setRotateTarget(null);
      setRevealKey(data.key);
      setRevealKeyName(data.name);
      setRevealOpen(true);

      // Refresh list
      await fetchApiKeys();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to rotate API key");
    } finally {
      setRotateSubmitting(false);
    }
  };

  // Revoke handler
  const handleRevoke = async () => {
    if (!revokeTarget) return;

    setRevokeSubmitting(true);

    try {
      const res = await fetch(`/api/api-keys/${revokeTarget.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to revoke API key");
      }

      setRevokeTarget(null);
      await fetchApiKeys();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to revoke API key");
    } finally {
      setRevokeSubmitting(false);
    }
  };

  // Copy to clipboard
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(revealKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textArea = document.createElement("textarea");
      textArea.value = revealKey;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const resetCreateForm = () => {
    setCreateName("");
    setCreateRoleId("");
    setCreateExpiry(90);
    setCreateIpAllowlist("");
    setCreateRateLimit("1000");
    setCreateError(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Loading API keys...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <p className="text-red-400 text-sm">{error}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => {
              setError(null);
              setLoading(true);
              fetchApiKeys().finally(() => setLoading(false));
            }}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {
            label: "Total API Keys",
            value: totalKeys,
            icon: Key,
            color: "text-cyan-400",
          },
          {
            label: "Active Keys",
            value: activeKeys,
            icon: Shield,
            color: "text-emerald-400",
          },
          {
            label: "Expiring Soon",
            value: expiringSoon,
            icon: Clock,
            color: expiringSoon > 0 ? "text-yellow-400" : "text-slate-400",
          },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4 flex items-center gap-4">
              <div
                className={cn(
                  "w-12 h-12 rounded-lg flex items-center justify-center",
                  stat.color === "text-cyan-400" && "bg-cyan-500/10",
                  stat.color === "text-emerald-400" && "bg-emerald-500/10",
                  stat.color === "text-yellow-400" && "bg-yellow-500/10",
                  stat.color === "text-slate-400" && "bg-slate-500/10"
                )}
              >
                <stat.icon className={cn("w-6 h-6", stat.color)} />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stat.value}</p>
                <p className="text-xs text-slate-400">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* API Keys List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            API Keys ({apiKeys.length})
          </CardTitle>
          <Button
            size="sm"
            onClick={() => {
              resetCreateForm();
              setCreateOpen(true);
            }}
          >
            <Plus className="w-4 h-4 mr-2" />
            Create API Key
          </Button>
        </CardHeader>
        <CardContent>
          {apiKeys.length > 0 ? (
            <div className="space-y-2">
              {apiKeys.map((key) => {
                const isExpired =
                  new Date(key.expiresAt).getTime() < Date.now();
                const isExpiringSoon =
                  !isExpired &&
                  new Date(key.expiresAt).getTime() - Date.now() <
                    30 * 24 * 60 * 60 * 1000;

                return (
                  <div
                    key={key.id}
                    className={cn(
                      "flex items-center gap-4 p-4 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 transition-all border",
                      !key.isActive
                        ? "border-slate-800/50 opacity-60"
                        : "border-transparent hover:border-slate-700"
                    )}
                  >
                    <div
                      className={cn(
                        "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
                        key.isActive
                          ? "bg-cyan-500/10"
                          : "bg-slate-500/10"
                      )}
                    >
                      <Key
                        className={cn(
                          "w-5 h-5",
                          key.isActive
                            ? "text-cyan-400"
                            : "text-slate-500"
                        )}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-white">
                          {key.name}
                        </span>
                        <code className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded font-mono">
                          {key.keyPrefix}...
                        </code>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                        <span>Role: {key.role}</span>
                        <span className="text-slate-700">|</span>
                        <span>Rate: {key.rateLimit}/min</span>
                        <span className="text-slate-700">|</span>
                        <span>By {key.createdBy}</span>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <Badge
                        variant={
                          key.isActive
                            ? isExpired
                              ? "destructive"
                              : "success"
                            : "secondary"
                        }
                      >
                        {key.isActive
                          ? isExpired
                            ? "Expired"
                            : "Active"
                          : "Revoked"}
                      </Badge>
                      <p
                        className={cn(
                          "text-[10px]",
                          isExpiringSoon
                            ? "text-yellow-400"
                            : isExpired
                            ? "text-red-400"
                            : "text-slate-500"
                        )}
                      >
                        {isExpired
                          ? "Expired"
                          : `Expires ${formatDateTime(key.expiresAt)}`}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-1 flex-shrink-0 min-w-[80px]">
                      <span className="text-[10px] text-slate-500">
                        Last used
                      </span>
                      <span className="text-xs text-slate-400">
                        {key.lastUsedAt
                          ? formatRelativeTime(key.lastUsedAt)
                          : "Never"}
                      </span>
                    </div>

                    <div className="flex gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-400 hover:text-cyan-400"
                        title="Rotate key"
                        disabled={!key.isActive}
                        onClick={() => setRotateTarget(key)}
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-400 hover:text-red-400"
                        title="Revoke key"
                        disabled={!key.isActive}
                        onClick={() => setRevokeTarget(key)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-slate-500">
              <Key className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No API keys created yet.</p>
              <p className="text-xs text-slate-600 mt-1">
                Create an API key for CI/CD pipelines and integrations.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Security Notice */}
      <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/5 border border-amber-500/20">
        <Shield className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-amber-400">
            API Key Security
          </p>
          <p className="text-xs text-slate-400 mt-1">
            API keys grant programmatic access to your BYOC tenant. Keys are
            shown only once at creation. Rotate keys every 90 days. Use IP
            allowlisting for production keys.
          </p>
        </div>
      </div>

      {/* ==================== Create API Key Dialog ==================== */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!open) resetCreateForm();
          setCreateOpen(open);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create API Key</DialogTitle>
            <DialogDescription>
              Generate a new API key for programmatic access to your tenant.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">
                Name <span className="text-red-400">*</span>
              </label>
              <Input
                placeholder="e.g., CI/CD Pipeline Key"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
              />
            </div>

            {/* Role */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">
                Role <span className="text-red-400">*</span>
              </label>
              <select
                className="flex h-10 w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all duration-200"
                value={createRoleId}
                onChange={(e) => setCreateRoleId(e.target.value)}
              >
                <option value="" className="bg-slate-800">
                  Select a role...
                </option>
                {roles.map((role) => (
                  <option
                    key={role.id}
                    value={role.id}
                    className="bg-slate-800"
                  >
                    {role.name} ({role.capabilityCount} capabilities)
                  </option>
                ))}
              </select>
            </div>

            {/* Expiry */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">
                Expiry
              </label>
              <select
                className="flex h-10 w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all duration-200"
                value={createExpiry}
                onChange={(e) => setCreateExpiry(Number(e.target.value))}
              >
                {EXPIRY_OPTIONS.map((opt) => (
                  <option
                    key={opt.value}
                    value={opt.value}
                    className="bg-slate-800"
                  >
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* IP Allowlist */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">
                IP Allowlist{" "}
                <span className="text-slate-500 font-normal">(optional)</span>
              </label>
              <Input
                placeholder="e.g., 10.0.0.1, 192.168.1.0/24"
                value={createIpAllowlist}
                onChange={(e) => setCreateIpAllowlist(e.target.value)}
              />
              <p className="text-[11px] text-slate-500">
                Comma-separated IPs or CIDR ranges. Leave blank for unrestricted
                access.
              </p>
            </div>

            {/* Rate Limit */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">
                Rate Limit{" "}
                <span className="text-slate-500 font-normal">
                  (requests/min)
                </span>
              </label>
              <Input
                type="number"
                placeholder="1000"
                value={createRateLimit}
                onChange={(e) => setCreateRateLimit(e.target.value)}
                min={1}
              />
            </div>

            {createError && (
              <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                {createError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={createSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createSubmitting}>
              {createSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Key
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== Key Reveal Dialog ==================== */}
      <Dialog
        open={revealOpen}
        onOpenChange={(open) => {
          if (!open) {
            setRevealKey("");
            setRevealKeyName("");
            setCopied(false);
          }
          setRevealOpen(open);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              API Key Generated
            </DialogTitle>
            <DialogDescription>
              Your new API key for &quot;{revealKeyName}&quot; has been created
              successfully.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Warning */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-400">
                  This key will only be shown once
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Copy it now and store it securely. You will not be able to see
                  it again.
                </p>
              </div>
            </div>

            {/* Key display */}
            <div className="relative">
              <pre className="bg-slate-950 border border-slate-700 rounded-lg p-4 text-sm font-mono text-cyan-400 break-all whitespace-pre-wrap pr-12">
                {revealKey}
              </pre>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "absolute top-2 right-2 h-8 w-8",
                  copied
                    ? "text-emerald-400 hover:text-emerald-300"
                    : "text-slate-400 hover:text-white"
                )}
                onClick={handleCopy}
              >
                {copied ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>

            {copied && (
              <p className="text-xs text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Copied to clipboard
              </p>
            )}
          </div>

          <DialogFooter>
            <Button onClick={() => setRevealOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== Rotate Confirmation Dialog ==================== */}
      <Dialog
        open={!!rotateTarget}
        onOpenChange={(open) => {
          if (!open) setRotateTarget(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-cyan-400" />
              Rotate API Key
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to rotate the key &quot;
              {rotateTarget?.name}&quot;?
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-slate-300">
                  The current key will stop working immediately. A new key will
                  be generated and shown to you once.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRotateTarget(null)}
              disabled={rotateSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={handleRotate} disabled={rotateSubmitting}>
              {rotateSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Rotating...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Rotate Key
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== Revoke Confirmation Dialog ==================== */}
      <Dialog
        open={!!revokeTarget}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-400" />
              Revoke API Key
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to revoke the key &quot;
              {revokeTarget?.name}&quot;?
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-slate-300">
                  This action cannot be undone. Any systems using this key will
                  immediately lose access.
                </p>
              </div>
            </div>

            {revokeTarget && (
              <div className="mt-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                <div className="flex items-center gap-2">
                  <Key className="w-4 h-4 text-slate-500" />
                  <span className="text-sm text-white font-medium">
                    {revokeTarget.name}
                  </span>
                  <code className="text-xs text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded font-mono">
                    {revokeTarget.keyPrefix}...
                  </code>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Role: {revokeTarget.role} | Created by{" "}
                  {revokeTarget.createdBy}
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRevokeTarget(null)}
              disabled={revokeSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRevoke}
              disabled={revokeSubmitting}
            >
              {revokeSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Revoking...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Revoke Key
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
