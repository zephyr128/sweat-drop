# Plan: Verification Gate on Leaderboard & Arena Prizes

**Created:** 2026‑04‑17
**Owners:** `supabase-dba`, `edge-function-agent`, `mobile-coder`, `admin-coder`
**Related:** [`docs/plans/feature_verification_gate_on_redemption.md`](feature_verification_gate_on_redemption.md)
**Priority:** P1 (open loophole — unverified fake accounts can drain prize inventory)

---

## 1. Problem

Store rewards are already gated: `claim_reward()` returns `VERIFICATION_REQUIRED` if the user has no verified row in `gym_member_identities`. Mobile app catches this error and opens the "visit reception" prompt.

Leaderboard prizes and arena prizes bypass this entirely. The flows are:

- **Leaderboard** (`distribute_leaderboard_prizes` RPC, called by `distribute-leaderboard-prizes` edge function on weekly/monthly cron):
  - Ranks top N users → creates `redemptions` rows (`source_type='leaderboard_prize'`, `status='pending'`, 4‑char code, 30‑day expiry) → pushes notification with code.
- **Arena** (`finalize_arena` RPC, called by `finalize-arena` edge function when an arena's `end_date` passes):
  - Ranks participants → creates `redemptions` (`source_type='arena_prize'`, same status + code + expiry) → pushes notification with code.

Neither path checks `gym_member_identities.is_verified`. An unverified user (or pure fake account) can:
1. Earn drops via fake / unverified check‑ins.
2. Reach top 3 of the weekly leaderboard.
3. Receive a legit redemption code via push.
4. Show the code at the desk. Staff may or may not verify identity before handing over the physical prize.

## 2. The asset we already have

`gym_member_identities (gym_id, user_id, is_verified, external_membership_id, verified_by, verified_at)` with unique `(gym_id, user_id)`. Staff verify via `verify_member_identity` RPC which also stamps the external membership ID (the physical gym card number). That one row IS the "this app user = this real gym member" link — exactly what the user's question is asking about.

So the "ko je taj korisnik vezan za membership" is answered by a trivial check (same query `claim_reward` already does):

```sql
EXISTS (
  SELECT 1 FROM public.gym_member_identities
  WHERE user_id = :uid AND gym_id = :gym AND is_verified = true
)
```

No new table, no new column. The only question is **where** in the prize pipeline to apply it.

## 3. Four gating options

### Option 1 — Participation gate (block leaderboard/arena entry for unverified users)

Prevent unverified users from appearing on leaderboards or opting into arenas at all.

| Pros | Cons |
|------|------|
| No wasted inventory. | Massive UX cost — new member can't see their rank until reception opens. |
| Prize pool is clean. | Breaks the engagement loop (drops earned but invisible). |
| | Unaligned with store reward philosophy ("earn freely, verify only at value extraction"). |

**Verdict:** too heavy, reject.

### Option 2 — Distribution gate (skip unverified at prize creation time)

In `distribute_leaderboard_prizes` and `finalize_arena`, skip the `INSERT INTO redemptions` for unverified users. Two sub‑variants:

- **2a. Skip + promote** — if #1 is unverified, #2 takes the gold prize, #3 takes silver, #4 takes bronze. Clean but feels unfair to whoever *would* have placed and is unverified for benign reasons.
- **2b. Skip + void** — #1 unverified → just no prize for that slot. Inventory saved. Most punitive.

Either way: user receives NO push notification, never sees a code, and likely has no idea why they "didn't win" despite being on top. Support burden.

**Verdict:** good security, bad UX. Skip unless user chooses strict.

### Option 3 — Collection gate (block `confirm_redemption` at the desk) — DEFENSE IN DEPTH ONLY

Let the distribution run exactly as today. When staff scans the code at the desk and calls `confirm_redemption`, that RPC checks `is_verified` and refuses if false, returning `VERIFICATION_REQUIRED`. Admin panel UI shows a prompt: "This user is not verified. Verify now via the identity drawer?" — staff verifies on the spot using the existing `verify_member_identity` drawer.

| Pros | Cons |
|------|------|
| Zero changes to distribution code. | User already received a push with a code — mild disappointment if they show up and can't collect without ID. |
| Mirrors real‑world gym flow — staff is *already* looking at the person. | If staff forgets the verification step (just marks confirmed), the gate is useless. |
| Existing `verify_member_identity` RPC + drawer is reusable. | |

**Verdict:** necessary belt‑and‑suspenders, but insufficient on its own because it depends on staff discipline.

### Option 4 — Hybrid: distribution flags + confirmation gate (RECOMMENDED)

Combine 2 and 3 with a softer distribution behaviour.

- At **distribution time**, still create the redemption row for unverified winners, but with a new status `pending_verification` (or add a boolean `requires_verification` column — see §4.1 for trade‑off). Push notification goes out with a **different copy**: "You won #1 at [Gym]! Verify your membership at reception first, then collect with code `AB12`."
- At **confirmation time** (`confirm_redemption`), reject if user is not verified, regardless of source. `pending_verification` redemptions cannot be confirmed at all until verified.
- Once a user gets verified (via `verify_member_identity`), a trigger flips their `pending_verification` redemptions to plain `pending`, so the next time they come to the desk staff can confirm normally.

| Pros | Cons |
|------|------|
| User sees the win → strongest possible "verify" nudge. | One extra status + one trigger. |
| No skipped / reshuffled leaderboard ranks. | Slightly more UI copy to maintain. |
| Defense in depth — even if staff skips verification at desk, `confirm_redemption` still blocks. | |
| Inventory is still "earmarked" for the rightful winner, not wasted or redistributed. | |
| Uses `external_membership_id` stamped at verification time as the audit link to the physical card. | |

**Verdict: this is the "best and simplest" answer to the user's question.**

## 4. Recommended implementation (Option 4)

### 4.1. Minimal schema change

Two paths, pick one:

**Path A — new status value** (`pending_verification`):
```sql
-- No structural change; redemption.status is TEXT (or enum — check).
-- If enum: ALTER TYPE redemption_status ADD VALUE 'pending_verification';
```
- Pros: self‑describing. Existing UIs that filter by `status='pending'` won't show these (deliberate — they're not claimable yet).
- Cons: must audit every `status IN ('pending', ...)` filter site to decide whether it should include the new value.

