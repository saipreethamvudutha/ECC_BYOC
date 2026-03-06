/**
 * SCIM 2.0 utilities.
 * RFC 7644 implementation for user provisioning.
 *
 * Maps SCIM User/Group schemas to BYOC User/Role models.
 */

import { prisma } from "./prisma";
import * as bcrypt from "bcryptjs";

// ─── SCIM Schema URNs ───────────────────────────────────────────

export const SCIM_SCHEMAS = {
  USER: "urn:ietf:params:scim:schemas:core:2.0:User",
  GROUP: "urn:ietf:params:scim:schemas:core:2.0:Group",
  LIST_RESPONSE: "urn:ietf:params:scim:api:messages:2.0:ListResponse",
  PATCH_OP: "urn:ietf:params:scim:api:messages:2.0:PatchOp",
  ERROR: "urn:ietf:params:scim:api:messages:2.0:Error",
};

// ─── SCIM Authentication ────────────────────────────────────────

/**
 * Authenticate a SCIM bearer token.
 * Returns the tenantId if valid, null otherwise.
 */
export async function authenticateSCIM(
  request: Request
): Promise<{ tenantId: string; tokenId: string } | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  if (!token || token.length < 10) return null;

  // Find active SCIM tokens for comparison
  const scimTokens = await prisma.sCIMToken.findMany({
    where: { isActive: true },
  });

  for (const st of scimTokens) {
    const valid = await bcrypt.compare(token, st.tokenHash);
    if (valid) {
      // Check expiration
      if (st.expiresAt && st.expiresAt < new Date()) continue;

      // Update lastUsedAt
      await prisma.sCIMToken.update({
        where: { id: st.id },
        data: { lastUsedAt: new Date() },
      });

      return { tenantId: st.tenantId, tokenId: st.id };
    }
  }

  return null;
}

// ─── SCIM User Mapping ──────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */

interface SCIMUser {
  schemas: string[];
  id: string;
  externalId?: string;
  userName: string;
  name: { givenName: string; familyName: string; formatted: string };
  emails: { value: string; primary: boolean; type: string }[];
  phoneNumbers?: { value: string; type: string }[];
  photos?: { value: string; type: string }[];
  active: boolean;
  meta: {
    resourceType: string;
    created: string;
    lastModified: string;
    location: string;
  };
}

/**
 * Map a BYOC User to SCIM User response format.
 */
export function toSCIMUser(
  user: any,
  baseUrl: string
): SCIMUser {
  const nameParts = (user.name || "").split(" ");
  const givenName = nameParts[0] || "";
  const familyName = nameParts.slice(1).join(" ") || "";

  const scimUser: SCIMUser = {
    schemas: [SCIM_SCHEMAS.USER],
    id: user.id,
    externalId: user.authProviderId || undefined,
    userName: user.email,
    name: {
      givenName,
      familyName,
      formatted: user.name || "",
    },
    emails: [{ value: user.email, primary: true, type: "work" }],
    active: user.status === "active",
    meta: {
      resourceType: "User",
      created: user.createdAt.toISOString(),
      lastModified: user.updatedAt.toISOString(),
      location: `${baseUrl}/api/scim/v2/Users/${user.id}`,
    },
  };

  if (user.phone) {
    scimUser.phoneNumbers = [{ value: user.phone, type: "work" }];
  }
  if (user.avatarUrl) {
    scimUser.photos = [{ value: user.avatarUrl, type: "photo" }];
  }

  return scimUser;
}

/**
 * Map a SCIM User creation request to BYOC User fields.
 */
export function fromSCIMUser(scimData: any): {
  email: string;
  name: string;
  phone?: string;
  avatarUrl?: string;
  authProviderId?: string;
  status: string;
} {
  const email = scimData.userName || scimData.emails?.[0]?.value || "";
  const name = scimData.name
    ? `${scimData.name.givenName || ""} ${scimData.name.familyName || ""}`.trim()
    : scimData.displayName || email.split("@")[0];

  return {
    email,
    name,
    phone: scimData.phoneNumbers?.[0]?.value,
    avatarUrl: scimData.photos?.[0]?.value,
    authProviderId: scimData.externalId,
    status: scimData.active !== false ? "active" : "suspended",
  };
}

// ─── SCIM Group Mapping ─────────────────────────────────────────

interface SCIMGroup {
  schemas: string[];
  id: string;
  displayName: string;
  members: { value: string; display: string }[];
  meta: {
    resourceType: string;
    created: string;
    lastModified: string;
    location: string;
  };
}

/**
 * Map a BYOC Role to SCIM Group response format.
 */
export function toSCIMGroup(
  role: any,
  members: { id: string; name: string }[],
  baseUrl: string
): SCIMGroup {
  return {
    schemas: [SCIM_SCHEMAS.GROUP],
    id: role.id,
    displayName: role.name,
    members: members.map((m) => ({ value: m.id, display: m.name })),
    meta: {
      resourceType: "Group",
      created: role.createdAt.toISOString(),
      lastModified: role.updatedAt.toISOString(),
      location: `${baseUrl}/api/scim/v2/Groups/${role.id}`,
    },
  };
}

// ─── SCIM List Response Builder ─────────────────────────────────

export function buildListResponse(
  resources: any[],
  totalResults: number,
  startIndex: number
): any {
  return {
    schemas: [SCIM_SCHEMAS.LIST_RESPONSE],
    totalResults,
    startIndex,
    itemsPerPage: resources.length,
    Resources: resources,
  };
}

// ─── SCIM Error Response Builder ────────────────────────────────

export function buildErrorResponse(
  status: number,
  detail: string,
  scimType?: string
): any {
  return {
    schemas: [SCIM_SCHEMAS.ERROR],
    status: String(status),
    detail,
    ...(scimType && { scimType }),
  };
}

// ─── Simple SCIM Filter Parser ──────────────────────────────────

/**
 * Parse simple SCIM filter expressions.
 * Supports: "userName eq "value"" and "active eq true/false"
 */
export function parseSCIMFilter(filter: string): {
  field: string;
  operator: string;
  value: string;
} | null {
  // Match: field operator "value" OR field operator value
  const match = filter.match(/^(\w+)\s+(eq|ne|co|sw)\s+"?([^"]*)"?$/i);
  if (!match) return null;

  return {
    field: match[1].toLowerCase(),
    operator: match[2].toLowerCase(),
    value: match[3],
  };
}
