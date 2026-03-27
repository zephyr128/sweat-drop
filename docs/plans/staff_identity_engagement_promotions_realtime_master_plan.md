# Feature: Staff Invite + Member Identity Link + Engagement Notifications + Happy Hour + Realtime UX

**Date:** 2026-03-11  
**Priority:** Critical (operations + retention + automation)  
**Scope:** `apps/admin-panel`, `apps/mobile-app`, `backend/supabase`

---

## Context

You asked for one coordinated implementation of five operational requirements:

1. Staff invite must send real email and full acceptance flow must be reliable.
2. SweatDrop app users must be linked to physical gym members (front-desk verification flow).
3. Admin must be able to send targeted notifications (especially at-risk members, optional return discount).
4. Admin must define Happy Hour style drop multipliers (or equivalent if already supported).
5. Check-in verification, redemptions, and similar actions must auto-appear without manual refresh (admin + mobile).

This plan organizes these into one rollout program with shared foundations.

---

## Current State Audit (as-is)

- **Staff invite:** Invitation records and accept route exist, but email sending is still placeholder/log-only in server actions (`sendInvitationEmail`, `sendOwnerInvitationEmail` TODO).
- **Identity linking:** Check-in stats/list exists, but no explicit “physical member identity verification” state model and no desk-first verify modal.
- **Push notifications:** Mobile notification stack exists (`profiles.expo_push_token`, notification module, deep links), but activation depends on env flag and admin-triggered campaigns are not yet productized.
- **Happy hour multipliers:** System has runtime multiplier fields in drops flow, but no first-class admin scheduling UI/rules for time-window multipliers.
- **Realtime UX:** Some realtime patterns exist (machine/activity modules), but not uniformly enforced for all operational surfaces (check-ins, redemptions, member verification, campaign events).

---

## Product Decisions (Locked)

1. **Email invite becomes mandatory reliability path**, not optional/manual link sharing.
2. **Identity verification is moved to front-desk workflow** at check-in event time.
3. **At-risk outreach supports both push reminder and offer-based message templates**.
4. **Happy Hour becomes first-class feature** (time-window drop boost rules), not challenge workaround.
5. **No-refresh policy:** all operator-critical views use Realtime subscription + fallback polling.

---

## Dependencies

- Existing plans to align with:
  - `docs/plans/admin_panel_premium_security_speed_production_plan.md`
  - `docs/plans/production_anti_abuse_hardening_plan.md`
  - `docs/plans/tokenomics_and_pricing_plan.md`
  - `docs/plans/admin_dashboard_premium_v3_plan.md`
  - `docs/plans/admin_dashboard_v3_workout_activity_addendum.md`
- Existing backend assets used:
  - `profiles.expo_push_token`
  - `staff_invitations`
  - `gym_checkins`, `redemptions`, `sessions`
  - `drops_transactions`, `tokenomics_config`

---

## Program Structure (Execution by Workstream)

### Workstream A — Staff Invite Email Reliability

#### A1. DBA (`supabase-dba`)
- Create migration: `YYYYMMDD000001_staff_invite_email_delivery.sql`
- Add delivery tracking fields on `staff_invitations`:
  - `email_delivery_status` (`pending|sent|failed`)
  - `email_sent_at`
  - `email_failure_reason`
  - `last_email_provider_id`
  - `resend_count`
- Add `resend_staff_invitation_email(p_invitation_id)` RPC with auth checks.
- Add expiry + status integrity constraints and indexes for pending invites.

#### A2. Backend/Edge (`supabase-dba` or platform agent)
- Add edge function `send-staff-invitation-email` (provider: Resend/SendGrid).
- Add optional webhook edge function to mark delivered/bounced/blocked.

#### A3. Admin (`admin-coder`)
- Update `TeamManager` to show:
  - delivery status badge,
  - “Resend email” action,
  - “Copy invite link” fallback.
- Add Invite Flow audit panel:
  - Created, sent, opened, accepted timestamps.

