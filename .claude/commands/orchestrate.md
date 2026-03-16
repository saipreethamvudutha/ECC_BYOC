---
description: Sequential agent workflow for complex BYOC tasks. Chains specialized agents for features, bugfixes, refactors, and security audits.
---

# /orchestrate — BYOC Agent Workflow Orchestrator

Chains specialized agents sequentially for complex development tasks.

## Usage

`/orchestrate [workflow] [description]`

## Workflow Types

### `feature` — Full feature implementation
```
planner → tdd-guide → code-reviewer → security-reviewer
```
Use for: new API endpoints, new UI pages, new RBAC capabilities, SIEM rules, scanner modules

### `bugfix` — Bug investigation and fix
```
planner → code-reviewer → security-reviewer
```
Use for: production bugs, test failures, performance issues

### `refactor` — Safe refactoring
```
architect → code-reviewer → database-reviewer
```
Use for: schema changes, lib restructuring, performance optimization

### `security` — Security-focused audit
```
security-reviewer → code-reviewer → architect
```
Use for: new auth flows, RBAC changes, any code handling PII or secrets

### `phase` — Full new phase implementation (BYOC-specific)
```
planner → architect → tdd-guide → code-reviewer → security-reviewer
```
Use for: implementing a new major feature phase (e.g., Phase 13: Threat Intelligence)

## BYOC-Specific Reminders

For any workflow involving:
- **API routes** → security-reviewer MUST be the last agent
- **DB schema changes** → include database-reviewer
- **RBAC/auth changes** → security-reviewer with `scan.execute` capability verification
- **SIEM/SOAR** → planner must account for event normalization and detection rules

## Handoff Format

Between agents, create:
```markdown
## HANDOFF: [from-agent] → [to-agent]

### Context
[What was analyzed/built]

### BYOC-Specific Findings
[tenant isolation status, RBAC checks, audit log calls]

### Files Modified
[List of files]

### Security Status
[Any concerns for security-reviewer]

### Open Items
[What next agent should focus on]
```

## Examples

```
/orchestrate feature "Add threat intelligence feed ingestion endpoint"
/orchestrate security "Audit the SCIM provisioning endpoints"
/orchestrate refactor "Optimize SIEM alert dashboard query performance"
/orchestrate phase "Phase 13: Real-time WebSocket event streaming"
/orchestrate bugfix "Fix compliance assessment export returning wrong tenant data"
```

## Parallel Checks

For independent validations, run these agents simultaneously:
- `code-reviewer` (quality)
- `security-reviewer` (BYOC security requirements)
- `database-reviewer` (tenant isolation + query optimization)

## Final Report Format

```
ORCHESTRATION REPORT — BYOC
============================
Workflow: [type]
Task: [description]
Agents: [chain]

SUMMARY
-------
[One paragraph]

BYOC SECURITY STATUS
--------------------
[ ] All API routes authenticated
[ ] All queries include tenantId
[ ] All mutations have audit log
[ ] RBAC capabilities checked
[ ] No secrets in code

FILES CHANGED
-------------
[List]

TEST STATUS
-----------
[E2E tests needed / added]

RECOMMENDATION
--------------
[SHIP / NEEDS WORK / BLOCKED]
```
