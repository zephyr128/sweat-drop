# Agent Communication Protocol

## Overview

This document defines how AI agents communicate with each other in the SWEATDROP monorepo. When one agent makes changes, other agents must be notified to maintain consistency.

---

## Communication Channels

### 1. Migration Notes (Supabase → Frontend Agents)

**When:** `supabase-dba` creates or modifies database schema

**Where:** Migration file comments + `MIGRATION_NOTES.md`

**Format:**
```sql
-- Migration: 20250127120000_add_feature.sql
-- 
-- AGENT NOTE: [Date] - supabase-dba
-- 
-- CHANGES:
-- - Added table: public.new_table
-- - Added column: public.existing_table.new_column (TEXT, nullable)
-- - Added RLS policy: "policy_name" on public.new_table
-- 
-- IMPACT ON FRONTEND:
-- - Mobile App: Update types from backend/types/database.types.ts
-- - Admin Panel: Update types from backend/types/database.types.ts
-- - New API endpoint needed: GET /api/new-table
-- 
-- BREAKING CHANGES:
-- - Column removed: public.old_table.removed_column
-- - Table renamed: public.old_name → public.new_name
-- 
-- NEXT STEPS:
-- 1. Run: supabase gen types typescript --local > backend/types/database.types.ts
-- 2. Mobile-coder: Update components using old_table.removed_column
-- 3. Admin-coder: Update admin panel to use new_table
```

### 2. Agent Notes in Code (Any Agent → Other Agents)

**When:** Agent makes changes that affect other workspaces

**Where:** Inline comments in code files

**Format:**
```typescript
// AGENT NOTE: [Date] - [agent-name]
// This change affects [mobile-app/admin-panel/backend]:
// - [What changed]
// - [Why it changed]
// - [What other agents need to do]
// Related files:
// - apps/mobile-app/lib/api.ts (needs update)
// - backend/supabase/functions/my-function/index.ts (needs update)
```

### 3. Changelog (All Agents → All Agents)

**When:** Any agent makes significant changes

**Where:** `CHANGELOG.md` in root directory

**Format:**
```markdown
## [YYYY-MM-DD] - [Agent Name]

### Added
- [What was added]

### Changed
- [What was changed]

### Fixed
- [What was fixed]

### Breaking Changes
- [Breaking changes that affect other agents]

### Migration Required
- [Steps other agents need to take]
```

### 4. Plan Updates (Architect → All Agents)

**When:** Plan changes or new dependencies discovered

**Where:** `docs/plans/*.md` files

**Format:**
```markdown
## Plan Updates

### [YYYY-MM-DD] - Update by Architect
- Step 1 completed by supabase-dba
- Step 2 in progress by mobile-coder
- Step 3 blocked: waiting for Step 1 completion
```

---

## Communication Workflows

### Workflow 1: Database Schema Change

**Step 1:** `supabase-dba` creates migration
- Adds AGENT NOTE in migration file
- Updates `MIGRATION_NOTES.md`
- Updates `CHANGELOG.md`

**Step 2:** `supabase-dba` generates types
- Runs: `supabase gen types typescript --local > backend/types/database.types.ts`
- Adds note in `MIGRATION_NOTES.md` that types are updated

**Step 3:** Frontend agents check for updates
- `mobile-coder` reads `MIGRATION_NOTES.md` before starting work
- `admin-coder` reads `MIGRATION_NOTES.md` before starting work
- Both update their code to use new types

### Workflow 2: API Contract Change

**Step 1:** `supabase-dba` modifies Edge Function
- Adds AGENT NOTE in function file
- Documents request/response format changes
- Updates `CHANGELOG.md`

**Step 2:** Frontend agents update clients
- `mobile-coder` updates API calls in mobile app
- `admin-coder` updates API calls in admin panel

### Workflow 3: Cross-Workspace Feature

**Step 1:** `architect` creates plan
- Breaks down into workspace-specific steps
- Defines dependencies between steps

**Step 2:** Agents execute in order
- Each agent completes their step
- Adds AGENT NOTE when step is complete
- Updates plan file with status

**Step 3:** Next agent reads plan
- Checks AGENT NOTES from previous steps
- Verifies dependencies are met
- Proceeds with their step

---

## Required Reading Before Work

### Before Starting Any Task

**All agents MUST:**
1. Read `CHANGELOG.md` (latest changes)
2. Read relevant section in `MIGRATION_NOTES.md` (if database work)
3. Read `STATE_OF_THE_APP.md` (current state)
4. Read plan file (if executing a plan)

### Specific Agent Requirements

**supabase-dba:**
- Read `MIGRATION_NOTES.md` (check for conflicts)
- Read `CHANGELOG.md` (see recent changes)
- Check if types need regeneration

**mobile-coder:**
- Read `MIGRATION_NOTES.md` (check for schema changes)
- Read `CHANGELOG.md` (see recent API changes)
- Check `backend/types/database.types.ts` (latest types)

**admin-coder:**
- Read `MIGRATION_NOTES.md` (check for schema changes)
- Read `CHANGELOG.md` (see recent API changes)
- Check `backend/types/database.types.ts` (latest types)

**architect:**
- Read `CHANGELOG.md` (understand recent changes)
- Read `MIGRATION_NOTES.md` (understand database state)
- Read `STATE_OF_THE_APP.md` (current focus)

