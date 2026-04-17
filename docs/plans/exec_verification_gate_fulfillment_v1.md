# Execution Plan — Ship NOW: Verification Gate (Leaderboard + Arena) + Fulfillment v1

**Created:** 2026‑04‑17
**Parent plan:** [`feature_verification_gate_on_leaderboard_arena_prizes.md`](feature_verification_gate_on_leaderboard_arena_prizes.md)
**Status:** ready for execution pending Phase 0 product decisions
**Target merge:** within 2 engineering days

This document is the **exact agent dispatch kit**. Every prompt below is copy‑pasteable into the corresponding subagent. Read the parent plan first for context; this file is the action layer.

---

## Phase 0 — Product decisions (BLOCKING, ~15 min)

Before any code is written, confirm these four answers. Defaults are my recommendations — just say "go with defaults" if you don't want to debate.

| # | Question | Default |
|---|----------|---------|
| P0.1 | Should `pending_verification` redemption cards **show the code greyed out** (with "verify first" CTA) or **hide the code until verified**? | Show greyed. Drives verify action without taking away the win. |
| P0.2 | Send a second push ("Your prize has arrived at Gym X — come pick it up") when gym staff marks `fulfilled_at`? | Yes. Single extra push per redemption, huge UX win. |
| P0.3 | `pending_verification` rows expire with the standard 30‑day `expires_at` like regular pending rows? | Yes. No special treatment. If they never verify, inventory eventually returns to the pool. |
| P0.4 | Should `confirm_redemption` **re‑check live verification** at confirm time (not just at distribution time)? | Yes. Closes the un‑verify gap (§7.4 of parent plan). One extra EXISTS query. |

Once confirmed, move to Phase 1.

---

## Phase 1 — `supabase-dba`: single migration

**Output file:** `backend/supabase/migrations/20260418000001_verification_gate_and_fulfillment.sql`

**Estimated time:** 2–3 hours including local testing.

**Agent prompt (copy verbatim):**

