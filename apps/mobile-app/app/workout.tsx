import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, AppState, AppStateStatus, BackHandler, Alert, Platform } from 'react-native';
import { useAppModal } from '@/lib/stores/useAppModal';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useThrottledRouter } from '@/hooks/useThrottledRouter';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useAnimatedReaction,
  useFrameCallback,
  withTiming,
  withSpring,
  withSequence,
  withRepeat,
  interpolate,
  interpolateColor,
  Easing,
  runOnJS,
  cancelAnimation,
  FadeInDown,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import { PlatformBlur } from '@/components/PlatformBlur';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { theme, getNumberStyle } from '@/lib/theme';
import LiquidGauge, { LiquidGaugeRef } from '@/components/LiquidGauge';
import { DropEmitter } from '@/components/DropEmitter';
import CircularProgressRing from '@/components/CircularProgressRing';
  
import { useChallengeProgress } from '@/hooks/useChallengeProgress';
import {
  bleService,
  CSCMeasurement,
  BlePeripheralNotFoundError,
  BleAmbiguousIdentityError,
  BlePeripheralMismatchError,
  type MachineIdentity,
} from '@/lib/ble-service';
import { useBranding } from '@/lib/hooks/useBranding';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { ActiveChallengesOverlay } from '@/components/ActiveChallengesOverlay';
import { useTranslation } from 'react-i18next';
import { getDeviceFingerprintHash } from '@/lib/security/deviceFingerprint';
import {
  createInactivityPolicy,
  createInactivityState,
  evaluateInactivity,
  markInactivityFinalized,
  InactivityFinalizeCoordinator,
} from '@/lib/workout/inactivity-autofinish';
import { estimateLiveDropsDetailed, type SessionTier } from '@/lib/workout/live-drops-estimator';
import { useWorkoutEconomy } from '@/lib/workout/useWorkoutEconomy';
import { useWorkoutSync } from '@/lib/workout/useWorkoutSync';
import { withRetry } from '@/lib/workout/withRetry';
import { savePendingFinalization } from '@/lib/workout/pendingFinalization';
import AnimatedText from '@/components/workout/AnimatedText';
import WorkoutStatsGrid from '@/components/workout/WorkoutStatsGrid';
import GoalProgressBar from '@/components/workout/GoalProgressBar';
import WorkoutControls from '@/components/workout/WorkoutControls';
import { MachineNotInRangeOverlay } from '@/components/workout/MachineNotInRangeOverlay';
import { PeripheralMismatchModal } from '@/components/workout/PeripheralMismatchModal';
import { styles } from './workout.styles';

import { useHappyHour } from '@/hooks/useHappyHour';
import { log } from '@/lib/logger';

// AnimatedText is imported from @/components/workout/AnimatedText

// Compact status badge — consistent icon pill for the left header column
interface StatusBadgeProps {
  icon: string;
  label: string;
  color: string;
  pulse?: boolean;
}

const StatusBadge = ({ icon, label, color, pulse }: StatusBadgeProps) => {
  const pulseAnim = useSharedValue(1);

  useEffect(() => {
    if (pulse) {
      pulseAnim.value = withRepeat(
        withSequence(
          withTiming(0.55, { duration: 900, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      );
    } else {
      pulseAnim.value = 1;
    }
  }, [pulse]);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulseAnim.value }));

  return (
    <Animated.View style={[statusBadgeStyles.row, pulseStyle]}>
      <Ionicons name={icon as any} size={11} color={color} />
      <Text style={[statusBadgeStyles.label, { color }]}>{label}</Text>
    </Animated.View>
  );
};

const statusBadgeStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignSelf: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  label: {
    fontFamily: 'System',
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.1,
  },
});

function mapSecurityError(message: string): 'cap' | 'rate' | 'fraud' | 'other' {
  const msg = message.toLowerCase();
  if (msg.includes('fraud') || msg.includes('abuse') || msg.includes('risk') || msg.includes('blocked')) {
    return 'fraud';
  }
  if (msg.includes('rate limit') || msg.includes('too many requests') || msg.includes('throttle') || msg.includes('429')) {
    return 'rate';
  }
  if (
    msg.includes('cap') ||
    msg.includes('daily limit') ||
    msg.includes('weekly limit') ||
    msg.includes('session limit') ||
    msg.includes('issuance')
  ) {
    return 'cap';
  }
  return 'other';
}

