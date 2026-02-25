"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck,
  Plus,
  Users,
  Key,
  Lock,
  Unlock,
} from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils";

interface RoleItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isBuiltin: boolean;
  isActive: boolean;
  permissionCount: number;
  userCount: number;
  createdBy: string;
  createdAt: string;
}

export default function RolesPage() {
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/roles")
      .then((res) => res.json())
      .then(setRoles)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

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

  const builtinRoles = roles.filter((r) => r.isBuiltin);
  const customRoles = roles.filter((r) => !r.isBuiltin);
  const totalUsers = roles.reduce((sum, r) => sum + r.userCount, 0);
  const totalPermissions = new Set(roles.flatMap((r) => Array.from({ length: r.permissionCount }))).size;

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "Total Roles", value: roles.length, icon: ShieldCheck, color: "text-cyan-400" },
          { label: "Built-in", value: builtinRoles.length, icon: Lock, color: "text-blue-400" },
          { label: "Custom", value: customRoles.length, icon: Unlock, color: "text-purple-400" },
          { label: "Users Assigned", value: totalUsers, icon: Users, color: "text-emerald-400" },
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

      {/* Create Role Button */}
      <div className="flex justify-end">
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Create Role
        </Button>
      </div>

      {/* Built-in Roles */}
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
                  className="flex items-center gap-4 p-4 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 transition-all cursor-pointer border border-transparent hover:border-slate-700"
                >
                  <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                    <ShieldCheck className="w-5 h-5 text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{role.name}</span>
                      <Badge variant="info">Built-in</Badge>
                      {!role.isActive && <Badge variant="secondary">Inactive</Badge>}
                    </div>
                    {role.description && (
                      <p className="text-xs text-slate-500 mt-0.5 truncate">{role.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-6 flex-shrink-0">
                    <div className="text-center">
                      <p className="text-sm font-bold text-white">{role.permissionCount}</p>
                      <p className="text-[10px] text-slate-500">Permissions</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-bold text-white">{role.userCount}</p>
                      <p className="text-[10px] text-slate-500">Users</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Custom Roles */}
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
                className="flex items-center gap-4 p-4 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 transition-all cursor-pointer border border-transparent hover:border-slate-700"
              >
                <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                  <ShieldCheck className="w-5 h-5 text-purple-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{role.name}</span>
                    {!role.isActive && <Badge variant="secondary">Inactive</Badge>}
                  </div>
                  {role.description && (
                    <p className="text-xs text-slate-500 mt-0.5 truncate">{role.description}</p>
                  )}
                  <p className="text-[10px] text-slate-600 mt-0.5">
                    Created by {role.createdBy} on {formatDateTime(role.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-6 flex-shrink-0">
                  <div className="text-center">
                    <p className="text-sm font-bold text-white">{role.permissionCount}</p>
                    <p className="text-[10px] text-slate-500">Permissions</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-white">{role.userCount}</p>
                    <p className="text-[10px] text-slate-500">Users</p>
                  </div>
                </div>
              </div>
            ))}
            {customRoles.length === 0 && (
              <div className="text-center py-12 text-slate-500">
                <ShieldCheck className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No custom roles created yet.</p>
                <p className="text-xs text-slate-600 mt-1">
                  Create custom roles to define granular permissions for your team.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
