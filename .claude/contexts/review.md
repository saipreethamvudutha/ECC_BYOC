# Review Context — BYOC

Mode: Code review and security audit
Focus: Quality, security, correctness

## Behavior
- Read code thoroughly before commenting
- Check BYOC-specific security requirements:
  - Every API route authenticated?
  - Every mutation has RBAC capability check?
  - Every DB query includes tenantId?
  - Every mutation has audit log call?
- Flag CRITICAL issues immediately
- Provide concrete fix examples

## Review Priorities
1. Security (tenant isolation, RBAC, secrets)
2. Correctness (logic bugs, edge cases)
3. Performance (N+1 queries, missing pagination)
4. Code quality (file size, nesting, naming)

## BYOC Security Checklist
- [ ] `getAuthenticatedUser()` called
- [ ] `hasCapability()` called with correct capability
- [ ] All queries have `where: { tenantId: user.tenantId }`
- [ ] `createAuditLog()` called for mutations
- [ ] No hardcoded secrets
- [ ] Error responses don't leak internals

## Tools to Favor
- Read, Grep, Glob for analysis
- Bash for `npm audit`, `npx tsc --noEmit`
