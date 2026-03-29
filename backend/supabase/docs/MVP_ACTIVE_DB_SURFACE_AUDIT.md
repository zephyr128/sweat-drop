# MVP Active Database Surface Audit (Pilot / Vortex)

**Date:** 2026-03-27  
**Owner:** supabase-dba  
**Scope:** Inventory for `docs/plans/master_production_vortex_90d_execution_plan.md` workstream **D1** (schema cleanup strategy) and **C1** (environment split).  
**Rule:** This document lists **keep**, **deprecate_post_pilot**, and **remove_before_launch candidates** only. **No objects are dropped** by this artifact.

---

## Environment split (C1)

- **Keep (operational):** Two separate Supabase **projects** (`sweatdrop-dev`, `sweatdrop-prod`) with the **same migration history** applied per project. No additional database table is required for dev/prod isolation.
- **Deprecate:** N/A (not a schema concern).
- **Remove candidate:** N/A.

Verification is application and CI: different `SUPABASE_URL` / anon keys per build (see `docs/plans/production_env_split_dev_prod_runbook.md`).

---

## Multi-gym architecture

- **Keep:** `gyms`, `gym_memberships`, `gym_members`, tenant-scoped RLS, `gym_id` on drops/sessions/rewards/redemptions, admin RBAC on `profiles.role` / `admin_gym_id`.
- **Pilot listing:** `gyms.is_pilot_enabled` + `get_public_gyms_for_mobile(p_pilot_only)` (migration `20260311130000_add_pilot_gym_visibility_flag.sql`). Non–pilot gyms remain in the database but can be hidden from the mobile list when pilot mode is on.

---

## Keep now (core pilot surface)

### Identity & access

| Object | Role |
|--------|------|
| `auth.users` | Supabase Auth source of truth |
| `public.profiles` | App profile, roles, home gym, drops aggregates, push token, onboarding, **email_verified_at**, legal ack columns (post–`20260327140000`) |
| `public.staff_invitations` | Staff onboarding + email delivery columns |
| `public.gym_staff` / staff role assignments | Desk and admin access |

### Gym operations

| Object | Role |
|--------|------|
| `public.gyms` | Tenant config, branding, `smartcoach_enabled`, `is_pilot_enabled`, check-in settings |
| `public.machines` | QR / BLE pairing, live status |
| `public.sessions` | Workouts, drop awards, anti-abuse signals |
| `public.gym_checkins` | Check-in drops and limits |
| `public.tokenomics_config` | Caps, verification mode, economy flags |
| `public.drop_model_config` | Drop calculator config (v2 path) |

### Economy & redemption

| Object | Role |
|--------|------|
| `public.drops_transactions` | Ledger |
| `public.gym_memberships` | Per-gym wallet (`local_drops_balance`) |
| `public.rewards` | Store catalog |
| `public.redemptions` | Desk fulfillment |
| `public.claim_reward` / `award_drops` / related RPCs | Server-side truth for earn/redeem |

### Challenges & leaderboards

| Object | Role |
|--------|------|
| `public.gym_challenges`, `public.challenge_progress` | Gym challenges |
| `public.user_badges`, `public.global_achievements` | Badges / trophy |
| `get_leaderboard` and wrappers | Rankings |

### Pilot-era ops (already migrated)

| Object | Role |
|--------|------|
| `public.gym_member_identities` | Desk identity verification |
| `public.engagement_campaigns` (+ targets, deliveries) | Campaign pushes |
| `public.gym_drop_boost_rules` | Happy hour / boosts |
| `public.happy_hour_reminder_logs` | Reminder dedupe |
| `public.fraud_events` | Abuse signals |

### Reporting / admin efficiency

| Object | Role |
|--------|------|
| `get_gym_dashboard_overview`, `get_gym_activity_log` | Admin dashboard |
| `admin_list_*` RPCs | Paginated admin lists |

---

## Deprecate_post_pilot (keep in DB; reduce product dependency)

| Area | Objects / pattern | Notes |
|------|-------------------|--------|
| SmartCoach | `workout_plans`, `workout_plan_items`, `coach_profiles`, `completed_exercises`, plan subscriptions, `gyms.smartcoach_enabled` | MVP economy-first; UI already flag-gated. Prefer no new SmartCoach features until post-pilot. |
| Sweat Arenas | `sweat_arenas`, `arena_*`, `finalize_arena`, cron-assisted jobs | Valuable but not required for single-gym pilot core loop. |
| Broad engagement | `engagement_campaigns` stack | Keep for ops if used; otherwise treat as **post-pilot** marketing surface. |
| Legacy / duplicate progress | `user_challenge_progress` (if still present) | Superseded by `challenge_progress`; do not use for new code. |

---

## Remove_before_launch candidates (requires backup + impact report — **not executed**)

**None recommended in Phase 1.** Plan D1 explicitly forbids hard-delete without archive and dependency analysis. The following are **future** candidates only after “stop reads/writes” and archive steps:

- Unused views or one-off debug functions (to be listed after `pg_depend` / codebase grep).
- Deprecated columns explicitly marked in older migrations (e.g. legacy challenge fields) only after all readers are gone.

---

## RPCs & functions (pilot-critical subset)

Non-exhaustive list aligned with core journeys (auth, check-in, workout, drops, redeem, desk):

- `perform_checkin`, `award_drops`, `calculate_session_drops_v2`, `claim_reward`, `find_redemption_by_code`
- `get_leaderboard`, `get_public_gyms_for_mobile`
- `get_gym_dashboard_overview`, `get_gym_activity_log`, `admin_list_*`
- Identity / staff: `get_checkin_identity_candidates`, `verify_member_identity`, `resend_staff_invitation_email`, `mark_staff_invitation_email_delivery`

Regenerate and diff from `pg_proc` when preparing a stricter “allowed RPC allowlist” for security review.

---

## Related migrations (this delivery)

| File | Purpose |
|------|---------|
| `20260327140000_profiles_email_verified_and_release_compliance.sql` | `email_verified_at` + legal acknowledgment columns + auth backfill |
| `20260311130000_add_pilot_gym_visibility_flag.sql` | Pilot gym listing |

**Verify:** `backend/supabase/VERIFY_PROFILES_AUTH_RELEASE_COLUMNS.sql`, `VERIFY_PILOT_GYM_VISIBILITY.sql`

---

## Next steps (other agents)

- **mobile-coder:** Gate email-provider signup on `email_verified_at` / Auth `email_confirmed_at`; persist legal acknowledgment into `terms_privacy_*` fields when UX requires.
- **admin-coder:** Optional support tooling to view verification / ack status (RLS-sensitive; prefer read-only superadmin paths).
- **supabase-dba (later):** Expand inventory with auto-generated table/function lists from SQL (`information_schema`, `pg_proc`) and cross-reference to repo `grep` for “dead” objects.
