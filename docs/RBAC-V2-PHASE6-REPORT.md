# BYOC RBAC v2 Phase 6: Enterprise SSO, MFA & SCIM 2.0 -- Implementation Report

**Date:** 2026-03-06
**Phase:** 6 of 6 -- Enterprise Identity
**Status:** Complete
**Build:** 87 routes, 0 TypeScript errors, 191/191 E2E tests
**Previous Phase:** Phase 5 -- GRC & Compliance (77 routes, 166 E2E tests)

---

## Executive Summary

Phase 6 completes the BYOC platform's enterprise identity story by adding three interconnected capabilities: Multi-Factor Authentication (MFA/TOTP), Single Sign-On (SSO via OAuth 2.0 OIDC), and SCIM 2.0 automated user provisioning. Together, these features transform BYOC from a platform requiring manual password-based user management into one that integrates directly with enterprise identity providers like Okta, Azure AD (Entra ID), and Google Workspace.

**MFA** adds TOTP-based two-factor authentication with backup codes, satisfying SOC 2, ISO 27001, and HIPAA compliance requirements. **SSO** enables passwordless login via OAuth 2.0 with PKCE, supporting Google, Azure AD, and Okta out of the box. **SCIM 2.0** implements automated user provisioning and deprovisioning, so when an employee is removed from Okta or Azure AD, they are automatically suspended in BYOC.

All three features are protected by 4 new RBAC capabilities (`admin.sso.view`, `admin.sso.manage`, `admin.scim.view`, `admin.scim.manage`), integrated with the existing audit logging system, and accessible through a new "Identity" settings page.

### Key Statistics

| Metric | Before (Phase 5) | After (Phase 6) | Delta |
|--------|-------------------|------------------|-------|
| Total routes | 77 | 87 | +10 |
| Capabilities | 46 | 50 | +4 (SSO/SCIM) |
| Prisma models | 20 | 22 | +2 (SSOProvider, SCIMToken) |
| E2E tests | 166 | 191 | +25 |
| TypeScript errors | 0 | 0 | -- |
| Auth methods | 1 (password) | 3 (password, SSO, SCIM) | +2 |
| New libraries | 0 | 4 | encryption, totp, oauth, scim |

---

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| OAuth library | Custom (no next-auth) | Preserves existing JWT auth, session tracking, audit logging, and RBAC integration |
| TOTP library | `otpauth` + `qrcode` | Lightweight, no native deps (Vercel-safe), RFC 6238 compliant |
| SCIM library | Custom REST | SCIM is standard JSON; no heavy library needed |
| Secret encryption | AES-256-GCM via Node.js `crypto` | Built-in, uses AUTH_SECRET-derived key via PBKDF2 |
| MFA approach | TOTP with 10 backup codes | Industry standard, works with Google Authenticator / Authy / 1Password |
| Tenant discovery | Provider-scoped via OAuth state | Each SSOProvider belongs to a tenant; provider ID in state resolves tenant on callback |

---

## Feature A: MFA / TOTP

### How It Works

1. **Setup**: User clicks "Enable MFA" in Settings > Security. Backend generates TOTP secret + QR code. User scans with authenticator app.
2. **Confirm**: User enters the 6-digit code from their app. Backend validates, saves encrypted secret, generates 10 single-use backup codes. Codes shown once.
3. **Login with MFA**: Password verification returns `mfaRequired: true` + short-lived `byoc_mfa` cookie (5-min JWT). User enters TOTP code on the MFA form. Backend verifies code, creates session, issues real tokens.
4. **Disable**: User enters current TOTP code to prove possession. Backend clears all MFA data.

### Technical Details

- **TOTP secret encryption**: AES-256-GCM with key derived from `AUTH_SECRET` via PBKDF2 (100,000 iterations)
- **Code verification**: 30-second time step with +/- 1 window tolerance (RFC 6238)
- **Backup codes**: 10 random 8-character alphanumeric codes, individually bcrypt-hashed
- **MFA pending token**: Short-lived JWT (5 min, type: `"mfa_pending"`) stored in `byoc_mfa` HTTP-only cookie

### API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/auth/mfa/setup` | Initiate MFA enrollment (returns QR code) |
| POST | `/api/auth/mfa/confirm` | Confirm setup with first TOTP code (returns backup codes) |
| POST | `/api/auth/mfa/verify` | Verify TOTP during login (creates session) |
| POST | `/api/auth/mfa/disable` | Disable MFA (requires current TOTP code) |

---

## Feature B: SSO / OAuth 2.0 OIDC

### How It Works