> You are `supabase-dba`. Read `docs/plans/feature_verification_gate_on_leaderboard_arena_prizes.md` (§4.2 for the migration skeleton, §7.2 for the `finalize_arena` gym‑fallback patch, §7.4 for the confirm‑time live verification re‑check, §8.5 for fulfillment columns) and `docs/plans/exec_verification_gate_fulfillment_v1.md` (this file).
>
> Create a single migration `backend/supabase/migrations/20260418000001_verification_gate_and_fulfillment.sql` that does all of the following, **in this order, in one transaction**:
>
> 1. **Helper function** `public.is_member_verified(p_user_id UUID, p_gym_id UUID) RETURNS BOOLEAN`, STABLE, SECURITY DEFINER, `search_path = public`. Body: `SELECT EXISTS(SELECT 1 FROM public.gym_member_identities WHERE user_id = p_user_id AND gym_id = p_gym_id AND is_verified = true)`. GRANT EXECUTE to `authenticated` and `service_role`.
>
> 2. **Fulfillment columns on `public.redemptions`** (all nullable, additive):
>    - `fulfilled_at TIMESTAMPTZ NULL`
>    - `fulfilled_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL`
>    - `fulfillment_notes TEXT NULL`
>    Add index `idx_redemptions_fulfilled_at ON public.redemptions(fulfilled_at) WHERE fulfilled_at IS NOT NULL`.
>
> 3. **Patch `distribute_leaderboard_prizes`**: re‑declare the function (`CREATE OR REPLACE`). Change the INSERT into `public.redemptions` so `status` is computed as `CASE WHEN public.is_member_verified(v_top3.user_id, p_gym_id) THEN 'pending' ELSE 'pending_verification' END`. Everything else (code generation, expires_at, description) stays exactly the same.
>
> 4. **Patch `finalize_arena`**: re‑declare the function. Two changes:
>    (a) Replace the gym fallback chain (home_gym_id → first arena_gyms row) with the membership‑aware version from §7.2 of the parent plan — home_gym_id must be in `arena_gyms` AND user must have a `gym_memberships` row there, else pick the oldest `gym_memberships` row from `arena_gyms`, else RAISE EXCEPTION.
>    (b) Change the INSERT status to `CASE WHEN public.is_member_verified(v_winner.user_id, v_user_gym_id) THEN 'pending' ELSE 'pending_verification' END`.
>
> 5. **Patch `confirm_redemption`**: re‑declare. Add two checks after the existing "already in status X" guard:
>    (a) If `v_redemption.status = 'pending_verification'`, return `{ success: false, error_message: 'VERIFICATION_REQUIRED' }` (exact string — mobile/admin pattern‑match on it).
>    (b) Live re‑check: `IF NOT public.is_member_verified(v_redemption.user_id, v_redemption.gym_id) THEN RETURN { success: false, error_message: 'VERIFICATION_REQUIRED' }` (same error, handles revocation between distribution and confirm).
>
> 6. **Auto‑promote trigger** on `public.gym_member_identities`:
>    ```sql
>    CREATE OR REPLACE FUNCTION public.promote_pending_verification_redemptions()
>    RETURNS TRIGGER LANGUAGE plpgsql AS $$
>    BEGIN
>      IF NEW.is_verified = true AND (TG_OP = 'INSERT' OR OLD.is_verified IS DISTINCT FROM true) THEN
>        UPDATE public.redemptions
>          SET status = 'pending', updated_at = NOW()
>          WHERE user_id = NEW.user_id
>            AND gym_id  = NEW.gym_id
>            AND status  = 'pending_verification';
>      END IF;
>      RETURN NEW;
>    END;
>    $$;
>
>    DROP TRIGGER IF EXISTS trg_promote_pending_verification_redemptions ON public.gym_member_identities;
>    CREATE TRIGGER trg_promote_pending_verification_redemptions
>      AFTER INSERT OR UPDATE OF is_verified ON public.gym_member_identities
>      FOR EACH ROW EXECUTE FUNCTION public.promote_pending_verification_redemptions();
>    ```
>
> 7. **`mark_redemption_fulfilled` RPC** (for admin panel "Mark received" action):
>    ```
>    FUNCTION public.mark_redemption_fulfilled(p_redemption_id UUID, p_notes TEXT DEFAULT NULL)
>    RETURNS JSONB
>    ```
>    Behaviour:
>    - Auth: caller must be gym_owner / gym_admin / receptionist of `redemptions.gym_id`, or superadmin. Reuse `_admin_check_gym_access` helper.
>    - Only works on redemptions where `fulfilled_at IS NULL`.
>    - Sets `fulfilled_at = NOW(), fulfilled_by = auth.uid(), fulfillment_notes = p_notes, updated_at = NOW()`.
>    - Returns `jsonb_build_object('success', true, 'redemption_id', p_redemption_id, 'fulfilled_at', NOW(), 'user_id', r.user_id, 'gym_id', r.gym_id)` so the edge function (Phase 2b) can trigger the "prize ready" push.
>
> 8. **`get_arena_fulfillment_manifest` RPC** (for admin panel Fulfillment view):
>    ```
>    FUNCTION public.get_arena_fulfillment_manifest(p_arena_id UUID)
>    RETURNS TABLE(redemption_id UUID, user_id UUID, username TEXT, full_name TEXT,
>                  rank INT, prize_description TEXT, gym_id UUID, gym_name TEXT,
>                  status TEXT, redemption_code TEXT, fulfilled_at TIMESTAMPTZ,
>                  fulfilled_by UUID, confirmed_at TIMESTAMPTZ, expires_at TIMESTAMPTZ)
>    ```
>    - Superadmin: all rows for the arena.
>    - Gym staff: only rows where they have access to `redemptions.gym_id`.
>    - SECURITY DEFINER with `search_path = public`.
>    - Source: JOIN `arena_results` + `redemptions` + `gyms` + `profiles`. Description comes from `redemptions.description`.
>
> Finally: regenerate `backend/types/database.types.ts` (run whatever script exists in root `package.json`; if none exists, generate manually via supabase CLI and commit).
>
> **Acceptance (must tick all):**
> - `supabase db push` applies cleanly on a fresh DB.
> - Unit‑level probes in a transaction:
>   - Unverified user wins mock leaderboard → redemption is `pending_verification`.
>   - `verify_member_identity(gym, user)` flips the row to `pending` automatically.
>   - `confirm_redemption` on a `pending_verification` row returns `VERIFICATION_REQUIRED`.
>   - `confirm_redemption` on a `pending` row whose user is un‑verified after the fact ALSO returns `VERIFICATION_REQUIRED`.
>   - `finalize_arena` can't produce a `redemptions.gym_id` the winner isn't a member of.
> - Regenerated types include `pending_verification` status and new columns.
> - No changes to mobile app or admin panel code (pure DB PR).
>
> **Report back:** migration filename, RPC signatures, types diff summary.

