# Push Notifications — Systemic Fix Plan

**Status:** Phase 0–2.2 Complete, Phase 3.1 + Phase 4 Complete (Phase 2.1 admin-panel + Phase 3.2 + Phase 5 pending)
**Owner:** Multi-agent (supabase-dba + mobile-coder + admin-coder)
**Created:** 2026-04-20
**Trigger:** User reported (a) Arena ended with a prize won → no push, no inbox row; (b) Happy Hour reminders stopped arriving even though the user has a valid `expo_push_token` stored in `profiles`. Happy Hour was previously working → this is a regression.

---

## 0. TL;DR

The push notification stack has **three classes of problem**:

1. **Runtime regression (happy hour)** — Most likely a Supabase-level operational issue (cron schedule lost, vault secret missing, edge function not deployed, or pg_net queue backed up). The code itself looks fine; we need diagnostics to pinpoint.
2. **Structural bug (arena)** — `finalize-arena` gates the inbox insert behind a valid `expo_push_token`. Any winner without a valid token gets no push AND no `user_notifications` row. The user's specific case may be caused by a token that passes the DB check but fails `isExpoPushToken(...)` format check in the edge function, OR by the cron not having run yet for an arena that ended today (UTC).
3. **Inbox inconsistency (everywhere else)** — Many `send-push` callers don't pass `user_ids`, so pushes arrive on device but do not show in Notification Center. Several announced notification categories (`session_ended`, `badge_earned`, `reward_claimed`, friend requests, messages) are never emitted by the backend.

This plan contains:
- **Phase 0 — Diagnostics** (must run first to localize the happy hour regression)
- **Phase 1 — Critical fixes** (arena inbox + send-push inbox parity)
- **Phase 2 — Inbox coverage for every push caller**
- **Phase 3 — Deep-link + missing category coverage**
- **Phase 4 — Mobile-side UX polish (inbox states, permission recovery, badge count)**
- **Phase 5 — Observability & health-check endpoint**

Each step lists the **responsible agent** and the **workspace boundary** it must stay in.

---

## Phase 0 — Diagnostics (supabase-dba, read-only, ~15 min)

Run these against the production Supabase project (SQL editor is OK here — **read-only** queries only).

### 0.1 Confirm cron jobs are alive

```sql
SELECT jobid, jobname, schedule, active, command
FROM cron.job
WHERE jobname IN (
  'send-happy-hour-reminders',
  'finalize-arena-check',
  'leaderboard-prize-distribution',
  'process-campaigns-sweep',
  'streak-reminder',
  're-engagement',
  'drops-expiry-warning'
)
ORDER BY jobname;
```

**Expected:** all 7 rows present, `active = true`. If any are missing → the corresponding migration has not been applied or was unscheduled. Re-apply the relevant migration:
- `20260330000004_schedule_edge_function_cron_jobs.sql` (happy hour, finalize-arena, leaderboard)
- `20260413000017_schedule_process_campaigns.sql` (process-campaigns)
- `20260415000001_schedule_streak_reengagement_drops_expiry_cron.sql` (streak, re-engagement, drops-expiry)

### 0.2 Confirm recent runs succeeded

```sql
SELECT jobname, status, return_message,
       start_time, end_time,
       end_time - start_time AS duration
FROM cron.job_run_details d
JOIN cron.job j ON j.jobid = d.jobid
WHERE j.jobname = 'send-happy-hour-reminders'
ORDER BY start_time DESC
LIMIT 20;
```

**Interpret:**
- `status = 'succeeded'` but `return_message` shows `-1` → **vault secrets missing** (see 0.3).
- `status = 'failed'` → read `return_message` for the real error.
- No rows at all → cron is not firing. Check `active = true` in 0.1.

### 0.3 Confirm vault secrets exist

```sql
SELECT name, created_at, updated_at
FROM vault.secrets
WHERE name IN ('project_url', 'service_role_key');
```

**Expected:** two rows. If either is missing, run in SQL Editor:
```sql
SELECT vault.create_secret('https://<PROJECT_REF>.supabase.co', 'project_url');
SELECT vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');
```
Then wait 5 minutes for the next cron tick.

### 0.4 Confirm pg_net is delivering

```sql
SELECT id, status_code, error_msg, created
FROM net._http_response
ORDER BY created DESC
LIMIT 30;
```