1. **Configuration**: Admin configures SSO provider in Settings > Identity (Client ID, Client Secret, domains, default role).
2. **Login**: User clicks "Sign in with Google" (or Okta/Azure AD) on login page.
3. **OAuth Flow**: Backend generates PKCE challenge + state parameter, redirects to provider's authorization endpoint.
4. **Callback**: Provider redirects back with authorization code. Backend exchanges code for tokens, fetches user info.
5. **JIT Provisioning**: If user doesn't exist and `autoProvision` is enabled, creates new user with provider's default role.
6. **MFA Check**: If user has MFA enabled, sets MFA pending cookie and redirects to MFA form before completing login.

### Technical Details

- **PKCE (Proof Key for Code Exchange)**: S256 challenge method prevents authorization code interception
- **State parameter**: Random 32-byte hex string stored in encrypted `byoc_sso` cookie (10 min TTL)
- **Secret storage**: Client ID and Client Secret encrypted at rest with AES-256-GCM
- **Supported providers**: Google, Azure AD (Entra ID), Okta (extensible to any OIDC provider)
- **Account linking**: Matches by `authProviderId` first, then by `email` + `tenantId`

### API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/auth/sso/authorize` | Initiate OAuth flow (redirects to provider) |
| GET | `/api/auth/sso/callback` | Handle OAuth callback (exchange code, create session) |
| GET | `/api/auth/sso/providers` | Public: list enabled providers for login page |
| GET | `/api/sso/providers` | Admin: list configured providers (masked secrets) |
| POST | `/api/sso/providers` | Admin: create SSO provider |
| PATCH | `/api/sso/providers/[id]` | Admin: update SSO provider |
| DELETE | `/api/sso/providers/[id]` | Admin: delete SSO provider |

---

## Feature C: SCIM 2.0

### How It Works

1. **Token Creation**: Admin creates a SCIM bearer token in Settings > Identity. Token shown once (same pattern as API keys).
2. **IdP Configuration**: Admin enters BYOC's SCIM base URL and bearer token in their IdP (Okta, Azure AD, etc.).
3. **User Provisioning**: When a user is assigned to the BYOC app in the IdP, the IdP sends `POST /api/scim/v2/Users` to create the user.
4. **User Deprovisioning**: When a user is removed, the IdP sends `DELETE /api/scim/v2/Users/[id]` which suspends the user in BYOC.
5. **Group Sync**: IdP pushes group (role) membership changes via `PATCH /api/scim/v2/Groups/[id]`.

### Technical Details

- **Authentication**: Bearer token auth (not JWT cookies). Token bcrypt-hashed in database.
- **SCIM schema mapping**: `userName` -> `email`, `name.givenName + familyName` -> `name`, `active` -> `status`
- **Pagination**: Supports `startIndex` and `count` parameters per SCIM spec
- **Filtering**: Supports `filter=userName eq "user@example.com"` (RFC 7644)
- **Soft delete**: Deactivation sets `status="suspended"`, no hard deletes

### API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/scim/v2/Users` | List users (with pagination, filter) |
| POST | `/api/scim/v2/Users` | Create user (JIT provisioning) |
| GET | `/api/scim/v2/Users/[id]` | Get single user |
| PATCH | `/api/scim/v2/Users/[id]` | Update user (RFC 7644 Operations) |
| DELETE | `/api/scim/v2/Users/[id]` | Deactivate user |
| GET | `/api/scim/v2/Groups` | List roles as SCIM groups |
| GET | `/api/scim/v2/Groups/[id]` | Get role with members |
| PATCH | `/api/scim/v2/Groups/[id]` | Add/remove role members |
| GET | `/api/scim/v2/ServiceProviderConfig` | SCIM discovery |
| GET | `/api/scim/v2/Schemas` | SCIM schema advertisement |

### SCIM Token Management

| Method | Endpoint | Purpose | Capability |
|--------|----------|---------|------------|
| GET | `/api/scim/tokens` | List SCIM tokens | `admin.scim.view` |
| POST | `/api/scim/tokens` | Create SCIM token | `admin.scim.manage` |
| DELETE | `/api/scim/tokens/[id]` | Revoke SCIM token | `admin.scim.manage` |

---

## Schema Changes

### New Models

**SSOProvider** -- Stores OAuth provider configuration per tenant
- Fields: `providerType` (google/azure_ad/okta), `clientId` (encrypted), `clientSecret` (encrypted), `issuerUrl`, `domains` (JSON), `defaultRoleId`, `autoProvision`, `isEnabled`
- Constraints: `@@unique([tenantId, providerType])` -- one provider type per tenant

