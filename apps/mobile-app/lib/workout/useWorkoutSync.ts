import { useEffect, useRef } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';

interface UseWorkoutSyncOptions {
  sessionId: string | undefined;
  userId: string | undefined;
  duration: number;
  caloriesShared: SharedValue<number>;
  isPaused: boolean;
  idleSyncRef: React.MutableRefObject<boolean>;
  isMockSession?: boolean;
}

/**
 * Throttled DB sync hook — writes duration and calories to Supabase every 30s
 * when the workout is active and not idle.
 */
export function useWorkoutSync({
  sessionId,
  userId,
  duration,
  caloriesShared,
  isPaused,
  idleSyncRef,
  isMockSession = false,
}: UseWorkoutSyncOptions) {
  const lastSyncRef = useRef<number>(0);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!sessionId || isMockSession || !userId) return;
    if (isPaused) return;
    if (idleSyncRef.current) return;

    const syncToDatabase = async () => {
      const now = Date.now();
      if (lastSyncRef.current && now - lastSyncRef.current < 30000) return;

      try {
        const estimatedCalories = Math.round(caloriesShared.value);
        await supabase
          .from('sessions')
          .update({
            duration_seconds: duration,
            calories: estimatedCalories > 0 ? estimatedCalories : null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', sessionId);
        lastSyncRef.current = now;
      } catch (error) {
        log.error('[useWorkoutSync] Sync error:', error);
      }
    };

    syncToDatabase();
    syncIntervalRef.current = setInterval(syncToDatabase, 30000);

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }
    };
  }, [sessionId, userId, duration, isPaused, isMockSession]);
}