**reviewer:**
- Read `CHANGELOG.md` (recent changes to review)
- Read `MIGRATION_NOTES.md` (database changes to verify)

---

## File Locations

### Communication Files

- `CHANGELOG.md` - Root directory (all changes)
- `MIGRATION_NOTES.md` - Root directory (database changes)
- `docs/plans/*.md` - Execution plans with status updates
- `AGENT_NOTES.md` - Root directory (cross-agent notes, optional)

### Agent Notes Locations

- Migration files: `backend/supabase/migrations/*.sql` (comments)
- Edge Functions: `backend/supabase/functions/*/index.ts` (comments)
- Mobile code: `apps/mobile-app/**/*.tsx` (comments)
- Admin code: `apps/admin-panel/**/*.tsx` (comments)

---

## Communication Templates

### Template 1: Migration Note

```markdown
## [YYYY-MM-DD] - Migration: [migration_name]

**Agent:** supabase-dba  
**Migration File:** `backend/supabase/migrations/YYYYMMDDHHMMSS_name.sql`

### Changes
- Added table: `public.table_name`
- Added column: `public.existing_table.column_name` (TYPE)
- Modified RLS policy: `policy_name`

### Impact
- **Mobile App:** Update types, add API calls
- **Admin Panel:** Update types, add UI components

### Breaking Changes
- [List any breaking changes]

### Next Steps
1. Run: `supabase gen types typescript --local`
2. Mobile-coder: Update components using [affected feature]
3. Admin-coder: Update admin panel for [affected feature]
```

### Template 2: Code Agent Note

```typescript
// AGENT NOTE: [YYYY-MM-DD] - [agent-name]
// 
// CHANGE: [What changed in this file]
// REASON: [Why it changed]
// 
// AFFECTS:
// - [workspace/file]: [What needs to be updated]
// 
// RELATED FILES:
// - apps/mobile-app/lib/api.ts
// - backend/supabase/functions/my-function/index.ts
// 
// NEXT AGENT: [agent-name] should [action]
```

### Template 3: Changelog Entry

```markdown
## [YYYY-MM-DD] - [Agent Name]

### Added
- Feature: [description]
- File: [path]

### Changed
- [What changed]

### Fixed
- [What was fixed]

### Migration Required
- [Steps for other agents]
```

---

## Best Practices

### DO

✅ Always add AGENT NOTE when making cross-workspace changes  
✅ Update CHANGELOG.md for significant changes  
✅ Update MIGRATION_NOTES.md for database changes  
✅ Read communication files before starting work  
✅ Use clear, specific language in notes  
✅ Include file paths and line numbers when relevant  
✅ Update plan files when steps are completed  

### DON'T

❌ Make changes without notifying other agents  
❌ Skip reading CHANGELOG.md or MIGRATION_NOTES.md  
❌ Use vague language in agent notes  
❌ Forget to update types after schema changes  
❌ Make breaking changes without documenting them  

---

## Example Scenarios

### Scenario 1: Database Column Added

**supabase-dba:**
1. Creates migration: `20250127120000_add_user_preferences.sql`
2. Adds AGENT NOTE in migration file
3. Updates `MIGRATION_NOTES.md`:
   ```markdown
   ## [2025-01-27] - Added user_preferences column
   - Table: `public.profiles`
   - Column: `preferences` (JSONB, nullable)
   - Impact: Mobile and Admin need to update forms
   ```
4. Updates `CHANGELOG.md`
5. Generates types: `supabase gen types typescript --local`

**mobile-coder:**
1. Reads `MIGRATION_NOTES.md`
2. Sees new `preferences` column
3. Updates user settings component to use new column
4. Adds AGENT NOTE in component file

**admin-coder:**
1. Reads `MIGRATION_NOTES.md`
2. Sees new `preferences` column
3. Updates admin panel to display/edit preferences
4. Adds AGENT NOTE in component file

### Scenario 2: API Endpoint Changed

**supabase-dba:**
1. Modifies Edge Function: `functions/reset-challenges/index.ts`
2. Changes request format (adds new parameter)
3. Adds AGENT NOTE:
   ```typescript
   // AGENT NOTE: [2025-01-27] - supabase-dba
   // 
   // CHANGE: Added 'gym_id' parameter to request body
   // REASON: Support multi-gym challenge resets
   // 
   // AFFECTS:
   // - apps/admin-panel: Update API call to include gym_id
   // 
   // BREAKING: Yes - old calls will fail without gym_id
   ```
4. Updates `CHANGELOG.md`

**admin-coder:**
1. Reads `CHANGELOG.md`
2. Sees API change
3. Updates API call to include `gym_id`
4. Tests the change

---

## Maintenance

### Weekly Review

- Review `CHANGELOG.md` for completeness
- Archive old `MIGRATION_NOTES.md` entries (keep last 30 days)
- Update `STATE_OF_THE_APP.md` with recent changes
- Clean up outdated agent notes in code

### When to Update

- **CHANGELOG.md:** After every significant change
- **MIGRATION_NOTES.md:** After every database migration
- **STATE_OF_THE_APP.md:** After completing major features
- **Plan files:** After each step is completed

---

**Last Updated:** 2025-01-27  
**Maintained By:** All Agents (collective responsibility)