**Path B — new boolean `requires_verification` on `redemptions`**:
```sql
ALTER TABLE public.redemptions
  ADD COLUMN IF NOT EXISTS requires_verification BOOLEAN NOT NULL DEFAULT false;
```
- Pros: zero impact on existing status queries; orthogonal dimension.
- Cons: two flags to keep in sync. Risk of drift (`status='confirmed' AND requires_verification=true` is a bug class).

**Recommendation: Path A** — status change is semantically correct and forces the codebase to explicitly decide what to do with these rows. Lower drift risk long‑term.

### 4.2. Migration `YYYYMMDDHHMMSS_gate_prize_distribution_on_verification.sql`

```sql
-- 1. Extend status enum (if using enum; otherwise skip)
-- ALTER TYPE public.redemption_status ADD VALUE IF NOT EXISTS 'pending_verification';

-- 2. Helper: is_member_verified
CREATE OR REPLACE FUNCTION public.is_member_verified(p_user_id UUID, p_gym_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.gym_member_identities
    WHERE user_id = p_user_id AND gym_id = p_gym_id AND is_verified = true
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_member_verified(UUID, UUID) TO authenticated, service_role;

-- 3. Patch distribute_leaderboard_prizes: use 'pending_verification' status when
--    user isn't verified. Keep the code + push, change copy.
-- (Re-declare the function body with the status expression:
--    CASE WHEN is_member_verified(u, g) THEN 'pending' ELSE 'pending_verification' END)

-- 4. Patch finalize_arena similarly.

-- 5. Patch confirm_redemption to refuse when row is pending_verification,
--    returning 'VERIFICATION_REQUIRED' for UI pattern-match parity with claim_reward.

-- 6. Trigger: when gym_member_identities.is_verified flips to true,
--    flip all that user's pending_verification redemptions for that gym to 'pending'.
CREATE OR REPLACE FUNCTION public.promote_pending_verification_redemptions()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_verified = true AND (OLD.is_verified IS DISTINCT FROM true) THEN
    UPDATE public.redemptions
      SET status = 'pending', updated_at = NOW()
      WHERE user_id = NEW.user_id
        AND gym_id  = NEW.gym_id
        AND status  = 'pending_verification';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_promote_pending_verification_redemptions
  AFTER INSERT OR UPDATE ON public.gym_member_identities
  FOR EACH ROW EXECUTE FUNCTION public.promote_pending_verification_redemptions();
```

