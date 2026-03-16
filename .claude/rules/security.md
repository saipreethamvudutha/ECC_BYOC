---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "src/app/api/**"
  - "src/lib/**"
---
# BYOC Security Rules

> These rules are MANDATORY for all BYOC code. This is a cybersecurity platform — our code must be exemplary.

## Mandatory Pre-Commit Security Checks

Before ANY commit:
- [ ] No hardcoded secrets (API keys, JWT secrets, DB passwords)
- [ ] All API routes have `getAuthenticatedUser()` check
- [ ] All mutations have `hasCapability()` RBAC check
- [ ] All DB queries include `tenantId` filter
- [ ] All mutations call `createAuditLog()`
- [ ] No SQL injection risks (use Prisma — never raw string SQL)
- [ ] Input validation on all API route bodies
- [ ] Error messages don't leak stack traces or internal details

## Tenant Isolation (CRITICAL)

```typescript
// ALWAYS: Include tenantId in every query
const data = await prisma.asset.findMany({
  where: { tenantId: user.tenantId }
})

// NEVER: Query without tenant isolation
const data = await prisma.asset.findMany() // SECURITY VIOLATION
```

## API Route Security Template

Every API route MUST follow this pattern:

```typescript
import { getAuthenticatedUser } from '@/lib/auth'
import { hasCapability } from '@/lib/rbac'
import { createAuditLog } from '@/lib/audit'

export async function METHOD(request: NextRequest) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const allowed = await hasCapability(user.id, 'capability.name', user.tenantId)
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // ...business logic with user.tenantId...
}
```

## Secret Management

```typescript
// NEVER: Hardcoded secrets
const secret = "abc123secretkey"

// ALWAYS: Environment variables with validation
const secret = process.env.JWT_SECRET
if (!secret) throw new Error('JWT_SECRET not configured')
```

## Input Validation

Validate all API inputs at the boundary. Use TypeScript types + runtime checks:

```typescript
const body = await request.json()
if (!body.name || typeof body.name !== 'string') {
  return NextResponse.json({ error: 'Invalid name' }, { status: 400 })
}
// Sanitize before use
const name = body.name.trim().slice(0, 255)
```

## Error Response Format

```typescript
// GOOD: Generic error message, no internals
return NextResponse.json({ error: 'Not found' }, { status: 404 })

// BAD: Leaks internal info
return NextResponse.json({ error: error.stack }, { status: 500 })
```

## Audit Logging (MANDATORY)

ALL state-changing operations must be audited:
```typescript
await createAuditLog({
  tenantId: user.tenantId,
  userId: user.id,
  action: 'resource.verb',      // e.g. 'scan.created', 'user.invited'
  resource: 'ModelName',
  resourceId: result.id,
  severity: 'info',             // info | low | medium | high | critical
  category: 'data',             // auth | rbac | data | admin | security | system
  details: { /* non-sensitive context */ }
})
```

## Security Response Protocol

If security issue found:
1. STOP immediately — do not commit
2. Invoke `security-reviewer` agent
3. Fix CRITICAL issues before continuing
4. Rotate any exposed secrets
5. Review codebase for similar patterns
