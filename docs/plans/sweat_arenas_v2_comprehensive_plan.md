# Sweat Arenas v2 — Comprehensive Implementation Plan

> **Date:** 2026-03-06
> **Author:** System Architect
> **Scope:** Supabase DBA + Admin Panel + Mobile App
> **Priority:** Production-ready, zero bugs, all edge cases covered

---

## 1. EXECUTIVE SUMMARY

This plan upgrades the Sweat Arenas system from a basic MVP to a production-ready competition platform with:

1. **Global Arena Invitation System** — Superadmin creates global arenas and invites gym owners/admins
2. **Future Arena Visibility** — Users see upcoming arenas with countdown + early opt-in
3. **Opt-in Requirements** — Admins define participation criteria (free, drops cost, streak minimum)
4. **Arena Branding** — Custom card colors, logo, text color with live admin preview
5. **Post-Arena Management** — Admin results view, user notification for prize redemption
6. **Bug Fixes** — `gym_admin` cannot create local arenas, upcoming arenas hidden from mobile

---

## 2. CURRENT STATE AUDIT

### 2.1 What EXISTS and WORKS ✅

| Component | Status | Notes |
|---|---|---|
| `sweat_arenas` table | ✅ | Core schema with scope, scoring_model, prizes |
| `arena_gyms` table | ✅ | Links arenas to participating gyms |
| `arena_participants` table | ✅ | Tracks user opt-ins and scores |
| `arena_results` table | ✅ | Finalized rankings |
| `opt_into_arena()` RPC | ✅ | Basic opt-in (no requirements check) |
| `get_available_arenas()` RPC | ✅ | Returns active arenas (but NOT upcoming) |
| `update_arena_scores()` | ✅ | Real-time for total_drops/streak_days |
| `update_arena_scores_periodic()` | ✅ | Cron for days_visited/variety_score |
| `finalize_arena()` RPC | ✅ | Calculates rankings, creates redemptions |
| `finalize-arena` Edge Function | ✅ | Daily cron, sends push notifications to winners |
| Admin: ArenasManager | ✅ | CRUD for arenas, gym selection |
| Admin: ArenaDetail | ✅ | Live leaderboard, finalize button |
| Mobile: arenas.tsx | ✅ | Arena cards with branding, opt-in |
| Mobile: arena/[id] | ✅ | Arena detail with mini leaderboard |
| Mobile: useAvailableArenas | ✅ | Hook calling get_available_arenas() |
| `award_drops()` → `update_arena_scores()` | ✅ | Fixed in migration 20260305000005 |
| Arena leaderboard (0-score visible) | ✅ | Fixed in migration 20260305200001 |

### 2.2 What's MISSING ❌

| Feature | Status | Impact |
|---|---|---|
| **Arena invitation system** | ❌ Missing | No consent flow for global arenas |
| **Revenue share tracking** | ❌ Missing | Gym owners can't see earnings |
| **Future/upcoming arenas** | ❌ Missing | `get_available_arenas()` filters `start_date <= CURRENT_DATE` |
| **Countdown + early opt-in** | ❌ Missing | Users can't see or join future arenas |
| **Opt-in requirements** | ❌ Missing | No `opt_in_type` field, everyone joins free |
| **Arena branding (card_color, text_color)** | ❌ Missing | Only `sponsor_logo` exists |
| **Live branding preview** | ❌ Missing | Admin can't preview arena card appearance |
| **Post-arena results admin view** | ❌ Missing | Admin can't see redemption codes/status |
| **Post-arena user notification** | ⚠️ Partial | Push notifications exist, but no in-app results |
| **`gym_admin` create local arenas** | ❌ Bug | `createArena()` only allows `superadmin`+`gym_owner` |

### 2.3 What's BUGGY ⚠️

| Bug | Location | Fix |
|---|---|---|
| `gym_admin` can't create arenas | `arena-actions.ts:149` | Add `gym_admin` to allowed roles |
| Global arenas page allows `gym_owner` but has no gym filter | `arenas/page.tsx` | `gym_owner` on global page sees all arenas (should see only own) |

---

## 3. DATABASE CHANGES (Supabase DBA)

### Migration: `20260306000001_arena_invitations_and_enhancements.sql`

#### 3.1 New Table: `arena_invitations`

```sql
CREATE TABLE IF NOT EXISTS public.arena_invitations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  arena_id UUID NOT NULL REFERENCES public.sweat_arenas(id) ON DELETE CASCADE,
  invited_gym_id UUID NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES public.profiles(id),       -- superadmin who sent it
  invited_user_id UUID REFERENCES public.profiles(id),           -- gym_owner or gym_admin being invited
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  revenue_share_percent NUMERIC(5, 2) DEFAULT 0,                 -- e.g. 15.00 = 15%
  revenue_share_note TEXT,                                        -- free-text explanation
  responded_at TIMESTAMPTZ,
  responded_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(arena_id, invited_gym_id)  -- one invitation per gym per arena
);

-- Indexes
CREATE INDEX idx_arena_invitations_arena ON public.arena_invitations(arena_id);
CREATE INDEX idx_arena_invitations_gym ON public.arena_invitations(invited_gym_id);
CREATE INDEX idx_arena_invitations_user ON public.arena_invitations(invited_user_id);
CREATE INDEX idx_arena_invitations_status ON public.arena_invitations(status);

-- RLS
ALTER TABLE public.arena_invitations ENABLE ROW LEVEL SECURITY;

-- Superadmin: full access
CREATE POLICY "Superadmin manage all invitations"
  ON public.arena_invitations FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin')
  );

-- Gym owner/admin: can view invitations for their gyms
CREATE POLICY "Gym staff can view their invitations"
  ON public.arena_invitations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.gym_staff gs
      WHERE gs.user_id = auth.uid()
        AND gs.gym_id = arena_invitations.invited_gym_id
        AND gs.role IN ('owner', 'admin')
    )
    OR invited_user_id = auth.uid()
  );

-- Gym owner/admin: can update (accept/decline) their invitations
CREATE POLICY "Gym staff can respond to invitations"
  ON public.arena_invitations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.gym_staff gs
      WHERE gs.user_id = auth.uid()
        AND gs.gym_id = arena_invitations.invited_gym_id
        AND gs.role IN ('owner', 'admin')
    )
    OR invited_user_id = auth.uid()
  )
  WITH CHECK (
    status IN ('accepted', 'declined')
  );
```

#### 3.2 Alter `sweat_arenas` — Add opt-in and branding columns

```sql
-- Opt-in requirements
ALTER TABLE public.sweat_arenas
  ADD COLUMN IF NOT EXISTS opt_in_type TEXT DEFAULT 'free'
    CHECK (opt_in_type IN ('free', 'drops', 'streak', 'level')),
  ADD COLUMN IF NOT EXISTS opt_in_value INTEGER DEFAULT 0;
  -- free → 0 (anyone can join)
  -- drops → N (user must spend N drops to opt in)
  -- streak → N (user must have streak >= N days)
  -- level → N (user must have total_drops >= N, "reputation")

-- Custom branding
ALTER TABLE public.sweat_arenas
  ADD COLUMN IF NOT EXISTS card_color TEXT DEFAULT NULL,      -- e.g. '#FF6600' (hex, nullable = use default)
  ADD COLUMN IF NOT EXISTS card_text_color TEXT DEFAULT NULL,  -- e.g. '#FFFFFF'
  ADD COLUMN IF NOT EXISTS card_gradient_end TEXT DEFAULT NULL; -- optional gradient end color

COMMENT ON COLUMN public.sweat_arenas.opt_in_type IS
  'Opt-in requirement type: free (anyone), drops (spend N drops), streak (need N-day streak), level (need N total drops)';
COMMENT ON COLUMN public.sweat_arenas.opt_in_value IS
  'Value for opt-in requirement. E.g. 50 for drops type means user spends 50 drops to join.';
COMMENT ON COLUMN public.sweat_arenas.card_color IS
  'Primary color for arena card (hex). NULL = use default teal (#00E5FF).';
COMMENT ON COLUMN public.sweat_arenas.card_text_color IS
  'Text color for arena card (hex). NULL = use white (#FFFFFF).';
```

#### 3.3 New RPC: `respond_to_arena_invitation()`

```sql
CREATE OR REPLACE FUNCTION public.respond_to_arena_invitation(
  p_invitation_id UUID,
  p_response TEXT  -- 'accepted' or 'declined'
)
RETURNS TABLE(success BOOLEAN, error_message TEXT)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_invitation RECORD;
  v_user_id UUID := auth.uid();
BEGIN
  -- 1. Validate response
  IF p_response NOT IN ('accepted', 'declined') THEN
    RETURN QUERY SELECT false, 'Invalid response. Must be "accepted" or "declined".'::TEXT;
    RETURN;
  END IF;

  -- 2. Fetch invitation
  SELECT * INTO v_invitation
  FROM public.arena_invitations
  WHERE id = p_invitation_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Invitation not found.'::TEXT;
    RETURN;
  END IF;

  -- 3. Verify caller has permission (gym owner/admin of invited gym)
  IF NOT EXISTS (
    SELECT 1 FROM public.gym_staff
    WHERE user_id = v_user_id
      AND gym_id = v_invitation.invited_gym_id
      AND role IN ('owner', 'admin')
  ) AND v_invitation.invited_user_id != v_user_id THEN
    RETURN QUERY SELECT false, 'You do not have permission to respond to this invitation.'::TEXT;
    RETURN;
  END IF;

  -- 4. Check invitation is still pending
  IF v_invitation.status != 'pending' THEN
    RETURN QUERY SELECT false, ('Invitation already ' || v_invitation.status || '.')::TEXT;
    RETURN;
  END IF;

  -- 5. Update invitation status
  UPDATE public.arena_invitations
  SET status = p_response,
      responded_at = NOW(),
      responded_by = v_user_id,
      updated_at = NOW()
  WHERE id = p_invitation_id;

  -- 6. If accepted, add gym to arena_gyms
  IF p_response = 'accepted' THEN
    INSERT INTO public.arena_gyms (arena_id, gym_id, approved_by, approved_at)
    VALUES (v_invitation.arena_id, v_invitation.invited_gym_id, v_user_id, NOW())
    ON CONFLICT (arena_id, gym_id) DO NOTHING;
  END IF;

  -- 7. If declined, remove gym from arena_gyms (in case it was pre-added)
  IF p_response = 'declined' THEN
    DELETE FROM public.arena_gyms
    WHERE arena_id = v_invitation.arena_id
      AND gym_id = v_invitation.invited_gym_id;
  END IF;

  RETURN QUERY SELECT true, NULL::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.respond_to_arena_invitation(UUID, TEXT) TO authenticated;
```

#### 3.4 Update `opt_into_arena()` — Add requirement checks