### 4.3. Edge function changes

`distribute-leaderboard-prizes/index.ts`:
- After fetching the freshly created redemptions, branch push copy on `status`:
  - `pending` → existing "Show code `AB12` at the desk to collect your prize 🎁".
  - `pending_verification` → "You won! Visit reception to verify your membership, then come back with code `AB12` to collect your prize."
- Push `data` payload adds `requires_verification: "true"` so the mobile deep‑link can open the verification prompt immediately.

`finalize-arena/index.ts`:
- Identical treatment for arena winners.

### 4.4. Mobile app changes

`apps/mobile-app/lib/security/reward-claim-errors.ts`:
- Already has `'verification_required'` classifier — reuse as‑is when `confirm_redemption` fails (currently only the admin panel calls this, but if mobile ever does, the hook is ready).

`apps/mobile-app/app/redemptions.tsx` (and detail screen, whichever shows a code card):
- When `redemption.status === 'pending_verification'`, show a distinct state:
  - Badge: "Verify at reception" (yellow/orange, not green).
  - Banner: "Visit reception with your ID. After verification, this prize becomes collectible."
  - Hide the "Show code" button OR keep the code visible but append the verify reminder below it.
- On deep‑link from push (`requires_verification=true`), auto‑scroll/highlight the prize card and optionally open the identity info modal ("What to bring").

i18n keys (EN + SR) under `locales/*/rewards.json` or `locales/*/redemptions.json`:
- `status.pendingVerification.badge` — "Verify at reception" / "Verifikujte na recepciji"
- `status.pendingVerification.body` — copy above
- `push.leaderboardPrize.unverified.title` — "🏆 You won — verify to collect!"
- `push.leaderboardPrize.unverified.body` — copy above
- Same block for arena prizes.

### 4.5. Admin panel changes

`apps/admin-panel/components/modules/RedemptionsManager.tsx` (or equivalent):
- Filter `status IN ('pending', 'pending_verification')` for the "pending" tab (both count as "awaiting action").
- Column / badge to distinguish the two states.
- On the code lookup / confirm flow, when `find_redemption_by_code` returns a `pending_verification` row:
  - Show "Member is not verified" banner.
  - CTA: "Verify identity" → opens existing `MemberIdentityVerifyDrawer`.
  - After verification save succeeds, the trigger from 4.2 step 6 flips the status; refetch and allow confirm.

No changes needed to `verify_member_identity` RPC, `MemberIdentityVerifyDrawer`, or store reward flow — they already work.

## 5. Rollout

| # | Task | Owner | Est. |
|---|------|-------|------|
| 1 | Migration (helper fn, patch distribute/finalize with membership‑aware gym fallback, patch confirm with live verification re‑check, trigger) | `supabase-dba` | 2–3 h |
| 2 | Regenerate types, update edge functions (push copy + data) | `edge-function-agent` | 1 h |
| 3 | Mobile UI for `pending_verification` + i18n | `mobile-coder` | 2–3 h |
| 4 | Admin panel RedemptionsManager UI + verify‑inline CTA | `admin-coder` | 1–2 h |
| 5 | End‑to‑end test on staging: unverified user wins, gets push, can't collect, staff verifies, can collect | all | 30 min |

Ship behind a feature flag `ENABLE_PRIZE_VERIFICATION_GATE`:
- Migration is safe (new status only affects new rows).
- Edge function reads flag from env and decides status/copy.
- Allows a 1‑week canary with a handful of gyms.

## 6. Acceptance criteria

