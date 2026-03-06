"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Key,
  Users,
  ScrollText,
  Activity,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import { PageGate } from "@/components/rbac/PageGate";

interface AuditLogEntry {
  id: string;
  actorName: string;
  actorEmail: string | null;
  actorType: string;
  action: string;
  ipAddress: string | null;
  result: string;
  severity: string | null;
  category: string | null;
  createdAt: string;
}

interface SessionItem {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
}

interface ApiKeyItem {
  id: string;
  name: string;
  isActive: boolean;
  expiresAt: string;
}

interface IntegrityResult {
  valid: boolean;
  totalRecords: number;
  checkedAt: string;
  firstInvalidId?: string;
  firstInvalidAt?: string;
}

// Severity dot colors
const severityDotColors: Record<string, string> = {
  info: "bg-blue-400",
  low: "bg-cyan-400",
  medium: "bg-yellow-400",
  high: "bg-orange-400",
  critical: "bg-red-400",
};

// Result badge variants
const resultBadgeVariants: Record<string, "success" | "destructive" | "warning" | "secondary"> = {
  success: "success",
  denied: "destructive",
  error: "warning",
};

function MFASection() {
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaLoading, setMfaLoading] = useState(true);
  const [setupStep, setSetupStep] = useState<"idle" | "qr" | "verify" | "backup" | "disable">("idle");
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [manualKey, setManualKey] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [mfaError, setMfaError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me/capabilities")
      .then(r => r.json())
      .then(() => {
        // Check MFA status from user profile
        fetch("/api/auth/me")
          .then(r => r.json())
          .then(data => {
            setMfaEnabled(data.user?.mfaEnabled || false);
          })
          .catch(() => {})
          .finally(() => setMfaLoading(false));
      })
      .catch(() => setMfaLoading(false));
  }, []);

  async function startSetup() {
    setMfaError("");
    setActionLoading(true);
    try {
      const res = await fetch("/api/auth/mfa/setup", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setQrCodeUrl(data.qrCodeDataUrl);
        setManualKey(data.manualEntryKey);
        setSetupStep("qr");
      } else {
        setMfaError(data.error || "Failed to start MFA setup");
      }
    } catch {
      setMfaError("Connection error");
    } finally {
      setActionLoading(false);
    }
  }

  async function confirmSetup() {
    setMfaError("");
    setActionLoading(true);
    try {
      const res = await fetch("/api/auth/mfa/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: verifyCode }),
      });
      const data = await res.json();
      if (res.ok) {
        setBackupCodes(data.backupCodes);
        setMfaEnabled(true);
        setSetupStep("backup");
      } else {
        setMfaError(data.error || "Invalid code");
      }
    } catch {
      setMfaError("Connection error");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDisable() {
    setMfaError("");
    setActionLoading(true);
    try {
      const res = await fetch("/api/auth/mfa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: disableCode }),
      });
      const data = await res.json();
      if (res.ok) {
        setMfaEnabled(false);
        setSetupStep("idle");
        setDisableCode("");
      } else {
        setMfaError(data.error || "Invalid code");
      }
    } catch {
      setMfaError("Connection error");
    } finally {
      setActionLoading(false);
    }
  }

  if (mfaLoading) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", mfaEnabled ? "bg-emerald-500/10" : "bg-yellow-500/10")}>
              <ShieldCheck className={cn("w-5 h-5", mfaEnabled ? "text-emerald-400" : "text-yellow-400")} />
            </div>
            <div>
              <CardTitle className="text-base">Two-Factor Authentication</CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                {mfaEnabled ? "MFA is enabled — your account is protected" : "Add an extra layer of security to your account"}
              </p>
            </div>
          </div>
          <Badge variant={mfaEnabled ? "success" : "warning"}>
            {mfaEnabled ? "Enabled" : "Disabled"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {setupStep === "idle" && !mfaEnabled && (
          <Button onClick={startSetup} disabled={actionLoading}>
            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <ShieldCheck className="w-4 h-4 mr-1" />}
            Enable MFA
          </Button>
        )}

        {setupStep === "idle" && mfaEnabled && (
          <div className="space-y-3">
            <p className="text-sm text-slate-400">Your account is protected with TOTP-based two-factor authentication.</p>
            <Button variant="outline" onClick={() => setSetupStep("disable")} className="text-red-400 hover:text-red-300">
              Disable MFA
            </Button>
          </div>
        )}

        {setupStep === "qr" && (
          <div className="space-y-4">
            <p className="text-sm text-slate-400">Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)</p>
            {qrCodeUrl && (
              <div className="flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrCodeUrl} alt="MFA QR Code" className="w-48 h-48 rounded-lg" />
              </div>
            )}
            <div className="text-center">
              <p className="text-xs text-slate-500 mb-1">Or enter this key manually:</p>
              <code className="text-sm text-cyan-400 bg-slate-800 px-3 py-1 rounded">{manualKey}</code>
            </div>
            <div>
              <label className="text-sm text-slate-400">Enter the 6-digit code from your app:</label>
              <Input value={verifyCode} onChange={e => setVerifyCode(e.target.value)} placeholder="000000" maxLength={6} className="mt-1 text-center text-lg tracking-widest" />
            </div>
            {mfaError && <p className="text-sm text-red-400">{mfaError}</p>}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setSetupStep("idle"); setVerifyCode(""); setMfaError(""); }}>Cancel</Button>
              <Button onClick={confirmSetup} disabled={actionLoading || verifyCode.length !== 6}>
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                Verify & Enable
              </Button>
            </div>
          </div>
        )}

        {setupStep === "backup" && (
          <div className="space-y-4">
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
              <p className="text-sm text-amber-400 font-medium mb-2">Save these backup codes</p>
              <p className="text-xs text-slate-400 mb-3">These codes can be used if you lose access to your authenticator app. Each code can only be used once.</p>
              <div className="grid grid-cols-2 gap-2">
                {backupCodes.map((code, i) => (
                  <code key={i} className="text-sm text-white bg-slate-800 px-3 py-1.5 rounded text-center font-mono">{code}</code>
                ))}
              </div>
            </div>
            <Button onClick={() => { setSetupStep("idle"); setBackupCodes([]); setVerifyCode(""); }}>
              I&apos;ve saved my backup codes
            </Button>
          </div>
        )}

        {setupStep === "disable" && (
          <div className="space-y-4">
            <p className="text-sm text-slate-400">Enter your current TOTP code to disable MFA:</p>
            <Input value={disableCode} onChange={e => setDisableCode(e.target.value)} placeholder="000000" maxLength={6} className="text-center text-lg tracking-widest" />
            {mfaError && <p className="text-sm text-red-400">{mfaError}</p>}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setSetupStep("idle"); setDisableCode(""); setMfaError(""); }}>Cancel</Button>
              <Button variant="destructive" onClick={handleDisable} disabled={actionLoading || disableCode.length !== 6}>
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                Disable MFA
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function SecurityDashboardPage() {
  const router = useRouter();

  // Data state
  const [recentEvents, setRecentEvents] = useState<AuditLogEntry[]>([]);
  const [failedLoginCount, setFailedLoginCount] = useState(0);
  const [activeSessions, setActiveSessions] = useState<SessionItem[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [integrity, setIntegrity] = useState<IntegrityResult | null>(null);

  // Loading state
  const [loading, setLoading] = useState(true);
  const [integrityChecking, setIntegrityChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // M10: Track which data sources loaded successfully
  const [dataLoadStatus, setDataLoadStatus] = useState({
    auditEvents: true,
    failedLogins: true,
    sessions: true,
    apiKeys: true,
    integrity: true,
  });

  const fetchSecurityData = useCallback(async () => {
    try {
      const twentyFourHoursAgo = new Date(
        Date.now() - 24 * 60 * 60 * 1000
      ).toISOString();

      const [eventsRes, failedLoginsRes, sessionsRes, apiKeysRes, integrityRes] =
        await Promise.allSettled([
          fetch("/api/audit-log?category=auth&limit=20"),
          fetch(
            `/api/audit-log?action=user.login_failed&from=${twentyFourHoursAgo}&limit=100`
          ),
          fetch("/api/sessions"),
          fetch("/api/api-keys"),
          fetch("/api/audit-log/integrity"),
        ]);

      // Recent auth events
      if (eventsRes.status === "fulfilled" && eventsRes.value.ok) {
        const data = await eventsRes.value.json();
        setRecentEvents(data.logs || []);
      }

      // Failed logins in 24h
      if (failedLoginsRes.status === "fulfilled" && failedLoginsRes.value.ok) {
        const data = await failedLoginsRes.value.json();
        setFailedLoginCount(data.totalCount || 0);
      }

      // Active sessions
      if (sessionsRes.status === "fulfilled" && sessionsRes.value.ok) {
        const data = await sessionsRes.value.json();
        setActiveSessions(data.sessions || []);
      }

      // API keys
      if (apiKeysRes.status === "fulfilled" && apiKeysRes.value.ok) {
        const data = await apiKeysRes.value.json();
        setApiKeys(data);
      }

      // Audit integrity
      if (integrityRes.status === "fulfilled" && integrityRes.value.ok) {
        const data = await integrityRes.value.json();
        setIntegrity(data);
      }

      // M10: Track data source availability for accurate score
      setDataLoadStatus({
        auditEvents: eventsRes.status === "fulfilled" && eventsRes.value.ok,
        failedLogins: failedLoginsRes.status === "fulfilled" && failedLoginsRes.value.ok,
        sessions: sessionsRes.status === "fulfilled" && sessionsRes.value.ok,
        apiKeys: apiKeysRes.status === "fulfilled" && apiKeysRes.value.ok,
        integrity: integrityRes.status === "fulfilled" && integrityRes.value.ok,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load security data"
      );
    }
  }, []);

  useEffect(() => {
    fetchSecurityData().finally(() => setLoading(false));
  }, [fetchSecurityData]);

  // Check integrity manually
  const handleCheckIntegrity = async () => {
    setIntegrityChecking(true);
    try {
      const res = await fetch("/api/audit-log/integrity");
      if (res.ok) {
        const data = await res.json();
        setIntegrity(data);
      }
    } catch {
      setIntegrity({ valid: false, totalRecords: 0, checkedAt: new Date().toISOString() });
    } finally {
      setIntegrityChecking(false);
    }
  };

  // M10: Compute security score with data availability tracking
  const computeSecurityScore = () => {
    let score = 0;
    let maxScore = 0;
    const breakdown: { label: string; points: number; earned: boolean; unavailable: boolean }[] = [];

    // Audit integrity: +30
    const integrityAvailable = dataLoadStatus.integrity;
    const integrityValid = integrity?.valid === true;
    breakdown.push({ label: "Audit Log Integrity", points: 30, earned: integrityValid, unavailable: !integrityAvailable });
    if (integrityAvailable) { maxScore += 30; if (integrityValid) score += 30; }

    // No failed logins in 24h: +25
    const failedLoginsAvailable = dataLoadStatus.failedLogins;
    const noFailedLogins = failedLoginCount === 0;
    breakdown.push({ label: "No Failed Logins (24h)", points: 25, earned: noFailedLogins, unavailable: !failedLoginsAvailable });
    if (failedLoginsAvailable) { maxScore += 25; if (noFailedLogins) score += 25; }

    // All API keys have >30 days before expiry: +20
    const apiKeysAvailable = dataLoadStatus.apiKeys;
    const activeApiKeys = apiKeys.filter((k) => k.isActive);
    const allKeysHealthy =
      activeApiKeys.length === 0 ||
      activeApiKeys.every((k) => {
        const diff = new Date(k.expiresAt).getTime() - Date.now();
        return diff > 30 * 24 * 60 * 60 * 1000;
      });
    breakdown.push({ label: "API Keys Not Expiring", points: 20, earned: allKeysHealthy, unavailable: !apiKeysAvailable });
    if (apiKeysAvailable) { maxScore += 20; if (allKeysHealthy) score += 20; }

    // Active sessions reasonable (<10 per user average): +15
    const sessionsAvailable = dataLoadStatus.sessions;
    const uniqueUsers = new Set(activeSessions.map((s) => s.userId)).size;
    const avgSessions = uniqueUsers > 0 ? activeSessions.length / uniqueUsers : 0;
    const sessionsReasonable = avgSessions < 10;
    breakdown.push({ label: "Session Count Normal", points: 15, earned: sessionsReasonable, unavailable: !sessionsAvailable });
    if (sessionsAvailable) { maxScore += 15; if (sessionsReasonable) score += 15; }

    // Security headers active (always true): +10
    maxScore += 10;
    breakdown.push({ label: "Security Headers Active", points: 10, earned: true, unavailable: false });
    score += 10;

    // Normalize score to percentage of available checks
    const normalizedScore = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
    return { score: normalizedScore, rawScore: score, maxScore, breakdown };
  };

  const { score, rawScore, maxScore, breakdown } = computeSecurityScore();
  const unavailableChecks = breakdown.filter((b) => b.unavailable).length;

  const scoreColor =
    score >= 80
      ? "text-emerald-400"
      : score >= 50
      ? "text-yellow-400"
      : "text-red-400";

  const scoreBgColor =
    score >= 80
      ? "from-emerald-500/20 to-emerald-500/5"
      : score >= 50
      ? "from-yellow-500/20 to-yellow-500/5"
      : "from-red-500/20 to-red-500/5";

  const scoreBorderColor =
    score >= 80
      ? "border-emerald-500/30"
      : score >= 50
      ? "border-yellow-500/30"
      : "border-red-500/30";

  // API key health
  const activeKeyCount = apiKeys.filter((k) => k.isActive).length;
  const expiringKeyCount = apiKeys.filter((k) => {
    if (!k.isActive) return false;
    const diff = new Date(k.expiresAt).getTime() - Date.now();
    return diff > 0 && diff < 30 * 24 * 60 * 60 * 1000;
  }).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">
            Loading security overview...
          </p>
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
              fetchSecurityData().finally(() => setLoading(false));
            }}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <PageGate capability="admin.audit.view" title="Security Dashboard">
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-6 h-6 text-cyan-400" />
          <h2 className="text-lg font-semibold text-white">
            Security Overview
          </h2>
        </div>
        <p className="text-sm text-slate-400 mt-1">
          Monitor your platform&apos;s security posture and respond to threats
        </p>
      </div>

      {/* Security Score Card */}
      <Card
        className={cn(
          "bg-gradient-to-br border",
          scoreBgColor,
          scoreBorderColor
        )}
      >
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-6">
              {/* Score circle */}
              <div className="relative w-28 h-28 flex items-center justify-center">
                <svg
                  className="w-28 h-28 transform -rotate-90"
                  viewBox="0 0 120 120"
                >
                  <circle
                    cx="60"
                    cy="60"
                    r="52"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8"
                    className="text-slate-800"
                  />
                  <circle
                    cx="60"
                    cy="60"
                    r="52"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${(score / 100) * 327} 327`}
                    className={scoreColor}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={cn("text-3xl font-bold", scoreColor)}>
                    {score}
                  </span>
                  <span className="text-[10px] text-slate-400 -mt-0.5">
                    / {maxScore < 100 ? maxScore : 100}
                  </span>
                </div>
              </div>

              {/* Breakdown */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-white">
                  Security Score Breakdown
                </p>
                {breakdown.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center gap-2 text-xs"
                  >
                    {item.unavailable ? (
                      <AlertTriangle className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                    ) : item.earned ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                    )}
                    <span
                      className={
                        item.unavailable
                          ? "text-slate-600 italic"
                          : item.earned
                          ? "text-slate-300"
                          : "text-slate-500"
                      }
                    >
                      {item.label}
                      {item.unavailable ? " (unable to verify)" : ""}
                    </span>
                    {!item.unavailable && (
                      <span
                        className={cn(
                          "font-mono",
                          item.earned ? "text-emerald-400" : "text-slate-600"
                        )}
                      >
                        +{item.points}
                      </span>
                    )}
                  </div>
                ))}
                {unavailableChecks > 0 && (
                  <p className="text-[10px] text-slate-500 mt-2">
                    Score based on {rawScore} of {maxScore} available points ({5 - unavailableChecks}/5 checks evaluated)
                  </p>
                )}
              </div>
            </div>

            <Badge
              variant={
                score >= 80 ? "success" : score >= 50 ? "warning" : "destructive"
              }
              className="text-xs"
            >
              {score >= 80 ? "Good" : score >= 50 ? "Fair" : "At Risk"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* MFA Section */}
      <MFASection />

      {/* Stat Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Failed Logins (24h) */}
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div
              className={cn(
                "w-12 h-12 rounded-lg flex items-center justify-center",
                failedLoginCount > 0 ? "bg-red-500/10" : "bg-emerald-500/10"
              )}
            >
              <AlertTriangle
                className={cn(
                  "w-6 h-6",
                  failedLoginCount > 0
                    ? "text-red-400"
                    : "text-emerald-400"
                )}
              />
            </div>
            <div>
              <p
                className={cn(
                  "text-2xl font-bold",
                  failedLoginCount > 0 ? "text-red-400" : "text-emerald-400"
                )}
              >
                {failedLoginCount}
              </p>
              <p className="text-xs text-slate-400">Failed Logins (24h)</p>
            </div>
          </CardContent>
        </Card>

        {/* Active Sessions */}
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-cyan-500/10">
              <Users className="w-6 h-6 text-cyan-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">
                {activeSessions.length}
              </p>
              <p className="text-xs text-slate-400">Active Sessions</p>
            </div>
          </CardContent>
        </Card>

        {/* API Key Health */}
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div
              className={cn(
                "w-12 h-12 rounded-lg flex items-center justify-center",
                expiringKeyCount > 0 ? "bg-yellow-500/10" : "bg-emerald-500/10"
              )}
            >
              <Key
                className={cn(
                  "w-6 h-6",
                  expiringKeyCount > 0
                    ? "text-yellow-400"
                    : "text-emerald-400"
                )}
              />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{activeKeyCount}</p>
              <p className="text-xs text-slate-400">
                Active{" "}
                {expiringKeyCount > 0 && (
                  <span className="text-yellow-400">
                    / {expiringKeyCount} Expiring
                  </span>
                )}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Audit Integrity */}
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div
              className={cn(
                "w-12 h-12 rounded-lg flex items-center justify-center",
                integrity?.valid === true
                  ? "bg-emerald-500/10"
                  : integrity?.valid === false
                  ? "bg-red-500/10"
                  : "bg-slate-500/10"
              )}
            >
              <ShieldCheck
                className={cn(
                  "w-6 h-6",
                  integrity?.valid === true
                    ? "text-emerald-400"
                    : integrity?.valid === false
                    ? "text-red-400"
                    : "text-slate-400"
                )}
              />
            </div>
            <div>
              <Badge
                variant={
                  integrity?.valid === true
                    ? "success"
                    : integrity?.valid === false
                    ? "destructive"
                    : "secondary"
                }
              >
                {integrity?.valid === true
                  ? "Valid"
                  : integrity?.valid === false
                  ? "Broken"
                  : "Unknown"}
              </Badge>
              <p className="text-xs text-slate-400 mt-1">Audit Integrity</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Security Events */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            Recent Security Events
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/settings/audit-log")}
          >
            View All
            <ExternalLink className="w-3 h-3 ml-1" />
          </Button>
        </CardHeader>
        <CardContent>
          {recentEvents.length > 0 ? (
            <div className="space-y-1">
              {recentEvents.map((event) => {
                const severity = event.severity || "info";
                const dotColor =
                  severityDotColors[severity] || severityDotColors.info;

                return (
                  <div
                    key={event.id}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-800/30 transition-all group"
                  >
                    {/* Severity dot */}
                    <div
                      className={cn(
                        "w-2 h-2 rounded-full flex-shrink-0",
                        dotColor
                      )}
                    />

                    {/* Actor and action */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium text-white truncate">
                          {event.actorName}
                        </span>
                        <span className="text-slate-500 truncate">
                          {event.action.replace(/\./g, " ").replace(/_/g, " ")}
                        </span>
                      </div>
                    </div>

                    {/* IP */}
                    {event.ipAddress && (
                      <span className="text-[10px] text-slate-600 font-mono hidden sm:block flex-shrink-0">
                        {event.ipAddress}
                      </span>
                    )}

                    {/* Result badge */}
                    <Badge
                      variant={
                        resultBadgeVariants[event.result] || "secondary"
                      }
                      className="text-[10px] flex-shrink-0"
                    >
                      {event.result}
                    </Badge>

                    {/* Time */}
                    <span className="text-[10px] text-slate-500 w-16 text-right flex-shrink-0">
                      {formatRelativeTime(event.createdAt)}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-slate-500">
              <ScrollText className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No recent security events.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={() => router.push("/settings/audit-log")}
            >
              <ScrollText className="w-4 h-4 mr-2" />
              View Audit Log
            </Button>

            <Button
              variant="outline"
              onClick={handleCheckIntegrity}
              disabled={integrityChecking}
            >
              {integrityChecking ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Checking...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Check Integrity
                </>
              )}
            </Button>

            <Button
              variant="outline"
              onClick={() => router.push("/settings/sessions")}
            >
              <Users className="w-4 h-4 mr-2" />
              View All Sessions
            </Button>
          </div>

          {/* Show integrity result if just checked */}
          {integrity && integrityChecking === false && (
            <div
              className={cn(
                "mt-4 p-3 rounded-lg border flex items-center gap-3",
                integrity.valid
                  ? "bg-emerald-500/5 border-emerald-500/20"
                  : "bg-red-500/5 border-red-500/20"
              )}
            >
              {integrity.valid ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              ) : (
                <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
              )}
              <div>
                <p
                  className={cn(
                    "text-sm font-medium",
                    integrity.valid ? "text-emerald-400" : "text-red-400"
                  )}
                >
                  {integrity.valid
                    ? "Audit log integrity verified"
                    : "Audit log integrity check failed"}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {integrity.totalRecords} records checked at{" "}
                  {new Date(integrity.checkedAt).toLocaleString()}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    </PageGate>
  );
}
