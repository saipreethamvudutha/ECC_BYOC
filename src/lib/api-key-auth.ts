import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { createAuditLog } from "@/lib/audit";
import { checkRateLimit, type RateLimitConfig } from "@/lib/rate-limit";

export interface ApiKeySession {
  type: "api_key";
  apiKeyId: string;
  apiKeyName: string;
  tenantId: string;
  roleId: string;
  userId: string; // createdById — for audit attribution
}

/**
 * Authenticate a request using an API key.
 * API keys are passed in the Authorization header: `Bearer byoc_...`
 * or in `X-API-Key` header.
 *
 * Returns null if no API key provided or invalid.
 */
export async function authenticateApiKey(
  request: NextRequest
): Promise<ApiKeySession | null> {
  // Extract API key from headers
  const authHeader = request.headers.get("authorization");
  const xApiKey = request.headers.get("x-api-key");

  let apiKey: string | null = null;

  if (authHeader?.startsWith("Bearer byoc_")) {
    apiKey = authHeader.substring(7); // Remove "Bearer "
  } else if (xApiKey?.startsWith("byoc_")) {
    apiKey = xApiKey;
  }

  if (!apiKey) return null;

  // Extract prefix for lookup (first 13 chars = "byoc_" + 8 chars)
  const prefix = apiKey.substring(0, 13);

  // Find matching API keys by prefix
  const candidates = await prisma.apiKey.findMany({
    where: {
      keyPrefix: prefix,
      isActive: true,
    },
    include: {
      role: { select: { id: true, name: true } },
      createdBy: { select: { id: true, tenantId: true } },
    },
  });

  if (candidates.length === 0) return null;

  // Verify key hash against candidates
  for (const candidate of candidates) {
    const isValid = await bcrypt.compare(apiKey, candidate.keyHash);
    if (!isValid) continue;

    // Check expiry
    if (candidate.expiresAt && candidate.expiresAt < new Date()) {
      await createAuditLog({
        tenantId: candidate.createdBy.tenantId,
        actorId: candidate.id,
        actorType: "api_key",
        action: "apikey.auth_failed",
        details: { reason: "expired", keyPrefix: prefix },
        result: "denied",
        request,
      }).catch(console.error);
      return null;
    }

    // Check IP allowlist
    const ipAllowlist = candidate.ipAllowlist as string[] | null;
    if (ipAllowlist && ipAllowlist.length > 0) {
      const clientIp =
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        request.headers.get("x-real-ip") ||
        "unknown";

      if (!ipAllowlist.includes(clientIp)) {
        await createAuditLog({
          tenantId: candidate.createdBy.tenantId,
          actorId: candidate.id,
          actorType: "api_key",
          action: "apikey.auth_failed",
          details: { reason: "ip_not_allowed", clientIp, keyPrefix: prefix },
          result: "denied",
          request,
        }).catch(console.error);
        return null;
      }
    }

    // Check per-key rate limit
    if (candidate.rateLimit) {
      const rateLimitConfig: RateLimitConfig = {
        maxRequests: candidate.rateLimit,
        windowSeconds: 3600, // 1 hour window
      };
      const rateCheck = checkRateLimit(`apikey:${candidate.id}`, rateLimitConfig);
      if (!rateCheck.allowed) {
        await createAuditLog({
          tenantId: candidate.createdBy.tenantId,
          actorId: candidate.id,
          actorType: "api_key",
          action: "apikey.rate_limited",
          details: { keyPrefix: prefix, limit: candidate.rateLimit },
          result: "denied",
          request,
        }).catch(console.error);
        return null;
      }
    }

    // Update lastUsedAt (fire-and-forget)
    prisma.apiKey
      .update({
        where: { id: candidate.id },
        data: { lastUsedAt: new Date() },
      })
      .catch(() => {});

    return {
      type: "api_key",
      apiKeyId: candidate.id,
      apiKeyName: candidate.name,
      tenantId: candidate.createdBy.tenantId,
      roleId: candidate.roleId,
      userId: candidate.createdById,
    };
  }

  return null;
}