```sql
CREATE OR REPLACE FUNCTION public.opt_into_arena(p_arena_id UUID)
RETURNS TABLE(success BOOLEAN, error_message TEXT)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_arena RECORD;
  v_user_id UUID := auth.uid();
  v_user_gym_id UUID;
  v_user_profile RECORD;
BEGIN
  -- 1. Fetch arena
  SELECT * INTO v_arena
  FROM public.sweat_arenas
  WHERE id = p_arena_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Arena not found.'::TEXT;
    RETURN;
  END IF;

  -- 2. Check arena is active
  IF NOT v_arena.is_active THEN
    RETURN QUERY SELECT false, 'Arena is not active.'::TEXT;
    RETURN;
  END IF;

  -- 3. Check arena hasn't ended (but allow opt-in for future arenas)
  IF v_arena.end_date < CURRENT_DATE THEN
    RETURN QUERY SELECT false, 'Arena has already ended.'::TEXT;
    RETURN;
  END IF;

  -- 4. Check if already opted in
  IF EXISTS (
    SELECT 1 FROM public.arena_participants
    WHERE arena_id = p_arena_id AND user_id = v_user_id
  ) THEN
    RETURN QUERY SELECT false, 'Already opted in.'::TEXT;
    RETURN;
  END IF;

  -- 5. Find user's gym that participates in this arena
  SELECT gm.gym_id INTO v_user_gym_id
  FROM public.gym_memberships gm
  JOIN public.arena_gyms ag ON ag.gym_id = gm.gym_id
  WHERE gm.user_id = v_user_id
    AND ag.arena_id = p_arena_id
  LIMIT 1;

  -- For network arenas, use user's home gym
  IF v_user_gym_id IS NULL AND v_arena.arena_scope = 'network' THEN
    SELECT home_gym_id INTO v_user_gym_id
    FROM public.profiles
    WHERE id = v_user_id;
  END IF;

  IF v_user_gym_id IS NULL THEN
    RETURN QUERY SELECT false, 'You are not a member of any participating gym.'::TEXT;
    RETURN;
  END IF;

  -- 6. Check opt-in requirements
  SELECT * INTO v_user_profile
  FROM public.profiles
  WHERE id = v_user_id;

  IF COALESCE(v_arena.opt_in_type, 'free') = 'drops' THEN
    -- User must have enough local drops in the gym
    DECLARE
      v_local_balance INTEGER;
    BEGIN
      SELECT COALESCE(local_drops_balance, 0) INTO v_local_balance
      FROM public.gym_memberships
      WHERE user_id = v_user_id AND gym_id = v_user_gym_id;

      IF COALESCE(v_local_balance, 0) < COALESCE(v_arena.opt_in_value, 0) THEN
        RETURN QUERY SELECT false, ('Not enough drops. Need ' || v_arena.opt_in_value || ' drops to join.')::TEXT;
        RETURN;
      END IF;

      -- Deduct drops
      UPDATE public.gym_memberships
      SET local_drops_balance = local_drops_balance - v_arena.opt_in_value,
          updated_at = NOW()
      WHERE user_id = v_user_id AND gym_id = v_user_gym_id;

      -- Also deduct from global balance
      UPDATE public.profiles
      SET total_drops = GREATEST(0, total_drops - v_arena.opt_in_value),
          updated_at = NOW()
      WHERE id = v_user_id;
    END;

  ELSIF COALESCE(v_arena.opt_in_type, 'free') = 'streak' THEN
    IF COALESCE(v_user_profile.streak_days, 0) < COALESCE(v_arena.opt_in_value, 0) THEN
      RETURN QUERY SELECT false, ('Streak too low. Need ' || v_arena.opt_in_value || '-day streak to join.')::TEXT;
      RETURN;
    END IF;

  ELSIF COALESCE(v_arena.opt_in_type, 'free') = 'level' THEN
    IF COALESCE(v_user_profile.total_drops, 0) < COALESCE(v_arena.opt_in_value, 0) THEN
      RETURN QUERY SELECT false, ('Not enough reputation. Need ' || v_arena.opt_in_value || ' total drops to join.')::TEXT;
      RETURN;
    END IF;
  END IF;
  -- 'free' requires no check

  -- 7. Insert participant
  INSERT INTO public.arena_participants (arena_id, user_id, gym_id, current_score)
  VALUES (p_arena_id, v_user_id, v_user_gym_id, 0);

  RETURN QUERY SELECT true, NULL::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.opt_into_arena(UUID) TO authenticated;
```

#### 3.5 Update `get_available_arenas()` — Include upcoming arenas

```sql
CREATE OR REPLACE FUNCTION public.get_available_arenas(p_user_id UUID)
RETURNS TABLE(
  arena_id UUID,
  name TEXT,
  description TEXT,
  sponsor_name TEXT,
  sponsor_logo TEXT,
  scoring_model TEXT,
  start_date DATE,
  end_date DATE,
  participant_count BIGINT,
  user_opted_in BOOLEAN,
  user_rank BIGINT,
  user_score NUMERIC,
  prizes JSONB,
  -- NEW fields
  opt_in_type TEXT,
  opt_in_value INTEGER,
  card_color TEXT,
  card_text_color TEXT,
  card_gradient_end TEXT,
  arena_status TEXT  -- 'upcoming', 'active', 'ended'
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sa.id AS arena_id,
    sa.name,
    sa.description,
    sa.sponsor_name,
    sa.sponsor_logo,
    sa.scoring_model,
    sa.start_date,
    sa.end_date,
    COUNT(DISTINCT ap.id)::BIGINT AS participant_count,
    EXISTS (
      SELECT 1 FROM public.arena_participants ap2
      WHERE ap2.arena_id = sa.id AND ap2.user_id = p_user_id
    ) AS user_opted_in,
    (
      SELECT COUNT(*)::BIGINT + 1
      FROM public.arena_participants ap3
      WHERE ap3.arena_id = sa.id
        AND ap3.current_score > COALESCE((
          SELECT ap4.current_score
          FROM public.arena_participants ap4
          WHERE ap4.arena_id = sa.id AND ap4.user_id = p_user_id
        ), 0)
    ) AS user_rank,
    (
      SELECT ap5.current_score
      FROM public.arena_participants ap5
      WHERE ap5.arena_id = sa.id AND ap5.user_id = p_user_id
    ) AS user_score,
    sa.prizes,
    -- NEW fields
    COALESCE(sa.opt_in_type, 'free')::TEXT AS opt_in_type,
    COALESCE(sa.opt_in_value, 0)::INTEGER AS opt_in_value,
    sa.card_color::TEXT,
    sa.card_text_color::TEXT,
    sa.card_gradient_end::TEXT,
    CASE
      WHEN sa.start_date > CURRENT_DATE THEN 'upcoming'
      WHEN sa.end_date < CURRENT_DATE THEN 'ended'
      ELSE 'active'
    END::TEXT AS arena_status
  FROM public.sweat_arenas sa
  LEFT JOIN public.arena_participants ap ON ap.arena_id = sa.id
  WHERE sa.is_active = true
    AND sa.is_finalized = false
    AND sa.end_date >= CURRENT_DATE  -- Include upcoming AND active (but not ended)
    -- REMOVED: AND sa.start_date <= CURRENT_DATE (was hiding upcoming arenas)
    AND (
      sa.arena_scope = 'network' OR
      EXISTS (
        SELECT 1 FROM public.arena_gyms ag
        JOIN public.gym_memberships gm ON gm.gym_id = ag.gym_id
        WHERE ag.arena_id = sa.id
          AND gm.user_id = p_user_id
      )
    )
  GROUP BY sa.id, sa.name, sa.description, sa.sponsor_name, sa.sponsor_logo,
           sa.scoring_model, sa.start_date, sa.end_date, sa.prizes,
           sa.opt_in_type, sa.opt_in_value, sa.card_color, sa.card_text_color, sa.card_gradient_end
  ORDER BY
    -- Upcoming first, then active, then by start date
    CASE WHEN sa.start_date > CURRENT_DATE THEN 0 ELSE 1 END,
    sa.start_date ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_available_arenas(UUID) TO authenticated;
```

#### 3.6 New RPC: `get_arena_results()` — For post-arena admin view

```sql
CREATE OR REPLACE FUNCTION public.get_arena_results(p_arena_id UUID)
RETURNS TABLE(
  rank INTEGER,
  user_id UUID,
  username TEXT,
  avatar_url TEXT,
  gym_name TEXT,
  final_score NUMERIC,
  prize TEXT,
  redemption_code TEXT,
  redemption_status TEXT
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ar.rank,
    ar.user_id,
    p.username::TEXT,
    p.avatar_url::TEXT,
    g.name::TEXT AS gym_name,
    ar.final_score,
    ar.prize_description::TEXT AS prize,
    r.redemption_code::TEXT,
    r.status::TEXT AS redemption_status
  FROM public.arena_results ar
  JOIN public.profiles p ON p.id = ar.user_id
  LEFT JOIN public.gyms g ON g.id = ar.gym_id
  LEFT JOIN public.redemptions r ON r.id = ar.redemption_id
  WHERE ar.arena_id = p_arena_id
  ORDER BY ar.rank ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_arena_results(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_arena_results(UUID) TO service_role;
```

#### 3.7 New RPC: `send_arena_invitations()` — Bulk invite gyms

```sql
CREATE OR REPLACE FUNCTION public.send_arena_invitations(
  p_arena_id UUID,
  p_gym_ids UUID[],
  p_revenue_share_percent NUMERIC DEFAULT 0,
  p_revenue_share_note TEXT DEFAULT NULL
)
RETURNS TABLE(sent_count INTEGER, error_message TEXT)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_gym_id UUID;
  v_count INTEGER := 0;
  v_gym_owner_id UUID;
BEGIN
  -- Verify caller is superadmin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_user_id AND role = 'superadmin'
  ) THEN
    RETURN QUERY SELECT 0, 'Only superadmin can send arena invitations.'::TEXT;
    RETURN;
  END IF;

  -- Verify arena exists
  IF NOT EXISTS (
    SELECT 1 FROM public.sweat_arenas WHERE id = p_arena_id
  ) THEN
    RETURN QUERY SELECT 0, 'Arena not found.'::TEXT;
    RETURN;
  END IF;

  -- Send invitations for each gym
  FOREACH v_gym_id IN ARRAY p_gym_ids
  LOOP
    -- Find the gym owner
    SELECT owner_id INTO v_gym_owner_id
    FROM public.gyms
    WHERE id = v_gym_id;

    -- Insert invitation (skip if already exists)
    INSERT INTO public.arena_invitations (
      arena_id, invited_gym_id, invited_by, invited_user_id,
      revenue_share_percent, revenue_share_note, status
    )
    VALUES (
      p_arena_id, v_gym_id, v_user_id, v_gym_owner_id,
      p_revenue_share_percent, p_revenue_share_note, 'pending'
    )
    ON CONFLICT (arena_id, invited_gym_id) DO NOTHING;

    IF FOUND THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_count, NULL::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_arena_invitations(UUID, UUID[], NUMERIC, TEXT) TO authenticated;
```

#### 3.8 New RPC: `cancel_arena()` — Superadmin cancels arena with drops refund

