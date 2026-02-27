-- Gym Analytics RPC Function
-- Provides comprehensive analytics for gym owners

-- Create RPC function to get gym analytics with time filter support
CREATE OR REPLACE FUNCTION public.get_gym_analytics(
  p_gym_id UUID,
  p_time_filter TEXT DEFAULT '30days'
)
RETURNS JSON AS $$
DECLARE
  v_result JSON;
  v_machine_usage JSON;
  v_hourly_traffic JSON;
  v_economy_stats JSON;
  v_time_interval INTERVAL;
BEGIN
  -- Determine time interval based on filter
  CASE p_time_filter
    WHEN 'today' THEN
      v_time_interval := INTERVAL '1 day';
    WHEN '7days' THEN
      v_time_interval := INTERVAL '7 days';
    WHEN '30days' THEN
      v_time_interval := INTERVAL '30 days';
    ELSE
      v_time_interval := INTERVAL '30 days';
  END CASE;

  -- 1. Machine Usage: Top 3 most scanned machines in the selected time period
  SELECT COALESCE(
    json_agg(
      json_build_object(
        'machine_id', top_machines.machine_id,
        'machine_name', COALESCE(m.name, 'Unknown Machine'),
        'machine_type', COALESCE(m.type, 'unknown'),
        'scan_count', top_machines.scan_count
      ) ORDER BY top_machines.scan_count DESC
    ),
    '[]'::json
  ) INTO v_machine_usage
  FROM (
    SELECT 
      s.machine_id,
      COUNT(*) as scan_count
    FROM public.sessions s
    WHERE s.gym_id = p_gym_id
      AND s.created_at >= NOW() - v_time_interval
      AND s.machine_id IS NOT NULL
    GROUP BY s.machine_id
    ORDER BY scan_count DESC
    LIMIT 3
  ) top_machines
  LEFT JOIN public.machines m ON m.id = top_machines.machine_id;

  -- 2. Hourly Traffic: Aggregated scans per hour (00:00 - 23:00)
  -- Ensure all 24 hours are represented (fill missing hours with 0)
  WITH hours AS (
    SELECT generate_series(0, 23) as hour
  )
  SELECT json_agg(
    json_build_object(
      'hour', h.hour,
      'scan_count', COALESCE(ht.scan_count, 0)
    ) ORDER BY h.hour
  ) INTO v_hourly_traffic
  FROM hours h
  LEFT JOIN (
    SELECT 
      EXTRACT(HOUR FROM created_at)::INTEGER as hour,
      COUNT(*) as scan_count
    FROM public.sessions
    WHERE gym_id = p_gym_id
      AND created_at >= NOW() - v_time_interval
    GROUP BY EXTRACT(HOUR FROM created_at)
  ) ht ON ht.hour = h.hour;

  -- 3. Economy Stats: Total drops issued vs. Total drops redeemed in selected time period
  SELECT json_build_object(
    'drops_issued', COALESCE(SUM(drops_earned), 0),
    'drops_redeemed', COALESCE((
      SELECT SUM(drops_spent)
      FROM public.redemptions
      WHERE gym_id = p_gym_id
        AND status = 'confirmed'
        AND created_at >= NOW() - v_time_interval
    ), 0),
    'month', EXTRACT(MONTH FROM NOW())::INTEGER,
    'year', EXTRACT(YEAR FROM NOW())::INTEGER
  ) INTO v_economy_stats
  FROM public.sessions
  WHERE gym_id = p_gym_id
    AND created_at >= NOW() - v_time_interval;

  -- 4. Machine Type Breakdown (Treadmill vs Bike)
  -- This will be calculated in the frontend from machine_usage data

  -- Build final result
  v_result := json_build_object(
    'machine_usage', COALESCE(v_machine_usage, '[]'::json),
    'hourly_traffic', COALESCE(v_hourly_traffic, '[]'::json),
    'economy_stats', COALESCE(v_economy_stats, '{}'::json)
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment
COMMENT ON FUNCTION public.get_gym_analytics(UUID, TEXT) IS 'Returns comprehensive analytics for a gym including machine usage, hourly traffic, and economy stats. p_time_filter can be: today, 7days, or 30days (default: 30days)';
