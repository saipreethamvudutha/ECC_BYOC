import { prisma } from "./prisma";
import { rbac } from "./rbac";
import * as bcrypt from "bcryptjs";
import * as jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { createAuditLog } from "./audit";
import { checkAccountLockout, recordFailedLogin, resetFailedLoginAttempts, createSession as createDbSession, cleanupExpiredSessions } from "./security";

// M5: Validate JWT secret strength at module load
const _AUTH_SECRET = process.env.AUTH_SECRET || "";
if (_AUTH_SECRET && _AUTH_SECRET.length < 32) {
  console.warn("[SECURITY WARNING] AUTH_SECRET should be at least 32 characters for production use");
}

function getJwtSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET environment variable is required");
  }
  return secret;
}
const ACCESS_TOKEN_TTL = 15 * 60; // 15 minutes
const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60; // 7 days

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  tenantId: string;
  tenantName: string;
  tenantPlan: string;
  roles: string[];
  avatarUrl?: string | null;
}

export interface JWTPayload {
  userId: string;
  tenantId: string;
  email: string;
  type: "access" | "refresh" | "mfa_pending";
}

export interface AuthResult {
  user: SessionUser;
  accessToken: string;
  refreshToken: string;
  mfaRequired?: false;
}

export interface MFAPendingResult {
  mfaRequired: true;
  mfaPendingToken: string;
  userId: string;
}

/**
 * Authenticate a user with email + password.
 * Returns MFAPendingResult if MFA is enabled (caller must handle MFA verification).
 */
export async function authenticateUser(
  email: string,
  password: string,
  request?: Request | null
): Promise<AuthResult | MFAPendingResult | null> {
  const user = await prisma.user.findFirst({
    where: { email, status: "active" },
    include: {
      tenant: true,
      userRoles: { include: { role: true } },
    },
  });

  if (!user || !user.passwordHash) return null;

  // Check account lockout — return specific error so UI can distinguish
  const lockoutStatus = await checkAccountLockout(user.id);
  if (lockoutStatus.locked) {
    await createAuditLog({
      tenantId: user.tenantId,
      actorId: user.id,
      actorType: "user",
      action: "user.login_failed",
      result: "denied",
      details: { reason: "account_locked", remainingSeconds: lockoutStatus.remainingSeconds },
      request,
    });
    // Throw specific error so login route can show distinct message
    throw new Error(`ACCOUNT_LOCKED:${lockoutStatus.remainingSeconds}`);
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const failResult = await recordFailedLogin(user.id);
    await createAuditLog({
      tenantId: user.tenantId,
      actorId: user.id,
      actorType: "user",
      action: failResult.locked ? "account.locked" : "user.login_failed",
      result: "denied",
      details: {
        reason: "invalid_password",
        attempts: failResult.attempts,
        locked: failResult.locked,
      },
      request,
    });
    return null;
  }

  // Clear failed login attempts on success
  await resetFailedLoginAttempts(user.id);

  // Check if MFA is enabled — if so, return a pending token instead of full auth
  if (user.mfaEnabled && user.mfaSecret) {
    await createAuditLog({
      tenantId: user.tenantId,
      actorId: user.id,
      actorType: "user",
      action: "user.login_mfa_pending",
      result: "success",
      details: { step: "password_verified", mfaRequired: true },
      request,
    });

    const MFA_PENDING_TTL = 5 * 60; // 5 minutes to complete MFA
    const mfaPendingToken = generateToken(
      { userId: user.id, tenantId: user.tenantId, email: user.email, type: "mfa_pending" },
      MFA_PENDING_TTL
    );

    return { mfaRequired: true, mfaPendingToken, userId: user.id };
  }

  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  // Log successful login
  await createAuditLog({
    tenantId: user.tenantId,
    actorId: user.id,
    actorType: "user",
    action: "user.login",
    result: "success",
    request,
  });

  // M6: Opportunistic cleanup of expired sessions (fire-and-forget)
  cleanupExpiredSessions().catch(console.error);

  const sessionUser: SessionUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    tenantId: user.tenantId,
    tenantName: user.tenant.name,
    tenantPlan: user.tenant.plan,
    roles: user.userRoles.map((ur) => ur.role.slug),
    avatarUrl: user.avatarUrl,
  };

  const accessToken = generateToken({ userId: user.id, tenantId: user.tenantId, email: user.email, type: "access" }, ACCESS_TOKEN_TTL);
  const refreshToken = generateToken({ userId: user.id, tenantId: user.tenantId, email: user.email, type: "refresh" }, REFRESH_TOKEN_TTL);

  // Create database session for refresh token tracking
  await createDbSession(user.id, user.tenantId, refreshToken, request);

  return { user: sessionUser, accessToken, refreshToken, mfaRequired: false };
}

