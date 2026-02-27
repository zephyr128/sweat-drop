-- Create Daily Reset Function Migration
-- Creates function to reset daily challenges at midnight
-- Should be called by cron job or scheduled task daily at 00:00:00

CREATE OR REPLACE FUNCTION public.reset_daily_challenges()
RETURNS void AS $$
BEGIN
  -- Reset current_drops to 0 for daily challenges that haven't been updated today
  -- Only reset challenges that are still active and within date range
  UPDATE public.challenge_progress cp
  SET 
    current_drops = 0,
    is_completed = false,
    completed_at = NULL,
    updated_at = NOW()
  FROM public.challenges c
  WHERE cp.challenge_id = c.id
    AND c.challenge_type = 'daily'
    AND c.is_active = true
    AND c.start_date <= CURRENT_DATE
    AND c.end_date >= CURRENT_DATE
    AND (
      cp.last_activity_date IS NULL 
      OR cp.last_activity_date < CURRENT_DATE  -- Only reset if not updated today
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions (for cron jobs or scheduled tasks)
GRANT EXECUTE ON FUNCTION public.reset_daily_challenges() TO authenticated;

-- Comments for documentation
COMMENT ON FUNCTION public.reset_daily_challenges IS 'Resets daily challenges at midnight. Sets current_drops to 0 and marks challenges as incomplete. Should be called daily at 00:00:00 via cron job or scheduled task. Only resets challenges that are active and within date range, and that have not been updated today.';

-- Note: To schedule this function via pg_cron (if available):
-- SELECT cron.schedule(
--   'reset-daily-challenges',
--   '0 0 * * *',  -- Cron expression: every day at 00:00:00
--   $$SELECT public.reset_daily_challenges();$$
-- );
--
-- To unschedule:
-- SELECT cron.unschedule('reset-daily-challenges');
