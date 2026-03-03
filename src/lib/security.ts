import { prisma } from "./prisma";
import crypto from "crypto";
import type { Session } from "@prisma/client";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum failed login attempts before account lockout. */
export const MAX_FAILED_ATTEMPTS = 5;

/** Duration (in minutes) the account remains locked after exceeding max attempts. */
export const LOCKOUT_DURATION_MINUTES = 15;

/** Session (refresh token) time-to-live in days. */
const SESSION_TTL_DAYS = 7;

// ---------------------------------------------------------------------------
// 1. Account Lockout
// ---------------------------------------------------------------------------

/**
 * Check whether a user account is currently locked out due to repeated
 * failed login attempts.
 *
 * If a previous lockout has expired, this function automatically clears it
 * so the user can attempt to log in again.
 *
 * @param userId - The ID of the user to check.
 * @returns An object indicating lock status, remaining lockout seconds, and
 *          the current failed-attempt count.
 */
export async function checkAccountLockout(
  userId: string
): Promise<{ locked: boolean; remainingSeconds?: number; attempts: number }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { failedLoginAttempts: true, lockedUntil: true },
  });

  if (!user) {
    return { locked: false, attempts: 0 };
  }

  // If the user has a lockout timestamp that is still in the future, they are locked.
  if (user.lockedUntil) {
    const now = new Date();
    if (user.lockedUntil > now) {
      const remainingMs = user.lockedUntil.getTime() - now.getTime();
      const remainingSeconds = Math.ceil(remainingMs / 1000);
      return {
        locked: true,
        remainingSeconds,
        attempts: user.failedLoginAttempts,
      };
    }

    // Lockout has expired -- auto-clear it.
    await prisma.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });

    return { locked: false, attempts: 0 };
  }

  return { locked: false, attempts: user.failedLoginAttempts };
}

/**
 * Record a failed login attempt for the given user.
 *
 * Once the number of failed attempts reaches {@link MAX_FAILED_ATTEMPTS},
 * the account is locked for {@link LOCKOUT_DURATION_MINUTES} minutes.
 *
 * @param userId - The ID of the user who failed to log in.
 * @returns An object with the new lock status and attempt count.
 */
export async function recordFailedLogin(
  userId: string
): Promise<{ locked: boolean; attempts: number }> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { failedLoginAttempts: { increment: 1 } },
    select: { failedLoginAttempts: true },
  });

  const attempts = user.failedLoginAttempts;

  if (attempts >= MAX_FAILED_ATTEMPTS) {
    const lockedUntil = new Date(
      Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000
    );
    await prisma.user.update({
      where: { id: userId },
      data: { lockedUntil },
    });
    return { locked: true, attempts };
  }

  return { locked: false, attempts };
}

/**
 * Reset failed login attempts and clear any active lockout for the user.
 *
 * This should be called after a successful login.
 *
 * @param userId - The ID of the user whose attempts should be reset.
 */
export async function resetFailedLoginAttempts(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { failedLoginAttempts: 0, lockedUntil: null },
  });
}

// ---------------------------------------------------------------------------
// 2. Session Management
// ---------------------------------------------------------------------------

/**
 * Create a new session record tied to a refresh token.
 *
 * The raw refresh token is never stored -- only its SHA-256 hash is persisted.
 * Device, IP, and user-agent metadata are extracted from the incoming request
 * when available.
 *
 * @param userId       - The authenticated user's ID.
 * @param tenantId     - The user's tenant ID.
 * @param refreshToken - The raw refresh token (will be hashed before storage).
 * @param request      - The incoming HTTP request (optional, for metadata extraction).
 * @returns The newly created Session record.
 */
export async function createSession(
  userId: string,
  tenantId: string,
  refreshToken: string,
  request?: Request | null
): Promise<Session> {
  const tokenHash = hashToken(refreshToken);
  const ipAddress = extractIpAddress(request ?? null);
  const userAgent = extractUserAgent(request ?? null);
  const device = parseDevice(userAgent);

  const expiresAt = new Date(
    Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000
  );

  return prisma.session.create({
    data: {
      userId,
      tenantId,
      tokenHash,
      ipAddress,
      userAgent,
      device,
      expiresAt,
    },
  });
}

/**
 * Revoke a single session by marking it inactive.
 *
 * @param sessionId      - The ID of the session to revoke.
 * @param revokedByUserId - The ID of the user performing the revocation.
 */
export async function revokeSession(
  sessionId: string,
  revokedByUserId: string
): Promise<void> {
  await prisma.session.update({
    where: { id: sessionId },
    data: {
      isActive: false,
      revokedAt: new Date(),
      revokedBy: revokedByUserId,
    },
  });
}

/**
 * Revoke all active sessions for a user, optionally keeping one alive.
 *
 * This is useful for "sign out everywhere" or when a password is changed.
 *
 * @param userId           - The user whose sessions should be revoked.
 * @param exceptSessionId  - An optional session ID to spare (the current session).
 * @param revokedByUserId  - The user performing the revocation (defaults to the user themselves).
 * @returns The number of sessions that were revoked.
 */
