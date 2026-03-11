"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, Eye, EyeOff, Loader2, Globe, ArrowLeft } from "lucide-react";

interface SSOProviderInfo {
  id: string;
  providerType: string;
  name: string;
}

const providerIcons: Record<string, string> = {
  google: "G",
  azure_ad: "M",
  okta: "O",
};

const providerColors: Record<string, string> = {
  google: "bg-red-600 hover:bg-red-500",
  azure_ad: "bg-blue-600 hover:bg-blue-500",
  okta: "bg-indigo-600 hover:bg-indigo-500",
};

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // MFA state
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [isBackupCode, setIsBackupCode] = useState(false);
  const [mfaLoading, setMfaLoading] = useState(false);

  // SSO providers
  const [ssoProviders, setSsoProviders] = useState<SSOProviderInfo[]>([]);

  // Check for SSO errors and MFA redirect
  useEffect(() => {
    const ssoError = searchParams.get("error");
    if (ssoError) {
      const errorMessages: Record<string, string> = {
        sso_failed: "SSO authentication failed. Please try again.",
        sso_session_expired: "SSO session expired. Please try again.",
        sso_state_mismatch: "SSO security check failed. Please try again.",
        sso_domain_not_allowed: "Your email domain is not authorized for SSO.",
        sso_no_account: "No account found and auto-provisioning is disabled.",
        sso_account_suspended: "Your account has been suspended.",
        sso_no_email: "SSO provider did not return your email address.",
      };
      setError(errorMessages[ssoError] || `SSO error: ${ssoError}`);
    }

    if (searchParams.get("mfa") === "true") {
      setMfaRequired(true);
    }

    // Fetch SSO providers for login page
    fetch("/api/auth/sso/providers")
      .then(r => r.json())
      .then(data => setSsoProviders(data.providers || []))
      .catch(() => {});
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Invalid credentials");
        return;
      }

      if (data.mfaRequired) {
        setMfaRequired(true);
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleMfaVerify(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMfaLoading(true);

    try {
      const res = await fetch("/api/auth/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: mfaCode, isBackupCode }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Invalid verification code");
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setMfaLoading(false);
    }
  }

  function handleSSOLogin(providerId: string) {
    window.location.href = `/api/auth/sso/authorize?providerId=${providerId}`;
  }

  return (
    <div className="relative w-full max-w-md px-6">
      {/* Logo */}
      <div className="flex flex-col items-center mb-10">
        <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/30 mb-4">
          <Shield className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold gradient-text">BYOC</h1>
        <p className="text-slate-500 text-sm mt-1">Cybersecurity Platform</p>
      </div>

      {/* Login / MFA form */}
      <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-2xl p-8 shadow-2xl glow-border">
        {mfaRequired ? (
          /* MFA Verification Form */
          <>
            <div className="mb-6">
              <button
                onClick={() => { setMfaRequired(false); setMfaCode(""); setError(""); setIsBackupCode(false); }}
                className="flex items-center gap-1 text-sm text-slate-400 hover:text-white mb-3"
              >
                <ArrowLeft className="w-3 h-3" /> Back to login
              </button>
              <h2 className="text-xl font-semibold text-white">Two-Factor Authentication</h2>
              <p className="text-sm text-slate-400 mt-1">
                {isBackupCode
                  ? "Enter one of your backup recovery codes"
                  : "Enter the 6-digit code from your authenticator app"}
              </p>
            </div>

            <form onSubmit={handleMfaVerify} className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">
                  {isBackupCode ? "Backup Code" : "Verification Code"}
                </label>
                <Input
                  type="text"
                  placeholder={isBackupCode ? "XXXX-XXXX" : "000000"}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  required
                  autoFocus
                  maxLength={isBackupCode ? 9 : 6}
                  className="text-center text-lg tracking-widest"
                />
              </div>

              {error && (
                <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full h-11" disabled={mfaLoading}>
                {mfaLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Verifying...</>
                ) : (
                  "Verify"
                )}
              </Button>

              <button
                type="button"
                onClick={() => { setIsBackupCode(!isBackupCode); setMfaCode(""); setError(""); }}
                className="w-full text-center text-sm text-cyan-400 hover:text-cyan-300"
              >
                {isBackupCode ? "Use authenticator app instead" : "Use a backup code"}
              </button>
            </form>
          </>
        ) : (
          /* Normal Login Form */
          <>
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-white">Welcome back</h2>
              <p className="text-sm text-slate-400 mt-1">
                Sign in to your security operations center
              </p>
            </div>

            {/* SSO Buttons */}
            {ssoProviders.length > 0 && (
              <>
                <div className="space-y-2 mb-5">
                  {ssoProviders.map(p => (
                    <button
                      key={p.id}
                      onClick={() => handleSSOLogin(p.id)}
                      className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-white text-sm font-medium transition-colors ${providerColors[p.providerType] || "bg-slate-600 hover:bg-slate-500"}`}
                    >
                      <span className="w-5 h-5 flex items-center justify-center rounded bg-white/20 text-xs font-bold">
                        {providerIcons[p.providerType] || <Globe className="w-3 h-3" />}
                      </span>
                      Sign in with {p.name}
                    </button>
                  ))}
                </div>

                <div className="relative mb-5">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-700" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-slate-900 px-3 text-slate-500">or continue with email</span>
                  </div>
                </div>
              </>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Email</label>
                <Input
                  type="email"
                  placeholder="admin@exargen.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Password</label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full h-11" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Authenticating...
                  </>
                ) : (
                  "Sign in"
                )}
              </Button>
            </form>

          </>
        )}
      </div>

      <p className="text-center text-xs text-slate-600 mt-8">
        BYOC Cybersecurity Platform v0.9.0
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center grid-pattern relative">
      {/* Background effects */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl" />
      </div>

      <Suspense fallback={
        <div className="relative w-full max-w-md px-6 flex flex-col items-center">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/30 mb-4">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <Loader2 className="w-6 h-6 text-cyan-400 animate-spin mt-4" />
        </div>
      }>
        <LoginForm />
      </Suspense>
    </div>
  );
}
