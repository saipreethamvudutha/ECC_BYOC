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
} from "lucide-react";
import { cn, formatDateTime, formatRelativeTime } from "@/lib/utils";

interface RoleOption {
  id: string;
  name: string;
  slug: string;
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
  roles: { id: string; name: string; slug: string }[];
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
      .then((data: { id: string; name: string; slug: string }[]) => setRoles(data))
      .catch(console.error);
  }, []);

  async function handleInvite() {
    if (!inviteForm.name || !inviteForm.email || !inviteForm.roleId) return;
    setInviting(true);
    setInviteError("");

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

      setShowInvite(false);
      setInviteForm({ name: "", email: "", roleId: "" });
      loadUsers();
    } catch {
      setInviteError("Connection error");
    } finally {
      setInviting(false);
    }
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
        <Button onClick={() => setShowInvite(true)}>
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
          <div className="hidden md:grid grid-cols-[2fr_2fr_1.5fr_1fr_1fr_1fr] gap-4 px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider border-b border-slate-800 mb-2">
            <span>User</span>
            <span>Email</span>
            <span>Roles</span>
            <span>Auth</span>
            <span>Last Login</span>
            <span>Status</span>
          </div>
          <div className="space-y-1">
            {filteredUsers.map((user) => (
              <div
                key={user.id}
                className="grid grid-cols-1 md:grid-cols-[2fr_2fr_1.5fr_1fr_1fr_1fr] gap-4 items-center p-4 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 transition-all cursor-pointer border border-transparent hover:border-slate-700"
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
                    {user.mfaEnabled && (
                      <span className="text-[10px] text-emerald-400">MFA enabled</span>
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

                {/* Status */}
                <div>
                  <Badge variant={statusVariants[user.status] || "secondary"}>
                    {user.status}
                  </Badge>
                </div>
              </div>
            ))}
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
              Send an invitation to join your organization.
            </DialogDescription>
          </DialogHeader>

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
                  Inviting...
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  Send Invitation
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