/**
 * Complete login after MFA verification — issue tokens and create session.
 */
export async function completeLoginAfterMFA(
  userId: string,
  request?: Request | null
): Promise<AuthResult | null> {
  const user = await prisma.user.findFirst({
    where: { id: userId, status: "active" },
    include: {
      tenant: true,
      userRoles: { include: { role: true } },
    },
  });

  if (!user) return null;

  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  // Log successful MFA login
  await createAuditLog({
    tenantId: user.tenantId,
    actorId: user.id,
    actorType: "user",
    action: "user.login",
    result: "success",
    details: { method: "mfa" },
    request,
  });

  cleanupExpiredSessions().catch(console.error);

  const sessionUser: SessionUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    tenantId: user.tenantId,
    tenantName: user.tenant.name,
    tenantPlan: user.tenant.plan,
    roles: user.userRoles.map((ur) => ur.role.slug),
    avatarUrl: user.avatarUrl,
  };

  const accessToken = generateToken({ userId: user.id, tenantId: user.tenantId, email: user.email, type: "access" }, ACCESS_TOKEN_TTL);
  const refreshToken = generateToken({ userId: user.id, tenantId: user.tenantId, email: user.email, type: "refresh" }, REFRESH_TOKEN_TTL);

  await createDbSession(user.id, user.tenantId, refreshToken, request);

  return { user: sessionUser, accessToken, refreshToken, mfaRequired: false };
}

export function generateToken(payload: JWTPayload, expiresIn: number): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as JWTPayload;
  } catch {
    return null;
  }
}

/**
 * Get current session from cookies (server-side).
 */
export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("byoc_token")?.value;
  if (!token) return null;

  const payload = verifyToken(token);
  if (!payload || payload.type !== "access") return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: {
      tenant: true,
      userRoles: { include: { role: true } },
    },
  });

  if (!user || user.status !== "active") return null;

  // H2: Reject locked accounts (lockout window still active)
  if (user.lockedUntil && user.lockedUntil > new Date()) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    tenantId: user.tenantId,
    tenantName: user.tenant.name,
    tenantPlan: user.tenant.plan,
    roles: user.userRoles.map((ur) => ur.role.slug),
    avatarUrl: user.avatarUrl,
  };
}

/**
 * Get session from API key authentication.
 * Call this in API routes that should support API key auth.
 */
export async function getApiKeySession(request: NextRequest): Promise<SessionUser | null> {
  // Lazy import to avoid circular dependency
  const { authenticateApiKey } = await import("./api-key-auth");
  const apiKeySession = await authenticateApiKey(request);
  if (!apiKeySession) return null;

  const user = await prisma.user.findFirst({
    where: { id: apiKeySession.userId, status: "active" },
    include: {
      tenant: true,
      userRoles: { include: { role: true } },
    },
  });

  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name || "API Key",
    tenantId: apiKeySession.tenantId,
    tenantName: user.tenant.name,
    tenantPlan: user.tenant.plan,
    roles: user.userRoles.map((ur: { role: { slug: string } }) => ur.role.slug),
    avatarUrl: user.avatarUrl,
  };
}

/**
 * Check if current user has a specific capability (v2).
 */
export async function checkCurrentUserCapability(capability: string): Promise<boolean> {
  const session = await getSession();
  if (!session) return false;
  return rbac.checkCapability(session.id, session.tenantId, capability);
}

/**
 * Backward-compatible alias for v1 code.
 */
export async function checkCurrentUserPermission(permission: string): Promise<boolean> {
  const session = await getSession();
  if (!session) return false;
  return rbac.checkPermission(session.id, session.tenantId, permission);
}

/**
 * Get current user's capability profile (for frontend).
 */
export async function getCurrentUserCapabilities() {
  const session = await getSession();
  if (!session) return { capabilities: [], denied: [], roles: [], globalScope: false };
  return rbac.getProfile(session.id, session.tenantId);
}

/**
 * Get current user's permissions list (backward compat).
 */
export async function getCurrentUserPermissions() {
  const session = await getSession();
  if (!session) return { granted: [], denied: [] };
  return rbac.getPermissionsList(session.id, session.tenantId);
}