**SCIMToken** -- Stores SCIM bearer tokens per tenant
- Fields: `tokenHash` (bcrypt, unique), `tokenPrefix` (display), `expiresAt`, `lastUsedAt`, `isActive`
- Pattern: Same as API keys -- shown once on creation, stored as hash

### User Model Additions

```
mfaBackupCodes  String?  // JSON array of bcrypt-hashed backup codes
```

### New Relations

```
Tenant: ssoProviders SSOProvider[], scimTokens SCIMToken[]
User: createdSSOProviders SSOProvider[], createdSCIMTokens SCIMToken[]
```

---

## New Capabilities (4)

| ID | Module | Risk Level | Description |
|----|--------|------------|-------------|
| `admin.sso.view` | admin | low | View SSO configuration |
| `admin.sso.manage` | admin | critical | Configure SSO providers, manage secrets |
| `admin.scim.view` | admin | low | View SCIM tokens and sync status |
| `admin.scim.manage` | admin | high | Create/revoke SCIM tokens |

### Role Assignments

| Role | SSO/SCIM Capabilities |
|------|----------------------|
| Platform Admin | All 4 (all 50 capabilities) |
| Org Admin | All 4 (49 capabilities, billing denied) |
| Auditor | `admin.sso.view`, `admin.scim.view` (19 total, read-only) |
| Others | None |

---

## New Files (22)

| File | Purpose |
|------|---------|
| `src/lib/encryption.ts` | AES-256-GCM encrypt/decrypt using AUTH_SECRET |
| `src/lib/totp.ts` | TOTP secret generation, verification, QR codes, backup codes |
| `src/lib/oauth.ts` | OAuth PKCE flow, provider URL builders, token exchange |
| `src/lib/scim.ts` | SCIM user/group schema mapping, filter parsing, response builders |
| `src/app/api/auth/mfa/setup/route.ts` | MFA enrollment initiation |
| `src/app/api/auth/mfa/confirm/route.ts` | MFA enrollment confirmation |
| `src/app/api/auth/mfa/verify/route.ts` | MFA verification during login |
| `src/app/api/auth/mfa/disable/route.ts` | MFA disable |
| `src/app/api/auth/sso/authorize/route.ts` | OAuth authorization redirect |
| `src/app/api/auth/sso/callback/route.ts` | OAuth callback handler |
| `src/app/api/auth/sso/providers/route.ts` | Public: list enabled SSO providers |
| `src/app/api/sso/providers/route.ts` | Admin: SSO provider CRUD (GET, POST) |
| `src/app/api/sso/providers/[id]/route.ts` | Admin: SSO provider (PATCH, DELETE) |
| `src/app/api/scim/v2/Users/route.ts` | SCIM user list + create |
| `src/app/api/scim/v2/Users/[id]/route.ts` | SCIM user get + update + delete |
| `src/app/api/scim/v2/Groups/route.ts` | SCIM group list |
| `src/app/api/scim/v2/Groups/[id]/route.ts` | SCIM group get + member management |
| `src/app/api/scim/v2/ServiceProviderConfig/route.ts` | SCIM discovery |
| `src/app/api/scim/v2/Schemas/route.ts` | SCIM schema advertisement |
| `src/app/api/scim/tokens/route.ts` | SCIM token CRUD (GET, POST) |
| `src/app/api/scim/tokens/[id]/route.ts` | SCIM token revoke (DELETE) |
| `src/app/(dashboard)/settings/identity/page.tsx` | SSO + SCIM settings page |
| `tests/e2e/14-sso-mfa-scim.spec.ts` | 25 E2E tests for Phase 6 |

## Modified Files (8)

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Added SSOProvider, SCIMToken models; mfaBackupCodes field; relations |
| `src/lib/capabilities.ts` | Added 4 SSO/SCIM capabilities; updated auditor role |
| `src/lib/auth.ts` | Modified `authenticateUser()` for MFA-pending return |
| `src/app/api/auth/login/route.ts` | Handle mfaRequired response; set `byoc_mfa` cookie |
| `src/app/(auth)/login/page.tsx` | SSO buttons + MFA verification form + Suspense boundary |
| `src/app/(dashboard)/settings/layout.tsx` | Added "Identity" tab (Globe icon) |
| `src/app/(dashboard)/settings/security/page.tsx` | Added MFA enable/disable section |
| `src/middleware.ts` | Added SSO/MFA/SCIM public paths and CSRF exemptions |
| `src/app/api/auth/me/route.ts` | Added `mfaEnabled` field from database |

---

## E2E Test Coverage

### Phase 6 Tests: 25 new (`14-sso-mfa-scim.spec.ts`)

