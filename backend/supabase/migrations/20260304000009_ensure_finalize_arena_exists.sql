-- Migration: 20260304000009_ensure_finalize_arena_exists.sql
-- Description: Ensures finalize_arena() RPC function exists
-- 
-- AGENT NOTE: [2026-03-04] - supabase-dba
-- Problem: finalize_arena() function may not exist
-- 
-- CHANGES:
-- - Recreate finalize_arena() RPC function if missing
-- - Ensure proper grants are set

-- ============================================================
-- finalize_arena() RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.finalize_arena(p_arena_id UUID)
RETURNS TABLE(winners_count INTEGER)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_arena RECORD;
  v_winner RECORD;
  v_prize JSONB;
  v_redemption_id UUID;
  v_winner_count INTEGER := 0;
  v_rank INTEGER;
BEGIN
  -- Get arena details
  SELECT * INTO v_arena
  FROM public.sweat_arenas
  WHERE id = p_arena_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Arena not found: %', p_arena_id;
  END IF;

  -- Check if already finalized
  IF v_arena.is_finalized THEN
    RAISE EXCEPTION 'Arena already finalized: %', p_arena_id;
  END IF;

  -- Check if arena has ended
  IF v_arena.end_date >= CURRENT_DATE THEN
    RAISE EXCEPTION 'Arena has not ended yet. End date: %', v_arena.end_date;
  END IF;

  -- Calculate final rankings and award prizes
  v_rank := 0;
  FOR v_winner IN
    SELECT
      ap.user_id,
      ap.gym_id,
      ap.current_score,
      ROW_NUMBER() OVER (ORDER BY ap.current_score DESC, p.username ASC) AS rank
    FROM public.arena_participants ap
    JOIN public.profiles p ON p.id = ap.user_id
    WHERE ap.arena_id = p_arena_id
      AND ap.current_score > 0
    ORDER BY ap.current_score DESC, p.username ASC
  LOOP
    v_rank := v_rank + 1;

    -- Find prize for this rank
    v_prize := NULL;
    IF jsonb_array_length(v_arena.prizes) > 0 THEN
      SELECT prize INTO v_prize
      FROM jsonb_array_elements(v_arena.prizes) AS prize
      WHERE (prize->>'rank')::INTEGER = v_rank
      LIMIT 1;
    END IF;

    -- If prize exists, create redemption entry
    IF v_prize IS NOT NULL THEN
      INSERT INTO public.redemptions (
        user_id,
        reward_id,       -- NULL for arena prizes
        gym_id,          -- winner's gym_id
        drops_spent,     -- 0 (arena prizes cost no drops)
        status,          -- 'claimed' (ready for confirmation)
        source_type,     -- 'arena_prize'
        description      -- e.g., 'Arena Prize: Summer Shred Challenge #1 - Free 3-month membership'
      )
      VALUES (
        v_winner.user_id,
        NULL,
        v_winner.gym_id,
        0,
        'claimed',
        'arena_prize',
        format('Arena Prize: %s #%s - %s', v_arena.name, v_rank, v_prize->>'prize')
      )
      RETURNING id INTO v_redemption_id;

      -- Insert into arena_results
      INSERT INTO public.arena_results (
        arena_id,
        user_id,
        final_rank,
        final_score,
        prize_description,
        redemption_id
      )
      VALUES (
        p_arena_id,
        v_winner.user_id,
        v_rank,
        v_winner.current_score,
        v_prize->>'prize',
        v_redemption_id
      )
      ON CONFLICT (arena_id, user_id) DO UPDATE
        SET final_rank = EXCLUDED.final_rank,
            final_score = EXCLUDED.final_score,
            prize_description = EXCLUDED.prize_description,
            redemption_id = EXCLUDED.redemption_id;

      v_winner_count := v_winner_count + 1;
    ELSE
      -- No prize for this rank, but still record result
      INSERT INTO public.arena_results (
        arena_id,
        user_id,
        final_rank,
        final_score,
        prize_description,
        redemption_id
      )
      VALUES (
        p_arena_id,
        v_winner.user_id,
        v_rank,
        v_winner.current_score,
        NULL,
        NULL
      )
      ON CONFLICT (arena_id, user_id) DO UPDATE
        SET final_rank = EXCLUDED.final_rank,
            final_score = EXCLUDED.final_score;
    END IF;
  END LOOP;

  -- Mark arena as finalized
  UPDATE public.sweat_arenas
  SET is_finalized = true,
      finalized_at = NOW(),
      updated_at = NOW()
  WHERE id = p_arena_id;

  RETURN QUERY SELECT v_winner_count;
END;
$$;

COMMENT ON FUNCTION public.finalize_arena(UUID) IS
  'Finalizes an arena by calculating final rankings and awarding prizes. '
  'Inserts winners into public.redemptions with source_type = arena_prize. '
  'Links arena_results.redemption_id to redemptions.id. '
  'Called by edge function when arena end_date passes.';

GRANT EXECUTE ON FUNCTION public.finalize_arena(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_arena(UUID) TO service_role;