```sql
CREATE OR REPLACE FUNCTION public.cancel_arena(p_arena_id UUID)
RETURNS TABLE(success BOOLEAN, participants_refunded INTEGER, error_message TEXT)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_arena RECORD;
  v_participant RECORD;
  v_refund_count INTEGER := 0;
BEGIN
  -- 1. Only superadmin can cancel
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_user_id AND role = 'superadmin'
  ) THEN
    RETURN QUERY SELECT false, 0, 'Only superadmin can cancel arenas.'::TEXT;
    RETURN;
  END IF;

  -- 2. Fetch arena
  SELECT * INTO v_arena
  FROM public.sweat_arenas
  WHERE id = p_arena_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, 'Arena not found.'::TEXT;
    RETURN;
  END IF;

  -- 3. Can only cancel active or upcoming arenas (not finalized)
  IF v_arena.is_finalized THEN
    RETURN QUERY SELECT false, 0, 'Cannot cancel a finalized arena.'::TEXT;
    RETURN;
  END IF;

  IF NOT v_arena.is_active THEN
    RETURN QUERY SELECT false, 0, 'Arena is already cancelled/inactive.'::TEXT;
    RETURN;
  END IF;

  -- 4. If opt_in_type was 'drops', refund all participants
  IF COALESCE(v_arena.opt_in_type, 'free') = 'drops' AND COALESCE(v_arena.opt_in_value, 0) > 0 THEN
    FOR v_participant IN
      SELECT ap.user_id, ap.gym_id
      FROM public.arena_participants ap
      WHERE ap.arena_id = p_arena_id
    LOOP
      -- 4a. Refund global drops
      UPDATE public.profiles
      SET total_drops = total_drops + v_arena.opt_in_value,
          updated_at = NOW()
      WHERE id = v_participant.user_id;

      -- 4b. Refund local gym drops
      UPDATE public.gym_memberships
      SET local_drops_balance = local_drops_balance + v_arena.opt_in_value,
          updated_at = NOW()
      WHERE user_id = v_participant.user_id
        AND gym_id = v_participant.gym_id;

      -- 4c. Record refund transaction
      INSERT INTO public.drops_transactions (
        user_id, amount, transaction_type, reference_id, description, created_at
      ) VALUES (
        v_participant.user_id,
        v_arena.opt_in_value,  -- positive = credit/refund
        'refund',
        p_arena_id,
        'Arena cancelled: ' || v_arena.name || ' — ' || v_arena.opt_in_value || ' drops refunded',
        NOW()
      );

      v_refund_count := v_refund_count + 1;
    END LOOP;
  ELSE
    -- Count participants even if no drops to refund (for notification purposes)
    SELECT COUNT(*)::INTEGER INTO v_refund_count
    FROM public.arena_participants
    WHERE arena_id = p_arena_id;
  END IF;

  -- 5. Deactivate the arena
  UPDATE public.sweat_arenas
  SET is_active = false,
      updated_at = NOW()
  WHERE id = p_arena_id;

  RETURN QUERY SELECT true, v_refund_count, NULL::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_arena(UUID) TO authenticated;

COMMENT ON FUNCTION public.cancel_arena IS
  'Superadmin cancels an active/upcoming arena. If opt_in_type=drops, refunds all participants. Sets is_active=false.';
```

**After `cancel_arena()` succeeds, the admin panel must trigger a push notification to all participants:**
- Edge function call to `send-push` with all participant tokens
- Title: `"⚠️ Arena otkazana"`
- Body: `"Arena '{arena_name}' je otkazana. {opt_in_value} 💧 drops su ti vraćeni."` (if drops type)
- Body: `"Arena '{arena_name}' je otkazana."` (if free/streak/level type)

#### 3.9 New Column on `arena_participants`: `opt_in_drops_paid`

```sql
-- Track how many drops each participant paid (for accurate refunds)
ALTER TABLE public.arena_participants
  ADD COLUMN IF NOT EXISTS opt_in_drops_paid INTEGER DEFAULT 0 NOT NULL;

COMMENT ON COLUMN public.arena_participants.opt_in_drops_paid IS
  'Drops paid on opt-in (for refund on cancellation). 0 if free/streak/level arena.';
```

Update `opt_into_arena()` to record this:
```sql
-- In opt_into_arena(), after the drops deduction block, update the insert:
INSERT INTO public.arena_participants (arena_id, user_id, gym_id, current_score, opt_in_drops_paid)
VALUES (p_arena_id, v_user_id, v_user_gym_id, 0,
  CASE WHEN COALESCE(v_arena.opt_in_type, 'free') = 'drops'
       THEN COALESCE(v_arena.opt_in_value, 0) ELSE 0 END
);
```

And update `cancel_arena()` to use per-participant amount instead of arena-level value:
```sql
-- In the refund loop, use ap.opt_in_drops_paid instead of v_arena.opt_in_value
-- This handles edge cases where arena opt_in_value was changed after some users opted in
```

#### 3.10 Cross-Gym Scoring Architecture

**Problem:** Currently `arena_participants` has one `gym_id` (opt-in gym) and one `current_score`. When a user is a member of multiple participating gyms, ALL sessions across ALL participating gyms should contribute to their arena score, with a per-gym breakdown visible.

**Example:**
```
Marko opts-in at Gym A (Nike Arena):
  Gym A sessions: 450 drops
  Gym B sessions: 200 drops
  Gym C sessions: 150 drops
  ─────────────────────────
  Total score: 800 drops

Leaderboard:
  #1 Marko — 800 drops
              [Gym A: 450 | Gym B: 200 | Gym C: 150]
```

##### 3.10.1 New Table: `arena_participant_gym_scores`

```sql
CREATE TABLE IF NOT EXISTS public.arena_participant_gym_scores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  arena_id UUID NOT NULL REFERENCES public.sweat_arenas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  gym_id UUID NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  score NUMERIC(12, 2) NOT NULL DEFAULT 0,
  sessions INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  UNIQUE (arena_id, user_id, gym_id)
);

-- Indexes
CREATE INDEX idx_apgs_arena ON public.arena_participant_gym_scores(arena_id);
CREATE INDEX idx_apgs_user ON public.arena_participant_gym_scores(user_id);
CREATE INDEX idx_apgs_arena_user ON public.arena_participant_gym_scores(arena_id, user_id);

-- RLS
ALTER TABLE public.arena_participant_gym_scores ENABLE ROW LEVEL SECURITY;

-- User sees their own rows only
CREATE POLICY "User sees own gym scores"
  ON public.arena_participant_gym_scores FOR SELECT
  USING (user_id = auth.uid());

-- Gym owner/admin sees rows for users who opted-in through their gym
-- (they can see breakdown of their members, but NOT which other gyms contributed)
CREATE POLICY "Gym staff sees own members gym scores"
  ON public.arena_participant_gym_scores FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.arena_participants ap
      JOIN public.gym_staff gs ON gs.gym_id = ap.gym_id
      WHERE ap.arena_id = arena_participant_gym_scores.arena_id
        AND ap.user_id = arena_participant_gym_scores.user_id
        AND gs.user_id = auth.uid()
        AND gs.role IN ('owner', 'admin')
    )
  );

-- Superadmin sees all
CREATE POLICY "Superadmin sees all gym scores"
  ON public.arena_participant_gym_scores FOR ALL
  USING (public.is_superadmin(auth.uid()));

-- INSERT/UPDATE only via SECURITY DEFINER functions
-- No direct INSERT/UPDATE policies for regular users

COMMENT ON TABLE public.arena_participant_gym_scores IS
  'Tracks per-gym score breakdown for arena participants. Each row = one user''s score from one gym in one arena. '
  'arena_participants.current_score = SUM of all rows for that user in that arena.';
```

**Privacy rule for gym owners:**
- Gym A owner sees that Marko (opt-in via Gym A) has 800 total, 450 from "Tvoja teretana", 350 from "Ostale teretane"
- Gym A owner does NOT see the exact names of other gyms (privacy between gym owners)
- Superadmin sees the full per-gym breakdown

##### 3.10.2 Updated `update_arena_scores()` — Cross-Gym Scoring

The existing function signature stays the same `(p_user_id UUID, p_gym_id UUID, p_drops INTEGER)` — `p_gym_id` is the **session gym** (where the workout happened), not the opt-in gym.

```sql
CREATE OR REPLACE FUNCTION public.update_arena_scores(
  p_user_id UUID,
  p_gym_id UUID,
  p_drops INTEGER
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_streak INTEGER;
  v_arena RECORD;
BEGIN
  -- Get current streak from profile
  SELECT COALESCE(streak_days, 0) INTO v_profile_streak
  FROM public.profiles
  WHERE id = p_user_id;

  -- ============================================================
  -- TOTAL_DROPS arenas — cross-gym scoring
  -- ============================================================
  FOR v_arena IN
    SELECT sa.id AS arena_id
    FROM public.sweat_arenas sa
    JOIN public.arena_gyms ag ON ag.arena_id = sa.id AND ag.gym_id = p_gym_id
    JOIN public.arena_participants ap ON ap.arena_id = sa.id AND ap.user_id = p_user_id
    WHERE sa.is_active = true
      AND sa.is_finalized = false
      AND sa.start_date <= CURRENT_DATE
      AND sa.end_date >= CURRENT_DATE
      AND sa.scoring_model = 'total_drops'
  LOOP
    -- 1. UPSERT per-gym breakdown
    INSERT INTO public.arena_participant_gym_scores
      (arena_id, user_id, gym_id, score, sessions)
    VALUES
      (v_arena.arena_id, p_user_id, p_gym_id, p_drops, 1)
    ON CONFLICT (arena_id, user_id, gym_id)
    DO UPDATE SET
      score = arena_participant_gym_scores.score + EXCLUDED.score,
      sessions = arena_participant_gym_scores.sessions + 1,
      updated_at = NOW();

    -- 2. Recalculate total from all gym breakdowns
    UPDATE public.arena_participants
    SET current_score = (
      SELECT COALESCE(SUM(score), 0)
      FROM public.arena_participant_gym_scores
      WHERE arena_id = v_arena.arena_id
        AND user_id = p_user_id
    ),
    updated_at = NOW()
    WHERE arena_id = v_arena.arena_id
      AND user_id = p_user_id;
  END LOOP;

  -- ============================================================
  -- STREAK_DAYS arenas — same as before (streak is global, not per-gym)
  -- But still track the session in gym_scores for informational purposes
  -- ============================================================
  FOR v_arena IN
    SELECT sa.id AS arena_id
    FROM public.sweat_arenas sa
    JOIN public.arena_gyms ag ON ag.arena_id = sa.id AND ag.gym_id = p_gym_id
    JOIN public.arena_participants ap ON ap.arena_id = sa.id AND ap.user_id = p_user_id
    WHERE sa.is_active = true
      AND sa.is_finalized = false
      AND sa.start_date <= CURRENT_DATE
      AND sa.end_date >= CURRENT_DATE
      AND sa.scoring_model = 'streak_days'
  LOOP
    -- Track session in breakdown (informational: which gyms contributed sessions)
    INSERT INTO public.arena_participant_gym_scores
      (arena_id, user_id, gym_id, score, sessions)
    VALUES
      (v_arena.arena_id, p_user_id, p_gym_id, p_drops, 1)
    ON CONFLICT (arena_id, user_id, gym_id)
    DO UPDATE SET
      score = arena_participant_gym_scores.score + EXCLUDED.score,
      sessions = arena_participant_gym_scores.sessions + 1,
      updated_at = NOW();

    -- Score = streak (global, NOT sum of per-gym)
    UPDATE public.arena_participants
    SET current_score = GREATEST(
      COALESCE(current_score, 0),
      COALESCE(v_profile_streak, 0)
    ),
    updated_at = NOW()
    WHERE arena_id = v_arena.arena_id
      AND user_id = p_user_id;
  END LOOP;
END;
$$;
```

**Key rules:**
- `p_gym_id` is the **session gym** (where user worked out), checked against `arena_gyms`
- If session gym is NOT in `arena_gyms` for an arena → that arena is skipped (JOIN handles it)
- For `total_drops`: `current_score = SUM(gym_scores)` — per-gym breakdown IS the source of truth
- For `streak_days`: `current_score = profile.streak_days` (global) — per-gym `score` stores drops earned for info only
- `arena_participants.gym_id` remains the **opt-in gym** (unchanged, used for refunds, leaderboard gym label)

##### 3.10.3 Updated `update_arena_scores_periodic()` — Cross-Gym for days_visited/variety_score