Look for non-2xx statuses on recent rows. `error_msg = 'timeout'` points to edge function cold-start / project paused.

### 0.5 Confirm edge functions are deployed

From a terminal with the supabase CLI linked to the project:
```bash
supabase functions list
```
Verify **all** of the following are deployed (run `supabase functions deploy <name>` for any missing):
- `send-push`
- `send-happy-hour-reminders`
- `finalize-arena`
- `distribute-leaderboard-prizes`
- `process-campaigns`
- `streak-reminder`
- `re-engagement`
- `drops-expiry-warning`
- `notify-arena-participants`
- `send-prize-ready-push`

### 0.6 Confirm the reporting user is eligible for happy hour pushes

Using the user's UUID as `$USER_ID`:
```sql
SELECT id, expo_push_token,
       happy_hour_reminders_enabled,
       happy_hour_reminder_offset_min
FROM public.profiles
WHERE id = '$USER_ID';
```
- `expo_push_token` must be non-null and match `ExponentPushToken[...]` format. If it doesn't match, that's the root cause — see 0.7 for the format filter.
- `happy_hour_reminders_enabled` must be `true`.
- `happy_hour_reminder_offset_min` must be in `{0, 10, 30}`.

Then check that at least one visible, active boost rule exists for a gym the user belongs to:
```sql
SELECT r.id, r.gym_id, r.name, r.is_active, r.is_visible_to_members,
       r.start_time_local, r.end_time_local, r.timezone, r.days_of_week
FROM public.gym_drop_boost_rules r
JOIN public.gym_memberships m ON m.gym_id = r.gym_id
WHERE m.user_id = '$USER_ID'
  AND r.is_active = true
  AND r.is_visible_to_members = true;
```
If zero rows: admin needs to toggle **Visible to members** on the boost rule.

### 0.7 Confirm `isExpoPushToken` format check

Edge functions validate tokens with `isExpoPushToken` (`backend/supabase/functions/_shared/expo-push.ts`). If the token stored in the DB is anything other than `ExponentPushToken[XXX]` or `ExpoPushToken[XXX]`, it is silently skipped (counted as `skipped_no_token`). Confirm by running:
```sql
SELECT id
FROM public.profiles
WHERE id = '$USER_ID'
  AND expo_push_token ~ '^ExponentPushToken\[|^ExpoPushToken\[';
```
If this returns zero rows but `expo_push_token` is non-null → token format is invalid → user must re-register (app → settings → toggle notifications off/on).

### 0.8 Confirm no send failure for this user

```sql
SELECT COUNT(*) AS recent_logs
FROM public.happy_hour_reminder_logs
WHERE user_id = '$USER_ID'
  AND sent_at >= NOW() - INTERVAL '7 days';
```
- `recent_logs = 0` → dedupe table has no entry → the edge function either never picked them up, or got filtered out upstream. Cross-check with 0.2.
- `recent_logs > 0` → the edge function DID try; push was rejected downstream. Inspect edge function logs in the Supabase dashboard for the `happy_hour_push_http_error` / `no successful Expo tickets` events.

### 0.9 Output

**Diagnostics Report — 2026-04-20 supabase-dba**

