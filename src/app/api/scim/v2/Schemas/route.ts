import { NextResponse } from "next/server";

/**
 * GET /api/scim/v2/Schemas — SCIM 2.0 schema advertisement.
 */
export async function GET() {
  return NextResponse.json({
    schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
    totalResults: 2,
    Resources: [
      {
        id: "urn:ietf:params:scim:schemas:core:2.0:User",
        name: "User",
        description: "BYOC User Account",
        attributes: [
          { name: "userName", type: "string", multiValued: false, required: true, mutability: "readWrite", uniqueness: "server" },
          { name: "name", type: "complex", multiValued: false, required: false, subAttributes: [
            { name: "givenName", type: "string" },
            { name: "familyName", type: "string" },
            { name: "formatted", type: "string" },
          ]},
          { name: "emails", type: "complex", multiValued: true, required: true },
          { name: "phoneNumbers", type: "complex", multiValued: true, required: false },
          { name: "photos", type: "complex", multiValued: true, required: false },
          { name: "active", type: "boolean", multiValued: false, required: false, mutability: "readWrite" },
          { name: "externalId", type: "string", multiValued: false, required: false, mutability: "readWrite" },
        ],
        meta: { resourceType: "Schema", location: "/api/scim/v2/Schemas/urn:ietf:params:scim:schemas:core:2.0:User" },
      },
      {
        id: "urn:ietf:params:scim:schemas:core:2.0:Group",
        name: "Group",
        description: "BYOC Role (mapped as SCIM Group)",
        attributes: [
          { name: "displayName", type: "string", multiValued: false, required: true, mutability: "readOnly" },
          { name: "members", type: "complex", multiValued: true, required: false, mutability: "readWrite" },
        ],
        meta: { resourceType: "Schema", location: "/api/scim/v2/Schemas/urn:ietf:params:scim:schemas:core:2.0:Group" },
      },
    ],
  });
}
