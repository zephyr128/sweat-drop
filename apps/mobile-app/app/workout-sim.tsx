/**
 * workout-sim.tsx — Simulation screen that mirrors the real workout UI.
 *
 * Navigated to from ScannerScreen when EXPO_PUBLIC_DEV_QR_UUID is set and
 * the user starts a simulator session (sensorId starts with "sim:").
 *
 * Key differences from workout.tsx:
 *  - No BLE service — drives updates via startWorkoutSimulator directly.
 *  - Simpler state machine (no pause/resume BLE reconnect logic).
 *  - Reuses UI components and workout.styles for visual parity.
 *  - Ends workout via the same award_drops() RPC as workout.tsx.
 */

import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, AppState, AppStateStatus, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Animated, {
  useSharedValue,
  useDerivedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  interpolate,
  Easing,
  runOnJS,
  useAnimatedReaction,
  cancelAnimation,
  FadeInDown,
} from 'react-native-reanimated';
import { PlatformBlur } from '@/components/PlatformBlur';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { theme, getNumberStyle, fontStyles } from '@/lib/theme';
import { useBranding } from '@/lib/hooks/useBranding';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { useTranslation } from 'react-i18next';
import { log } from '@/lib/logger';
import { useAppModal } from '@/lib/stores/useAppModal';
import { getDeviceFingerprintHash } from '@/lib/security/deviceFingerprint';
import { estimateLiveDropsDetailed, type SessionTier } from '@/lib/workout/live-drops-estimator';
import { useWorkoutEconomy } from '@/lib/workout/useWorkoutEconomy';
import { withRetry } from '@/lib/workout/withRetry';
import { savePendingFinalization } from '@/lib/workout/pendingFinalization';
import LiquidGauge, { type LiquidGaugeRef } from '@/components/LiquidGauge';
import CircularProgressRing from '@/components/CircularProgressRing';
import { DropEmitter } from '@/components/DropEmitter';
import AnimatedText from '@/components/workout/AnimatedText';
import WorkoutStatsGrid from '@/components/workout/WorkoutStatsGrid';
import GoalProgressBar from '@/components/workout/GoalProgressBar';
import WorkoutControls from '@/components/workout/WorkoutControls';
import { styles as workoutStyles } from './workout.styles';
import {
  startWorkoutSimulator,
  parseSimulatorDescriptor,
  type WorkoutSimulatorHandle,
} from '@/lib/workout/workout-simulator';
import type { BLEMeasurement } from '@/lib/ble-protocol';