```sql
CREATE OR REPLACE FUNCTION public.update_arena_scores_periodic()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INTEGER := 0;
BEGIN
  -- ============================================================
  -- DAYS_VISITED: count distinct dates across ALL participating gyms
  -- Also populate per-gym breakdown (days per gym)
  -- ============================================================

  -- 1. Update per-gym breakdown for days_visited
  INSERT INTO public.arena_participant_gym_scores (arena_id, user_id, gym_id, score, sessions)
  SELECT
    ap.arena_id,
    ap.user_id,
    ag.gym_id,
    COUNT(DISTINCT DATE(s.started_at))::NUMERIC AS score,
    COUNT(s.id) AS sessions
  FROM public.arena_participants ap
  JOIN public.sweat_arenas sa ON sa.id = ap.arena_id
  JOIN public.arena_gyms ag ON ag.arena_id = sa.id
  JOIN public.sessions s ON s.user_id = ap.user_id
    AND s.gym_id = ag.gym_id
    AND DATE(s.started_at) >= sa.start_date
    AND DATE(s.started_at) <= sa.end_date
    AND s.drops_earned > 0
  WHERE sa.scoring_model = 'days_visited'
    AND sa.is_active = true AND NOT sa.is_finalized
  GROUP BY ap.arena_id, ap.user_id, ag.gym_id
  ON CONFLICT (arena_id, user_id, gym_id)
  DO UPDATE SET
    score = EXCLUDED.score,
    sessions = EXCLUDED.sessions,
    updated_at = NOW();

  -- 2. Update total score (distinct days across ALL gyms — NOT sum of per-gym)
  WITH updated_days AS (
    UPDATE public.arena_participants ap
    SET current_score = sub.day_count
    FROM (
      SELECT ap2.id AS participant_id,
        COUNT(DISTINCT DATE(s.started_at)) AS day_count
      FROM public.arena_participants ap2
      JOIN public.sweat_arenas sa ON sa.id = ap2.arena_id
      JOIN public.arena_gyms ag ON ag.arena_id = sa.id
      JOIN public.sessions s ON s.user_id = ap2.user_id
        AND s.gym_id = ag.gym_id
        AND DATE(s.started_at) >= sa.start_date
        AND DATE(s.started_at) <= sa.end_date
        AND s.drops_earned > 0
      WHERE sa.scoring_model = 'days_visited'
        AND sa.is_active = true AND NOT sa.is_finalized
      GROUP BY ap2.id
    ) sub
    WHERE ap.id = sub.participant_id
    RETURNING ap.id
  )
  SELECT COUNT(*) INTO v_updated FROM updated_days;

  -- ============================================================
  -- VARIETY_SCORE: count distinct machines across ALL participating gyms
  -- Also populate per-gym breakdown (machines per gym)
  -- ============================================================

  -- 1. Update per-gym breakdown for variety_score
  INSERT INTO public.arena_participant_gym_scores (arena_id, user_id, gym_id, score, sessions)
  SELECT
    ap.arena_id,
    ap.user_id,
    ag.gym_id,
    COUNT(DISTINCT s.machine_id)::NUMERIC AS score,
    COUNT(s.id) AS sessions
  FROM public.arena_participants ap
  JOIN public.sweat_arenas sa ON sa.id = ap.arena_id
  JOIN public.arena_gyms ag ON ag.arena_id = sa.id
  JOIN public.sessions s ON s.user_id = ap.user_id
    AND s.gym_id = ag.gym_id
    AND DATE(s.started_at) >= sa.start_date
    AND DATE(s.started_at) <= sa.end_date
    AND s.drops_earned > 0
    AND s.machine_id IS NOT NULL
  WHERE sa.scoring_model = 'variety_score'
    AND sa.is_active = true AND NOT sa.is_finalized
  GROUP BY ap.arena_id, ap.user_id, ag.gym_id
  ON CONFLICT (arena_id, user_id, gym_id)
  DO UPDATE SET
    score = EXCLUDED.score,
    sessions = EXCLUDED.sessions,
    updated_at = NOW();

  -- 2. Update total score (distinct machines across ALL gyms)
  WITH updated_variety AS (
    UPDATE public.arena_participants ap
    SET current_score = sub.machine_count
    FROM (
      SELECT ap2.id AS participant_id,
        COUNT(DISTINCT s.machine_id) AS machine_count
      FROM public.arena_participants ap2
      JOIN public.sweat_arenas sa ON sa.id = ap2.arena_id
      JOIN public.arena_gyms ag ON ag.arena_id = sa.id
      JOIN public.sessions s ON s.user_id = ap2.user_id
        AND s.gym_id = ag.gym_id
        AND DATE(s.started_at) >= sa.start_date
        AND DATE(s.started_at) <= sa.end_date
        AND s.drops_earned > 0
        AND s.machine_id IS NOT NULL
      WHERE sa.scoring_model = 'variety_score'
        AND sa.is_active = true AND NOT sa.is_finalized
      GROUP BY ap2.id
    ) sub
    WHERE ap.id = sub.participant_id
    RETURNING ap.id
  )
  SELECT COUNT(*) + v_updated INTO v_updated FROM updated_variety;

  RETURN v_updated;
END;
$$;
```

**Score calculation per scoring_model:**

| Scoring Model | `current_score` = | `gym_scores.score` per gym = |
|---|---|---|
| `total_drops` | `SUM(gym_scores.score)` | Drops earned at that gym |
| `streak_days` | `profile.streak_days` (global) | Drops earned at that gym (informational) |
| `days_visited` | Distinct dates across ALL gyms | Distinct dates at that specific gym |
| `variety_score` | Distinct machines across ALL gyms | Distinct machines at that specific gym |

> **Important:** For `days_visited` and `variety_score`, `current_score ≠ SUM(gym_scores)` because visiting 2 gyms on the same day counts as 1 day total, not 2.

##### 3.10.4 Updated `get_available_arenas()` — Add `gym_score_breakdown` JSONB

Add to return columns:
```sql
-- New return column
gym_score_breakdown JSONB  -- [{"gym_id":"...","gym_name":"...","score":450,"sessions":12},...]
```

Add to SELECT:
```sql
(
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'gym_id', apgs.gym_id,
      'gym_name', g.name,
      'score', apgs.score,
      'sessions', apgs.sessions
    ) ORDER BY apgs.score DESC
  ), '[]'::jsonb)
  FROM public.arena_participant_gym_scores apgs
  JOIN public.gyms g ON g.id = apgs.gym_id
  WHERE apgs.arena_id = sa.id
    AND apgs.user_id = p_user_id
) AS gym_score_breakdown
```

This returns `NULL` for users not opted in, empty array for opted-in with no scores yet.

##### 3.10.5 Updated `get_arena_results()` — Add `gym_breakdown` JSONB

Two different views based on caller role:

**For superadmin:** Full per-gym breakdown
```sql
-- New return column
gym_breakdown JSONB
-- Format: [{"gym_id":"...","gym_name":"...","score":450,"sessions":12},...]
```

**For gym owners/admins:** Privacy-respecting breakdown
```sql
-- Format: {"own_gym_score": 450, "other_gyms_score": 350, "total_sessions": 25}
-- "own_gym" = caller's gym_id, "other" = everything else (no gym names)
```

Implementation in SQL:
```sql
-- In get_arena_results(), add gym_breakdown column:
CASE
  WHEN public.is_superadmin(auth.uid()) THEN
    (SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'gym_id', apgs.gym_id,
        'gym_name', g.name,
        'score', apgs.score,
        'sessions', apgs.sessions
      ) ORDER BY apgs.score DESC
    ), '[]'::jsonb)
    FROM public.arena_participant_gym_scores apgs
    JOIN public.gyms g ON g.id = apgs.gym_id
    WHERE apgs.arena_id = p_arena_id AND apgs.user_id = ar.user_id)
  ELSE
    -- For gym owner: show own gym score vs others
    (SELECT jsonb_build_object(
      'own_gym_score', COALESCE(SUM(
        CASE WHEN apgs.gym_id = (
          SELECT admin_gym_id FROM public.profiles WHERE id = auth.uid()
        ) THEN apgs.score ELSE 0 END
      ), 0),
      'other_gyms_score', COALESCE(SUM(
        CASE WHEN apgs.gym_id != (
          SELECT admin_gym_id FROM public.profiles WHERE id = auth.uid()
        ) THEN apgs.score ELSE 0 END
      ), 0),
      'total_sessions', COALESCE(SUM(apgs.sessions), 0)
    )
    FROM public.arena_participant_gym_scores apgs
    WHERE apgs.arena_id = p_arena_id AND apgs.user_id = ar.user_id)
END AS gym_breakdown
```

#### 3.11 Summary of all DB changes

| Object | Action | Description |
|---|---|---|
| `arena_invitations` table | CREATE | Invitation system for global arenas |
| `arena_participant_gym_scores` table | CREATE | Per-gym score breakdown for cross-gym scoring |
| `sweat_arenas.opt_in_type` | ADD COLUMN | free/drops/streak/level |
| `sweat_arenas.opt_in_value` | ADD COLUMN | Numeric value for opt-in requirement |
| `sweat_arenas.card_color` | ADD COLUMN | Custom arena card color |
| `sweat_arenas.card_text_color` | ADD COLUMN | Custom arena text color |
| `sweat_arenas.card_gradient_end` | ADD COLUMN | Optional gradient end |
| `arena_participants.opt_in_drops_paid` | ADD COLUMN | Tracks drops paid for refund on cancel |
| `respond_to_arena_invitation()` | CREATE | Accept/decline invitation |
| `send_arena_invitations()` | CREATE | Superadmin bulk invite |
| `cancel_arena()` | CREATE | Superadmin cancel + drops refund + push notification |
| `opt_into_arena()` | REPLACE | Add opt-in requirement checks + record opt_in_drops_paid |
| `update_arena_scores()` | REPLACE | Cross-gym scoring: upsert per-gym breakdown, recalculate total |
| `update_arena_scores_periodic()` | REPLACE | Cross-gym scoring for days_visited/variety_score |
| `get_available_arenas()` | REPLACE | Add gym_score_breakdown JSONB + upcoming arenas + new fields |
| `get_arena_results()` | REPLACE | Add gym_breakdown JSONB (full for superadmin, privacy for gym owners) |

---

## 4. ADMIN PANEL CHANGES (Admin Coder)

### 4.1 Fix: Allow `gym_admin` to create local arenas

**File:** `apps/admin-panel/lib/actions/arena-actions.ts`

**Change in `createArena()`** (line 149):
```
BEFORE: if (!['superadmin', 'gym_owner'].includes(profile.role))
AFTER:  if (!['superadmin', 'gym_owner', 'gym_admin'].includes(profile.role))
```

**Change in `updateArena()`** (line 224):
```
BEFORE: if (!['superadmin', 'gym_owner'].includes(profile.role))
AFTER:  if (!['superadmin', 'gym_owner', 'gym_admin'].includes(profile.role))
```

### 4.2 New Server Actions: Invitation Management

**File:** `apps/admin-panel/lib/actions/arena-invitation-actions.ts`

Create new server actions:

```typescript
// Actions needed:
export async function sendArenaInvitations(arenaId: string, gymIds: string[], revenueSharePercent: number, revenueShareNote?: string)
export async function getArenaInvitations(arenaId: string): Promise<ArenaInvitation[]>
export async function getPendingInvitations(gymId?: string): Promise<ArenaInvitation[]>  // For gym owners
export async function respondToInvitation(invitationId: string, response: 'accepted' | 'declined')
export async function getArenaResults(arenaId: string): Promise<ArenaResult[]>
```

### 4.3 Update `ArenasManager` Component — Add new form fields

**File:** `apps/admin-panel/components/modules/ArenasManager.tsx`

Add to the Create/Edit form:

1. **Opt-in Requirements Section** (after Scoring Model):
   - `opt_in_type` dropdown: Free | Drops Cost | Streak Requirement | Level Requirement
   - `opt_in_value` number input (hidden when type is 'free')
   - Help text explaining each option