export async function revokeAllUserSessions(
  userId: string,
  exceptSessionId?: string,
  revokedByUserId?: string
): Promise<number> {
  const where: Record<string, unknown> = {
    userId,
    isActive: true,
  };

  if (exceptSessionId) {
    where.id = { not: exceptSessionId };
  }

  const result = await prisma.session.updateMany({
    where,
    data: {
      isActive: false,
      revokedAt: new Date(),
      revokedBy: revokedByUserId ?? userId,
    },
  });

  return result.count;
}

/**
 * Look up an active session by its token hash.
 *
 * @param tokenHash - The SHA-256 hash of the refresh token.
 * @returns The matching Session, or null if not found / inactive.
 */
export async function getSessionByTokenHash(
  tokenHash: string
): Promise<Session | null> {
  return prisma.session.findFirst({
    where: {
      tokenHash,
      isActive: true,
    },
  });
}

/**
 * Touch a session's `lastActiveAt` timestamp.
 *
 * Call this on every authenticated request to keep the session's activity
 * timestamp current.
 *
 * @param sessionId - The ID of the session to update.
 */
export async function updateSessionActivity(sessionId: string): Promise<void> {
  await prisma.session.update({
    where: { id: sessionId },
    data: { lastActiveAt: new Date() },
  });
}

/**
 * Deactivate all sessions whose expiry has passed.
 *
 * Intended to be run periodically (e.g., via a cron job or scheduled API route).
 *
 * @returns The number of sessions that were cleaned up.
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const result = await prisma.session.updateMany({
    where: {
      expiresAt: { lt: new Date() },
      isActive: true,
    },
    data: { isActive: false },
  });

  return result.count;
}

// ---------------------------------------------------------------------------
// 3. Device Parsing
// ---------------------------------------------------------------------------

/**
 * Parse a raw user-agent string into a human-friendly device description.
 *
 * Returns a string in the format `"Browser on OS"`, for example
 * `"Chrome on Windows"` or `"Safari on iPhone"`.
 *
 * Uses simple regex matching -- no third-party UA parsing library required.
 *
 * @param userAgent - The raw user-agent header value (may be null).
 * @returns A friendly device string, or `"Unknown Device"`.
 */
export function parseDevice(userAgent: string | null): string {
  if (!userAgent) return "Unknown Device";

  const browser = parseBrowser(userAgent);
  const os = parseOS(userAgent);

  if (browser && os) return `${browser} on ${os}`;
  if (browser) return browser;
  if (os) return `Unknown Browser on ${os}`;
  return "Unknown Device";
}

/**
 * Detect the browser name from a user-agent string.
 *
 * Order matters: Edge and Opera include "Chrome" in their UA strings, so they
 * must be matched first.
 */
function parseBrowser(ua: string): string | null {
  // Edge must be checked before Chrome (Edge UA contains "Chrome")
  if (/Edg(e|A|iOS)?\//.test(ua)) return "Edge";
  // Opera must be checked before Chrome (Opera UA contains "Chrome")
  if (/OPR\/|Opera\//.test(ua)) return "Opera";
  if (/Chrome\//.test(ua) && !/Chromium\//.test(ua)) return "Chrome";
  if (/Firefox\//.test(ua)) return "Firefox";
  // Safari must be checked after Chrome (Chrome UA contains "Safari")
  if (/Safari\//.test(ua)) return "Safari";
  return null;
}

/**
 * Detect the operating system / device name from a user-agent string.
 */
function parseOS(ua: string): string | null {
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Windows/.test(ua)) return "Windows";
  if (/Macintosh|Mac OS X/.test(ua)) return "macOS";
  if (/Linux/.test(ua)) return "Linux";
  return null;
}

// ---------------------------------------------------------------------------
// 4. IP & Header Extraction
// ---------------------------------------------------------------------------

/**
 * Extract the client IP address from an incoming request.
 *
 * Checks common reverse-proxy headers in order of preference:
 * 1. `cf-connecting-ip`   (Cloudflare)
 * 2. `x-real-ip`          (Nginx / generic)
 * 3. `x-forwarded-for`    (first entry in the comma-separated list)
 *
 * @param request - The incoming HTTP request, or null.
 * @returns The client IP address string, or null if unavailable.
 */
export function extractIpAddress(request: Request | null): string | null {
  if (!request) return null;

  // Cloudflare provides the true client IP directly.
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();

  // Nginx / generic reverse proxy.
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  // x-forwarded-for is a comma-separated list; the first entry is the client.
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0];
    if (first) return first.trim();
  }

  return null;
}

/**
 * Extract the user-agent header from an incoming request.
 *
 * @param request - The incoming HTTP request, or null.
 * @returns The user-agent string, or null if unavailable.
 */
export function extractUserAgent(request: Request | null): string | null {
  if (!request) return null;
  return request.headers.get("user-agent") ?? null;
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Produce a hex-encoded SHA-256 hash of a token string.
 *
 * @param token - The raw token to hash.
 * @returns The lowercase hex digest.
 */
function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