---

## Phase 2 — `edge-function-agent`: two edge‑function updates

**Output files:**
- `backend/supabase/functions/distribute-leaderboard-prizes/index.ts` (modify)
- `backend/supabase/functions/finalize-arena/index.ts` (modify)
- `backend/supabase/functions/send-prize-ready-push/index.ts` (new; optional but recommended per P0.2)

**Depends on:** Phase 1 merged (reads new `status` values from RPC result).

**Estimated time:** 1.5 hours.

**Agent prompt (copy verbatim):**

> You are `edge-function-agent`. Read `docs/plans/feature_verification_gate_on_leaderboard_arena_prizes.md` §4.3 and `docs/plans/exec_verification_gate_fulfillment_v1.md` (this file). The DB migration from Phase 1 is already applied — redemptions may now come back with `status='pending_verification'`.
>
> **Task 2a — Update `distribute-leaderboard-prizes/index.ts`:**
> 1. When fetching newly created redemptions after the RPC call, include `status` in the SELECT: `.select('id, user_id, redemption_code, description, status')`.
> 2. When building the push for each winner, branch on status:
>    - `status === 'pending'` → existing copy: `"You finished {ordinal(rank)} at {gym.name} this {period}! Show code {code} at the desk to collect your prize. 🎁"`.
>    - `status === 'pending_verification'` → new copy: `"You finished {ordinal(rank)} at {gym.name} this {period}! 🏆 Verify your membership at reception first, then collect with code {code}."`.
> 3. Include in push `data` payload:
>    - `redemption_status: status` (so mobile can route to the right card state).
>    - `requires_verification: status === 'pending_verification' ? 'true' : 'false'`.
> 4. Update `client_ref` when unverified: `client_ref: status === 'pending_verification' ? 'leaderboard_prize_unverified' : 'leaderboard_prize'` for delivery telemetry separation.
> 5. Preserve all existing error handling, dedupe, and idempotency. No schedule changes.
>
> **Task 2b — Update `finalize-arena/index.ts`:**
> Same pattern as 2a, but for arena winners. Fetch `status` on the winner redemption row, branch push copy identically but substitute "arena" language:
> - `pending`: `"You finished {ordinal(rank)} in {arena.name}! 🏆 Show code {code} at {gym.name} reception to collect your prize."`
> - `pending_verification`: `"You finished {ordinal(rank)} in {arena.name}! 🏆 Verify your membership at {gym.name} reception first, then collect with code {code}."`
>
> Also: `data.gym_name` must be included so the mobile push handler can render the right CTA ("pick up at {gym_name}").
>
> **Task 2c (optional, ship if time permits — blocked only by P0.2 = yes) — New edge function `send-prize-ready-push/index.ts`:**
> - Invoked by admin panel after `mark_redemption_fulfilled` succeeds (admin panel calls it directly; this function is NOT cron‑scheduled).
> - Input: `{ redemption_id: string }`.
> - Authz: `Authorization: Bearer <service_role>` (admin panel calls via server action, not from browser).
> - Behaviour:
>   - Load redemption (id, user_id, gym_id, source_type, redemption_code, description, status).
>   - If `status` is not `pending` (i.e. not ready to collect), return `{ skipped: true, reason: 'not_pending' }`.
>   - Load user's `expo_push_token` and the gym name.
>   - Send via existing `send-push` shared function with:
>     - `title`: `"🎁 Your prize is ready!"`
>     - `body`: `"Your prize is ready at {gym_name}. Show code {code} to collect it."`
>     - `data`: `{ type: 'prize_ready', redemption_id, gym_id }`
>     - `client_ref: 'prize_ready'`
>   - Return `{ success: true, delivered: n }`.
> - Uses the `_shared/expo-push.ts` helpers (same pattern as other functions).
>
> **Acceptance:**
> - Pushes to verified winners unchanged (A/B compare with previous prod messages).
> - Pushes to unverified winners include the "verify first" line and the code.
> - Push `data` payload includes `redemption_status` and `requires_verification` keys for both leaderboard and arena.
> - Running `mark_redemption_fulfilled` + invoking `send-prize-ready-push` on a `pending_verification` row is a no‑op (guard works).
> - Logging: structured JSON logs include `redemption_status` so we can filter unverified winners in observability.
> - No regression in dedupe: replaying the same cron invocation does not double‑send pushes.
>
> **Report back:** diff summary per file, new edge function file tree entry, sample push payloads for both branches.

