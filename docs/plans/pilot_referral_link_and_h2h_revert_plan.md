# Pilot Plan: Revert Head-to-Head + Referral Join Link Flow

## Context

Pilot scope needs to be simpler and conversion-focused:

1. **Disable head-to-head friend challenges** for pilot (not needed, high complexity/noise).
2. **Redesign Invite Friend** to use a shareable join URL:
   - `https://sweat-drop.com/join/<CODE>`
3. Landing join page should explain the flow clearly and route users to app stores.
4. Referral reward logic must be based on **real gym behavior**, not clicks:
   - Referrer reward only after referred user completes **first QR check-in at gym**
   - Referred user gets onboarding bonus once (same verified check-in event)
   - Monthly payout cap for referrer: `5` successful payouts
5. Strong anti-abuse and clear in-app status timeline.

---

## Dependencies

- Existing referral migrations and RPCs:
  - `20260327150000_referrals_and_friend_challenges_mvp.sql`
  - `20260327160000_referral_timeline_support.sql`
- Existing mobile social screens:
  - `apps/mobile-app/app/invite-friend.tsx`
  - `apps/mobile-app/app/challenge-friend.tsx`
- Landing app routing ready for new public route:
  - `apps/landing-page/app/`
- Production env split and release policy already in place.

---

## Product Decisions (Locked for Pilot)

1. **Head-to-head is OFF in pilot** (UI hidden, no user entry points).
2. **Invite sharing is unlimited**, but reward payouts are capped.
3. **Referrer payout trigger:** referred user completes first QR check-in at gym.
4. **Verification requirement (mandatory):** referred user must be verified (`gym_member_identities.is_verified = true`) at the moment of qualifying check-in.
5. **Referrer monthly reward cap:** max `5` completed+payout-eligible referrals per calendar month.
6. **Referred bonus:** one-time `+100` drops on first verified check-in.
7. **Referrer reward:** `+150` drops per qualified referral (if under monthly cap).
8. **No redemption prerequisite** and **no workout prerequisite** for referral rewards.
9. Referral expires after `30 days` if no qualification.

---

## Workspace Assignment

- `supabase-dba`: referral lifecycle, caps, anti-abuse, RPC contracts
- `mobile-coder`: invite UX, deep-link handling, auto-apply flow, hide head-to-head
- `landing-page-coder`: `/join/[code]` page, store CTAs, deferred code persistence
- `admin-coder`: optional read-only referral KPI card (pilot monitoring), no new complex UI
- `reviewer`: end-to-end validation and regression guard

---

## Data Model Changes (supabase-dba)

## 1) Keep friend challenge schema, disable for pilot

No destructive rollback of `friend_challenges` tables during pilot.

Add a pilot feature flag strategy (DB-backed preferred):
- Option A: `public.app_runtime_flags` with key/value (`friend_challenges_enabled=false`)
- Option B: gym-scoped flag in existing config table

## 2) Referral lifecycle hardening

Ensure `referrals` supports:
- `status` timeline: invited/joined/qualified/rewarded/expired/blocked (can be derived from existing statuses if needed)
- `expires_at` default `NOW() + INTERVAL '30 days'`
- explicit timestamps for:
  - `joined_at`
  - `qualified_checkin_at`
  - `qualified_verified_at` (new if missing; verification satisfied at qualification moment)
  - `rewarded_at`
- cap metadata:
  - `reward_block_reason` (e.g. `monthly_cap_reached`)
  - `monthly_cap_count_at_completion` (optional audit)

## 3) Reward trigger logic

Implement/adjust one server-side function that runs on first qualifying check-in:
- checks pending referral for referred user
- checks referred user identity verification (`gym_member_identities.is_verified = true`)
- marks referral as completed state
- grants referred bonus once
- grants referrer reward only if monthly completed rewarded count `< 5`
- logs non-payout completion when cap reached

## 4) Anti-abuse checks

At minimum:
- self-referral block (`referrer_user_id != invitee_user_id`)
- duplicate-invitee protection (one invitee cannot generate multiple rewards)
- device-hash conflict checks using existing mobile `x-sweatdrop-device-hash` signal
- optional gym-membership validation for both sides when payout executes

---

## API Contracts

## 1) Join/link contracts

- `create_referral_invite(p_gym_id)` returns:
  - `invite_code`
  - `join_url` (`https://sweat-drop.com/join/<code>`)
  - `deep_link` (`sweatdrop://join/<code>`)

## 2) Code apply contracts

- `apply_referral_code(p_invite_code, p_gym_id)` returns:
  - `success`
  - `status` (`joined`, `blocked`, `expired`, etc.)
  - `message`
  - `joined_at`

## 3) Timeline contracts

- `get_my_referrals(p_gym_id)` returns list with computed timeline state:
  - invited, joined, first_checkin, verified_checkin, rewarded, expired
