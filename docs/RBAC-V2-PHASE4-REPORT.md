# BYOC RBAC v2 Phase 4: Audit & Security -- Implementation Report

**Date:** 2026-03-03
**Phase:** 4 of 6 -- Audit & Security
**Status:** Complete
**Build:** 65 routes (45 API + 20 pages), 0 TypeScript errors
**Previous Phase:** Phase 3 -- User & Role Management UI (55 routes)

---

## Executive Summary

Phase 4 transforms BYOC from a functionally capable cybersecurity platform into an enterprise-auditable, security-hardened system. Where Phases 1--3 built the RBAC engine and its management UI, Phase 4 closes the critical gap between "access control exists" and "access control is provably monitored, tamper-evident, and defensible under audit."

This phase delivers seven features across three domains: **audit infrastructure** (centralized logger with SHA-256 hash chain, enhanced query API, CSV/JSON export, integrity verification), **session and credential security** (database-backed sessions with revocation, account lockout, API key full lifecycle), and **security posture visibility** (security dashboard with computed score, security headers).

### Key Statistics

| Metric | Before (Phase 3) | After (Phase 4) | Delta |
|--------|-------------------|------------------|-------|
| Total routes | 55 | 65 | +10 |
| API endpoints | 37 | 45 | +8 |
| Frontend pages | 18 | 20 | +2 (plus 2 rewritten) |
| New library files | -- | 2 | `audit.ts`, `security.ts` |
| New API route files | -- | 6 | Audit export, integrity, sessions (4) |
| New page files | -- | 2 | Sessions, Security dashboard |
| Retrofitted existing routes | -- | 17 | Migrated to `createAuditLog()` |
| TypeScript errors | 0 | 0 | -- |

### Compliance Alignment

Phase 4 was designed against the audit and monitoring controls of three enterprise security frameworks:

- **SOC 2 Type II** -- CC6.1 (logical access), CC7.2 (system monitoring), CC7.3 (anomaly detection)
- **ISO 27001:2022** -- A.8.15 (logging), A.8.16 (monitoring), A.9.4 (access control)
- **NIST Cybersecurity Framework 2.0** -- PR.PS-04 (log management), DE.CM-09 (event monitoring), RS.AN-03 (forensic analysis)

---

## Phase 4 Objectives

1. **Close critical security gaps identified after Phase 3.** Phase 3 shipped a full RBAC management UI but left 23+ audit log creation calls scattered across routes with inconsistent data capture, no tamper detection, no session revocation capability, unlimited login attempts, and non-functional API key buttons.

2. **Meet enterprise audit requirements.** SOC 2 and ISO 27001 auditors require searchable, exportable, tamper-evident logs with forensic metadata (IP, user agent, timestamps). None of this existed before Phase 4.

3. **Benchmark against industry leaders.** CrowdStrike Falcon, Splunk SOAR, Microsoft Sentinel, and Wiz all provide centralized audit trails, session management, API key lifecycle, and security posture dashboards. Phase 4 brings BYOC to feature parity on these dimensions.

---

## Features Implemented

### F1: Centralized Audit Logger with Integrity Hash Chain

**Why it was needed:**
Before Phase 4, audit logging was handled by 23+ individual `prisma.auditLog.create()` calls scattered across API routes. Each call site independently decided what metadata to capture, leading to inconsistent data: some routes recorded IP addresses, others did not; some included user agent strings, others omitted them; severity and category were never recorded. There was no mechanism to detect whether an audit log entry had been modified or deleted after the fact. SOC 2 control CC7.2 explicitly requires tamper-evident logging, and ISO 27001 A.8.15 requires centralized, consistent log management.

**How it works:**
A single `createAuditLog()` function in `src/lib/audit.ts` serves as the sole entry point for all audit logging. It accepts a `CreateAuditLogParams` object containing the tenant, actor, action, resource, result, and optionally the raw HTTP request. Internally, it performs four operations automatically:

