"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Shield,
  Check,
  X,
  Eye,
  EyeOff,
  Loader2,
  ChevronRight,
  ChevronDown,
  User,
  Lock,
  ShieldCheck,
  Sparkles,
  Phone,
  Building2,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InvitationData {
  id: string;
  email: string;
  orgName: string;
  orgPlan: string;
  roleId: string;
  roleName: string;
  roleSlug: string;
  roleDescription: string;
  invitedBy: string;
  expiresAt: string;
}

interface PermissionEntry {
  resource: string;
  action: string;
  description: string;
}

interface PermissionsData {
  role: { name: string; description: string };
  permissionsByModule: Record<string, PermissionEntry[]>;
  totalPermissions: number;
}

interface OnboardingState {
  step: number;
  token: string;
  invitation: InvitationData | null;
  password: string;
  confirmPassword: string;
  showPassword: boolean;
  showConfirmPassword: boolean;
  department: string;
  phone: string;
  permissions: PermissionsData | null;
  loading: boolean;
  submitting: boolean;
  error: string;
}

// ---------------------------------------------------------------------------
// Password helpers
// ---------------------------------------------------------------------------

interface PasswordCheck {
  label: string;
  met: boolean;
}

function getPasswordChecks(password: string): PasswordCheck[] {
  return [
    { label: "At least 8 characters", met: password.length >= 8 },
    { label: "One uppercase letter", met: /[A-Z]/.test(password) },
    { label: "One lowercase letter", met: /[a-z]/.test(password) },
    { label: "One number", met: /[0-9]/.test(password) },
    { label: "One special character", met: /[^A-Za-z0-9]/.test(password) },
  ];
}

function getStrength(checks: PasswordCheck[]): {
  score: number;
  label: string;
  color: string;
} {
  const score = checks.filter((c) => c.met).length;
  if (score <= 1) return { score, label: "Weak", color: "bg-red-500" };
  if (score === 2) return { score, label: "Fair", color: "bg-orange-500" };
  if (score === 3) return { score, label: "Good", color: "bg-yellow-500" };
  return { score, label: "Strong", color: "bg-emerald-500" };
}

// ---------------------------------------------------------------------------
// Step labels for the progress bar
// ---------------------------------------------------------------------------

const STEP_LABELS = [
  "Welcome",
  "Password",
  "Profile",
  "MFA",
  "Permissions",
  "Complete",
];

// ---------------------------------------------------------------------------
// Wizard component
// ---------------------------------------------------------------------------

function OnboardingWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cardRef = useRef<HTMLDivElement>(null);

  const [state, setState] = useState<OnboardingState>({
    step: 0,
    token: "",
    invitation: null,
    password: "",
    confirmPassword: "",
    showPassword: false,
    showConfirmPassword: false,
    department: "",
    phone: "",
    permissions: null,
    loading: true,
    submitting: false,
    error: "",
  });

  // Convenience updater
  const set = useCallback(
    (patch: Partial<OnboardingState>) =>
      setState((prev) => ({ ...prev, ...patch })),
    []
  );

  // Scroll card into view on step change
  useEffect(() => {
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [state.step]);

  // ---- Step 0: validate token on mount ----
  useEffect(() => {
    const token = searchParams.get("token") || "";
    if (!token) {
      set({ loading: false, error: "No invitation token provided." });
      return;
    }
    set({ token });

    (async () => {
      try {
        const res = await fetch(
          `/api/auth/accept-invitation?token=${encodeURIComponent(token)}`
        );
        const data = await res.json();

        if (!res.ok) {
          set({
            loading: false,
            error: data.error || "Invalid or expired invitation.",
          });
          return;
        }

        set({ loading: false, invitation: data.invitation, step: 1 });
      } catch {
        set({
          loading: false,
          error: "Connection error. Please try again later.",
        });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Step 5: fetch permissions when entering the step ----
  useEffect(() => {
    if (state.step !== 5 || state.permissions || !state.invitation) return;

    (async () => {
      try {
        const res = await fetch(
          `/api/roles/${state.invitation!.roleId}/permissions`
        );
        const data = await res.json();
        if (res.ok) {
          set({ permissions: data });
        }
      } catch {
        // non-critical — we just won't show permissions detail
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.step]);

  // ---- Step navigation helpers ----
  function goTo(step: number) {
    set({ step });
  }

  // ---- Accept invitation (called on step 5 "Activate") ----
  async function activateAccount() {
    set({ submitting: true, error: "" });
    try {
      const res = await fetch("/api/auth/accept-invitation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: state.token,
          password: state.password,
          department: state.department || undefined,
          phone: state.phone || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        set({ submitting: false, error: data.error || "Activation failed." });
        return;
      }

      set({ submitting: false, step: 6 });
    } catch {
      set({ submitting: false, error: "Connection error. Please try again." });
    }
  }

  // ---- Password validation ----
  const checks = getPasswordChecks(state.password);
  const strength = getStrength(checks);
  const passwordsMatch =
    state.password.length > 0 && state.password === state.confirmPassword;
  const passwordValid = checks.every((c) => c.met) && passwordsMatch;

  // =====================================================================
  // RENDER
  // =====================================================================

  // ---- Loading state (step 0) ----
  if (state.loading) {
    return (
      <Shell>
        <div
          ref={cardRef}
          className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full mx-4 p-12 flex flex-col items-center justify-center gap-6"
        >
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-cyan-500/20 blur-xl animate-pulse" />
            <div className="relative flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600">
              <Loader2 className="w-8 h-8 text-white animate-spin" />
            </div>
          </div>
          <p className="text-slate-400 text-sm animate-pulse">
            Validating your invitation...
          </p>
        </div>
      </Shell>
    );
  }

  // ---- Error state (invalid / expired token) ----
  if (state.error && !state.invitation) {
    return (
      <Shell>
        <div
          ref={cardRef}
          className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full mx-4 p-12 flex flex-col items-center gap-6"
        >
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30">
            <X className="w-8 h-8 text-red-400" />
          </div>
          <div className="text-center space-y-2">
            <h2 className="text-xl font-semibold text-white">
              Invitation Invalid
            </h2>
            <p className="text-slate-400 text-sm max-w-sm">{state.error}</p>
          </div>
          <Button variant="outline" onClick={() => router.push("/login")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Login
          </Button>
        </div>
      </Shell>
    );
  }

  const inv = state.invitation!;

  // ---- Main wizard card ----
  return (
    <Shell>
      <div
        ref={cardRef}
        className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full mx-4 overflow-hidden"
      >
        {/* Progress bar */}
        {state.step >= 1 && state.step <= 6 && (
          <ProgressBar current={state.step} />
        )}

        {/* Step content */}
        <div className="p-8 sm:p-10">
          {state.step === 1 && <StepWelcome inv={inv} onNext={() => goTo(2)} />}

          {state.step === 2 && (
            <StepPassword
              email={inv.email}
              password={state.password}
              confirmPassword={state.confirmPassword}
              showPassword={state.showPassword}
              showConfirmPassword={state.showConfirmPassword}
              checks={checks}
              strength={strength}
              passwordsMatch={passwordsMatch}
              passwordValid={passwordValid}
              onChange={set}
              onNext={() => goTo(3)}
              onBack={() => goTo(1)}
            />
          )}

          {state.step === 3 && (
            <StepProfile
              department={state.department}
              phone={state.phone}
              onChange={set}
              onNext={() => goTo(4)}
              onSkip={() => goTo(4)}
              onBack={() => goTo(2)}
            />
          )}

          {state.step === 4 && (
            <StepMFA onSkip={() => goTo(5)} onBack={() => goTo(3)} />
          )}

          {state.step === 5 && (
            <StepPermissions
              inv={inv}
              permissions={state.permissions}
              submitting={state.submitting}
              error={state.error}
              onActivate={activateAccount}
              onBack={() => goTo(4)}
            />
          )}

          {state.step === 6 && <StepComplete orgName={inv.orgName} />}
        </div>
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Shell — background with blobs
// ---------------------------------------------------------------------------

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0e1a] relative overflow-hidden">
      {/* Ambient blobs */}
      <div className="absolute top-1/4 -left-32 w-[500px] h-[500px] bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-indigo-500/3 rounded-full blur-3xl pointer-events-none" />
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------

function ProgressBar({ current }: { current: number }) {
  return (
    <div className="px-8 sm:px-10 pt-8 sm:pt-10">
      <div className="flex items-center gap-1">
        {STEP_LABELS.map((label, idx) => {
          const stepNum = idx + 1;
          const isCompleted = current > stepNum;
          const isActive = current === stepNum;

          return (
            <div key={label} className="flex-1 flex flex-col items-center gap-2">
              {/* Bar segment */}
              <div className="w-full h-1.5 rounded-full overflow-hidden bg-slate-800">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    isCompleted
                      ? "w-full bg-gradient-to-r from-cyan-500 to-blue-500"
                      : isActive
                      ? "w-1/2 bg-gradient-to-r from-cyan-500 to-blue-500"
                      : "w-0"
                  )}
                />
              </div>
              {/* Label */}
              <span
                className={cn(
                  "text-[10px] font-medium tracking-wide uppercase hidden sm:block",
                  isCompleted
                    ? "text-cyan-400"
                    : isActive
                    ? "text-slate-200"
                    : "text-slate-600"
                )}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Welcome
// ---------------------------------------------------------------------------

function StepWelcome({
  inv,
  onNext,
}: {
  inv: InvitationData;
  onNext: () => void;
}) {
  return (
    <div className="flex flex-col items-center text-center gap-6">
      {/* Shield icon */}
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-cyan-500/20 blur-xl animate-pulse" />
        <div className="relative flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/30">
          <Shield className="w-10 h-10 text-white" />
        </div>
      </div>

      {/* Heading */}
      <div className="space-y-3">
        <h1 className="text-3xl font-bold text-white">
          You&apos;ve been invited!
        </h1>
        <p className="text-slate-400 text-base max-w-md">
          <span className="text-slate-300 font-medium">{inv.invitedBy}</span>{" "}
          has invited you to join{" "}
          <span className="text-white font-semibold">{inv.orgName}</span>
        </p>
      </div>

      {/* Role badge */}
      <div className="flex flex-col items-center gap-2">
        <Badge className="text-sm px-4 py-1.5">{inv.roleName}</Badge>
        {inv.roleDescription && (
          <p className="text-slate-500 text-sm max-w-sm">
            {inv.roleDescription}
          </p>
        )}
      </div>

      {/* CTA */}
      <Button size="lg" onClick={onNext} className="mt-2 min-w-[200px]">
        Get Started
        <ArrowRight className="w-4 h-4 ml-2" />
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Set Password
// ---------------------------------------------------------------------------

interface StepPasswordProps {
  email: string;
  password: string;
  confirmPassword: string;
  showPassword: boolean;
  showConfirmPassword: boolean;
  checks: PasswordCheck[];
  strength: { score: number; label: string; color: string };
  passwordsMatch: boolean;
  passwordValid: boolean;
  onChange: (patch: Partial<OnboardingState>) => void;
  onNext: () => void;
  onBack: () => void;
}

function StepPassword({
  email,
  password,
  confirmPassword,
  showPassword,
  showConfirmPassword,
  checks,
  strength,
  passwordsMatch,
  passwordValid,
  onChange,
  onNext,
  onBack,
}: StepPasswordProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
          <Lock className="w-5 h-5 text-cyan-400" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-white">
            Create Your Password
          </h2>
          <p className="text-sm text-slate-400">
            Secure your account with a strong password
          </p>
        </div>
      </div>

      {/* Email (read-only) */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-300">Email</label>
        <Input value={email} disabled className="opacity-60" />
      </div>

      {/* Password */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-300">Password</label>
        <div className="relative">
          <Input
            type={showPassword ? "text" : "password"}
            placeholder="Enter a strong password"
            value={password}
            onChange={(e) => onChange({ password: e.target.value })}
            className="pr-10"
            autoFocus
          />
          <button
            type="button"
            onClick={() => onChange({ showPassword: !showPassword })}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
          >
            {showPassword ? (
              <EyeOff className="w-4 h-4" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Strength meter */}
      {password.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">Password strength</span>
            <span
              className={cn(
                "text-xs font-medium",
                strength.score <= 1
                  ? "text-red-400"
                  : strength.score === 2
                  ? "text-orange-400"
                  : strength.score === 3
                  ? "text-yellow-400"
                  : "text-emerald-400"
              )}
            >
              {strength.label}
            </span>
          </div>
          <div className="flex gap-1.5">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={cn(
                  "h-1.5 flex-1 rounded-full transition-all duration-300",
                  i < Math.ceil(strength.score / 1.25)
                    ? strength.color
                    : "bg-slate-800"
                )}
              />
            ))}
          </div>
        </div>
      )}

      {/* Confirm password */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-300">
          Confirm Password
        </label>
        <div className="relative">
          <Input
            type={showConfirmPassword ? "text" : "password"}
            placeholder="Re-enter your password"
            value={confirmPassword}
            onChange={(e) => onChange({ confirmPassword: e.target.value })}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() =>
              onChange({ showConfirmPassword: !showConfirmPassword })
            }
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
          >
            {showConfirmPassword ? (
              <EyeOff className="w-4 h-4" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
          </button>
        </div>
        {confirmPassword.length > 0 && !passwordsMatch && (
          <p className="text-xs text-red-400 flex items-center gap-1">
            <X className="w-3 h-3" />
            Passwords do not match
          </p>
        )}
        {passwordsMatch && (
          <p className="text-xs text-emerald-400 flex items-center gap-1">
            <Check className="w-3 h-3" />
            Passwords match
          </p>
        )}
      </div>

      {/* Requirements checklist */}
      {password.length > 0 && (
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 space-y-2">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
            Requirements
          </p>
          {checks.map((c) => (
            <div key={c.label} className="flex items-center gap-2 text-sm">
              {c.met ? (
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <X className="w-4 h-4 text-slate-600 shrink-0" />
              )}
              <span
                className={cn(c.met ? "text-slate-300" : "text-slate-500")}
              >
                {c.label}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Button disabled={!passwordValid} onClick={onNext}>
          Continue
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Profile Setup
// ---------------------------------------------------------------------------

function StepProfile({
  department,
  phone,
  onChange,
  onNext,
  onSkip,
  onBack,
}: {
  department: string;
  phone: string;
  onChange: (patch: Partial<OnboardingState>) => void;
  onNext: () => void;
  onSkip: () => void;
  onBack: () => void;
}) {
  const departments = [
    "Engineering",
    "Security Operations",
    "IT Operations",
    "Compliance",
    "Management",
    "DevOps",
    "Other",
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
          <User className="w-5 h-5 text-cyan-400" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-white">Profile Setup</h2>
          <p className="text-sm text-slate-400">
            Optional info to help your team
          </p>
        </div>
      </div>

      {/* Department */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-slate-500" />
          Department
        </label>
        <div className="relative">
          <Input
            list="dept-suggestions"
            placeholder="Select or type your department"
            value={department}
            onChange={(e) => onChange({ department: e.target.value })}
          />
          <datalist id="dept-suggestions">
            {departments.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </div>
      </div>

      {/* Phone */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
          <Phone className="w-4 h-4 text-slate-500" />
          Phone Number
          <span className="text-xs text-slate-600">(optional)</span>
        </label>
        <Input
          type="tel"
          placeholder="+1 (555) 000-0000"
          value={phone}
          onChange={(e) => onChange({ phone: e.target.value })}
        />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={onSkip}>
            Skip
          </Button>
          <Button onClick={onNext}>
            Continue
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — MFA Setup (placeholder)
// ---------------------------------------------------------------------------

function StepMFA({
  onSkip,
  onBack,
}: {
  onSkip: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
          <ShieldCheck className="w-5 h-5 text-cyan-400" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-white">
            Multi-Factor Authentication
          </h2>
          <p className="text-sm text-slate-400">
            Add an extra layer of security to your account
          </p>
        </div>
      </div>

      {/* QR placeholder */}
      <div className="flex flex-col items-center gap-4 py-6">
        <div className="relative w-48 h-48 rounded-2xl bg-slate-800/60 border-2 border-dashed border-slate-700 flex items-center justify-center">
          {/* Simulated QR grid — decorative */}
          <div className="grid grid-cols-6 gap-1.5 opacity-10">
            {Array.from({ length: 36 }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  "w-4 h-4 rounded-sm",
                  Math.random() > 0.4 ? "bg-slate-400" : "bg-transparent"
                )}
              />
            ))}
          </div>
          {/* Overlay badge */}
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60 rounded-2xl">
            <Badge variant="info" className="text-xs px-3 py-1">
              <Sparkles className="w-3 h-3 mr-1" />
              Coming Soon
            </Badge>
          </div>
        </div>

        <p className="text-sm text-slate-500 max-w-xs text-center">
          MFA support is being rolled out soon. You can set it up later from
          your account settings.
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Button variant="ghost" onClick={onSkip}>
          Skip for Now
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 5 — Role & Permission Confirmation
// ---------------------------------------------------------------------------

function StepPermissions({
  inv,
  permissions,
  submitting,
  error,
  onActivate,
  onBack,
}: {
  inv: InvitationData;
  permissions: PermissionsData | null;
  submitting: boolean;
  error: string;
  onActivate: () => void;
  onBack: () => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  function toggle(mod: string) {
    setExpanded((prev) => ({ ...prev, [mod]: !prev[mod] }));
  }

  const modules = permissions
    ? Object.entries(permissions.permissionsByModule)
    : [];
  const moduleCount = modules.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
          <ShieldCheck className="w-5 h-5 text-cyan-400" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-white">
            Review Your Role
          </h2>
          <p className="text-sm text-slate-400">
            Confirm your access permissions before activation
          </p>
        </div>
      </div>

      {/* Role info */}
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-3">
          <Badge className="text-sm px-3 py-1">{inv.roleName}</Badge>
        </div>
        {inv.roleDescription && (
          <p className="text-sm text-slate-400">{inv.roleDescription}</p>
        )}
        {permissions && (
          <p className="text-xs text-slate-500">
            {permissions.totalPermissions} permissions across {moduleCount}{" "}
            module{moduleCount !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      {/* Permissions by module */}
      {permissions && (
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
          {modules.map(([mod, perms]) => {
            const isOpen = expanded[mod] ?? false;
            return (
              <div
                key={mod}
                className="bg-slate-800/30 border border-slate-700/40 rounded-lg overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => toggle(mod)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-800/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs capitalize">
                      {mod.replace(/_/g, " ")}
                    </Badge>
                    <span className="text-xs text-slate-500">
                      {perms.length} permission{perms.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {isOpen ? (
                    <ChevronDown className="w-4 h-4 text-slate-500" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-500" />
                  )}
                </button>

                {isOpen && (
                  <div className="px-4 pb-3 space-y-2">
                    {perms.map((p, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-2 text-sm pl-2 border-l-2 border-slate-700/50"
                      >
                        <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="text-slate-300 font-medium">
                            {p.action}
                          </span>
                          <span className="text-slate-600 mx-1.5">&middot;</span>
                          <span className="text-slate-500">{p.resource}</span>
                          {p.description && (
                            <p className="text-xs text-slate-600 mt-0.5">
                              {p.description}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Loading permissions */}
      {!permissions && (
        <div className="flex items-center justify-center py-8 gap-2 text-slate-500 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading permissions...
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" onClick={onBack} disabled={submitting}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Button
          size="lg"
          onClick={onActivate}
          disabled={submitting}
          className="min-w-[200px]"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Activating...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              Activate My Account
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 6 — Success / Complete
// ---------------------------------------------------------------------------

function StepComplete({ orgName }: { orgName: string }) {
  const router = useRouter();
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timer);
          router.push("/");
          router.refresh();
          return 0;
        }
        return c - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [router]);

  return (
    <div className="flex flex-col items-center text-center gap-6 py-4">
      {/* Animated checkmark */}
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-emerald-500/20 blur-xl animate-pulse" />
        <div className="relative flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/30 animate-[scaleIn_0.5s_ease-out]">
          <CheckCircle2 className="w-12 h-12 text-white" />
        </div>
      </div>

      {/* Text */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-white">
          Welcome to {orgName}!
        </h1>
        <p className="text-slate-400">
          Your account has been activated successfully.
        </p>
      </div>

      {/* Countdown */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        Redirecting to dashboard in {countdown}s...
      </div>

      {/* Manual button */}
      <Button
        size="lg"
        onClick={() => {
          router.push("/");
          router.refresh();
        }}
        className="min-w-[200px]"
      >
        Go to Dashboard
        <ArrowRight className="w-4 h-4 ml-2" />
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Default export — wrapped in Suspense for useSearchParams
// ---------------------------------------------------------------------------

export default function AcceptInvitationPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#0a0e1a]">
          <div className="flex items-center gap-3 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Loading...</span>
          </div>
        </div>
      }
    >
      <OnboardingWizard />
    </Suspense>
  );
}
