---
description: Fix TypeScript and Next.js build errors in BYOC. Minimal changes only — gets the build green without refactoring.
---

# /build-fix — BYOC Build Error Resolver

Invokes the `build-error-resolver` agent to fix build and TypeScript errors with minimal diffs.

## Usage

`/build-fix`

Run this when `npm run build` or `npx tsc --noEmit` fails.

## BYOC Build Commands

```bash
# Check TypeScript errors only (fast)
npx tsc --noEmit --pretty

# Full build (includes prisma generate)
npm run build

# Auto-fix ESLint issues
npx eslint src/ --fix

# Clear Next.js cache (nuclear option)
rm -rf .next && npm run build
```

## Common BYOC-Specific Build Issues

| Error | Likely Cause | Fix |
|-------|-------------|-----|
| `Type 'Prisma.X' not assignable` | Prisma types mismatch after schema change | Run `npm run db:generate` first |
| `Cannot find module '@/lib/...'` | New lib file not created yet | Create the missing file |
| `Property does not exist on type 'User'` | Prisma schema changed but types not regenerated | `npx prisma generate` |
| `'use client' cannot be used with Server Components` | Mixed client/server boundary | Move useState/useEffect to client component |
| Module resolution errors | Wrong import path | Check `@/` alias maps to `src/` |

## BYOC-Specific Prisma Types

After any schema change, always regenerate:
```bash
npx prisma generate
```

Common Prisma type patterns in BYOC:
```typescript
import { Prisma } from '@prisma/client'

// For include results
type ScanWithResults = Prisma.ScanGetPayload<{
  include: { results: true }
}>

// For select results
type UserSummary = Prisma.UserGetPayload<{
  select: { id: true; name: true; email: true }
}>
```

## Guardrails

The build-error-resolver will STOP and ask if:
- Fix requires architectural changes
- Same error persists after 3 attempts
- Missing environment variables (check `.env.local`)
- Database schema out of sync (run `npm run db:push`)

## Success Criteria

- `npx tsc --noEmit` exits 0
- `npm run build` completes
- No new errors introduced
- E2E tests still pass: `npx playwright test`
