import { NextResponse } from "next/server";

/**
 * GET /api/scim/v2/ServiceProviderConfig — SCIM 2.0 discovery.
 */
export async function GET() {
  return NextResponse.json({
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
    documentationUri: "https://byoc-rosy.vercel.app/docs",
    patch: { supported: true },
    bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
    filter: { supported: true, maxResults: 100 },
    changePassword: { supported: false },
    sort: { supported: false },
    etag: { supported: false },
    authenticationSchemes: [
      {
        type: "oauthbearertoken",
        name: "Bearer Token",
        description: "SCIM bearer token authentication",
        specUri: "https://tools.ietf.org/html/rfc6750",
        primary: true,
      },
    ],
    meta: {
      resourceType: "ServiceProviderConfig",
      location: "/api/scim/v2/ServiceProviderConfig",
    },
  });
}