- Unverified user lands #1 on weekly leaderboard → receives push with verify‑first copy, sees a `pending_verification` prize card in app, cannot show a collectible code yet (or code is shown greyed with "verify first" hint — product decision, document once).
- Staff verifies the user via existing drawer → `is_verified` flips → trigger auto‑promotes the redemption to `pending` → user's prize card now shows normal "Show code at desk" state.
- Unverified user wins arena prize → identical flow.
- Staff tries `confirm_redemption` on a `pending_verification` row → RPC returns `VERIFICATION_REQUIRED` → admin panel surfaces the Verify drawer.
- Verified user flows (99% of cases) are **completely unchanged** — same push copy, same code, same "Show at desk" button, same confirm. No regressions in existing redemption UX.
- `get_my_leaderboard_prizes` RPC returns both `pending` and `pending_verification` so history shows the win, not silently hidden.

## 7. Multi‑gym realities: FitPass and global arenas

Two scenarios need explicit answers before this ships. Good news: **the existing data model already handles both correctly**. We just need to document the behaviour and close one small hole in `finalize_arena`.

### 7.1. FitPass / multi‑gym users

A FitPass member can train at many participating gyms. The current model does exactly the right thing:

- `gym_memberships` has one row **per (user, gym)** — each gym gets its own `local_drops_balance`, so a FitPass user accrues drops independently at each venue they visit.
- `gym_member_identities` has one row **per (user, gym)** with its own `is_verified` flag and `external_membership_id`. Each gym's reception verifies that person ONCE, the first time they show the FitPass card there.
- The UNIQUE index is `(gym_id, external_membership_id)` *partitioned per gym*, so the same FitPass number can live in N rows (one per gym) without collision.
- Leaderboards are gym‑scoped (`get_leaderboard('gym', p_gym_id, ...)`). Check‑ins at Gym A count toward Gym A's leaderboard only.
- Arena scoring joins `sessions.gym_id = arena_participants.gym_id` — so the participant's "home leg" of the arena is what counts, not cross‑gym activity.
- Every prize row written to `redemptions` has a concrete `gym_id`. That's the venue where the user collects and — per this plan — where they must be verified.

**Net effect for a FitPass user:**
- Wins weekly leaderboard at Gym A → prize at Gym A → verify at Gym A (once, ever).
- Next month wins at Gym B → prize at Gym B → verify at Gym B (once, ever, independently).
- If they never train at Gym C, there's no prize at Gym C, so verification there is never needed.

This is intentional and matches the real‑world workflow: each gym's reception is the authority for "is this a legit member here" — FitPass card or direct membership or otherwise. No cross‑gym "master verification" record is needed.

**Optional nice‑to‑have (not blocking):**

```sql
ALTER TABLE public.gym_member_identities
  ADD COLUMN IF NOT EXISTS membership_source TEXT
  CHECK (membership_source IN ('direct', 'fitpass', 'multipass', 'classpass', 'other'));
```

Useful for reports ("X% of our verified members are FitPass") and for the reception UI to show the card type. Can be added later without affecting the gate logic.

### 7.2. Global arenas (`arena_scope='network'` or `'regional'`)

A network arena can include many gyms; the user competes while checking in at whichever of those gyms they train at. When they win, one question matters: **which gym hosts the prize collection?**

Look at how `finalize_arena` already resolves this (migration `20260304000010`):

1. `arena_participants.gym_id` — the gym they **opted in from** (current behaviour: set when they tap Join from a specific gym context).
2. If NULL → `profiles.home_gym_id`.
3. If still NULL → first gym from `arena_gyms`.
4. Else → raise exception.

Step 1 is correct in 99% of cases. Steps 2 and 3 have a latent bug: the fallback can end up picking a gym where the user has **no membership**, which would produce a "dead" prize — a redemption the user can never collect because they're not a member there and can never be verified.