#### A4. Testing
- Verify end-to-end for:
  - new user invite accept,
  - existing user invite accept,
  - expired invite,
  - resend behavior,
  - provider failure fallback.

---

### Workstream B — Digital ↔ Physical Member Identity Linking

#### B1. DBA (`supabase-dba`)
- Create migration: `YYYYMMDD000002_member_identity_linking.sql`
- Add identity model (one of two acceptable patterns):
  - **Option 1 (recommended):** new table `gym_member_identities`
  - **Option 2:** extend `gym_memberships` with verification columns
- Minimum fields:
  - `gym_id`, `user_id`
  - `is_verified`
  - `full_name_verified`
  - `external_membership_id` (nullable, unique per gym when present)
  - `verified_by`, `verified_at`
  - `verification_notes`
- Add RPCs:
  - `get_checkin_identity_candidates(p_gym_id, p_user_id)`
  - `verify_member_identity(...)`
  - `upsert_physical_member_identity(...)`

#### B2. Admin (`admin-coder`)
- In check-in screen (`CheckinStatsModule` flow), when new check-in arrives:
  - show identity status chip (`Verified` / `Needs verification`),
  - open quick verify drawer/modal for non-verified members.
- Verification UI:
  - set name/surname,
  - set gym membership ID/card number,
  - mark verified with actor audit.
- Add member profile panel section:
  - “Physical identity” block + verification history.

#### B3. Mobile (`mobile-coder`)
- Add optional member-facing status in profile:
  - “Gym identity verified / pending”.
- If pending, show subtle CTA:
  - “Ask front desk to verify your membership profile.”

#### B4. Testing
- Check-in of unverified user should surface immediately in admin.
- Verification action should update member detail and future check-ins.
- Duplicate `external_membership_id` per gym must be blocked.

---

### Workstream C — Admin-triggered At-Risk Notifications (+ optional discount)

#### C1. DBA (`supabase-dba`)
- Create migration: `YYYYMMDD000003_member_engagement_campaigns.sql`
- Add tables:
  - `engagement_campaigns` (template, target segment, scheduling, message body)
  - `engagement_campaign_targets` (resolved recipients)
  - `engagement_campaign_deliveries` (status per recipient)
- Add helper RPCs:
  - `get_members_at_risk(p_gym_id, p_days_inactive)`
  - `create_engagement_campaign(...)`
  - `queue_engagement_delivery(...)`
- Optional discount coupling:
  - store `reward_id` or `discount_code` reference per campaign.

#### C2. Backend/Edge
- Add edge function `send-engagement-push`:
  - loads recipients with `expo_push_token`,
  - sends push payload,
  - records delivery outcome.

#### C3. Admin (`admin-coder`)
- New module under Members/Retention:
  - “Send reminder”
  - “Send comeback offer”
  - choose segment (`inactive 7d/14d/30d`, custom list)
  - preview message and deep link target.
- Campaign history list with sent/failed counts.

#### C4. Mobile (`mobile-coder`)
- Ensure notification deep links land correctly (home/store/challenges).
- Add localized copy keys for new notification types.

#### C5. Testing
- Dry-run mode for campaign targeting.
- Push enabled/disabled behavior.
- Delivery metrics consistency with provider response.

---

### Workstream D — Happy Hour / Drop Multiplier Rules

#### D1. Product clarification
- **Current system does NOT provide first-class gym-configurable time-window multipliers via admin UI.**
- Existing challenge configuration can simulate promotions, but it is not equivalent to true session-time multiplier logic.

#### D2. DBA (`supabase-dba`)
- Create migration: `YYYYMMDD000004_happy_hour_drop_boost_rules.sql`
- Add table `gym_drop_boost_rules`:
  - `gym_id`
  - `name`
  - `is_active`
  - `days_of_week` (int array or normalized table)
  - `start_time_local`, `end_time_local`
  - `timezone` (default gym timezone)
  - `multiplier` (bounded, e.g. 1.0–2.0)
  - optional `machine_types`, `member_segment`
  - `priority`
- Add RPCs:
  - `get_active_drop_boost(p_gym_id, p_timestamp)`
  - `admin_upsert_drop_boost_rule(...)`