function getBelgradeDateString(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Belgrade',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  return `${parts.find((p) => p.type === 'year')?.value ?? '1970'}-${parts.find((p) => p.type === 'month')?.value ?? '01'}-${parts.find((p) => p.type === 'day')?.value ?? '01'}`;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function WorkoutSimScreen() {
  useKeepAwake();

  const router = useRouter();
  const { t } = useTranslation('workout');
  const { branding, activeGym } = useTheme();
  useBranding();
  const showModal = useAppModal((s) => s.showModal);
  const { session: authSession } = useSession();

  const {
    sessionId,
    gymId,
    machineType: paramMachineType,
    sensorId,
    machineId,
  } = useLocalSearchParams<{
    sessionId: string;
    gymId: string;
    machineType: string;
    sensorId: string;
    machineId: string;
  }>();

  // ── Session state ──────────────────────────────────────────────────────────
  const [session, setSession] = useState<any>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [duration, setDuration] = useState(0);
  const [averageRPM, setAverageRPM] = useState(0);
  const [sessionTier, setSessionTier] = useState<SessionTier>('normal');
  const [dailyRemaining, setDailyRemaining] = useState(300);
  const [targetDrops, setTargetDrops] = useState(120);
  const [isTrackingOnly, setIsTrackingOnly] = useState(false);
  const [hardCapHitDuringSession, setHardCapHitDuringSession] = useState(false);
  const [tierToast, setTierToast] = useState<string | null>(null);
  const [isFinishing, setIsFinishing] = useState(false);
  const [isMounted, setIsMounted] = useState(true);
  const tierToastTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ── Segment progress ───────────────────────────────────────────────────────
  const segmentTargetRef = useRef(120);
  const segmentTargetShared = useSharedValue(120);
  const sessionBaseShared = useSharedValue(0);
  const [segmentTarget, setSegmentTarget] = useState(120);
  const [sessionBase, setSessionBase] = useState(0);
  const segmentAdvancedAtRef = useRef(-1);

  // ── SharedValues for animated UI ──────────────────────────────────────────
  const rawRPMShared = useSharedValue(0);
  const smoothedRPMShared = useSharedValue(0);
  const earnedDropsShared = useSharedValue(0);
  const totalDropsShared = useSharedValue(0);
  const progressShared = useSharedValue(0);
  const caloriesShared = useSharedValue(0);
  const treadmillSpeedShared = useSharedValue(0);
  const dropJumpScale = useSharedValue(1);
  const [liquidGaugeValue, setLiquidGaugeValue] = useState('0');
  const [progressJS, setProgressJS] = useState(0);
  const [progressWidth, setProgressWidth] = useState<string | number>('0%');
  const [isOverachieved, setIsOverachieved] = useState(false);
  const [activeDrops, setActiveDrops] = useState<Array<{ id: string; startX: number; progress: number }>>([]);

  // ── Animated text SharedValues ─────────────────────────────────────────────
  const animatedRPMText = useSharedValue('0');
  const animatedCaloriesText = useSharedValue('0');
  const animatedPaceText = useSharedValue('--:--');
  const animatedSpeedText = useSharedValue('0.0');
  const animatedDistanceText = useSharedValue('0');
  const animatedInclineText = useSharedValue('0.0');
  const animatedDropsText = useSharedValue('0');

  // ── Refs ───────────────────────────────────────────────────────────────────
  const liquidGaugeRef = useRef<LiquidGaugeRef>(null);
  const rpmHistoryRef = useRef<number[]>([]);
  const speedHistoryRef = useRef<number[]>([]);
  const inclineHistoryRef = useRef<number[]>([]);
  const simulatorRef = useRef<WorkoutSimulatorHandle | null>(null);
  const isFinalizingRef = useRef(false);
  const simulatorElapsedRef = useRef<number | null>(null);
  const rawDistanceMetresRef = useRef(0);
  const isAppInBackgroundRef = useRef(false);
  const lastHapticTimeRef = useRef(0);
  const finishPressProgress = useSharedValue(0);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const finishWorkoutRef = useRef<(() => Promise<void>) | null>(null);

  // ── Derive machine type from simulator descriptor ─────────────────────────
  const resolvedMachineType = useMemo(() => {
    if (!sensorId) return paramMachineType ?? 'generic';
    const descriptor = parseSimulatorDescriptor(sensorId);
    const cfg = descriptor?.customConfig;
    // Custom configs carry an explicit machineType — always trust it
    if (cfg?.machineType) return cfg.machineType;
    // Non-custom profiles don't carry machine type metadata; fall back to
    // the URL param (set by the scanner when the session was created)
    return paramMachineType ?? 'generic';
  }, [paramMachineType, sensorId]);

  // Ring pulse intensity: speed-based for treadmill, RPM for bike/elliptical
  const ringIntensityShared = useDerivedValue(() => {
    if (resolvedMachineType === 'treadmill') {
      return Math.min(treadmillSpeedShared.value * 8, 150);
    }
    return smoothedRPMShared.value;
  });

  // Economy refs via hook
  const {
    dropLimitsRef,
    dropHistoryRef,
    streakContextRef,
    machineConfigRef,
    diminishingConfigRef,
    mergedPriorDropsRef,
  } = useWorkoutEconomy({
    userId: authSession?.user?.id,
    gymId: session?.gym_id ?? gymId,
    sessionId: session?.id ?? sessionId,
    sessionStartedAt: session?.started_at,
    machineType: resolvedMachineType ?? 'generic',
    onLimitsLoaded: (maxSessionDrops, initialDayRemaining, initialSegTarget) => {
      setTargetDrops(maxSessionDrops);
      setDailyRemaining(initialDayRemaining);
      segmentTargetRef.current = initialSegTarget;
      segmentTargetShared.value = initialSegTarget;
      setSegmentTarget(initialSegTarget);
    },
  });

  // ── Load session from DB ───────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) return;
    const load = async () => {
      try {
        const { data, error } = await supabase
          .from('sessions')
          .select('*, machine:machine_id(*), gym:gym_id(*)')
          .eq('id', sessionId)
          .single();
        if (error) throw error;
        setSession(data);
      } catch (err) {
        log.error('[WorkoutSim] Failed to load session:', err);
        showModal({
          title: t('sessionLoadFailedTitle'),
          body: t('sessionLoadFailedBody'),
          buttons: [{ label: t('backToScan'), onPress: () => router.replace('/scan') }],
        });
      } finally {
        setSessionLoading(false);
      }
    };
    void load();
  }, [sessionId]);

  // ── Sync animated text reactions ──────────────────────────────────────────
  useAnimatedReaction(
    () => earnedDropsShared.value,
    (v) => {
      'worklet';
      runOnJS(setLiquidGaugeValue)(Math.round(v).toString());
      animatedDropsText.value = Math.round(v).toString();
    },
  );

  useAnimatedReaction(
    () => progressShared.value,
    (v) => {
      'worklet';
      runOnJS(setProgressJS)(v);
      runOnJS(setProgressWidth)(`${Math.min(v * 100, 100).toFixed(1)}%`);
    },
  );

  // ── Start simulator once session is loaded ─────────────────────────────────
  useEffect(() => {
    if (sessionLoading || !session) return;
    if (!sensorId) return;

    const descriptor = parseSimulatorDescriptor(sensorId);
    if (!descriptor) {
      log.warn('[WorkoutSim] Unknown simulator descriptor:', sensorId);
      return;
    }

    const handle = startWorkoutSimulator({
      profile: descriptor.profile,
      customConfig: descriptor.customConfig,
      onMeasurement: (measurement: BLEMeasurement) => {
        const rpm = measurement.rpm ?? 0;
        rawRPMShared.value = rpm;
        smoothedRPMShared.value = rpm;
        animatedRPMText.value = rpm.toString();

        if (measurement.elapsedTime != null) {
          simulatorElapsedRef.current = measurement.elapsedTime;
        }

        if (measurement.speed != null) {
          treadmillSpeedShared.value = measurement.speed;
          animatedSpeedText.value = measurement.speed.toFixed(1);
          if (measurement.speed > 0) {
            speedHistoryRef.current.push(measurement.speed);
            if (speedHistoryRef.current.length > 60) speedHistoryRef.current.shift();
            const paceMinKm = 60 / measurement.speed;
            const paceMin = Math.floor(paceMinKm);
            const paceSec = Math.round((paceMinKm - paceMin) * 60);
            animatedPaceText.value = `${paceMin}:${paceSec.toString().padStart(2, '0')}`;
          }
        }
        if (measurement.distance != null) {
          rawDistanceMetresRef.current = measurement.distance;
          animatedDistanceText.value = measurement.distance >= 1000
            ? (measurement.distance / 1000).toFixed(2)
            : Math.round(measurement.distance).toString();
        }
        if (measurement.incline != null) {
          animatedInclineText.value = measurement.incline.toFixed(1);
          if (measurement.incline > 0) {
            inclineHistoryRef.current.push(measurement.incline);
            if (inclineHistoryRef.current.length > 60) inclineHistoryRef.current.shift();
          }
        }
        if (measurement.calories != null && measurement.calories > 0) {
          caloriesShared.value = measurement.calories;
          animatedCaloriesText.value = Math.round(measurement.calories).toString();
        }

        if (rpm > 0) {
          rpmHistoryRef.current.push(rpm);
          if (rpmHistoryRef.current.length > 30) rpmHistoryRef.current.shift();
        }
      },
      onComplete: () => {
        void finishWorkoutRef.current?.();
      },
    });

    simulatorRef.current = handle;

    return () => {
      handle.stop();
      simulatorRef.current = null;
    };
  }, [sessionLoading, session]);

  // ── 1-second timer (updates duration + live drops) ────────────────────────
  useEffect(() => {
    const gaugeTarget = segmentTargetRef.current;

    const interval = setInterval(() => {
      setDuration((prev) => {
        const seconds = simulatorElapsedRef.current != null
          ? Math.floor(simulatorElapsedRef.current)
          : prev + 1;

        const now = new Date();
        const avgRpm = rpmHistoryRef.current.length > 0
          ? rpmHistoryRef.current.reduce((a, b) => a + b, 0) / rpmHistoryRef.current.length
          : smoothedRPMShared.value;

        setAverageRPM(Math.round(avgRpm));

        if (seconds > 0) {
          const result = estimateLiveDropsDetailed({
            durationSeconds: seconds,
            calories: Math.round(caloriesShared.value),
            machineType: (resolvedMachineType ?? 'generic') as any,
            avgRpm,
            avgSpeedKmh: treadmillSpeedShared.value,
            cadencePerMin: avgRpm,
            rpmPeak: rpmHistoryRef.current.length > 0 ? Math.max(...rpmHistoryRef.current) : undefined,
            limits: dropLimitsRef.current,
            history: dropHistoryRef.current,
            streak: streakContextRef.current,
            todayDate: getBelgradeDateString(now),
            machineConfig: machineConfigRef.current,
            diminishingConfig: diminishingConfigRef.current,
            mergedPriorDrops: mergedPriorDropsRef.current,
          });

          setSessionTier(result.tier);
          setDailyRemaining(result.dailyRemaining);
          if (result.hardCapReached && !hardCapHitDuringSession) {
            setHardCapHitDuringSession(true);
            setIsTrackingOnly(true);
          }

          const nextDrops = Math.max(0, Math.round(result.drops));
          const current = Math.round(earnedDropsShared.value);
          if (nextDrops > current) {
            earnedDropsShared.value = nextDrops;
            totalDropsShared.value = nextDrops;

            // Trigger drop jump animation
            try { liquidGaugeRef.current?.triggerImpact(); } catch { /* unmounted */ }
            dropJumpScale.value = withSequence(
              withTiming(1.15, { duration: 150, easing: Easing.out(Easing.ease) }),
              withTiming(1, { duration: 150, easing: Easing.in(Easing.ease) }),
            );
            const hapticNow = Date.now();
            if (hapticNow - lastHapticTimeRef.current > 800) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              lastHapticTimeRef.current = hapticNow;
            }

            const base = sessionBaseShared.value;
            const prog = Math.min(nextDrops / Math.max(gaugeTarget, 1), 1.05);
            progressShared.value = withTiming(prog, { duration: 800 });
            if (nextDrops > gaugeTarget + base && nextDrops > segmentAdvancedAtRef.current) {
              segmentAdvancedAtRef.current = nextDrops;
              const newBase = nextDrops;
              sessionBaseShared.value = newBase;
              setSessionBase(newBase);
              const newTarget = Math.max(1, Math.min(
                dropLimitsRef.current.maxDropsPerSession,
                Math.max(0, dailyRemaining - nextDrops),
              ));
              segmentTargetRef.current = newTarget;
              segmentTargetShared.value = newTarget;
              setSegmentTarget(newTarget);
              progressShared.value = 0;
            }
          }
        }

        return seconds;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [resolvedMachineType, hardCapHitDuringSession]);

  // ── AppState ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      isAppInBackgroundRef.current = s === 'background' || s === 'inactive';
    });
    return () => sub.remove();
  }, []);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      setIsMounted(false);
      simulatorRef.current?.stop();
      cancelAnimation(earnedDropsShared);
      cancelAnimation(progressShared);
      if (tierToastTimerRef.current) clearTimeout(tierToastTimerRef.current);
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    };
  }, []);

  // ── Finish workout ─────────────────────────────────────────────────────────
  const finishWorkout = useCallback(async () => {
    if (isFinalizingRef.current) return;
    isFinalizingRef.current = true;
    setIsFinishing(true);

    simulatorRef.current?.stop();
    simulatorRef.current = null;

    if (!authSession?.user || !session?.id) {
      router.replace('/scan');
      return;
    }

    let pendingSync = false;
    try {
      const estimatedCalories = Math.round(caloriesShared.value);
      const finalAvgRpm = rpmHistoryRef.current.length > 0
        ? Math.round(rpmHistoryRef.current.reduce((a, b) => a + b, 0) / rpmHistoryRef.current.length)
        : Math.round(smoothedRPMShared.value);
      const finalAvgSpeed = speedHistoryRef.current.length > 0
        ? Math.round((speedHistoryRef.current.reduce((a, b) => a + b, 0) / speedHistoryRef.current.length) * 10) / 10
        : Math.round(treadmillSpeedShared.value * 10) / 10;
      const finalAvgIncline = inclineHistoryRef.current.length > 0
        ? Math.round((inclineHistoryRef.current.reduce((a, b) => a + b, 0) / inclineHistoryRef.current.length) * 10) / 10
        : 0;
      const deviceHash = await getDeviceFingerprintHash();

      const existingRaw = (session.raw_metrics && typeof session.raw_metrics === 'object')
        ? session.raw_metrics as Record<string, unknown>
        : {};

      const rawMetrics: Record<string, unknown> = {
        ...existingRaw,
        avg_rpm: finalAvgRpm,
        // cadence_avg is the primary key the backend reads for elliptical/stepper;
        // avg_cadence is kept as a fallback alias.
        cadence_avg: finalAvgRpm,
        avg_cadence: finalAvgRpm,
        // speed_avg_kmh is required for treadmill; the backend guards on < 1 km/h.
        speed_avg_kmh: finalAvgSpeed,
        // incline_avg_pct used for treadmill intensity boost.
        incline_avg_pct: finalAvgIncline,
        machine_type: resolvedMachineType,
        calories_source: 'simulator',
        ble_protocol: 'ftms',
        security: {
          ...(typeof existingRaw.security === 'object' ? existingRaw.security : {}),
          device_hash: deviceHash,
        },
      };

      let finalSyncOk = false;
      try {
        await withRetry(async () => {
          const { error: syncErr } = await supabase
            .from('sessions')
            .update({
              duration_seconds: duration,
              calories: estimatedCalories > 0 ? estimatedCalories : null,
              raw_metrics: rawMetrics,
              updated_at: new Date().toISOString(),
            })
            .eq('id', session.id);
          if (syncErr) throw syncErr;
        }, { attempts: 3, baseDelayMs: 1000, label: 'WorkoutSim/finalSync' });
        finalSyncOk = true;
      } catch (syncRetryErr) {
        log.error('[WorkoutSim] Final sync failed after retries:', syncRetryErr);
      }

      let dropsEarned = 0;
      let awardMultiplier: number | null = null;
      let awardBadges: string[] | null = null;

      try {
        const awardResult = await withRetry(async () => {
          const { data, error: rpcErr } = await supabase.rpc('award_drops', { p_session_id: session.id });
          if (rpcErr) throw new Error(rpcErr.message || 'award_drops RPC error');
          return data;
        }, { attempts: 3, baseDelayMs: 1500, label: 'WorkoutSim/awardDrops' });

        const awardRow = (Array.isArray(awardResult) && awardResult.length > 0) ? awardResult[0] : null;
        dropsEarned = awardRow?.drops_earned ?? 0;
        awardMultiplier = awardRow?.multiplier ?? null;
        awardBadges = awardRow?.badges_earned?.length ? awardRow.badges_earned : null;

        // Evaluate referral qualification (check-in + identity verification)
        void supabase
          .rpc('evaluate_referral_qualification', { p_referral_id: null })
          .then(({ error: refErr }) => {
            if (refErr && __DEV__) log.warn('[WorkoutSim] evaluate_referral_qualification failed:', refErr.message);
          });
      } catch (awardRetryErr) {
        log.error('[WorkoutSim] award_drops failed after all retries:', awardRetryErr);
        await savePendingFinalization(session.id);
        pendingSync = true;
      }

      if (!finalSyncOk && !pendingSync) {
        await savePendingFinalization(session.id);
        pendingSync = true;
      }

      try {
        await supabase
          .from('sessions')
          .update({ is_active: false, ended_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', session.id);
      } catch (endErr) {
        log.error('[WorkoutSim] Failed to mark session inactive:', endErr);
      }

      if (!isMounted) return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      router.replace({
        pathname: '/session-summary',
        params: {
          sessionId: session.id,
          drops: dropsEarned.toString(),
          duration: duration.toString(),
          gymId: session.gym_id,
          sessionTier,
          ...(awardMultiplier ? { multiplier: String(awardMultiplier) } : {}),
          ...(awardBadges?.length ? { badges: JSON.stringify(awardBadges) } : {}),
          trackingOnly: isTrackingOnly ? '1' : undefined,
          pendingSync: pendingSync ? '1' : undefined,
        },
      });
    } catch (error) {
      log.error('[WorkoutSim] finishWorkout error:', error);
      await savePendingFinalization(session.id);
      if (isMounted) {
        router.replace({
          pathname: '/session-summary',
          params: {
            sessionId: session.id,
            drops: '0',
            duration: duration.toString(),
            gymId: session.gym_id,
            pendingSync: '1',
          },
        });
      }
    } finally {
      isFinalizingRef.current = false;
    }
  }, [session, authSession, duration, sessionTier, isTrackingOnly, isMounted, resolvedMachineType]);

  finishWorkoutRef.current = finishWorkout;

  // ── Long-press finish ──────────────────────────────────────────────────────
  const handleFinishPressIn = useCallback(() => {
    longPressTimerRef.current = setTimeout(() => void finishWorkout(), 1500);
    finishPressProgress.value = withTiming(1, { duration: 1500 });
  }, [finishWorkout]);

  const handleFinishPressOut = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    finishPressProgress.value = withTiming(0, { duration: 200 });
  }, []);

  const finishButtonStyle = useAnimatedStyle(() => ({
    width: `${interpolate(finishPressProgress.value, [0, 1], [0, 100])}%`,
  }));

  // ── Loading state ─────────────────────────────────────────────────────────
  if (sessionLoading) {
    return (
      <SafeAreaView style={workoutStyles.container} edges={['top']}>
        <ActivityIndicator size="large" color={branding.primary} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={workoutStyles.container} edges={['top']}>
      {/* Background — matches workout.tsx */}
      {activeGym?.background_url && (
        <Image
          source={activeGym.background_url}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
          transition={200}
          pointerEvents="none"
        />
      )}
      {Platform.OS === 'ios' ? (
        <PlatformBlur intensity={30} style={StyleSheet.absoluteFill} tint="dark" pointerEvents="none">
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }]} />
        </PlatformBlur>
      ) : (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8,10,18,0.58)' }]} />
      )}

      {/* Header — simulation badge left, drops right */}
      <View style={workoutStyles.header}>
        <View style={workoutStyles.leftHeader}>
          <View style={simStyles.simBadge}>
            <Ionicons name="flask" size={13} color="#FDE68A" />
            <Text style={simStyles.simBadgeText}>SIMULATION</Text>
          </View>
        </View>
        <View style={workoutStyles.headerRight}>
          <View style={workoutStyles.headerDrops}>
            <Ionicons name="water" size={20} color={theme.colors.primary} />
            <AnimatedText
              text={animatedDropsText}
              style={[workoutStyles.headerDropsText, getNumberStyle(18), { color: theme.colors.primary }]}
            />
          </View>
        </View>
      </View>

      {/* Center — LiquidGauge + CircularProgressRing (matches workout.tsx) */}
      <View style={workoutStyles.waterContainer}>
        <View style={workoutStyles.gaugeBackgroundGlow} />

        <View style={workoutStyles.circleWrapper}>
          {/* LiquidGauge — rendered first (below ring) */}
          {!isTrackingOnly && !hardCapHitDuringSession && (
            <LiquidGauge
              ref={liquidGaugeRef}
              progress={progressShared}
              value={liquidGaugeValue}
              size={280}
              strokeWidth={4}
              rpm={smoothedRPMShared}
              dropScale={dropJumpScale}
              brandingColor={branding.primary}
            />
          )}

          {/* CircularProgressRing — on top of gauge */}
          {!isTrackingOnly && !hardCapHitDuringSession && (
            <CircularProgressRing
              progress={progressJS}
              size={290}
              strokeWidth={3}
              rpm={ringIntensityShared}
              primaryColor={branding.primary}
            />
          )}

          {/* Daily limit reached state */}
          {(isTrackingOnly || hardCapHitDuringSession) && (
            <View style={workoutStyles.trackingOnlyCircle}>
              <View style={workoutStyles.trackingOnlyInner}>
                <Ionicons name="checkmark-circle" size={44} color="#4CD964" style={{ marginBottom: 10 }} />
                <Text style={workoutStyles.trackingOnlyHeading}>{t('dailyGoalReached')}</Text>
                <Text style={workoutStyles.trackingOnlySubtext}>{t('workoutTracked')}</Text>
              </View>
            </View>
          )}

          {/* DROPS label */}
          {!isTrackingOnly && !hardCapHitDuringSession && (
            <View style={workoutStyles.dropsLabelContainer}>
              <Text style={workoutStyles.dropsLabel}>{t('drops')}</Text>
            </View>
          )}

          {/* DropEmitter */}
          {!isTrackingOnly && !hardCapHitDuringSession && (
            <DropEmitter
              drops={activeDrops}
              containerSize={280}
              onImpact={() => {
                liquidGaugeRef.current?.triggerImpact();
              }}
              onDropComplete={(dropId) => {
                setActiveDrops((prev) => prev.filter((drop) => drop.id !== dropId));
              }}
            />
          )}
        </View>
      </View>

      {/* Tier toast */}
      {!!tierToast && (
        <Animated.View entering={FadeInDown.duration(300)} style={simStyles.tierBanner}>
          <Text style={simStyles.tierBannerText}>{tierToast}</Text>
        </Animated.View>
      )}

      {/* Stats Grid */}
      <WorkoutStatsGrid
        machineType={resolvedMachineType ?? ''}
        duration={duration}
        bleConnected
        signalStatus="ok"
        hasSensor
        animatedRPMText={animatedRPMText}
        animatedCaloriesText={animatedCaloriesText}
        animatedPaceText={animatedPaceText}
        animatedSpeedText={animatedSpeedText}
        animatedDistanceText={animatedDistanceText}
        animatedInclineText={animatedInclineText}
        rpmPulseStyle={{}}
        rpmTextColorStyle={{}}
        distanceUnitLabel={rawDistanceMetresRef.current >= 1000 ? 'km' : 'm'}
        primaryColor={branding.primary}
        formatTime={formatTime}
        labels={{
          time: 'Time',
          rpm: t('rpm'),
          kcal: t('kcal'),
          kmh: t('kmh'),
          minPerKm: t('minPerKm'),
          incline: t('incline'),
        }}
      />

      {/* Progress Bar */}
      <GoalProgressBar
        currentDrops={parseInt(liquidGaugeValue || '0')}
        sessionBase={sessionBase}
        segmentTarget={segmentTarget}
        progressWidth={progressWidth as string}
        isOverachieved={isOverachieved}
        isTrackingOnly={isTrackingOnly}
        dailyRemaining={dailyRemaining}
        primaryColor={branding.primary}
        goalLabel={t('goal')}
        remainingTodayLabel={t('remainingToday')}
        limitReachedLabel={t('limitReached')}
      />

      {/* Controls */}
      <WorkoutControls
        isPaused={false}
        onPauseResume={() => {}}
        onFinishPressIn={handleFinishPressIn}
        onFinishPressOut={handleFinishPressOut}
        finishButtonStyle={finishButtonStyle}
        finishWorkoutLabel={t('finishWorkout')}
        showPauseButton={false}
      />

      {/* Finishing overlay */}
      {isFinishing && (
        <View style={simStyles.finishingOverlay}>
          <ActivityIndicator size="large" color={branding.primary} />
          <Text style={simStyles.finishingText}>Saving workout…</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const simStyles = StyleSheet.create({
  simBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: 'rgba(253,230,138,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(253,230,138,0.25)',
  },
  simBadgeText: {
    ...fontStyles.heading,
    fontSize: 11,
    letterSpacing: 1.2,
    color: '#FDE68A',
  },
  tierBanner: {
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginBottom: 4,
  },
  tierBannerText: {
    ...fontStyles.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.65)',
  },
  finishingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  finishingText: {
    ...fontStyles.body,
    color: theme.colors.text,
    fontSize: 16,
  },
});