---

## Phase 3 — `mobile-coder`: UI + error classifier + i18n

**Output files:**
- `apps/mobile-app/lib/security/reward-claim-errors.ts` (already has `verification_required`; no change needed unless you find a gap)
- `apps/mobile-app/app/redemptions.tsx` (modify — new state rendering)
- `apps/mobile-app/app/redemption-detail.tsx` if it exists, else inline in the list
- `apps/mobile-app/locales/en/redemptions.json` + `sr/redemptions.json` (add keys)
- Push handler (wherever `type: 'leaderboard_prize' | 'arena_prize' | 'prize_ready'` is handled)

**Depends on:** Phase 1 merged. Can run in parallel with Phase 2 once contracts are agreed.

**Estimated time:** 2–3 hours.

**Agent prompt (copy verbatim):**

> You are `mobile-coder`. Read `docs/plans/feature_verification_gate_on_leaderboard_arena_prizes.md` §4.4 and `docs/plans/exec_verification_gate_fulfillment_v1.md` (this file).
>
> **Context:** after the DB migration and edge function updates, the mobile app will encounter:
> - Redemption rows with `status = 'pending_verification'` (new).
> - Redemption rows with `status = 'pending'` but `fulfilled_at = NULL` (prize not yet delivered to the gym) and `fulfilled_at IS NOT NULL` (ready to collect).
> - Pushes with `data.redemption_status` and `data.requires_verification` and a new push type `prize_ready`.
>
> **Task 3a — Redemption list / card rendering (`redemptions.tsx` and/or detail screen):**
>
> Introduce a small helper (new file `apps/mobile-app/lib/redemption-state.ts`):
>
> ```ts
> export type RedemptionDisplayState =
>   | 'pending_verification'   // code shown greyed; "verify at reception" CTA
>   | 'pending_not_fulfilled'  // "prize on the way, we'll notify you"
>   | 'pending_ready'          // existing "show code at desk" — collect now
>   | 'confirmed'              // collected already
>   | 'cancelled' | 'expired';
>
> export function getRedemptionDisplayState(r: {
>   status: string;
>   fulfilled_at: string | null;
>   source_type: string | null;
>   expires_at: string | null;
> }): RedemptionDisplayState { /* derive from status + fulfilled_at */ }
> ```
>
> Store rewards (`source_type = 'reward'`) skip the fulfillment dimension — they're always on hand, so `pending → pending_ready` directly. Arena + leaderboard prizes go through the `pending_not_fulfilled → pending_ready` progression.
>
> Card UI per state (use existing visual language; add a status badge + accent colour):
> - `pending_verification` → yellow/amber badge "Verify at reception". Code visible but greyed with a lock icon. Body text: "Visit reception with your ID. After verification, this prize becomes collectible."
> - `pending_not_fulfilled` → neutral/blue badge "Prize on the way". Code visible (grey). Body: "Your prize will be delivered to {gym_name}. We'll notify you when it's ready."
> - `pending_ready` → green/existing badge "Ready to collect". Code in bold. Body: "Show this code at {gym_name} reception."
> - `confirmed` / `cancelled` / `expired` → unchanged from today.
>
> **Task 3b — Push handler:**
>
> Wherever push notifications are handled (search for `Notifications.addNotificationResponseReceivedListener` or existing `leaderboard_prize` routing), add:
> - `type: 'prize_ready'` → deep‑link to the redemption list (or detail if `redemption_id` provided). No other side effect.
> - For existing `leaderboard_prize` / `arena_prize` types, if `data.requires_verification === 'true'`, after navigating to the redemption card, automatically open the "Why verify?" info sheet (use existing `VerificationSheet.tsx` component — it already exists for store rewards).
>
> **Task 3c — i18n keys:**
>
> Add to both `apps/mobile-app/locales/en/redemptions.json` and `apps/mobile-app/locales/sr/redemptions.json`:
>
> ```json
> {
>   "states": {
>     "pendingVerification": {
>       "badge": "Verify at reception",
>       "body": "Visit reception with your ID. After verification, this prize becomes collectible.",
>       "cta": "Why verify?"
>     },
>     "pendingNotFulfilled": {
>       "badge": "Prize on the way",
>       "body": "Your prize will be delivered to {{gymName}}. We'll notify you when it's ready to collect."
>     },
>     "pendingReady": {
>       "badge": "Ready to collect",
>       "body": "Show this code at {{gymName}} reception."
>     }
>   },
>   "push": {
>     "prizeReady": {
>       "title": "🎁 Your prize is ready!",
>       "body": "Show your code at {{gymName}} reception to collect it."
>     }
>   }
> }
> ```
>
> Serbian translations (use existing tone):
> - `pendingVerification.badge`: "Verifikujte na recepciji"
> - `pendingVerification.body`: "Posetite recepciju sa dokumentom. Nakon verifikacije, nagrada postaje dostupna za preuzimanje."
> - `pendingVerification.cta`: "Zašto verifikacija?"
> - `pendingNotFulfilled.badge`: "Nagrada je na putu"
> - `pendingNotFulfilled.body`: "Tvoja nagrada će biti isporučena u {{gymName}}. Obavestićemo te kad bude spremna za preuzimanje."
> - `pendingReady.badge`: "Spremno za preuzimanje"
> - `pendingReady.body`: "Pokaži ovaj kod na recepciji teretane {{gymName}}."
> - `push.prizeReady.title`: "🎁 Tvoja nagrada je spremna!"
> - `push.prizeReady.body`: "Pokaži kod na recepciji teretane {{gymName}} da je preuzmeš."
>
> **Acceptance:**
> - A verified user's existing redemption card is visually IDENTICAL to today (no regression in the 99% case).
> - A `pending_verification` card shows the amber badge, greyed code, and CTA opens `VerificationSheet`.
> - A `pending_not_fulfilled` arena/leaderboard card shows the neutral badge.
> - Receiving a `prize_ready` push deep‑links to the redemptions screen.
> - Switching the app language to Serbian translates every new state correctly.
> - No hard crash if backend returns a status value the app doesn't recognise (fall back to the existing "pending" rendering).
>
> **Report back:** files changed, screenshots of each of the three pending states (light + dark), any locale keys you added that weren't in the spec.

