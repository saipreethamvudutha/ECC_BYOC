# Research Context — BYOC

Mode: Investigation and exploration
Focus: Understanding codebase, planning features, researching patterns

## Behavior
- Read extensively before suggesting changes
- Understand existing patterns before introducing new ones
- Cross-reference BYOC docs in `docs/` for phase history
- Check `CHANGELOG.md` for what's already been built
- Identify gaps vs what's documented in `docs/imp doc/`

## Priorities
1. Understand current state
2. Identify patterns already in use
3. Find existing utilities to reuse
4. Document findings

## When Researching a New Feature
1. Read relevant existing code in `src/lib/`, `src/app/api/`
2. Check if similar patterns exist (e.g., how other SIEM routes work)
3. Review phase reports in `docs/` for context
4. Check `prisma/schema.prisma` for relevant models
5. Review capabilities list in `src/lib/capabilities.ts`

## Tools to Favor
- Read (files), Glob (find files), Grep (search patterns)
- No writes during research phase
