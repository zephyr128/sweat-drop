import { View, Text, StyleSheet, TouchableOpacity, Alert, Pressable, ActivityIndicator, AppState, AppStateStatus, ImageBackground } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
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
  SharedValue,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { theme, getNumberStyle, fontStyles } from '@/lib/theme';
import LiquidGauge, { LiquidGaugeRef } from '@/components/LiquidGauge';
import { DropEmitter } from '@/components/DropEmitter';
import CircularProgressRing from '@/components/CircularProgressRing';
import GoalTracker from '@/components/GoalTracker';
import WorkoutSummaryModal from '@/components/WorkoutSummaryModal';
import { useChallengeProgress } from '@/hooks/useChallengeProgress';
import { bleService, CSCMeasurement } from '@/lib/ble-service';
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
import { estimateLiveDropsDetailed, type DropHistoryContext, type DropLimitsConfig, type StreakContext, type RewardedSessionsCapMode, type SessionTier, type MachineDropConfig } from '@/lib/workout/live-drops-estimator';
import { useDropLimitStatus } from '@/hooks/useDropLimitStatus';
import { log } from '@/lib/logger';

// ActiveDrop interface removed - drops are now managed internally by DropEmitter

// Native-driven text component that displays SharedValue<string> with minimal re-renders
// GPU-Only Text Display: Uses useAnimatedProps for native-driven updates (no JS thread blocking)
// NO useState, NO runOnJS - pure GPU animation
// ============================================================================
// PREMIUM UI: Optimized AnimatedText Component (60FPS Guaranteed)
// ============================================================================
// Native-driven text component that displays SharedValue<string> with minimal re-renders
// GPU-Only Text Display: Uses useAnimatedProps for native-driven updates (no JS thread blocking)
// NO useState, NO runOnJS - pure GPU animation for 60FPS performance
// Critical for high-frequency updates (RPM, drops, calories) without blocking UI thread
const AnimatedText = ({ text, style }: { text: SharedValue<string>; style?: any }) => {
  // CRITICAL: Read SharedValue through useAnimatedReaction to update state
  // This ensures text updates work correctly with Animated.Text
  const [displayText, setDisplayText] = useState(text.value);

  useAnimatedReaction(
    () => text.value,
    (value) => {
      'worklet';
      runOnJS(setDisplayText)(value);
    },
    [text]
  );

  return (
    <Animated.Text style={style}>
      {displayText}
    </Animated.Text>
  );
};

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

  const { sessionId, equipmentId, gymId, machineType: paramMachineType, sensorId, planId, machineId, bleProtocol } = useLocalSearchParams<{
    sessionId?: string;
    equipmentId?: string;
    gymId?: string;
    machineType?: string;
    sensorId?: string;
    planId?: string;
    machineId?: string;
    bleProtocol?: string;
  }>();
  const { branding, activeGym } = useTheme();
  const brandingHook = useBranding();
  const { t } = useTranslation('workout');
  const dropLimit = useDropLimitStatus(gymId || null);
  const isTrackingOnly = dropLimit.limitReached;
  const [session, setSession] = useState<any>(null);
  // REMOVED: drops, displayDrops, earnedDrops, activeDrops, rpm, smoothedRPM - now using SharedValues
  const [duration, setDuration] = useState(0);
  const [calories, setCalories] = useState(0);
  // REMOVED: pace useState - now using animatedPaceText SharedValue
  const [targetDrops, setTargetDrops] = useState(120);
  const [sessionTier, setSessionTier] = useState<SessionTier>('normal');
  const [dailyRemaining, setDailyRemaining] = useState<number>(300);
  const [hardCapHitDuringSession, setHardCapHitDuringSession] = useState(false);
  const tier1ShownRef = useRef(false);
  const tier2ShownRef = useRef(false);
  const [tierToast, setTierToast] = useState<string | null>(null);
  const tierToastTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [pausedTime, setPausedTime] = useState<Date | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [pauseReason, setPauseReason] = useState<'manual' | 'inactivity' | 'connection'>('manual');
  // REMOVED: challengeMessage state - challenge completions are now shown in session summary
  // Challenge progress is automatically updated via award_drops() when workout ends
  const [averageRPM, setAverageRPM] = useState<number>(0); // Average RPM for database sync (low frequency, OK to use state)
  const [showAutoPauseOverlay, setShowAutoPauseOverlay] = useState(false);
  const [showSensorAsleep, setShowSensorAsleep] = useState(false);
  const [showInactivityWarning, setShowInactivityWarning] = useState(false);
  const [inactivityCountdownSec, setInactivityCountdownSec] = useState(0);
  const [showNoActivityCancelOverlay, setShowNoActivityCancelOverlay] = useState(false);
  const [showPlanCompleted, setShowPlanCompleted] = useState(false);
  const [showWorkoutSummary, setShowWorkoutSummary] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [showChallengesOverlay, setShowChallengesOverlay] = useState(false);
  const [reconnectTrigger, setReconnectTrigger] = useState(0); // Increment to force BLE useEffect re-run after reconnect
  const reconnectAttemptRef = useRef<number>(0); // Track reconnect attempts for exponential backoff
  const isPausedRef = useRef(false); // Stable ref for BLE callbacks (avoids stale closures & dep array issues)
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastCrankRevolutionsForAutoResumeRef = useRef<number>(0); // Track for auto-resume
  const [bleConnected, setBleConnected] = useState(false);
  const [bleStatus, setBleStatus] = useState<string>('');
  const [isResumingFromPause, setIsResumingFromPause] = useState(false);
  const [signalStatus, setSignalStatus] = useState<'ok' | 'lost'>('ok');
  const [awaitingActivityProof, setAwaitingActivityProof] = useState(false);
  const router = useRouter();
  const { session: authSession } = useSession();
  const liquidGaugeRef = useRef<LiquidGaugeRef>(null);
  // DropEmitter now uses drops prop instead of imperative API
  const [activeDrops, setActiveDrops] = useState<Array<{ id: string; startX: number; progress: number }>>([]);
  const isMountedRef = useRef<boolean>(true); // Track if component is mounted
  const isAppInBackgroundRef = useRef<boolean>(false); // Track app foreground/background state
  const lastHapticTimeRef = useRef<number>(0); // Throttle haptic feedback (max 5/s)
  // saveIntervalRef removed — syncIntervalRef is the single DB sync mechanism
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  // REMOVED: challengeUpdateIntervalRef, lastChallengeUpdateRef, challengeMessageTimerRef
  // Challenge progress is now automatically updated via award_drops() when workout ends
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
  const lastRPMUpdateRef = useRef<number>(0);
  // BLE Data Optimization: Track last measurement to filter duplicates
  const lastMeasurementRef = useRef<{ crankRevolutions: number; lastCrankEventTime: number } | null>(null);
  // Drop calculation: Track last crank revolutions for drop calculation
  const lastCrankRevolutionsRef = useRef<number>(0);
  const dropLimitsRef = useRef<DropLimitsConfig>({
    maxDropsPerSession: 120,
    maxRewardedSessionsPerDay: 4,
    maxDropsPerDay: 300,
    maxDropsPerWeek: 1500,
    rewardedSessionsCapMode: 'soft',
  });
  const dropHistoryRef = useRef<DropHistoryContext>({
    rewardedSessionsToday: 0,
    mintedToday: 0,
    mintedWeek: 0,
  });
  const streakContextRef = useRef<StreakContext>({
    streakDays: 0,
    lastVisitDate: null,
  });
  const machineConfigRef = useRef<MachineDropConfig | null>(null);
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
  const treadmillDropAccRef = useRef<number>(0);
  const treadmillCalAccRef = useRef<number>(0); // Fractional calorie accumulator for treadmill
  const treadmillLastMeasureTimeRef = useRef<number>(0); // For speed-based distance and calorie accumulation
  // Throttled sync: Track last sync time
  const lastSyncRef = useRef<number>(0);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeProgressIntervalRef = useRef<NodeJS.Timeout | null>(null); // Ref for time-based progress interval (critical for cleanup)
  // CRITICAL: Refs for BLE callback to avoid stale closures
  const currentPlanItemRef = useRef<any>(null); // Always has latest currentPlanItem value
  const isSmartCoachModeRef = useRef<boolean>(false); // Always has latest isSmartCoachMode value
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
  
  // SmartCoach SharedValues
  const goalTargetShared = useSharedValue(0); // Target value (RPM, time, reps, etc.)
  const currentProgressShared = useSharedValue(0); // Current progress towards goal
  const goalPercentageShared = useSharedValue(0); // Progress percentage (0-100)
  const exerciseCompletedShared = useSharedValue(0); // 0=not done, 1=done (UI-thread safe, avoids EXC_BAD_ACCESS from ref in worklet)
  const durationShared = useSharedValue(0); // Duration in seconds for time-based goals
  const [isSmartCoachMode, setIsSmartCoachMode] = useState(false);
  const [currentPlanItem, setCurrentPlanItem] = useState<any>(null);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [isPlanCompleted, setIsPlanCompleted] = useState(false); // Guard flag to prevent crashes at plan end
  const isPlanCompletedRef = useRef(false); // Ref for useFrameCallback guard
  const isPlanCompletedShared = useSharedValue(0); // SharedValue for useFrameCallback guard (0=false, 1=true)
  
  // Sync duration state to durationShared for SmartCoach time tracking
  useEffect(() => {
    durationShared.value = duration;
  }, [duration, durationShared]);

  // CRITICAL: Sync refs and SharedValue with state to prevent stale closures in BLE callback and useFrameCallback
  useEffect(() => {
    isPlanCompletedRef.current = isPlanCompleted;
    isPlanCompletedShared.value = isPlanCompleted ? 1 : 0;
  }, [isPlanCompleted, isPlanCompletedShared]);
  
  useEffect(() => {
    currentPlanItemRef.current = currentPlanItem;
  }, [currentPlanItem]);

  useEffect(() => {
    isSmartCoachModeRef.current = isSmartCoachMode;
  }, [isSmartCoachMode]);

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

  useEffect(() => {
    bleConnectedShared.value = bleConnected ? 1 : 0;
  }, [bleConnected, bleConnectedShared]);

  // AppState listener: Track background state; keep BLE + data processing alive
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        isAppInBackgroundRef.current = true;
        log.debug('[Workout] App went to background — BLE + drops continue, UI paused');
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
        log.debug('[Workout] App came to foreground — UI resumed');
      }
    });

    return () => {
      subscription.remove();
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
      cancelAnimation(goalPercentageShared);
      cancelAnimation(currentProgressShared);

      if (tierToastTimerRef.current) { clearTimeout(tierToastTimerRef.current); tierToastTimerRef.current = null; }
      if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
      if (activityProofTimerRef.current) { clearTimeout(activityProofTimerRef.current); activityProofTimerRef.current = null; }
      if (autoPauseTimerRef.current) { clearTimeout(autoPauseTimerRef.current); autoPauseTimerRef.current = null; }
      if (autoZeroTimerRef.current) { clearTimeout(autoZeroTimerRef.current); autoZeroTimerRef.current = null; }
      if (idleSyncTimerRef.current) { clearTimeout(idleSyncTimerRef.current); idleSyncTimerRef.current = null; }
      if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
      if (heartbeatIntervalRef.current) { clearInterval(heartbeatIntervalRef.current); heartbeatIntervalRef.current = null; }
      if (syncIntervalRef.current) { clearInterval(syncIntervalRef.current); syncIntervalRef.current = null; }
      if (timeProgressIntervalRef.current) { clearInterval(timeProgressIntervalRef.current); timeProgressIntervalRef.current = null; }
    };
  }, []);

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

  // SmartCoach: Load plan item when planId and machineId are available
  useEffect(() => {
    const loadPlanItem = async () => {
      // Use machineId from params first, then fallback to session.machine_id
      const activeMachineId = machineId || session?.machine_id;
      
      if (!planId || !activeMachineId || !authSession?.user) {
        setIsSmartCoachMode(false);
        setCurrentPlanItem(null);
        return;
      }

      // AGENT NOTE: [2025-01-27] - mobile-coder
      // Check if SmartCoach is enabled for the gym before loading plan item
      // If gym doesn't have smartcoach_enabled, disable SmartCoach mode
      const activeGymId = gymId || session?.gym_id;
      if (activeGymId) {
        // Check if gym has smartcoach_enabled
        // If session.gym is already loaded, use it; otherwise fetch gym data
        let gymSmartCoachEnabled = session?.gym?.smartcoach_enabled;
        
        // If gym data not in session, fetch it
        if (gymSmartCoachEnabled === undefined) {
          const { data: gymData } = await supabase
            .from('gyms')
            .select('smartcoach_enabled')
            .eq('id', activeGymId)
            .single();
          
          gymSmartCoachEnabled = gymData?.smartcoach_enabled ?? false;
        }

        // If SmartCoach is disabled for this gym, don't load plan item
        if (!gymSmartCoachEnabled) {
          log.debug('[SmartCoach] SmartCoach is disabled for this gym, skipping plan load');
          setIsSmartCoachMode(false);
          setCurrentPlanItem(null);
          return;
        }
      }

      try {
        log.debug('[SmartCoach] Loading plan item for planId:', planId, 'machineId:', activeMachineId, 'index:', currentExerciseIndex);
        
        const { data, error } = await supabase.rpc('get_plan_item_for_machine', {
          p_plan_id: planId,
          p_machine_id: activeMachineId,
          p_current_index: currentExerciseIndex,
        });

        if (error) {
          log.error('[SmartCoach] Error loading plan item:', error);
          setIsSmartCoachMode(false);
          setCurrentPlanItem(null);
          return;
        }

        // CRITICAL GUARD: Only set currentPlanItem if plan is not completed
        // This prevents useEffect from overwriting currentPlanItem with null during completion
        if (isPlanCompleted) {
          log.debug('[SmartCoach] Plan already completed, skipping loadPlanItem');
          return;
        }

        if (data && data.length > 0) {
          const item = data[0];
          log.debug('[SmartCoach] Loaded plan item:', item);
          
          setCurrentPlanItem(item);
          setIsSmartCoachMode(true);
          
          // CRITICAL: Reset isPlanCompleted when loading a new plan item
          setIsPlanCompleted(false);
          
          // Set target based on metric type
          const targetValue = parseFloat(item.target_value);
          const targetUnit = item.target_unit?.toLowerCase() || '';
          
          // For time-based goals, convert to seconds if needed
          let targetInSeconds = targetValue;
          if (item.target_metric === 'time' && (targetUnit.includes('min') || targetUnit.includes('minute'))) {
            targetInSeconds = targetValue * 60;
          }
          
          // Safely update SharedValues only if component is mounted
          if (isMountedRef.current) {
            goalTargetShared.value = targetInSeconds; // Store target in seconds for time-based goals
            currentProgressShared.value = 0;
            goalPercentageShared.value = 0;
            exerciseCompletedShared.value = 0;
          }
          setExerciseCompleted(false);
          // CRITICAL: Reset isPlanCompleted flag when loading new exercise (prevents stale state)
          setIsPlanCompleted(false);
        } else {
          log.debug('[SmartCoach] No plan item found for current index - plan may be completed');
          // CRITICAL: Only set currentPlanItem to null if plan is not already marked as completed
          // This prevents race condition where handleNextExercise already set isPlanCompleted=true
          if (!isPlanCompleted) {
            setIsSmartCoachMode(false);
            setCurrentPlanItem(null);
          }
        }
      } catch (err) {
        log.error('[SmartCoach] Error in loadPlanItem:', err);
        setIsSmartCoachMode(false);
        setCurrentPlanItem(null);
      }
    };

    loadPlanItem();
  }, [planId, machineId, session?.machine_id, currentExerciseIndex, authSession?.user, gymId, session?.gym_id, session?.gym?.smartcoach_enabled]);

  // BLE Monitoring - REQUIRED to start workout
  // CRITICAL: isPaused removed from guard & dep array — pausing should NOT kill BLE connection.
  // isPaused is read via isPausedRef.current inside BLE callbacks.
  useEffect(() => {
    // Use sensorId from params or from session.machine
    const activeSensorId = sensorId || session?.machine?.sensor_id;
    
    if (!session?.machine_id || !activeSensorId) {
      setBleConnected(false);
      return;
    }
    let isMonitoring = false;

    const startBLEMonitoring = async () => {
      try {
        log.debug('[Workout] Connecting to BLE sensor:', activeSensorId);
        
        // AGENT NOTE: [2026-03-02] - mobile-coder (Task 3.4c)
        // Set BLE protocol from machine data if available (skip auto-detection)
        const machineProtocol = bleProtocol || session?.machine?.ble_protocol;
        if (machineProtocol === 'ftms') {
          const ftmsMachineType = (paramMachineType || session?.machine?.type) as 'treadmill' | 'bike' | 'elliptical' | undefined;
          bleService.setProtocol('ftms', ftmsMachineType || 'bike');
          ftmsProtocolActiveRef.current = true;
        } else if (machineProtocol === 'magene' || machineProtocol === 'ksfit') {
          bleService.setProtocol('csc');
          ftmsProtocolActiveRef.current = false;
        }
        // else: auto-detect (default behavior)
        
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
        
        try {
          const connected = await bleService.connectToDevice(activeSensorId);
          
          if (!connected) {
            throw new Error('Connection returned false');
          }
        } catch (connectError: any) {
          log.error('[Workout] BLE connection error:', connectError);
          setBleConnected(false);
          
          // Unlock machine if connection fails
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

        // Verify session ownership function for reconnect
        const verifySessionOwnership = async (): Promise<boolean> => {
          if (!session?.machine_id || !authSession?.user) {
            return false;
          }

          try {
            const { data: machineData } = await supabase
              .from('machines')
              .select('is_busy, current_user_id')
              .eq('id', session.machine_id)
              .single();

            return machineData?.is_busy === true && machineData?.current_user_id === authSession.user.id;
          } catch (error) {
            log.error('[Workout] Error verifying session ownership:', error);
            return false;
          }
        };

        // Start monitoring CSC measurements with sleep detection and reconnect
        await bleService.startMonitoring(
          async (measurement: CSCMeasurement) => {
            const now = Date.now();
            
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
            
            // PRO-FITNESS: Auto-Resume - if crankRevolutions started growing again, auto-resume
            if (currentRevolutions > lastCrankRevolutionsForAutoResumeRef.current && isPausedRef.current && isMountedRef.current) {
              // Crank started moving - auto-resume
              // Battery Optimization: No logging in measurement callback
              runOnJS(setIsPaused)(false);
              runOnJS(setShowAutoPauseOverlay)(false);
              runOnJS(setShowSensorAsleep)(false);
            }
            lastCrankRevolutionsForAutoResumeRef.current = currentRevolutions;
            
            if (currentRevolutions > 0) {
              // Initialize on first measurement
              if (lastRevolutions === 0) {
                lastCrankRevolutionsRef.current = currentRevolutions;
                lastStepDetectionRef.current = now;
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

                // Keep cadence/revolution tracking for pace/calorie logic. Drops are estimated
                // from server-equivalent tokenomics rules in a separate timer effect.
                if (currentMachineType === 'bike') {
                  totalCrankRevolutionsShared.value = totalCrankRevolutionsShared.value + revolutionDelta;
                }

                lastCrankRevolutionsRef.current = currentRevolutions;
                lastStepDetectionRef.current = now;
              }
            }
            
            // Update last RPM in database (every 30 seconds)
            if (session?.machine_id && authSession?.user && measurement.rpm > 0) {
              const now = Date.now();
              if (!lastRPMUpdateRef.current || now - lastRPMUpdateRef.current > 30000) {
                try {
                  await supabase.rpc('update_machine_rpm', {
                    p_machine_id: session.machine_id,
                    p_user_id: authSession.user.id,
                    p_rpm: measurement.rpm,
                  });
                  lastRPMUpdateRef.current = now;
                } catch (error) {
                  log.error('[Workout] Failed to update RPM:', error);
                }
              }
            }
            // EXC_BAD_ACCESS fix: after async await, skip rest if unmounted
            if (!isMountedRef.current) return;
            
            // SmartCoach: Update progress if in SmartCoach mode
            // CRITICAL: Only update for RPM and reps here. Time-based goals are handled by interval.
            // CRITICAL FIX: Use refs to avoid stale closures in BLE callback
            if (isSmartCoachModeRef.current && currentPlanItemRef.current && !isPaused && isMountedRef.current) {
              const targetMetric = currentPlanItemRef.current.target_metric;
              const targetValue = parseFloat(currentPlanItemRef.current.target_value);
              
              // Skip time-based goals - they're handled by interval in useEffect
              if (targetMetric === 'time') {
                // Time-based progress is updated by interval, not here
                // This prevents race conditions and ensures consistent updates
                return;
              }
              
              if (targetMetric === 'rpm') {
                // For RPM, track average RPM over time
                // Progress is based on maintaining target RPM for a duration
                const currentRPM = smoothedRPMShared.value;
                if (currentRPM >= targetValue * 0.9) { // Within 90% of target
                  // Increment progress (1% per second at target RPM)
                  if (isMountedRef.current) {
                    currentProgressShared.value = Math.min(
                      currentProgressShared.value + (1 / 60), // 1% per second
                      targetValue
                    );
                  }
                }
              } else if (targetMetric === 'reps') {
                // For reps, track number of revolutions
                const currentRevolutions = measurement.crankRevolutions;
                const lastRevolutions = lastCrankRevolutionsRef.current;
                if (currentRevolutions > lastRevolutions && isMountedRef.current) {
                  const delta = currentRevolutions - lastRevolutions;
                  currentProgressShared.value = Math.min(
                    currentProgressShared.value + delta,
                    targetValue
                  );
                }
              }
              
              // Calculate percentage (only for RPM and reps)
              // CRITICAL: Only update if component is still mounted to prevent EXC_BAD_ACCESS
              if (isMountedRef.current && targetMetric !== 'time') {
                try {
                  const percentage = (currentProgressShared.value / targetValue) * 100;
                  goalPercentageShared.value = Math.min(percentage, 100);
                } catch (error) {
                  // Silently handle errors to prevent crashes
                  if (__DEV__) {
                    log.error('[SmartCoach] Error calculating percentage:', error);
                  }
                }
              }
            }
            
            // Update last RPM time (use raw RPM, not smoothed, for accurate detection)
            // This ensures we detect when sensor actually stops
            if (rawRPM > 0) {
              if (!firstActivityDetectedRef.current) {
                firstActivityDetectedRef.current = true;
                setAwaitingActivityProof(false);
                if (activityProofTimerRef.current) {
                  clearTimeout(activityProofTimerRef.current);
                  activityProofTimerRef.current = null;
                }
              }
              lastRPMTimeRef.current = Date.now();
              setShowAutoPauseOverlay(false);
              setShowSensorAsleep(false);
              
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
            setShowSensorAsleep(false);
            setBleStatus(t('connectionLost'));
          },
          // onReconnect callback - verify session ownership
          verifySessionOwnership
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
        // Mark component as unmounted FIRST to prevent any further SharedValue updates
        isMountedRef.current = false;
        
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
    }, [session?.machine_id, session?.machine?.sensor_id, sensorId, authSession?.user, reconnectTrigger]);

  // Detect silent BLE disconnects and keep UI state consistent.
  useEffect(() => {
    if (!session?.machine_id || !bleConnected || isReconnecting) return;

    const watchdog = setInterval(() => {
      if (!bleService.getConnected()) {
        setBleConnected(false);
        setPauseReason('connection');
        setIsPaused(true);
        setBleStatus(t('connectionLost'));
      }
    }, 1500);

    return () => clearInterval(watchdog);
  }, [bleConnected, isReconnecting, session?.machine_id, t]);

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

  useEffect(() => {
    if (!session?.gym_id || !authSession?.user || !session?.id) return;

    const loadLiveEconomyContext = async () => {
      try {
        // Prefer SECURITY DEFINER RPC for mobile users (RLS-safe).
        const { data: rpcLimits } = await supabase.rpc('get_user_drop_limits', {
          p_gym_id: session.gym_id,
        });

        const rpcRow = Array.isArray(rpcLimits) ? rpcLimits[0] : rpcLimits;
        let effectiveLimits = rpcRow as {
          max_drops_per_session?: number;
          max_rewarded_sessions_per_day?: number;
          max_drops_per_day?: number;
          max_drops_per_week?: number;
          rewarded_sessions_cap_mode?: string;
          session_restart_grace_sec?: number;
          session_soft_tier_1_factor?: number;
          session_soft_tier_2_factor?: number;
          session_soft_tier_1_span_ratio?: number;
        } | null;

        // Compatibility fallback: direct table reads (for environments without RPC migration).
        if (!effectiveLimits) {
          const [gymTokenomics, globalTokenomics, gymLimitsFallback, defaultLimitsFallback] = await Promise.all([
            supabase
              .from('tokenomics_config')
              .select('max_drops_per_session,max_rewarded_sessions_per_day,max_drops_per_day,max_drops_per_week')
              .eq('gym_id', session.gym_id)
              .maybeSingle(),
            supabase
              .from('tokenomics_config')
              .select('max_drops_per_session,max_rewarded_sessions_per_day,max_drops_per_day,max_drops_per_week')
              .is('gym_id', null)
              .maybeSingle(),
            supabase
              .from('drop_limits')
              .select('max_drops_per_session,max_rewarded_sessions_per_day,max_drops_per_day,max_drops_per_week')
              .eq('gym_id', session.gym_id)
              .eq('enabled', true)
              .maybeSingle(),
            supabase
              .from('drop_limits')
              .select('max_drops_per_session,max_rewarded_sessions_per_day,max_drops_per_day,max_drops_per_week')
              .is('gym_id', null)
              .eq('enabled', true)
              .maybeSingle(),
          ]);
          effectiveLimits =
            gymTokenomics.data ||
            globalTokenomics.data ||
            gymLimitsFallback.data ||
            defaultLimitsFallback.data;
        }

        if (effectiveLimits) {
          const maxSessionDrops = Math.max(1, Number(effectiveLimits.max_drops_per_session ?? 120));
          const maxDayDrops = Math.max(maxSessionDrops, Number(effectiveLimits.max_drops_per_day ?? 300));
          const maxWeekDrops = Math.max(maxDayDrops, Number(effectiveLimits.max_drops_per_week ?? 1500));
          const maxRewardedSessions = Math.max(1, Number(effectiveLimits.max_rewarded_sessions_per_day ?? 4));
          let capMode: RewardedSessionsCapMode = 'soft';
          const rawMode = effectiveLimits.rewarded_sessions_cap_mode;
          if (rawMode === 'off' || rawMode === 'soft' || rawMode === 'hard') {
            capMode = rawMode;
          }
          dropLimitsRef.current = {
            maxDropsPerSession: maxSessionDrops,
            maxRewardedSessionsPerDay: maxRewardedSessions,
            maxDropsPerDay: maxDayDrops,
            maxDropsPerWeek: maxWeekDrops,
            rewardedSessionsCapMode: capMode,
            sessionSoftTier1Factor: effectiveLimits.session_soft_tier_1_factor != null
              ? Number(effectiveLimits.session_soft_tier_1_factor) : undefined,
            sessionSoftTier2Factor: effectiveLimits.session_soft_tier_2_factor != null
              ? Number(effectiveLimits.session_soft_tier_2_factor) : undefined,
            sessionSoftTier1SpanRatio: effectiveLimits.session_soft_tier_1_span_ratio != null
              ? Number(effectiveLimits.session_soft_tier_1_span_ratio) : undefined,
          };
          setTargetDrops(maxSessionDrops);
          setDailyRemaining(Math.max(0, maxDayDrops - dropHistoryRef.current.mintedToday));
        }
      } catch (limitsError) {
        log.warn('[Workout] Could not load economy limits for live estimator, using defaults.', limitsError);
      }

      try {
        const { data: profileRow } = await supabase
          .from('profiles')
          .select('streak_days,last_visit_date')
          .eq('id', authSession.user.id)
          .maybeSingle();

        if (profileRow) {
          streakContextRef.current = {
            streakDays: profileRow.streak_days ?? 0,
            lastVisitDate: profileRow.last_visit_date ?? null,
          };
        }
      } catch (profileError) {
        log.warn('[Workout] Could not load profile streak for live estimator.', profileError);
      }

      try {
        const { data: rewardedSessions } = await supabase
          .from('sessions')
          .select('drops_earned,started_at')
          .eq('user_id', authSession.user.id)
          .eq('is_active', false)
          .gt('drops_earned', 0)
          .neq('id', session.id)
          .limit(500);

        const now = new Date();
        const todayStr = getBelgradeDateString(now);
        const todayDate = new Date(`${todayStr}T00:00:00.000Z`);
        const dayOfWeek = todayDate.getUTCDay();
        const weekOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const weekStartDate = new Date(todayDate);
        weekStartDate.setUTCDate(weekStartDate.getUTCDate() - weekOffset);
        const weekStartStr = weekStartDate.toISOString().slice(0, 10);

        let rewardedSessionsToday = 0;
        let mintedToday = 0;
        let mintedWeek = 0;

        for (const row of rewardedSessions || []) {
          const dateStr = getBelgradeDateString(new Date(row.started_at));
          const earned = row.drops_earned ?? 0;
          if (dateStr === todayStr) {
            rewardedSessionsToday += 1;
            mintedToday += earned;
          }
          if (dateStr >= weekStartStr) {
            mintedWeek += earned;
          }
        }

        dropHistoryRef.current = {
          rewardedSessionsToday,
          mintedToday,
          mintedWeek,
        };
      } catch (historyError) {
        log.warn('[Workout] Could not load rewarded sessions history for live estimator.', historyError);
      }

      try {
        const resolvedType = (machineType || 'generic').toLowerCase();
        const { data: dmcRow } = await supabase
          .from('drop_model_config')
          .select('machine_base_json')
          .or(`gym_id.eq.${session.gym_id},gym_id.is.null`)
          .order('gym_id', { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle();

        if (dmcRow?.machine_base_json) {
          const json = dmcRow.machine_base_json as Record<string, Record<string, number>>;
          const mcfg = json[resolvedType] ?? json['generic'];
          if (mcfg) {
            machineConfigRef.current = {
              baseRatePerMin: mcfg.baseRatePerMin ?? 1.0,
              maxMultiplier: mcfg.maxMultiplier ?? 1.8,
              maxDropsPerMinute: mcfg.maxDropsPerMinute ?? 3.0,
              sustainedHighEffortRatio: mcfg.sustainedHighEffortRatio ?? 0.55,
            };
          }
        }
      } catch (configError) {
        log.warn('[Workout] Could not load drop_model_config for live estimator, using defaults.', configError);
      }
    };

    void loadLiveEconomyContext();
  }, [authSession?.user, session?.gym_id, session?.id]);

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
        await supabase.rpc('update_machine_heartbeat', {
          p_machine_id: session.machine_id,
          p_user_id: authSession.user.id,
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
          await supabase
            .from('sessions')
            .update({
              drops_earned: Math.round(earnedDropsShared.value),
              duration_seconds: duration,
              updated_at: new Date().toISOString(),
            })
            .eq('id', session.id);
          
          // Battery Optimization: Only log critical events
        } catch (error) {
          log.error('[Workout] Final sync error:', error);
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
    if (bleConnected || !session?.machine_id) {
      // Stop connecting animation when connected or no machine
      connectingPulseScale.value = withTiming(1, { duration: 300 });
      connectingPulseOpacity.value = withTiming(0, { duration: 300 });
      return;
    }

    // Subtle, slower pulse while connecting
    connectingPulseScale.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );

    connectingPulseOpacity.value = withRepeat(
      withSequence(
        withTiming(0.6, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.3, { duration: 2000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, [bleConnected, session?.machine_id]);

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
    // CRITICAL: Guard - stop processing if plan is completed to prevent JSI crashes
    if (isPlanCompletedShared.value >= 1) {
      return; // Stop processing when plan is completed
    }
    
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
  
  // CRITICAL: Stop frameCallback when plan is completed to prevent JSI crashes
  useEffect(() => {
    if (isPlanCompleted) {
      frameCallback.setActive(false);
    } else {
      frameCallback.setActive(true);
    }
    
    return () => {
      // Ensure cleanup on unmount
      frameCallback.setActive(false);
    };
  }, [isPlanCompleted, frameCallback]);

  // SmartCoach: Track exercise completion
  const [exerciseCompleted, setExerciseCompleted] = useState(false);
  
  useAnimatedReaction(
    () => goalPercentageShared.value,
    (percentage) => {
      'worklet';
      // Use SharedValue (not ref) so worklet reads on UI thread - avoids EXC_BAD_ACCESS
      // CRITICAL: Check both percentage and exerciseCompletedShared to prevent duplicate triggers
      // CRITICAL FIX: Use ref to avoid stale closure in worklet (worklets can read refs via runOnJS)
      // Note: We can't read JS refs directly in worklet, so we use a SharedValue for isSmartCoachMode
      // For now, keep isSmartCoachMode in dependency array - it will trigger re-creation of reaction when it changes
      if (percentage >= 100 && exerciseCompletedShared.value < 1 && isSmartCoachMode && !isPlanCompleted) {
        // CRITICAL: Set exerciseCompletedShared immediately in worklet to prevent duplicate triggers
        exerciseCompletedShared.value = 1;
        
        runOnJS(() => {
          // Defer to next tick to avoid EXC_BAD_ACCESS: setState/Haptics during Reanimated frame
          setTimeout(() => {
            try {
              // GUARD: Prevent Haptics/state updates if plan is completed or component is unmounting
              // Double-check SharedValue to ensure we haven't already completed
              if (isMountedRef.current && !isPlanCompleted && exerciseCompletedShared.value >= 1) {
                // exerciseCompletedShared.value is already set to 1 in worklet above
                setExerciseCompleted(true);
                
                // GUARD: Only call Haptics if component is still mounted and plan is not completed
                if (isMountedRef.current && !isPlanCompleted) {
                  try {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  } catch (hapticsError) {
                    log.warn('[SmartCoach] Haptics error:', hapticsError);
                  }
                }
                
                // CRITICAL: Automatically move to next exercise after a short delay (1.5 seconds)
                // This provides better UX - user sees completion feedback, then automatically advances
                // If this is the last exercise, handleNextExercise will detect it and show plan completion overlay
                // Use runOnJS to safely call handleNextExercise from worklet
                runOnJS(() => {
                  setTimeout(() => {
                    if (isMountedRef.current && !isPlanCompleted) {
                      log.debug('[SmartCoach] Auto-advancing to next exercise after completion');
                      handleNextExercise();
                    }
                  }, 1500);
                })();
              }
            } catch (e) {
              log.warn('[SmartCoach] runOnJS completion error:', e);
            }
          }, 0);
        })();
      }
    },
    [goalPercentageShared, isSmartCoachMode, exerciseCompletedShared, isPlanCompleted]
  );

  // SmartCoach: Move to next exercise
  // CRITICAL FIX: Peek-ahead pattern - fetch next item BEFORE updating index to prevent race condition
  const handleNextExercise = useCallback(async () => {
    // GUARD: Prevent execution if plan is already completed or component is unmounting
    if (isPlanCompleted || !isMountedRef.current) {
      log.debug('[SmartCoach] handleNextExercise blocked - plan completed or unmounting');
      return;
    }
    
    // Use machineId from params first, then fallback to session.machine_id
    const activeMachineId = machineId || session?.machine_id;
    
    if (!planId || !activeMachineId || !authSession?.user) return;
    
    try {
      const nextIndex = currentExerciseIndex + 1;
      
      // CRITICAL FIX: Peek-ahead - FIRST check if next item exists BEFORE updating any state
      // This prevents race condition where useEffect sets currentPlanItem to null
      const { data, error } = await supabase.rpc('get_plan_item_for_machine', {
        p_plan_id: planId,
        p_machine_id: activeMachineId,
        p_current_index: nextIndex,
      });

      // CRITICAL: If error or no data, plan is complete - clean up all intervals and navigate
      if (error || !data || data.length === 0) {
        log.debug('[SmartCoach] Plan completed! No more exercises found at index:', nextIndex);
        
        // CRITICAL: Stop all intervals BEFORE setting completion flags to prevent crashes
        // Clear time-based progress interval
        if (timeProgressIntervalRef.current) {
          clearInterval(timeProgressIntervalRef.current);
          timeProgressIntervalRef.current = null;
        }
        
        // Clear sync interval
        if (syncIntervalRef.current) {
          clearInterval(syncIntervalRef.current);
          syncIntervalRef.current = null;
        }
        
        // Clear heartbeat interval
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }
        
        // REMOVED: challengeUpdateIntervalRef cleanup - challenge progress is now automatic via award_drops()
        
        // Clear all timers
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        
        // REMOVED: challengeMessageTimerRef cleanup - no longer needed
        
        if (autoPauseTimerRef.current) {
          clearTimeout(autoPauseTimerRef.current);
          autoPauseTimerRef.current = null;
        }
        
        // CRITICAL: Stop frameCallback BEFORE setting completion flags to prevent JSI crashes
        frameCallback.setActive(false);
        
        // Cancel all animations before completion
        cancelAnimation(rawRPMShared);
        cancelAnimation(smoothedRPMShared);
        cancelAnimation(goalPercentageShared);
        cancelAnimation(currentProgressShared);
        
        // KRAJ PLANA: Set completion flags
        setIsPlanCompleted(true);
        setShowPlanCompleted(true);
        setIsSmartCoachMode(false);
        
        // Show workout summary modal after a brief delay
        setTimeout(() => {
          if (isMountedRef.current) {
            setShowWorkoutSummary(true);
          }
        }, 1000);
        
        // CRITICAL: Navigate to session-summary after showing completion overlay (2.5 seconds delay)
        // This gives user time to see the "Plan Completed!" message
        setTimeout(() => {
          // CRITICAL: Only navigate if component is still mounted
          // isPlanCompleted is already set to true above, so we don't check it again
          if (isMountedRef.current) {
            // Now safe to set currentPlanItem to null since all intervals are cleared
            setCurrentPlanItem(null);
            // Navigate to summary - wrap in try-catch to prevent crashes
            try {
              log.debug('[SmartCoach] Navigating to session summary after plan completion');
              handleFinishWorkout();
            } catch (navError) {
              log.error('[SmartCoach] Error navigating to summary:', navError);
              // Fallback: Try direct navigation if handleFinishWorkout fails
              if (isMountedRef.current && session?.id) {
                try {
                  router.replace({
                    pathname: '/session-summary',
                    params: {
                      sessionId: session.id,
                      drops: Math.round(totalDropsShared.value).toString(),
                      duration: duration.toString(),
                      gymId: session.gym_id || '',
                      sessionTier,
                    },
                  });
                } catch (routerError) {
                  log.error('[SmartCoach] Error with direct navigation:', routerError);
                }
              }
            }
          }
        }, 2500);
        
        return;
      }

      // Next item exists - proceed with update
      const item = data[0];
      if (!item) {
        log.error('[SmartCoach] Invalid plan item received');
        return;
      }
      
      // Machine Switch Logic: Check if next exercise requires different machine
      const nextMachineId = item.machine_id || item.machine?.id;
      const currentMachineId = activeMachineId;
      
      if (nextMachineId && nextMachineId !== currentMachineId) {
        log.debug('[SmartCoach] Next exercise requires different machine:', {
          currentMachineId,
          nextMachineId,
          exerciseName: item.exercise_name,
        });
        
        // Stop current workout and navigate to scan with plan context
        // This ensures user can scan the correct machine for next exercise
        handleFinishWorkout();
        
        // Navigate to scan with plan parameters preserved
        setTimeout(() => {
          if (isMountedRef.current) {
            router.push({
              pathname: '/scan',
              params: {
                planId,
                machineId: nextMachineId,
                exerciseIndex: nextIndex.toString(),
              },
            });
          }
        }, 500);
        
        return; // Exit - don't update current exercise
      }
      
      // CRITICAL: Update index and plan item simultaneously to prevent race condition
      // This ensures loadPlanItem useEffect won't run with stale index
      setCurrentExerciseIndex(nextIndex);
      setCurrentPlanItem(item);
      setExerciseCompleted(false);
      
      // Reset progress (safely check if mounted)
      if (isMountedRef.current) {
        goalTargetShared.value = 0;
        currentProgressShared.value = 0;
        goalPercentageShared.value = 0;
        exerciseCompletedShared.value = 0;
      }
      
      const targetValue = parseFloat(item.target_value);
      const targetUnit = item.target_unit?.toLowerCase() || '';
      
      // For time-based goals, convert to seconds if needed
      let targetInSeconds = targetValue;
      if (item.target_metric === 'time' && (targetUnit.includes('min') || targetUnit.includes('minute'))) {
        targetInSeconds = targetValue * 60;
      }
      
      // Safely update SharedValues only if component is mounted
      if (isMountedRef.current) {
        goalTargetShared.value = targetInSeconds;
      }
      log.debug('[SmartCoach] Moved to next exercise:', item.exercise_name);
    } catch (err) {
        log.error('[SmartCoach] Error in handleNextExercise:', err);
        Alert.alert(t('common:error'), t('failedNextExercise'));
    }
  }, [planId, machineId, session?.machine_id, currentExerciseIndex, authSession?.user, isPlanCompleted]);

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
  // Gauge fills relative to daily cap for continuous sense of progress.
  // Session threshold is shown as a label, not a progress ceiling.
  const gaugeTarget = useMemo(
    () => Math.max(targetDrops, dropLimitsRef.current.maxDropsPerDay || 300),
    [targetDrops],
  );

  useAnimatedReaction(
    () => totalDropsShared.value,
    (drops) => {
      'worklet';
      const targetProgress = Math.min(drops / gaugeTarget, 1);
      progressShared.value = withTiming(targetProgress, {
        duration: 300,
        easing: Easing.out(Easing.quad),
      });
    },
    [totalDropsShared, gaugeTarget]
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
      loadSession();
    } else if (authSession?.user && equipmentId && gymId) {
      // Create new session if equipmentId and gymId provided
      createSession();
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
      Alert.alert(t('sessionStartBlockedTitle'), t('sessionStartRequiresLock'));
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
      Alert.alert(t('sessionStartBlockedTitle'), t('sessionStartMachineBusy'));
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
        equipment_id: equipmentId, // Keep for backward compatibility
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
      .select('*, machine:machine_id(*), equipment:equipment_id(*), gym:gym_id(*)')
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
      // CRITICAL: No blocking Alert.alert() - log error and continue
      log.error('[Workout] Failed to start workout:', error.message);
      // Continue with mock session or show error in UI
      setBleStatus(`Failed to start workout: ${error.message}`);
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

    const { data } = await supabase
      .from('sessions')
      .select('*, machine:machine_id(*), equipment:equipment_id(*), gym:gym_id(*)')
      .eq('id', sessionId)
      .single();

    if (data) {
      setSession(data);
      setStartTime(new Date(data.started_at));
      
      log.debug('[Workout] Session loaded:', {
        id: data.id,
        gymId: data.gym_id,
        machine: data.machine,
        equipment: data.equipment,
        machineType: data.machine?.type || data.equipment?.equipment_type,
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

  // Throttled Sync: Save session progress to Supabase (every 15 seconds)
  // Database Sync on Idle: Skip syncing if RPM is 0 for 15+ seconds (idleSyncRef.current === true)
  useEffect(() => {
    if (!session?.id || session.id === 'mock-session' || !authSession?.user) return;
    if (isPaused) return; // Don't save when paused
    if (idleSyncRef.current) return; // Don't sync if in idle state (RPM 0 for 15+ seconds)

    const syncToDatabase = async () => {
      const now = Date.now();
      // Battery Optimization: Throttle to 30 seconds minimum
      if (lastSyncRef.current && now - lastSyncRef.current < 30000) {
        return;
      }

      try {
        // CRITICAL: Do NOT save drops_earned during workout sync.
        // award_drops() has an idempotency check (drops_earned > 0 = already processed).
        const estimatedCalories = Math.round(caloriesShared.value);
        await supabase
          .from('sessions')
          .update({
            duration_seconds: duration,
            calories: estimatedCalories > 0 ? estimatedCalories : null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', session.id);
        
        lastSyncRef.current = now;
        // Battery Optimization: Only log critical sync events
      } catch (error) {
        log.error('[Workout] Sync error:', error);
      }
    };

    // Battery Optimization: Sync immediately, then every 30 seconds (reduced frequency)
    syncToDatabase();
    syncIntervalRef.current = setInterval(syncToDatabase, 30000);

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [session?.id, averageRPM, duration, isPaused, authSession]); // Removed earnedDrops - using SharedValue

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
    // GUARD: Stop timer if plan is completed
    if (isPlanCompleted) return;
    if (!session && !startTime) return;
    if (isPaused) return;
    if (!bleConnected) return; // Don't start timer until BLE is connected

    const interval = setInterval(() => {
      // GUARD: Check if plan is completed during timer execution
      if (isPlanCompleted || !isMountedRef.current) {
        return;
      }
      const now = new Date();
      const start = startTime || (session ? new Date(session.started_at) : now);
      const pausedOffset = pausedTime ? now.getTime() - pausedTime.getTime() : 0;
      const seconds = Math.floor((now.getTime() - start.getTime() - pausedOffset) / 1000);

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
        });

        setSessionTier(result.tier);
        setDailyRemaining(result.dailyRemaining);
        if (result.hardCapReached && !hardCapHitDuringSession) {
          setHardCapHitDuringSession(true);
        }

        // One-time tier transition toasts
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

        if (!isTrackingOnly) {
          applyLiveDropsEstimate(result.drops);
        }
      }
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [applyLiveDropsEstimate, bleConnected, isPaused, isPlanCompleted, isTrackingOnly, pausedTime, session, startTime, caloriesShared]);

  // Calculate current minutes (memoized to avoid recalculating on every render)
  const currentMinutes = useMemo(() => Math.floor(duration / 60), [duration]);

  // SmartCoach: Update progress every second for time-based goals
  // CRITICAL: This is the ONLY place where time-based progress is updated to prevent race conditions
  useEffect(() => {
    // CRITICAL: Clear any existing interval before creating a new one
    if (timeProgressIntervalRef.current) {
      clearInterval(timeProgressIntervalRef.current);
      timeProgressIntervalRef.current = null;
    }
    
    // GUARD: Stop timer if plan is completed OR exercise is completed - CRITICAL for preventing crashes
    if (isPlanCompleted || exerciseCompleted) {
      return;
    }
    
    // CRITICAL SAFETY GUARD: Check ref first to prevent accessing null currentPlanItem
    if (!currentPlanItemRef.current) {
      return;
    }
    
    // Undefined guard: Check if currentPlanItem exists before using
    // CRITICAL FIX: Use refs to avoid stale closures
    if (!isSmartCoachModeRef.current || !currentPlanItemRef.current || isPaused || !bleConnected || !isMountedRef.current) {
      return;
    }
    
    if (!currentPlanItemRef.current.target_metric) {
      log.warn('[SmartCoach] currentPlanItem missing target_metric');
      return;
    }
    
    const targetMetric = currentPlanItemRef.current.target_metric;
    
    // Only handle time-based goals here
    if (targetMetric !== 'time') {
      return;
    }
    
    if (!currentPlanItemRef.current.target_value) {
      log.warn('[SmartCoach] currentPlanItem missing target_value');
      return;
    }
    
    const targetValue = parseFloat(currentPlanItemRef.current.target_value);
    const targetUnit = currentPlanItemRef.current.target_unit?.toLowerCase() || '';
    
    // Convert target to seconds if it's in minutes
    let targetInSeconds = targetValue;
    if (targetUnit.includes('min') || targetUnit.includes('minute')) {
      targetInSeconds = targetValue * 60;
    }
    
    // CRITICAL: Capture targetInSeconds in closure for interval callback to avoid stale reference
    const capturedTargetInSeconds = targetInSeconds;
    
    const interval = setInterval(() => {
      // CRITICAL NULL GUARD: Check ref and state FIRST at the very top to prevent crashes
      // This prevents accessing null currentPlanItem when plan is completed
      if (!currentPlanItem || isPlanCompleted) {
        return; // If plan is done or loading, do nothing
      }
      
      // Double-check with ref for additional safety
      if (!currentPlanItemRef.current) {
        return;
      }
      
      // CRITICAL GUARDS: Stop immediately if plan/exercise is completed or component is unmounting
      if (isPlanCompleted || exerciseCompleted || !isMountedRef.current) {
        return;
      }
      
      // CRITICAL: Stop once goal is completed (avoids SharedValue writes during completion, reduces EXC_BAD_ACCESS risk)
      // Check both SharedValue (UI thread) and state (JS thread) for maximum safety
      if (exerciseCompletedShared.value >= 1) {
        return;
      }
      
      // CRITICAL FIX: Use refs to avoid stale closures
      if (isPaused || !isSmartCoachModeRef.current || !currentPlanItemRef.current || !bleConnected) {
        return;
      }
      
      try {
        const elapsedSeconds = durationShared.value;
        
        // CRITICAL: Check if goal is completed FIRST - if so, STOP interval immediately
        const percentage = (elapsedSeconds / capturedTargetInSeconds) * 100;
        if (percentage >= 100 && exerciseCompletedShared.value >= 1) {
          // Goal completed - STOP interval immediately to prevent race condition
          if (timeProgressIntervalRef.current) {
            clearInterval(timeProgressIntervalRef.current);
            timeProgressIntervalRef.current = null;
          }
          return; // Goal already completed, don't write to SharedValues
        }
        
        // CRITICAL: If elapsed >= target, STOP interval BEFORE calling handleNextExercise
        if (elapsedSeconds >= capturedTargetInSeconds && !exerciseCompleted) {
          // STOP interval immediately to prevent race condition
          if (timeProgressIntervalRef.current) {
            clearInterval(timeProgressIntervalRef.current);
            timeProgressIntervalRef.current = null;
          }
          // Now safe to call handleNextExercise (interval is stopped)
          // Use setTimeout(0) to defer execution and ensure interval cleanup completes
          setTimeout(() => {
            if (isMountedRef.current && !isPlanCompleted) {
              handleNextExercise();
            }
          }, 0);
          return;
        }
        
        // Update progress (in seconds) - only if mounted
        if (isMountedRef.current && !exerciseCompleted && !isPlanCompleted) {
          currentProgressShared.value = elapsedSeconds;
          
          // Calculate percentage based on target in seconds
          // CRITICAL: Only update if not already at 100% to prevent re-triggering
          const newPercentage = Math.min(percentage, 100);
          if (goalPercentageShared.value < 100 || newPercentage < 100) {
            goalPercentageShared.value = newPercentage;
          }
          
          // Only log in development to avoid performance issues
          if (__DEV__ && percentage <= 100) {
            log.debug('[SmartCoach] Time progress update:', {
              elapsed: elapsedSeconds,
              target: targetInSeconds,
              targetOriginal: targetValue,
              unit: targetUnit,
              percentage: percentage.toFixed(1) + '%',
            });
          }
        }
      } catch (error) {
        // Silently handle errors to prevent crashes
        if (__DEV__) {
          log.error('[SmartCoach] Error updating time progress:', error);
        }
      }
    }, 1000);
    
    // Store interval reference for cleanup
    timeProgressIntervalRef.current = interval;
    
    return () => {
      if (timeProgressIntervalRef.current) {
        clearInterval(timeProgressIntervalRef.current);
        timeProgressIntervalRef.current = null;
      }
    };
  }, [isSmartCoachMode, currentPlanItem, isPaused, bleConnected, exerciseCompleted, isPlanCompleted, durationShared, currentProgressShared, goalPercentageShared, exerciseCompletedShared, isMountedRef, handleNextExercise]);

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
      },
    });
  }, [authSession?.user, duration, router, session, t]);

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
    pausedOverlayOpacity.value = withSpring(1, { damping: 15, stiffness: 100, mass: 1 });
    setShowAutoPauseOverlay(false);
  };

  const resumeWorkout = async () => {
    if (!isPaused || isResumingFromPause) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsResumingFromPause(true);

    try {
      const activeSensorId = sensorId || session?.machine?.sensor_id;
      let reconnectOk = true;

      // For machine sessions we require an active BLE link before resume.
      if (session?.machine_id && activeSensorId && (!bleConnected || !bleService.getConnected())) {
        setBleStatus(t('reconnecting'));

        reconnectOk = await bleService.reconnect();
        if (!reconnectOk) {
          try {
            reconnectOk = await bleService.connectToDevice(activeSensorId);
          } catch {
            reconnectOk = false;
          }
        }

        setBleConnected(reconnectOk);
      }

      if (!reconnectOk) {
        setPauseReason('connection');
        setBleStatus(t('reconnectionFailed'));
        return;
      }

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
      setShowSensorAsleep(false);
      setPauseReason('manual');
      setIsPaused(false);
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
      handleFinishWorkout();
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

    // CRITICAL: Clean up all timers/intervals before finishing
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    
    // CRITICAL: Clear time-based progress interval to prevent crashes when currentPlanItem becomes null
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

    try {
      const { error: syncError, count: syncCount } = await supabase
        .from('sessions')
        .update({
          duration_seconds: duration,
          calories: finalCalories > 0 ? finalCalories : null,
          raw_metrics: rawMetrics,
          updated_at: new Date().toISOString(),
        })
        .eq('id', session.id);

      if (syncError) {
        log.error('[Workout] Final sync DB error:', syncError.message, syncError.code);
      } else {
        log.debug('[Workout] Final sync completed:', { finalCalories, averageRPM: finalAverageRPM, duration, isFTMS: ftmsProtocolActiveRef.current, rowsAffected: syncCount });
      }

      // Safety net: if the update silently affected 0 rows (e.g. RLS denied), retry
      // with a forced read-back to confirm raw_metrics persisted.
      if (!syncError) {
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
      }
    } catch (syncError) {
      log.error('[Workout] Final sync error:', syncError);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // CALL award_drops() — SERVER-SIDE DROPS CALCULATION
    // This is the ONLY way drops are calculated. NEVER send drops from client.
    // award_drops() will:
    //   1. Calculate drops = calories × 2.5 × streak_multiplier
    //   2. Update profiles (total_drops, available_drops, weekly, monthly, streak)
    //   3. Update gym_memberships (local_drops_balance)
    //   4. Insert drops_transactions ledger entry
    //   5. Update challenge progress
    //   6. Evaluate and award badges
    //   7. Return { drops_earned, multiplier, badges_earned }
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    let serverDrops = 0;
    let serverMultiplier = 1.0;
    let serverBadges: string[] = [];
    let securityStatus: 'cap' | 'rate' | 'fraud' | null = null;
    let securityMessage: string | null = null;

    const { data: awardResult, error } = await supabase.rpc('award_drops', {
      p_session_id: session.id,
    });

    if (error) {
      log.error('[Workout] award_drops() failed:', error.message);
      const normalized = mapSecurityError(error.message || '');
      if (normalized !== 'other') {
        securityStatus = normalized;
        if (normalized === 'cap') securityMessage = t('securityCapReached');
        if (normalized === 'rate') securityMessage = t('securityRateLimited');
        if (normalized === 'fraud') securityMessage = t('securityFraudBlocked');
      } else {
        securityStatus = 'rate';
        securityMessage = t('securityAwardFailed');
      }
    } else if (awardResult && awardResult.length > 0) {
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

      log.debug('[Workout] award_drops() success:', {
        drops_earned: serverDrops,
        multiplier: serverMultiplier,
        badges_earned: serverBadges,
        securityMessage,
      });
    }

    // NOTE: Challenge progress + badges are automatically handled by award_drops()
    // No need to manually update anything — it's all server-side now.

    // Unlock machine if it was locked
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
      },
    });
  };

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


  // Signal Indicator Component
  const SignalIndicator = ({ status }: { status: 'ok' | 'lost' }) => {
    const pulseScale = useSharedValue(1);
    const pulseOpacity = useSharedValue(1);

    useEffect(() => {
      if (status === 'ok') {
        // Pulsing animation when signal is OK
        pulseScale.value = withRepeat(
          withSequence(
            withTiming(1.2, { duration: 500, easing: Easing.inOut(Easing.ease) }),
            withTiming(1, { duration: 500, easing: Easing.inOut(Easing.ease) })
          ),
          -1,
          false
        );
        pulseOpacity.value = withRepeat(
          withSequence(
            withTiming(0.6, { duration: 500, easing: Easing.inOut(Easing.ease) }),
            withTiming(1, { duration: 500, easing: Easing.inOut(Easing.ease) })
          ),
          -1,
          false
        );
      } else {
        // Static when signal is lost
        pulseScale.value = 1;
        pulseOpacity.value = 0.5;
      }
    }, [status]);

    const animatedStyle = useAnimatedStyle(() => ({
      transform: [{ scale: pulseScale.value }],
      opacity: pulseOpacity.value,
    }));

    return (
      <Animated.View style={animatedStyle}>
        <Ionicons
          name="radio"
          size={12}
          color={status === 'ok' ? branding.primary : theme.colors.textSecondary}
        />
      </Animated.View>
    );
  };

  // Calculate progress and bonus (using SharedValues via useAnimatedReaction)
  const [isOverachieved, setIsOverachieved] = useState(false);
  const [showBonus, setShowBonus] = useState(false);
  
  useAnimatedReaction(
    () => totalDropsShared.value,
    (drops) => {
      'worklet';
      const overachieved = drops > gaugeTarget;
      const bonus = drops > 0 && Math.floor(drops) % 100 === 0;

      runOnJS(setIsOverachieved)(overachieved);
      runOnJS(setShowBonus)(bonus);
    },
    [totalDropsShared, gaugeTarget]
  );

  const progress = useDerivedValue(() => {
    return Math.min(totalDropsShared.value / gaugeTarget, 1);
  }, [totalDropsShared, gaugeTarget]);
  
  // CRITICAL: Convert SharedValue to JS value for CircularProgressRing, Progress Bar, and LiquidGauge using useState + useAnimatedReaction
  const [progressJS, setProgressJS] = useState(0);
  const [progressWidth, setProgressWidth] = useState('0%');
  const [liquidGaugeValue, setLiquidGaugeValue] = useState('0'); // JS state for LiquidGauge display value
  useAnimatedReaction(
    () => progressShared.value,
    (value) => {
      'worklet';
      const jsValue = Math.min(value, 1);
      const widthPercent = `${Math.min(jsValue * 100, 100)}%`;
      runOnJS(setProgressJS)(Math.min(progress.value, 1));
      runOnJS(setProgressWidth)(widthPercent);
    },
    [progressShared, progress]
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
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Gym background image */}
      {activeGym?.background_url && (
        <ImageBackground
          source={{ uri: activeGym.background_url }}
          style={StyleSheet.absoluteFillObject}
          resizeMode="cover"
        />
      )}
      {/* Blurred dark overlay for contrast */}
      <BlurView intensity={30} style={StyleSheet.absoluteFill} tint="dark">
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }]} />
      </BlurView>

      {/* Header with Gym Info */}
      <View style={styles.header}>
        <View style={styles.leftHeader}>
          {session?.gym?.name && (
            <View style={styles.gymTag}>
              <Ionicons name="location" size={14} color={theme.colors.textSecondary} />
              <Text style={styles.gymTagText}>{t('atGym', { name: session.gym.name })}</Text>
            </View>
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

      {/* SmartCoach: GoalTracker - Show when in SmartCoach mode */}
      {/* GUARD: Render guard - return null if plan is completed or currentPlanItem is invalid */}
      {/* CRITICAL: key prop forces React to unmount old tracker and stop animations before mounting new one */}
      {isSmartCoachMode && !isPlanCompleted && currentPlanItem && currentPlanItem.exercise_name && currentPlanItem.target_metric && (
        <GoalTracker
          key={currentExerciseIndex}
          exerciseName={currentPlanItem.exercise_name || 'Exercise'}
          targetMetric={currentPlanItem.target_metric}
          targetValue={parseFloat(currentPlanItem.target_value || '0')}
          targetUnit={currentPlanItem.target_unit || ''}
          currentProgress={currentProgressShared}
          goalPercentage={goalPercentageShared}
          primaryColor={branding.primary}
          primaryLight={branding.primaryLight}
        />
      )}

      {/* SmartCoach: Next Exercise Button - Show when exercise is completed */}
      {isSmartCoachMode && exerciseCompleted && !showPlanCompleted && (
        <Animated.View
          style={[
            styles.nextExerciseContainer,
            {
              backgroundColor: branding.primaryLight,
              borderColor: branding.primary,
            }
          ]}
        >
          <View style={styles.nextExerciseContent}>
            <Ionicons name="checkmark-circle" size={24} color={branding.primary} />
            <Text style={[styles.nextExerciseText, { color: branding.primary }]}>
              {t('exerciseCompleted')}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.nextExerciseButton, { backgroundColor: branding.primary }]}
            onPress={handleNextExercise}
          >
            <Text style={[styles.nextExerciseButtonText, { color: branding.onPrimary }]}>
              {t('nextExercise')}
            </Text>
            <Ionicons name="arrow-forward" size={20} color={branding.onPrimary} />
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* SmartCoach: Plan Completed Overlay */}
      {showPlanCompleted && !showWorkoutSummary && (
        <BlurView intensity={80} style={styles.planCompletedOverlay}>
          <View style={[styles.planCompletedContainer, { backgroundColor: branding.primaryLight }]}>
            <Ionicons name="trophy" size={64} color={branding.primary} />
            <Text style={[styles.planCompletedTitle, { color: branding.primary }]}>
              {t('planCompleted')}
            </Text>
            <Text style={styles.planCompletedSubtitle}>
              {t('planCompletedSubtitle')}
            </Text>
          </View>
        </BlurView>
      )}

      {/* Workout Summary Modal */}
      {/* Active Challenges Overlay */}
      {showChallengesOverlay && session?.gym_id && (
        <ActiveChallengesOverlay
          challenges={challenges}
          gymId={session.gym_id}
          onClose={() => setShowChallengesOverlay(false)}
        />
      )}

      <WorkoutSummaryModal
        visible={showWorkoutSummary}
        onClose={() => {
          setShowWorkoutSummary(false);
          // Navigate to summary after closing modal
          if (isPlanCompleted && session?.id) {
            handleFinishWorkout();
          }
        }}
        sessionStats={{
          duration,
          drops: Math.round(totalDropsShared.value),
          calories,
          exercisesCompleted: currentExerciseIndex + 1,
          planName: planId ? 'SmartCoach Plan' : undefined,
        }}
      />

      {/* Main Water Circle with Progress Ring */}
      <View style={styles.waterContainer}>
        {/* Radial gradient background behind gauge (back-lit effect) */}
        <View style={styles.gaugeBackgroundGlow} />
        <View style={styles.circleWrapper}>
          {/* Connecting State: Subtle pulse while waiting for BLE connection */}
          {!bleConnected && session?.machine_id && (session?.machine?.sensor_id || sensorId) && (
            <Animated.View
              style={[
                styles.connectingCircle,
                connectingPulseStyle,
                {
                  borderColor: theme.colors.textSecondary + '40',
                },
              ]}
            >
              <Text style={styles.connectingText}>
                Connecting to {session?.machine?.name || 'sensor'}...
              </Text>
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


          {/* LiquidGauge Component - Only show when BLE is connected */}
          {/* Render LiquidGauge FIRST so it's below CircularProgressRing */}
          {bleConnected && (
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

          {/* Circular Progress Ring - Only show when BLE is connected */}
          {/* Render AFTER LiquidGauge so it's on top */}
          {bleConnected && (
            <CircularProgressRing
              progress={progressJS}
              size={290}
              strokeWidth={3}
              rpm={ringIntensityShared}
              primaryColor={branding.primary}
            />
          )}

          {/* DROPS Label - Only show when BLE is connected */}
          {bleConnected && (
            <View style={styles.dropsLabelContainer}>
              <Text style={styles.dropsLabel}>{t('drops')}</Text>
              {isOverachieved && (
                <Text style={styles.overachievedText}>{t('overachieved')}</Text>
              )}
            </View>
          )}

          {/* Premium DropEmitter - Zero-Lag Optimized (no Skia per drop) */}
          {bleConnected && !isTrackingOnly && (
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

          {/* Hard cap / tracking-only badge */}
          {isTrackingOnly && bleConnected && (
            <View style={styles.trackingOnlyBadge}>
              <Ionicons name="fitness-outline" size={16} color="#93C5FD" />
              <Text style={styles.trackingOnlyText}>{t('trackingOnly')}</Text>
            </View>
          )}
          {/* Hard cap badge is now shown as a floating toast */}
        </View>
      </View>

      {/* Stats Grid */}
      {machineType === 'treadmill' ? (
        <View style={styles.statsGridTreadmill}>
          <View style={styles.statItemTreadmill}>
            <Ionicons name="time-outline" size={20} color={branding.primary} />
            <Text style={[styles.statValue, getNumberStyle(18)]}>
              {formatTime(duration)}
            </Text>
            <Text style={styles.statLabel}>Time</Text>
          </View>

          <View style={styles.statItemTreadmill}>
            <View style={styles.rpmHeader}>
              <Ionicons name="speedometer-outline" size={20} color={branding.primary} />
              {bleConnected && <SignalIndicator status={signalStatus} />}
            </View>
            <AnimatedText
              text={animatedSpeedText}
              style={[styles.statValue, getNumberStyle(18)]}
            />
            <Text style={styles.statLabel}>{t('kmh')}</Text>
          </View>

          <View style={styles.statItemTreadmill}>
            <Ionicons name="timer-outline" size={20} color={branding.primary} />
            <AnimatedText
              text={animatedPaceText}
              style={[styles.statValue, getNumberStyle(18)]}
            />
            <Text style={styles.statLabel}>{t('minPerKm')}</Text>
          </View>

          <View style={styles.statItemTreadmill}>
            <Ionicons name="flame" size={20} color={theme.colors.error} />
            <AnimatedText
              text={animatedCaloriesText}
              style={[styles.statValue, getNumberStyle(18)]}
            />
            <Text style={styles.statLabel}>{t('kcal')}</Text>
          </View>

          <View style={styles.statItemTreadmill}>
            <Ionicons name="navigate-outline" size={20} color={branding.primary} />
            <AnimatedText
              text={animatedDistanceText}
              style={[styles.statValue, getNumberStyle(18)]}
            />
            <Text style={styles.statLabel}>
              {ftmsTotalDistanceRef.current >= 1000 ? 'km' : 'm'}
            </Text>
          </View>

          <View style={styles.statItemTreadmill}>
            <Ionicons name="trending-up-outline" size={20} color={branding.primary} />
            <AnimatedText
              text={animatedInclineText}
              style={[styles.statValue, getNumberStyle(18)]}
            />
            <Text style={styles.statLabel}>{t('incline')} %</Text>
          </View>
        </View>
      ) : (
        <View style={styles.statsGrid}>
          <View style={styles.statItem}>
            <Ionicons name="time-outline" size={24} color={branding.primary} />
            <Text style={[styles.statValue, getNumberStyle(20)]}>
              {formatTime(duration)}
            </Text>
            <Text style={styles.statLabel}>Time</Text>
          </View>

          <View style={styles.statItem}>
            <Ionicons name="flame" size={24} color={theme.colors.error} />
            <AnimatedText
              text={animatedCaloriesText}
              style={[styles.statValue, getNumberStyle(20)]}
            />
            <Text style={styles.statLabel}>{t('kcal')}</Text>
          </View>

          <View style={styles.statItem}>
            <Ionicons name="speedometer-outline" size={24} color={branding.primary} />
            <AnimatedText
              text={animatedPaceText}
              style={[styles.statValue, getNumberStyle(20)]}
            />
            <Text style={styles.statLabel}>{t('minPerKm')}</Text>
          </View>

          {(session?.machine?.sensor_id || sensorId) && (
            <Animated.View style={[styles.statItem, rpmPulseStyle]}>
              <View style={styles.rpmHeader}>
                <Ionicons
                  name="pulse-outline"
                  size={24}
                  color={bleConnected ? branding.primary : theme.colors.textSecondary}
                />
                {bleConnected && (
                  <SignalIndicator status={signalStatus} />
                )}
              </View>
              <AnimatedText
                text={animatedRPMText}
                style={[
                  styles.statValue,
                  getNumberStyle(20),
                  rpmTextColorStyle,
                ]}
              />
              <Text style={styles.statLabel}>{t('rpm')}</Text>
            </Animated.View>
          )}
        </View>
      )}

      {/* Progress Bar */}
      <View style={styles.progressBarContainer}>
        <View style={styles.progressBar}>
          <View
              style={[
                styles.progressBarFill,
                {
                  width: progressWidth as any, // TypeScript workaround for percentage width
                  backgroundColor: isOverachieved ? theme.colors.secondary : branding.primary,
                },
              ]}
          />
        </View>
        <View style={styles.targetContainer}>
          <View style={styles.targetRow}>
            <Text style={styles.targetText}>{t('threshold')}</Text>
            <Text style={[styles.targetNumber, getNumberStyle(16)]}>{targetDrops}</Text>
            <Ionicons name="water" size={14} color={theme.colors.primary} />
            {sessionTier !== 'normal' && (
              <View style={[styles.tierBadge, sessionTier === 'tier2' && styles.tierBadgeTier2]}>
                <Text style={styles.tierBadgeText}>
                  {sessionTier === 'tier1' ? t('reducedRate') : t('deepReduced')}
                </Text>
              </View>
            )}
          </View>
          {!isTrackingOnly && (
            <View style={styles.dailyRemainingRow}>
              <Ionicons name="calendar-outline" size={12} color={theme.colors.textSecondary} />
              <Text style={styles.dailyRemainingText}>
                {t('dailyRemaining', { count: dailyRemaining })}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* NOTE: Tier toast and activity proof are rendered as floating overlays at the end of the component tree */}

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

      {/* Paused Overlay */}
      {isPaused && (
        <Animated.View style={[styles.pausedOverlay, pausedOverlayStyle]}>
          <Ionicons
            name={pauseReason === 'connection' ? 'bluetooth-outline' : 'pause-circle-outline'}
            size={48}
            color={theme.colors.text}
          />
          <Text style={styles.pausedText}>{pauseReason === 'connection' ? t('reconnecting') : t('paused')}</Text>
          <Text style={styles.pausedSubtext}>{pauseOverlayMessage}</Text>
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
                <Text style={styles.resumeOverlayButtonText}>{t('resume')}</Text>
              </>
            )}
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Auto-Pause Warning Overlay (when RPM = 0 for 10+ seconds) */}
      {showAutoPauseOverlay && !isPaused && (session?.machine?.sensor_id || sensorId) && (
        <Animated.View style={[styles.autoPauseOverlay, pausedOverlayStyle]} pointerEvents="none">
          <Ionicons name="warning-outline" size={48} color={theme.colors.warning || '#FFA500'} />
          <Text style={styles.autoPauseTitle}>{t('sensorNotSending')}</Text>
          <Text style={styles.autoPauseText}>
            {t('autoPauseWarning')}
          </Text>
        </Animated.View>
      )}

      {/* Sensor Asleep Overlay (when no data for 10+ seconds) */}
      {showSensorAsleep && !isPaused && (session?.machine?.sensor_id || sensorId) && (
        <Animated.View style={[styles.sensorAsleepOverlay, pausedOverlayStyle]}>
          <Ionicons name="bluetooth-outline" size={64} color={theme.colors.textSecondary} />
          <Text style={styles.sensorAsleepTitle}>{t('sensorAsleep')}</Text>
          <Text style={styles.sensorAsleepText}>
            {t('sensorAsleepText')}
          </Text>
          <TouchableOpacity
            style={styles.reconnectButton}
            onPress={async () => {
              setIsReconnecting(true);
              const activeSensorId = sensorId || session?.machine?.sensor_id;
              if (activeSensorId) {
                const reconnected = await bleService.reconnect();
                if (reconnected) {
                  // Success - no blocking alert, just update UI
                  setShowSensorAsleep(false);
                  setBleConnected(true);
                  setBleStatus('');
                  reconnectAttemptRef.current = 0; // Reset attempts
                } else {
                  // Failed - show persistent overlay, no blocking alert
                  setBleStatus('Reconnection failed. Please check sensor.');
                }
              }
              setIsReconnecting(false);
            }}
            disabled={isReconnecting}
          >
            {isReconnecting ? (
              <ActivityIndicator size="small" color={theme.colors.background} />
            ) : (
              <>
                <Ionicons name="refresh" size={20} color={theme.colors.background} />
                <Text style={styles.reconnectButtonText}>{t('reconnect')}</Text>
              </>
            )}
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* BLE Connection Required Overlay */}
      {!showNoActivityCancelOverlay && !isPaused && !bleConnected && session?.machine_id && (session?.machine?.sensor_id || sensorId) && (
        <Animated.View style={[styles.bleConnectionOverlay, pausedOverlayStyle]}>
          <ActivityIndicator size="large" color={branding.primary} />
          <Text style={styles.bleConnectionTitle}>{t('connecting')}</Text>
          <Text style={styles.bleConnectionText}>
            {bleStatus || t('connectingSubtitle')}
          </Text>
        </Animated.View>
      )}

      {/* Control Buttons */}
      <View style={styles.controls}>
        {/* Pause/Resume Button */}
        <TouchableOpacity
          style={[styles.controlButton, styles.pauseButton]}
          onPress={() => {
            if (isPaused) {
              void resumeWorkout();
            } else {
              pauseWorkout();
            }
          }}
          activeOpacity={0.8}
        >
          <Ionicons
            name={isPaused ? 'play' : 'pause'}
            size={24}
            color={theme.colors.text}
          />
        </TouchableOpacity>

        {/* Finish Button (Long Press) */}
        <Pressable
          style={styles.finishButtonContainer}
          onPressIn={handleFinishPressIn}
          onPressOut={handleFinishPressOut}
        >
          <View style={styles.finishButton}>
            <Animated.View style={[styles.finishButtonFill, finishButtonStyle]} />
            <Text style={styles.finishButtonText}>{t('finishWorkout')}</Text>
          </View>
        </Pressable>
      </View>
      {/* Floating toast notifications — absolutely positioned, no layout shift */}
      {tierToast && (
        <Animated.View
          entering={FadeIn.duration(250)}
          exiting={FadeOut.duration(250)}
          style={styles.floatingToast}
          pointerEvents="none"
        >
          <View style={styles.floatingToastInner}>
            <Ionicons name="trending-down-outline" size={16} color="#FDE68A" />
            <Text style={styles.floatingToastText}>{tierToast}</Text>
          </View>
        </Animated.View>
      )}

      {awaitingActivityProof && !isPaused && bleConnected && (
        <Animated.View
          entering={FadeIn.duration(250)}
          exiting={FadeOut.duration(250)}
          style={styles.floatingToast}
          pointerEvents="none"
        >
          <View style={[styles.floatingToastInner, styles.floatingToastWarning]}>
            <Ionicons name="shield-checkmark-outline" size={16} color={theme.colors.warning || '#F59E0B'} />
            <Text style={[styles.floatingToastText, styles.floatingToastTextWarning]}>{t('activityProofPending')}</Text>
          </View>
        </Animated.View>
      )}

      {hardCapHitDuringSession && !isTrackingOnly && bleConnected && (
        <Animated.View
          entering={FadeIn.duration(250)}
          style={styles.floatingToast}
          pointerEvents="none"
        >
          <View style={[styles.floatingToastInner, styles.floatingToastInfo]}>
            <Ionicons name="calendar-outline" size={16} color="#93C5FD" />
            <Text style={[styles.floatingToastText, styles.floatingToastTextInfo]}>{t('hardDayCapReached')}</Text>
          </View>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0E1A', // Dark navy/charcoal
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  leftHeader: {
    flex: 1,
  },
  gymTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.full,
    alignSelf: 'flex-start',
  },
  gymTagText: {
    ...fontStyles.bodyMedium,
    color: theme.colors.textSecondary,
    fontSize: theme.typography.fontSize.sm,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  challengesButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  challengesBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  challengesBadgeText: {
    ...fontStyles.heading,
    fontSize: 12,
  },
  headerDrops: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.full,
  },
  headerDropsText: {
    ...fontStyles.number,
    color: theme.colors.primary,
  },
  bonusBanner: {
    backgroundColor: theme.colors.primary + '20',
    paddingVertical: theme.spacing.sm,
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  bonusText: {
    ...fontStyles.heading,
    color: theme.colors.text,
    fontSize: 18,
    textAlign: 'center',
  },
  waterContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
    position: 'relative',
  },
  gaugeBackgroundGlow: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: theme.colors.primary + '08', // Very subtle radial glow
    opacity: 0.6,
  },
  circleWrapper: {
    width: 280,
    height: 280,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadows.md,
  },
  connectingCircle: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    borderWidth: 2,
    borderStyle: 'solid',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surface + 'CC', // Semi-transparent background for better visibility
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  connectingText: {
    ...fontStyles.bodySemiBold,
    color: theme.colors.text,
    fontSize: theme.typography.fontSize.lg,
    textAlign: 'center',
    paddingHorizontal: theme.spacing.lg,
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  explosionCircle: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    borderWidth: 3,
    borderStyle: 'solid',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 10,
  },
  premiumPulseRing: {
    position: 'absolute',
    borderWidth: 2,
    borderStyle: 'solid',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 15,
    shadowOpacity: 0.6,
    elevation: 8,
  },
  headerBlur: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  statCardBlur: {
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
  },
  fallingDropsContainer: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140, // 280 / 2 for perfect circle
    overflow: 'hidden',
    top: 0,
    left: 0,
    justifyContent: 'flex-start',
  },
  dropsLabelContainer: {
    position: 'absolute',
    bottom: 60,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    width: '100%',
  },
  dropsLabel: {
    ...fontStyles.heading,
    color: theme.colors.text,
    fontSize: 18,
    letterSpacing: 2,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  overachievedText: {
    ...fontStyles.bodySemiBold,
    color: theme.colors.secondary,
    fontSize: theme.typography.fontSize.sm,
    marginTop: theme.spacing.xs,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },
  statsGridTreadmill: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.lg,
    rowGap: theme.spacing.md,
  },
  statItemTreadmill: {
    alignItems: 'center',
    gap: theme.spacing.xs,
    width: '33%',
  },
  rpmHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  statItem: {
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  statValue: {
    ...fontStyles.number,
    color: theme.colors.text,
  },
  statLabel: {
    ...fontStyles.heading,
    color: theme.colors.textSecondary,
    fontSize: theme.typography.fontSize.sm,
  },
  progressBarContainer: {
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },
  progressBar: {
    height: 8,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.sm,
    marginBottom: theme.spacing.sm,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: theme.borderRadius.sm,
  },
  targetContainer: {
    alignItems: 'center',
    gap: 2,
  },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  targetText: {
    ...fontStyles.body,
    color: theme.colors.textSecondary,
    fontSize: theme.typography.fontSize.sm,
  },
  targetNumber: {
    ...fontStyles.number,
    color: theme.colors.text,
  },
  tierBadge: {
    backgroundColor: 'rgba(120, 80, 0, 0.55)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 4,
  },
  tierBadgeTier2: {
    backgroundColor: 'rgba(180, 50, 50, 0.55)',
  },
  tierBadgeText: {
    ...fontStyles.body,
    fontSize: 11,
    color: '#FDE68A',
    fontWeight: theme.typography.fontWeight.medium,
  },
  dailyRemainingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  dailyRemainingText: {
    ...fontStyles.body,
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
  floatingToast: {
    position: 'absolute',
    top: 100,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 999,
  },
  floatingToastInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(120, 80, 0, 0.92)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxWidth: '85%',
    ...theme.shadows.md,
  },
  floatingToastWarning: {
    backgroundColor: 'rgba(120, 80, 0, 0.92)',
  },
  floatingToastInfo: {
    backgroundColor: 'rgba(30, 64, 120, 0.92)',
  },
  floatingToastText: {
    ...fontStyles.body,
    fontSize: 13,
    color: '#FDE68A',
    flexShrink: 1,
  },
  floatingToastTextWarning: {
    color: '#FDE68A',
  },
  floatingToastTextInfo: {
    color: '#93C5FD',
  },
  inactivityOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 120,
    paddingHorizontal: theme.spacing.xl,
  },
  inactivityTitle: {
    ...fontStyles.heading,
    color: theme.colors.text,
    fontSize: 24,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  inactivityText: {
    ...fontStyles.body,
    color: '#FDE68A',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  inactivityHint: {
    ...fontStyles.body,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.md,
    textAlign: 'center',
  },
  trackingOnlyBadge: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(30, 64, 120, 0.75)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  trackingOnlyText: {
    ...fontStyles.body,
    color: '#93C5FD',
    fontSize: 13,
    fontWeight: theme.typography.fontWeight.medium,
  },
  noActivityCancelOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 130,
    paddingHorizontal: theme.spacing.xl,
  },
  noActivityCancelTitle: {
    ...fontStyles.heading,
    color: theme.colors.text,
    fontSize: 24,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  noActivityCancelText: {
    ...fontStyles.body,
    color: '#FECACA',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: theme.spacing.xl,
  },
  noActivityCancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.full,
  },
  noActivityCancelButtonText: {
    ...fontStyles.body,
    color: theme.colors.background,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  pausedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  pausedText: {
    ...fontStyles.heading,
    color: theme.colors.text,
    fontSize: 30,
    letterSpacing: 4,
  },
  pausedSubtext: {
    ...fontStyles.body,
    color: theme.colors.textSecondary,
    fontSize: 14,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
    textAlign: 'center',
    paddingHorizontal: theme.spacing.xl,
  },
  resumeOverlayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minWidth: 160,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
  },
  resumeOverlayButtonDisabled: {
    opacity: 0.6,
  },
  resumeOverlayButtonText: {
    ...fontStyles.body,
    color: theme.colors.background,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  autoPauseOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
    padding: theme.spacing.xl,
  },
  autoPauseTitle: {
    ...fontStyles.heading,
    color: theme.colors.text,
    fontSize: 22,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  autoPauseText: {
    ...fontStyles.body,
    color: theme.colors.textSecondary,
    fontSize: theme.typography.fontSize.base,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: theme.spacing.lg,
  },
  sensorAsleepOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
    padding: theme.spacing.xl,
  },
  sensorAsleepTitle: {
    ...fontStyles.heading,
    color: theme.colors.text,
    fontSize: 22,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  sensorAsleepText: {
    ...fontStyles.body,
    color: theme.colors.textSecondary,
    fontSize: theme.typography.fontSize.base,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
  },
  reconnectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.full,
    marginTop: theme.spacing.md,
  },
  reconnectButtonText: {
    ...fontStyles.heading,
    color: theme.colors.background,
    fontSize: 18,
  },
  bleConnectionOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
    padding: theme.spacing.xl,
  },
  bleConnectionTitle: {
    ...fontStyles.heading,
    color: theme.colors.text,
    fontSize: 22,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  bleConnectionText: {
    ...fontStyles.body,
    color: theme.colors.textSecondary,
    fontSize: theme.typography.fontSize.base,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: theme.spacing.lg,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },
  controlButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadows.md,
  },
  pauseButton: {
    backgroundColor: theme.colors.surface,
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  finishButtonContainer: {
    flex: 1,
  },
  nextExerciseContainer: {
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
  },
  nextExerciseContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  nextExerciseText: {
    ...fontStyles.bodySemiBold,
    fontSize: theme.typography.fontSize.lg,
    flex: 1,
  },
  nextExerciseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
  },
  nextExerciseButtonText: {
    ...fontStyles.heading,
    fontSize: 18,
  },
  finishButton: {
    height: 56,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.error,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    ...theme.shadows.md,
  },
  finishButtonFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: theme.colors.secondary,
    opacity: 0.8,
  },
  finishButtonText: {
    ...fontStyles.heading,
    color: theme.colors.text,
    fontSize: 20,
    zIndex: 1,
  },
  planCompletedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  planCompletedContainer: {
    padding: theme.spacing.xl,
    borderRadius: theme.borderRadius.xl,
    alignItems: 'center',
    gap: theme.spacing.md,
    borderWidth: 2,
    margin: theme.spacing.lg,
  },
  planCompletedTitle: {
    ...fontStyles.heading,
    fontSize: 26,
    textAlign: 'center',
  },
  planCompletedSubtitle: {
    ...fontStyles.body,
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
});