---

## Phase 4 — `admin-coder`: RedemptionsManager update + Fulfillment view

**Output files:**
- `apps/admin-panel/components/modules/RedemptionsManager.tsx` (modify — add `pending_verification` treatment)
- `apps/admin-panel/components/modules/MemberIdentityVerifyDrawer.tsx` (light touch — ensure it refetches redemptions after verify)
- `apps/admin-panel/app/dashboard/super/arenas/[arenaId]/fulfillment/page.tsx` (new) OR add a tab to an existing arena detail page
- `apps/admin-panel/lib/actions/redemption-fulfillment-actions.ts` (new server action file)

**Depends on:** Phase 1 merged. Can run in parallel with Phases 2 & 3.

**Estimated time:** 2 hours.

**Agent prompt (copy verbatim):**

> You are `admin-coder`. Read `docs/plans/feature_verification_gate_on_leaderboard_arena_prizes.md` §4.5 and §8.5, and `docs/plans/exec_verification_gate_fulfillment_v1.md` (this file).
>
> **Task 4a — Update `RedemptionsManager.tsx`:**
>
> 1. Expand the "Pending" tab filter from `status='pending'` to `status IN ('pending', 'pending_verification')`.
> 2. Render a per‑row badge:
>    - `pending_verification` → amber badge "Needs verification" + sub‑label "Member not yet verified".
>    - `pending` + `fulfilled_at IS NULL` (for `source_type IN ('leaderboard_prize', 'arena_prize')`) → blue badge "Awaiting shipment".
>    - `pending` + `fulfilled_at IS NOT NULL` → green badge "Ready" (same as today).
>    - Store rewards (`source_type = 'reward'`) never show the fulfillment badge — they're always on hand.
> 3. When staff clicks "Confirm" on a `pending_verification` row, intercept BEFORE calling the `confirm_redemption` RPC:
>    - Show an inline banner: "This member is not yet verified. Verify identity to enable collection."
>    - CTA button: "Verify now" → opens `MemberIdentityVerifyDrawer` pre‑populated with `user_id` and `gym_id` from the redemption row.
>    - After the drawer's verify succeeds, refetch the list. The row's status will have auto‑flipped to `pending` (via the DB trigger from Phase 1), and normal Confirm will now work.
> 4. If `confirm_redemption` ever returns `VERIFICATION_REQUIRED` as an error (can happen if the user got un‑verified between list load and confirm click — see §7.4 of parent plan), surface the same inline banner and re‑offer "Verify now".
>
> **Task 4b — Server action file `lib/actions/redemption-fulfillment-actions.ts`:**
>
> Two server actions, both with explicit auth guards via `getCurrentProfile` + gym access check:
>
> ```ts
> 'use server';
>
> export async function markRedemptionFulfilled(
>   redemptionId: string,
>   notes?: string,
> ): Promise<{ success: boolean; error?: string }> {
>   // 1. Call RPC: supabase.rpc('mark_redemption_fulfilled', { p_redemption_id, p_notes })
>   // 2. On success, invoke edge function send-prize-ready-push (server‑to‑server with service role key)
>   //    — fire and forget (don't block the UI on push delivery)
>   // 3. revalidatePath of whichever page called this action
> }
>
> export async function getArenaFulfillmentManifest(
>   arenaId: string,
> ): Promise<{ success: boolean; data?: FulfillmentRow[]; error?: string }> {
>   // Wrapper around supabase.rpc('get_arena_fulfillment_manifest', { p_arena_id })
> }
> ```
>
> **Task 4c — Fulfillment view:**
>
> Create `apps/admin-panel/app/dashboard/super/arenas/[arenaId]/fulfillment/page.tsx` (Server Component with `requireSuperAdmin` guard) that renders a client component `<ArenaFulfillmentTable arenaId={id} />`.
>
> Table columns (v1 — keep it minimal):
> - Rank
> - Winner (username; full name visible only to superadmin)
> - Prize description (from `redemptions.description`)
> - Target gym (name + city if easily available)
> - Status badge (matches RedemptionsManager semantics)
> - Redemption code (monospace, can be long‑tapped to copy)
> - Actions column:
>   - If `fulfilled_at IS NULL` AND status in ('pending', 'pending_verification'): "Mark received" button → calls `markRedemptionFulfilled(redemptionId)`. Requires an optional notes textarea in a small dialog (notes max 280 chars).
>   - Else: show `fulfilled_at` formatted (e.g. "Apr 17, 2:15 PM").
> - If `confirmed_at IS NOT NULL`, show "Collected" with timestamp and hide the action.
>
> Filter chips at the top: "Awaiting shipment" | "Ready to collect" | "Collected" | "All".
>
> Also add a tab link from the existing arena detail page (whichever route shows a single arena) labelled "Fulfillment" that deep‑links here. Gate the tab so gym staff see it but only for arenas where `redemptions.gym_id` intersects their gym (RLS on `get_arena_fulfillment_manifest` already enforces scoping; just show the tab).
>
> **Task 4d — `MemberIdentityVerifyDrawer`:**
>
> After a successful verify, invalidate any React Query caches for `redemptions` (or refetch the list manually if no RQ is used). The DB trigger will have already promoted the row; we just need the UI to reflect it.
>
> **Acceptance:**
> - Pending tab in RedemptionsManager shows both `pending` and `pending_verification` rows with distinct badges.
> - Clicking Confirm on an unverified row opens the verify drawer (not the confirm dialog).
> - After verify, clicking Confirm works normally (the row is now `pending`).
> - Fulfillment view lists all winners of an arena; superadmin sees all, gym staff see only their gym's rows.
> - "Mark received" button updates the row in place without full page reload.
> - A push is fired to the winner after mark‑received (check Supabase logs).
> - No regressions in existing Redemptions confirm / cancel flows for verified users.
>
> **Report back:** files changed, screenshot of Fulfillment view, screenshot of RedemptionsManager with a `pending_verification` row.

