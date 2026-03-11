"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Monitor,
  Laptop,
  Smartphone,
  Globe,
  Trash2,
  ShieldAlert,
  Users,
  MapPin,
  ChevronDown,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { cn, formatRelativeTime, formatDateTime } from "@/lib/utils";
import { useCapabilities } from "@/hooks/useCapabilities";

interface Session {
  id: string;
  ipAddress: string | null;
  device: string | null;
  userAgent: string | null;
  lastActiveAt: string;
  createdAt: string;
  city: string | null;
  country: string | null;
}

interface AdminSession extends Session {
  userId: string;
  userName: string;
  userEmail: string;
  userStatus: string;
  userAvatarUrl: string | null;
}

interface UserGroup {
  userId: string;
  userName: string;
  userEmail: string;
  userStatus: string;
  sessions: AdminSession[];
}

function getDeviceIcon(device: string | null): React.ElementType {
  if (!device) return Monitor;
  const d = device.toLowerCase();
  if (d.includes("mobile") || d.includes("phone") || d.includes("android") || d.includes("iphone")) {
    return Smartphone;
  }
  if (d.includes("desktop") || d.includes("laptop") || d.includes("mac") || d.includes("windows")) {
    return Laptop;
  }
  return Monitor;
}

export default function SessionsPage() {
  const { can } = useCapabilities();
  const [mySessions, setMySessions] = useState<Session[]>([]);
  const [adminSessions, setAdminSessions] = useState<AdminSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminLoading, setAdminLoading] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);

  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    type: "revoke" | "revoke-all" | "admin-revoke";
    sessionId?: string;
    sessionLabel?: string;
  }>({ open: false, type: "revoke" });

  // M7: Track current browser's user agent to identify current session
  const [currentUA, setCurrentUA] = useState("");

  // Admin expandable users
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  const isAdmin = can("admin.user.view");
  const canManage = can("admin.user.manage");

  const fetchMySessions = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/sessions");
      if (!res.ok) return;
      const data = await res.json();
      setMySessions(data.sessions || []);
    } catch (err) {
      console.error("Failed to load sessions:", err);
    }
  }, []);

  const fetchAdminSessions = useCallback(async () => {
    if (!isAdmin) return;
    setAdminLoading(true);
    try {
      const res = await fetch("/api/sessions");
      if (!res.ok) return;
      const data = await res.json();
      setAdminSessions(data.sessions || []);
    } catch (err) {
      console.error("Failed to load admin sessions:", err);
    } finally {
      setAdminLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    setCurrentUA(navigator.userAgent);
    Promise.all([fetchMySessions(), fetchAdminSessions()])
      .finally(() => setLoading(false));
  }, [fetchMySessions, fetchAdminSessions]);

  const handleRevoke = async (sessionId: string) => {
    setRevoking(sessionId);
    try {
      const res = await fetch(`/api/auth/sessions/${sessionId}`, { method: "DELETE" });
      if (res.ok) {
        setMySessions((prev) => prev.filter((s) => s.id !== sessionId));
        setAdminSessions((prev) => prev.filter((s) => s.id !== sessionId));
      } else {
        alert("Failed to revoke session. Please try again.");
      }
    } catch (err) {
      console.error("Failed to revoke session:", err);
      alert("Failed to revoke session. Please try again.");
    } finally {
      setRevoking(null);
      setConfirmDialog({ open: false, type: "revoke" });
    }
  };

  const handleRevokeAll = async () => {
    setRevokingAll(true);
    try {
      // Find current session ID by user agent to exclude it from revocation
      const currentSession = mySessions.find((s) => currentUA && s.userAgent === currentUA);
      const res = await fetch("/api/auth/sessions/revoke-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          excludeSessionId: currentSession?.id,
        }),
      });
      if (res.ok) {
        await fetchMySessions();
        if (isAdmin) await fetchAdminSessions();
      } else {
        alert("Failed to revoke all sessions. Please try again.");
      }
    } catch (err) {
      console.error("Failed to revoke all sessions:", err);
      alert("Failed to revoke all sessions. Please try again.");
    } finally {
      setRevokingAll(false);
      setConfirmDialog({ open: false, type: "revoke-all" });
    }
  };

  // Stats
  const uniqueDevices = new Set(mySessions.map((s) => s.device || "Unknown")).size;
  const uniqueLocations = new Set(mySessions.map((s) => s.ipAddress || "Unknown")).size;

  // Group admin sessions by user
  const userGroups: UserGroup[] = [];
  if (adminSessions.length > 0) {
    const grouped = new Map<string, UserGroup>();
    for (const session of adminSessions) {
      if (!grouped.has(session.userId)) {
        grouped.set(session.userId, {
          userId: session.userId,
          userName: session.userName,
          userEmail: session.userEmail,
          userStatus: session.userStatus,
          sessions: [],
        });
      }
      grouped.get(session.userId)!.sessions.push(session);
    }
    userGroups.push(...Array.from(grouped.values()));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Loading sessions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "Active Sessions", value: mySessions.length, icon: Monitor, color: "text-cyan-400" },
          { label: "Unique Devices", value: uniqueDevices, icon: Laptop, color: "text-emerald-400" },
          { label: "Unique Locations", value: uniqueLocations, icon: MapPin, color: "text-amber-400" },
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

      {/* My Sessions */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">My Sessions</CardTitle>
          {mySessions.length > 1 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() =>
                setConfirmDialog({
                  open: true,
                  type: "revoke-all",
                })
              }
              disabled={revokingAll}
            >
              {revokingAll ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <ShieldAlert className="w-4 h-4 mr-2" />
              )}
              Revoke All Other Sessions
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {mySessions.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Monitor className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No active sessions found.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {mySessions.map((session) => {
                const DeviceIcon = getDeviceIcon(session.device);
                const isCurrentSession = currentUA !== "" && session.userAgent === currentUA;
                return (
                  <div
                    key={session.id}
                    className={cn(
                      "flex items-center gap-4 p-4 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 transition-all border border-transparent hover:border-slate-700",
                      isCurrentSession && "border-l-2 !border-l-emerald-500/70"
                    )}
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
                      isCurrentSession ? "bg-emerald-500/20" : "bg-cyan-500/20"
                    )}>
                      <DeviceIcon className={cn("w-5 h-5", isCurrentSession ? "text-emerald-400" : "text-cyan-400")} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">
                          {session.device || "Unknown Device"}
                        </span>
                        {isCurrentSession && (
                          <Badge variant="success" className="text-[10px] px-1.5 py-0 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            This device
                          </Badge>
                        )}
                        {session.city && session.country && (
                          <span className="text-xs text-slate-500 flex items-center gap-1">
                            <Globe className="w-3 h-3" />
                            {session.city}, {session.country}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
                        {session.ipAddress && <span>IP: {session.ipAddress}</span>}
                        <span>Last active: {formatRelativeTime(session.lastActiveAt)}</span>
                        <span>Created: {formatRelativeTime(session.createdAt)}</span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Revoke session on ${session.device || "Unknown Device"}`}
                      className={cn(
                        "hover:bg-red-500/10",
                        isCurrentSession ? "text-slate-500 hover:text-red-300" : "text-red-400 hover:text-red-300"
                      )}
                      onClick={() =>
                        setConfirmDialog({
                          open: true,
                          type: "revoke",
                          sessionId: session.id,
                          sessionLabel: isCurrentSession
                            ? `${session.device || "Unknown Device"} (⚠ this is your current session!)`
                            : session.device || "Unknown Device",
                        })
                      }
                      disabled={revoking === session.id}
                    >
                      {revoking === session.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Admin: All User Sessions */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-5 h-5 text-cyan-400" />
              All User Sessions
              {adminLoading && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {userGroups.length === 0 && !adminLoading ? (
              <div className="text-center py-12 text-slate-500">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No sessions found.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {userGroups.map((group) => {
                  const isExpanded = expandedUser === group.userId;
                  return (
                    <div key={group.userId}>
                      <div
                        onClick={() => setExpandedUser(isExpanded ? null : group.userId)}
                        className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 transition-all cursor-pointer border border-transparent hover:border-slate-700"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-slate-500 flex-shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" />
                        )}
                        <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-medium text-white">
                            {group.userName.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-white">{group.userName}</span>
                            <span className="text-xs text-slate-500">{group.userEmail}</span>
                            <Badge
                              variant={group.userStatus === "active" ? "success" : "destructive"}
                              className="text-[10px]"
                            >
                              {group.userStatus}
                            </Badge>
                          </div>
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          {group.sessions.length} session{group.sessions.length !== 1 ? "s" : ""}
                        </Badge>
                      </div>

                      {isExpanded && (
                        <div className="ml-8 mt-1 space-y-2">
                          {group.sessions.map((session) => {
                            const DeviceIcon = getDeviceIcon(session.device);
                            return (
                              <div
                                key={session.id}
                                className="flex items-center gap-3 p-3 rounded-lg bg-slate-900/50 border border-slate-800"
                              >
                                <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center flex-shrink-0">
                                  <DeviceIcon className="w-4 h-4 text-slate-400" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-medium text-slate-300">
                                      {session.device || "Unknown Device"}
                                    </span>
                                    {session.city && session.country && (
                                      <span className="text-[10px] text-slate-500 flex items-center gap-1">
                                        <Globe className="w-3 h-3" />
                                        {session.city}, {session.country}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3 mt-0.5 text-[10px] text-slate-600">
                                    {session.ipAddress && <span>IP: {session.ipAddress}</span>}
                                    <span>Active: {formatRelativeTime(session.lastActiveAt)}</span>
                                  </div>
                                </div>
                                {canManage && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setConfirmDialog({
                                        open: true,
                                        type: "admin-revoke",
                                        sessionId: session.id,
                                        sessionLabel: `${group.userName} - ${session.device || "Unknown Device"}`,
                                      });
                                    }}
                                    disabled={revoking === session.id}
                                  >
                                    {revoking === session.id ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <Trash2 className="w-4 h-4" />
                                    )}
                                  </Button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Confirmation Dialog */}
      <Dialog
        open={confirmDialog.open}
        onOpenChange={(open) => {
          if (!open) setConfirmDialog({ open: false, type: "revoke" });
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmDialog.type === "revoke-all"
                ? "Revoke All Other Sessions"
                : "Revoke Session"}
            </DialogTitle>
            <DialogDescription>
              {confirmDialog.type === "revoke-all"
                ? "This will sign out all other sessions except your current one. You will remain logged in on this device."
                : `Are you sure you want to revoke the session "${confirmDialog.sessionLabel}"? This will immediately sign out that session.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDialog({ open: false, type: "revoke" })}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (confirmDialog.type === "revoke-all") {
                  handleRevokeAll();
                } else if (confirmDialog.sessionId) {
                  handleRevoke(confirmDialog.sessionId);
                }
              }}
              disabled={revoking !== null || revokingAll}
            >
              {(revoking !== null || revokingAll) && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              {confirmDialog.type === "revoke-all" ? "Revoke All" : "Revoke"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