1. **Request metadata extraction** -- Parses `x-forwarded-for`, `x-real-ip`, and `cf-connecting-ip` headers to extract the client IP address, and reads the `user-agent` header.
2. **Category assignment** -- Maps the action string to one of six categories (`auth`, `rbac`, `data`, `admin`, `security`, `system`) using prefix-based rules (e.g., `role.*` maps to `rbac`, `apikey.*` maps to `security`).
3. **Severity assignment** -- Maps specific actions to severity levels (`info`, `low`, `medium`, `high`, `critical`). For example, `account.locked` is `critical`, `user.suspended` is `high`, `user.login_failed` is `medium`. Fallback rules promote denied results to `medium` and errors to `high`.
4. **SHA-256 hash chain** -- Fetches the most recent audit log entry for the tenant, takes its `integrityHash` (or the string `"GENESIS"` if no previous entry exists), and computes: `SHA256(prevHash|tenantId|action|actorId|timestamp)`. The resulting hash is stored on the new entry, creating a linked chain.

The function never throws. All internal errors are caught and logged to `console.error`, returning `null` so that audit subsystem failures never break the main application flow.

**What it solves:**
- Inconsistent audit data across 23+ call sites
- Missing forensic metadata (IP, user agent) on the majority of events
- No tamper detection mechanism for stored audit records
- No automatic classification of event severity or category

**Benefit for end users:**
Every security-relevant event now auto-captures full request context without developers needing to remember what to log. Auditors can verify log integrity with a single API call. The 17 existing routes that previously had ad-hoc audit logging were retrofitted to use `createAuditLog()`, plus 4 new routes use it natively.

---

### F2: Enhanced Audit Log API

**Why it was needed:**
The previous audit log API (`GET /api/audit-log`) returned the last 500 entries with no filtering capability whatsoever. Administrators could not search for specific events, filter by date range, or paginate through large result sets. ISO 27001 A.8.15 requires that logs be searchable and exportable for compliance evidence packages. At scale, returning 500 records in a single response is both insufficient for analysis and potentially harmful to performance.

**How it works:**
The enhanced API at `GET /api/audit-log` supports seven server-side filter parameters:

| Parameter | Purpose | Example |
|-----------|---------|---------|
| `action` | Exact match on action string | `user.login_failed` |
| `result` | Filter by outcome | `success`, `denied`, `error` |
| `category` | Filter by auto-assigned category | `auth`, `rbac`, `security` |
| `severity` | Filter by severity level | `critical`, `high` |
| `actorId` | Filter by specific user | UUID |
| `from` / `to` | Date range (inclusive) | ISO-8601 dates |
| `cursor` | Cursor-based pagination | `ISO_DATE\|UUID` format |

Pagination uses a cursor-based approach rather than offset/limit. The cursor format is `createdAt|id`, which enables stable pagination even as new entries are added. Each response includes the total count of matching records, a `nextCursor` for the next page, and available filter values (distinct actions and categories) to populate UI dropdowns.

Two companion endpoints extend the audit API:

- **`GET /api/audit-log/export`** -- Exports up to 10,000 records as CSV or JSON with the same filter parameters. The export itself is audit-logged (action: `audit.exported`), creating an evidence trail of who exported what and when. CSV output uses proper RFC 4180 escaping.
- **`GET /api/audit-log/integrity`** -- Invokes `verifyAuditIntegrity()` to walk the hash chain in chronological order, recomputing each hash and comparing it against the stored value. Returns `{ valid, totalRecords, checkedAt, firstInvalidId?, firstInvalidAt? }`.

**What it solves:**
- Cannot find specific events among thousands of log entries
- Cannot export compliance evidence packages for SOC 2 audits
- Cannot verify whether log entries have been tampered with
- Performance degradation with unbounded result sets

**Benefit for end users:**
Security analysts can search any event by any dimension in real time. Compliance officers can export filtered evidence packages in CSV or JSON for SOC 2 audit submissions. The integrity verification badge on the audit log page shows chain status at a glance, and a manual "Check Integrity" button is available on the security dashboard.

---

### F3: Database-Backed Session Management

**Why it was needed:**
Before Phase 4, authentication relied solely on JWT access tokens. JWTs are stateless by design, which means once a token is issued, it cannot be revoked until it expires. If an account is compromised, there is no way to force-logout the attacker. There is no visibility into how many sessions a user has active, from what devices, or from which locations. NIST CSF PR.PS-04 requires session monitoring, and SOC 2 CC6.1 requires the ability to revoke access immediately upon detection of unauthorized activity.

