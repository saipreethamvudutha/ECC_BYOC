"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Key,
  Plus,
  Copy,
  Trash2,
  RefreshCw,
  Shield,
  Clock,
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

export default function ApiKeysPage() {
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/api-keys")
      .then((res) => res.json())
      .then(setApiKeys)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-12 h-12 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "Total API Keys", value: apiKeys.length, icon: Key, color: "text-cyan-400" },
          { label: "Active Keys", value: apiKeys.filter(k => k.isActive).length, icon: Shield, color: "text-emerald-400" },
          { label: "Expiring Soon", value: apiKeys.filter(k => {
            const exp = new Date(k.expiresAt);
            const now = new Date();
            const diff = exp.getTime() - now.getTime();
            return diff > 0 && diff < 30 * 24 * 60 * 60 * 1000;
          }).length, icon: Clock, color: "text-yellow-400" },
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

      {/* API Keys List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">API Keys ({apiKeys.length})</CardTitle>
          <Button size="sm">
            <Plus className="w-4 h-4 mr-2" />
            Create API Key
          </Button>
        </CardHeader>
        <CardContent>
          {apiKeys.length > 0 ? (
            <div className="space-y-2">
              {apiKeys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center gap-4 p-4 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 transition-all border border-transparent hover:border-slate-700"
                >
                  <Key className="w-5 h-5 text-cyan-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{key.name}</span>
                      <code className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded font-mono">
                        {key.keyPrefix}...
                      </code>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Role: {key.role} | Rate: {key.rateLimit}/min | Created by {key.createdBy}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <Badge variant={key.isActive ? "success" : "secondary"}>
                      {key.isActive ? "Active" : "Inactive"}
                    </Badge>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Expires {formatDateTime(key.expiresAt)}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <RefreshCw className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
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
          <p className="text-sm font-medium text-amber-400">API Key Security</p>
          <p className="text-xs text-slate-400 mt-1">
            API keys grant programmatic access to your BYOC tenant. Keys are shown only once at creation.
            Rotate keys every 90 days. Use IP allowlisting for production keys.
          </p>
        </div>
      </div>
    </div>
  );
}