---

## Phase 5 — `test-automation-agent`: E2E smoke suite

**Output file:** `docs/test-plans/verification_gate_fulfillment_smoke.md` + optional Playwright/Detox scripts where feasible.

**Depends on:** Phases 1–4 all merged.

**Estimated time:** 30 min (manual pass) or 2–3 h (automated, optional).

**Agent prompt (copy verbatim):**

> You are `test-automation-agent`. Read the four previous phase prompts and `docs/plans/feature_verification_gate_on_leaderboard_arena_prizes.md` §6 (acceptance criteria).
>
> Run the following **manual** smoke pass against staging (or local supabase + mobile + admin):
>
> 1. **Seed:** one unverified user `U` with a membership in Gym 1; one verified user `V` with a membership in Gym 3. An active weekly leaderboard with rewards configured at Gym 1 and Gym 3. An arena in `network` scope including Gym 1 and Gym 3 with configured prizes.
>
> 2. **Leaderboard — unverified path:**
>    - Give `U` enough drops to finish top 3 at Gym 1.
>    - Run `SELECT distribute_leaderboard_prizes('gym1_id', 'weekly', true)` (the force flag bypasses the end‑of‑period date check).
>    - ✅ Redemption row for `U` is `pending_verification`.
>    - ✅ Push received by `U` contains "Verify your membership at reception first".
>    - ✅ Mobile app shows amber badge + greyed code + Verify CTA.
>    - Staff verifies `U` from admin panel. ✅ Row auto‑flips to `pending`.
>    - Staff marks fulfilled. ✅ `U` receives the "prize ready" push.
>    - Staff confirms via code. ✅ Row becomes `confirmed`.
>
> 3. **Leaderboard — verified path (regression):**
>    - Same at Gym 3 for `V`. ✅ Zero UX change vs today. Row is `pending` from the start.
>
> 4. **Arena — global winner:**
>    - Score `U` in the arena from Gym 1 check‑ins. Score `V` from Gym 3.
>    - Finalize arena.
>    - ✅ `U`'s redemption `gym_id = Gym 1`, status `pending_verification`.
>    - ✅ `V`'s redemption `gym_id = Gym 3`, status `pending`.
>    - Open admin Fulfillment view: ✅ two rows, grouped by target gym.
>    - Staff at Gym 1 marks `U`'s row fulfilled after verifying `U`. ✅ push + collect flow works.
>    - Staff at Gym 3 marks `V`'s row fulfilled. ✅ push + collect flow works.
>
> 5. **Revocation gap (§7.4):**
>    - `V`'s row is `pending` + fulfilled. Staff un‑verifies `V` (`UPDATE gym_member_identities SET is_verified = false WHERE ...`).
>    - Staff tries Confirm via code. ✅ `confirm_redemption` returns `VERIFICATION_REQUIRED`. Admin panel surfaces Verify CTA.
>
> 6. **FitPass‑style user:**
>    - `U` opts into a second membership at Gym 3. Trains at Gym 3, earns drops, wins Gym 3 weekly leaderboard.
>    - ✅ `U` is now verified at Gym 1 (from earlier) but UNVERIFIED at Gym 3. New redemption is `pending_verification` at Gym 3 specifically. Gym 1 verification does not bleed.
>
> Output a checklist matrix (pass/fail per step) and file any defects as GitHub issues tagged `verification‑gate`.
>
> **Automated follow‑up (optional):** port steps 2, 4, 5 into a Playwright suite against the admin panel and document command in `docs/test-plans/`.