| Check | Result | Verdict |
|---|---|---|
| 0.5 Functions deployed (prod) | All v1 from 2026-03-31. `send-push` v1 (no inbox code). `finalize-arena` v1 (no user_ids fix). `process-campaigns` MISSING. `send-prize-ready-push` MISSING. | 🔴 ROOT CAUSE |
| 0.3 Vault secrets | `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `SUPABASE_DB_URL` present | ✅ OK |
| 0.8 happy_hour_reminder_logs | 0 rows on prod | 🔴 Never ran on prod |
| user_notifications | 0 rows on prod | 🔴 Inbox code never deployed to prod |
| Linked CLI project | `sweat-drop` (dev, not prod) | ⚠️ Deploy with `--project-ref gyqgdfqnatuegwyidrii` |

Root cause: pure deployment gap — all code fixes were in dev but never pushed to production. No operational intervention needed (secrets OK, cron migrations applied).

**Resolution:** Phase 0–2.2 fixes coded and deployed 2026-04-20. See deployment log below.

---

## Phase 1 — Critical code fixes (supabase-dba)

These fix the arena inbox bug and make `send-push` inbox-writing robust. Both must ship together.

### 1.1 `finalize-arena` — always insert inbox row, even without token

**File:** `backend/supabase/functions/finalize-arena/index.ts`

**Change A — winners loop (currently L168–238).** Replace:

```typescript
for (const wr of winnerResults || []) {
  const token = tokenByUser.get(wr.user_id);
  if (!token) continue;
  ...
  body: JSON.stringify({
    client_ref: needsVerification ? 'arena_prize_unverified' : 'arena_prize',
    tokens: [token],
    user_ids: [wr.user_id],
    ...
  })
}
```

with this semantics (pseudocode; preserve existing copy):

```typescript
for (const wr of winnerResults || []) {
  const token = tokenByUser.get(wr.user_id);
  // Build push payload regardless of token presence — send-push handles empty tokens
  const pushResponse = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabaseServiceKey}` },
    body: JSON.stringify({
      client_ref: needsVerification ? 'arena_prize_unverified' : 'arena_prize',
      tokens: token ? [token] : [],   // ← key change
      user_ids: [wr.user_id],         // ← ALWAYS present
      title: '🏆 Arena Prize Won!',
      body: pushBody,
      data: pushData,
    }),
  });
  // existing metrics/logging
}
```

**Change B — non-winner participants (currently L242–284).** Remove the `.not('profiles.expo_push_token', 'is', null)` filter so users without tokens are still returned:

```typescript
const { data: allParticipants } = await supabase
  .from('arena_participants')
  .select('user_id, profiles!inner(expo_push_token)')
  .eq('arena_id', arena.id);   // ← no token filter

const nonWinnerParticipants = (allParticipants || [])
  .filter((p: any) => !winnerUserIds.includes(p.user_id));

const nonWinnerUserIds = nonWinnerParticipants.map((p: any) => p.user_id);
const nonWinnerTokens = nonWinnerParticipants
  .map((p: any) => p.profiles?.expo_push_token)
  .filter((t: string | null) => isExpoPushToken(t));

if (nonWinnerUserIds.length > 0) {   // ← gate on users, not tokens
  await fetch(`${supabaseUrl}/functions/v1/send-push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabaseServiceKey}` },
    body: JSON.stringify({
      client_ref: 'finalize_arena_participants',
      tokens: nonWinnerTokens,           // may be empty
      user_ids: nonWinnerUserIds,        // ← ALWAYS present
      title: '🏁 Arena Ended',
      body: `${arena.name} has ended. Check your final ranking!`,
      data: { type: 'arena_ended', arena_id: arena.id, arena_name: arena.name },
    }),
  });
}
```

### 1.2 `send-push` — accept `tokens: []` + `user_ids: [...]` as inbox-only

**File:** `backend/supabase/functions/send-push/index.ts`

Currently L73–99, when `tokens.length === 0` the function returns early with `skip_reason: 'no_tokens'` and never writes the inbox. Move the `user_ids` inbox-write block (currently L287–322) **above** the early returns (both `requested === 0` and `valid_tokens === 0`), so inbox-only invocations still persist rows.

Also tighten `_shared/send-push-request.ts` to accept a payload where `tokens` is missing or empty **iff** `user_ids` is non-empty. (If today the parser rejects `tokens: []`, relax that check.)

### 1.3 Validation / dedupe requirements

- If the same `{user_id, type, title, body}` is about to be inserted within the same minute, consider a DB-level dedupe. For now, add a simple guard in `send-push`: skip inbox row if an identical row for that `user_id + type + data->>arena_id` already exists within the last 5 minutes. (Optional; do not block this phase on it.)

### 1.4 Ship