**Tightening patch** (to apply as part of this plan's migration):

```sql
-- In finalize_arena, replace the two fallback branches with:

-- 2. Try home_gym_id, but only if that gym is actually in this arena AND user is a member
SELECT p.home_gym_id INTO v_user_gym_id
FROM public.profiles p
JOIN public.arena_gyms ag  ON ag.arena_id = p_arena_id AND ag.gym_id = p.home_gym_id
JOIN public.gym_memberships gm ON gm.gym_id = p.home_gym_id AND gm.user_id = v_winner.user_id
WHERE p.id = v_winner.user_id;

-- 3. Else pick any arena gym where the user IS a member (not just any arena gym)
IF v_user_gym_id IS NULL THEN
  SELECT ag.gym_id INTO v_user_gym_id
  FROM public.arena_gyms ag
  JOIN public.gym_memberships gm ON gm.gym_id = ag.gym_id AND gm.user_id = v_winner.user_id
  WHERE ag.arena_id = p_arena_id
  ORDER BY gm.created_at ASC   -- deterministic: oldest membership wins
  LIMIT 1;
END IF;

-- 4. Else raise (unchanged; means the user was scored but isn't a member anywhere in the arena —
--    usually impossible, but if it happens we want loud failure, not a dead prize)
```

This guarantees `redemptions.gym_id` is always a gym where the winner **can** be verified. The verification gate then works without special‑casing.

**Behavioural summary:**

| Scenario | Winner's prize gym | Where to verify |
|----------|---------------------|-----------------|
| Local arena (1 gym) | That gym | That gym |
| Regional arena, user opted in from Gym B | Gym B | Gym B |
| Network arena, user's `home_gym_id` is in `arena_gyms` | Home gym | Home gym |
| Network arena, home gym NOT in `arena_gyms`, user member of two participating gyms | Oldest membership | That gym |
| FitPass user on network arena, opted in from Gym A | Gym A | Gym A |

### 7.3. Sponsor‑shipped arena prizes (future)

If a future sponsor arena ships a physical prize directly (e.g. a jersey mailed by the sponsor instead of picked up at reception), the `redemptions.gym_id` becomes more of an audit trail than a collection point. The verification gate still adds value (proves the winner is a real gym member, not a fake account farming drops). The simplest interpretation: **verification at ANY participating gym unlocks the prize**. Implement as a separate RPC (`confirm_sponsor_shipped_prize`) when that feature arrives; it's out of scope for this plan.

### 7.4. Edge case: verified user later loses verification

A gym could un‑verify a member (fraud discovered after the fact, member canceled subscription). Today `gym_member_identities.is_verified` can be flipped back to `false` by staff. If that happens between distribution and collection:

- A `pending_verification` row stays `pending_verification` (fine).
- A `pending` row created before un‑verification stays `pending` — `confirm_redemption` will still allow it unless we also add a runtime check.

**Recommendation:** in `confirm_redemption`, re‑check `is_verified` at confirm time regardless of status. If the user is no longer verified, return `VERIFICATION_REQUIRED`. This closes the revocation gap. Cheap: one extra `EXISTS` query per confirm call.

### 7.5. Edge case: gym withdraws from arena after user wins

`withdraw_gym_from_arena` exists (migration `20260306000005`). If it runs between distribution and collection, the winner's prize still points at the withdrawn gym. Staff there may refuse to honour it.

**Recommendation:** don't solve here. Operational: gyms should not withdraw mid‑arena. If they do, superadmin support is the path, and this edge case is rare enough to not warrant code.

## 8. Prize fulfillment for multi‑gym arenas (NEW — answers "where does the physical prize go?")

### 8.1. Current gap

Today `finalize_arena` just creates a `redemptions` row with a code and a description like `"Arena Prize: Sweat Arena 2026 #1 – 3‑month Elite membership"`. **Nobody physically has the prize.** There is:
- no inventory tracking,
- no shipment,
- no "prize has arrived at the gym" signal,
- no sponsor‑facing manifest.

The code is an IOU. Ops teams currently resolve this out‑of‑band via email/Slack.

The original plan (`phase3_audit_and_arenas_plan.md` §4) said winners "claim prizes at the sponsor's location" — but the implementation writes `redemptions.gym_id = winner's gym`, which implicitly assumed "collect at the winner's gym". These two models contradict. We need to pick one and build the missing plumbing.

### 8.2. Concrete scenario (your question)

Network arena, 5 participating gyms (Gym 1…Gym 5), sponsor = "Brand X":
- Winner A (rank 1): member of **Gym 1**
- Winner B (rank 2): member of **Gym 3**

Question: where do the prizes go, and how does the collection happen?

### 8.3. Four fulfillment models

| Model | Description | Sponsor effort | Winner UX | Verification fit |
|-------|-------------|----------------|-----------|------------------|
| **A — Winner's own gym (recommended default)** | Sponsor ships one prize to each gym that has a winner. Reception holds it until winner arrives with code. | Ship to 1–3 gyms/arena (top 3) | Excellent — go to familiar gym | Perfect — existing verify‑at‑desk flow |
| **B — Single host location** (SweatDrop HQ or designated sponsor store) | All prizes ship to one place; winners travel there | Simplest for sponsor | Bad — may not be near user | Needs "verify at host" flow |
| **C — Direct‑to‑winner shipping** | Sponsor ships to winner's home address | High (address collection, per‑winner shipping) | Best for physical prizes | Weak — verifier is postman; still need app‑side verify to prove winner isn't a fake |
| **D — Digital prize** | Prize is a code/voucher/credit; redemption code itself IS the prize | Zero | Instant | Verification irrelevant (nothing physical) |

### 8.4. Recommended default: **Model A** with optional per‑prize override

The existing code behaviour already implements Model A by accident. We formalize it:

1. **Default behaviour** (no schema change): `finalize_arena` sets `redemptions.gym_id = winner's gym` (with the membership‑aware fallback patch from §7.2). Winner A's prize sits at Gym 1; Winner B's at Gym 3. Each gym's reception hands it over with the existing verify‑at‑desk flow.

2. **Optional per‑prize override** (schema extension, ship when needed):
   ```jsonc
   // sweat_arenas.prizes (existing JSONB array)
   [
     {
       "rank": 1,
       "prize": "Free 3-month membership at Elite Fitness",
       "value": "€120",
       "fulfillment": "at_winner_gym"          // default, can omit
     },
     {
       "rank": 2,
       "prize": "Nike gift card",
       "value": "€60",
       "fulfillment": "at_specified_gym",
       "fulfillment_gym_id": "<uuid of sponsor flagship gym>"
     },
     {
       "rank": 3,
       "prize": "Sponsor T-shirt",
       "value": "€15",
       "fulfillment": "shipped_to_winner"
     },
     {
       "rank": 4,
       "prize": "10% off at sponsorshop.rs",
       "fulfillment": "digital_code",
       "digital_code": "SWEAT10"
     }
   ]
   ```

   `finalize_arena` reads `fulfillment` and branches:
   - `at_winner_gym` (or absent) → existing behaviour, `redemptions.gym_id = winner's gym`
   - `at_specified_gym` → `redemptions.gym_id = fulfillment_gym_id`
   - `shipped_to_winner` → `redemptions.gym_id = winner's gym` (still used for verification), status = `pending_address`, mobile app prompts for shipping address before confirming; sponsor ships directly
   - `digital_code` → `redemptions.status = 'confirmed'` immediately, `description` contains the digital code; no desk visit needed (still keep verification gate to prevent fake‑account farming)

### 8.5. Missing plumbing to add (Model A minimum)

Three tiny additions. None change the default flow for gyms/users; all are additive.

**a. `redemptions.fulfilled_at TIMESTAMPTZ NULL`** — marks "sponsor delivered this prize to the gym; gym staff confirmed it's physically on hand". Separate from `status`.

```sql
ALTER TABLE public.redemptions
  ADD COLUMN IF NOT EXISTS fulfilled_at   TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS fulfilled_by   UUID NULL REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS fulfillment_notes TEXT NULL;
```

A `pending` prize becomes collectible only when `fulfilled_at IS NOT NULL` (or source_type = 'reward', since store rewards are always on hand). Mobile card copy adjusts:
- `fulfilled_at IS NULL` → "Prize is on the way. You'll be notified when it's ready to collect."
- `fulfilled_at IS NOT NULL` → existing "Show code at desk".

Optional second push notification when gym marks it fulfilled: "🎁 Your prize has arrived at Gym 3 — come pick it up!".

**b. Admin "Prize Fulfillment Manifest" view**

New page in admin panel: `apps/admin-panel/app/dashboard/super/arenas/[arenaId]/fulfillment/page.tsx`.

For superadmin + gym staff:
- Table: winner name (contact details for superadmin only), rank, prize description, target gym, status (`awaiting_shipment` / `fulfilled` / `collected`), shipped_at, fulfilled_at, collected_at.
- Grouped by target gym: "Gym 1 needs: 1× 3‑month membership voucher. Gym 3 needs: 1× Nike gift card."
- Actions (gym staff, scoped to their gym):
  - "Mark prize received" → sets `fulfilled_at` + `fulfilled_by` → triggers the optional push.
- Actions (superadmin only):
  - "Export manifest as CSV" → ship list for the sponsor.
  - "Email sponsor manifest" → uses `sweat_arenas.sponsor_contact_email` to auto‑send a PDF/CSV with ship‑to addresses and reference codes (the redemption code becomes the SHIPPING REFERENCE so the package label ties back to the winner/code).

**c. Sponsor email template**

New Edge Function `send-sponsor-fulfillment-manifest/index.ts` (triggered by `finalize-arena` after it writes winners, or manually from admin UI):
- Subject: `"[SweatDrop] Arena X finalized — 3 prizes to ship"`
- Body: per‑prize rows with {rank, prize name, winner name (first name + initial), target gym name + address, reference code `REF:A1B2`}
- Privacy: surname/phone NOT included by default; sponsor only gets what they strictly need for shipping.

### 8.6. Your scenario — step by step with Model A + this plumbing

Sunday 23:00: arena ends.
Sunday 23:05: cron fires `finalize-arena` edge function.
- Creates 2 redemptions:
  - Winner A: `gym_id = Gym 1`, status = `pending_verification` (if unverified) or `pending` (if verified), code `AB12`, `fulfilled_at = NULL`
  - Winner B: `gym_id = Gym 3`, same treatment, code `CD34`
- Pushes go out to winners with appropriate copy from §4.3.
- Edge function also calls `send-sponsor-fulfillment-manifest` → sponsor gets email:
  > Arena X finalized on 2026‑04‑19. Please ship the following by 2026‑04‑26:
  > - Rank 1 prize to **Gym 1, Bulevar Vojvode Mišića 13, Beograd** — ref `AB12`
  > - Rank 2 prize to **Gym 3, Takovska 45, Beograd** — ref `CD34`

Within a few days: sponsor ships. Courier delivers to each gym.
- Gym 1 staff opens admin panel → Fulfillment tab → sees "AB12 — 3‑month membership — awaiting" → marks "received". Row flips to `fulfilled_at = now()`. Optional push to winner A: "Your prize is ready at Gym 1."
- Gym 3 same flow for `CD34`.

When Winner A visits Gym 1:
- (If unverified) staff verifies them via existing `MemberIdentityVerifyDrawer` → trigger flips `pending_verification` → `pending`.
- Staff scans/types code `AB12` → `confirm_redemption` checks live verification (§7.4) + checks `fulfilled_at IS NOT NULL` → returns OK → staff hands over the membership voucher.
- Redemption row: `status = 'confirmed'`, `confirmed_at = now()`.

Same for Winner B at Gym 3, independently.

### 8.7. What if a winner moves / stops training?

If Winner A hasn't trained at Gym 1 in 60 days but wins the arena from sessions logged before they stopped, the prize still sits at Gym 1. They have a 30‑day pending window to claim. If they don't, redemption expires, sponsor (or superadmin) can decide whether to repurpose the inventory. Document in operational runbook; no special code.

### 8.8. Scope decision for this plan

**Minimum viable ship (recommended):**
- All changes from §§ 2–7 (the verification gate).
- §8.5 (a): add `fulfilled_at`, `fulfilled_by`, `fulfillment_notes` columns.
- §8.5 (b): bare‑bones Fulfillment view — just a table with "Mark received" button. No CSV export, no auto‑email (ops team handles sponsor email manually for v1).
- Keep fulfillment types from §8.4 as a **follow‑up** plan. Default to Model A for all current and upcoming arenas.

**Follow‑up (v2):**
- JSONB schema for per‑prize `fulfillment` types (supports sponsor‑location, shipped‑to‑winner, digital).
- `send-sponsor-fulfillment-manifest` edge function + email template.
- CSV export, print labels.
- Mobile UI for "enter shipping address" if we ever need Model C.

This keeps the critical path (verification + single gym collection) ship‑able in 1–2 days and defers the logistics automation until sponsors actually demand it.

## 9. Open questions for the product owner

1. **Should the code be visible on a `pending_verification` card, or hidden until verified?**
   - *Recommendation: visible but disabled/greyed, with verify CTA beside it. Drives verification without feeling like the win was "taken away".*
2. **Grace window:** how long can a `pending_verification` prize sit before auto‑expiring? Current pending lifetime is 30 days. Suggest **same 30 days** — no special treatment. If user never verifies, the prize just expires like any unclaimed pending.
3. **Staff override:** should a gym_owner/admin be able to force‑confirm without verification in edge cases (system error, known member, etc.)? Currently no — `confirm_redemption` has no bypass. Suggest **no override initially**, revisit if support tickets pile up.
4. **Notification to "next in rank" when #1 is unverified:** NO. We're not redistributing; we're holding. If verification never happens, inventory returns to pool via expiry, not via promotion. Simpler, fair, and avoids a second notification storm.
5. **Historical rows** (already‑issued unverified prizes): leave untouched. Add a one‑off admin dashboard query to list them so staff can reach out manually if desired. Don't mass‑update.

---

## TL;DR (Serbian, for the original question)

Da, treba gate‑ovati i leaderboard i arena. Najjednostavnije i najbezbednije rešenje:

1. **Isti trigger kao za store (`gym_member_identities.is_verified`)** — nema nove tabele, koristi isti "ko je real gym member" zapis koji recepcija već popunjava kad verifikuje osobu (stamp‑uje joj i `external_membership_id`, tj. broj fizičke članske kartice).
2. **Novi status `pending_verification`** — kad neverifikovani korisnik osvoji nagradu, redemption se i dalje kreira (da vidi win), ali status je `pending_verification` umesto `pending`. Push ima drugačiji tekst: "Verifikuj se na recepciji pa se vrati po nagradu".
3. **Auto‑promote trigger** — čim osoblje verifikuje korisnika u admin panelu (već postoji `verify_member_identity` RPC i drawer), trigger automatski flipuje sve njegove `pending_verification` redemption‑e u `pending` → sledeći dolazak na recepciju radi normalno.
4. **Defense in depth na `confirm_redemption`** — vraća `VERIFICATION_REQUIRED` ako je korisnik neverifikovan, bez obzira na source_type (`leaderboard_prize`, `arena_prize`, `reward`). Admin panel pokazuje Verify CTA odmah. Čak i ako osoblje zaboravi da proveri, sistem ih tera.

Rezultat: verifikovani useri vide **nulta** promene. Neverifikovani dobijaju gentle push ka recepciji, dok zadržavaju pravo na nagradu koju su zaslužili. Inventar je siguran — nagrada se nikad ne izdaje fizički bez provere da je osoba pravi član.

### FitPass korisnici
Verifikacija je **per‑gym** (već ovako radi u modelu). FitPass user koji trenira u 3 teretane ima 3 nezavisna `gym_memberships` zapisa i, tek kad osvoji nagradu na nekoj od njih, mora se verifikovati **jednom** na toj teretani. Ne treba "master verifikacija" preko svih FitPass lokacija. Isti FitPass broj može da se upiše kao `external_membership_id` u više zapisa bez konflikta — `UNIQUE(gym_id, external_membership_id)` je particionisan po gymu.

### Globalne arene (`arena_scope='network'`)
Svaka nagrada je i dalje vezana za **tačno jedan gym** preko `redemptions.gym_id`. Redosled rezolucije u `finalize_arena`:
1. Teretana iz koje je user opt‑inovao u arenu (`arena_participants.gym_id`).
2. `profiles.home_gym_id` — **ali samo ako je taj gym u `arena_gyms` i user je tu član** (dopuna koju ovaj plan unosi; trenutno ta provera nedostaje i može napraviti "mrtvu" nagradu).
3. Fallback: bilo koji `arena_gyms` gde je user član, najstarija članstva prvo.

Znači: globalna arena = user se verifikuje u onoj teretani gde je prijavljen kao učesnik (najčešće home gym). Ne u svim teretanama, ne u sedištu sponzora — samo na jednom mestu gde ima pravog člana.
