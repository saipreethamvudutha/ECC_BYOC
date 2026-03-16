---
description: Run a comprehensive BYOC security audit. Checks RBAC, tenant isolation, audit logging, secrets, and OWASP Top 10 across the entire codebase.
---

# /security-audit — BYOC Security Audit Command

Invokes the `security-reviewer` agent for a comprehensive security audit of the BYOC codebase.

## Usage

`/security-audit [scope]`

Scope options:
- `full` — Entire codebase audit
- `api` — All API routes
- `auth` — Authentication & RBAC flows
- `siem` — SIEM event ingestion and processing
- `scanner` — Vulnerability scanner engine
- `new` — Only recently changed files (git diff)

## BYOC Security Checklist

### Critical (Must Pass)
- [ ] Every API route calls `getAuthenticatedUser()`
- [ ] Every mutation calls `hasCapability()`
- [ ] Every DB query includes `tenantId`
- [ ] Every mutation calls `createAuditLog()`
- [ ] No hardcoded secrets (JWT_SECRET, DB passwords, API keys)
- [ ] No raw SQL with string concatenation
- [ ] CSRF protection active on all state-changing API routes

### High (Should Pass)
- [ ] Rate limiting on auth endpoints
- [ ] Account lockout implemented
- [ ] MFA bypass protection
- [ ] SCIM token validation
- [ ] Session management (expiry, revocation)
- [ ] API key rotation and hashing

### Medium
- [ ] Audit log integrity hash chain valid
- [ ] Error messages don't leak stack traces
- [ ] Sensitive fields excluded from API responses (passwordHash, mfaSecret)
- [ ] Input validation on all API boundaries

## Security Scan Commands

```bash
# Check for hardcoded secrets
grep -r "secret\|password\|token\|key" src/ --include="*.ts" | grep -v "env\." | grep -v "process\." | grep -v "//\|/*"

# Audit npm dependencies for vulnerabilities
npm audit --audit-level=high

# TypeScript strict check
npx tsc --noEmit --strict
```

## Report Format

```
BYOC SECURITY AUDIT REPORT
===========================
Date: [date]
Scope: [scope]
Auditor: security-reviewer agent

CRITICAL FINDINGS
-----------------
[List — must be fixed before merge]

HIGH FINDINGS
-------------
[List — should be fixed this sprint]

MEDIUM FINDINGS
---------------
[List — add to backlog]

BYOC-SPECIFIC CHECKS
--------------------
Tenant isolation: PASS/FAIL
RBAC coverage: X/Y routes checked
Audit log coverage: X/Y mutations audited
Secrets in code: PASS/FAIL

RECOMMENDATION
--------------
[PASS / FAIL / NEEDS REVIEW]
```