- Integrate boost into awarding path with cap guardrails (never bypass daily/weekly/system caps).

#### D3. Admin (`admin-coder`)
- Economy/Promotions UI:
  - create/edit Happy Hour windows,
  - conflict preview (overlapping windows),
  - live status indicator “Happy Hour active now”.

#### D4. Mobile (`mobile-coder`)
- Workout UI badge:
  - “Happy Hour x1.5 active”
  - estimated drops reflects active boost.

#### D5. Testing
- Timezone boundary tests.
- Overlap resolution and priority.
- Cap enforcement unchanged during boosts.

---

### Workstream E — Realtime No-Refresh Operations (Admin + Mobile)

#### E1. DBA (`supabase-dba`)
- Ensure publication includes required tables:
  - `gym_checkins`, `redemptions`, `sessions`, `staff_invitations`, `engagement_campaign_deliveries`.
- Add lightweight change feed RPC if needed for reduced client query load.

#### E2. Admin (`admin-coder`)
- For check-ins, redemptions, identity verification queue, activity log:
  - subscribe via Supabase Realtime `postgres_changes`
  - on event: optimistic append/update list row
  - fallback poll every 30–60s.
- Add “Live” indicator on modules where realtime is active.

#### E3. Mobile (`mobile-coder`)
- Subscribe to wallet/reward/check-in relevant changes where appropriate.
- Keep push for offline/background delivery, realtime for foreground freshness.

#### E4. Testing
- Simulate parallel terminal actions (multiple desk users).
- Validate no manual browser/app refresh required.
- Verify eventual consistency after reconnect.

---

## Recommended Launch Order (Agent Run Sequence)

1. **`supabase-dba`** — Workstream A+B base schema + auth-safe RPCs  
2. **`admin-coder`** — Invite reliability UI + check-in identity verify UX  
3. **`supabase-dba`** — Workstream C+D migrations (campaigns + happy hour rules)  
4. **`admin-coder`** — Campaign UI + Happy Hour admin controls  
5. **`mobile-coder`** — push/deeplink UX + happy hour indicator + identity status  
6. **`admin-coder` + `mobile-coder`** — Workstream E realtime polish  
7. **`reviewer`** — security, role scope, data consistency, abuse checks  
8. **`test-automation-agent`** — end-to-end regression + realtime reliability suite

---

## API Contracts (High-level)

- `create_staff_invitation(...)` returns invitation + delivery status metadata.
- `verify_member_identity(...)` returns updated identity snapshot.
- `get_members_at_risk(...)` returns segmentable list with last-activity metrics.
- `create_engagement_campaign(...)` returns campaign id + queued targets.
- `get_active_drop_boost(...)` returns active multiplier + source rule.
- Realtime event payloads normalized for:
  - check-in activity,
  - redemption status updates,
  - workout lifecycle updates,
  - invite delivery updates.

---

## Security & Abuse Constraints (Mandatory)

- Gym scoping on all new RPCs (`_admin_check_gym_access` pattern).
- Staff invite resend rate limits (prevent mail abuse).
- Campaign send quotas per gym per hour/day.
- Happy hour multiplier hard bounds + cap compatibility.
- Identity verification audit trail (`verified_by`, `verified_at`, old/new values).

---

## Acceptance Criteria (Program-level)

- [ ] Staff invite email sent and accepted without manual URL sharing.
- [ ] Front desk can verify/check member identity in <30 seconds at check-in.
- [ ] Admin can send at-risk push campaign and see delivery stats.
- [ ] Happy Hour multiplier is configurable and correctly applied in drops calculation.
- [ ] Check-ins/redemptions/activity update in admin and mobile without refresh.
- [ ] All new flows are role-safe, gym-scoped, and audited.

---

## Notes on “Happy Hour via challenges”

Current challenge configuration can award extra drops indirectly, but it is **not** a true gym-wide time-window multiplier policy.  
For predictable operator UX and clean tokenomics control, implement dedicated `gym_drop_boost_rules` as above.

