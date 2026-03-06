"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import * as Dialog from "@radix-ui/react-dialog";
import * as Switch from "@radix-ui/react-switch";
import { Globe, Plus, Trash2, Copy, Key, Loader2, X, Shield } from "lucide-react";
import { Gate } from "@/components/rbac/Gate";
import { PageGate } from "@/components/rbac/PageGate";

interface SSOProvider {
  id: string;
  providerType: string;
  name: string;
  clientId: string;
  isEnabled: boolean;
  autoProvision: boolean;
  domains: string;
  createdAt: string;
}

interface SCIMToken {
  id: string;
  name: string;
  tokenPrefix: string;
  isActive: boolean;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export default function IdentitySettingsPage() {
  const [providers, setProviders] = useState<SSOProvider[]>([]);
  const [scimTokens, setScimTokens] = useState<SCIMToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [showCreateToken, setShowCreateToken] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);

  // SSO form state
  const [providerType, setProviderType] = useState("google");
  const [providerName, setProviderName] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [domains, setDomains] = useState("");
  const [issuerUrl, setIssuerUrl] = useState("");
  const [saving, setSaving] = useState(false);

  // SCIM form state
  const [tokenName, setTokenName] = useState("");
  const [tokenExpiry, setTokenExpiry] = useState("90");
  const [creatingToken, setCreatingToken] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [provRes, tokenRes] = await Promise.all([
        fetch("/api/sso/providers"),
        fetch("/api/scim/tokens"),
      ]);
      if (provRes.ok) {
        const data = await provRes.json();
        setProviders(data.providers || []);
      }
      if (tokenRes.ok) {
        const data = await tokenRes.json();
        setScimTokens(data.tokens || []);
      }
    } catch (e) {
      console.error("Failed to load identity settings:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleAddProvider(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/sso/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerType,
          name: providerName,
          clientId,
          clientSecret,
          domains: domains ? domains.split(",").map(d => d.trim()) : [],
          issuerUrl: issuerUrl || undefined,
        }),
      });
      if (res.ok) {
        setShowAddProvider(false);
        setProviderName("");
        setClientId("");
        setClientSecret("");
        setDomains("");
        setIssuerUrl("");
        fetchData();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleProvider(id: string, isEnabled: boolean) {
    await fetch(`/api/sso/providers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isEnabled }),
    });
    fetchData();
  }

  async function handleDeleteProvider(id: string) {
    if (!confirm("Delete this SSO provider? Users will no longer be able to sign in with it.")) return;
    await fetch(`/api/sso/providers/${id}`, { method: "DELETE" });
    fetchData();
  }

  async function handleCreateToken(e: React.FormEvent) {
    e.preventDefault();
    setCreatingToken(true);
    try {
      const res = await fetch("/api/scim/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: tokenName,
          expiresInDays: parseInt(tokenExpiry) || 90,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setNewToken(data.token);
        setTokenName("");
        fetchData();
      }
    } finally {
      setCreatingToken(false);
    }
  }

  async function handleRevokeToken(id: string) {
    if (!confirm("Revoke this SCIM token? The identity provider will no longer be able to sync users.")) return;
    await fetch(`/api/scim/tokens/${id}`, { method: "DELETE" });
    fetchData();
  }

  const providerTypeLabels: Record<string, string> = {
    google: "Google Workspace",
    azure_ad: "Azure AD (Entra ID)",
    okta: "Okta",
  };

  const providerColors: Record<string, string> = {
    google: "bg-red-500/10 text-red-400 border-red-500/30",
    azure_ad: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    okta: "bg-indigo-500/10 text-indigo-400 border-indigo-500/30",
  };

  if (loading) {
    return (
      <PageGate capability="admin.sso.view" title="Identity & SSO">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
        </div>
      </PageGate>
    );
  }

  return (
    <PageGate capability="admin.sso.view" title="Identity & SSO">
      <div className="space-y-8">
        {/* SSO Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Globe className="w-5 h-5 text-cyan-400" />
                <CardTitle className="text-lg">Single Sign-On (SSO)</CardTitle>
              </div>
              <Gate capability="admin.sso.manage">
                <Dialog.Root open={showAddProvider} onOpenChange={setShowAddProvider}>
                  <Dialog.Trigger asChild>
                    <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Add Provider</Button>
                  </Dialog.Trigger>
                  <Dialog.Portal>
                    <Dialog.Overlay className="fixed inset-0 bg-black/60 z-50" />
                    <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-md z-50">
                      <Dialog.Title className="text-lg font-semibold text-white mb-4">Add SSO Provider</Dialog.Title>
                      <form onSubmit={handleAddProvider} className="space-y-4">
                        <div>
                          <label className="text-sm text-slate-400">Provider Type</label>
                          <select value={providerType} onChange={e => setProviderType(e.target.value)}
                            className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm">
                            <option value="google">Google Workspace</option>
                            <option value="azure_ad">Azure AD (Entra ID)</option>
                            <option value="okta">Okta</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-sm text-slate-400">Display Name</label>
                          <Input value={providerName} onChange={e => setProviderName(e.target.value)} placeholder="e.g., Exargen Google SSO" required />
                        </div>
                        <div>
                          <label className="text-sm text-slate-400">Client ID</label>
                          <Input value={clientId} onChange={e => setClientId(e.target.value)} placeholder="OAuth Client ID" required />
                        </div>
                        <div>
                          <label className="text-sm text-slate-400">Client Secret</label>
                          <Input type="password" value={clientSecret} onChange={e => setClientSecret(e.target.value)} placeholder="OAuth Client Secret" required />
                        </div>
                        <div>
                          <label className="text-sm text-slate-400">Allowed Domains (comma-separated)</label>
                          <Input value={domains} onChange={e => setDomains(e.target.value)} placeholder="exargen.com, example.com" />
                        </div>
                        {providerType === "okta" && (
                          <div>
                            <label className="text-sm text-slate-400">Issuer URL</label>
                            <Input value={issuerUrl} onChange={e => setIssuerUrl(e.target.value)} placeholder="https://your-org.okta.com/oauth2/default" />
                          </div>
                        )}
                        <div className="flex gap-2 justify-end pt-2">
                          <Dialog.Close asChild>
                            <Button type="button" variant="outline">Cancel</Button>
                          </Dialog.Close>
                          <Button type="submit" disabled={saving}>
                            {saving ? <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Creating...</> : "Create Provider"}
                          </Button>
                        </div>
                      </form>
                    </Dialog.Content>
                  </Dialog.Portal>
                </Dialog.Root>
              </Gate>
            </div>
          </CardHeader>
          <CardContent>
            {providers.length === 0 ? (
              <p className="text-slate-500 text-sm py-4 text-center">No SSO providers configured. Add one to enable enterprise sign-in.</p>
            ) : (
              <div className="space-y-3">
                {providers.map(p => (
                  <div key={p.id} className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg border border-slate-700/50">
                    <div className="flex items-center gap-3">
                      <Badge className={providerColors[p.providerType] || "bg-slate-500/10 text-slate-400"}>
                        {providerTypeLabels[p.providerType] || p.providerType}
                      </Badge>
                      <div>
                        <p className="text-sm font-medium text-white">{p.name}</p>
                        <p className="text-xs text-slate-500">Client ID: {p.clientId}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Gate capability="admin.sso.manage">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500">{p.isEnabled ? "Enabled" : "Disabled"}</span>
                          <Switch.Root
                            checked={p.isEnabled}
                            onCheckedChange={(checked) => handleToggleProvider(p.id, checked)}
                            className="w-9 h-5 bg-slate-700 rounded-full data-[state=checked]:bg-cyan-600 transition-colors"
                          >
                            <Switch.Thumb className="block w-4 h-4 bg-white rounded-full transition-transform translate-x-0.5 data-[state=checked]:translate-x-[18px]" />
                          </Switch.Root>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => handleDeleteProvider(p.id)} className="text-red-400 hover:text-red-300">
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </Gate>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* SCIM Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Shield className="w-5 h-5 text-cyan-400" />
                <div>
                  <CardTitle className="text-lg">SCIM 2.0 Provisioning</CardTitle>
                  <p className="text-xs text-slate-500 mt-1">
                    Base URL: {typeof window !== "undefined" ? window.location.origin : ""}/api/scim/v2
                  </p>
                </div>
              </div>
              <Gate capability="admin.scim.manage">
                <Dialog.Root open={showCreateToken} onOpenChange={(open) => { setShowCreateToken(open); if (!open) setNewToken(null); }}>
                  <Dialog.Trigger asChild>
                    <Button size="sm"><Key className="w-4 h-4 mr-1" /> Create Token</Button>
                  </Dialog.Trigger>
                  <Dialog.Portal>
                    <Dialog.Overlay className="fixed inset-0 bg-black/60 z-50" />
                    <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-md z-50">
                      <Dialog.Title className="text-lg font-semibold text-white mb-4">
                        {newToken ? "SCIM Token Created" : "Create SCIM Token"}
                      </Dialog.Title>
                      {newToken ? (
                        <div className="space-y-4">
                          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
                            <p className="text-sm text-emerald-400 mb-2 font-medium">Copy this token now. It cannot be retrieved again.</p>
                            <div className="flex items-center gap-2">
                              <code className="text-xs text-white bg-slate-800 px-3 py-2 rounded flex-1 overflow-auto">{newToken}</code>
                              <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(newToken)}>
                                <Copy className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                          <Dialog.Close asChild>
                            <Button className="w-full">Done</Button>
                          </Dialog.Close>
                        </div>
                      ) : (
                        <form onSubmit={handleCreateToken} className="space-y-4">
                          <div>
                            <label className="text-sm text-slate-400">Token Name</label>
                            <Input value={tokenName} onChange={e => setTokenName(e.target.value)} placeholder="e.g., Okta SCIM Sync" required />
                          </div>
                          <div>
                            <label className="text-sm text-slate-400">Expires In (days)</label>
                            <Input type="number" value={tokenExpiry} onChange={e => setTokenExpiry(e.target.value)} placeholder="90" />
                          </div>
                          <div className="flex gap-2 justify-end pt-2">
                            <Dialog.Close asChild>
                              <Button type="button" variant="outline">Cancel</Button>
                            </Dialog.Close>
                            <Button type="submit" disabled={creatingToken}>
                              {creatingToken ? <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Creating...</> : "Create Token"}
                            </Button>
                          </div>
                        </form>
                      )}
                      <Dialog.Close asChild>
                        <button className="absolute top-4 right-4 text-slate-500 hover:text-white"><X className="w-4 h-4" /></button>
                      </Dialog.Close>
                    </Dialog.Content>
                  </Dialog.Portal>
                </Dialog.Root>
              </Gate>
            </div>
          </CardHeader>
          <CardContent>
            {scimTokens.length === 0 ? (
              <p className="text-slate-500 text-sm py-4 text-center">No SCIM tokens created. Create one to enable identity provider sync.</p>
            ) : (
              <div className="space-y-3">
                {scimTokens.map(t => (
                  <div key={t.id} className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg border border-slate-700/50">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-white">{t.name}</p>
                        <Badge className={t.isActive ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}>
                          {t.isActive ? "Active" : "Revoked"}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        {t.tokenPrefix}... · Created {new Date(t.createdAt).toLocaleDateString()}
                        {t.lastUsedAt && ` · Last used ${new Date(t.lastUsedAt).toLocaleDateString()}`}
                        {t.expiresAt && ` · Expires ${new Date(t.expiresAt).toLocaleDateString()}`}
                      </p>
                    </div>
                    <Gate capability="admin.scim.manage">
                      {t.isActive && (
                        <Button size="sm" variant="outline" onClick={() => handleRevokeToken(t.id)} className="text-red-400 hover:text-red-300">
                          Revoke
                        </Button>
                      )}
                    </Gate>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageGate>
  );
}
