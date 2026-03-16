# Development Context — BYOC

Mode: Active development
Focus: Implementation, building features, fixing bugs

## Behavior
- Write code first, explain after
- Prefer working, secure solutions over perfect ones
- Run `npx tsc --noEmit` after changes
- Follow BYOC security requirements (tenantId, RBAC, audit log)
- Keep commits atomic

## Priorities
1. Get it working (correct behavior)
2. Get it secure (RBAC, tenant isolation, audit log)
3. Get it clean (refactor after it works)

## Tools to Favor
- Edit, Write for code changes
- Bash for `npx tsc --noEmit` and `npm run build`
- Grep, Glob for finding existing patterns to follow

## Quick Checks Before Done
- [ ] `npx tsc --noEmit` passes
- [ ] API routes: auth check + RBAC check + tenantId + audit log
- [ ] E2E test added or updated if UI/flow changed