2. **Branding Section** (after Sponsor Details):
   - `card_color` color picker input (hex)
   - `card_text_color` color picker input (hex)
   - `card_gradient_end` optional color picker
   - **Live Preview Card** — render a mini arena card with the selected colors

3. **Invitation Button** (only for superadmin + scope != 'local'):
   - "Invite Gyms" button that opens invitation modal
   - Shows gym list with checkboxes
   - Revenue share % input
   - Revenue share note textarea

4. **Arena Card in List** — show branding colors:
   - Apply `card_color` as left border or accent
   - Show opt-in type badge ("Free" / "50 💧" / "7🔥 streak")

### 4.4 New Component: `ArenaLivePreview`

**File:** `apps/admin-panel/components/modules/ArenaLivePreview.tsx`

A component that renders a phone-sized mockup of how the arena card will look in the mobile app.

```typescript
interface ArenaLivePreviewProps {
  name: string;
  sponsorName: string;
  sponsorLogo?: string;
  scoringModel: string;
  cardColor?: string;        // null = default teal
  cardTextColor?: string;    // null = default white
  cardGradientEnd?: string;  // null = no gradient
  optInType: string;
  optInValue: number;
  prizes: Array<{ rank: number; prize: string }>;
}
```

The preview should:
- Use a dark background (#000000) to simulate mobile app
- Show the arena card with the specified colors
- Show sponsor logo if provided
- Show opt-in badge
- Show prizes preview
- Update in real-time as admin changes form values
- Be ~320px wide (phone-width)

### 4.5 Cancel Arena — Admin action + push notifications

**File:** `apps/admin-panel/lib/actions/arena-actions.ts`

Add `cancelArena()` server action:
```typescript
export async function cancelArena(arenaId: string) {
  // 1. Call supabase.rpc('cancel_arena', { p_arena_id: arenaId })
  // 2. If success:
  //    a. Fetch all participant expo_push_tokens
  //    b. Call send-push edge function with cancellation message
  //    c. Include drops refund info in push body if opt_in_type was 'drops'
  // 3. Return { success, participantsRefunded }
}
```

**UI:** Add "Cancel Arena" button (red, with confirmation dialog) on `ArenaDetail`:
- Visible only for superadmin
- Only for active/upcoming arenas (not finalized)
- Confirm dialog: "Are you sure? This will cancel the arena and refund {N} participants."
- After cancel: show success toast with refund count

### 4.6 New Component: `ArenaInvitationsManager`


**File:** `apps/admin-panel/components/modules/ArenaInvitationsManager.tsx`

Shows the invitation status for a global arena:
- Table of invited gyms with status (pending / accepted / declined)
- Gym name, owner name, revenue share %, response date
- "Re-invite" button for declined (creates new invitation)
- Summary: X/Y gyms accepted

### 4.7 Update `ArenaDetail` — Add post-arena results tab + gym breakdown

**File:** `apps/admin-panel/components/modules/ArenaDetail.tsx`

After finalization:
- Show "Results" tab with ranking, prizes, redemption codes, redemption status
- Call `getArenaResults()` server action
- Show table: Rank | User | Gym | Score | **Breakdown** | Prize | Code | Status
- **NEW "Breakdown" column:**
  - **Superadmin view:** Expandable row showing per-gym scores
    ```
    #1  Marko P.    800 drops
                    [Gym A: 450 | Gym B: 200 | Gym C: 150]
    ```
  - **Gym owner view:** Shows "Tvoja: X | Ostale: Y"
    ```
    #1  Marko P.    800 drops total
                    [Tvoja: 450 | Ostale: 350]
    ```
  - Data comes from `gym_breakdown` JSONB in `get_arena_results()`
- "Notify Winners" button — calls edge function to re-send push notifications
- Export results as CSV (optional but nice)

**Active arena leaderboard (before finalization):**
- Also show gym breakdown inline for each leaderboard entry
- Same privacy rules: superadmin = full, gym owner = own vs others

### 4.8 New Page: Pending Invitations for Gym Owners

**File:** `apps/admin-panel/app/dashboard/gym/[id]/invitations/page.tsx`

Gym owners/admins see:
- List of pending arena invitations
- Arena name, dates, scoring model, prizes, revenue share
- "Accept" / "Decline" buttons
- Accepted arenas appear in their arenas list (read-only)

Add navigation link in sidebar under the gym section.

### 4.9 Update Sidebar Navigation

Add "Invitations" link under gym section (badge with count of pending invitations).

### 4.10 Form Validation Updates

Update `createArenaSchema` in `arena-actions.ts`:
```typescript
// Add new fields to schema
opt_in_type: z.enum(['free', 'drops', 'streak', 'level']).default('free'),
opt_in_value: z.number().int().min(0).default(0),
card_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().or(z.literal('')),
card_text_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().or(z.literal('')),
card_gradient_end: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().or(z.literal('')),
```

---

## 5. MOBILE APP CHANGES (Mobile Coder)

### 5.1 Update `useAvailableArenas` Hook — Handle new fields

**File:** `apps/mobile-app/hooks/useAvailableArenas.ts`

Update the `AvailableArena` interface:

```typescript
export interface AvailableArena {
  arena_id: string;
  name: string;
  description: string | null;
  sponsor_name: string;
  sponsor_logo: string | null;
  scoring_model: string;
  start_date: string;
  end_date: string;
  participant_count: number;
  user_opted_in: boolean;
  user_rank: number | null;
  user_score: number | null;
  prizes: Array<{ rank: number; prize: string; value?: string }>;
  // NEW fields
  opt_in_type: string;    // 'free' | 'drops' | 'streak' | 'level'
  opt_in_value: number;
  card_color: string | null;
  card_text_color: string | null;
  card_gradient_end: string | null;
  arena_status: string;   // 'upcoming' | 'active' | 'ended'
  gym_score_breakdown: Array<{
    gym_id: string;
    gym_name: string;
    score: number;
    sessions: number;
  }> | null;              // Per-gym score breakdown (only for opted-in users)
}
```

### 5.2 Update `arenas.tsx` — Upcoming arenas section + branding

**File:** `apps/mobile-app/app/arenas.tsx`

Changes:
1. **Split arenas into two lists:**
   - `upcomingArenas` — `arena_status === 'upcoming'`
   - `activeArenas` — `arena_status === 'active'`

2. **Upcoming Arena Card:**
   - Show countdown timer: "Starts in X days"
   - "Notify Me" / "Opt-in Early" button (calls `opt_into_arena()`)
   - Slightly different visual treatment (dimmed, pulsing border)

3. **Apply custom branding:**
   - Use `card_color` for card accent/border
   - Use `card_text_color` for text
   - Use `card_gradient_end` if provided for card background gradient
   - Fall back to default teal if no custom colors

4. **Opt-in badge on card:**
   - Show "Free" / "50 💧" / "🔥 7 days" / "⭐ 1000" based on `opt_in_type` and `opt_in_value`

### 5.3 Update `arena/[id]/index.tsx` — Upcoming state + opt-in requirements

**File:** `apps/mobile-app/app/arena/[id]/index.tsx`

Changes:
1. **Upcoming arena state:**
   - Show countdown timer prominently
   - "Starts on [date]" header
   - Allow opt-in even for upcoming arenas
   - Show animated countdown

2. **Opt-in requirements display:**
   - Before opt-in button, show requirement:
     - Free: no extra text
     - Drops: "Costs 50 💧 to join" with balance check
     - Streak: "Requires 7-day streak 🔥" with current streak display
     - Level: "Requires 1000 total drops ⭐"
   - Disable opt-in button if requirement not met
   - Show friendly error message if user tries to opt in without meeting requirement

3. **Custom branding:**
   - Apply `card_color`, `card_text_color` to the detail header
   - Use as accent color throughout the detail page

### 5.4 Cross-Gym Score Breakdown Component

**File:** `apps/mobile-app/components/ArenaGymBreakdown.tsx` (new component)

A reusable component to display per-gym score breakdown:

```typescript
interface ArenaGymBreakdownProps {
  breakdown: Array<{ gym_id: string; gym_name: string; score: number; sessions: number }>;
  totalScore: number;
  scoringModel: string;
}
```

**Display:**
```
Tvoj score: 800 drops
  • FitPass Beograd    450 💧  (56%)
  • FitPass Novi Sad   200 💧  (25%)
  • FitPass Niš        150 💧  (19%)
```

**Rules:**
- Only render if `breakdown.length > 1` (don't show breakdown for single-gym)
- Sort by score DESC
- Show percentage of total for each gym
- Use glassmorphism card, FadeInDown animation
- Score label adapts to scoring_model:
  - `total_drops` → `{score} 💧`
  - `days_visited` → `{score} days`
  - `variety_score` → `{score} machines`
  - `streak_days` → `{score} 💧 earned` (breakdown shows drops, not streak)

**Used in:**
- `arena/[id]/index.tsx` — below header, above leaderboard
- `arenas.tsx` — optional expandable on arena cards (when opted in)

### 5.5 Update `home.tsx` — Upcoming arena banner

**File:** `apps/mobile-app/app/home.tsx`

In the arena carousel/section:
- Show upcoming arenas with "Coming Soon" badge + countdown
- Differentiate visually from active arenas

### 5.6 Error Handling for Opt-in

When `opt_into_arena()` returns an error:
- Parse error message and show user-friendly toast/alert
- "Not enough drops" → "You need X more drops to join this arena"
- "Streak too low" → "Keep your streak going! You need X more days"
- "Not enough reputation" → "Earn X more drops to unlock this arena"

---

## 6. EXECUTION ORDER

### Phase 1: Database (Supabase DBA) — Must be first

```
Step 1: Create migration 20260306000001_arena_invitations_and_enhancements.sql
        - arena_invitations table + RLS
        - ALTER sweat_arenas (add opt_in_type, opt_in_value, card_color, card_text_color, card_gradient_end)
        - respond_to_arena_invitation() RPC
        - send_arena_invitations() RPC
        - Updated opt_into_arena() RPC
        - Updated get_available_arenas() RPC
        - get_arena_results() RPC

Step 2: Create migration 20260306100001_cross_gym_scoring.sql
        - CREATE TABLE arena_participant_gym_scores + RLS + indexes
        - REPLACE update_arena_scores() with cross-gym scoring logic
        - REPLACE update_arena_scores_periodic() with per-gym breakdown
        - REPLACE get_available_arenas() to add gym_score_breakdown JSONB
        - REPLACE get_arena_results() to add gym_breakdown JSONB (privacy-aware)

Step 3: Apply migrations locally: supabase db reset OR supabase migration up

Step 4: Verify all functions and table exist:
        SELECT proname FROM pg_proc WHERE pronamespace = 'public'::regnamespace
          AND proname IN (
            'opt_into_arena', 'get_available_arenas', 'finalize_arena',
            'respond_to_arena_invitation', 'send_arena_invitations', 'get_arena_results',
            'update_arena_scores', 'update_arena_scores_periodic'
          );
        -- Should return 8 rows
        SELECT tablename FROM pg_tables
          WHERE schemaname = 'public' AND tablename = 'arena_participant_gym_scores';
        -- Should return 1 row
```

### Phase 2: Admin Panel (Admin Coder) — After DB migration

```
Step 1: Fix gym_admin arena creation (arena-actions.ts) — 5 min fix
Step 2: Add new fields to arena form schema + insert/update (arena-actions.ts)
Step 3: Create arena-invitation-actions.ts (server actions)
Step 4: Update ArenasManager form — add opt-in, branding, invitation sections
Step 5: Create ArenaLivePreview component
Step 6: Add cancelArena() server action + cancel button on ArenaDetail
Step 7: Update ArenaDetail — add post-finalization results tab + cancel button
Step 8: Create ArenaInvitationsManager component
Step 9: Create gym invitations page
Step 10: Update sidebar with invitations link + badge
```

### Phase 3: Mobile App (Mobile Coder) — After DB migration

```
Step 1: Update AvailableArena interface in useAvailableArenas.ts (add gym_score_breakdown)
Step 2: Update arenas.tsx — upcoming section, branding, opt-in badges
Step 3: Create ArenaGymBreakdown.tsx component (per-gym score display)
Step 4: Update arena/[id] — countdown, opt-in requirements, branding, gym breakdown
Step 5: Update home.tsx — upcoming arena banner
Step 6: Error handling for opt-in failures
```

---

## 7. EDGE CASES TO HANDLE

### Database
- Arena invitation for a gym that's already participating → `ON CONFLICT DO NOTHING`
- User tries to opt into arena after it ended → error message
- User with insufficient drops tries to opt into "drops" arena → clear error
- User's streak drops below requirement after opting in → keep them in (don't kick)
- Arena with 0 gyms (global network) → still works via `arena_scope = 'network'`
- Double-opt-in race condition → UNIQUE constraint on `(arena_id, user_id)` handles it
- Finalize arena that hasn't started yet → prevent (check `start_date <= CURRENT_DATE`)
- Cancel arena with 0 participants → success, 0 refunds, no push notifications
- Cancel arena where opt_in_value changed after some users opted in → use per-participant `opt_in_drops_paid`
- Cancel already cancelled/inactive arena → clear error message
- Cancel finalized arena → prevent (already distributed prizes)
- Invitation to a gym that doesn't exist → FK constraint catches it
- Revenue share = 0 should be valid (means no share, not an error)
- **Cross-gym scoring:** Session in a gym NOT in `arena_gyms` → silently ignored (JOIN filters it)
- **Cross-gym scoring:** User is member of only 1 participating gym → breakdown has 1 entry, SUM = current_score
- **Cross-gym scoring:** User leaves a gym mid-arena → existing breakdown rows stay (historical scores preserved)
- **Cross-gym scoring:** New gym added to arena mid-competition → future sessions at that gym will create new breakdown rows
- **Cross-gym scoring:** `days_visited` total ≠ SUM of per-gym days (same day at 2 gyms = 1 day total)
- **Cross-gym scoring:** `cancel_arena()` should also clean up `arena_participant_gym_scores` (CASCADE handles it via arena_id FK)

### Admin Panel
- Empty color inputs → treat as NULL (use defaults)
- Invalid hex color → Zod validation catches it
- Editing a finalized arena → disable form (read-only)
- Deleting arena with active invitations → CASCADE handles it
- Gym owner sees accepted global arena → read-only mode (no edit/delete buttons)
- Live preview with no colors set → show default teal theme

### Mobile App
- User sees "upcoming" arena but arena starts while they're viewing → refresh on focus
- Arena card with very long name → `numberOfLines={1}` truncation
- Arena with no sponsor logo → fallback icon (already handled)
- Countdown to 0 → "Starting now!" text, then refresh
- Opt-in button pressed multiple times → loading state + disable button
- Network error during opt-in → toast error, keep button enabled
- **Gym breakdown:** User with 1 gym → don't show breakdown section (just total)
- **Gym breakdown:** `gym_score_breakdown` is null → user not opted in, don't render breakdown
- **Gym breakdown:** Empty breakdown array → user opted in but no sessions yet → show "No sessions yet"
- **Gym breakdown:** Very long gym name → truncate with `numberOfLines={1}`

---

## 8. TESTING CHECKLIST

### Database Tests
- [ ] Create invitation, accept it, verify gym appears in `arena_gyms`
- [ ] Decline invitation, verify gym is NOT in `arena_gyms`
- [ ] Opt into "drops" arena with sufficient balance → success, balance deducted
- [ ] Opt into "drops" arena with insufficient balance → error
- [ ] Opt into "streak" arena with sufficient streak → success
- [ ] Opt into "streak" arena with insufficient streak → error
- [ ] `get_available_arenas()` returns upcoming arenas with `arena_status = 'upcoming'`
- [ ] `get_available_arenas()` returns new fields (opt_in_type, card_color, etc.)
- [ ] `get_arena_results()` returns ranking with redemption codes after finalization
- [ ] Finalize arena → arena_results created, redemptions created with codes
- [ ] `cancel_arena()` with drops opt-in → drops refunded to all participants (profiles + gym_memberships)
- [ ] `cancel_arena()` with drops opt-in → drops_transactions entries with type='refund' created
- [ ] `cancel_arena()` with free opt-in → arena deactivated, no drops changes
- [ ] `cancel_arena()` on finalized arena → error "Cannot cancel a finalized arena"
- [ ] `cancel_arena()` by non-superadmin → error "Only superadmin can cancel"
- [ ] `cancel_arena()` uses `opt_in_drops_paid` per participant (not arena-level value)
- [ ] **Cross-gym:** Session at Gym B (participating) scores in arena where user opted-in via Gym A
- [ ] **Cross-gym:** Session at Gym D (NOT participating) does NOT affect arena score
- [ ] **Cross-gym:** `arena_participant_gym_scores` row created for each gym where user has sessions
- [ ] **Cross-gym:** `arena_participants.current_score` = SUM of all per-gym scores (for total_drops)
- [ ] **Cross-gym:** `get_available_arenas()` returns `gym_score_breakdown` with correct per-gym data
- [ ] **Cross-gym:** `get_arena_results()` returns full breakdown for superadmin
- [ ] **Cross-gym:** `get_arena_results()` returns own_gym vs other_gyms for gym owner (no gym names)
- [ ] **Cross-gym:** `update_arena_scores_periodic()` populates per-gym breakdown for days_visited/variety_score
- [ ] **Cross-gym:** RLS: user can only see own gym score rows
- [ ] **Cross-gym:** RLS: gym owner sees breakdown of users who opted-in through their gym

### Admin Panel Tests
- [ ] `gym_admin` can create local arenas (was broken)
- [ ] Superadmin can create global arena and invite gyms
- [ ] Gym owner sees pending invitation with revenue share info
- [ ] Accept invitation → arena appears in gym's arena list
- [ ] Decline invitation → arena does NOT appear
- [ ] Arena form shows opt-in fields
- [ ] Arena form shows branding fields
- [ ] Live preview updates as colors change
- [ ] Post-finalization: results tab shows ranking + redemption codes
- [ ] Accepted global arena shows in read-only mode for gym owner
- [ ] Cancel arena button visible only for superadmin on active/upcoming arenas
- [ ] Cancel arena shows confirmation dialog with participant count
- [ ] Cancel arena sends push notifications to all participants
- [ ] Cancel arena with drops refund shows correct refund amount in toast
- [ ] **Breakdown:** Superadmin sees full per-gym breakdown in results table
- [ ] **Breakdown:** Gym owner sees "Tvoja: X | Ostale: Y" in results table
- [ ] **Breakdown:** Active leaderboard shows breakdown inline for each participant

### Mobile App Tests
- [ ] Upcoming arenas appear in arenas list with countdown
- [ ] "Starts in X days" countdown is accurate
- [ ] Opt-in for upcoming arena works
- [ ] Arena cards show custom branding colors
- [ ] Opt-in badge shows correct requirement text
- [ ] Opt-in with insufficient drops shows clear error
- [ ] Opt-in with insufficient streak shows clear error
- [ ] Arena detail page shows countdown for upcoming arenas
- [ ] Home screen shows upcoming arenas distinctly
- [ ] **Breakdown:** Arena detail shows per-gym score breakdown when opted in
- [ ] **Breakdown:** Single-gym user does NOT see breakdown (just total)
- [ ] **Breakdown:** Multi-gym user sees all contributing gyms with scores + percentages
- [ ] **Breakdown:** Breakdown sorts by score DESC

---

## 9. AGENT PROMPTS

### 9.1 Supabase DBA Agent Prompt

```
CONTEXT: You are the Supabase DBA agent for SWEATDROP. Apply the following migration.

TASK: Create migration file `backend/supabase/migrations/20260306000001_arena_invitations_and_enhancements.sql`

This migration must:

1. CREATE TABLE `arena_invitations` with columns:
   - id (UUID PK), arena_id (FK sweat_arenas), invited_gym_id (FK gyms),
     invited_by (FK profiles), invited_user_id (FK profiles nullable),
     status (pending/accepted/declined), revenue_share_percent (NUMERIC(5,2)),
     revenue_share_note (TEXT), responded_at, responded_by, created_at, updated_at
   - UNIQUE(arena_id, invited_gym_id)
   - Indexes on arena_id, invited_gym_id, invited_user_id, status
   - RLS: superadmin full, gym_staff SELECT+UPDATE on their gyms

2. ALTER TABLE `sweat_arenas` ADD COLUMNS:
   - opt_in_type TEXT DEFAULT 'free' CHECK IN ('free','drops','streak','level')
   - opt_in_value INTEGER DEFAULT 0
   - card_color TEXT DEFAULT NULL
   - card_text_color TEXT DEFAULT NULL
   - card_gradient_end TEXT DEFAULT NULL

3. CREATE OR REPLACE FUNCTION `respond_to_arena_invitation(p_invitation_id UUID, p_response TEXT)`:
   - Validate response is 'accepted' or 'declined'
   - Verify caller is gym owner/admin of invited gym
   - If accepted: insert into arena_gyms
   - If declined: delete from arena_gyms if pre-added
   - Update invitation status

4. CREATE OR REPLACE FUNCTION `send_arena_invitations(p_arena_id UUID, p_gym_ids UUID[], p_revenue_share_percent NUMERIC, p_revenue_share_note TEXT)`:
   - Only superadmin can call
   - Insert invitations for each gym (ON CONFLICT DO NOTHING)
   - Find gym owner to set invited_user_id

5. CREATE OR REPLACE FUNCTION `opt_into_arena(p_arena_id UUID)`:
   - Keep existing logic but ADD requirement checks:
   - If opt_in_type = 'drops': check local_drops_balance >= opt_in_value, deduct if passing
   - If opt_in_type = 'streak': check profile.streak_days >= opt_in_value
   - If opt_in_type = 'level': check profile.total_drops >= opt_in_value
   - ALLOW opt-in for future arenas (remove start_date <= CURRENT_DATE check, keep end_date >= CURRENT_DATE)

6. CREATE OR REPLACE FUNCTION `get_available_arenas(p_user_id UUID)`:
   - Add new return columns: opt_in_type, opt_in_value, card_color, card_text_color, card_gradient_end, arena_status
   - arena_status = 'upcoming' when start_date > CURRENT_DATE, 'active' otherwise
   - REMOVE the `sa.start_date <= CURRENT_DATE` filter (show upcoming arenas)
   - Keep `sa.end_date >= CURRENT_DATE` filter (hide ended arenas)
   - Order: upcoming first, then active, then by start_date ASC

7. CREATE OR REPLACE FUNCTION `get_arena_results(p_arena_id UUID)`:
   - Return finalized ranking with user info, scores, prizes, redemption codes, redemption status
   - Join arena_results → profiles → gyms → redemptions

8. CREATE OR REPLACE FUNCTION `cancel_arena(p_arena_id UUID)`:
   - Only superadmin can cancel (check profiles.role = 'superadmin')
   - Cannot cancel finalized arenas (is_finalized = true → error)
   - Cannot cancel already inactive arenas (is_active = false → error)
   - If opt_in_type = 'drops' AND opt_in_value > 0:
     * Loop through ALL arena_participants for this arena
     * For each participant:
       - UPDATE profiles SET total_drops = total_drops + opt_in_drops_paid
       - UPDATE gym_memberships SET local_drops_balance = local_drops_balance + opt_in_drops_paid
       - INSERT INTO drops_transactions (user_id, amount=opt_in_drops_paid, transaction_type='refund',
         reference_id=arena_id, description='Arena cancelled: {name} — {N} drops refunded')
   - UPDATE sweat_arenas SET is_active = false
   - Return: success, participants_refunded count, error_message
   - EDGE CASE: Use ap.opt_in_drops_paid (per-participant) NOT arena.opt_in_value (arena-level)
     This handles the case where opt_in_value changed after some users opted in

   ALSO ADD to arena_participants:
   - ALTER TABLE arena_participants ADD COLUMN opt_in_drops_paid INTEGER DEFAULT 0
   - Update opt_into_arena() INSERT to record drops paid

   ALSO: After cancel_arena() succeeds in admin panel, send push notification to ALL participants:
   - Fetch all participant expo_push_tokens from profiles
   - Title: "⚠️ Arena otkazana"
   - Body (drops): "Arena '{name}' je otkazana. {N} 💧 drops su ti vraćeni."
   - Body (free/streak/level): "Arena '{name}' je otkazana."

9. CROSS-GYM SCORING — CREATE TABLE + UPDATE FUNCTIONS:

   9a. CREATE TABLE `arena_participant_gym_scores`:
       - arena_id UUID FK sweat_arenas ON DELETE CASCADE
       - user_id UUID FK profiles ON DELETE CASCADE
       - gym_id UUID FK gyms ON DELETE CASCADE
       - score NUMERIC(12,2) DEFAULT 0
       - sessions INTEGER DEFAULT 0
       - updated_at TIMESTAMPTZ DEFAULT NOW()
       - UNIQUE(arena_id, user_id, gym_id)
       - Indexes on (arena_id), (user_id), (arena_id, user_id)
       - RLS:
         * User sees own rows only (user_id = auth.uid())
         * Gym owner sees rows for users who opted-in through their gym
           (JOIN arena_participants WHERE gym_id = owner's gym AND arena_id matches)
         * Superadmin sees all
         * INSERT/UPDATE only via SECURITY DEFINER functions (no direct policies)

   9b. CREATE OR REPLACE FUNCTION `update_arena_scores(p_user_id, p_gym_id, p_drops)`:
       p_gym_id = SESSION gym (where workout happened), NOT opt-in gym.
       For each arena where p_gym_id is in arena_gyms AND user is participant:

       For total_drops arenas:
         1. UPSERT arena_participant_gym_scores (arena_id, user_id, p_gym_id, score+=p_drops, sessions+=1)
         2. UPDATE arena_participants SET current_score = (
              SELECT SUM(score) FROM arena_participant_gym_scores
              WHERE arena_id AND user_id
            )
         → current_score = SUM of per-gym scores

       For streak_days arenas:
         1. UPSERT arena_participant_gym_scores (informational — tracks drops earned at this gym)
         2. UPDATE arena_participants SET current_score = GREATEST(current_score, profile.streak_days)
         → current_score = global streak (NOT sum of per-gym)

   9c. CREATE OR REPLACE FUNCTION `update_arena_scores_periodic()`:
       Same cross-gym breakdown logic for days_visited and variety_score:
         1. UPSERT arena_participant_gym_scores per gym (days visited/machines used at THAT gym)
         2. UPDATE arena_participants.current_score = total across ALL gyms
            - days_visited: COUNT(DISTINCT DATE) across ALL participating gyms
            - variety_score: COUNT(DISTINCT machine_id) across ALL participating gyms
         NOTE: current_score ≠ SUM(per-gym scores) for these models!
               (visiting 2 gyms on same day = 1 day total, not 2)

   9d. UPDATE `get_available_arenas()` return type — ADD column:
       gym_score_breakdown JSONB
       → [{"gym_id":"...","gym_name":"...","score":450,"sessions":12},...]
       → Subquery on arena_participant_gym_scores JOIN gyms for the calling user
       → NULL if user not opted in, empty array if no scores yet

   9e. UPDATE `get_arena_results()` return type — ADD column:
       gym_breakdown JSONB — privacy-aware:
       → Superadmin: full per-gym array [{"gym_id","gym_name","score","sessions"},...]
       → Gym owner: {"own_gym_score": 450, "other_gyms_score": 350, "total_sessions": 25}
         (own_gym = caller's admin_gym_id from profiles, other = everything else, no gym names)
       → Use CASE WHEN public.is_superadmin(auth.uid()) for branching

   IMPORTANT for 9b: The check `ag.gym_id = p_gym_id` ensures sessions from
   non-participating gyms are IGNORED. User can only score from gyms that are
   in arena_gyms for that arena.

IMPORTANT:
- All functions must use SECURITY DEFINER
- All functions must have GRANT EXECUTE to authenticated
- Include COMMENT ON FUNCTION for each
- Use CREATE OR REPLACE for all functions (safe re-run)
- Wrap ALTER TABLE in IF NOT EXISTS
- Test: After migration, run SELECT * FROM get_available_arenas('<user_id>') and verify new columns appear
  (including gym_score_breakdown JSONB)
- Test: After cross-gym migration, verify arena_participant_gym_scores table exists
- Test: Simulate a session at Gym B for user opted-in at Gym A → verify breakdown row created
- Test: Verify current_score = SUM of gym_scores for total_drops arenas

REFERENCE FILES:
- backend/supabase/migrations/20260303100003_sweat_arenas_system.sql (current arena system — update_arena_scores, update_arena_scores_periodic, finalize_arena)
- backend/supabase/migrations/20260304000005_fix_leaderboard_and_arenas_rpc.sql (latest get_available_arenas)
- backend/supabase/migrations/20260305000005_fix_award_drops_arena_scores.sql (award_drops integration — calls update_arena_scores)
- backend/supabase/migrations/20260305000002_fix_streak_and_arena_updates.sql (latest update_arena_scores with streak fix)
- backend/supabase/migrations/20260306000001_arena_invitations_and_enhancements.sql (invitations + get_available_arenas v2)
```

### 9.2 Admin Panel Agent Prompt

```
CONTEXT: You are the Admin Panel agent for SWEATDROP (Next.js 15, App Router, Tailwind CSS).
The Supabase DBA has applied migration 20260306000001_arena_invitations_and_enhancements.sql.
New DB columns and RPCs are available.

BEFORE STARTING — Read these files to understand current implementation:
- apps/admin-panel/lib/actions/arena-actions.ts
- apps/admin-panel/components/modules/ArenasManager.tsx
- apps/admin-panel/components/modules/ArenaDetail.tsx
- apps/admin-panel/app/dashboard/arenas/page.tsx
- apps/admin-panel/app/dashboard/gym/[id]/arenas/page.tsx

TASKS (in order):

TASK 1: FIX — gym_admin arena creation
File: apps/admin-panel/lib/actions/arena-actions.ts
- In createArena() line ~149: add 'gym_admin' to allowed roles array
- In updateArena() line ~224: add 'gym_admin' to allowed roles array
- Reason: gym_admin should be able to create local arenas for their gym

TASK 2: UPDATE — Arena form schema and actions
File: apps/admin-panel/lib/actions/arena-actions.ts
- Add to createArenaSchema:
  opt_in_type: z.enum(['free', 'drops', 'streak', 'level']).default('free')
  opt_in_value: z.number().int().min(0).default(0)
  card_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().or(z.literal(''))
  card_text_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().or(z.literal(''))
  card_gradient_end: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().or(z.literal(''))
- Update createArena/updateArena insert/update objects with new fields
- Add to Arena interface: opt_in_type, opt_in_value, card_color, card_text_color, card_gradient_end

TASK 3: CREATE — Invitation server actions
File: apps/admin-panel/lib/actions/arena-invitation-actions.ts
- sendArenaInvitations(arenaId, gymIds, revenueSharePercent, revenueShareNote?)
  → Calls supabase.rpc('send_arena_invitations', {...})
- getArenaInvitations(arenaId)
  → Fetches from arena_invitations table WHERE arena_id = arenaId
- getPendingInvitations(gymId?)
  → Fetches pending invitations for a gym (or all for superadmin)
- respondToInvitation(invitationId, response)
  → Calls supabase.rpc('respond_to_arena_invitation', {...})
- getArenaResults(arenaId)
  → Calls supabase.rpc('get_arena_results', {...})

TASK 4: UPDATE — ArenasManager form
File: apps/admin-panel/components/modules/ArenasManager.tsx
Add to form state & form UI:
- Opt-in section (after scoring model):
  Select for opt_in_type, number input for opt_in_value
  Conditional display: hide value input when type='free'
  Help text per type
- Branding section (after sponsor):
  Color picker inputs for card_color, card_text_color, card_gradient_end
  Integration with ArenaLivePreview component
- Invitation button (superadmin + non-local scope):
  Opens modal to invite gyms with revenue share

TASK 5: CREATE — ArenaLivePreview component
File: apps/admin-panel/components/modules/ArenaLivePreview.tsx
- Phone-sized (max-w-sm) dark background card preview
- Shows arena card as it would appear in mobile app
- Uses form state for real-time updates
- Shows: name, sponsor, scoring model icon, opt-in badge, prizes, colors

TASK 6: UPDATE — ArenaDetail with results tab + cancel button + gym breakdown
File: apps/admin-panel/components/modules/ArenaDetail.tsx
- After finalization: show "Results" section
- Table: Rank | User (avatar+name) | Gym | Score | Breakdown | Prize | Redemption Code | Status
- NEW "Breakdown" column:
  * For superadmin: expandable row showing per-gym scores
    [Gym A: 450 | Gym B: 200 | Gym C: 150]
  * For gym owner: inline "Tvoja: 450 | Ostale: 350"
  * gym_breakdown JSONB from get_arena_results() provides the data
- Status badges: pending (yellow), confirmed (green), cancelled (red)
- "Notify Winners" button (re-trigger push notification edge function)
- NEW: "Cancel Arena" button (red, superadmin only, active/upcoming arenas only)
  * Confirmation dialog: "Are you sure? This will cancel the arena and refund {N} participants."
  * On confirm: call cancelArena() server action
  * cancelArena() does:
    1. supabase.rpc('cancel_arena', { p_arena_id })
    2. If success + participants > 0: fetch participant push tokens, call send-push
       Title: "⚠️ Arena otkazana"
       Body (drops arena): "Arena '{name}' je otkazana. {N} 💧 drops su ti vraćeni."
       Body (non-drops): "Arena '{name}' je otkazana."
    3. Show success toast: "Arena cancelled. {N} participants refunded."
  * Add cancelArena to arena-actions.ts or arena-invitation-actions.ts
- ALSO UPDATE: Active arena live leaderboard should show gym breakdown:
  * Superadmin: each leaderboard row shows expandable gym-by-gym scores
  * Gym owner: each row shows "Tvoja: X | Ostale: Y"

TASK 7: CREATE — ArenaInvitationsManager component
File: apps/admin-panel/components/modules/ArenaInvitationsManager.tsx
- For superadmin: shows per-arena invitation status
- Table: Gym | Owner | Revenue Share | Status | Response Date
- Color-coded status badges
- Can be embedded in ArenaDetail or standalone

TASK 8: CREATE — Gym invitations page
File: apps/admin-panel/app/dashboard/gym/[id]/invitations/page.tsx
- List pending invitations for this gym
- Each invitation shows: arena name, dates, scoring, prizes, revenue share %
- Accept / Decline buttons
- Accepted arenas link to arena detail (read-only)

TASK 9: UPDATE — Sidebar
File: apps/admin-panel/components/Sidebar.tsx (or equivalent)
- Add "Invitations" link under gym section
- Show badge with count of pending invitations

DESIGN SYSTEM:
- Background: #000000, #0A0A0A, #1A1A1A
- Primary: #00E5FF (solid teal, NOT gradient)
- Text: #FFFFFF, #B0B0B0, #808080
- Error: #FF5252
- Use existing Tailwind classes matching the rest of the dashboard
- Color picker: native input[type="color"] with hex display
- All new buttons: solid teal bg-[#00E5FF] text-black

EDGE CASES:
- Editing finalized arena → disable form fields, show read-only
- Accepted global arena → show in gym's list but hide edit/delete buttons
- Empty color fields → send as NULL (not empty string)
- Gym owner on global arenas page → only show their gyms' arenas
- gym_breakdown is null → user has no cross-gym data, show just total score
- Superadmin breakdown shows all gym names, gym owner only sees "Tvoja: X | Ostale: Y"
- Arena with all participants from single gym → breakdown column shows just the gym score
```

### 9.3 Mobile App Agent Prompt

```
CONTEXT: You are the Mobile App agent for SWEATDROP (React Native, Expo, TypeScript).
The Supabase DBA has applied migration 20260306000001_arena_invitations_and_enhancements.sql.
get_available_arenas() now returns additional fields: opt_in_type, opt_in_value, card_color,
card_text_color, card_gradient_end, arena_status.

BEFORE STARTING — Read these files:
- apps/mobile-app/hooks/useAvailableArenas.ts
- apps/mobile-app/app/arenas.tsx
- apps/mobile-app/app/arena/[id]/index.tsx
- apps/mobile-app/app/home.tsx

TASKS (in order):

TASK 1: UPDATE — AvailableArena interface
File: apps/mobile-app/hooks/useAvailableArenas.ts
Add new fields to interface:
  opt_in_type: string;    // 'free' | 'drops' | 'streak' | 'level'
  opt_in_value: number;
  card_color: string | null;
  card_text_color: string | null;
  card_gradient_end: string | null;
  arena_status: string;   // 'upcoming' | 'active'
  gym_score_breakdown: Array<{
    gym_id: string;
    gym_name: string;
    score: number;
    sessions: number;
  }> | null;

TASK 2: UPDATE — Arenas list screen
File: apps/mobile-app/app/arenas.tsx
Changes:
a) Split arenas into two groups:
   const upcomingArenas = arenas.filter(a => a.arena_status === 'upcoming');
   const activeArenas = arenas.filter(a => a.arena_status === 'active');

b) Render two sections with section headers:
   "🔜 Coming Soon" — for upcoming arenas
   "⚡ Active Now" — for active arenas

c) Upcoming arena card differences:
   - Show "Starts in X days" countdown instead of "X days left"
   - Slightly lower opacity (0.85)
   - Pulsing border animation (useSharedValue + withRepeat)
   - "Opt-in Early" button text instead of "Join Arena"

d) Apply custom branding:
   - If arena.card_color is not null, use it as the accent color instead of branding.primary
   - If arena.card_text_color is not null, use it for text
   - Helper function: getArenaColors(arena) returning { primary, text, onPrimary }

e) Opt-in requirement badge on each card:
   - 'free' → no badge (or subtle "Free Entry")
   - 'drops' → "💧 {value} drops"
   - 'streak' → "🔥 {value} day streak"
   - 'level' → "⭐ {value} drops lifetime"
   Position: top-right corner of card, small pill badge

TASK 3: UPDATE — Arena detail screen
File: apps/mobile-app/app/arena/[id]/index.tsx
Changes:
a) Upcoming arena state:
   - Large countdown: "Starts in X days, Y hours"
   - Animated countdown with Animated.Text updates
   - "This arena hasn't started yet" info text
   - Still show prizes, description, scoring model

b) Opt-in requirements:
   - Before the "Join Arena" button, show requirement info box:
     * 'free' → "Free to join — anyone can participate"
     * 'drops' → "Entry fee: {value} 💧" + show user's current balance
     * 'streak' → "Requires: {value}-day streak 🔥" + show user's streak
     * 'level' → "Requires: {value} total drops ⭐" + show user's total
   - Disable join button if requirement not met (with visual feedback)
   - When opt-in fails, show specific error from RPC response

c) Custom branding:
   - Use arena's card_color as accent throughout detail page
   - Apply to header gradient, buttons, progress bars

d) Cross-gym score breakdown (when user is opted in):
   - Show "Tvoj score" section above leaderboard:
     ```
     Tvoj score: 800 drops
       • FitPass Beograd    450 💧
       • FitPass Novi Sad   200 💧
       • FitPass Niš        150 💧
     ```
   - Data source: arena.gym_score_breakdown from useAvailableArenas
   - Only show if gym_score_breakdown has > 0 entries
   - Sort by score DESC
   - Use gym_name from breakdown, score formatted with 💧
   - If only 1 gym: don't show breakdown, just total
   - Glassmorphism card with FadeInDown animation

TASK 4: UPDATE — Home screen arena section
File: apps/mobile-app/app/home.tsx
In the arena carousel:
- Upcoming arenas show with "Coming Soon" overlay badge
- Show countdown text inline
- Apply custom branding colors to arena cards

TASK 5: CREATE — ArenaGymBreakdown component
File: apps/mobile-app/components/ArenaGymBreakdown.tsx
- Reusable component that displays per-gym score breakdown
- Props: breakdown array, totalScore, scoringModel
- Only renders if breakdown has > 1 entry (skip for single-gym users)
- Sorted by score DESC
- Shows gym name, score with appropriate label (💧/days/machines), and percentage of total
- Glassmorphism card style, FadeInDown animation
- Example display:
    Tvoj score: 800 drops
      • FitPass Beograd    450 💧  (56%)
      • FitPass Novi Sad   200 💧  (25%)
      • FitPass Niš        150 💧  (19%)
- Used in: arena/[id]/index.tsx (above leaderboard, when opted-in)

TASK 6: IMPROVE — Opt-in error handling
All screens that call opt_into_arena():
- Parse error_message from RPC response
- Map to user-friendly Serbian/English messages:
  "Not enough drops" → t('arenas.notEnoughDrops', { needed: value })
  "Streak too low" → t('arenas.streakTooLow', { needed: value })
  "Not enough reputation" → t('arenas.notEnoughReputation', { needed: value })
  "Already opted in" → t('arenas.alreadyOptedIn')
  "Arena has already ended" → t('arenas.arenaEnded')

DESIGN REFERENCE: Use apps/mobile-app/app/profile.tsx as the design reference.
- Dark theme with glassmorphism
- Solid teal buttons (NO gradient for primary buttons)
- FadeInDown animations from react-native-reanimated
- BlurView for card backgrounds
- Consistent spacing from theme.spacing
- Font styles from fontStyles

EDGE CASES:
- Arena starts while user is viewing arenas list → useFocusEffect refresh
- Very long countdown (months away) → show "Starts MMM DD"
- Countdown reaches 0 → change to "Starting now!" → auto-refresh
- No upcoming arenas → don't show "Coming Soon" section header
- Arena with no prizes → hide prizes section (already handled)
- Opt-in button spam → loading state + disabled prop
- gym_score_breakdown is null → user not opted in, don't show breakdown
- gym_score_breakdown has 1 entry → don't show breakdown (single gym, just total)
- gym_score_breakdown has 0 entries → opted in but no sessions, show "Još nema sesija"
- Very long gym name in breakdown → numberOfLines={1} truncation
```

---

## 10. CHALLENGES SYSTEM — STATUS

The Challenges system is **mostly complete** and does not need major changes for this iteration.

### What works ✅
- Full CRUD in admin panel (ChallengesManager component)
- 5 challenge types: daily, weekly, monthly, streak, milestone
- Automatic progress tracking via `award_drops()` → `update_challenge_progress()`
- Tiered challenges (Bronze/Silver/Gold)
- Sponsor info + badge images
- Challenge monitor with participant progress
- Close challenge early functionality
- Mobile app: challenges list, challenge detail, progress display
- Home screen: active challenges carousel

### Known minor issues (not blocking MVP)
- No cron-based reset for daily/weekly challenges (they use date ranges instead — works fine)
- Challenge progress monitor sorts completed users last (intentional UX)
- `distance_km` scoring model exists in schema but no sensors track distance (future feature)

### No changes needed for this plan.

---

## 11. FILE INVENTORY — All files that need changes

### New Files
| File | Agent | Description |
|---|---|---|
| `backend/supabase/migrations/20260306000001_arena_invitations_and_enhancements.sql` | DBA | Full migration |
| `backend/supabase/migrations/20260306100001_cross_gym_scoring.sql` | DBA | Cross-gym scoring table + updated functions |
| `apps/admin-panel/lib/actions/arena-invitation-actions.ts` | Admin | Invitation server actions |
| `apps/admin-panel/components/modules/ArenaLivePreview.tsx` | Admin | Live preview component |
| `apps/admin-panel/components/modules/ArenaInvitationsManager.tsx` | Admin | Invitation management |
| `apps/admin-panel/app/dashboard/gym/[id]/invitations/page.tsx` | Admin | Gym invitations page |
| `apps/mobile-app/components/ArenaGymBreakdown.tsx` | Mobile | Per-gym score breakdown display |

### Modified Files
| File | Agent | Changes |
|---|---|---|
| `apps/admin-panel/lib/actions/arena-actions.ts` | Admin | Fix gym_admin, add new fields |
| `apps/admin-panel/components/modules/ArenasManager.tsx` | Admin | Opt-in, branding, invitations |
| `apps/admin-panel/components/modules/ArenaDetail.tsx` | Admin | Post-finalization results + cancel button |
| `apps/admin-panel/components/Sidebar.tsx` | Admin | Invitations nav link |
| `apps/mobile-app/hooks/useAvailableArenas.ts` | Mobile | Updated interface |
| `apps/mobile-app/app/arenas.tsx` | Mobile | Upcoming section, branding, badges |
| `apps/mobile-app/app/arena/[id]/index.tsx` | Mobile | Countdown, requirements, branding |
| `apps/mobile-app/app/home.tsx` | Mobile | Upcoming arena banner |

---

## 12. RISK ASSESSMENT

| Risk | Probability | Mitigation |
|---|---|---|
| Migration conflicts with existing data | Low | `IF NOT EXISTS` + `CREATE OR REPLACE` |
| Opt-in drops deduction creates negative balance | Low | `GREATEST(0, ...)` guard |
| Double invitation to same gym | None | `UNIQUE(arena_id, invited_gym_id)` |
| Mobile app crashes on new null fields | Medium | `COALESCE` in SQL + null checks in TS |
| Existing arenas missing new columns | None | `DEFAULT` values handle it |
| Admin form breaking from new fields | Low | Zod validation catches invalid input |
| Cross-gym scoring: existing `current_score` drift | Low | Recalculated from breakdown SUM |
| Cross-gym scoring: performance with many gyms | Low | UNIQUE index → UPSERT is O(1) |
| Cross-gym scoring: `gym_breakdown` NULL for old arenas | None | `COALESCE` returns empty array |
| Cross-gym scoring: gym owner sees other gym names | None | Privacy query hides gym names |

---

**END OF PLAN**

> This plan is ready for dispatch to all three agents. The Supabase DBA must go first.
> After the migration is applied, Admin and Mobile agents can work in parallel.
