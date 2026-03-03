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
  Users,
  UserPlus,
  Shield,
  Search,
  Mail,
  Clock,
  Loader2,
  RefreshCw,
  XCircle,
  Copy,
  Check,
  Link2,
  Globe,
  Target,
} from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";

interface RoleOption {
  id: string;
  name: string;
  slug: string;
}

interface ScopeItem {
  id: string;
  name: string;
  description: string | null;
  isGlobal: boolean;
  userCount: number;
}

interface UserItem {
  id: string;
  name: string;
  email: string;
  status: string;
  authProvider: string;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  avatarUrl: string | null;
  department: string | null;
  phone: string | null;
  roles: { id: string; name: string; slug: string }[];
  scopes: { id: string; name: string; isGlobal: boolean }[];
  invitation: {
    id: string;
    status: string;
    expiresAt: string;
    createdAt: string;
  } | null;
  createdAt: string;
}

const statusVariants: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  active: "success",
  invited: "warning",
  suspended: "destructive",
  deactivated: "secondary",
};

const authProviderLabels: Record<string, string> = {
  local: "Email/Password",
  google: "Google SSO",
  azure_ad: "Azure AD",
  okta: "Okta",
};

export default function UsersPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [inviteForm, setInviteForm] = useState({ name: "", email: "", roleId: "" });
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState<{ link: string; message: string } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showScopesDialog, setShowScopesDialog] = useState(false);
  const [scopesUser, setScopesUser] = useState<UserItem | null>(null);
  const [availableScopes, setAvailableScopes] = useState<ScopeItem[]>([]);
  const [scopeLoading, setScopeLoading] = useState<string | null>(null);

  function loadUsers() {
    fetch("/api/users")
      .then((res) => res.json())
      .then(setUsers)
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadUsers();
    fetch("/api/roles")
      .then((res) => res.json())
      .then((data: RoleOption[]) => setRoles(data))
      .catch(console.error);
  }, []);

  async function handleInvite() {
    if (!inviteForm.name || !inviteForm.email || !inviteForm.roleId) return;
    setInviting(true);
    setInviteError("");
    setInviteSuccess(null);

    try {
      const res = await fetch("/api/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inviteForm),
      });
      const data = await res.json();

      if (!res.ok) {
        setInviteError(data.error || "Failed to invite user");
        return;
      }

      setInviteSuccess({ link: data.inviteLink, message: data.message });
      setInviteForm({ name: "", email: "", roleId: "" });
      loadUsers();
    } catch {
      setInviteError("Connection error");
    } finally {
      setInviting(false);
    }
  }

  async function handleResend(invitationId: string) {
    setActionLoading(invitationId);
    try {
      const res = await fetch("/api/users/invite/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invitationId }),
      });
      if (res.ok) {
        loadUsers();
      }
    } catch {
      console.error("Failed to resend invitation");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRevoke(invitationId: string) {
    setActionLoading(invitationId);
    try {
      const res = await fetch("/api/users/invite/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invitationId }),
      });
      if (res.ok) {
        loadUsers();
      }
    } catch {
      console.error("Failed to revoke invitation");
    } finally {
      setActionLoading(null);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function isAdminUser(user: UserItem) {
    return user.roles.some((r) => r.slug === "platform-admin" || r.slug === "org-admin");
  }

  async function openScopesDialog(user: UserItem) {
    setScopesUser(user);
    setShowScopesDialog(true);
    try {
      const res = await fetch("/api/scopes");
      const data: ScopeItem[] = await res.json();
      setAvailableScopes(data);
    } catch {
      console.error("Failed to load scopes");
    }
  }

  async function handleScopeToggle(userId: string, scopeId: string, assigned: boolean) {
    setScopeLoading(scopeId);
    try {
      if (assigned) {
        await fetch(`/api/users/${userId}/scopes/${scopeId}`, { method: "DELETE" });
      } else {
        await fetch(`/api/users/${userId}/scopes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scopeId }),
        });
      }
      loadUsers();
      // Refresh the scopes user data
      const res = await fetch("/api/users");
      const updatedUsers: UserItem[] = await res.json();
      const updated = updatedUsers.find((u) => u.id === userId);
      if (updated) setScopesUser(updated);
    } catch {
      console.error("Failed to toggle scope");
    } finally {
      setScopeLoading(null);
    }
  }

  function getInvitationStatusInfo(user: UserItem) {
    if (!user.invitation || user.status !== "invited") return null;
    const inv = user.invitation;
    const isExpired = new Date(inv.expiresAt) < new Date();

    if (inv.status === "revoked") return { label: "Revoked", variant: "destructive" as const };
    if (isExpired || inv.status === "expired") return { label: "Expired", variant: "secondary" as const };
    if (inv.status === "pending") return { label: "Pending", variant: "warning" as const };
    return null;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Loading users...</p>
        </div>
      </div>
    );
  }

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeCount = users.filter((u) => u.status === "active").length;
  const invitedCount = users.filter((u) => u.status === "invited").length;
  const mfaCount = users.filter((u) => u.mfaEnabled).length;

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "Total Users", value: users.length, icon: Users, color: "text-cyan-400" },
          { label: "Active", value: activeCount, icon: Users, color: "text-emerald-400" },
          { label: "Pending Invites", value: invitedCount, icon: Mail, color: "text-yellow-400" },
          { label: "MFA Enabled", value: mfaCount, icon: Shield, color: "text-purple-400" },
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

      {/* Search + Invite */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search users by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50"
          />
        </div>
        <Button onClick={() => { setShowInvite(true); setInviteSuccess(null); setInviteError(""); }}>
          <UserPlus className="w-4 h-4 mr-2" />
          Invite User
        </Button>
      </div>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Users ({filteredUsers.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Table Header */}
          <div className="hidden md:grid grid-cols-[2fr_2fr_1.2fr_1.2fr_1fr_1fr_1.5fr] gap-4 px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider border-b border-slate-800 mb-2">
            <span>User</span>
            <span>Email</span>
            <span>Roles</span>
            <span>Scopes</span>
            <span>Auth</span>
            <span>Last Login</span>
            <span>Status</span>
          </div>
          <div className="space-y-1">
            {filteredUsers.map((user) => {
              const invStatus = getInvitationStatusInfo(user);
              const isInvitePending = user.status === "invited" && user.invitation?.status === "pending" && new Date(user.invitation.expiresAt) > new Date();

              return (
                <div
                  key={user.id}
                  className="grid grid-cols-1 md:grid-cols-[2fr_2fr_1.2fr_1.2fr_1fr_1fr_1.5fr] gap-4 items-center p-4 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 transition-all border border-transparent hover:border-slate-700"
                >
                  {/* User Name */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-white">
                        {user.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{user.name}</p>
                      {user.department && (
                        <span className="text-[10px] text-slate-500">{user.department}</span>
                      )}
                      {user.mfaEnabled && (
                        <span className="text-[10px] text-emerald-400 ml-2">MFA</span>
                      )}
                    </div>
                  </div>

                  {/* Email */}
                  <div className="min-w-0">
                    <p className="text-sm text-slate-400 truncate">{user.email}</p>
                  </div>

                  {/* Roles */}
                  <div className="flex gap-1 flex-wrap">
                    {user.roles.map((role) => (
                      <Badge key={role.id} variant="outline" className="text-[10px]">
                        {role.name}
                      </Badge>
                    ))}
                    {user.roles.length === 0 && (
                      <span className="text-xs text-slate-500">No roles</span>
                    )}
                  </div>

                  {/* Scopes */}
                  <div className="flex gap-1 flex-wrap items-center">
                    {isAdminUser(user) ? (
                      <Badge variant="info" className="text-[10px]">
                        <Globe className="w-3 h-3 mr-1" />
                        Implicit Global
                      </Badge>
                    ) : (
                      <>
                        {user.scopes.map((scope) => (
                          <Badge
                            key={scope.id}
                            variant={scope.isGlobal ? "info" : "outline"}
                            className="text-[10px]"
                          >
                            {scope.isGlobal && <Globe className="w-3 h-3 mr-1" />}
                            {scope.name}
                          </Badge>
                        ))}
                        {user.scopes.length === 0 && (
                          <span className="text-xs text-slate-500">No scopes</span>
                        )}
                      </>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-slate-500 hover:text-cyan-400"
                      onClick={() => openScopesDialog(user)}
                    >
                      <Target className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  {/* Auth Provider */}
                  <div>
                    <span className="text-xs text-slate-400">
                      {authProviderLabels[user.authProvider] || user.authProvider}
                    </span>
                  </div>

                  {/* Last Login */}
                  <div>
                    <span className="text-xs text-slate-500">
                      {user.lastLoginAt ? formatRelativeTime(user.lastLoginAt) : "Never"}
                    </span>
                  </div>

                  {/* Status + Actions */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={statusVariants[user.status] || "secondary"}>
                      {user.status}
                    </Badge>

                    {/* Invitation status detail */}
                    {invStatus && invStatus.label !== "Pending" && (
                      <Badge variant={invStatus.variant} className="text-[10px]">
                        {invStatus.label}
                      </Badge>
                    )}

                    {/* Expiry info for pending invites */}
                    {isInvitePending && user.invitation && (
                      <span className="text-[10px] text-slate-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Expires {formatRelativeTime(user.invitation.expiresAt)}
                      </span>
                    )}

                    {/* Action buttons for invited users */}
                    {user.invitation && user.status === "invited" && (
                      <div className="flex items-center gap-1 ml-auto">
                        {user.invitation.status === "pending" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-cyan-400 hover:text-cyan-300"
                            disabled={actionLoading === user.invitation.id}
                            onClick={() => handleResend(user.invitation!.id)}
                          >
                            {actionLoading === user.invitation.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <RefreshCw className="w-3 h-3 mr-1" />
                            )}
                            Resend
                          </Button>
                        )}
                        {user.invitation.status === "pending" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-red-400 hover:text-red-300"
                            disabled={actionLoading === user.invitation.id}
                            onClick={() => handleRevoke(user.invitation!.id)}
                          >
                            <XCircle className="w-3 h-3 mr-1" />
                            Revoke
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {filteredUsers.length === 0 && (
              <div className="text-center py-12 text-slate-500">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>
                  {searchQuery
                    ? "No users match your search."
                    : "No users found."}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Invite User Dialog */}
      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite User</DialogTitle>
            <DialogDescription>
              Send an invitation to join your organization. They&apos;ll receive an email with an onboarding link.
            </DialogDescription>
          </DialogHeader>

          {inviteSuccess ? (
            // Success state — show invite link
            <div className="space-y-4 py-2">
              <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <Check className="w-5 h-5 text-emerald-400" />
                  <p className="text-sm font-medium text-emerald-400">{inviteSuccess.message}</p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                  <Link2 className="w-4 h-4" />
                  Invitation Link
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={inviteSuccess.link}
                    className="flex-1 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700 text-xs text-slate-300 font-mono"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(inviteSuccess.link)}
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-slate-500">
                  Share this link with the invitee if they didn&apos;t receive the email.
                </p>
              </div>

              <DialogFooter>
                <Button onClick={() => { setShowInvite(false); setInviteSuccess(null); }}>
                  Done
                </Button>
              </DialogFooter>
            </div>
          ) : (
            // Invite form
            <>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">Full Name</label>
                  <Input
                    placeholder="John Smith"
                    value={inviteForm.name}
                    onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">Email Address</label>
                  <Input
                    type="email"
                    placeholder="john@company.com"
                    value={inviteForm.email}
                    onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">Role</label>
                  <div className="space-y-2">
                    {roles.map((role) => (
                      <button
                        key={role.id}
                        onClick={() => setInviteForm({ ...inviteForm, roleId: role.id })}
                        className={cn(
                          "w-full p-3 rounded-lg border text-left text-sm transition-all",
                          inviteForm.roleId === role.id
                            ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-400"
                            : "border-slate-700 text-slate-400 hover:border-slate-600"
                        )}
                      >
                        {role.name}
                      </button>
                    ))}
                  </div>
                </div>

                {inviteError && (
                  <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                    {inviteError}
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setShowInvite(false)}>Cancel</Button>
                <Button
                  onClick={handleInvite}
                  disabled={inviting || !inviteForm.name || !inviteForm.email || !inviteForm.roleId}
                >
                  {inviting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Mail className="w-4 h-4" />
                      Send Invitation
                    </>
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Manage Scopes Dialog */}
      <Dialog open={showScopesDialog} onOpenChange={setShowScopesDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="w-5 h-5 text-cyan-400" />
              Manage Scopes &mdash; {scopesUser?.name}
            </DialogTitle>
            <DialogDescription>
              Assign or remove data scopes for this user. Scopes control which tagged resources the user can access.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 max-h-[400px] overflow-y-auto">
            {scopesUser && isAdminUser(scopesUser) && (
              <div className="px-4 py-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-sm flex items-center gap-2">
                <Globe className="w-4 h-4 flex-shrink-0" />
                Admin roles have implicit global access
              </div>
            )}

            {availableScopes.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <Target className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No scopes available</p>
              </div>
            ) : (
              availableScopes.map((scope) => {
                const isAssigned = scopesUser?.scopes.some((s) => s.id === scope.id) ?? false;
                const isScopeLoading = scopeLoading === scope.id;

                return (
                  <button
                    key={scope.id}
                    onClick={() => scopesUser && handleScopeToggle(scopesUser.id, scope.id, isAssigned)}
                    disabled={isScopeLoading}
                    className={cn(
                      "w-full p-3 rounded-lg border text-left text-sm transition-all flex items-center gap-3",
                      isAssigned
                        ? "border-cyan-500/50 bg-cyan-500/10"
                        : "border-slate-700 hover:border-slate-600"
                    )}
                  >
                    <div className={cn(
                      "w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                      isAssigned
                        ? "border-cyan-500 bg-cyan-500"
                        : "border-slate-600"
                    )}>
                      {isScopeLoading ? (
                        <Loader2 className="w-3 h-3 animate-spin text-white" />
                      ) : isAssigned ? (
                        <Check className="w-3 h-3 text-white" />
                      ) : null}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "font-medium",
                          isAssigned ? "text-cyan-400" : "text-slate-300"
                        )}>
                          {scope.name}
                        </span>
                        {scope.isGlobal && (
                          <Badge variant="info" className="text-[10px]">
                            <Globe className="w-3 h-3 mr-1" />
                            Global
                          </Badge>
                        )}
                      </div>
                      {scope.description && (
                        <p className="text-xs text-slate-500 mt-0.5 truncate">{scope.description}</p>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-600 flex-shrink-0">
                      {scope.userCount} user{scope.userCount !== 1 ? "s" : ""}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowScopesDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