Write a migration **only if the request parser needs a SQL change** (it doesn't — all changes are TS). Deploy both edge functions:
```bash
supabase functions deploy send-push
supabase functions deploy finalize-arena
```

### 1.5 Manual verification

1. Seed an arena with `end_date = yesterday`, `is_finalized = false`, one winner (`wr.user_id`) whose profile has `expo_push_token = NULL`.
2. `POST /functions/v1/finalize-arena` with `{"arena_id": "<id>"}`.
3. Expect exactly one row in `user_notifications` for that user with `type = 'arena_prize'`, and zero Expo push attempts for them (no token).
4. Repeat with a valid token; expect both the push and the inbox row.

---

## Phase 2 — Inbox parity across every push caller (multi-agent)

Goal: **every** push call also writes a `user_notifications` row. All fixes consist of adding `user_ids: [...]` to existing `send-push` invocations.

### 2.1 Admin panel (admin-coder, workspace: `apps/admin-panel/`)

**File:** `apps/admin-panel/lib/actions/arena-actions.ts`

1. `cancelArena` (~L680–717): when querying `arena_participants`, also select `user_id`. Pass it via `user_ids: participantUserIds` in the `send-push` body.
2. `notifyArenaParticipants` (~L728–826): in both `winnersOnly` and "all participants" branches, pass `user_ids: winnerUserIds` / `user_ids: participantUserIds` to `send-push`.

**File:** `apps/admin-panel/lib/actions/leaderboard-actions.ts`

3. Manual-distribute call (~L314–327): pass `user_ids: [user.user_id]` on each iteration (or accumulate them and send as one call).

**Acceptance:** each admin-triggered push also generates one inbox row per recipient; admin action result toast can now show "Sent: X pushes, X inbox rows".

### 2.2 Supabase edge functions (supabase-dba, workspace: `backend/supabase/functions/`)

Add `user_ids` to these `send-push` callers:

| File | Where | `user_ids` source |
|---|---|---|
| `streak-reminder/index.ts` (~L63–77) | outgoing call | target user IDs from eligible-profiles query |
| `re-engagement/index.ts` (~L55–120) | both 7d and 14d branches | candidate user IDs |
| `drops-expiry-warning/index.ts` (~L101–186) | both 30d and 7d branches | owner user IDs |
| `send-happy-hour-reminders/index.ts` (~L198–213) | per-recipient call | `[membership.user_id]` |
| `notify-arena-participants/index.ts` (~L92–157) | both branches | the user IDs already looked up |

**Note for `send-happy-hour-reminders`:** because the dedupe `INSERT` into `happy_hour_reminder_logs` happens **before** `send-push`, the inbox row will also be dedupe-safe (one row per user-rule-window-offset).

**Acceptance:** for each function, a single successful run should write `N` Expo pushes + `N` `user_notifications` rows for the users with valid tokens, and `M` `user_notifications` rows for users that had no valid token (new behavior — these users now see the notification in-app even if they can't get a push).

### 2.3 Deploy

```bash
supabase functions deploy send-happy-hour-reminders streak-reminder re-engagement drops-expiry-warning notify-arena-participants
```

---

## Phase 3 — Deep-link and category coverage (mobile-coder + supabase-dba)

### 3.1 Add missing deep-link cases (mobile-coder, workspace: `apps/mobile-app/`)

**File:** `apps/mobile-app/lib/notifications.ts`, function `getDeepLinkFromNotification` (L308–383).

Add cases:

```typescript
case 'arena_cancelled':
  return data.arena_id ? `/arena/${data.arena_id}` : '/arenas';

case 'happy_hour_reminder':
  return data.gym_id ? `/gym/${data.gym_id}` : '/home';

case 'streak_reminder':
case 're_engagement':
  return '/home';

case 'drops_expiring':
  return '/wallet';

case 'campaign':
  return data.deep_link ? sanitizeDeepLink(data.deep_link) : '/home';
```

Verify each case corresponds to a real route in `apps/mobile-app/app/`. If a route is missing, add a minimal page.

### 3.2 Emit the declared-but-unused categories (supabase-dba)

The mobile `NotificationData` + `getDeepLinkFromNotification` have handlers for these, but no backend code ever emits them:

- `session_ended`
- `badge_earned`
- `reward_claimed`
- `weekly_results`

**Decision required:** for each, decide **implement** or **remove**.

Recommended:
- **Remove** `session_ended` from mobile enum (sessions are finalized entirely on-device; no push needed).
- **Remove** `weekly_results` (not MVP).
- **Implement** `badge_earned` and `reward_claimed` as DB triggers calling `persist_notification` + `_invoke_edge_function('send-push')` (follow the `notify_leaderboard_overtakes` pattern in `20260413000010_user_notifications_inbox.sql`).

Ship as one migration: `YYYYMMDDHHMMSS_notifications_badge_and_reward_claim.sql`.

### 3.3 Friend requests / challenge invites / DMs — out of scope

Document as a follow-up in `STATE_OF_THE_APP.md` and leave a TODO in `notifications.ts` near the `NotificationTrigger` enum.

---

## Phase 4 — Mobile-side UX polish (mobile-coder, workspace: `apps/mobile-app/`)

### 4.1 Surface push-permission regression

**File:** `apps/mobile-app/app/_layout.tsx` around L460–497, and `apps/mobile-app/app/settings.tsx`.

Today, if permission is revoked after onboarding, the app silently never retries — but keeps a stale token in the DB. Add:

1. On app foreground, re-check `getPushPermissionStatus()`. If `denied`, and `profiles.expo_push_token` is non-null, call `clearPushToken(userId)`.
2. Show a dismissible banner on the Notification Center screen (`apps/mobile-app/app/notifications.tsx`) when permission is not `granted`: "Turn on notifications to hear about prizes and happy hour" → CTA opens settings.

### 4.2 Inbox empty/error states & realtime correctness

**File:** `apps/mobile-app/hooks/useNotifications.ts` and `apps/mobile-app/app/notifications.tsx`.

1. Confirm the realtime INSERT subscription handles re-subscription after network drop (test by toggling airplane mode for 30 s).
2. Empty state: "No notifications yet" + icon.
3. Error state: retry button when `useQuery` errors.
4. Add pull-to-refresh (force a `refetch`).

### 4.3 Badge count on home

**File:** `apps/mobile-app/hooks/useNotifications.ts` → `useUnreadNotificationCount` (L196–243).

1. Ensure this hook is consumed by the home screen's bell icon.
2. Re-validate on realtime INSERT (should already happen via invalidation; confirm).

### 4.4 Foreground display policy

**File:** `apps/mobile-app/lib/notifications.ts` → `configureNotificationHandler` (L94–112).

Today pushes show a system banner in foreground. Confirm this is desired. If not, switch to custom in-app toast that also adds a bell badge.

---

## Phase 5 — Observability (supabase-dba)

### 5.1 Add a push-health RPC

Create a SECURITY DEFINER RPC readable only by superadmins that returns:

```
function: get_push_health()
returns:  {
  last_cron_runs:    [{ jobname, last_start, last_status, last_error }],
  vault_secrets_ok:  boolean,
  recent_http_errors_24h: integer,
  inbox_writes_24h:  integer,
  expo_sends_24h:    integer
}
```

Expose in the admin panel as a `/dashboard/health/notifications` page (admin-coder). This alone would have caught the current regression in minutes.

### 5.2 Structured log markers (already present)

`send-push` already logs `event: 'send-push'`. Make sure `send-happy-hour-reminders` summary log includes the same `event` key so it's queryable in Supabase Logs with `event = 'send-happy-hour-reminders'`.

---

## Acceptance criteria (ship gate)

Ship when **all** of the following are true:

- [ ] Phase 0 diagnostics reported and any operational issue resolved.
- [ ] Arena finalization produces both a push (if token) and an inbox row (always), verified by Phase 1.5.
- [ ] Every `send-push` call across the codebase includes `user_ids` (Phase 2).
- [ ] Happy Hour reminders deliver to the reporting user (verified by `happy_hour_reminder_logs` + inbox row + device banner in a live test).
- [ ] Cancelled-arena push deep-links to the arena screen instead of `/home`.
- [ ] Mobile notifications screen shows empty / loading / error / denied-permission states.
- [ ] `get_push_health()` RPC exists and returns sane data.

---

## Execution order (recommended)

1. **supabase-dba:** Phase 0 (diagnostics) → share report
2. **supabase-dba:** Phase 1 (critical code fixes) → deploy → verify
3. **supabase-dba:** Phase 2.2 (edge functions inbox parity) → deploy
4. **admin-coder:** Phase 2.1 (admin panel inbox parity)
5. **mobile-coder:** Phase 3.1 (deep links) + Phase 4 (mobile UX)
6. **supabase-dba:** Phase 3.2 (badge_earned / reward_claimed emission)
7. **supabase-dba + admin-coder:** Phase 5 (observability)

Do not skip Phase 0 — it is the only way to find out whether the happy hour regression is fixed by code changes alone or requires operational intervention (re-deploy / re-schedule / re-create vault secret).

---

## Appendix A — File reference

| Concern | File | Lines |
|---|---|---|
| Mobile push register/save | `apps/mobile-app/lib/notifications.ts` | 128–265 |
| Mobile push foreground handler | `apps/mobile-app/lib/notifications.ts` | 94–112 |
| Mobile deep-link map | `apps/mobile-app/lib/notifications.ts` | 308–383 |
| Mobile root push effect | `apps/mobile-app/app/_layout.tsx` | 460–497 |
| Mobile notification center | `apps/mobile-app/app/notifications.tsx` | — |
| Mobile notifications hook | `apps/mobile-app/hooks/useNotifications.ts` | 43–243 |
| Inbox table + RPCs | `backend/supabase/migrations/20260413000010_user_notifications_inbox.sql` | — |
| Cron (happy hour / arena / leaderboard) | `backend/supabase/migrations/20260330000004_schedule_edge_function_cron_jobs.sql` | — |
| Cron (campaigns) | `backend/supabase/migrations/20260413000017_schedule_process_campaigns.sql` | — |
| Cron (streak / re-engagement / expiry) | `backend/supabase/migrations/20260415000001_schedule_streak_reengagement_drops_expiry_cron.sql` | — |
| send-push | `backend/supabase/functions/send-push/index.ts` | — |
| finalize-arena | `backend/supabase/functions/finalize-arena/index.ts` | 168–284 |
| send-happy-hour-reminders | `backend/supabase/functions/send-happy-hour-reminders/index.ts` | 190–215 |
| distribute-leaderboard-prizes | `backend/supabase/functions/distribute-leaderboard-prizes/index.ts` | 219–234 |
| process-campaigns | `backend/supabase/functions/process-campaigns/index.ts` | 139–188 |
| streak-reminder | `backend/supabase/functions/streak-reminder/index.ts` | 63–77 |
| re-engagement | `backend/supabase/functions/re-engagement/index.ts` | 55–120 |
| drops-expiry-warning | `backend/supabase/functions/drops-expiry-warning/index.ts` | 101–186 |
| notify-arena-participants | `backend/supabase/functions/notify-arena-participants/index.ts` | 92–157 |
| send-prize-ready-push | `backend/supabase/functions/send-prize-ready-push/index.ts` | 140–149 |
| Admin arena actions | `apps/admin-panel/lib/actions/arena-actions.ts` | 680–826 |
| Admin leaderboard actions | `apps/admin-panel/lib/actions/leaderboard-actions.ts` | 314–327 |
| Leaderboard overtake trigger | `backend/supabase/migrations/20260413000009_leaderboard_overtake_push.sql` | — |

## Appendix B — Known gaps (audit summary, no action this sprint unless called out above)

| Category | Push | Inbox | Gap |
|---|---|---|---|
| Arena finalize (winner) | ✅ if token | ❌ if no token | **Fixed in Phase 1** |
| Arena finalize (non-winner) | ✅ if token | ❌ if no token | **Fixed in Phase 1** |
| Arena cancelled | ✅ | ❌ | **Fixed in Phase 2.1** + deep link Phase 3.1 |
| Arena admin notify | ✅ | ❌ | **Fixed in Phase 2.1** |
| Leaderboard prize (cron) | ✅ | ✅ | OK |
| Leaderboard prize (admin manual) | ✅ | ❌ | **Fixed in Phase 2.1** |
| Prize ready (verification fulfilled) | ✅ | ✅ | OK |
| Campaigns | ✅ | ✅ | OK |
| Leaderboard overtake | ✅ | ✅ | OK |
| Streak reminder | ✅ | ❌ | **Fixed in Phase 2.2** |
| Re-engagement | ✅ | ❌ | **Fixed in Phase 2.2** |
| Drops expiry | ✅ | ❌ | **Fixed in Phase 2.2** |
| Happy hour | ✅ | ❌ | **Fixed in Phase 2.2** (and Phase 0 confirms delivery) |
| Badge earned | ❌ | realtime only | **Addressed in Phase 3.2** |
| Reward claimed | ❌ | ❌ | **Addressed in Phase 3.2** |
| Session ended / weekly results | ❌ | ❌ | Deprecate types (Phase 3.2) |
| Friend requests / challenges / DMs | ❌ | ❌ | Out of scope — follow-up |