---

## Merge strategy

| PR | Contains | Reviewer | Can merge independently? |
|----|----------|----------|--------------------------|
| PR‑1 | Phase 1 migration + regenerated types | supabase‑dba + reviewer | Yes — additive, zero user‑facing impact |
| PR‑2 | Phase 2 edge functions | edge‑function‑agent + reviewer | Yes after PR‑1 — old behaviour preserved |
| PR‑3 | Phase 3 mobile | mobile‑coder + mobile‑ui‑ux | Yes after PR‑1 — if backend not yet live, app still gracefully handles old statuses |
| PR‑4 | Phase 4 admin panel | admin‑coder + reviewer | Yes after PR‑1 |
| PR‑5 | Phase 5 test plan + any Playwright scripts | test‑automation‑agent | Yes, independently |

Feature flag `ENABLE_PRIZE_VERIFICATION_GATE` — optional. The DB changes are always on; the edge function and UI can be flag‑gated if you want a soft rollout, but given the gate is a security fix, recommend **no flag** and ship straight to prod once QA passes.

## Rollback plan per PR

- PR‑1: `status = 'pending'` always can be forced by reverting the CASE in `distribute_leaderboard_prizes` and `finalize_arena` without dropping columns. No schema down‑migration required for v1.
- PR‑2: revert to previous edge function version; push copy falls back to old messages.
- PR‑3: revert mobile PR; app treats unrecognised status as `pending` (test 6 in Phase 5 confirms this).
- PR‑4: revert admin PR; RedemptionsManager shows `pending_verification` rows as plain `pending` (harmless since DB still blocks confirm).

## What we're deliberately NOT doing in this ship

Per parent plan §§ 7.3, 8.4, 8.8:
- No per‑prize `fulfillment` types in the `sweat_arenas.prizes` JSONB (all v1 arenas are implicitly `at_winner_gym`).
- No sponsor manifest email automation (ops sends manually).
- No mobile "enter shipping address" UX (Model C deferred).
- No `membership_source` column on `gym_member_identities`.
- No superadmin force‑confirm bypass.
- No mass fix of historically un‑verified prize rows already handed out.

All of these are tracked in the parent plan's Open Questions (§9) and can be scheduled after v1 has been in prod for 2+ weeks.