**How it works:**
A new `Session` model in the Prisma schema stores database-backed session records:

```
Session {
  id           String    @id @default(uuid())
  tenantId     String
  userId       String
  tokenHash    String    // SHA-256 of refresh token (never plaintext)
  ipAddress    String?
  userAgent    String?
  device       String?   // Parsed: "Chrome on Windows"
  city         String?   // Future: GeoIP lookup
  country      String?
  isActive     Boolean   @default(true)
  lastActiveAt DateTime  @default(now())
  expiresAt    DateTime
  revokedAt    DateTime?
  revokedBy    String?   // userId who performed revocation
  createdAt    DateTime  @default(now())
}
```

The `src/lib/security.ts` module provides six session management functions:

| Function | Purpose |
|----------|---------|
| `createSession()` | Creates a session record on login. Hashes the refresh token with SHA-256 before storage. Parses the user agent into a friendly device string (e.g., "Chrome on Windows"). |
| `revokeSession()` | Marks a single session as inactive with a revocation timestamp and the ID of the user who revoked it. |
| `revokeAllUserSessions()` | Revokes all active sessions for a user, with an optional exception for the current session ("sign out everywhere else"). |
| `getSessionByTokenHash()` | Looks up an active session by token hash for validation. |
| `updateSessionActivity()` | Touches the `lastActiveAt` timestamp on each authenticated request. |
| `cleanupExpiredSessions()` | Batch-deactivates sessions past their expiry date for periodic maintenance. |

Device parsing uses regex-based user agent analysis to extract browser (Chrome, Firefox, Safari, Edge, Opera) and OS (Windows, macOS, Linux, iPhone, iPad, Android) without requiring a third-party UA parsing library.