- `get_referral_timeline(p_referral_id)` remains detailed source for one referral row

## 4) Head-to-head gate contracts

- Runtime flag API/read path:
  - mobile can read whether friend-challenges are enabled
  - default false in pilot

---

## Execution Plan

## Step 1 — DBA (referral logic + cap + anti-abuse)

1. Add migration for referral completion rules:
   - first verified check-in trigger state/timestamp
   - monthly cap (`5`)
   - payout reason audit fields
2. Patch referral RPCs to return join/deep-link friendly payload.
3. Add/patch RPC for leaderboard-safe referral stats summary (for invite screen KPI cards).
4. Add feature flag storage for disabling friend challenges in pilot.
5. Add verification SQL script:
   - self-referral blocked
   - completion without payout when cap reached
   - payout on first verified check-in only
   - expiry behavior after 30 days

## Step 2 — Landing Page (join route)

1. Implement `app/join/[code]/page.tsx`.
2. Fetch invite preview (referrer display name + gym name/photo if available).
3. Render explicit CTA flow:
   - "X te poziva u Y gym"
   - App Store / Google Play buttons
   - "Open in app" button using `sweatdrop://join/<code>`
4. Persist code in browser storage/cookie for same-device continuity.
5. Add safety states:
   - invalid code
   - expired code
   - already used/blocked

## Step 3 — Mobile (invite UX + deep-link + disable H2H)

1. Hide/remove `challenge-friend` entry points for pilot.
2. Refactor `invite-friend` screen:
   - "How it works" block
   - share link CTA
   - copy code CTA
   - timeline/status list
   - monthly remaining payout counter (`5 - rewarded_this_month`)
3. Add deep-link handling:
   - parse `sweatdrop://join/<code>`
   - store pending code locally
   - auto-apply after auth+gym context is ready
4. Auto-apply flow guardrails:
   - never auto-apply to wrong gym
   - if gym missing, queue code and prompt gym select
   - clear pending code after success/final failure
5. Add localized explanatory text (EN/SR) so user understands exactly how reward is earned.

## Step 4 — Admin (minimal pilot observability)

1. Add lightweight referral pilot card (gym owner/superadmin):
   - invites sent
   - joined
   - verified check-in completed
   - rewarded
   - cap-blocked count
2. No CRUD complexity; read-only for pilot monitoring.

## Step 5 — Reviewer (go/no-go)

1. Validate head-to-head is not user-reachable in pilot build.
2. Validate join link flows:
   - app installed -> deep-link auto-apply
   - app not installed -> store path, then apply using persisted code strategy
3. Validate anti-abuse cases:
   - self-referral
   - repeated same-device abuse
   - monthly cap boundary (`4->5` rewards OK, `6th` no payout)
4. Validate i18n and UX clarity (no dead-end states).
5. Report explicit GO/NO-GO with failed scenarios listed.

---

## Deferred Deep-Link Note (Important)

`sweatdrop://join/<code>` handles users who already have the app.

For users who install from store after landing click, true automatic deferred deep-linking usually requires a provider (e.g. Branch/Firebase Dynamic Links alternative).  

Pilot-safe fallback if no provider is added immediately:
- store code in landing cookie/localStorage,
- present clear "After install, open app and tap 'I have an invite code'" path,
- auto-paste from clipboard where possible,
- keep UX copy explicit.

If strict "zero manual step after install" is mandatory, add deferred deep-link provider as an extra sub-project.

---

## Testing Requirements

## Functional
- invite link creation works and is shareable
- `/join/[code]` resolves referrer + gym context correctly
- deep-link parsing and auto-apply works in installed-app flow
- referral rewards only after first verified check-in trigger
- referred bonus granted once
- no reward-redemption dependency
- no workout dependency
- 30-day expiry enforced
- monthly cap enforced for referrer payouts

## Security/Abuse
- self-referral rejected
- duplicate invitee path rejected
- same-device multi-account referral blocked or marked blocked
- no manual client-side reward minting path

## Regression
- auth (email/google/apple) unaffected
- gym listing/pilot filtering unaffected
- push/deep-link handlers do not break existing notification routing

---

## Rollout Strategy

1. Enable new invite flow in dev only.
2. Keep head-to-head hidden behind pilot-off flag.
3. Run reviewer matrix on iOS + Android.
4. Promote to prod with staged monitoring:
   - referral apply success rate
   - blocked ratio
   - reward payout volume vs expected

---

## Deliverables by Agent

- **supabase-dba:** migration + verify SQL + updated RPC contracts doc
- **landing-page-coder:** `/join/[code]` route + UX states + localization
- **mobile-coder:** invite screen refactor + deep-link auto-apply + H2H hidden
- **admin-coder:** read-only referral pilot KPI panel
- **reviewer:** final severity-ordered review and GO/NO-GO verdict
