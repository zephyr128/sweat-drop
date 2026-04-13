-- Add leader_score to get_available_arenas so the mobile app can show "X to #1"
-- Must DROP first because the return type signature changes (added leader_score column)
DROP FUNCTION IF EXISTS public.get_available_arenas(UUID);

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
  leader_score NUMERIC,
  prizes JSONB,
  opt_in_type TEXT,
  opt_in_value INTEGER,
  card_color TEXT,
  card_text_color TEXT,
  card_gradient_end TEXT,
  arena_status TEXT,
  gym_score_breakdown JSONB,
  is_finalized BOOLEAN,
  finalized_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
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
    (
      SELECT MAX(ap6.current_score)
      FROM public.arena_participants ap6
      WHERE ap6.arena_id = sa.id
    ) AS leader_score,
    sa.prizes,
    COALESCE(sa.opt_in_type, 'free')::TEXT AS opt_in_type,
    COALESCE(sa.opt_in_value, 0)::INTEGER AS opt_in_value,
    sa.card_color::TEXT,
    sa.card_text_color::TEXT,
    sa.card_gradient_end::TEXT,
    CASE
      WHEN sa.is_finalized = true AND sa.end_date < CURRENT_DATE THEN 'ended'
      WHEN sa.start_date > CURRENT_DATE THEN 'upcoming'
      WHEN sa.end_date < CURRENT_DATE THEN 'ended'
      ELSE 'active'
    END::TEXT AS arena_status,
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
    ) AS gym_score_breakdown,
    sa.is_finalized,
    sa.finalized_at
  FROM public.sweat_arenas sa
  LEFT JOIN public.arena_participants ap ON ap.arena_id = sa.id
  WHERE sa.is_active = true
    AND (
      (sa.is_finalized = false AND sa.end_date >= CURRENT_DATE)
      OR
      (sa.is_finalized = true AND sa.end_date >= CURRENT_DATE - INTERVAL '30 days')
    )
    AND EXISTS (
      SELECT 1 FROM public.arena_gyms ag
      JOIN public.gym_memberships gm ON gm.gym_id = ag.gym_id
      WHERE ag.arena_id = sa.id
        AND gm.user_id = p_user_id
    )
  GROUP BY sa.id, sa.name, sa.description, sa.sponsor_name, sa.sponsor_logo,
           sa.scoring_model, sa.start_date, sa.end_date, sa.prizes,
           sa.opt_in_type, sa.opt_in_value, sa.card_color, sa.card_text_color,
           sa.card_gradient_end, sa.is_finalized, sa.finalized_at
  ORDER BY
    CASE
      WHEN sa.is_finalized = true THEN 2
      WHEN sa.start_date > CURRENT_DATE THEN 0
      ELSE 1
    END,
    sa.start_date ASC;
END;
$$;
