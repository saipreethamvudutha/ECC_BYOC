import { prisma } from "./prisma";
import { rbac } from "./rbac";
import * as bcrypt from "bcryptjs";
import * as jwt from "jsonwebtoken";
import { cookies } from "next/headers";

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
  type: "access" | "refresh";
}

/**
 * Authenticate a user with email + password.
 */
export async function authenticateUser(
  email: string,
  password: string
): Promise<{ user: SessionUser; accessToken: string; refreshToken: string } | null> {
  const user = await prisma.user.findFirst({
    where: { email, status: "active" },
    include: {
      tenant: true,
      userRoles: { include: { role: true } },
    },
  });

  if (!user || !user.passwordHash) return null;

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    // Log failed attempt
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorId: user.id,
        actorType: "user",
        action: "user.login_failed",
        result: "denied",
        details: JSON.stringify({ reason: "invalid_password" }),
      },
    });
    return null;
  }

  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  // Log successful login
  await prisma.auditLog.create({
    data: {
      tenantId: user.tenantId,
      actorId: user.id,
      actorType: "user",
      action: "user.login",
      result: "success",
    },
  });

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

  return { user: sessionUser, accessToken, refreshToken };
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
