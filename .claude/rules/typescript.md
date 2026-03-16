---
paths:
  - "**/*.ts"
  - "**/*.tsx"
---
# TypeScript & Next.js Coding Standards for BYOC

## File Organization

- Files: 100–400 lines typical, **800 max** — extract modules if larger
- Functions: **50 lines max** — split if longer
- Organize by feature/domain, not by type
- High cohesion, low coupling

## TypeScript Patterns

### Always Use Proper Types
```typescript
// GOOD: Explicit return type
async function getUser(id: string): Promise<User | null> {}

// BAD: Implicit any
async function getUser(id) {} // implicit any
```

### Immutability (CRITICAL)
```typescript
// GOOD: Create new object
const updated = { ...existing, status: 'active' }

// BAD: Mutation
existing.status = 'active' // never mutate
```

### Null Safety
```typescript
// GOOD: Optional chaining + nullish coalescing
const name = user?.profile?.name ?? 'Unknown'

// BAD: Unsafe access
const name = user.profile.name // can throw
```

## Next.js API Routes

### Response Format
```typescript
// Success with data
return NextResponse.json({ data: result }, { status: 200 })

// Created
return NextResponse.json(result, { status: 201 })

// No content
return new NextResponse(null, { status: 204 })

// Error
return NextResponse.json({ error: 'Descriptive message' }, { status: 400 })
```

### Error Handling
```typescript
try {
  // business logic
} catch (error) {
  console.error('[route-name]:', error)
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}
```

## React / Next.js Component Patterns

### Client vs Server Components
- Default to Server Components unless you need interactivity
- Use `'use client'` only when needed (useState, useEffect, event handlers)
- Never use `useState`/`useEffect` in Server Components

### Hook Dependencies
```typescript
// GOOD: Complete deps
useEffect(() => {
  fetchData(userId)
}, [userId])

// BAD: Missing deps
useEffect(() => {
  fetchData(userId)
}, []) // stale closure
```

### List Keys
```typescript
// GOOD: Stable unique key
{items.map(item => <Item key={item.id} {...item} />)}

// BAD: Index as key (breaks on reorder)
{items.map((item, i) => <Item key={i} {...item} />)}
```

## Prisma Database Patterns

```typescript
// GOOD: Specific fields selected
const user = await prisma.user.findUnique({
  where: { id, tenantId },
  select: { id: true, name: true, email: true }
})

// BAD: Select all (over-fetches sensitive data)
const user = await prisma.user.findUnique({ where: { id } })
```

## Import Organization

```typescript
// 1. Node built-ins
import { readFile } from 'fs/promises'

// 2. External packages
import { NextRequest, NextResponse } from 'next/server'

// 3. Internal aliases (@/)
import { getAuthenticatedUser } from '@/lib/auth'
import { hasCapability } from '@/lib/rbac'

// 4. Relative imports
import { formatDate } from '../utils'
```

## Naming Conventions

- Files/folders: `kebab-case`
- Components: `PascalCase`
- Functions/variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Types/Interfaces: `PascalCase` (prefix Interface with `I` only if needed for disambiguation)
- API routes: follow Next.js conventions (`route.ts` in `app/api/...`)

## Code Quality Checklist

Before merging any code:
- [ ] No `console.log` debug statements
- [ ] No `TODO` without issue reference
- [ ] No unused imports or variables
- [ ] No magic numbers (use named constants)
- [ ] TypeScript strict mode passes (`npx tsc --noEmit`)
- [ ] Functions < 50 lines, files < 800 lines
- [ ] No deep nesting (> 4 levels) — use early returns
