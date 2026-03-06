# Phase 6: Enterprise SSO, MFA & SCIM 2.0 — Technical Guide

> **Audience**: Engineers, MIS professionals, and technical stakeholders who want to understand what this phase delivers, how each component works, and why it matters for enterprise deployments.

---

## Table of Contents

1. [The Problem We're Solving](#the-problem-were-solving)
2. [SSO (Single Sign-On)](#part-1-sso-single-sign-on)
3. [MFA (Multi-Factor Authentication)](#part-2-mfa-multi-factor-authentication)
4. [SCIM 2.0 (Automated User Provisioning)](#part-3-scim-20-automated-user-provisioning)
5. [How All Three Work Together](#how-all-three-work-together)
6. [Technical Implementation Summary](#technical-implementation-summary)
7. [Security Considerations](#security-considerations)

---

## The Problem We're Solving

BYOC's Phases 1-5 delivered a complete cybersecurity platform with email/password authentication. Admins manually create accounts by sending invitation emails. This works for small teams, but enterprise customers have strict requirements:

| Requirement | Why | Solution |
|-------------|-----|----------|
| "Our employees already have Okta/Azure accounts. No more passwords." | Password fatigue, centralized identity management | **SSO** |
| "Compliance requires multi-factor auth on every security tool." | SOC 2, ISO 27001, HIPAA mandate MFA | **MFA** |
| "When someone is terminated, they must be instantly locked out everywhere." | Security risk of orphaned accounts | **SCIM** |

---

## Part 1: SSO (Single Sign-On)

### What SSO Is

SSO lets users log into BYOC using credentials they already have at their company's identity provider (IdP). Instead of BYOC managing passwords, authentication is delegated to a trusted third party.

When you visit a website and click "Sign in with Google," Google verifies your identity and the website trusts Google's response. BYOC works the same way but with enterprise providers.

### Supported Providers

| Provider | Who Uses It | Market Share |
|----------|-------------|--------------|
| **Google Workspace** | Tech companies, startups | ~6M businesses |
| **Azure AD (Entra ID)** | Enterprise, government | Microsoft's identity platform, dominant in enterprise |
| **Okta** | Security-focused companies | Industry-leading identity provider |

### How OAuth 2.0 OIDC Works (Step by Step)

We implement **OAuth 2.0 with OpenID Connect (OIDC)**, the industry standard protocol.

#### Step 1: Admin Configures SSO (One-Time Setup)

An Exargen admin goes to Settings > Identity > "Add SSO Provider":
- Selects "Google" (or Azure/Okta)
- Enters the **Client ID** and **Client Secret** (obtained from Google Cloud Console / Azure Portal / Okta Admin)
- Specifies allowed email domains: `["exargen.com"]`
- Selects a default role for auto-provisioned users (e.g., "Viewer")
- Configuration is stored in our database, **encrypted at rest** using AES-256-GCM

#### Step 2: User Clicks "Sign in with Google"

The login page dynamically shows SSO buttons by calling our API to check what providers are configured for the tenant.

#### Step 3: BYOC Redirects to Google's Login Page

Our backend builds a special authorization URL:

```
https://accounts.google.com/o/oauth2/v2/auth?
  client_id=OUR_CLIENT_ID
  &redirect_uri=https://byoc-rosy.vercel.app/api/auth/sso/callback
  &response_type=code
  &scope=openid+profile+email
  &state=RANDOM_STATE_TOKEN
  &code_challenge=PKCE_CHALLENGE
  &code_challenge_method=S256
```

Key security features:
- **`state` parameter**: Random token to prevent CSRF attacks (validated on return)
- **`code_challenge` (PKCE)**: Proof Key for Code Exchange prevents authorization code interception

#### Step 4: User Authenticates at Google

Google shows their normal login page. User authenticates with their existing credentials and MFA. Google redirects back to our callback URL with an **authorization code**.

#### Step 5: Server-to-Server Token Exchange

Our backend exchanges the authorization code for tokens:

```
POST https://oauth2.googleapis.com/token
{
  code: "AUTHORIZATION_CODE",
  client_id: "OUR_CLIENT_ID",
  client_secret: "OUR_SECRET",
  redirect_uri: "OUR_CALLBACK_URL",
  grant_type: "authorization_code",
  code_verifier: "PKCE_VERIFIER"
}
```

Google responds with an **access token** and an **ID token** (JWT containing user info).

#### Step 6: Fetch User Identity

We call Google's userinfo endpoint:

```
GET https://www.googleapis.com/oauth2/v3/userinfo
Authorization: Bearer ACCESS_TOKEN
```

Response: `{ sub: "12345", email: "john@exargen.com", name: "John Smith", picture: "..." }`

#### Step 7: JIT (Just-In-Time) Provisioning

BYOC checks if this user exists in the database:

| Scenario | Action |
|----------|--------|
| User exists with same SSO provider | Log them in (returning user) |
| User exists with email/password | Link SSO identity to existing account |
| User doesn't exist (first time) | Auto-create with SSO provider, default role, no password |

JIT provisioning means user accounts are created on-the-fly during first SSO login. No manual invitation needed.

#### Step 8: Issue JWT Tokens

From this point, the flow is identical to password login:
- Generate access token (15 min) + refresh token (7 days)
- Create Session in database (with IP, device, audit trail)
- Set HTTP-only cookies
- Redirect to dashboard

### What We're NOT Building

- Not building a full identity provider (we consume SSO, not provide it)
- Not replacing local auth (email/password still works)
- Not using next-auth or Auth.js (custom OAuth preserves our JWT + audit + RBAC system)
- Client ID/Secret come from the provider's admin console, not from us

---

## Part 2: MFA (Multi-Factor Authentication)

### What MFA Is

MFA adds a second layer to authentication. After your password (something you **know**), you must present something you **have** (a code from your phone's authenticator app).

We implement **TOTP (Time-based One-Time Password)**, the same standard used by Google Authenticator, Authy, Microsoft Authenticator, and 1Password.

### How TOTP Works (RFC 6238)

The math is elegant:

1. BYOC generates a random **32-byte secret** (base32 encoded)
2. This secret is shared between BYOC and the authenticator app (via QR code scan)
3. Every 30 seconds, both sides independently compute:

```
code = HMAC-SHA1(secret, floor(current_unix_time / 30))
     -> truncate to 6-digit number
```

4. Since both sides have the same secret and the same clock, they generate the same code
5. The code changes every 30 seconds, making stolen codes useless

### MFA Setup Flow

1. User goes to Settings > Security > "Enable Two-Factor Authentication"
2. Backend generates a TOTP secret and renders a QR code
3. User scans the QR code with Google Authenticator / Authy
4. User enters the 6-digit code to prove it's working
5. Backend verifies, then:
   - Saves the **encrypted** secret to the database
   - Generates **10 backup codes** (random 8-character strings)
   - Shows backup codes **once** (user must save them)
   - Sets `mfaEnabled = true`

### MFA Login Flow

1. User enters email + password (password verified)
2. Instead of full JWT, they receive a **temporary MFA token** (5-min JWT proving "password was correct")
3. Login page shows TOTP input form
4. User opens authenticator app, enters the 6-digit code
5. Backend verifies: `HMAC-SHA1(secret, time)` matches the code
6. Full JWT access + refresh tokens are issued
7. User is redirected to dashboard

### Backup Codes

If the user loses their phone, they can use one of their 10 backup codes instead of the TOTP code. Each backup code is single-use (removed after use). This prevents permanent account lockout.

### MFA Security Details

- **Secrets encrypted at rest**: AES-256-GCM using a key derived from AUTH_SECRET via PBKDF2
- **Window tolerance**: Accepts codes from t-1, t, t+1 (90-second window) to account for clock drift
- **Backup codes**: Stored as bcrypt hashes (not plaintext)
- **Rate limiting**: 3 failed MFA attempts triggers a 30-second cooldown

---

## Part 3: SCIM 2.0 (Automated User Provisioning)

### What SCIM Is

SCIM (System for Cross-domain Identity Management) is a REST API standard (RFC 7644) that lets identity providers automatically manage user accounts in applications. It automates the entire user lifecycle.

### The Problem Without SCIM

| Event | Without SCIM | With SCIM |
|-------|-------------|-----------|
| New hire | Admin manually creates user in Okta, BYOC, Slack, and 20+ other apps | Admin creates user in Okta; SCIM auto-provisions everywhere |
| Role change | Admin manually updates roles in each app | Okta updates group; SCIM auto-assigns correct roles |
| Termination | Admin manually disables in each app (easy to forget one) | Admin disables in Okta; SCIM instantly suspends everywhere |

### How SCIM Works

SCIM is a standardized REST API. The identity provider (Okta/Azure) makes HTTP calls to our endpoints:

**Create a user** (Okta calls BYOC):
```json
POST /api/scim/v2/Users
Authorization: Bearer scim_abc123...
{
  "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
  "userName": "john@exargen.com",
  "name": { "givenName": "John", "familyName": "Smith" },
  "emails": [{ "value": "john@exargen.com", "primary": true }],
  "active": true,
  "externalId": "okta-user-12345"
}
```

**Deactivate a user** (when John is terminated):
```json
PATCH /api/scim/v2/Users/{id}
Authorization: Bearer scim_abc123...
{
  "Operations": [{ "op": "replace", "path": "active", "value": false }]
}
```

Our backend maps SCIM operations to Prisma database operations.

### SCIM Field Mapping

| SCIM Field | BYOC User Field | Notes |
|------------|-----------------|-------|
| `userName` | `email` | Primary identifier |
| `name.givenName` + `familyName` | `name` | Combined into single field |
| `active` | `status` | `true` = active, `false` = suspended |
| `externalId` | `authProviderId` | IdP's unique user identifier |
| `phoneNumbers[0].value` | `phone` | Optional |
| `photos[0].value` | `avatarUrl` | Optional |

### SCIM Authentication

SCIM uses **Bearer tokens** (not JWT cookies):

1. Admin creates a SCIM token in BYOC Settings > Identity
2. BYOC shows the token **once** (same pattern as API keys)
3. Admin copies the token and pastes it into Okta/Azure SCIM configuration
4. All automated SCIM calls include `Authorization: Bearer scim_xxx...`
5. Token is hashed with bcrypt in our database (never stored in plaintext)
6. Tokens are tenant-scoped, expirable, and revocable

### Group-to-Role Mapping

SCIM Groups map to BYOC Roles:

| SCIM Operation | BYOC Result |
|----------------|-------------|
| Add user to "Security Analysts" group | Assign Security Analyst role |
| Remove user from group | Remove role assignment |
| Delete group membership | Cascading role removal |

---

## How All Three Work Together

Here's a complete enterprise scenario:

### Day 1: Admin Setup
1. IT admin configures **Azure AD SSO** in BYOC settings (enters Client ID/Secret from Azure Portal)
2. Admin creates a **SCIM token** in BYOC, configures it in Azure AD's provisioning settings

### Day 2: Automated Provisioning
3. Azure AD SCIM syncs all 50 Exargen security team members into BYOC automatically, with correct roles based on group membership

### Day 3: First Login
4. Security analyst Sarah opens BYOC, clicks **"Sign in with Azure AD"**
5. She authenticates with her Microsoft credentials (no BYOC password needed)
6. She enables **MFA** in BYOC settings (company policy requires it)

### Day 4: Ongoing Use
7. Sarah's daily login: Microsoft SSO authentication + TOTP code from authenticator app = secure access

### Month 3: Offboarding
8. Sarah leaves the company
9. IT admin disables her in Azure AD
10. **SCIM automatically suspends** her BYOC account within seconds
11. Sarah cannot access BYOC — no manual intervention needed

**The entire user lifecycle is automated. No manual password management, no invitation emails, no forgotten account deactivations.**

---

## Technical Implementation Summary

### New Database Models

| Model | Purpose | Key Fields |
|-------|---------|------------|
| `SSOProvider` | Per-tenant OAuth configuration | providerType, clientId (encrypted), clientSecret (encrypted), domains, defaultRoleId |
| `SCIMToken` | Bearer tokens for SCIM API auth | tokenHash (bcrypt), tokenPrefix, tenantId, expiresAt |

### New Capabilities (46 -> 50)

| Capability | Risk Level | Who Gets It |
|-----------|------------|-------------|
| `admin.sso.view` | Low | Platform Admin, Org Admin, Auditor |
| `admin.sso.manage` | Critical | Platform Admin, Org Admin |
| `admin.scim.view` | Low | Platform Admin, Org Admin, Auditor |
| `admin.scim.manage` | High | Platform Admin, Org Admin |

### New npm Packages

| Package | Purpose | Size |
|---------|---------|------|
| `otpauth` | TOTP generation/verification (RFC 6238) | ~15KB, no native deps |
| `qrcode` | QR code generation for authenticator apps | ~45KB |

### API Endpoints Added

| Category | Method | Endpoint | Purpose |
|----------|--------|----------|---------|
| **MFA** | POST | `/api/auth/mfa/setup` | Initiate MFA enrollment |
| **MFA** | POST | `/api/auth/mfa/confirm` | Confirm setup with first code |
| **MFA** | POST | `/api/auth/mfa/verify` | Verify TOTP during login |
| **MFA** | POST | `/api/auth/mfa/disable` | Disable MFA |
| **SSO** | GET | `/api/auth/sso/authorize` | Start OAuth flow |
| **SSO** | GET | `/api/auth/sso/callback` | Handle OAuth callback |
| **SSO** | GET | `/api/auth/sso/providers` | Public: list enabled providers |
| **SSO** | GET/POST | `/api/sso/providers` | Admin: CRUD SSO providers |
| **SSO** | PATCH/DELETE | `/api/sso/providers/[id]` | Admin: update/delete provider |
| **SCIM** | GET/POST | `/api/scim/v2/Users` | List/create users |
| **SCIM** | GET/PATCH/DELETE | `/api/scim/v2/Users/[id]` | Get/update/deactivate user |
| **SCIM** | GET | `/api/scim/v2/Groups` | List roles as groups |
| **SCIM** | GET/PATCH | `/api/scim/v2/Groups/[id]` | Get/update group members |
| **SCIM** | GET | `/api/scim/v2/ServiceProviderConfig` | SCIM discovery |
| **SCIM** | GET | `/api/scim/v2/Schemas` | Schema advertisement |
| **SCIM** | GET/POST | `/api/scim/tokens` | Token management |
| **SCIM** | DELETE | `/api/scim/tokens/[id]` | Revoke token |

---

## Security Considerations

### Encryption at Rest
- SSO client secrets: AES-256-GCM encrypted in database
- MFA TOTP secrets: AES-256-GCM encrypted in database
- Encryption key: Derived from AUTH_SECRET via PBKDF2 (never stored separately)

### OAuth Security
- **PKCE** (Proof Key for Code Exchange): Prevents authorization code interception
- **State parameter**: Random nonce prevents CSRF attacks on OAuth callback
- **Token validation**: ID tokens verified against provider's public keys
- **Domain allowlist**: Only emails from configured domains can SSO

### MFA Security
- **Backup codes**: bcrypt-hashed (not plaintext)
- **Rate limiting**: 3 failed MFA attempts = 30-second cooldown
- **Window tolerance**: +/- 1 time step (90 seconds total) for clock drift
- **Audit trail**: Every MFA event logged (enable, disable, verify, backup use)

### SCIM Security
- **Bearer tokens**: bcrypt-hashed in database (same as API keys)
- **Tenant isolation**: Each SCIM token scoped to exactly one tenant
- **IP allowlisting**: Optional per-token IP restrictions
- **Audit logging**: All SCIM provisioning operations logged

### Compliance Alignment
- **SOC 2 Type II**: CC6.1 (MFA), CC6.2 (SSO), CC6.3 (provisioning)
- **ISO 27001:2022**: A.8.5 (authentication), A.5.16 (identity management)
- **HIPAA**: 164.312(d) (MFA requirement), 164.312(a) (access control)
- **NIST CSF 2.0**: PR.AA-01 (identity management), PR.AA-03 (MFA)
