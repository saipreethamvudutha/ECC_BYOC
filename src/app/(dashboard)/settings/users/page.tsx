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
  MoreVertical,
  UserMinus,
  UserCheck,
  ShieldCheck,
  Filter,
  X,
  ChevronDown,
  AlertTriangle,
} from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import { useCapabilities } from "@/hooks/useCapabilities";
import { PageGate } from "@/components/rbac/PageGate";

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

interface RoleDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isBuiltin: boolean;
  isActive: boolean;
  maxAssignments: number | null;
  capabilityCount: number;
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
  const { can } = useCapabilities();
  const canManageUsers = can("admin.user.manage");

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

  // Phase 3: Filters
  const [filterRole, setFilterRole] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterScope, setFilterScope] = useState("");

  // Phase 3: Role management dialog
  const [showRolesDialog, setShowRolesDialog] = useState(false);
  const [rolesUser, setRolesUser] = useState<UserItem | null>(null);
  const [allRoles, setAllRoles] = useState<RoleDetail[]>([]);
  const [roleToggleLoading, setRoleToggleLoading] = useState<string | null>(null);
  const [roleError, setRoleError] = useState("");

  // Phase 3: Suspend/Reactivate dialog
  const [showSuspendDialog, setShowSuspendDialog] = useState(false);
  const [suspendUser, setSuspendUser] = useState<UserItem | null>(null);
  const [suspendAction, setSuspendAction] = useState<"suspend" | "reactivate">("suspend");
  const [suspendLoading, setSuspendLoading] = useState(false);
  const [suspendError, setSuspendError] = useState("");

  // Phase 3: Action menu
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Current user session
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  function loadUsers() {
    fetch("/api/users")
      .then((res) => {
        if (!res.ok) {
          console.error("Failed to load users:", res.status);
          return [];
        }
        return res.json();
      })
      .then(setUsers)
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadUsers();
    fetch("/api/roles")
      .then((res) => {
        if (!res.ok) {
          console.error("Failed to load roles:", res.status);
          return [];
        }
        return res.json();
      })
      .then((data: RoleOption[]) => setRoles(data))
      .catch(console.error);
    fetch("/api/auth/me")
      .then((res) => {
        if (!res.ok) {
          console.error("Failed to load current user:", res.status);
          return null;
        }
        return res.json();
      })
      .then((data: { user: { id: string } } | null) => {
        if (data) setCurrentUserId(data.user.id);
      })
      .catch(console.error);
    fetch("/api/scopes")
      .then((res) => {
        if (!res.ok) {
          console.error("Failed to load scopes:", res.status);
          return [];
        }
        return res.json();
      })
      .then((data: ScopeItem[]) => setAvailableScopes(data))
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

  // Phase 3: Open Manage Roles dialog
  async function openRolesDialog(user: UserItem) {
    setRolesUser(user);
    setShowRolesDialog(true);
    setRoleError("");
    try {
      const res = await fetch("/api/roles");
      const data: RoleDetail[] = await res.json();
      setAllRoles(data);
    } catch {
      console.error("Failed to load roles");
    }
  }

  // Phase 3: Toggle role assignment
  async function handleRoleToggle(userId: string, roleId: string, isAssigned: boolean) {
    setRoleToggleLoading(roleId);
    setRoleError("");
    try {
      if (isAssigned) {
        const res = await fetch(`/api/users/${userId}/roles/${roleId}`, { method: "DELETE" });
        if (!res.ok) {
          const data = await res.json();
          setRoleError(data.error || "Failed to remove role");
          return;
        }
      } else {
        const res = await fetch(`/api/users/${userId}/roles`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roleId }),
        });
        if (!res.ok) {
          const data = await res.json();
          setRoleError(data.error || "Failed to assign role");
          return;
        }
      }
      // Reload users list
      const res = await fetch("/api/users");
      const updatedUsers: UserItem[] = await res.json();
      setUsers(updatedUsers);
      const updated = updatedUsers.find((u) => u.id === userId);
      if (updated) setRolesUser(updated);
      // Reload roles to get updated user counts
      const rolesRes = await fetch("/api/roles");
      const rolesData: RoleDetail[] = await rolesRes.json();
      setAllRoles(rolesData);
    } catch {
      setRoleError("Connection error");
    } finally {
      setRoleToggleLoading(null);
    }
  }

  // Phase 3: Open suspend/reactivate confirmation dialog
  function openSuspendDialog(user: UserItem, action: "suspend" | "reactivate") {
    setSuspendUser(user);
    setSuspendAction(action);
    setSuspendError("");
    setShowSuspendDialog(true);
  }

  // Phase 3: Execute suspend/reactivate
  async function handleSuspendConfirm() {
    if (!suspendUser) return;
    setSuspendLoading(true);
    setSuspendError("");
    try {
      const res = await fetch(`/api/users/${suspendUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: suspendAction === "suspend" ? "suspended" : "active" }),
      });
      if (!res.ok) {
        const data = await res.json();
        setSuspendError(data.error || `Failed to ${suspendAction} user`);
        return;
      }
      setShowSuspendDialog(false);
      loadUsers();
    } catch {
      setSuspendError("Connection error");
    } finally {
      setSuspendLoading(false);
    }
  }

  // Phase 3: Check if filters are active
  const hasActiveFilters = filterRole !== "" || filterStatus !== "" || filterScope !== "";

  function clearFilters() {
    setFilterRole("");
    setFilterStatus("");
    setFilterScope("");
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

  const filteredUsers = users.filter((u) => {
    // Text search
    const matchesSearch =
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase());
    // Role filter
    const matchesRole = filterRole === "" || u.roles.some((r) => r.id === filterRole);
    // Status filter
    const matchesStatus = filterStatus === "" || u.status === filterStatus;
    // Scope filter
    const matchesScope = filterScope === "" || u.scopes.some((s) => s.id === filterScope);
    return matchesSearch && matchesRole && matchesStatus && matchesScope;
  });

  const activeCount = users.filter((u) => u.status === "active").length;
  const invitedCount = users.filter((u) => u.status === "invited").length;
  const suspendedCount = users.filter((u) => u.status === "suspended").length;
  const mfaCount = users.filter((u) => u.mfaEnabled).length;

  return (
    <PageGate capability="admin.user.view" title="User Management">
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

      {/* Search + Filters + Invite */}
      <div className="space-y-3">
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
          {canManageUsers ? (
            <Button onClick={() => { setShowInvite(true); setInviteSuccess(null); setInviteError(""); }}>
              <UserPlus className="w-4 h-4 mr-2" />
              Invite User
            </Button>
          ) : (
            <Button disabled className="opacity-50 cursor-not-allowed" title="You don't have permission to invite users">
              <UserPlus className="w-4 h-4 mr-2" />
              Invite User
            </Button>
          )}
        </div>

        {/* Filter Dropdowns */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Filter className="w-3.5 h-3.5" />
            <span>Filters:</span>
          </div>

          {/* Role Filter */}
          <div className="relative">
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="appearance-none pl-3 pr-8 py-1.5 rounded-md bg-slate-800/50 border border-slate-700 text-xs text-slate-300 focus:outline-none focus:border-cyan-500/50 cursor-pointer"
            >
              <option value="">All Roles</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>{role.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
          </div>

          {/* Status Filter */}
          <div className="relative">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="appearance-none pl-3 pr-8 py-1.5 rounded-md bg-slate-800/50 border border-slate-700 text-xs text-slate-300 focus:outline-none focus:border-cyan-500/50 cursor-pointer"
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="invited">Invited</option>
              <option value="suspended">Suspended</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
          </div>

          {/* Scope Filter */}
          <div className="relative">
            <select
              value={filterScope}
              onChange={(e) => setFilterScope(e.target.value)}
              className="appearance-none pl-3 pr-8 py-1.5 rounded-md bg-slate-800/50 border border-slate-700 text-xs text-slate-300 focus:outline-none focus:border-cyan-500/50 cursor-pointer"
            >
              <option value="">All Scopes</option>
              {availableScopes.map((scope) => (
                <option key={scope.id} value={scope.id}>{scope.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
          </div>

          {/* Clear Filters */}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-slate-400 hover:text-white"
              onClick={clearFilters}
            >
              <X className="w-3 h-3 mr-1" />
              Clear Filters
            </Button>
          )}
        </div>
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
          <div className="hidden md:grid grid-cols-[2fr_2fr_1.2fr_1.2fr_1fr_1fr_1.5fr_auto] gap-4 px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider border-b border-slate-800 mb-2">
            <span>User</span>
            <span>Email</span>
            <span>Roles</span>
            <span>Scopes</span>
            <span>Auth</span>
            <span>Last Login</span>
            <span>Status</span>
            <span className="w-8"></span>
          </div>
          <div className="space-y-1">
            {filteredUsers.map((user) => {
              const invStatus = getInvitationStatusInfo(user);
              const isInvitePending = user.status === "invited" && user.invitation?.status === "pending" && new Date(user.invitation.expiresAt) > new Date();

              return (
                <div
                  key={user.id}
                  className={cn(
                    "grid grid-cols-1 md:grid-cols-[2fr_2fr_1.2fr_1.2fr_1fr_1fr_1.5fr_auto] gap-4 items-center p-4 rounded-lg transition-all border",
                    user.status === "suspended"
                      ? "bg-red-900/10 border-red-900/20 hover:bg-red-900/15"
                      : "bg-slate-800/30 hover:bg-slate-800/50 border-transparent hover:border-slate-700"
                  )}
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

                  {/* Actions Menu */}
                  <div className="relative">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-slate-500 hover:text-white"
                      onClick={() => setOpenMenuId(openMenuId === user.id ? null : user.id)}
                    >
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                    {openMenuId === user.id && (
                      <>
                        {/* Backdrop to close menu */}
                        <div
                          className="fixed inset-0 z-40"
                          onClick={() => setOpenMenuId(null)}
                        />
                        <div className="absolute right-0 top-full mt-1 z-50 w-48 rounded-lg bg-slate-800 border border-slate-700 shadow-xl py-1">
                          <button
                            className="w-full px-3 py-2 text-left text-xs text-slate-300 hover:bg-slate-700/50 hover:text-cyan-400 flex items-center gap-2 transition-colors"
                            onClick={() => {
                              setOpenMenuId(null);
                              openRolesDialog(user);
                            }}
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                            Manage Roles
                          </button>
                          <button
                            className="w-full px-3 py-2 text-left text-xs text-slate-300 hover:bg-slate-700/50 hover:text-cyan-400 flex items-center gap-2 transition-colors"
                            onClick={() => {
                              setOpenMenuId(null);
                              openScopesDialog(user);
                            }}
                          >
                            <Target className="w-3.5 h-3.5" />
                            Manage Scopes
                          </button>
                          <div className="border-t border-slate-700 my-1" />
                          {user.status === "suspended" ? (
                            <button
                              className="w-full px-3 py-2 text-left text-xs text-emerald-400 hover:bg-slate-700/50 flex items-center gap-2 transition-colors"
                              onClick={() => {
                                setOpenMenuId(null);
                                openSuspendDialog(user, "reactivate");
                              }}
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                              Reactivate User
                            </button>
                          ) : user.status === "active" ? (
                            <button
                              className={cn(
                                "w-full px-3 py-2 text-left text-xs flex items-center gap-2 transition-colors",
                                user.id === currentUserId
                                  ? "text-slate-600 cursor-not-allowed"
                                  : "text-red-400 hover:bg-slate-700/50"
                              )}
                              disabled={user.id === currentUserId}
                              onClick={() => {
                                if (user.id !== currentUserId) {
                                  setOpenMenuId(null);
                                  openSuspendDialog(user, "suspend");
                                }
                              }}
                            >
                              <UserMinus className="w-3.5 h-3.5" />
                              {user.id === currentUserId ? "Cannot Suspend Self" : "Suspend User"}
                            </button>
                          ) : null}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            {filteredUsers.length === 0 && (
              <div className="text-center py-12 text-slate-500">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>
                  {searchQuery || hasActiveFilters
                    ? "No users match your search or filters."
                    : "No users found."}
                </p>
                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 text-xs text-cyan-400 hover:text-cyan-300"
                    onClick={clearFilters}
                  >
                    Clear Filters
                  </Button>
                )}
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
              <div className="space-y-4 py-2 overflow-y-auto min-h-0">
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
                  <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
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

      {/* Manage Roles Dialog */}
      <Dialog open={showRolesDialog} onOpenChange={setShowRolesDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-cyan-400" />
              Manage Roles &mdash; {rolesUser?.name}
            </DialogTitle>
            <DialogDescription>
              Assign or remove roles for this user. Roles determine which capabilities the user has across the platform.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 max-h-[400px] overflow-y-auto">
            {roleError && (
              <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                {roleError}
              </div>
            )}

            {allRoles.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <Shield className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Loading roles...</p>
              </div>
            ) : (
              allRoles.filter((r) => r.isActive).map((role) => {
                const isAssigned = rolesUser?.roles.some((r) => r.id === role.id) ?? false;
                const isLoading = roleToggleLoading === role.id;
                const isPlatformAdmin = role.slug === "platform-admin";
                const atMaxAssignments = role.maxAssignments !== null && role.userCount >= role.maxAssignments && !isAssigned;

                return (
                  <button
                    key={role.id}
                    onClick={() => rolesUser && handleRoleToggle(rolesUser.id, role.id, isAssigned)}
                    disabled={isLoading || atMaxAssignments}
                    className={cn(
                      "w-full p-3 rounded-lg border text-left text-sm transition-all flex items-center gap-3",
                      isAssigned
                        ? "border-cyan-500/50 bg-cyan-500/10"
                        : atMaxAssignments
                          ? "border-slate-700 opacity-50 cursor-not-allowed"
                          : "border-slate-700 hover:border-slate-600"
                    )}
                  >
                    <div className={cn(
                      "w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                      isAssigned
                        ? "border-cyan-500 bg-cyan-500"
                        : "border-slate-600"
                    )}>
                      {isLoading ? (
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
                          {role.name}
                        </span>
                        {role.isBuiltin && (
                          <Badge variant="secondary" className="text-[10px]">
                            Built-in
                          </Badge>
                        )}
                      </div>
                      {role.description && (
                        <p className="text-xs text-slate-500 mt-0.5">{role.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] text-slate-600">
                          {role.capabilityCount} capabilities
                        </span>
                        <span className="text-[10px] text-slate-600">
                          {role.userCount} user{role.userCount !== 1 ? "s" : ""} assigned
                        </span>
                      </div>
                      {isPlatformAdmin && role.maxAssignments && (
                        <div className={cn(
                          "flex items-center gap-1 mt-1 text-[10px]",
                          role.userCount >= role.maxAssignments
                            ? "text-yellow-400"
                            : "text-slate-500"
                        )}>
                          <AlertTriangle className="w-3 h-3" />
                          Max {role.maxAssignments} assignments ({role.userCount}/{role.maxAssignments} used)
                        </div>
                      )}
                      {atMaxAssignments && (
                        <p className="text-[10px] text-yellow-400 mt-1">
                          Maximum assignment limit reached
                        </p>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRolesDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suspend/Reactivate Confirmation Dialog */}
      <Dialog open={showSuspendDialog} onOpenChange={setShowSuspendDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {suspendAction === "suspend" ? (
                <>
                  <UserMinus className="w-5 h-5 text-red-400" />
                  Suspend User
                </>
              ) : (
                <>
                  <UserCheck className="w-5 h-5 text-emerald-400" />
                  Reactivate User
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {suspendAction === "suspend"
                ? "Suspending a user will immediately revoke their access to the platform. They will not be able to log in until reactivated."
                : "Reactivating a user will restore their access to the platform with their existing roles and scopes."}
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            {suspendUser && (
              <div className={cn(
                "p-4 rounded-lg border",
                suspendAction === "suspend"
                  ? "bg-red-500/10 border-red-500/20"
                  : "bg-emerald-500/10 border-emerald-500/20"
              )}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-white">
                      {suspendUser.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{suspendUser.name}</p>
                    <p className="text-xs text-slate-400">{suspendUser.email}</p>
                    <div className="flex gap-1 mt-1">
                      {suspendUser.roles.map((r) => (
                        <Badge key={r.id} variant="outline" className="text-[10px]">
                          {r.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {suspendError && (
              <div className="mt-3 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                {suspendError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSuspendDialog(false)} disabled={suspendLoading}>
              Cancel
            </Button>
            <Button
              variant={suspendAction === "suspend" ? "destructive" : "default"}
              onClick={handleSuspendConfirm}
              disabled={suspendLoading}
            >
              {suspendLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {suspendAction === "suspend" ? "Suspending..." : "Reactivating..."}
                </>
              ) : (
                <>
                  {suspendAction === "suspend" ? (
                    <><UserMinus className="w-4 h-4" /> Suspend User</>
                  ) : (
                    <><UserCheck className="w-4 h-4" /> Reactivate User</>
                  )}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </PageGate>
  );
}