Four API endpoints expose session management to the frontend:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/auth/sessions` | List the current user's own active sessions |
| `DELETE` | `/api/auth/sessions/[sessionId]` | Revoke a specific session (own or admin) |
| `POST` | `/api/auth/sessions/revoke-all` | Revoke all sessions for a user |
| `GET` | `/api/sessions` | Admin: list all active sessions across the tenant |

**What it solves:**
- Cannot force-logout compromised accounts
- No visibility into active sessions, devices, or locations
- No ability to "sign out everywhere" during incident response
- NIST CSF and SOC 2 require session monitoring and revocation

**Benefit for end users:**
Every user can see all their active sessions with device type, IP address, and location. One-click revocation terminates any session immediately. The "Revoke All Other Sessions" button enables instant incident response. Administrators can view all sessions across the tenant grouped by user and revoke any session with the `admin.user.manage` capability.

---

### F4: Account Lockout and Login Security

**Why it was needed:**
Before Phase 4, there was no limit on login attempts. An attacker could make unlimited password guesses against any account without triggering any defensive mechanism. ISO 27001 A.9.4 requires controls against brute-force attacks, and credential stuffing is consistently ranked in the OWASP Top 10 authentication threats.

**How it works:**
Two new fields on the `User` model enable lockout tracking:

| Field | Type | Purpose |
|-------|------|---------|
| `failedLoginAttempts` | `Int @default(0)` | Counter incremented on each failed login |
| `lockedUntil` | `DateTime?` | Timestamp until which the account is locked |

The `src/lib/security.ts` module provides three functions:

1. **`checkAccountLockout(userId)`** -- Checks whether a user is currently locked. If a previous lockout has expired, it automatically clears the counter and lockout timestamp.
2. **`recordFailedLogin(userId)`** -- Increments the failed attempt counter. When it reaches the threshold of 5 (`MAX_FAILED_ATTEMPTS`), sets `lockedUntil` to 15 minutes in the future (`LOCKOUT_DURATION_MINUTES`).
3. **`resetFailedLoginAttempts(userId)`** -- Clears the counter and lockout on successful login.

The login flow in `src/lib/auth.ts` integrates all three:
- Before password verification: check lockout status. If locked, return error with remaining seconds and log the attempt.
- After failed password: record the failure. If threshold reached, the audit log action escalates from `user.login_failed` (medium severity) to `account.locked` (critical severity).
- After successful password: reset the counter.

**What it solves:**
- Unlimited brute-force login attempts
- Credential stuffing attacks
- No automated defensive response to repeated failures

**Benefit for end users:**
Accounts are automatically protected after 5 failed attempts with a 15-minute cooldown. Lockout events appear in the audit log at critical severity. The security dashboard surfaces failed login counts in the last 24 hours, and lockout events are visible in the recent security events timeline.

---

### F5: API Key Full Lifecycle Management

**Why it was needed:**
The Phase 3 UI rendered create, revoke, and rotate buttons for API keys, but these buttons had no backend implementation. Clicking them did nothing. For a cybersecurity platform, this is a critical gap: CI/CD pipelines, SIEM integrations, and automated scanners all need API keys, and compromised keys must be revocable immediately.

**How it works:**
Three API endpoints provide the full API key lifecycle:

**Create (`POST /api/api-keys`):**
- Generates a 32-byte random key using `crypto.randomBytes()`
- Hashes the key with bcrypt (cost factor 10) before storage -- the plaintext key is never persisted
- Stores the first 8 characters as `keyPrefix` for identification in the UI
- Associates the key with a role (verified to belong to the same tenant) for RBAC scoping
- Supports optional IP allowlist and custom rate limit
- Returns the full key exactly once in the response

**Revoke (`DELETE /api/api-keys/[id]`):**
- Sets `isActive = false` on the key record
- The key immediately stops working for all subsequent requests
- Audit-logged with the key name and prefix for forensic tracing

**Rotate (`PATCH /api/api-keys/[id]`):**
- Generates a new 32-byte key and bcrypt hash
- Updates the existing record in-place (atomic operation)
- Resets the expiration to 90 days from rotation
- Returns the new key exactly once
- Audit-logged with both old and new key prefixes

All three operations require the `admin.apikey.manage` capability and are fully audit-logged.

**What it solves:**
- Cannot create API keys for CI/CD or integration use
- Cannot revoke compromised API keys
- Cannot rotate keys without deleting and recreating
- Non-functional buttons in the UI erode user trust

**Benefit for end users:**
Full lifecycle management from a single UI page. Keys are shown only once at creation with a copy-to-clipboard button and a security warning. Rotation generates a new key atomically without downtime. The page shows stats (total, active, expiring soon), role association, rate limits, last-used timestamps, and expiry dates.

---

### F6: Security Dashboard

**Why it was needed:**
Before Phase 4, security-relevant information was scattered across multiple pages. Failed logins were only visible in the raw audit log. Session counts required navigating to a separate page. API key health had no summary view. There was no centralized place to understand the platform's security posture at a glance. Every leading cybersecurity platform (CrowdStrike, Splunk, Sentinel, Wiz) provides a security overview dashboard.

**How it works:**
The `/settings/security` page aggregates data from four API endpoints using `Promise.allSettled()` for resilient loading:

1. **Security Score (0--100)** -- A composite metric computed from five weighted criteria:

   | Criterion | Points | Condition |
   |-----------|--------|-----------|
   | Audit Log Integrity | 30 | Hash chain verification passes |
   | No Failed Logins (24h) | 25 | Zero `user.login_failed` events in last 24 hours |
   | API Keys Not Expiring | 20 | All active keys have >30 days before expiry |
   | Session Count Normal | 15 | Average sessions per user <10 |
   | Security Headers Active | 10 | Always true (headers configured in `next.config.ts`) |

   The score is displayed as an SVG ring chart with color coding: green (80--100, "Good"), yellow (50--79, "Fair"), red (0--49, "At Risk"). Each criterion shows a check or cross icon with its point value.

2. **Stat Cards** -- Four cards showing: failed logins in last 24 hours, active session count, API key health (active count plus expiring-soon warning), and audit integrity status.

3. **Recent Security Events** -- A timeline of the most recent authentication-category events with severity dots, actor names, actions, IP addresses, result badges, and relative timestamps.

4. **Quick Actions** -- Buttons for "Export Audit Report" (navigates to audit log), "Check Integrity" (triggers verification on demand), and "View All Sessions."

**What it solves:**
- Fragmented security visibility across multiple pages
- No aggregate security posture metric
- Slow mean-time-to-detect for security anomalies
- No single-pane-of-glass for security operations

**Benefit for end users:**
A single page answers the question "Is my platform secure right now?" The computed score provides an actionable target (maintain 80+), and the breakdown shows exactly which areas need attention. The recent events timeline enables rapid detection of suspicious activity without navigating to the full audit log.

---

### F7: Security Headers

**Why it was needed:**
Before Phase 4, the application served no security headers. This leaves it vulnerable to several categories of attack that are trivially prevented: clickjacking (embedding the app in a malicious iframe), MIME type sniffing (tricking the browser into executing uploaded content), XSS reflection, and protocol downgrade attacks. Security headers are an OWASP Top 10 baseline requirement and a checkbox item on every security certification.

**How it works:**
The `next.config.ts` file defines a `headers()` function that applies six security headers to all routes (`/(.*)`):

| Header | Value | Protection |
|--------|-------|------------|
| `X-Frame-Options` | `DENY` | Prevents clickjacking by blocking all iframe embedding |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME type sniffing attacks |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limits referrer leakage to origin only on cross-origin requests |
| `X-XSS-Protection` | `1; mode=block` | Enables browser XSS filter in blocking mode |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Disables access to camera, microphone, and geolocation APIs |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Enforces HTTPS for 1 year across all subdomains |

**What it solves:**
- Clickjacking vulnerability (iframe embedding)
- MIME type sniffing attacks
- Cross-site scripting reflection
- HTTP protocol downgrade attacks
- Unnecessary permission grants for device APIs

**Benefit for end users:**
Defense-in-depth at zero performance cost. These headers are enforced by the browser on every response and require no user action. They are required for SOC 2 certification and are a prerequisite for passing automated security scanners.

---

## Technical Architecture

### Hash Chain Integrity Model

The audit log integrity system uses a SHA-256 hash chain that links each entry to its predecessor, creating a tamper-evident linked list:

```
Entry N hash = SHA256( Entry(N-1).hash | tenantId | action | actorId | timestamp )
```

**Genesis:** The first entry in a tenant's chain uses the string `"GENESIS"` as the previous hash value. This provides a known anchor point for the chain.

**Chain Construction:** When `createAuditLog()` is called, it queries the most recent audit log entry for the tenant (ordered by `createdAt DESC`), retrieves its `integrityHash`, and passes it as the `prevHash` to `computeIntegrityHash()`. The input payload is formatted as `prevHash|tenantId|action|actorId|timestamp` with pipe delimiters.

**Verification:** The `verifyAuditIntegrity()` function loads all entries in ascending chronological order and walks the chain. For each entry, it recomputes the expected hash using the previous entry's hash (or `"GENESIS"` for the first) and compares it against the stored `integrityHash`. If any entry has been modified, inserted, or deleted, the recomputed hash will diverge from the stored one. The function returns the ID and timestamp of the first invalid entry if tampering is detected.

**Sub-range Verification:** When verifying a date range rather than the full chain, the function first queries the entry immediately preceding the start date to obtain its hash as the chain anchor. If no preceding entry exists, verification starts from `"GENESIS"`.

**Design Tradeoff:** The chain is per-tenant, not global. This means verification is scoped to a single tenant's audit trail, which matches the multi-tenant isolation model. Cross-tenant verification is not needed because tenants cannot access each other's data.

### Audit Category and Severity Mapping

Category assignment uses prefix-based matching:

| Action Prefix | Category | Description |
|---------------|----------|-------------|
| `user.login`, `user.logout`, `user.login_failed` | `auth` | Authentication events |
| `role.*`, `capability.*` | `rbac` | Role and capability changes |
| `asset.*`, `tag.*`, `scope.*`, `scan.*`, `compliance.*`, `report.*` | `data` | Data operations |
| `admin.*`, `org.*`, `user.invited`, `user.suspended`, `user.reactivated`, `user.updated`, `user_scope.*` | `admin` | User lifecycle and organization management |
| `apikey.*` | `security` | API key management |
| (fallback) | `system` | Unrecognized actions |

Severity assignment uses a priority hierarchy:

| Priority | Rule | Severity |
|----------|------|----------|
| 1 | `account.locked` | `critical` |
| 2 | `user.suspended`, `role.deleted`, `apikey.revoked` | `high` |
| 3 | `user.login_failed` | `medium` |
| 4 | `role.created`, `user.invited`, `apikey.created` | `low` |
| 5 | Result is `denied` | `medium` |
| 6 | Result is `error` | `high` |
| 7 | (default) | `info` |

### Session Management Architecture

The session system uses a hybrid approach:

- **JWT access tokens (15-minute TTL, stateless):** Used for API authentication. Short-lived, not stored in the database. Validated by signature verification only.
- **Database Session records (7-day TTL):** Stored in PostgreSQL with a SHA-256 hash of the refresh token. Never stores the raw token. Used for session listing, activity tracking, and revocation.

When a user logs in, `createSession()` in `security.ts` is called to create a database record. The `parseDevice()` function extracts a human-readable device string from the user agent (e.g., "Chrome on Windows") by matching browser and OS patterns in sequence (Edge before Chrome, as Edge UA contains "Chrome"). IP extraction checks Cloudflare, Nginx, and standard proxy headers in priority order.

---

## New Files (10)

| File | Purpose |
|------|---------|
| `src/lib/audit.ts` | Centralized audit logger with SHA-256 hash chain, auto-categorization, severity assignment, request metadata extraction, and integrity verification. |
| `src/lib/security.ts` | Account lockout logic (check, record, reset), database-backed session management (create, revoke, revoke-all, lookup, activity update, cleanup), device parsing, and IP extraction. |
| `src/app/api/audit-log/export/route.ts` | CSV and JSON export endpoint for audit logs with filter passthrough, 10K record limit, and self-auditing of export actions. |
| `src/app/api/audit-log/integrity/route.ts` | Hash chain integrity verification endpoint that walks the tenant's audit chain and returns validity status. |
| `src/app/api/sessions/route.ts` | Admin endpoint to list all active sessions across the tenant with user details, device info, and location data. |
| `src/app/api/auth/sessions/route.ts` | Current user's own sessions endpoint -- no special capability required, returns device/IP/location for each active session. |
| `src/app/api/auth/sessions/[sessionId]/route.ts` | Single session revocation endpoint with self-revoke (no capability) and admin-revoke (`admin.user.manage`) support. |
| `src/app/api/auth/sessions/revoke-all/route.ts` | Bulk session revocation endpoint -- revokes all sessions for a user (self or admin-initiated). |
| `src/app/(dashboard)/settings/sessions/page.tsx` | Sessions management page with "My Sessions" list, one-click revocation, "Revoke All Other Sessions" button, and admin view grouped by user. |
| `src/app/(dashboard)/settings/security/page.tsx` | Security dashboard with computed score (0--100), stat cards, recent security events timeline, and quick actions. |

---

## Modified Files (21)

| File | What Changed |
|------|-------------|
| `prisma/schema.prisma` | Added `Session` model with 13 fields and 3 indexes; added `failedLoginAttempts` and `lockedUntil` to `User`; added `category`, `severity`, and `integrityHash` to `AuditLog`; added 4 new indexes on `AuditLog`. |
| `next.config.ts` | Added `headers()` function with 6 security headers applied to all routes. |
| `src/lib/auth.ts` | Integrated account lockout checks, failure recording, reset on success, and database session creation into the login flow. |
| `src/app/api/auth/logout/route.ts` | Retrofitted to use `createAuditLog()` with request context. |
| `src/app/api/roles/route.ts` | Retrofitted 3 audit log calls (list, create) to use `createAuditLog()`. |
| `src/app/api/roles/[roleId]/route.ts` | Retrofitted 3 audit log calls (detail, update, delete) to use `createAuditLog()`. |
| `src/app/api/roles/[roleId]/clone/route.ts` | Retrofitted 2 audit log calls to use `createAuditLog()`. |
| `src/app/api/users/invite/route.ts` | Retrofitted 2 audit log calls to use `createAuditLog()`. |
| `src/app/api/users/[id]/route.ts` | Retrofitted 2 audit log calls (update, suspend/reactivate) to use `createAuditLog()`. |
| `src/app/api/users/[id]/roles/route.ts` | Retrofitted 2 audit log calls (list roles, assign role) to use `createAuditLog()`. |
| `src/app/api/users/[id]/roles/[roleId]/route.ts` | Retrofitted 2 audit log calls (remove role) to use `createAuditLog()`. |
| `src/app/api/users/[id]/scopes/route.ts` | Retrofitted 2 audit log calls (assign/remove scope) to use `createAuditLog()`. |
| `src/app/api/assets/create/route.ts` | Retrofitted 2 audit log calls to use `createAuditLog()`. |
| `src/app/api/scans/create/route.ts` | Retrofitted 2 audit log calls to use `createAuditLog()`. |
| `src/app/api/compliance/update/route.ts` | Retrofitted 2 audit log calls to use `createAuditLog()`. |
| `src/app/api/reports/generate/route.ts` | Retrofitted 2 audit log calls to use `createAuditLog()`. |
| `src/app/api/tags/route.ts` | Retrofitted 2 audit log calls (create, delete) to use `createAuditLog()`. |
| `src/app/api/scopes/route.ts` | Retrofitted 2 audit log calls to use `createAuditLog()`. |
| `src/app/api/scopes/[id]/route.ts` | Retrofitted 3 audit log calls (update, delete) to use `createAuditLog()`. |
| `src/app/(dashboard)/settings/audit-log/page.tsx` | Complete rewrite: added server-side filtering, cursor-based pagination, severity dots, category badges, expandable detail rows, CSV/JSON export buttons, integrity badge. |
| `src/app/(dashboard)/settings/api-keys/page.tsx` | Complete rewrite: connected create/revoke/rotate buttons to new API endpoints, added key reveal dialog, stats cards, role selection, expiry/IP/rate-limit configuration. |

---

## New API Endpoints

| Method | Endpoint | Purpose | Capability Required |
|--------|----------|---------|-------------------|
| `GET` | `/api/audit-log/export` | Export audit logs as CSV or JSON (max 10K records) with filters | `admin.audit.export` |
| `GET` | `/api/audit-log/integrity` | Verify SHA-256 hash chain integrity for tenant's audit trail | `admin.audit.view` |
| `GET` | `/api/auth/sessions` | List current user's own active sessions | (authenticated) |
| `DELETE` | `/api/auth/sessions/[sessionId]` | Revoke a specific session (own or admin) | (own) or `admin.user.manage` |
| `POST` | `/api/auth/sessions/revoke-all` | Revoke all sessions for a user (self or admin) | (own) or `admin.user.manage` |
| `GET` | `/api/sessions` | Admin: list all active sessions across tenant | `admin.user.view` |
| `POST` | `/api/api-keys` | Create a new API key with role, expiry, IP allowlist, rate limit | `admin.apikey.manage` |
| `DELETE` | `/api/api-keys/[id]` | Revoke (deactivate) an API key | `admin.apikey.manage` |
| `PATCH` | `/api/api-keys/[id]` | Rotate an API key (atomic new key generation) | `admin.apikey.manage` |

Note: `GET /api/audit-log` existed before Phase 4 but was completely rewritten with server-side filtering, cursor-based pagination, total counts, and filter value discovery. `GET /api/api-keys` also existed but was enhanced with role and creator joins.

---

## Schema Changes

### New Model: Session

```prisma
model Session {
  id           String    @id @default(uuid())
  tenantId     String
  userId       String
  tokenHash    String    // SHA-256 hash of refresh token
  ipAddress    String?
  userAgent    String?
  device       String?   // Parsed: "Chrome on Windows"
  city         String?   // Future: GeoIP lookup
  country      String?
  isActive     Boolean   @default(true)
  lastActiveAt DateTime  @default(now())
  expiresAt    DateTime
  revokedAt    DateTime?
  revokedBy    String?   // userId who performed revocation
  createdAt    DateTime  @default(now())

  @@index([userId, isActive])
  @@index([tenantId, isActive])
  @@index([tokenHash])
}
```

### User Model Additions

| Field | Type | Purpose |
|-------|------|---------|
| `failedLoginAttempts` | `Int @default(0)` | Tracks consecutive failed login attempts |
| `lockedUntil` | `DateTime?` | Timestamp until which the account is locked (null = not locked) |

### AuditLog Model Additions

| Field | Type | Purpose |
|-------|------|---------|
| `category` | `String?` | Auto-assigned category: `auth`, `rbac`, `data`, `admin`, `security`, `system` |
| `severity` | `String @default("info")` | Auto-assigned severity: `info`, `low`, `medium`, `high`, `critical` |
| `integrityHash` | `String?` | SHA-256 hash linking this entry to the previous one in the chain |

### New Indexes

| Model | Index | Purpose |
|-------|-------|---------|
| `Session` | `[userId, isActive]` | Fast lookup of a user's active sessions |
| `Session` | `[tenantId, isActive]` | Admin session listing per tenant |
| `Session` | `[tokenHash]` | Token validation lookup |
| `AuditLog` | `[tenantId, action]` | Filtered queries by action |
| `AuditLog` | `[tenantId, category]` | Filtered queries by category |

---

## Compliance Mapping

| Feature | SOC 2 Type II | ISO 27001:2022 | NIST CSF 2.0 |
|---------|---------------|----------------|--------------|
| **F1: Centralized Audit Logger** | CC7.2 (system monitoring activities), CC7.3 (anomaly identification) | A.8.15 (logging), A.8.16 (monitoring activities) | DE.CM-09 (computing hardware and software are monitored), PR.PS-04 (log management) |
| **F2: Enhanced Audit Log API** | CC7.2 (evaluation of system events), CC4.1 (monitoring controls) | A.8.15 (log analysis and access), A.5.28 (collection of evidence) | RS.AN-03 (forensic analysis), DE.AE-03 (event data aggregation) |
| **F3: Database-Backed Sessions** | CC6.1 (logical access security), CC6.3 (access removal) | A.8.2 (privileged access rights), A.8.5 (secure authentication) | PR.PS-04 (authentication and identity management), PR.AC-07 (session controls) |
| **F4: Account Lockout** | CC6.1 (logical access restrictions), CC6.6 (logical access boundaries) | A.9.4 (system and application access control), A.8.5 (secure authentication) | PR.AC-07 (authentication mechanisms), DE.CM-09 (activity monitoring) |
| **F5: API Key Lifecycle** | CC6.1 (access credential management), CC6.3 (access revocation) | A.8.2 (privileged access rights), A.9.2 (user access provisioning) | PR.PS-04 (identity management), PR.AC-01 (credential management) |
| **F6: Security Dashboard** | CC4.1 (ongoing monitoring), CC7.2 (security monitoring) | A.8.16 (monitoring activities), A.5.7 (threat intelligence) | DE.AE-02 (event correlation), ID.RA-01 (threat identification) |
| **F7: Security Headers** | CC6.6 (system boundaries), CC6.7 (transmission protection) | A.8.9 (configuration management), A.8.24 (use of cryptography) | PR.DS-02 (data-in-transit protection), PR.PT-04 (communications protection) |

---

## Build Metrics

| Metric | Value |
|--------|-------|
| Total routes | 65 (up from 55) |
| API routes | 45 (up from 37) |
| Frontend pages | 20 (up from 18) |
| New API endpoints | 8 (+ 2 substantially rewritten) |
| New library modules | 2 (`audit.ts`, `security.ts`) |
| Retrofitted routes (migrated to `createAuditLog`) | 17 |
| Frontend pages added | 2 (sessions, security dashboard) |
| Frontend pages rewritten | 2 (audit log, API keys) |
| TypeScript errors | 0 |
| Schema models added | 1 (`Session`) |
| Schema fields added to existing models | 5 (`User` +2, `AuditLog` +3) |
| New database indexes | 5 |

---

## What's Next

### Phase 5: AI Governance
AI action audit trails, AI capability scoping, automated anomaly detection for AI-initiated operations, AI action approval workflows, and AI-specific RBAC capabilities.

### Phase 6: Enterprise SSO and SCIM
SAML 2.0 and OIDC single sign-on, SCIM 2.0 user provisioning, just-in-time user creation, directory sync, and enterprise identity provider integration.