function getBelgradeDateString(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Belgrade',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

export default function WorkoutScreen() {
  useKeepAwake();

  const { sessionId, equipmentId, gymId, machineType: paramMachineType, sensorId, machineId, bleProtocol } = useLocalSearchParams<{
    sessionId?: string;
    equipmentId?: string;
    gymId?: string;
    machineType?: string;
    sensorId?: string;
    machineId?: string;
    bleProtocol?: string;
  }>();
  const isSimulator = sensorId?.startsWith('sim:') ?? false;
  const { branding, activeGym } = useTheme();
  const brandingHook = useBranding();
  const { t } = useTranslation('workout');
  const showModal = useAppModal((s) => s.showModal);
  const [isTrackingOnly, setIsTrackingOnly] = useState(false);
  const happyHour = useHappyHour(gymId || null, paramMachineType || null);
  const [session, setSession] = useState<any>(null);
  // REMOVED: drops, displayDrops, earnedDrops, activeDrops, rpm, smoothedRPM - now using SharedValues
  const [duration, setDuration] = useState(0);
  const [calories, setCalories] = useState(0);
  // REMOVED: pace useState - now using animatedPaceText SharedValue
  const [targetDrops, setTargetDrops] = useState(120);
  const [sessionTier, setSessionTier] = useState<SessionTier>('normal');
  const [dailyRemaining, setDailyRemaining] = useState<number>(300);
  // Segment-based progress: resets each time a session cap is completed
  // sessionBaseShared = total drops at the start of current segment
  // segmentTargetShared = drops to earn in this segment (min of session cap & daily remaining)
  const sessionBaseShared = useSharedValue(0);
  const segmentTargetShared = useSharedValue(120);
  const segmentTargetRef = useRef(120); // JS-thread mirror for imperative updates
  const segmentAdvancedAtRef = useRef<number>(-1); // total drops value at which we last advanced
  const [hardCapHitDuringSession, setHardCapHitDuringSession] = useState(false);
  const tier1ShownRef = useRef(false);
  const tier2ShownRef = useRef(false);
  const [tierToast, setTierToast] = useState<string | null>(null);
  const tierToastTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [pausedTime, setPausedTime] = useState<Date | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [pauseReason, setPauseReason] = useState<'manual' | 'inactivity' | 'connection'>('manual');
  // REMOVED: challengeMessage state - challenge completions are now shown in session summary
  // Challenge progress is automatically updated via award_drops() when workout ends
  const [averageRPM, setAverageRPM] = useState<number>(0); // Average RPM for database sync (low frequency, OK to use state)
  const [showAutoPauseOverlay, setShowAutoPauseOverlay] = useState(false);
  
  const [showInactivityWarning, setShowInactivityWarning] = useState(false);
  const [inactivityCountdownSec, setInactivityCountdownSec] = useState(0);
  const [showNoActivityCancelOverlay, setShowNoActivityCancelOverlay] = useState(false);

  // BLE cross-talk safety overlays (Steps 1 + 3)
  const [showMachineNotInRangeOverlay, setShowMachineNotInRangeOverlay] = useState(false);
  const [showPeripheralMismatchModal, setShowPeripheralMismatchModal] = useState(false);

  const [isReconnecting, setIsReconnecting] = useState(false);
  const [showChallengesOverlay, setShowChallengesOverlay] = useState(false);
  const [reconnectTrigger, setReconnectTrigger] = useState(0); // Increment to force BLE useEffect re-run after reconnect
  const reconnectAttemptRef = useRef<number>(0); // Track reconnect attempts for exponential backoff
  // Bug 1: BLE connecting timeout — show "Cancel Workout" after 60s waiting
  const [showConnectingCancel, setShowConnectingCancel] = useState(false);
  const connectingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Bug 8: Resume fail counter — after 3 failures, offer "End workout"
  const resumeFailCountRef = useRef<number>(0);
  const [, setShowForceFinishOption] = useState(false);
  // Bug 4a: Track when the connection-pause overlay first appeared so we can
  // automatically attempt reconnects + reveal the "Save what I've got"
  // affordance without user input. Cleared whenever pause exits.
  const connectionPausedSinceRef = useRef<number | null>(null);
  const autoReconnectInFlightRef = useRef<boolean>(false);
  // Bug 4c: Background auto-finalize timer. Set on AppState=background while
  // BLE is gone; cancelled if app returns to foreground in time.
  const backgroundFinalizeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const autoFinalizeFiredRef = useRef<boolean>(false);
  const isPausedRef = useRef(false); // Stable ref for BLE callbacks (avoids stale closures & dep array issues)
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastCrankRevolutionsForAutoResumeRef = useRef<number>(0); // Track for auto-resume
  // Step 2: manual pause guard — prevents FTMS treadmill belt inertia from
  // triggering auto-resume immediately after the user presses Pause.
  const manualPausedAtRef = useRef<number | null>(null);
  const AUTO_RESUME_GUARD_MS = 5000;
  const [bleConnected, setBleConnected] = useState(false);
  const [, setBleStatus] = useState<string>('');
  const [sessionLoading, setSessionLoading] = useState(true);
  const [isResumingFromPause, setIsResumingFromPause] = useState(false);
  const [signalStatus, setSignalStatus] = useState<'ok' | 'lost'>('ok');
  const [awaitingActivityProof, setAwaitingActivityProof] = useState(false);
  const router = useThrottledRouter();
  const { session: authSession } = useSession();
  const liquidGaugeRef = useRef<LiquidGaugeRef>(null);
  // DropEmitter now uses drops prop instead of imperative API
  const [activeDrops, setActiveDrops] = useState<Array<{ id: string; startX: number; progress: number }>>([]);
  const isMountedRef = useRef<boolean>(true); // Track if component is mounted
  const isAppInBackgroundRef = useRef<boolean>(false); // Track app foreground/background state
  const lastHapticTimeRef = useRef<number>(0); // Throttle haptic feedback (max 5/s)
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const inactivityStateRef = useRef(createInactivityState());
  const inactivityFinalizeCoordinatorRef = useRef(new InactivityFinalizeCoordinator());
  const [heartbeatAllowed, setHeartbeatAllowed] = useState(true);
  const bleMonitoringRef = useRef<boolean>(false);
  const lastRPMTimeRef = useRef<number>(Date.now());
  const autoPauseTimerRef = useRef<NodeJS.Timeout | null>(null);
  const activityProofTimerRef = useRef<NodeJS.Timeout | null>(null);
  const firstActivityDetectedRef = useRef<boolean>(false);
  const isFinalizingRef = useRef<boolean>(false);
  // Stable ref to handleFinishWorkout so BLE/simulator callbacks can call it
  // without capturing a stale closure.
  const handleFinishWorkoutRef = useRef<(() => void) | null>(null);
  const lastRPMUpdateRef = useRef<number>(0);
  // BLE Data Optimization: Track last measurement to filter duplicates
  const lastMeasurementRef = useRef<{ crankRevolutions: number; lastCrankEventTime: number } | null>(null);
  // Drop calculation: Track last crank revolutions for drop calculation
  const lastCrankRevolutionsRef = useRef<number>(0);
  // Economy refs are populated by useWorkoutEconomy (called after machineType is resolved below)
  // RPM history for average calculation (long-term, 30 values)
  const rpmHistoryRef = useRef<number[]>([]);
  // RPM smoothing: Track last 4 raw RPM values for moving average (Walking Mode)
  const rpmRawHistoryRef = useRef<number[]>([]);
  // PRO-FITNESS: RPM Persistence - track last known RPM for 2-second persistence
  const lastNonZeroRPMRef = useRef<number>(0); // Store last non-zero RPM for persistence
  // Critical Fix: Track consecutive 0 packets to detect legitimate stop (not glitch)
  const consecutiveZeroCountRef = useRef<number>(0); // Count consecutive 0 packets
  // Step-to-Drop: Track last step detection for walking mode
  const lastStepDetectionRef = useRef<number>(0); // Timestamp of last detected step
  const stepDetectionThreshold = 50; // Minimum RPM to consider as a step (walking mode)
  // FTMS extended metrics tracking (accumulated during workout for raw_metrics)
  const ftmsSpeedHistoryRef = useRef<number[]>([]);
  const ftmsMaxSpeedRef = useRef<number>(0);
  const ftmsTotalDistanceRef = useRef<number>(0);
  const ftmsMaxPowerRef = useRef<number>(0);
  const ftmsPowerHistoryRef = useRef<number[]>([]);
  const ftmsDeviceCaloriesRef = useRef<number>(0);
  const ftmsProtocolActiveRef = useRef<boolean>(false);
  // Simulator: tracks elapsedTime from FTMS measurement so timeScale is honoured
  const simulatorElapsedRef = useRef<number | null>(null);
  const treadmillDropAccRef = useRef<number>(0);
  const treadmillCalAccRef = useRef<number>(0); // Fractional calorie accumulator for treadmill
  const treadmillLastMeasureTimeRef = useRef<number>(0); // For speed-based distance and calorie accumulation
  const timeProgressIntervalRef = useRef<NodeJS.Timeout | null>(null); // Ref for time-based progress interval (critical for cleanup)
  // CRITICAL: Refs for BLE callback to avoid stale closures
  
  // Explosion animation when BLE connects
  const explosionScale = useSharedValue(1);
  const explosionOpacity = useSharedValue(0);
  // Connecting state animation (subtle pulse)
  const connectingPulseScale = useSharedValue(1);
  const connectingPulseOpacity = useSharedValue(0.5);
  // ============================================================================
  // PREMIUM UI: SharedValues for High-Frequency Data (GPU-Only, No JS Thread Blocking)
  // ============================================================================
  
  // Core Data SharedValues
  const rawRPMShared = useSharedValue(0); // Raw RPM from BLE (updated directly in callback)
  const smoothedRPMShared = useSharedValue(0); // Smoothed RPM (calculated via useDerivedValue)
  const earnedDropsShared = useSharedValue(0); // Total drops earned (updated in BLE callback)
  const totalDropsShared = useSharedValue(0); // Total drops for display (same as earnedDrops for now)
  const progressShared = useSharedValue(0); // Progress (0 to 1) for LiquidGauge
  const caloriesShared = useSharedValue(0); // Calories (calculated from drops)
  const totalCrankRevolutionsShared = useSharedValue(0); // Total crank revolutions for bike (for kcal and pace calculation)
  const treadmillSpeedShared = useSharedValue(0); // km/h from FTMS treadmill for pace calculation

  // Dynamic Branding: Primary color as SharedValue for Reanimated interpolateColor
  const primaryColorShared = useSharedValue(branding.primary);
  
  // Update primaryColorShared when branding changes
  useEffect(() => {
    primaryColorShared.value = branding.primary;
  }, [branding.primary, primaryColorShared]);
  
  // UI State SharedValues
  const isPausedShared = useSharedValue(0); // 0 = false, 1 = true
  const bleConnectedShared = useSharedValue(0); // 0 = false, 1 = true
  const lastPacketTime = useSharedValue(Date.now()); // Track last packet timestamp for watchdog timer
  
  

  // Keep isPausedRef in sync for BLE callback (avoids stale closures, no dep array re-trigger)
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);
  
  // Premium UI Animations
  const dropJumpScale = useSharedValue(1); // Drop animation: Jump animation when drops increase
  const rpmPulseScale = useSharedValue(1); // RPM Pulse: Subtle scale animation when RPM jumps significantly
  const lastRPMValue = useSharedValue(0); // Track last RPM value to detect significant jumps

  // Determine machine type from machine (preferred) or equipment (fallback)
  const machineType = paramMachineType || 
    session?.machine?.type || 
    session?.equipment?.equipment_type || 
    (session?.equipment?.name?.toLowerCase().includes('treadmill') ? 'treadmill' :
     session?.equipment?.name?.toLowerCase().includes('bike') ? 'bike' : null);

  const inactivityPolicy = useMemo(() => {
    const warningPolicy = Number((session?.gym as { session_warning_after_sec?: number } | undefined)?.session_warning_after_sec);
    const autoFinishPolicy = Number((session?.gym as { session_inactivity_autofinish_sec?: number } | undefined)?.session_inactivity_autofinish_sec);
    return createInactivityPolicy(
      Number.isFinite(warningPolicy) ? warningPolicy : undefined,
      Number.isFinite(autoFinishPolicy) ? autoFinishPolicy : undefined
    );
  }, [session?.gym]);

  const {
    dropLimitsRef,
    dropHistoryRef,
    streakContextRef,
    machineConfigRef,
    diminishingConfigRef,
    mergedPriorDropsRef,
  } = useWorkoutEconomy({
    userId: authSession?.user?.id,
    gymId: session?.gym_id,
    sessionId: session?.id,
    sessionStartedAt: session?.started_at,
    machineType: machineType ?? 'generic',
    onLimitsLoaded: (maxSessionDrops, initialDayRemaining, initialSegTarget) => {
      setTargetDrops(maxSessionDrops);
      setDailyRemaining(initialDayRemaining);
      segmentTargetRef.current = initialSegTarget;
      segmentTargetShared.value = initialSegTarget;
    },
  });

  // Ring pulse intensity: speed-based for treadmill, RPM for bike/elliptical
  // Maps treadmill speed (0–15 km/h) → 0–120 to match RPM color breakpoints in CircularProgressRing
  const ringIntensityShared = useDerivedValue(() => {
    if (machineType === 'treadmill') {
      return Math.min(treadmillSpeedShared.value * 8, 150);
    }
    return smoothedRPMShared.value;
  }, [treadmillSpeedShared, smoothedRPMShared, machineType]);

  // Sync JS state to SharedValues for useAnimatedReaction dependencies
  useEffect(() => {
    isPausedShared.value = isPaused ? 1 : 0;
  }, [isPaused, isPausedShared]);

  // Step 2: dev-mode guard — detect if auto-resume fired against a manual pause
  useEffect(() => {
    if (__DEV__ && pauseReason === 'manual' && !isPaused && pausedTime !== null) {
      log.warn('[Workout] Suspicious state: pauseReason=manual but isPaused=false while pausedTime is set. Auto-resume guard may have failed.');
    }
  }, [isPaused, pauseReason, pausedTime]);

  useEffect(() => {
    bleConnectedShared.value = bleConnected ? 1 : 0;
  }, [bleConnected, bleConnectedShared]);

  // ────────────────────────────────────────────────────────────────────────
  // Bug 4c refs: AppState callbacks fire long after the closure captured
  // them, so we need refs for any value the auto-finalize timer must read
  // at the moment background→foreground transitions occur.
  // ────────────────────────────────────────────────────────────────────────
  const pauseReasonRef = useRef(pauseReason);
  pauseReasonRef.current = pauseReason;
  const bleConnectedRefSync = useRef(bleConnected);
  bleConnectedRefSync.current = bleConnected;
  const durationRef = useRef(duration);
  durationRef.current = duration;
  const sessionIdRef = useRef<string | null>(null);
  sessionIdRef.current = session?.id ?? null;
  const authUserIdRef = useRef<string | null>(null);
  authUserIdRef.current = authSession?.user?.id ?? null;

  // AppState listener: Track background state; keep BLE + data processing alive
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        isAppInBackgroundRef.current = true;
        log.debug('[Workout] App went to background — BLE + drops continue, UI paused');

        // ────────────────────────────────────────────────────────────────
        // Bug 4c: schedule a soft auto-finalize 60s after background.
        // Conditions:
        //   - BLE is currently disconnected
        //   - we're paused for connection (i.e. user already walked away)
        //   - we have ≥60s of synced duration (don't kill a fresh workout
        //     that the user just minimised intentionally)
        //   - the session is real (not the simulator/mock branch) AND we
        //     haven't already auto-finalized this session.
        // ────────────────────────────────────────────────────────────────
        const sid = sessionIdRef.current;
        const uid = authUserIdRef.current;
        const eligible =
          !!sid &&
          !!uid &&
          sid !== 'mock-session' &&
          !bleConnectedRefSync.current &&
          isPausedRef.current &&
          pauseReasonRef.current === 'connection' &&
          durationRef.current >= 60 &&
          !autoFinalizeFiredRef.current;

        if (!eligible) return;

        if (backgroundFinalizeTimerRef.current) {
          clearTimeout(backgroundFinalizeTimerRef.current);
        }
        log.debug('[Workout][AutoFinalize] scheduling 60s background finalize', {
          sessionId: sid,
          duration: durationRef.current,
        });
        backgroundFinalizeTimerRef.current = setTimeout(async () => {
          backgroundFinalizeTimerRef.current = null;
          // Re-check at fire-time — user may have come back to foreground
          // (which clears isAppInBackgroundRef before this fires) or the
          // session may have advanced.
          if (!isAppInBackgroundRef.current) return;
          if (autoFinalizeFiredRef.current) return;
          const finalSid = sessionIdRef.current;
          const finalUid = authUserIdRef.current;
          if (!finalSid || !finalUid || finalSid === 'mock-session') return;
          if (bleConnectedRefSync.current) return;

          autoFinalizeFiredRef.current = true;
          try {
            log.debug('[Workout][AutoFinalize] firing finalize_inactive_session', {
              sessionId: finalSid,
            });
            type FinalizeRpc = (
              fn: string,
              args: Record<string, unknown>,
            ) => Promise<{ data: unknown; error: { message?: string } | null }>;
            const rpc = supabase.rpc.bind(supabase) as unknown as FinalizeRpc;
            const { data, error } = await rpc('finalize_inactive_session', {
              p_session_id: finalSid,
              p_reason: 'app_background_disconnect_autofinish',
            });
            if (error) throw new Error(error.message || 'finalize failed');

            const row = (Array.isArray(data) ? data[0] : data) as
              | { drops_earned?: number }
              | null;
            const drops =
              typeof row?.drops_earned === 'number' ? row.drops_earned : 0;

            // One-shot flag: surface a "Workout finalized — N drops" modal on
            // the next foreground (handled by the recovery banner store, see
            // Step 9). We use AsyncStorage so the message survives the app
            // being killed mid-finalize.
            try {
              const AsyncStorage = (
                await import('@react-native-async-storage/async-storage')
              ).default;
              await AsyncStorage.setItem(
                '@sweatdrop/last_autofinalize_session_id',
                JSON.stringify({ sessionId: finalSid, drops, finalizedAt: Date.now() }),
              );
            } catch (storageError) {
              log.warn('[Workout][AutoFinalize] AsyncStorage write failed:', storageError);
            }

            log.debug('[Workout][AutoFinalize] success', {
              sessionId: finalSid,
              drops,
            });
          } catch (finalizeError) {
            log.warn(
              '[Workout][AutoFinalize] finalize_inactive_session failed:',
              finalizeError,
            );
            // Don't retry indefinitely. The 5-min cleanup_abandoned_sessions
            // cron will eventually pick this orphan up; the recovery banner
            // (Bug 4b) will surface it on next foreground if needed.
            autoFinalizeFiredRef.current = false;
          }
        }, 60_000);
      } else if (nextAppState === 'active') {
        // Re-sync watchdog timestamp so it doesn't immediately zero RPM
        lastPacketTime.value = Date.now();
        isAppInBackgroundRef.current = false;
        // Refresh signal indicator from BLE service's last-known state
        const lastBLETime = bleService.getLastMeasurementTime();
        if (Date.now() - lastBLETime < 5000) {
          setSignalStatus('ok');
        } else {
          setSignalStatus('lost');
        }
        // Bug 4c: cancel any pending auto-finalize if user came back in time.
        if (backgroundFinalizeTimerRef.current) {
          log.debug('[Workout][AutoFinalize] foreground returned — cancelling timer');
          clearTimeout(backgroundFinalizeTimerRef.current);
          backgroundFinalizeTimerRef.current = null;
        }
        log.debug('[Workout] App came to foreground — UI resumed');
      }
    });

    return () => {
      subscription.remove();
      if (backgroundFinalizeTimerRef.current) {
        clearTimeout(backgroundFinalizeTimerRef.current);
        backgroundFinalizeTimerRef.current = null;
      }
    };
  }, [lastPacketTime]);

  // Cleanup on unmount — single place to clear ALL outstanding timers/animations
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;

      cancelAnimation(rawRPMShared);
      cancelAnimation(smoothedRPMShared);
      cancelAnimation(earnedDropsShared);
      cancelAnimation(totalDropsShared);
      cancelAnimation(progressShared);

      if (tierToastTimerRef.current) { clearTimeout(tierToastTimerRef.current); tierToastTimerRef.current = null; }
      if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
      if (activityProofTimerRef.current) { clearTimeout(activityProofTimerRef.current); activityProofTimerRef.current = null; }
      if (autoPauseTimerRef.current) { clearTimeout(autoPauseTimerRef.current); autoPauseTimerRef.current = null; }
      if (autoZeroTimerRef.current) { clearTimeout(autoZeroTimerRef.current); autoZeroTimerRef.current = null; }
      if (idleSyncTimerRef.current) { clearTimeout(idleSyncTimerRef.current); idleSyncTimerRef.current = null; }
      if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
      if (heartbeatIntervalRef.current) { clearInterval(heartbeatIntervalRef.current); heartbeatIntervalRef.current = null; }
      if (timeProgressIntervalRef.current) { clearInterval(timeProgressIntervalRef.current); timeProgressIntervalRef.current = null; }
      if (connectingTimeoutRef.current) { clearTimeout(connectingTimeoutRef.current); connectingTimeoutRef.current = null; }
      if (backgroundFinalizeTimerRef.current) { clearTimeout(backgroundFinalizeTimerRef.current); backgroundFinalizeTimerRef.current = null; }
    };
  }, []);

  // Bug 5: Android hardware back button — confirm before leaving workout
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      Alert.alert(
        t('leaveWorkoutTitle'),
        t('leaveWorkoutMessage'),
        [
          { text: t('common:cancel'), style: 'cancel' },
          {
            text: t('leaveWorkoutConfirm'),
            style: 'destructive',
            onPress: () => {
              handleFinishWorkoutRef.current?.();
            },
          },
        ],
      );
      return true; // Prevent default back behaviour
    });
    return () => handler.remove();
  }, [t]);

  // Debug logging
  useEffect(() => {
    log.debug('[Workout] Machine type determined:', {
      paramMachineType,
      machineType: session?.machine?.type,
      equipmentType: session?.equipment?.equipment_type,
      finalMachineType: machineType,
      gymId: session?.gym_id,
    });
  }, [paramMachineType, session?.machine?.type, session?.equipment?.equipment_type, machineType, session?.gym_id]);

  // Load challenge progress
  // NOTE: Challenge progress is automatically updated via award_drops() when workout ends
  // No need to manually update progress during workout
  const { challenges, refresh: refreshChallenges } = useChallengeProgress(
    session?.gym_id || null,
    machineType
  );

  // LiquidGauge target follows economy cap (max drops/session) configured in admin.
  // Challenge progress is displayed separately in challenge cards/overlay.

  

  // BLE Monitoring - REQUIRED to start workout
  // CRITICAL: isPaused removed from guard & dep array — pausing should NOT kill BLE connection.
  // isPaused is read via isPausedRef.current inside BLE callbacks.
  useEffect(() => {
    // Build full machine identity object for name+serial-based BLE matching
    const machineIdentity: MachineIdentity = {
      id: session?.machine_id ?? machineId ?? '',
      ble_device_name: (session?.machine as any)?.ble_device_name ?? null,
      ble_serial_number: (session?.machine as any)?.ble_serial_number ?? null,
      ble_pairing_verified: (session?.machine as any)?.ble_pairing_verified ?? false,
      sensor_id: sensorId ?? (session?.machine as any)?.sensor_id ?? null,
      ble_protocol: (bleProtocol ?? (session?.machine as any)?.ble_protocol ?? null) as MachineIdentity['ble_protocol'],
    };

    // Simulator sessions have machine_id = null; only require sensor_id (sim: prefix)
    const hasIdentity = !!session?.machine_id || isSimulator;
    const hasSensorOrName = !!(machineIdentity.ble_device_name ?? machineIdentity.sensor_id);
    if (!hasIdentity || !hasSensorOrName) {
      setBleConnected(false);
      return;
    }
    let isMonitoring = false;

    const startBLEMonitoring = async () => {
      try {
        log.debug('[Workout] Connecting to machine:', {
          machineId: machineIdentity.id,
          bleName: machineIdentity.ble_device_name,
          pairingVerified: machineIdentity.ble_pairing_verified,
        });

        // Set BLE protocol from machine data if available (skip auto-detection)
        const machineProtocol = bleProtocol || (session?.machine as any)?.ble_protocol;
        if (machineProtocol === 'ftms') {
          const ftmsMachineType = (paramMachineType || session?.machine?.type) as 'treadmill' | 'bike' | 'elliptical' | undefined;
          bleService.setProtocol('ftms', ftmsMachineType || 'bike');
          ftmsProtocolActiveRef.current = true;
        } else if (machineProtocol === 'magene' || machineProtocol === 'ksfit') {
          bleService.setProtocol('csc');
          ftmsProtocolActiveRef.current = false;
        }

        bleService.setStatusCallback((status: string) => {
          if (isAppInBackgroundRef.current) return;
          if (status === 'Signal OK') {
            setSignalStatus('ok');
            setBleStatus('');
          } else if (status === 'Signal Lost') {
            setSignalStatus('lost');
            setBleStatus(t('connectionLost'));
          } else {
            setBleStatus(status);
          }
        });

        const unlockMachine = async () => {
          if (session?.machine_id && authSession?.user) {
            try {
              await supabase.rpc('unlock_machine', {
                p_machine_id: session.machine_id,
                p_user_id: authSession.user.id,
              });
            } catch (unlockError) {
              log.error('[Workout] Error unlocking machine during connection failure:', unlockError);
            }
          }
        };

        try {
          const connected = await bleService.connectToMachine(machineIdentity);
          if (!connected) {
            throw new Error('Connection returned false');
          }
        } catch (connectError: any) {
          log.error('[Workout] BLE connection error:', connectError);
          setBleConnected(false);

          if (connectError instanceof BlePeripheralNotFoundError) {
            log.warn('[Workout] Machine not in range — showing overlay', {
              identifier: connectError.requestedIdentifier,
              detail: connectError.detail,
            });
            await unlockMachine();
            setShowMachineNotInRangeOverlay(true);
            setIsReconnecting(false);
            return;
          }

          if (connectError instanceof BleAmbiguousIdentityError) {
            log.error('[Workout] Ambiguous BLE identity — multiple machines with same name', {
              conflictingName: connectError.conflictingName,
            });
            await unlockMachine();
            showModal({
              title: t('bleAmbiguousIdentityTitle'),
              body: t('bleAmbiguousIdentityBody', { name: connectError.conflictingName }),
              buttons: [{ label: t('common:ok'), onPress: () => router.replace('/home') }],
            });
            return;
          }

          if (connectError instanceof BlePeripheralMismatchError) {
            log.error('[Workout] BLE peripheral mismatch at connect time — forcing session end', {
              detail: connectError.detail,
            });
            setShowPeripheralMismatchModal(true);
            return;
          }

          // Unlock machine if connection fails (generic error path)
          if (session?.machine_id && authSession?.user) {
            try {
              await supabase.rpc('unlock_machine', {
                p_machine_id: session.machine_id,
                p_user_id: authSession.user.id,
              });
              log.debug('[Workout] Machine unlocked due to connection failure');
            } catch (unlockError) {
              log.error('[Workout] Error unlocking machine:', unlockError);
            }
          }
          
          // CRITICAL: No blocking Alert.alert() - use UI overlay instead
          log.error('[Workout] BLE Connection Failed:', connectError?.message);
          setBleStatus(connectError?.message || 'Connection failed. Auto-reconnecting...');
          setIsReconnecting(true);
          
          // Exponential Backoff: Retry after 1s, 2s, 4s
          reconnectAttemptRef.current = 0;
          const attemptReconnect = async () => {
            if (!isMountedRef.current) return; // Guard against unmounted component
            reconnectAttemptRef.current++;
            const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current - 1), 4000); // 1s, 2s, 4s max
            
            log.debug(`[Workout] Reconnect attempt ${reconnectAttemptRef.current} after ${delay}ms`);
            
            try {
              const reconnected = await bleService.reconnect();
              if (reconnected) {
                log.debug('[Workout] Auto-reconnected successfully');
                setIsReconnecting(false);
                setBleConnected(true);
                setBleStatus('');
                reconnectAttemptRef.current = 0;
                
                // Trigger BLE useEffect re-run to restart monitoring (avoids stale closure)
                setReconnectTrigger(prev => prev + 1);
              } else if (reconnectAttemptRef.current < 3) {
                // Retry up to 3 times
                reconnectTimerRef.current = setTimeout(attemptReconnect, delay);
              } else {
                // Max attempts reached - show persistent reconnecting overlay
                log.debug('[Workout] Max reconnect attempts reached, showing persistent overlay');
                setIsReconnecting(true);
                setBleStatus('Connection lost. Please check sensor.');
              }
            } catch (reconnectError) {
              log.error('[Workout] Reconnect error:', reconnectError);
              if (reconnectAttemptRef.current < 3) {
                reconnectTimerRef.current = setTimeout(attemptReconnect, delay);
              } else {
                setIsReconnecting(true);
                setBleStatus('Connection lost. Please check sensor.');
              }
            }
          };
          
          // Start first reconnect attempt after 1 second
          reconnectTimerRef.current = setTimeout(attemptReconnect, 1000);
          return;
        }

        isMonitoring = true;
        bleMonitoringRef.current = true;
        setBleConnected(true);

        // Verify session ownership + peripheral identity on reconnect
        // AGENT NOTE: [2026-05-08] - mobile-coder (BLE cross-talk fix, Steps 3 + 1)
        // Now checks both Supabase ownership AND that the live BLE peripheral
        // matches the paired sensor_id.  Mismatch triggers the safety modal and
        // force-finalizes the session so drops are not awarded for cross-talk data.
        const verifySessionOwnership = async (): Promise<boolean> => {
          if (!session?.machine_id || !authSession?.user) {
            return false;
          }

          try {
            const { data: machineData } = await supabase
              .from('machines')
              .select('is_busy, current_user_id, ble_device_name, ble_serial_number, ble_pairing_verified')
              .eq('id', session.machine_id)
              .single();

            if (!machineData?.is_busy || machineData.current_user_id !== authSession.user.id) {
              log.warn('[Workout] Session ownership lost', { machineData });
              return false;
            }

            // BLE identity cross-check: prefer serial (hardware-bound), fall back to name
            const expectedSerial = (machineData as any).ble_serial_number as string | null;
            const expectedName = (machineData as any).ble_device_name as string | null;
            const pairingVerified = (machineData as any).ble_pairing_verified as boolean;

            if (pairingVerified && expectedSerial) {
              const observedSerial = bleService.getConnectedSerialNumber();
              if (observedSerial !== null && observedSerial !== expectedSerial) {
                log.error('[Workout] Mid-session SERIAL MISMATCH — connected to wrong machine!', {
                  sessionMachineId: session.machine_id,
                  expectedSerial,
                  observedSerial,
                });
                setShowPeripheralMismatchModal(true);
                return false;
              }
            } else if (expectedName) {
              const observedName = bleService.getConnectedDeviceName();
              if (observedName !== null && observedName !== expectedName) {
                log.error('[Workout] Mid-session NAME MISMATCH — connected to wrong machine!', {
                  sessionMachineId: session.machine_id,
                  expectedName,
                  observedName,
                });
                setShowPeripheralMismatchModal(true);
                return false;
              }
            }

            return true;
          } catch (error) {
            log.error('[Workout] Error verifying session ownership:', error);
            return false;
          }
        };

        // Anti-piggyback: clears "Verifying activity" badge (see activity-proof useEffect).
        // CSC/Magene often reports rpm=0 on the first 1–2 packets (baseline + ble-service RPM<5 clamp),
        // so we also mark activity from crank revolutionDelta below — not only rawRPM > 0.
        const markFirstActivityProofDone = () => {
          if (firstActivityDetectedRef.current) return;
          firstActivityDetectedRef.current = true;
          setAwaitingActivityProof(false);
          if (activityProofTimerRef.current) {
            clearTimeout(activityProofTimerRef.current);
            activityProofTimerRef.current = null;
          }
        };

        // Start monitoring CSC measurements with sleep detection and reconnect
        await bleService.startMonitoring(
          async (measurement: CSCMeasurement) => {
            const now = Date.now();

            // Throttled packet log: print once every 2 seconds to avoid spam
            if (now - lastRPMUpdateRef.current > 2000 || measurement.rpm > 0) {
              log.debug(
                `[Workout] 📦 packet — protocol:${measurement.protocol}` +
                ` rpm:${measurement.rpm?.toFixed(1)}` +
                ` crank:${measurement.crankRevolutions}` +
                ` crankTime:${measurement.lastCrankEventTime}`
              );
            }

            // Hard Fix: Glitch Filter - Ignore sudden drop to 0 if we're currently moving fast (> 20 RPM)
            // Only applies to CSC protocol (Magene S3+) where BLE echo packets can glitch
            // FTMS data comes directly from the machine and is reliable — skip glitch filter
            if (measurement.rpm === 0 && rawRPMShared.value > 20 && measurement.protocol !== 'ftms') {
              return; // Skip this packet completely
            }
            
            // If we got here and rpm === 0, it's a legitimate 0 (either low RPM or glitch protection already passed)
            // Reset consecutive zero counter when we accept 0
            if (measurement.rpm === 0) {
              consecutiveZeroCountRef.current = 0;
            } else {
              // Reset counter when non-zero RPM arrives
              consecutiveZeroCountRef.current = 0;
            }
            
            // BLE Data Optimization: Filter duplicates (already handled in ble-service.ts)
            // Track lastCrankEventTime for auto-zero detection
            if (measurement.lastCrankEventTime !== lastCrankEventTimeRef.current) {
              // CrankEventTime changed - update tracking
              lastCrankEventTimeRef.current = measurement.lastCrankEventTime;
              lastCrankEventTimeChangeRef.current = Date.now();
            }
            
            // Store current measurement for reference
            lastMeasurementRef.current = {
              crankRevolutions: measurement.crankRevolutions,
              lastCrankEventTime: measurement.lastCrankEventTime,
            };
            
            if (!isAppInBackgroundRef.current) {
              log.debug('[Workout] BLE Measurement:', measurement, 'RawRPM:', measurement.rpm);
            }
            // EXC_BAD_ACCESS fix: skip all setState/native calls if unmounted (BLE can fire after cleanup)
            if (!isMountedRef.current) return;
            // Skip UI-only setState when app is backgrounded (BLE data still processes below)
            if (!isAppInBackgroundRef.current) {
              setSignalStatus('ok');
            }
            
            // Critical Fix: Update last packet timestamp immediately for Watchdog
            lastPacketTime.value = now;
            
            // ── FTMS Extended Metrics Capture ──
            if (measurement.protocol === 'ftms') {
              ftmsProtocolActiveRef.current = true;
              
              // Speed tracking (km/h)
              if (measurement.speed != null && measurement.speed > 0) {
                ftmsSpeedHistoryRef.current.push(measurement.speed);
                if (ftmsSpeedHistoryRef.current.length > 120) ftmsSpeedHistoryRef.current.shift();
                if (measurement.speed > ftmsMaxSpeedRef.current) {
                  ftmsMaxSpeedRef.current = measurement.speed;
                }
              }
              
              // Distance tracking (meters) - use device total directly
              if (measurement.distance != null && measurement.distance > 0) {
                ftmsTotalDistanceRef.current = measurement.distance;
              }
              
              // Power tracking (watts)
              if (measurement.power != null && measurement.power > 0) {
                ftmsPowerHistoryRef.current.push(measurement.power);
                if (ftmsPowerHistoryRef.current.length > 120) ftmsPowerHistoryRef.current.shift();
                if (measurement.power > ftmsMaxPowerRef.current) {
                  ftmsMaxPowerRef.current = measurement.power;
                }
              }
              
              // Device calories (kcal) - authoritative from machine
              if (measurement.calories != null && measurement.calories > 0) {
                ftmsDeviceCaloriesRef.current = measurement.calories;
              }

              // Simulator timeScale: track simulated elapsed time from FTMS measurements
              if (isSimulator && measurement.elapsedTime != null) {
                simulatorElapsedRef.current = measurement.elapsedTime;
              }

              // Treadmill real-time display updates
              if (machineType === 'treadmill') {
                const spd = measurement.speed ?? 0;
                animatedSpeedText.value = spd > 0 ? spd.toFixed(1) : '0.0';
                treadmillSpeedShared.value = spd;
                
                // Pace from speed: pace (min/km) = 60 / speed (km/h)
                if (spd > 0.5) {
                  const paceSecondsPerKm = 3600 / spd;
                  const paceMins = Math.floor(paceSecondsPerKm / 60);
                  const paceSecs = Math.floor(paceSecondsPerKm % 60);
                  animatedPaceText.value = `${paceMins}:${paceSecs.toString().padStart(2, '0')}`;
                } else {
                  animatedPaceText.value = '--:--';
                }
                
                if (measurement.incline != null) {
                  animatedInclineText.value = measurement.incline.toFixed(1);
                }
                
                // Time delta for distance + calorie accumulation
                const measNow = Date.now();
                const prevTime = treadmillLastMeasureTimeRef.current;
                const dtSec = prevTime > 0 ? (measNow - prevTime) / 1000 : 0;
                const validDt = dtSec > 0 && dtSec < 5;
                treadmillLastMeasureTimeRef.current = measNow;

                // Distance: use device value if available, otherwise accumulate from speed
                if (measurement.distance != null && measurement.distance > 0) {
                  ftmsTotalDistanceRef.current = measurement.distance;
                } else if (spd > 0.3 && validDt) {
                  ftmsTotalDistanceRef.current += (spd / 3.6) * dtSec;
                }
                
                const dist = ftmsTotalDistanceRef.current;
                if (dist > 0) {
                  animatedDistanceText.value = dist >= 1000
                    ? (dist / 1000).toFixed(2)
                    : Math.round(dist).toString();
                }

                // Calories: device value (authoritative) or speed-based MET estimation
                // ~1 kcal/min per km/h (approximation for 70 kg person)
                if (measurement.calories != null && measurement.calories > 0) {
                  caloriesShared.value = measurement.calories;
                } else if (spd > 0.3 && validDt) {
                  treadmillCalAccRef.current += (spd / 60) * dtSec;
                  caloriesShared.value = Math.floor(treadmillCalAccRef.current);
                }
              }
            }
            
            // PRO-FITNESS: Native-Driven RPM Processing (no setState)
            const rawRPM = measurement.rpm;
            
            // CRITICAL: Don't log .value during render - removed for JSI safety
            // Logging moved to useAnimatedReaction if needed
            
            if (!isMountedRef.current) return; // Safety check
            
            // Critical Fix: When raw RPM is 0, immediately set to 0 and clear history
            // This ensures no residual values in moving average that could cause RPM to stick
            let smoothedValue = 0;
            if (rawRPM === 0) {
              // Clear history when 0 arrives to prevent sticking on small values
              rpmRawHistoryRef.current = [0]; // Reset history to only contain 0
              smoothedValue = 0;
              // Clear persistence when we receive actual 0 from sensor
              lastNonZeroRPMRef.current = 0;
            } else {
              // Performance Fix: Reduced moving average window for faster response (2 readings instead of 4)
              // Add raw RPM to history (only non-zero values)
              rpmRawHistoryRef.current.push(rawRPM);
              if (rpmRawHistoryRef.current.length > 2) {
                rpmRawHistoryRef.current.shift(); // Keep last 2 readings for faster response
              }
              
              // Calculate moving average (prosek poslednja 2 merenja)
              // Precision Fix: Keep float value for smooth transitions (rounding happens in UI layer)
              if (rpmRawHistoryRef.current.length > 0) {
                const sum = rpmRawHistoryRef.current.reduce((acc, val) => acc + val, 0);
                smoothedValue = sum / rpmRawHistoryRef.current.length; // Keep float, don't round here
              }
              
              // Low RPM Threshold: If smoothed RPM < 10, treat as 0
              if (smoothedValue < 10) {
                smoothedValue = 0;
              }
              
              // Update last known RPM and timestamp for non-zero values
              if (smoothedValue > 0) {
                lastNonZeroRPMRef.current = smoothedValue;
                lastRPMTimeRef.current = Date.now();
              }
            }
            
            // Hard Fix: Snap-to-Zero Logic - When sensor sends 0, cancel animation and reset to 0
            // This prevents animation from getting 'stuck' in slow deceleration and never reaching true zero
            if (rawRPM === 0) {
              // Cancel any running animation to prevent getting stuck
              cancelAnimation(rawRPMShared);
              // Direct assignment to 0 for instant update (no animation delay)
              rawRPMShared.value = 0;
            } else {
              // Critical Fix: Cancel any running animation before starting new one to prevent stuck animations
              // This ensures that new values always update, even if previous animation is still running
              cancelAnimation(rawRPMShared);
              
              // Critical Fix: Smooth RPM Transition (no abrupt jumps) for non-zero values
              // Use withTiming for fluid transitions - adaptive duration for better UX
              // Faster transition for increasing RPM (400ms), slower for decreasing (600ms)
              const currentRPM = rawRPMShared.value;
              let transitionDuration = 600; // Default
              if (smoothedValue > currentRPM) {
                transitionDuration = 400; // Faster for increasing RPM (better responsiveness)
              } else {
                transitionDuration = 600; // Slower for decreasing RPM (smoother decay)
              }
              
              // IMPORTANT: Always update rawRPMShared, even if value seems same (ensures reactivity)
              rawRPMShared.value = withTiming(smoothedValue, {
                duration: transitionDuration,
                easing: Easing.out(Easing.quad),
              });
            }
            
            // Note: lastPacketTime.value was already updated at the start of callback for Watchdog
            
            // Update RPM history for average calculation (keep last 30 values, only non-zero)
            if (rawRPM > 0 && isMountedRef.current) {
              rpmHistoryRef.current.push(rawRPM);
              if (rpmHistoryRef.current.length > 30) {
                rpmHistoryRef.current.shift();
              }
              
              // Calculate average RPM (long-term average for database)
              const avgRPM = Math.round(
                rpmHistoryRef.current.reduce((sum, val) => sum + val, 0) / rpmHistoryRef.current.length
              );
              setAverageRPM(avgRPM);
            }
            
            // Drop Calculation: Walking Mode - Step-to-Drop Calibration
            // For walking mode, emit a drop for each detected step (impulse), even if RPM briefly drops to 0
            
            const currentRevolutions = measurement.crankRevolutions;
            const lastRevolutions = lastCrankRevolutionsRef.current;
            // Note: 'now' was already declared at the start of this callback
            
            // PRO-FITNESS: Auto-Resume — but ONLY for inactivity pause, NOT manual pause.
            // AGENT NOTE: [2026-05-08] - mobile-coder (BLE cross-talk fix, Step 2)
            // FTMS treadmill belt has mechanical inertia: it keeps emitting incrementing
            // crankRevolutions for several seconds after the user presses Pause.  Without
            // this guard, auto-resume fires immediately and defeats manual pause entirely.
            // The 5 s safety window also covers the edge case where pauseReason transitions
            // between values before the ref update propagates.
            const isManualPause = pauseReasonRef.current === 'manual';
            const isWithinManualGuard =
              manualPausedAtRef.current !== null &&
              Date.now() - manualPausedAtRef.current < AUTO_RESUME_GUARD_MS;

            if (
              currentRevolutions > lastCrankRevolutionsForAutoResumeRef.current &&
              isPausedRef.current &&
              isMountedRef.current &&
              !isManualPause &&
              !isWithinManualGuard
            ) {
              runOnJS(setIsPaused)(false);
              runOnJS(setShowAutoPauseOverlay)(false);
            }
            lastCrankRevolutionsForAutoResumeRef.current = currentRevolutions;
            
            if (currentRevolutions > 0) {
              // Initialize on first measurement
              if (lastRevolutions === 0) {
                lastCrankRevolutionsRef.current = currentRevolutions;
                lastStepDetectionRef.current = now;
                if (rawRPM > 0) {
                  markFirstActivityProofDone();
                }
                return; // Skip drop calculation on first measurement
              }
              
              // Calculate revolution delta
              let revolutionDelta = currentRevolutions - lastRevolutions;
              
              // Handle wrap-around (16-bit value wraps at 65535)
              if (revolutionDelta < 0) {
                const wrapAroundDelta = (65535 - lastRevolutions) + currentRevolutions;
                if (wrapAroundDelta < 1000) {
                  revolutionDelta = wrapAroundDelta;
                } else {
                  // Battery Optimization: No logging in measurement callback
                  return;
                }
              }
              
              if (revolutionDelta > 0) {
                const currentMachineType = machineType || 'treadmill';

                // CSC (Magene): real crank movement even when rpm resolves to 0 (slow cadence or 2-sample delay).
                if (measurement.protocol === 'csc') {
                  markFirstActivityProofDone();
                }

                // Keep cadence/revolution tracking for pace/calorie logic. Drops are estimated
                // from server-equivalent tokenomics rules in a separate timer effect.
                // ONLY bikes accumulate revolutions: pace/distance/calorie worklets use a
                // bike-specific multiplier (~2 m per crank revolution). On elliptical the
                // crank ≠ wheel travel, so we deliberately do NOT inflate revolutions there
                // — that would write bogus "kilometers" to raw_metrics.total_distance and
                // pollute global distance achievements (Kilometer Club, Marathoner, etc).
                // Elliptical distance is only trusted when reported by the machine via FTMS.
                if (currentMachineType === 'bike') {
                  totalCrankRevolutionsShared.value = totalCrankRevolutionsShared.value + revolutionDelta;
                }

                lastCrankRevolutionsRef.current = currentRevolutions;
                lastStepDetectionRef.current = now;
              }
            }
            
            // Update last RPM in database (every 30 seconds)
            // Pass observed BLE identity so the server can guard against cross-talk
            // (matches update_machine_heartbeat — see migration 20260509070000).
            if (session?.machine_id && authSession?.user && measurement.rpm > 0) {
              const now = Date.now();
              if (!lastRPMUpdateRef.current || now - lastRPMUpdateRef.current > 30000) {
                try {
                  const observedName = bleService.getConnectedDeviceName();
                  const observedSerial = bleService.getConnectedSerialNumber();
                  await supabase.rpc('update_machine_rpm', {
                    p_machine_id: session.machine_id,
                    p_user_id: authSession.user.id,
                    p_rpm: measurement.rpm,
                    ...(observedName !== null && { p_observed_name: observedName }),
                    ...(observedSerial !== null && { p_observed_serial: observedSerial }),
                  });
                  lastRPMUpdateRef.current = now;
                } catch (error) {
                  log.error('[Workout] Failed to update RPM:', error);
                }
              }
            }
            // EXC_BAD_ACCESS fix: after async await, skip rest if unmounted
            if (!isMountedRef.current) return;
            
            // Update last RPM time (use raw RPM, not smoothed, for accurate detection)
            // This ensures we detect when sensor actually stops
            if (rawRPM > 0) {
              markFirstActivityProofDone();
              lastRPMTimeRef.current = Date.now();
              setShowAutoPauseOverlay(false);
              
              // Clear auto-pause timer if RPM is detected
              if (autoPauseTimerRef.current) {
                clearTimeout(autoPauseTimerRef.current);
                autoPauseTimerRef.current = null;
              }
            } else {
              // Raw RPM is 0 - sensor has stopped
              // Check time since last non-zero RPM
              const timeSinceLastRPM = Date.now() - lastRPMTimeRef.current;
              
              // If we've had 0 RPM for more than 2 seconds, ensure smoothed RPM is also 0
              if (timeSinceLastRPM > 2000 && smoothedRPMShared.value > 0) {
                // Battery Optimization: No logging in useAnimatedReaction
                rawRPMShared.value = 0; // Update shared value (smoothing handled by useDerivedValue)
                // Clear smoothing history to prevent stale data
                rpmRawHistoryRef.current = [0];
              }
              
              // Show warning after 10 seconds
              if (timeSinceLastRPM > 10000 && timeSinceLastRPM < 30000) {
                setShowAutoPauseOverlay(true);
              }
              
              if (timeSinceLastRPM > 30000 && !isPaused && !autoPauseTimerRef.current) {
                // Auto-pause after 30 seconds of no RPM
                // Battery Optimization: No logging in useAnimatedReaction
                setShowAutoPauseOverlay(true);
                autoPauseTimerRef.current = setTimeout(() => {
                  if (!isMountedRef.current) return;
                  if (!isPaused) {
                    setPauseReason('inactivity');
                    setIsPaused(true);
                    setShowAutoPauseOverlay(false);
                    setBleStatus(t('noPedalingDetected'));
                  }
                }, 1000);
              }
            }
          },
          // onSleep callback - triggered when no data for 10+ seconds
          () => {
            // Keep UX consistent: reuse paused overlay with reconnect/resume action.
            setPauseReason('connection');
            setIsPaused(true);
            setBleConnected(false);
            setBleStatus(t('connectionLost'));
          },
          // onReconnect callback - verify session ownership
          verifySessionOwnership,
          // onSimulatorComplete - auto-finish when simulator reaches its duration
          () => {
            if (isMountedRef.current) {
              handleFinishWorkoutRef.current?.();
            }
          },
        );

        // Battery Optimization: Only log critical events
        setBleStatus(''); // Clear status when connected
      } catch (error: any) {
        log.error('[Workout] BLE monitoring error:', error);
        bleMonitoringRef.current = false;
        setBleConnected(false);
        setBleStatus('Connection failed');
        
        // Unlock machine if monitoring fails
        if (session?.machine_id && authSession?.user) {
          try {
            await supabase.rpc('unlock_machine', {
              p_machine_id: session.machine_id,
              p_user_id: authSession.user.id,
            });
            log.debug('[Workout] Machine unlocked due to monitoring failure');
          } catch (unlockError) {
            log.error('[Workout] Error unlocking machine:', unlockError);
          }
        }
        
        // CRITICAL: No blocking Alert.alert() - use UI overlay instead
        // Set reconnecting state to show overlay
        setIsReconnecting(true);
        setBleStatus(error?.message || 'Connection failed. Auto-reconnecting...');
        
        // Exponential Backoff: Retry after 1s, 2s, 4s
        reconnectAttemptRef.current = 0;
        const attemptReconnect = async () => {
          if (!isMountedRef.current) return; // Guard against unmounted component
          reconnectAttemptRef.current++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current - 1), 4000); // 1s, 2s, 4s max
          
          log.debug(`[Workout] Reconnect attempt ${reconnectAttemptRef.current} after ${delay}ms`);
          
          try {
            const reconnected = await bleService.reconnect();
            if (reconnected) {
              log.debug('[Workout] Auto-reconnected successfully');
              setIsReconnecting(false);
              setBleConnected(true);
              setBleStatus('');
              reconnectAttemptRef.current = 0;
              
              // Trigger BLE useEffect re-run to restart monitoring (avoids stale closure)
              setReconnectTrigger(prev => prev + 1);
            } else if (reconnectAttemptRef.current < 3) {
              // Retry up to 3 times
              reconnectTimerRef.current = setTimeout(attemptReconnect, delay);
            } else {
              // Max attempts reached - show persistent reconnecting overlay
              log.debug('[Workout] Max reconnect attempts reached, showing persistent overlay');
              setIsReconnecting(true);
              setBleStatus('Connection lost. Please check sensor.');
            }
          } catch (reconnectError) {
            log.error('[Workout] Reconnect error:', reconnectError);
            if (reconnectAttemptRef.current < 3) {
              reconnectTimerRef.current = setTimeout(attemptReconnect, delay);
            } else {
              setIsReconnecting(true);
              setBleStatus('Connection lost. Please check sensor.');
            }
          }
        };
        
        // Start first reconnect attempt after 1 second
        reconnectTimerRef.current = setTimeout(attemptReconnect, 1000);
      }
    };

    startBLEMonitoring();

    return () => {
        // Do NOT set isMountedRef.current = false here — that ref tracks component lifetime,
        // not a single effect run. Setting it false on reconnectTrigger re-runs would cause all
        // BLE callbacks to silently drop updates after the first reconnect (Bug 2).
        // isMountedRef is set false only in the mount/unmount effect above.
        if (isMonitoring) {
          bleService.stopMonitoring();
          bleService.disconnect();
          bleMonitoringRef.current = false;
          setBleConnected(false);
        }
        if (autoPauseTimerRef.current) {
          clearTimeout(autoPauseTimerRef.current);
        }
      };
    }, [session?.machine_id, (session?.machine as any)?.ble_device_name, (session?.machine as any)?.sensor_id, sensorId, authSession?.user, reconnectTrigger]);

  // Bug 1: 60-second connecting timeout — if BLE never connects, show "Cancel Workout"
  useEffect(() => {
    if (bleConnected) {
      // Clear once connected
      setShowConnectingCancel(false);
      if (connectingTimeoutRef.current) {
        clearTimeout(connectingTimeoutRef.current);
        connectingTimeoutRef.current = null;
      }
      return;
    }
    const hasActiveSensor = session?.machine_id || sensorId?.startsWith('sim:');
    if (!hasActiveSensor || sessionLoading) return;

    connectingTimeoutRef.current = setTimeout(() => {
      if (!bleConnected && isMountedRef.current) {
        setShowConnectingCancel(true);
      }
    }, 60_000);

    return () => {
      if (connectingTimeoutRef.current) {
        clearTimeout(connectingTimeoutRef.current);
        connectingTimeoutRef.current = null;
      }
    };
  }, [bleConnected, session?.machine_id, sensorId, sessionLoading]);

  // Detect silent BLE disconnects and keep UI state consistent.
  useEffect(() => {
    const hasActiveSensor = session?.machine_id || sensorId?.startsWith('sim:');
    if (!hasActiveSensor || !bleConnected || isReconnecting) return;

    const watchdog = setInterval(() => {
      if (!bleService.getConnected()) {
        setBleConnected(false);
        setPauseReason('connection');
        setIsPaused(true);
        setBleStatus(t('connectionLost'));
      }
    }, 1500);

    return () => clearInterval(watchdog);
  }, [bleConnected, isReconnecting, session?.machine_id, sensorId, t]);

  // ────────────────────────────────────────────────────────────────────────
  // Bug 4a: Auto-escape from "Reconnecting…" overlay
  //
  // When the user walks away mid-workout, BLE drops and the watchdog above
  // flips the screen into `isPaused && pauseReason === 'connection'`. Today,
  // the only escape from that state is for the user to tap Resume three
  // times and watch each fail; if they never interact, they're stranded.
  //
  // This effect:
  //   1. Auto-attempts `bleService.reconnect()` every 30s while paused-on-
  //      connection. Successful reconnect transparently resumes the workout.
  //   2. Reveals the "Save what I've got" affordance after EITHER 3 auto-
  //      reconnect failures OR 90s have elapsed since the pause began.
  //   3. Hard-cap: at 5 minutes elapsed, force the affordance visible
  //      regardless of reconnect attempts (some hardware never reports a
  //      clean disconnect; we still want the user to be able to escape
  //      whenever they next look at the screen).
  // ────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isPaused || pauseReason !== 'connection') {
      // Exiting the connection-pause state: clear the timer/origin marker.
      // resumeFailCountRef + showForceFinishOption are reset in resumeWorkout's
      // success path so manual resume keeps working as before.
      connectionPausedSinceRef.current = null;
      autoReconnectInFlightRef.current = false;
      return;
    }
    if (connectionPausedSinceRef.current === null) {
      connectionPausedSinceRef.current = Date.now();
    }

    const tick = async () => {
      if (!isMountedRef.current) return;
      const pausedSince = connectionPausedSinceRef.current ?? Date.now();
      const elapsedSec = Math.floor((Date.now() - pausedSince) / 1000);

      // 5-minute hard cap — always reveal escape regardless of reconnect path.
      if (elapsedSec >= 300) {
        setShowForceFinishOption(true);
      }

      if (autoReconnectInFlightRef.current) return;
      autoReconnectInFlightRef.current = true;

      try {
        log.debug('[Workout][AutoReconnect] tick', {
          elapsedSec,
          fails: resumeFailCountRef.current,
        });
        const ok = await bleService.reconnect();
        if (!isMountedRef.current) return;

        if (ok) {
          log.debug('[Workout][AutoReconnect] success — resuming workout');
          resumeFailCountRef.current = 0;
          setShowForceFinishOption(false);
          setBleConnected(true);
          setBleStatus('');
          // Match resumeWorkout()'s pause-offset adjustment so the duration
          // counter doesn't jump.
          if (pausedTime) {
            const pauseDuration = Date.now() - pausedTime.getTime();
            setStartTime((prev) =>
              prev ? new Date(prev.getTime() + pauseDuration) : prev,
            );
          }
          setPausedTime(null);
          setPauseReason('manual');
          setIsPaused(false);
          connectionPausedSinceRef.current = null;
        } else {
          resumeFailCountRef.current += 1;
          log.debug('[Workout][AutoReconnect] failed', {
            fails: resumeFailCountRef.current,
            elapsedSec,
          });
          if (resumeFailCountRef.current >= 3 || elapsedSec >= 90) {
            setShowForceFinishOption(true);
          }
        }
      } catch (err) {
        if (!isMountedRef.current) return;
        log.warn('[Workout][AutoReconnect] reconnect threw:', err);
        resumeFailCountRef.current += 1;
        if (resumeFailCountRef.current >= 3 || elapsedSec >= 90) {
          setShowForceFinishOption(true);
        }
      } finally {
        autoReconnectInFlightRef.current = false;
      }
    };

    // Fire once after a short grace (let the watchdog stabilize), then on
    // a 30s cadence so we don't hammer the BLE stack.
    const initialDelay = setTimeout(() => void tick(), 5000);
    const intervalId = setInterval(() => void tick(), 30000);

    return () => {
      clearTimeout(initialDelay);
      clearInterval(intervalId);
    };
  }, [isPaused, pauseReason, pausedTime]);

  const cancelSessionForNoActivity = useCallback(async () => {
    if (!session || !authSession?.user || session.id === 'mock-session') return;

    try {
      await bleService.stopMonitoring();
      await bleService.disconnect();
    } catch (disconnectError) {
      log.warn('[Workout] Failed to fully disconnect BLE during anti-piggyback cancel:', disconnectError);
    }

    try {
      await supabase
        .from('sessions')
        .update({
          is_active: false,
          ended_at: new Date().toISOString(),
          duration_seconds: duration,
          updated_at: new Date().toISOString(),
          raw_metrics: {
            security: {
              auto_cancel_reason: 'no_machine_activity',
            },
          },
        })
        .eq('id', session.id);
    } catch (sessionUpdateError) {
      log.error('[Workout] Failed to mark session as auto-cancelled:', sessionUpdateError);
    }

    if (session.machine_id) {
      try {
        await supabase.rpc('unlock_machine', {
          p_machine_id: session.machine_id,
          p_user_id: authSession.user.id,
        });
      } catch (unlockError) {
        log.error('[Workout] Failed to unlock machine after anti-piggyback cancel:', unlockError);
      }
    }

    setShowNoActivityCancelOverlay(true);
  }, [authSession?.user, duration, session, t]);

  // Anti-piggyback guard: require live machine activity shortly after session start.
  useEffect(() => {
    if (!session?.id || session.id === 'mock-session') return;
    if (isPaused) return;
    if (firstActivityDetectedRef.current) return;

    setAwaitingActivityProof(true);
    if (activityProofTimerRef.current) {
      clearTimeout(activityProofTimerRef.current);
    }

    activityProofTimerRef.current = setTimeout(() => {
      if (firstActivityDetectedRef.current) return;
      setAwaitingActivityProof(false);
      void cancelSessionForNoActivity();
    }, 35000);

    return () => {
      if (activityProofTimerRef.current) {
        clearTimeout(activityProofTimerRef.current);
        activityProofTimerRef.current = null;
      }
    };
  }, [cancelSessionForNoActivity, isPaused, session?.id]);

  useEffect(() => {
    inactivityStateRef.current = createInactivityState();
    inactivityFinalizeCoordinatorRef.current = new InactivityFinalizeCoordinator();
    setShowInactivityWarning(false);
    setInactivityCountdownSec(inactivityPolicy.autoFinishAfterSec);
    setHeartbeatAllowed(true);
  }, [session?.id, inactivityPolicy.autoFinishAfterSec]);

  // Heartbeat update — adaptive cadence: 10s when active, 30s when paused/idle.
  useEffect(() => {
    if (!session?.machine_id || !authSession?.user || !heartbeatAllowed) {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      return;
    }

    const cadenceMs = isPaused ? 30000 : 10000;

    const updateHeartbeat = async () => {
      try {
        const observedName = bleService.getConnectedDeviceName();
        const observedSerial = bleService.getConnectedSerialNumber();
        await supabase.rpc('update_machine_heartbeat', {
          p_machine_id: session.machine_id,
          p_user_id: authSession.user.id,
          ...(observedName !== null && { p_observed_name: observedName }),
          ...(observedSerial !== null && { p_observed_serial: observedSerial }),
        });
      } catch (error) {
        log.error('[Workout] Heartbeat update error:', error);
      }
    };

    updateHeartbeat();
    heartbeatIntervalRef.current = setInterval(updateHeartbeat, cadenceMs);

    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
    };
  }, [session?.machine_id, authSession?.user, heartbeatAllowed, isPaused]);

  
  // Animation values
  const splashAnim = useSharedValue(0);
  const pausedOverlayOpacity = useSharedValue(0);
  const finishPressProgress = useSharedValue(0);


  // Auto-Zero RPM Timer: Reset RPM to 0 if no change in crankEventTime for 3 seconds
  const autoZeroTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastCrankEventTimeRef = useRef<number>(0);
  const lastCrankEventTimeChangeRef = useRef<number>(Date.now());
  
  useEffect(() => {
    if (!bleConnected || isPaused) {
      // Clear timer when disconnected or paused
      if (autoZeroTimerRef.current) {
        clearTimeout(autoZeroTimerRef.current);
        autoZeroTimerRef.current = null;
      }
      return;
    }

    // Check every second if crankEventTime has changed
    const checkInterval = setInterval(() => {
      const timeSinceLastChange = Date.now() - lastCrankEventTimeChangeRef.current;
      
      // PRO-FITNESS: If no change in crankEventTime for 3 seconds, reset RPM to 0
      // (RPM persistence is handled in BLE callback, this is just a safety check)
      if (timeSinceLastChange > 3000 && smoothedRPMShared.value > 0) {
        // Battery Optimization: No logging in useFrameCallback
        rawRPMShared.value = 0; // Update shared value (smoothing handled by useDerivedValue)
        // Clear smoothing history when sensor stops
        rpmRawHistoryRef.current = [];
        lastNonZeroRPMRef.current = 0;
      }
    }, 1000);

    return () => {
      clearInterval(checkInterval);
    };
  }, [bleConnected, isPaused]); // smoothedRPM removed - using SharedValue

  // Database Sync on Idle: Final sync if RPM is 0 for 15+ seconds
  const idleSyncRef = useRef<boolean>(false);
  const idleSyncTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    if (!session?.id || session.id === 'mock-session' || !authSession?.user) return;
    if (isPaused) return;

    // Clear existing timer
    if (idleSyncTimerRef.current) {
      clearTimeout(idleSyncTimerRef.current);
      idleSyncTimerRef.current = null;
    }

    // If RPM is 0, start idle timer (check SharedValue via useAnimatedReaction)
    // Use a ref to track smoothed RPM for this check
    const checkIdleSync = () => {
      if (smoothedRPMShared.value === 0 && !idleSyncRef.current) {
      idleSyncTimerRef.current = setTimeout(async () => {
        // RPM has been 0 for 15+ seconds - do final sync and stop further syncing
        // Battery Optimization: No logging in useFrameCallback
        idleSyncRef.current = true;
        
        try {
          // Only sync duration — drops_earned is set exclusively by award_drops()
          // and writing client-side estimates here would poison its idempotency check.
          await supabase
            .from('sessions')
            .update({
              duration_seconds: duration,
              updated_at: new Date().toISOString(),
            })
            .eq('id', session.id);
        } catch (error) {
          log.error('[Workout] Idle sync error:', error);
        }
      }, 15000); // 15 seconds
    } else if (smoothedRPMShared.value > 0) {
      // RPM is active again - reset idle flag and allow syncing
      idleSyncRef.current = false;
    }
    };
    
    // Check idle sync periodically (every second)
    const idleCheckInterval = setInterval(checkIdleSync, 1000);
    checkIdleSync(); // Initial check

    return () => {
      clearInterval(idleCheckInterval);
      if (idleSyncTimerRef.current) {
        clearTimeout(idleSyncTimerRef.current);
      }
    };
  }, [session?.id, averageRPM, duration, isPaused, authSession]); // Removed smoothedRPM, earnedDrops - using SharedValues

  // Connecting State: Subtle pulse animation while waiting for BLE connection
  useEffect(() => {
    const hasMachine = !!(machineId || session?.machine_id);
    const hasSensor = !!(sensorId || (session?.machine as any)?.ble_device_name || (session?.machine as any)?.sensor_id);

    if (bleConnected || !hasMachine || !hasSensor) {
      // Stop connecting animation when connected or nothing to connect to
      connectingPulseScale.value = withTiming(1, { duration: 300 });
      connectingPulseOpacity.value = withTiming(0, { duration: 300 });
      return;
    }

    // Premium breathing pulse — subtle scale + opacity shift
    connectingPulseScale.value = withRepeat(
      withSequence(
        withTiming(1.03, { duration: 1600, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.98, { duration: 1600, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );

    connectingPulseOpacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.7, { duration: 1600, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, [bleConnected, machineId, sensorId, session?.machine_id, (session?.machine as any)?.ble_device_name, (session?.machine as any)?.sensor_id]);

  // Performance Fix: Optimized smoothing for faster response
  // Layer 1: Lerp smoothing (balanced response, prevents jitter)
  const lerpSmoothedRPM = useSharedValue(0);
  useAnimatedReaction(
    () => rawRPMShared.value,
    (currentRPM) => {
      'worklet';
      // Hard Fix: If rawRPM is 0, immediately reset smoothing to 0 (no lerp delay)
      // This prevents smoothing chain from keeping old values when rawRPM is 0
      if (currentRPM === 0) {
        lerpSmoothedRPM.value = 0; // Instant reset to 0
      } else {
        // Lerp smoothing: slightly reduced lerpFactor for smoother response (0.35 instead of 0.4)
        const lerpFactor = 0.35; // Balanced factor for smooth response (was 0.4, originally 0.2)
        lerpSmoothedRPM.value = lerpSmoothedRPM.value + (currentRPM - lerpSmoothedRPM.value) * lerpFactor;
      }
    },
    [rawRPMShared]
  );

  // Layer 2: withTiming smoothing (smooth transitions, prevents jumps)
  // Performance Fix: Slightly increased duration for smoother transitions (500ms instead of 400ms)
  const smoothedRPMDerived = useDerivedValue(() => {
    return withTiming(lerpSmoothedRPM.value, {
      duration: 500, // Increased from 400ms to 500ms for smoother response (was 800ms)
      easing: Easing.out(Easing.quad),
    });
  }, [lerpSmoothedRPM]);

  // Sync smoothed derived value to shared value for use in other animations
  useAnimatedReaction(
    () => smoothedRPMDerived.value,
    (smoothed) => {
      'worklet';
      smoothedRPMShared.value = smoothed;
    },
    [smoothedRPMDerived]
  );

  // Critical Fix: Silence Detector Watchdog (useFrameCallback - GPU-only, no JS thread blocking)
  // Magene S3+ doesn't send '0 RPM' packets - it just stops emitting data (Silence)
  // This watchdog detects silence and smoothly sets RPM to 0
  // Enhanced: Even if RPM is stuck on small values (1-5 RPM), force to 0 if no data for 2.5s
  const frameCallback = useFrameCallback((frameInfo) => {
    'worklet';
    // 1. Current time
    const now = Date.now();
    
    // 2. How long since last packet?
    const diff = now - lastPacketTime.value;
    
    // Background guard: if diff > 10s, the app was likely backgrounded and the frame
    // callback just resumed. Skip zeroing — AppState 'active' handler re-syncs lastPacketTime.
    if (diff > 10000) {
      lastPacketTime.value = now;
      return;
    }
    
    // Hard Fix: Watchdog Reset - If no data for more than 2.5s, force direct reset to 0
    if (diff > 2500 && rawRPMShared.value > 0) {
      // Cancel any running animation first
      cancelAnimation(rawRPMShared);
      // Direct assignment to 0 - ensures exact 0.00 value immediately
      rawRPMShared.value = 0;
    }
  });
  
  // Activate frameCallback as long as component is mounted; deactivate on unmount
  useEffect(() => {
    frameCallback.setActive(true);
    return () => {
      frameCallback.setActive(false);
    };
  }, [frameCallback]);

  // NATIVE-DRIVEN: Display numbers using SharedValue (no re-renders)
  // These run entirely on UI thread
  const animatedRPMText = useSharedValue('--');
  const animatedDropsText = useSharedValue('0');
  const animatedCaloriesText = useSharedValue('0');
  const animatedPaceText = useSharedValue('0:00');
  const animatedSpeedText = useSharedValue('0.0');
  const animatedDistanceText = useSharedValue('0');
  const animatedInclineText = useSharedValue('--');
  // GPU-Only: LiquidGauge display value (SharedValue, no useState to avoid JS thread blocking)
  const liquidGaugeDisplayValueShared = useSharedValue('0');

  // Initialize text values on mount
  useEffect(() => {
    animatedRPMText.value = bleConnected ? Math.round(smoothedRPMShared.value).toString() : '--';
    animatedDropsText.value = Math.round(totalDropsShared.value).toLocaleString();
    animatedCaloriesText.value = Math.round(caloriesShared.value).toString();
    animatedPaceText.value = smoothedRPMShared.value === 0 ? '--:--' : '0:00';
  }, []);

  // REMOVED: LiquidGauge color is now fixed to neon blue (like drops)
  // Dynamic colors are only applied to pulse rings (concentric circles)

  // Hard Fix: Visual 'One-Killer' - Force values < 1.5 to display as "0"
  // This prevents Math.round(1.2) from becoming "1" on screen
  // Uses rawRPMShared directly to catch values before smoothing delays
  useAnimatedReaction(
    () => [rawRPMShared.value, smoothedRPMShared.value, bleConnected] as const,
    ([rawRpm, smoothedRpm, connected]) => {
      'worklet';
      if (!connected) {
        animatedRPMText.value = '--';
        return;
      }
      
      // Hard Fix: Use rawRPM directly when it's 0 or very low - ignore smoothed value
      // This prevents smoothing chain from keeping old values (like 94) when rawRPM is 0
      // CRITICAL: If rawRPM is 0 or < 1.5, display "0" immediately (ignore smoothing completely)
      // For non-zero values, use smoothed value for smooth display
      if (rawRpm < 1.5) {
        // Use rawRPM directly - ignore smoothing when value is low/zero
        animatedRPMText.value = '0';
      } else {
        // For non-zero values, use smoothed value for smooth transitions
        const rpmValue = Math.round(smoothedRpm).toString();
        animatedRPMText.value = rpmValue;
      }
      
      // Premium UI: Detect significant RPM jumps for pulse effect
      // Trigger pulse animation when RPM jumps by more than 15
      const currentRPM = rawRpm < 1.5 ? 0 : smoothedRpm;
      const rpmJump = Math.abs(currentRPM - lastRPMValue.value);
      if (rpmJump > 15 && currentRPM > 0) {
        // Significant jump detected - trigger pulse animation with spring physics
        rpmPulseScale.value = withSequence(
          withSpring(1.05, { damping: 15, stiffness: 100 }),
          withSpring(1, { damping: 15, stiffness: 100 })
        );
      }
      lastRPMValue.value = currentRPM;
    },
    [rawRPMShared, smoothedRPMShared, bleConnected]
  );
  
  // ============================================================================
  // PREMIUM UI: Dynamic RPM Color based on intensity (GPU-Only)
  // ============================================================================
  // 0-40 RPM: Gray (resting), 40-70 RPM: Dynamic Primary (moderate), 70-100 RPM: Yellow (intense), 100+ RPM: Red (maximum)
  const rpmTextColorStyle = useAnimatedStyle(() => {
    const currentRPM = rawRPMShared.value < 1.5 ? 0 : smoothedRPMShared.value;
    const primaryColor = primaryColorShared.value; // Dynamic primary color from branding
    const color = interpolateColor(
      currentRPM,
      [0, 40, 70, 100, 150],
      [
        theme.colors.textSecondary, // 0-40 RPM: Gray
        theme.colors.textSecondary, // 0-40 RPM: Gray
        primaryColor, // 40-70 RPM: Dynamic primary color
        '#facc15', // 70-100 RPM: Yellow
        '#f87171', // 100+ RPM: Red
      ]
    );
    return {
      color,
    };
  }, [rawRPMShared, smoothedRPMShared, primaryColorShared]);
  
  // ============================================================================
  // PREMIUM UI: Subtle Pulse Effect for RPM Container
  // ============================================================================
  // Scales up slightly (1.05) when RPM jumps significantly, using spring physics
  const rpmPulseStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: rpmPulseScale.value }],
    };
  }, [rpmPulseScale]);

  useAnimatedReaction(
    () => totalDropsShared.value,
    (drops) => {
      'worklet';
      const dropsValue = Math.round(drops).toLocaleString();
      animatedDropsText.value = dropsValue;
      // GPU-Only: Update LiquidGauge center display (drops, not percentage) - no runOnJS
      liquidGaugeDisplayValueShared.value = Math.round(drops).toString();
    },
    [totalDropsShared]
  );

  useAnimatedReaction(
    () => caloriesShared.value,
    (calories) => {
      'worklet';
      const caloriesValue = Math.round(calories).toString();
      animatedCaloriesText.value = caloriesValue;
    },
    [caloriesShared]
  );

  // PRO-FITNESS: Calculate Pace (min/km) using AnimatedText
  // Bike: Pace = Time / Distance, where Distance = total_revolutions * 0.002 km
  // Treadmill: Pace is set directly from FTMS speed in measurement callback (60/speed)
  useAnimatedReaction(
    () => [duration, totalDropsShared.value, totalCrankRevolutionsShared.value, smoothedRPMShared.value, machineType] as const,
    ([timeSeconds, _drops, totalRevolutions, rpm, mType]) => {
      'worklet';
      const currentMachineType = mType || 'treadmill';
      
      // Treadmill pace is calculated from FTMS speed in the BLE measurement callback
      if (currentMachineType === 'treadmill') return;
      
      // If RPM is 0, display --:--
      if (rpm === 0) {
        animatedPaceText.value = '--:--';
        return;
      }
      
      // Bike: Distance = total_revolutions * 0.002 (2m circle)
      const distanceKm = totalRevolutions * 0.002;
      
      // Calculate pace: seconds per km
      if (distanceKm > 0 && timeSeconds > 0) {
        const paceSecondsPerKm = timeSeconds / distanceKm;
        const paceMins = Math.floor(paceSecondsPerKm / 60);
        const paceSecs = Math.floor(paceSecondsPerKm % 60);
        animatedPaceText.value = `${paceMins}:${paceSecs.toString().padStart(2, '0')}`;
      } else {
        animatedPaceText.value = '--:--';
      }
    },
    [duration, totalDropsShared, totalCrankRevolutionsShared, smoothedRPMShared, machineType]
  );

  // ============================================================================
  // Gauge fills relative to current segment (same as progress bar).
  // segmentTargetShared = min(sessionCap, dailyRemaining) for this segment.
  // sessionBaseShared = total drops at the start of this segment.
  // gaugeTarget retained for drop emitter start-position calculation only.
  const gaugeTarget = useMemo(
    () => Math.max(targetDrops, dropLimitsRef.current.maxDropsPerDay || 300),
    [targetDrops],
  );

  useAnimatedReaction(
    () => totalDropsShared.value,
    (drops) => {
      'worklet';
      const segmentDrops = Math.max(0, drops - sessionBaseShared.value);
      const targetProgress = Math.min(segmentDrops / Math.max(segmentTargetShared.value, 1), 1);
      progressShared.value = withTiming(targetProgress, {
        duration: 300,
        easing: Easing.out(Easing.quad),
      });
    },
    [totalDropsShared, sessionBaseShared, segmentTargetShared]
  );

  // PRO-FITNESS: Calculate calories based on machine type
  // Bike: Kcal = (total_revolutions * 0.15)
  // Treadmill: calories are accumulated from speed in the BLE measurement callback
  useAnimatedReaction(
    () => [totalDropsShared.value, totalCrankRevolutionsShared.value, machineType] as const,
    ([_drops, totalRevolutions, mType]) => {
      'worklet';
      const currentMachineType = mType || 'treadmill';
      
      // Treadmill calories are calculated from speed in the measurement callback
      if (currentMachineType === 'treadmill') return;
      
      if (currentMachineType === 'bike') {
        caloriesShared.value = Math.floor(totalRevolutions * 0.15);
      }
    },
    [totalDropsShared, totalCrankRevolutionsShared, machineType]
  );

  // Pulse Rings are now handled in CircularProgressRing.tsx component (GPU-only animations)

  // Explosion Animation: Trigger when BLE connects
  useEffect(() => {
    if (bleConnected && session?.machine_id) {
      // Trigger explosion animation
      explosionScale.value = withSequence(
        withTiming(1.3, { duration: 300, easing: Easing.out(Easing.ease) }),
        withTiming(1, { duration: 200, easing: Easing.in(Easing.ease) })
      );
      explosionOpacity.value = withSequence(
        withTiming(0.8, { duration: 300, easing: Easing.out(Easing.ease) }),
        withTiming(0, { duration: 200, easing: Easing.in(Easing.ease) })
      );
    } else {
      explosionScale.value = 1;
      explosionOpacity.value = 0;
    }
  }, [bleConnected, session?.machine_id]);

  // Initialize session
  useEffect(() => {
    if (sessionId) {
      setSessionLoading(true);
      loadSession().finally(() => setSessionLoading(false));
    } else if (authSession?.user && equipmentId && gymId) {
      setSessionLoading(true);
      createSession().finally(() => setSessionLoading(false));
    } else {
      // Mock session for development
      const mockStartTime = new Date();
      setStartTime(mockStartTime);
      setSession({
        id: 'mock-session',
        started_at: mockStartTime.toISOString(),
        equipment: { name: 'Treadmill #1' },
        gym: { name: 'Your Gym' },
      });
      setSessionLoading(false);
    }
  }, [sessionId, equipmentId, gymId, authSession]);

  useEffect(() => {
    firstActivityDetectedRef.current = false;
    setAwaitingActivityProof(false);
    if (activityProofTimerRef.current) {
      clearTimeout(activityProofTimerRef.current);
      activityProofTimerRef.current = null;
    }
  }, [session?.id]);

  // Create new session
  const createSession = async () => {
    if (!authSession?.user || !equipmentId || !gymId) {
      log.error('Missing required data for session:', { user: !!authSession?.user, equipmentId, gymId });
      return;
    }

    // Hardening: never create a session without a machine lock path.
    if (!machineId) {
      setBleStatus(t('sessionStartRequiresLock'));
      showModal({ title: t('sessionStartBlockedTitle'), body: t('sessionStartRequiresLock') });
      router.replace('/scan');
      return;
    }

    // GYM SUSPEND CHECK: Verify gym is not suspended before creating session
    const { data: gym, error: gymError } = await supabase
      .from('gyms')
      .select('id, name, status, is_suspended, smartcoach_enabled')
      .eq('id', gymId)
      .single();

    if (gymError || !gym) {
      log.error('Error fetching gym:', gymError);
      // CRITICAL: No blocking Alert.alert() - log error and continue
      log.error('[Workout] Failed to verify gym status');
      // Continue with workout - user can still use the app
      return; // Exit early if gym not found
    }

    if (gym.status === 'suspended' || gym.is_suspended) {
      // CRITICAL: No blocking Alert.alert() - log warning and continue
      log.warn('[Workout] Gym is suspended, but continuing with workout');
      // Continue with workout - user can still track their session
    }

    const { data: lockResult, error: lockError } = await supabase.rpc('lock_machine', {
      p_machine_id: machineId,
      p_user_id: authSession.user.id,
    });

    if (lockError || !lockResult) {
      setBleStatus(t('sessionStartMachineBusy'));
      showModal({ title: t('sessionStartBlockedTitle'), body: t('sessionStartMachineBusy') });
      router.replace('/scan');
      return;
    }

    const deviceHash = await getDeviceFingerprintHash();

    const { data, error } = await supabase
      .from('sessions')
      .insert({
        user_id: authSession.user.id,
        gym_id: gymId,
        machine_id: machineId,
        started_at: new Date().toISOString(),
        is_active: true,
        raw_metrics: {
          security: {
            device_hash: deviceHash,
            lock_required: true,
            source: 'workout_fallback',
          },
        },
      })
      .select('*, machine:machine_id(*), gym:gym_id(*)')
      .single();

    if (error) {
      log.error('Error creating session:', error);
      try {
        await supabase.rpc('unlock_machine', {
          p_machine_id: machineId,
          p_user_id: authSession.user.id,
        });
      } catch (unlockError) {
        log.error('[Workout] Failed to unlock machine after session create failure:', unlockError);
      }
      if (isMountedRef.current) {
        showModal({
          title: t('sessionLoadFailedTitle'),
          body: t('sessionLoadFailedBody'),
          buttons: [{ label: t('backToScan'), onPress: () => router.replace('/scan') }],
        });
      }
      return;
    }

    if (data) {
      log.debug('Session created:', { id: data.id, gym_id: data.gym_id, gym_name: data.gym?.name });
      setSession(data);
      setStartTime(new Date(data.started_at));
    }
  };

  // Load existing session
  const loadSession = async () => {
    if (!sessionId) return;

    const { data, error } = await supabase
      .from('sessions')
      .select('*, machine:machine_id(*), gym:gym_id(*)')
      .eq('id', sessionId)
      .single();

    if (error || !data) {
      log.error('[Workout] Failed to load session:', error);
      if (isMountedRef.current) {
        showModal({
          title: t('sessionLoadFailedTitle'),
          body: t('sessionLoadFailedBody'),
          buttons: [{ label: t('backToScan'), onPress: () => router.replace('/scan') }],
        });
      }
      return;
    }

    if (data) {
      setSession(data);
      setStartTime(new Date(data.started_at));
      
      log.debug('[Workout] Session loaded:', {
        id: data.id,
        gymId: data.gym_id,
        machine: data.machine,
        machineType: data.machine?.type,
      });
      
      // Load saved progress (update SharedValues)
      // NOTE: drops_earned is no longer saved during workout sync (award_drops() sets it at end)
      // Restore estimated calories from session for UI display
      if (data.duration_seconds) {
        setDuration(data.duration_seconds);
      }
      if (data.calories && data.calories > 0) {
        caloriesShared.value = data.calories;
        setCalories(Math.round(data.calories));
      }
    }
  };

  // Throttled DB sync — delegated to useWorkoutSync hook
  useWorkoutSync({
    sessionId: session?.id,
    userId: authSession?.user?.id,
    duration,
    caloriesShared,
    isPaused,
    idleSyncRef,
    isMockSession: session?.id === 'mock-session',
  });

  const applyLiveDropsEstimate = useCallback((nextDrops: number) => {
    const current = Math.max(0, Math.round(totalDropsShared.value));
    const safeNext = Math.max(current, Math.round(nextDrops));
    if (safeNext === current) return;

    earnedDropsShared.value = safeNext;
    totalDropsShared.value = safeNext;

    const delta = safeNext - current;
    if (delta <= 0 || isAppInBackgroundRef.current) {
      return;
    }

    const currentProgress = Math.min(totalDropsShared.value / Math.max(gaugeTarget, 1), 1);
    const visualDrops = Math.min(delta, 6);
    const newDropObjects: Array<{ id: string; startX: number; progress: number }> = [];
    for (let i = 0; i < visualDrops; i++) {
      const dropId = `${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`;
      const gaugeWidth = 280;
      const padding = 40;
      const startX = padding + Math.random() * (gaugeWidth - padding * 2);
      newDropObjects.push({
        id: dropId,
        startX,
        progress: currentProgress,
      });
    }
    setActiveDrops((prev) => [...prev, ...newDropObjects]);

    try {
      liquidGaugeRef.current?.triggerImpact();
    } catch {
      // ignore if unmounted/deallocated
    }

    dropJumpScale.value = withSequence(
      withTiming(1.15, { duration: 150, easing: Easing.out(Easing.ease) }),
      withTiming(1, { duration: 150, easing: Easing.in(Easing.ease) })
    );

    const hapticNow = Date.now();
    if (!lastHapticTimeRef.current || hapticNow - lastHapticTimeRef.current >= 200) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      lastHapticTimeRef.current = hapticNow;
    }
  }, [dropJumpScale, earnedDropsShared, gaugeTarget, totalDropsShared]);

  // Timer for duration only - REQUIRES BLE connection
  useEffect(() => {
    if (!session && !startTime) return;
    if (isPaused) return;
    if (!bleConnected) return; // Don't start timer until BLE is connected

    const interval = setInterval(() => {
      if (!isMountedRef.current) {
        return;
      }
      const now = new Date();
      // For simulator sessions with timeScale, use simulated elapsed time from
      // FTMS measurements rather than wall-clock time so all UI and drop
      // calculations honour the accelerated timeline.
      let seconds: number;
      if (isSimulator && simulatorElapsedRef.current != null) {
        seconds = simulatorElapsedRef.current;
      } else {
        const start = startTime || (session ? new Date(session.started_at) : now);
        const pausedOffset = pausedTime ? now.getTime() - pausedTime.getTime() : 0;
        seconds = Math.floor((now.getTime() - start.getTime() - pausedOffset) / 1000);
      }

      if (seconds >= 0) {
        setDuration(seconds);
        // Use session average RPM for estimation so drops don't vanish during
        // momentary RPM dips. The averageRPM state tracks a rolling long-term
        // average that stays stable when the user briefly stops pedaling.
        const stableRpm = averageRPM > 0 ? averageRPM : Math.round(smoothedRPMShared.value);
        const stableSpeed = Number(treadmillSpeedShared.value || 0);

        const result = estimateLiveDropsDetailed({
          durationSeconds: seconds,
          calories: Math.round(caloriesShared.value),
          machineType:
            machineType === 'treadmill' ||
            machineType === 'bike' ||
            machineType === 'elliptical' ||
            machineType === 'stepper' ||
            machineType === 'generic'
              ? machineType
              : 'generic',
          avgRpm: stableRpm,
          avgSpeedKmh: stableSpeed,
          cadencePerMin: stableRpm,
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
          setTierToast(t('dailyCapHitBanner'));
          if (tierToastTimerRef.current) clearTimeout(tierToastTimerRef.current);
          tierToastTimerRef.current = setTimeout(() => setTierToast(null), 5000);
        } else if (!result.hardCapReached && isTrackingOnly) {
          setIsTrackingOnly(false);
        }

        // Segment advance: when user earns their first drop PAST the current segment target,
        // advance the base so the bar resets and shows progress into the next segment.
        // We use strictly > (not >=) so the bar stays full at 100% until the next drop arrives.
        if (!result.hardCapReached && result.drops > 0) {
          const currentDrops = result.drops;
          const currentBase = sessionBaseShared.value;
          const segmentMilestone = currentBase + segmentTargetRef.current;
          if (
            currentDrops > segmentMilestone &&
            currentDrops !== segmentAdvancedAtRef.current
          ) {
            // New base = the milestone we just crossed (not currentDrops),
            // so that the drops already past the milestone show correctly as partial fill.
            const newBase = segmentMilestone;
            const newTarget = Math.max(1, Math.min(
              dropLimitsRef.current.maxDropsPerSession,
              result.dailyRemaining,
            ));
            segmentAdvancedAtRef.current = currentDrops;
            sessionBaseShared.value = newBase;
            segmentTargetRef.current = newTarget;
            segmentTargetShared.value = newTarget;
            // Cancel any in-flight withTiming before setting new value
            cancelAnimation(progressShared);
            const dropsIntoNewSegment = currentDrops - newBase;
            const newFill = Math.min(dropsIntoNewSegment / Math.max(newTarget, 1), 1);
            progressShared.value = withTiming(newFill, { duration: 150 });
          }
        }

        // One-time tier transition toasts (only if cap not hit)
        if (!result.hardCapReached) {
          if (result.tier === 'tier1' && !tier1ShownRef.current) {
            tier1ShownRef.current = true;
            setTierToast(t('thresholdReached'));
            if (tierToastTimerRef.current) clearTimeout(tierToastTimerRef.current);
            tierToastTimerRef.current = setTimeout(() => setTierToast(null), 4000);
          } else if (result.tier === 'tier2' && !tier2ShownRef.current) {
            tier2ShownRef.current = true;
            setTierToast(t('deepReducedMode'));
            if (tierToastTimerRef.current) clearTimeout(tierToastTimerRef.current);
            tierToastTimerRef.current = setTimeout(() => setTierToast(null), 4000);
          }
        }

        if (!result.hardCapReached) {
          applyLiveDropsEstimate(result.drops);
        }
      }
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [applyLiveDropsEstimate, bleConnected, isPaused, isTrackingOnly, pausedTime, session, startTime, caloriesShared]);

  // Calculate current minutes (memoized to avoid recalculating on every render)
  const currentMinutes = useMemo(() => Math.floor(duration / 60), [duration]);

  

  // Auto-refresh challenge progress every 12 seconds during workout
  useEffect(() => {
    if (!session?.gym_id || !machineType || isPaused || !bleConnected) {
      return;
    }

    // Refresh challenge progress every 12 seconds to keep overlay updated
    const refreshInterval = setInterval(() => {
      if (refreshChallenges) {
        refreshChallenges();
      }
    }, 12000); // 12 seconds

    return () => {
      clearInterval(refreshInterval);
    };
  }, [session?.gym_id, machineType, isPaused, bleConnected, refreshChallenges]);

  // Update challenge progress every minute (only when a new minute is reached)
  // NOTE: Challenge progress is automatically updated via award_drops() when workout ends
  // No need to manually update progress during workout - removed deprecated updateProgress calls
  // Progress will be updated when award_drops() -> update_challenge_progress() is called
  // 
  // Refresh challenges after workout ends to show updated progress
  useEffect(() => {
    if (!bleConnected && session?.gym_id) {
      // Refresh challenges when workout ends (BLE disconnected)
      refreshChallenges();
    }
  }, [bleConnected, session?.gym_id, refreshChallenges]);

  // REMOVED: challenge message timer cleanup - no longer needed

  // Live drops are estimated from server-equivalent tokenomics rules each second,
  // while BLE callback only feeds activity/calorie telemetry.

  const finalizeForInactivity = useCallback(async () => {
    if (!session || !authSession?.user || session.id === 'mock-session') {
      return;
    }
    if (!inactivityFinalizeCoordinatorRef.current.tryStart()) {
      return;
    }
    if (isFinalizingRef.current) {
      return;
    }

    isFinalizingRef.current = true;
    inactivityStateRef.current = markInactivityFinalized(inactivityStateRef.current);
    setShowInactivityWarning(false);
    setHeartbeatAllowed(false);

    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }

    try {
      await bleService.stopMonitoring();
      await bleService.disconnect();
    } catch (disconnectError) {
      log.warn('[Workout] Inactivity auto-finish BLE disconnect warning:', disconnectError);
    }

    let dropsEarned = 0;
    let multiplier = 1;
    let badgesEarned: string[] = [];
    const message = t('inactivityAutoFinishedNotice');

    try {
      type FinalizeInactiveRpc = (
        fn: string,
        args: Record<string, unknown>
      ) => Promise<{ data: unknown; error: { message?: string } | null }>;
      const rpc = supabase.rpc.bind(supabase) as unknown as FinalizeInactiveRpc;

      const { data, error } = await rpc('finalize_inactive_session', {
        p_session_id: session.id,
        p_reason: 'inactivity_autofinish',
      });

      if (error) {
        throw new Error(error.message || 'finalize_inactive_session failed');
      }

      const result = Array.isArray(data) ? data[0] : data;
      if (result && typeof result === 'object') {
        const obj = result as Record<string, unknown>;
        if (typeof obj.drops_earned === 'number') dropsEarned = obj.drops_earned;
        if (typeof obj.multiplier === 'number') multiplier = obj.multiplier;
        if (Array.isArray(obj.badges_earned)) {
          badgesEarned = obj.badges_earned.filter((v): v is string => typeof v === 'string');
        }
      }
    } catch (rpcError) {
      log.warn('[Workout] finalize_inactive_session unavailable/failing, using fallback finalize:', rpcError);
      await supabase
        .from('sessions')
        .update({
          is_active: false,
          ended_at: new Date().toISOString(),
          duration_seconds: duration,
          updated_at: new Date().toISOString(),
          raw_metrics: {
            security: {
              auto_finish_reason: 'inactivity_autofinish',
            },
          },
        })
        .eq('id', session.id);
    }

    if (session.machine_id) {
      try {
        await supabase.rpc('unlock_machine', {
          p_machine_id: session.machine_id,
          p_user_id: authSession.user.id,
        });
      } catch (unlockError) {
        log.error('[Workout] Failed to unlock machine after inactivity auto-finish:', unlockError);
      }
    }

    setBleConnected(false);
    try {
      router.replace({
        pathname: '/session-summary',
        params: {
          sessionId: session.id,
          drops: String(dropsEarned),
          duration: String(duration),
          multiplier: String(multiplier),
          badges: badgesEarned.length > 0 ? JSON.stringify(badgesEarned) : undefined,
          gymId: session.gym_id || '',
          securityStatus: 'cap',
          securityMessage: message,
          sessionTier,
          trackingOnly: isTrackingOnly ? '1' : undefined,
        },
      });
    } catch (navError) {
      log.error('[Workout] finalizeForInactivity navigation failed, falling back to /scan:', navError);
      try { router.replace('/scan'); } catch { /* ignore */ }
    } finally {
      isFinalizingRef.current = false;
    }
  }, [authSession?.user, duration, isTrackingOnly, router, session, t]);

  useEffect(() => {
    if (!session?.machine_id || !bleConnected || isPaused) {
      setShowInactivityWarning(false);
      setHeartbeatAllowed(true);
      return;
    }

    const tick = () => {
      const { nextState, snapshot } = evaluateInactivity(
        inactivityStateRef.current,
        smoothedRPMShared.value,
        Date.now(),
        inactivityPolicy
      );
      inactivityStateRef.current = nextState;

      setHeartbeatAllowed(snapshot.heartbeatAllowed);
      setInactivityCountdownSec(snapshot.countdownSeconds);

      if (snapshot.warningVisible) {
        setShowInactivityWarning(true);
      } else {
        setShowInactivityWarning(false);
      }

      if (snapshot.shouldAutoFinish) {
        void finalizeForInactivity();
      }
    };

    const interval = setInterval(tick, 1000);
    tick();
    return () => clearInterval(interval);
  }, [
    bleConnected,
    finalizeForInactivity,
    inactivityPolicy,
    isPaused,
    session?.machine_id,
    smoothedRPMShared,
  ]);

  const pauseWorkout = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPauseReason('manual');
    setPausedTime(new Date());
    setIsPaused(true);
    // Step 2: record timestamp so auto-resume is suppressed for AUTO_RESUME_GUARD_MS
    manualPausedAtRef.current = Date.now();
    pausedOverlayOpacity.value = withSpring(1, { damping: 15, stiffness: 100, mass: 1 });
    setShowAutoPauseOverlay(false);
  };

  const resumeWorkout = async () => {
    if (!isPaused || isResumingFromPause) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsResumingFromPause(true);

    try {
      const resumeMachineIdentity: MachineIdentity = {
        id: session?.machine_id ?? machineId ?? '',
        ble_device_name: (session?.machine as any)?.ble_device_name ?? null,
        ble_serial_number: (session?.machine as any)?.ble_serial_number ?? null,
        ble_pairing_verified: (session?.machine as any)?.ble_pairing_verified ?? false,
        sensor_id: sensorId ?? (session?.machine as any)?.sensor_id ?? null,
        ble_protocol: (bleProtocol ?? (session?.machine as any)?.ble_protocol ?? null) as MachineIdentity['ble_protocol'],
      };
      const hasResumeIdentity = !!(resumeMachineIdentity.ble_device_name ?? resumeMachineIdentity.sensor_id);
      let reconnectOk = true;

      // For machine sessions we require an active BLE link before resume.
      if (session?.machine_id && hasResumeIdentity && (!bleConnected || !bleService.getConnected())) {
        setBleStatus(t('reconnecting'));

        reconnectOk = await bleService.reconnect();
        if (!reconnectOk) {
          try {
            reconnectOk = await bleService.connectToMachine(resumeMachineIdentity);
          } catch {
            reconnectOk = false;
          }
        }

        setBleConnected(reconnectOk);
      }

      if (!reconnectOk) {
        resumeFailCountRef.current += 1;
        setPauseReason('connection');
        setBleStatus(t('reconnectionFailed'));
        if (resumeFailCountRef.current >= 3) {
          setShowForceFinishOption(true);
        }
        return;
      }
      // Reset fail counter on success
      resumeFailCountRef.current = 0;
      setShowForceFinishOption(false);

      if (pausedTime) {
        const pauseDuration = new Date().getTime() - pausedTime.getTime();
        setStartTime((prev) => {
          if (prev) {
            return new Date(prev.getTime() + pauseDuration);
          }
          return prev;
        });
      }

      setPausedTime(null);
      setPauseReason('manual');
      setIsPaused(false);
      // Step 2: clear manual pause guard on explicit user resume
      manualPausedAtRef.current = null;
      pausedOverlayOpacity.value = withSpring(0, { damping: 15, stiffness: 100, mass: 1 });
      lastRPMTimeRef.current = Date.now();
      setBleStatus('');
    } finally {
      setIsResumingFromPause(false);
    }
  };

  // Finish workout with long press
  const handleFinishPressIn = () => {
    finishPressProgress.value = withTiming(1, { duration: 1000, easing: Easing.linear });
    longPressTimerRef.current = setTimeout(() => {
      finishPressProgress.value = 1;

      // Warn user if workout is shorter than 2 minutes — they'll get 0 drops.
      // Bug 4a: skip the warning when the user is being forced to end via the
      // connection-lost overlay (they can't recover, so the warning is just
      // friction). Drops are credited based on whatever duration was synced.
      const isInvoluntaryConnectionEnd =
        isPaused && pauseReason === 'connection';

      if (duration < 120 && !isInvoluntaryConnectionEnd) {
        showModal({
          title: t('shortWorkoutTitle'),
          body: t('shortWorkoutBody', { seconds: duration }),
          buttons: [
            {
              label: t('common:cancel'),
              style: 'cancel',
              onPress: () => {
                finishPressProgress.value = withTiming(0, { duration: 200 });
              },
            },
            {
              label: t('shortWorkoutConfirm'),
              style: 'destructive',
              onPress: () => handleFinishWorkout(),
            },
          ],
        });
      } else {
        handleFinishWorkout();
      }
    }, 1000);
  };

  const handleFinishPressOut = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    finishPressProgress.value = withTiming(0, { duration: 200 });
  };

  // End workout
  const handleFinishWorkout = async () => {
    if (isFinalizingRef.current) {
      return;
    }
    isFinalizingRef.current = true;
    setIsFinishing(true);
    try {
      await _handleFinishWorkoutCore();
    } catch (fatalError) {
      log.error('[Workout] handleFinishWorkout fatal error:', fatalError);
      if (isMountedRef.current) {
        try {
          router.replace('/scan');
        } catch {
          // ignore secondary navigation error
        }
      }
    } finally {
      isFinalizingRef.current = false;
      setIsFinishing(false);
    }
  };

  const _handleFinishWorkoutCore = async () => {

    // CRITICAL: Clean up all timers/intervals before finishing
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    
    if (timeProgressIntervalRef.current) {
      clearInterval(timeProgressIntervalRef.current);
      timeProgressIntervalRef.current = null;
    }
    if (activityProofTimerRef.current) {
      clearTimeout(activityProofTimerRef.current);
      activityProofTimerRef.current = null;
    }
    setAwaitingActivityProof(false);

    // Immediately disconnect BLE when workout ends
    try {
      log.debug('[Workout] Disconnecting BLE on workout end...');
      await bleService.stopMonitoring();
      await bleService.disconnect();
      setBleConnected(false);
      log.debug('[Workout] BLE disconnected successfully');
    } catch (error) {
      log.error('[Workout] Error disconnecting BLE:', error);
      // Continue even if disconnect fails
    }
    
    // Cleanup RPM persistence
    lastNonZeroRPMRef.current = 0;

    // Check if workout is too short (< 1 minute)
    // No blocking alert - just continue with workout
    if (duration < 60) {
      log.debug('[Workout] Workout is less than 1 minute, but continuing anyway');
      // Continue with workout instead of blocking user
    }

    if (!authSession?.user || !session?.id || session.id === 'mock-session') {
      // Mock mode
      router.replace({
        pathname: '/session-summary',
        params: {
          sessionId: 'mock',
          drops: Math.round(totalDropsShared.value).toString(),
          duration: duration.toString(),
          gymId: session?.gym_id || '',
          sessionTier,
          trackingOnly: isTrackingOnly ? '1' : undefined,
        },
      });
      return;
    }

    // Verify session has gym_id before ending
    if (!session.gym_id) {
      log.error('Session missing gym_id:', session);
      // No blocking alert - log error and continue
      log.error('[Workout] Cannot save workout: missing gym information');
      // Still navigate to summary with available data
    }

    // AGENT NOTE: [2026-03-02] - mobile-coder (Task 3.2)
    // CRITICAL: Drops are now calculated SERVER-SIDE by award_drops().
    // Client-side drops (totalDropsShared) are only used as an UI estimate during workout.
    // The authoritative drops value comes from the RPC response.
    
    const estimatedDrops = Math.round(totalDropsShared.value); // UI estimate only
    const estimatedCalories = Math.round(caloriesShared.value);
    // Prefer session-long rolling average for backend drop calculation. The
    // instantaneous smoothedRPMShared may be 0 if user stopped pedaling before
    // pressing Finish, which would cause the backend to under-reward.
    const finalAverageRPM = averageRPM > 0 ? averageRPM : (Math.round(smoothedRPMShared.value) > 0 ? Math.round(smoothedRPMShared.value) : null);
    const totalRevolutions = Math.round(totalCrankRevolutionsShared.value);
    const deviceHash = await getDeviceFingerprintHash();
    
    // Build raw_metrics JSONB for server-side calculation and analytics.
    // CRITICAL: Backend reads `avg_rpm` (not `avg_cadence`) for drop calculation.
    // Preserve existing security block from session creation (scanner sets source/lock flags).
    const existingRawMetrics = (session.raw_metrics && typeof session.raw_metrics === 'object')
      ? session.raw_metrics as Record<string, unknown>
      : {};
    const existingSecurity = (existingRawMetrics.security && typeof existingRawMetrics.security === 'object')
      ? existingRawMetrics.security as Record<string, unknown>
      : {};

    const rawMetrics: Record<string, unknown> = {
      ...existingRawMetrics,
      avg_rpm: finalAverageRPM,
      avg_cadence: finalAverageRPM,
      calories_source: ftmsProtocolActiveRef.current && ftmsDeviceCaloriesRef.current > 0
        ? 'device' : 'estimated',
      ble_protocol: ftmsProtocolActiveRef.current ? 'ftms' : 'csc',
      security: {
        ...existingSecurity,
        device_hash: deviceHash,
      },
    };

    // RPM peak for backend spike detection
    if (rpmHistoryRef.current.length > 0) {
      rawMetrics.rpm_peak = Math.max(...rpmHistoryRef.current);
    }

    // Distance: prefer FTMS device-reported, fallback to revolution estimate
    if (ftmsProtocolActiveRef.current && ftmsTotalDistanceRef.current > 0) {
      rawMetrics.total_distance = Math.round(ftmsTotalDistanceRef.current);
    } else if (totalRevolutions > 0) {
      // Rough distance estimate: bike wheel circumference ~2.1m
      rawMetrics.total_distance = Math.round(totalRevolutions * 2.1);
    }

    // FTMS extended metrics (only when FTMS protocol was active)
    if (ftmsProtocolActiveRef.current) {
      // Speed stats — also write top-level `speed_avg_kmh` for backend drop calc
      if (ftmsSpeedHistoryRef.current.length > 0) {
        const avgSpeed = ftmsSpeedHistoryRef.current.reduce((a, b) => a + b, 0)
          / ftmsSpeedHistoryRef.current.length;
        rawMetrics.speed_avg_kmh = Math.round(avgSpeed * 10) / 10;
        rawMetrics.avg_speed_kmh = rawMetrics.speed_avg_kmh;
        rawMetrics.max_speed_kmh = Math.round(ftmsMaxSpeedRef.current * 10) / 10;
      }

      // Power stats
      if (ftmsPowerHistoryRef.current.length > 0) {
        const avgPower = ftmsPowerHistoryRef.current.reduce((a, b) => a + b, 0)
          / ftmsPowerHistoryRef.current.length;
        rawMetrics.avg_power_watts = Math.round(avgPower);
        rawMetrics.max_power_watts = ftmsMaxPowerRef.current;
      }

      // Device calories (from machine, more accurate than estimation)
      if (ftmsDeviceCaloriesRef.current > 0) {
        rawMetrics.device_calories = ftmsDeviceCaloriesRef.current;
      }
    }

    log.debug('[Workout] Ending session (server-side drops):', {
      sessionId: session.id,
      gymId: session.gym_id,
      estimatedDrops,
      estimatedCalories,
      averageRPM: finalAverageRPM,
      userId: authSession.user.id,
      rawMetricsKeys: Object.keys(rawMetrics),
      avg_rpm_value: rawMetrics.avg_rpm,
      rpm_peak_value: rawMetrics.rpm_peak,
    });

    // Final sync: Save duration, calories, raw_metrics BEFORE calling award_drops()
    // CRITICAL: Do NOT save drops_earned — award_drops() uses it for idempotency check
    // Prefer FTMS device calories when available (more accurate than estimation)
    const finalCalories = ftmsProtocolActiveRef.current && ftmsDeviceCaloriesRef.current > 0
      ? ftmsDeviceCaloriesRef.current
      : estimatedCalories;

    let finalSyncOk = false;
    try {
      await withRetry(async () => {
        // Do NOT set is_active=false or ended_at here — award_drops() does that
        // atomically along with wallet crediting. Setting it early causes award_drops()
        // to hit its idempotency guard and skip the entire calculation.
        const { error: syncError } = await supabase
          .from('sessions')
          .update({
            duration_seconds: duration,
            calories: finalCalories > 0 ? finalCalories : null,
            raw_metrics: rawMetrics,
            updated_at: new Date().toISOString(),
          })
          .eq('id', session.id);
        if (syncError) throw syncError;
      }, { attempts: 3, baseDelayMs: 1000, label: 'Workout/finalSync' });

      finalSyncOk = true;
      log.debug('[Workout] Final sync completed:', { finalCalories, averageRPM: finalAverageRPM, duration, isFTMS: ftmsProtocolActiveRef.current });

      // Safety net: if the update silently affected 0 rows (e.g. RLS denied),
      // verify raw_metrics persisted.
      const { data: verify } = await supabase
        .from('sessions')
        .select('raw_metrics')
        .eq('id', session.id)
        .single();
      if (verify && !verify.raw_metrics?.avg_rpm && finalAverageRPM) {
        log.warn('[Workout] raw_metrics.avg_rpm missing after sync — retrying update');
        await supabase
          .from('sessions')
          .update({ raw_metrics: rawMetrics })
          .eq('id', session.id);
      }
    } catch (syncError) {
      log.error('[Workout] Final sync failed after retries:', syncError);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // CALL award_drops() — SERVER-SIDE DROPS CALCULATION
    // This is the ONLY way drops are calculated. NEVER send drops from client.
    // award_drops() is idempotent — safe to retry on transient failures.
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    let serverDrops = 0;
    let serverMultiplier = 1.0;
    let serverBadges: string[] = [];
    let securityStatus: 'cap' | 'rate' | 'fraud' | null = null;
    let securityMessage: string | null = null;
    let pendingSync = false;

    try {
      const awardResult = await withRetry(async () => {
        const { data, error: rpcErr } = await supabase.rpc('award_drops', { p_session_id: session.id });
        if (rpcErr) {
          // Business-logic errors (cap/fraud) should NOT be retried
          const kind = mapSecurityError(rpcErr.message || '');
          if (kind !== 'other') throw Object.assign(new Error(rpcErr.message), { _noRetry: true });
          throw new Error(rpcErr.message || 'award_drops RPC error');
        }
        return data;
      }, { attempts: 3, baseDelayMs: 1500, label: 'Workout/awardDrops' });

      if (awardResult && awardResult.length > 0) {
        const result = awardResult[0];
        serverDrops = result.drops_earned;
        serverMultiplier = result.multiplier;
        serverBadges = result.badges_earned || [];

        // Backend can return success with 0 drops when anti-abuse/cap/min-duration rules apply.
        if (serverDrops <= 0 && !securityMessage) {
          const backendReason = String(
            (result as any)?.reason_code ??
            (result as any)?.reason ??
            (result as any)?.error_message ??
            ''
          ).toLowerCase();

          const normalized = mapSecurityError(backendReason);
          if (normalized === 'cap') {
            securityStatus = 'cap';
            securityMessage = t('securityCapReached');
          } else if (normalized === 'rate') {
            securityStatus = 'rate';
            securityMessage = t('securityRateLimited');
          } else if (normalized === 'fraud') {
            securityStatus = 'fraud';
            securityMessage = t('securityFraudBlocked');
          } else if (
            backendReason.includes('duration') ||
            backendReason.includes('short') ||
            duration < 120
          ) {
            securityStatus = 'cap';
            securityMessage = t('securitySessionTooShort');
          } else {
            securityStatus = 'cap';
            securityMessage = t('securityNoDropsAwarded');
          }
        }

        const clientDrops = Math.round(totalDropsShared.value);
        log.debug('[Workout] award_drops() success:', {
          drops_earned: serverDrops,
          multiplier: serverMultiplier,
          badges_earned: serverBadges,
          securityMessage,
          clientEstimatedDrops: clientDrops,
          delta: serverDrops - clientDrops,
        });
        if (Math.abs(serverDrops - clientDrops) > 2) {
          log.warn('[Workout] Drops mismatch — client estimated', clientDrops,
            'but server awarded', serverDrops, '(delta:', serverDrops - clientDrops, ')');
        }

        // Evaluate referral qualification (check-in + identity verification)
        void supabase
          .rpc('evaluate_referral_qualification', { p_referral_id: null })
          .then(({ error: refErr }) => {
            if (refErr && __DEV__) log.warn('[Workout] evaluate_referral_qualification failed:', refErr.message);
          });
      }
    } catch (awardRetryError: any) {
      if (awardRetryError?._noRetry) {
        // Definitive backend rejection (cap/fraud/rate) — don't persist for recovery
        log.error('[Workout] award_drops() rejected:', awardRetryError.message);
        const normalized = mapSecurityError(awardRetryError.message || '');
        if (normalized === 'cap') { securityStatus = 'cap'; securityMessage = t('securityCapReached'); }
        else if (normalized === 'rate') { securityStatus = 'rate'; securityMessage = t('securityRateLimited'); }
        else if (normalized === 'fraud') { securityStatus = 'fraud'; securityMessage = t('securityFraudBlocked'); }
        else { securityStatus = 'rate'; securityMessage = t('securityAwardFailed'); }
      } else {
        // Network / transient failure — persist for recovery on session-summary
        log.error('[Workout] award_drops() failed after all retries:', awardRetryError);
        await savePendingFinalization(session.id);
        pendingSync = true;
      }
    }

    // If the final sync itself failed, persist too (award_drops may have had no data to work with)
    if (!finalSyncOk && !pendingSync) {
      await savePendingFinalization(session.id);
      pendingSync = true;
    }

    // Unlock machine if it was locked (best-effort, don't block navigation)
    if (session.machine_id && authSession?.user) {
      try {
        await supabase.rpc('unlock_machine', {
          p_machine_id: session.machine_id,
          p_user_id: authSession.user.id,
        });
        log.debug('[Workout] Machine unlocked');
      } catch (unlockError) {
        log.error('[Workout] Failed to unlock machine:', unlockError);
      }
    }

    router.replace({
      pathname: '/session-summary',
      params: {
        sessionId: session.id,
        drops: serverDrops.toString(),
        duration: duration.toString(),
        multiplier: serverMultiplier.toString(),
        badges: serverBadges.length > 0 ? JSON.stringify(serverBadges) : undefined,
        gymId: session.gym_id || '',
        securityStatus: securityStatus || undefined,
        securityMessage: securityMessage || undefined,
        sessionTier,
        trackingOnly: (isTrackingOnly || hardCapHitDuringSession) ? '1' : undefined,
        pendingSync: pendingSync ? '1' : undefined,
      },
    });
  };

  // Keep ref in sync so BLE/simulator callbacks always invoke the latest version
  handleFinishWorkoutRef.current = handleFinishWorkout;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Animated styles
  const splashStyle = useAnimatedStyle(() => {
    const scale = interpolate(splashAnim.value, [0, 1], [1, 1.1]);
    const opacity = interpolate(splashAnim.value, [0, 1], [1, 0.7]);
    return { transform: [{ scale }], opacity };
  });

  // Premium Spring Physics Configuration
  const springConfig = {
    damping: 15,
    stiffness: 100,
    mass: 1,
  };

  // Blurred Background with Animated Gradients (RPM-based zone colors)
  // Use dynamic primary color with interpolateColor for smooth transitions
  const backgroundGradientColor = useDerivedValue(() => {
    const rpm = smoothedRPMShared.value;
    const primaryColor = primaryColorShared.value;
    if (rpm === 0) return theme.colors.background;
    if (rpm >= 100) return '#FF6600'; // Orange/Red zone
    if (rpm >= 65) return '#00FF88'; // Green zone
    return primaryColor; // Dynamic primary color zone
  }, [smoothedRPMShared, primaryColorShared]);

  const pausedOverlayStyle = useAnimatedStyle(() => ({
    opacity: withSpring(pausedOverlayOpacity.value, springConfig),
  }));

  useEffect(() => {
    pausedOverlayOpacity.value = withSpring(isPaused ? 1 : 0, springConfig);
  }, [isPaused, pausedOverlayOpacity]);

  const finishButtonStyle = useAnimatedStyle(() => {
    const width = interpolate(finishPressProgress.value, [0, 1], [0, 100]);
    return { width: `${width}%` };
  });


  // Connecting State Animated Style (subtle pulse while waiting)
  const connectingPulseStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: connectingPulseScale.value }],
      opacity: connectingPulseOpacity.value,
    };
  });

  // Explosion Animation Style (when BLE connects)
  const explosionStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: explosionScale.value }],
      opacity: explosionOpacity.value,
    };
  });

  // Drop Jump Animated Style (when drops increase)
  const dropJumpStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: dropJumpScale.value }],
    };
  });

  const pauseOverlayMessage =
    pauseReason === 'connection'
      ? t('connectionLost')
      : pauseReason === 'inactivity'
        ? t('noPedalingDetected')
        : t('pausedHint');

  // Pulse Rings are now handled in CircularProgressRing.tsx component (GPU-only animations with interpolateColor)


  // SignalIndicator is rendered inside WorkoutStatsGrid

  // Calculate progress and bonus (using SharedValues via useAnimatedReaction)
  const [isOverachieved, setIsOverachieved] = useState(false);
  const [showBonus, setShowBonus] = useState(false);
  
  useAnimatedReaction(
    () => totalDropsShared.value,
    (drops) => {
      'worklet';
      // Segment-relative: overachieved when drops in current segment reach segment target
      const segmentDrops = Math.max(0, drops - sessionBaseShared.value);
      const overachieved = segmentDrops >= segmentTargetShared.value;
      const bonus = drops > 0 && Math.floor(drops) % 100 === 0;

      runOnJS(setIsOverachieved)(overachieved);
      runOnJS(setShowBonus)(bonus);
    },
    [totalDropsShared, sessionBaseShared, segmentTargetShared]
  );

  const progress = useDerivedValue(() => {
    return Math.min(totalDropsShared.value / gaugeTarget, 1);
  }, [totalDropsShared, gaugeTarget]);
  
  // CRITICAL: Convert SharedValue to JS value for CircularProgressRing, Progress Bar, and LiquidGauge using useState + useAnimatedReaction
  const [progressJS, setProgressJS] = useState(0);
  const [progressWidth, setProgressWidth] = useState('0%');
  const [liquidGaugeValue, setLiquidGaugeValue] = useState('0'); // JS state for LiquidGauge display value
  const [segmentTarget, setSegmentTarget] = useState(120); // JS mirror of segmentTargetShared for rendering
  const [sessionBase, setSessionBase] = useState(0); // JS mirror of sessionBaseShared for rendering

  // Progress bar uses segment-relative drops: resets at each session cap completion.
  // segmentTargetShared = min(sessionCap, dailyRemaining) for the current segment.
  useAnimatedReaction(
    () => totalDropsShared.value,
    (drops) => {
      'worklet';
      const segmentDrops = Math.max(0, drops - sessionBaseShared.value);
      const segProgress = Math.min(segmentDrops / Math.max(segmentTargetShared.value, 1), 1);
      const widthPercent = `${Math.min(segProgress * 100, 100)}%`;
      runOnJS(setProgressJS)(segProgress);
      runOnJS(setProgressWidth)(widthPercent);
    },
    [totalDropsShared, sessionBaseShared, segmentTargetShared]
  );
  
  // Sync segmentTargetShared and sessionBaseShared → JS state for goal row rendering
  useAnimatedReaction(
    () => segmentTargetShared.value,
    (value) => {
      'worklet';
      runOnJS(setSegmentTarget)(value);
    },
    [segmentTargetShared]
  );

  useAnimatedReaction(
    () => sessionBaseShared.value,
    (value) => {
      'worklet';
      runOnJS(setSessionBase)(value);
    },
    [sessionBaseShared]
  );

  // CRITICAL: Sync liquidGaugeDisplayValueShared to JS state for LiquidGauge value prop (avoid reading .value during render)
  useAnimatedReaction(
    () => liquidGaugeDisplayValueShared.value,
    (value) => {
      'worklet';
      runOnJS(setLiquidGaugeValue)(value);
    },
    [liquidGaugeDisplayValueShared]
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Gym background image */}
      {activeGym?.background_url && (
        <Image
          source={activeGym.background_url}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
          transition={200}
          pointerEvents="none"
        />
      )}
      {/* Contrast overlay:
          - iOS: real blur + dark tint
          - Android: translucent tint (no heavy black fallback) so gym bg remains visible */}
      {Platform.OS === 'ios' ? (
        <PlatformBlur intensity={30} style={StyleSheet.absoluteFill} tint="dark" pointerEvents="none">
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }]} />
        </PlatformBlur>
      ) : (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8,10,18,0.58)' }]} />
      )}

      {/* Header with Gym Info + Status Badges */}
      <View style={styles.header}>
        {/* Left column: vertical status badges */}
        <View style={styles.leftHeader}>
          {/* Happy Hour badge — pulsates, tappable */}
          {bleConnected && happyHour.active && (
            <TouchableOpacity
              onPress={() => showModal({
                title: t('happyHourBadge', { multiplier: happyHour.multiplier }),
                body: t('happyHourInfoBody', { multiplier: happyHour.multiplier }),
              })}
              activeOpacity={0.75}
            >
              <StatusBadge
                icon="flash"
                label={t('happyHourBadge', { multiplier: happyHour.multiplier })}
                color="#FFD700"
                pulse
              />
            </TouchableOpacity>
          )}

          {/* Tracking only badge */}
          {isTrackingOnly && bleConnected && (
            <TouchableOpacity
              onPress={() => showModal({
                title: t('trackingOnlyBadgeLabel'),
                body: t('trackingOnlyInfoBody'),
              })}
              activeOpacity={0.75}
            >
              <StatusBadge
                icon="water-outline"
                label={t('trackingOnlyBadgeLabel')}
                color="#93C5FD"
              />
            </TouchableOpacity>
          )}

          {/* Hard day cap badge */}
          {hardCapHitDuringSession && !isTrackingOnly && bleConnected && (
            <TouchableOpacity
              onPress={() => showModal({
                title: t('hardCapBadgeLabel'),
                body: t('hardDayCapReached'),
              })}
              activeOpacity={0.75}
            >
              <StatusBadge
                icon="calendar-outline"
                label={t('hardCapBadgeLabel')}
                color="#93C5FD"
              />
            </TouchableOpacity>
          )}

          {/* Reduced rate tier badge */}
          {sessionTier !== 'normal' && !isTrackingOnly && bleConnected && (
            <TouchableOpacity
              onPress={() => showModal({
                title: sessionTier === 'tier2' ? t('deepReduced') : t('reducedRate'),
                body: sessionTier === 'tier2' ? t('deepReducedMode') : t('thresholdReached'),
              })}
              activeOpacity={0.75}
            >
              <StatusBadge
                icon="trending-down-outline"
                label={sessionTier === 'tier2' ? t('deepReduced') : t('reducedRate')}
                color="#FDE68A"
              />
            </TouchableOpacity>
          )}

          {/* Activity proof pending badge — tappable for machine-specific help */}
          {awaitingActivityProof && !isPaused && bleConnected && (
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => showModal({
                title: t(`connectStart.${
                  machineType === 'bike' ? 'bike' :
                  machineType === 'treadmill' ? 'treadmill' :
                  machineType === 'elliptical' ? 'elliptical' :
                  machineType === 'stepper' ? 'stepper' : 'generic'
                }.title`),
                body: t(`connectStart.${
                  machineType === 'bike' ? 'bike' :
                  machineType === 'treadmill' ? 'treadmill' :
                  machineType === 'elliptical' ? 'elliptical' :
                  machineType === 'stepper' ? 'stepper' : 'generic'
                }.body`),
              })}
            >
              <StatusBadge
                icon="shield-checkmark-outline"
                label={t('provingActivity')}
                color="#FDE68A"
                pulse
              />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.headerRight}>
          {/* Challenges Overlay Button */}
          {challenges.length > 0 && (
            <TouchableOpacity
              onPress={() => setShowChallengesOverlay(true)}
              style={[styles.challengesButton, { backgroundColor: branding.primaryLight }]}
              activeOpacity={0.7}
            >
              <Ionicons name="trophy" size={20} color={branding.primary} />
              {challenges.filter((c) => !c.is_completed).length > 0 && (
                <View style={[styles.challengesBadge, { backgroundColor: branding.primary }]}>
                  <Text style={[styles.challengesBadgeText, { color: branding.onPrimary }]}>
                    {challenges.filter((c) => !c.is_completed).length}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          )}
          <View style={styles.headerDrops}>
            <Ionicons name="water" size={20} color={theme.colors.primary} />
            <AnimatedText 
              text={animatedDropsText}
              style={[styles.headerDropsText, getNumberStyle(18), { color: theme.colors.primary }]}
            />
          </View>
        </View>
      </View>

      {/* Bonus Banner */}
      {showBonus && (
        <Animated.View style={[
          styles.bonusBanner, 
          splashStyle,
          {
            backgroundColor: branding.primaryLight,
            borderColor: branding.primary,
          }
        ]}>
          <Text style={styles.bonusText}>
            +100 <Ionicons name="water" size={16} color={theme.colors.primary} /> {t('dropsBonus')}
          </Text>
        </Animated.View>
      )}

      {/* Active Challenges Overlay */}
      {showChallengesOverlay && session?.gym_id && (
        <ActiveChallengesOverlay
          challenges={challenges}
          gymId={session.gym_id}
          onClose={() => setShowChallengesOverlay(false)}
        />
      )}

      {/* Main Water Circle with Progress Ring */}
      <View style={styles.waterContainer}>
        {/* Radial gradient background behind gauge (back-lit effect) */}
        <View style={styles.gaugeBackgroundGlow} />

        <View style={styles.circleWrapper}>
          {/* Connecting state: pulsing circle with machine-specific instructions.
              Shows icon + "Start pedaling to connect..." + machine name. */}
          {!bleConnected && (machineId || session?.machine_id) && (sensorId || (session?.machine as any)?.ble_device_name || (session?.machine as any)?.sensor_id) && (
            <Animated.View
              style={[
                styles.connectingCircle,
                connectingPulseStyle,
                {
                  borderColor: branding.primary + '50',
                  shadowColor: branding.primary,
                },
              ]}
            >
              <Ionicons
                name={
                  machineType === 'bike' ? 'bicycle-outline' :
                  machineType === 'treadmill' ? 'walk-outline' :
                  machineType === 'elliptical' ? 'fitness-outline' :
                  machineType === 'stepper' ? 'trending-up-outline' :
                  'bluetooth-outline'
                }
                size={36}
                color={branding.primary}
                style={{ marginBottom: 12, opacity: 0.9 }}
              />
              <Text style={styles.connectingText}>
                {t(`connectStart.${
                  machineType === 'bike' ? 'bike' :
                  machineType === 'treadmill' ? 'treadmill' :
                  machineType === 'elliptical' ? 'elliptical' :
                  machineType === 'stepper' ? 'stepper' : 'generic'
                }.title`)}
              </Text>
              {session?.machine?.name && (
                <Text style={styles.connectingSubtext}>
                  {t('connectingTitleNamed', { name: session.machine.name })}
                </Text>
              )}
            </Animated.View>
          )}

          {/* Pulse Rings are now rendered inside CircularProgressRing.tsx component */}

          {/* Explosion Animation: Triggered when BLE connects */}
          {bleConnected && (
            <Animated.View
              style={[
                styles.explosionCircle,
                explosionStyle,
                {
                  borderColor: branding.primary,
                  shadowColor: branding.primary,
                },
              ]}
            />
          )}


          {/* LiquidGauge Component - Only show when BLE connected and cap not hit */}
          {/* Render LiquidGauge FIRST so it's below CircularProgressRing */}
          {bleConnected && !isTrackingOnly && !hardCapHitDuringSession && (
            <>
              {/* Premium UI: Advanced LiquidGauge with Damping Effect */}
              {/* LiquidGauge follows rawRPM via smoothedRPMShared (already has damping from smoothing chain) */}
              {/* This creates realistic liquid bubbling effect as you pedal */}
              {/* dropJumpScale animates ONLY the center number, not the liquid itself */}
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
            </>
          )}

          {/* Circular Progress Ring - Only show when BLE connected and cap not hit */}
          {/* Render AFTER LiquidGauge so it's on top */}
          {bleConnected && !isTrackingOnly && !hardCapHitDuringSession && (
            <CircularProgressRing
              progress={progressJS}
              size={290}
              strokeWidth={3}
              rpm={ringIntensityShared}
              primaryColor={branding.primary}
            />
          )}

          {/* Daily limit reached state — replaces gauge when cap hit (DB or live) */}
          {bleConnected && (isTrackingOnly || hardCapHitDuringSession) && (
            <View style={styles.trackingOnlyCircle}>
              <View style={styles.trackingOnlyInner}>
                <Ionicons name="checkmark-circle" size={44} color="#4CD964" style={{ marginBottom: 10 }} />
                <Text style={styles.trackingOnlyHeading}>{t('dailyGoalReached')}</Text>
                <Text style={styles.trackingOnlySubtext}>{t('workoutTracked')}</Text>
              </View>
            </View>
          )}

          {/* DROPS Label - Only show when earning drops */}
          {bleConnected && !isTrackingOnly && !hardCapHitDuringSession && (
            <View style={styles.dropsLabelContainer}>
              <Text style={styles.dropsLabel}>{t('drops')}</Text>
              {isOverachieved && (
                <Text style={styles.overachievedText}>{t('overachieved')}</Text>
              )}
            </View>
          )}

          {/* Premium DropEmitter - Zero-Lag Optimized (no Skia per drop) */}
          {bleConnected && !isTrackingOnly && !hardCapHitDuringSession && (
            <DropEmitter
              drops={activeDrops}
              containerSize={280}
              onImpact={(x, y) => {
                liquidGaugeRef.current?.triggerImpact();
              }}
              onDropComplete={(dropId) => {
                setActiveDrops((prev) => prev.filter((drop) => drop.id !== dropId));
              }}
            />
          )}

          {/* Activity proof overlay: BLE connected but machine not started yet.
              MUST be last child so it renders on top of LiquidGauge, CircularProgressRing,
              and DROPS label (React Native stacks later siblings on top).
              Appears 600ms after connect (lets explosion animation play first)
              and fades out the moment first RPM > 0 is detected. */}
          {awaitingActivityProof && bleConnected && !isPaused && (
            <Animated.View
              entering={FadeIn.delay(600).duration(400)}
              exiting={FadeOut.duration(300)}
              style={[
                styles.connectingCircle,
                { borderColor: branding.primary + '50', backgroundColor: 'rgba(6,8,20,0.96)' },
              ]}
              pointerEvents="none"
            >
              <Ionicons
                name={
                  machineType === 'bike' ? 'bicycle-outline' :
                  machineType === 'treadmill' ? 'walk-outline' :
                  machineType === 'elliptical' ? 'fitness-outline' :
                  machineType === 'stepper' ? 'trending-up-outline' :
                  'fitness-outline'
                }
                size={36}
                color={branding.primary}
                style={{ marginBottom: 12, opacity: 0.95 }}
              />
              <Text style={[styles.connectingText, { color: branding.primary }]}>
                {t(`connectStart.${
                  machineType === 'bike' ? 'bike' :
                  machineType === 'treadmill' ? 'treadmill' :
                  machineType === 'elliptical' ? 'elliptical' :
                  machineType === 'stepper' ? 'stepper' : 'generic'
                }.title`)}
              </Text>
              <Text style={styles.connectingSubtext}>
                {t(`connectStart.${
                  machineType === 'bike' ? 'bike' :
                  machineType === 'treadmill' ? 'treadmill' :
                  machineType === 'elliptical' ? 'elliptical' :
                  machineType === 'stepper' ? 'stepper' : 'generic'
                }.body`)}
              </Text>
            </Animated.View>
          )}

        </View>
      </View>

      {/* Stats Grid */}
      <WorkoutStatsGrid
        machineType={machineType ?? ''}
        duration={duration}
        bleConnected={bleConnected}
        signalStatus={signalStatus}
        hasSensor={!!(sensorId || (session?.machine as any)?.ble_device_name || (session?.machine as any)?.sensor_id)}
        animatedRPMText={animatedRPMText}
        animatedCaloriesText={animatedCaloriesText}
        animatedPaceText={animatedPaceText}
        animatedSpeedText={animatedSpeedText}
        animatedDistanceText={animatedDistanceText}
        animatedInclineText={animatedInclineText}
        rpmPulseStyle={rpmPulseStyle}
        rpmTextColorStyle={rpmTextColorStyle}
        distanceUnitLabel={ftmsTotalDistanceRef.current >= 1000 ? 'km' : 'm'}
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

      {/* Progress Bar + Goal Row */}
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

      {/* Tier / daily-cap notification banner — fades in below progress bar */}
      {!!tierToast && (
        <Animated.View
          entering={FadeInDown.duration(300)}
          style={styles.tierBanner}
        >
          <Ionicons
            name={hardCapHitDuringSession ? 'alert-circle-outline' : 'information-circle-outline'}
            size={14}
            color={hardCapHitDuringSession ? '#FDE68A' : 'rgba(255,255,255,0.70)'}
          />
          <Text style={[
            styles.tierBannerText,
            hardCapHitDuringSession && { color: '#FDE68A' },
          ]}>
            {tierToast}
          </Text>
        </Animated.View>
      )}

      {/* Inactivity warning countdown (blocking) */}
      {showInactivityWarning && !isPaused && (
        <Animated.View style={[styles.inactivityOverlay, pausedOverlayStyle]}>
          <Ionicons name="alert-circle-outline" size={52} color={theme.colors.warning || '#F59E0B'} />
          <Text style={styles.inactivityTitle}>{t('inactivityWarningTitle')}</Text>
          <Text style={styles.inactivityText}>
            {t('inactivityWarningCountdown', { seconds: inactivityCountdownSec })}
          </Text>
          <Text style={styles.inactivityHint}>{t('inactivityResumePrompt')}</Text>
        </Animated.View>
      )}

      {/* Anti-piggyback cancellation overlay (non-blocking alert replacement) */}
      {showNoActivityCancelOverlay && (
        <Animated.View style={[styles.noActivityCancelOverlay, pausedOverlayStyle]}>
          <Ionicons name="shield-outline" size={52} color="#EF4444" />
          <Text style={styles.noActivityCancelTitle}>{t('activityNotDetectedTitle')}</Text>
          <Text style={styles.noActivityCancelText}>{t('activityNotDetectedBody')}</Text>
          <TouchableOpacity
            style={styles.noActivityCancelButton}
            onPress={() => {
              setShowNoActivityCancelOverlay(false);
              router.replace('/scan');
            }}
            activeOpacity={0.85}
          >
            <Ionicons name="qr-code-outline" size={18} color={theme.colors.background} />
            <Text style={styles.noActivityCancelButtonText}>{t('common:ok')}</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Paused Overlay — always shows both Resume and End workout so the
          user is never stranded. For connection pauses the End button reads
          "Save what I've got" (drops are credited); for manual/inactivity
          pauses it reads "End workout". */}
      {isPaused && (
        <Animated.View style={[styles.pausedOverlay, pausedOverlayStyle]}>
          <Ionicons
            name={pauseReason === 'connection' ? 'bluetooth-outline' : 'pause-circle-outline'}
            size={48}
            color={theme.colors.text}
          />
          <Text style={styles.pausedText}>
            {pauseReason === 'connection' ? t('connectionLostTitle') : t('paused')}
          </Text>
          <Text style={styles.pausedSubtext}>
            {pauseReason === 'connection' ? t('connectionLostBody') : pauseOverlayMessage}
          </Text>
          {pauseReason === 'connection' && duration > 0 && (
            <Text style={[styles.pausedSubtext, { marginTop: 0, marginBottom: 8 }]}>
              {t('connectionAutoFinishExplain', { duration: formatTime(duration) })}
            </Text>
          )}

          {/* Resume button */}
          <TouchableOpacity
            style={[styles.resumeOverlayButton, isResumingFromPause && styles.resumeOverlayButtonDisabled]}
            onPress={() => {
              void resumeWorkout();
            }}
            disabled={isResumingFromPause}
            activeOpacity={0.85}
          >
            {isResumingFromPause ? (
              <ActivityIndicator size="small" color={theme.colors.background} />
            ) : (
              <>
                <Ionicons name="play" size={18} color={theme.colors.background} />
                <Text style={styles.resumeOverlayButtonText}>
                  {pauseReason === 'connection'
                    ? t('connectionLostKeepTryingAction')
                    : t('resume')}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* End workout — ALWAYS visible on every pause type */}
          <TouchableOpacity
            style={[
              styles.resumeOverlayButton,
              { marginTop: 10, backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.colors.error + '88' },
            ]}
            onPress={() => handleFinishWorkout()}
            activeOpacity={0.85}
          >
            <Ionicons name="stop-circle-outline" size={18} color={theme.colors.error} />
            <Text style={[styles.resumeOverlayButtonText, { color: theme.colors.error }]}>
              {pauseReason === 'connection' && duration > 0
                ? t('connectionLostSaveAction')
                : t('endWorkout')}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Auto-Pause Warning Overlay (when RPM = 0 for 10+ seconds) */}
      {showAutoPauseOverlay && !isPaused && (sensorId || (session?.machine as any)?.ble_device_name || (session?.machine as any)?.sensor_id) && (
        <Animated.View style={[styles.autoPauseOverlay, pausedOverlayStyle]} pointerEvents="none">
          <Ionicons name="warning-outline" size={48} color={theme.colors.warning || '#FFA500'} />
          <Text style={styles.autoPauseTitle}>{t('sensorNotSending')}</Text>
          <Text style={styles.autoPauseText}>
            {t('autoPauseWarning')}
          </Text>
        </Animated.View>
      )}

      

      {/* BLE initial-connect escape hatch — appears after 60s timeout.
          Positioned as a subtle link below the gauge area so it doesn't
          steal focus but is always reachable. */}
      {!showNoActivityCancelOverlay && !isPaused && !bleConnected && session?.machine_id && (sensorId || (session?.machine as any)?.ble_device_name || (session?.machine as any)?.sensor_id) && showConnectingCancel && (
        <TouchableOpacity
          style={styles.connectingCancelLink}
          onPress={() => handleFinishWorkout()}
          activeOpacity={0.75}
        >
          <Ionicons name="close-circle-outline" size={16} color={theme.colors.error} />
          <Text style={styles.connectingCancelLinkText}>
            {duration > 0 ? t('cantConnectFinish') : t('cancelWorkout')}
          </Text>
        </TouchableOpacity>
      )}

      {/* Control Buttons */}
      <WorkoutControls
        isPaused={isPaused}
        onPauseResume={() => {
          if (isPaused) {
            void resumeWorkout();
          } else {
            pauseWorkout();
          }
        }}
        onFinishPressIn={handleFinishPressIn}
        onFinishPressOut={handleFinishPressOut}
        finishButtonStyle={finishButtonStyle}
        finishWorkoutLabel={t('finishWorkout')}
        primaryColor={branding.primary}
      />

      {isFinishing && (
        <View style={styles.finishingOverlay}>
          <ActivityIndicator size="large" color={brandingHook.primary} />
          <Text style={styles.finishingOverlayText}>{t('savingWorkout')}</Text>
        </View>
      )}

      {/* Step 1: machine off / sensor not in range — don't enter reconnect loop */}
      {showMachineNotInRangeOverlay && (
        <MachineNotInRangeOverlay
          primaryColor={branding.primary}
          machineType={paramMachineType ?? session?.machine?.type ?? null}
          onEndAndRescan={() => {
            setShowMachineNotInRangeOverlay(false);
            void handleFinishWorkout();
          }}
        />
      )}

      {/* Step 3: mid-session peripheral mismatch safety brake */}
      {showPeripheralMismatchModal && (
        <PeripheralMismatchModal
          primaryColor={branding.primary}
          onAcknowledge={() => {
            setShowPeripheralMismatchModal(false);
            void handleFinishWorkout();
          }}
        />
      )}
    </SafeAreaView>
  );
}