**MFA (7 tests)**
- MFA setup initiation returns QR code data
- MFA confirm rejects invalid code
- MFA verify rejects without pending token
- MFA disable rejects without valid code
- MFA setup requires authentication
- MFA section visible on security settings page
- Enable MFA button present when MFA disabled

**SSO (6 tests)**
- SSO provider CRUD: create, read, delete
- Public providers endpoint returns only enabled
- SSO authorize redirects to provider URL
- SSO authorize rejects invalid provider ID
- SSO provider update works
- Identity settings page visible to admin

**SCIM (6 tests)**
- SCIM token CRUD: create, list, revoke
- ServiceProviderConfig returns valid JSON
- Schemas endpoint returns User and Group schemas
- Users endpoint returns 401 without bearer token
- Groups endpoint returns 401 without bearer token
- Token creation requires admin.scim.manage capability

**Capabilities & RBAC (4 tests)**
- 50 capabilities registered in system
- Auditor has SSO/SCIM view but not manage
- Viewer cannot access SSO provider management
- /api/auth/me returns mfaEnabled field

**Navigation (2 tests)**
- Identity tab visible in settings sidebar
- Login page renders email form and branding

### Full Suite: 191/191 passing

| Test File | Tests | Status |
|-----------|-------|--------|
| 01-auth.spec.ts | 9 | Pass |
| 02-dashboard.spec.ts | 6 | Pass |
| 03-assets.spec.ts | 8 | Pass |
| 04-users.spec.ts | 16 | Pass |
| 05-roles.spec.ts | 15 | Pass |
| 06-api-keys.spec.ts | 13 | Pass |
| 07-rbac-enforcement.spec.ts | 24 | Pass |
| 08-audit-log.spec.ts | 9 | Pass |
| 09-sessions.spec.ts | 3 | Pass |
| 10-features.spec.ts | 8 | Pass |
| 11-security.spec.ts | 9 | Pass |
| 12-multi-role-access.spec.ts | 32 | Pass |
| 13-compliance-features.spec.ts | 14 | Pass |
| 14-sso-mfa-scim.spec.ts | 25 | Pass |
| **Total** | **191** | **All Pass** |

---

## Middleware Changes

Added to `publicPaths` (no auth required):
- `/api/auth/sso/authorize` -- SSO initiation
- `/api/auth/sso/callback` -- SSO callback from provider
- `/api/auth/sso/providers` -- Public provider list for login page
- `/api/auth/mfa/verify` -- MFA verification (uses mfa cookie, not session)
- `/api/scim` -- SCIM endpoints (Bearer token auth)

Added to `csrfExemptPaths`:
- `/api/auth/sso/callback` -- Provider redirect
- `/api/auth/mfa/verify` -- MFA form post
- `/api/scim` -- External IdP requests

---

## Compliance Alignment

| Standard | Controls Addressed |
|----------|-------------------|
| SOC 2 Type II | CC6.1 (MFA), CC6.6 (SSO), CC6.7 (automated provisioning) |
| ISO 27001:2022 | A.8.5 (MFA authentication), A.5.16 (identity management), A.5.18 (access rights) |
| NIST CSF 2.0 | PR.AA-01 (identities & credentials), PR.AA-02 (authentication), PR.AA-03 (access control) |
| HIPAA | 164.312(d) (person authentication), 164.312(a)(1) (access control), 164.312(a)(2)(i) (unique user identification) |

---

## NPM Packages Added

```bash
npm install otpauth qrcode
npm install --save-dev @types/qrcode
```

No other packages needed. OAuth uses built-in `fetch()` and Node.js `crypto`.

---

## Platform Summary (All Phases Complete)

| Phase | Feature | Routes | Tests | Capabilities |
|-------|---------|--------|-------|--------------|
| 1 | Core RBAC | 40 | 9 | 42 |
| 2 | Tag-Based Scoping | 55 | 9 | 42 |
| 3 | User & Role Management | 55 | 9 | 42 |
| 4 | Audit & Security | 65 | 120 | 42 |
| 5 | GRC & Compliance | 77 | 166 | 46 |
| **6** | **Enterprise SSO, MFA & SCIM** | **87** | **191** | **50** |

**Final Platform Metrics:**
- 87 API routes
- 50 RBAC capabilities across 9 modules
- 7 built-in roles with deny-wins conflict resolution
- 22 Prisma models
- 5 compliance frameworks with 73 controls
- 3 authentication methods (password, SSO, SCIM)
- 191 E2E tests -- all passing
- 0 TypeScript errors
- Production deployed on Vercel + Railway PostgreSQL
