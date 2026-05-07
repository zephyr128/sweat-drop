/**
 * Hook that detects an "unfinished workout" left over from a previous app
 * run and populates the `useActiveSessionRecovery` Zustand store so the
 * `<ActiveSessionRecoveryBanner>` on /home can prompt the user.
 *
 * AGENT NOTE: [2026-05-07] - mobile-coder (Bug 4b)
 *
 * Behaviour:
 *   1. Fires once after `isInitialized && session?.user` becomes truthy in
 *      `_layout.tsx`. Subsequent re-runs are gated by an internal ref so
 *      navigation between screens doesn't re-trigger the query.
 *   2. Skips on routes already in the workout flow (so we don't yank the
 *      user out of an in-progress workout we just navigated them into).
 *   3. Queries `sessions` for the user's most recent `is_active = true`
 *      row joined with machine + gym metadata via the existing relational
 *      select (RLS-safe — user can read their own sessions).
 *   4. Race protection: ignores rows younger than 60s (a freshly-created
 *      session that is genuinely in flight shouldn't show as "abandoned").
 *   5. Also drains the one-shot auto-finalize notice written by Step 10 so
 *      the same banner can surface "Workout finalized — N drops credited"
 *      after the background-finalize timer fires.
 */

import { useEffect, useRef } from 'react';
import { useSegments } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/stores/authStore';
import {
  useActiveSessionRecovery,
  type PendingActiveSession,
} from '@/lib/stores/useActiveSessionRecovery';
import { log } from '@/lib/logger';
import {
  isFreshAutoFinalizeFlag,
  isFreshSession,
  isGatedRoute,
  normaliseMachineType,
  type AutoFinalizeFlag,
} from '@/lib/workout/useActiveSessionRecovery.helpers';

const AUTO_FINALIZE_FLAG_KEY = '@sweatdrop/last_autofinalize_session_id';

interface ActiveSessionRow {
  id: string;
  machine_id: string | null;
  gym_id: string | null;
  started_at: string;
  duration_seconds: number | null;
  machine: {
    id: string;
    type: string | null;
    sensor_id: string | null;
    ble_protocol: string | null;
  } | null;
  gym: {
    id: string;
    name: string | null;
  } | null;
}

export function useActiveSessionRecoveryWatch(): void {
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const userId = useAuthStore((s) => s.session?.user?.id ?? null);
  const segments = useSegments();
  const setPendingSession = useActiveSessionRecovery((s) => s.setPendingSession);
  const setAutoFinalizedNotice = useActiveSessionRecovery(
    (s) => s.setAutoFinalizedNotice,
  );
  const lastQueriedUserRef = useRef<string | null>(null);

  // Top-level segment lets us suppress the query while the user is in the
  // workout flow (so we don't yank them out of /workout right after starting).
  const topSegment = (segments as string[])[0];
  const inGatedRoute = isGatedRoute(topSegment);

  useEffect(() => {
    if (!isInitialized || !userId) return;
    if (inGatedRoute) return;
    if (lastQueriedUserRef.current === userId) return;
    lastQueriedUserRef.current = userId;

    let cancelled = false;
    const detect = async () => {
      try {
        // Drain the one-shot auto-finalize flag first — Step 10 writes it
        // when the background timer credits drops while the app was killed.
        try {
          const raw = await AsyncStorage.getItem(AUTO_FINALIZE_FLAG_KEY);
          if (raw) {
            const parsed = JSON.parse(raw) as AutoFinalizeFlag;
            if (isFreshAutoFinalizeFlag(parsed)) {
              setAutoFinalizedNotice({
                sessionId: parsed.sessionId,
                drops: parsed.drops,
                finalizedAt: parsed.finalizedAt,
              });
              log.debug('[Recovery] Surfacing auto-finalize notice', parsed);
            }
            // Clear after read regardless — flag is one-shot.
            await AsyncStorage.removeItem(AUTO_FINALIZE_FLAG_KEY);
          }
        } catch (storageErr) {
          log.warn('[Recovery] AsyncStorage drain failed:', storageErr);
        }

        const { data, error } = await supabase
          .from('sessions')
          .select(
            'id, machine_id, gym_id, started_at, duration_seconds, ' +
              'machine:machine_id(id, type, sensor_id, ble_protocol), ' +
              'gym:gym_id(id, name)',
          )
          .eq('user_id', userId)
          .eq('is_active', true)
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle<ActiveSessionRow>();

        if (cancelled) return;

        if (error) {
          // PGRST116 = "row not found" via maybeSingle — not actually an error.
          if (error.code !== 'PGRST116') {
            log.warn('[Recovery] Active session lookup failed:', error.message);
          }
          return;
        }

        if (!data?.id) {
          log.debug('[Recovery] No active session found on launch');
          return;
        }

        if (isFreshSession(data.started_at)) {
          const ageMs = Date.now() - new Date(data.started_at).getTime();
          log.debug('[Recovery] Active session too fresh, skipping banner', {
            sessionId: data.id,
            ageMs,
          });
          return;
        }

        const pending: PendingActiveSession = {
          sessionId: data.id,
          machineId: data.machine_id,
          machineType: normaliseMachineType(data.machine?.type),
          gymId: data.gym_id,
          gymName: data.gym?.name?.trim() || '',
          sensorId: data.machine?.sensor_id ?? null,
          bleProtocol: data.machine?.ble_protocol ?? null,
          startedAt: data.started_at,
          durationSeconds: data.duration_seconds ?? 0,
        };

        const ageMinutes = Math.floor(
          (Date.now() - new Date(data.started_at).getTime()) / 60_000,
        );
        log.debug('[Recovery] Active session detected, populating banner', {
          sessionId: pending.sessionId,
          ageMin: ageMinutes,
        });
        setPendingSession(pending);
      } catch (err) {
        log.warn('[Recovery] detect() threw:', err);
      }
    };

    void detect();

    return () => {
      cancelled = true;
    };
  }, [isInitialized, userId, inGatedRoute, setPendingSession, setAutoFinalizedNotice]);
}
