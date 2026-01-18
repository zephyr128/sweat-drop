import { View, Text, StyleSheet, TouchableOpacity, Alert, Pressable, ActivityIndicator, AppState, AppStateStatus } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
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
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { theme, getNumberStyle } from '@/lib/theme';
import LiquidGauge, { LiquidGaugeRef } from '@/components/LiquidGauge';
import { DropEmitter } from '@/components/DropEmitter';
import CircularProgressRing from '@/components/CircularProgressRing';
import GoalTracker from '@/components/GoalTracker';
import WorkoutSummaryModal from '@/components/WorkoutSummaryModal';
import { useChallengeProgress } from '@/hooks/useChallengeProgress';
import { bleService, CSCMeasurement } from '@/lib/ble-service';
import { useBranding } from '@/lib/hooks/useBranding';
import { useTheme } from '@/lib/contexts/ThemeContext';

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

export default function WorkoutScreen() {
  const { sessionId, equipmentId, gymId, machineType: paramMachineType, sensorId, planId, machineId } = useLocalSearchParams<{
    sessionId?: string;
    equipmentId?: string;
    gymId?: string;
    machineType?: string;
    sensorId?: string;
    planId?: string;
    machineId?: string;
  }>();
  const { branding } = useTheme();
  const brandingHook = useBranding();
  const [session, setSession] = useState<any>(null);
  // REMOVED: drops, displayDrops, earnedDrops, activeDrops, rpm, smoothedRPM - now using SharedValues
  const [duration, setDuration] = useState(0);
  const [calories, setCalories] = useState(0);
  // REMOVED: pace useState - now using animatedPaceText SharedValue
  const [targetDrops, setTargetDrops] = useState(500);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [pausedTime, setPausedTime] = useState<Date | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [challengeMessage, setChallengeMessage] = useState<string | null>(null);
  const [averageRPM, setAverageRPM] = useState<number>(0); // Average RPM for database sync (low frequency, OK to use state)
  const [showAutoPauseOverlay, setShowAutoPauseOverlay] = useState(false);
  const [showSensorAsleep, setShowSensorAsleep] = useState(false);
  const [showPlanCompleted, setShowPlanCompleted] = useState(false);
  const [showWorkoutSummary, setShowWorkoutSummary] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const reconnectAttemptRef = useRef<number>(0); // Track reconnect attempts for exponential backoff
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastCrankRevolutionsForAutoResumeRef = useRef<number>(0); // Track for auto-resume
  const [bleConnected, setBleConnected] = useState(false);
  const [bleStatus, setBleStatus] = useState<string>('');
  const [signalStatus, setSignalStatus] = useState<'ok' | 'lost'>('ok');
  const router = useRouter();
  const { session: authSession } = useSession();
  const liquidGaugeRef = useRef<LiquidGaugeRef>(null);
  // DropEmitter now uses drops prop instead of imperative API
  const [activeDrops, setActiveDrops] = useState<Array<{ id: string; startX: number; progress: number }>>([]);
  const isMountedRef = useRef<boolean>(true); // Track if component is mounted
  const lastHapticTimeRef = useRef<number>(0); // Throttle haptic feedback (max 5/s)
  const saveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const challengeUpdateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastChallengeUpdateRef = useRef<number>(0);
  const challengeMessageTimerRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const bleMonitoringRef = useRef<boolean>(false);
  const lastRPMTimeRef = useRef<number>(Date.now());
  const autoPauseTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastRPMUpdateRef = useRef<number>(0);
  // BLE Data Optimization: Track last measurement to filter duplicates
  const lastMeasurementRef = useRef<{ crankRevolutions: number; lastCrankEventTime: number } | null>(null);
  // Drop calculation: Track last crank revolutions for drop calculation
  const lastCrankRevolutionsRef = useRef<number>(0);
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

  // Sync JS state to SharedValues for useAnimatedReaction dependencies
  useEffect(() => {
    isPausedShared.value = isPaused ? 1 : 0;
  }, [isPaused, isPausedShared]);

  useEffect(() => {
    bleConnectedShared.value = bleConnected ? 1 : 0;
  }, [bleConnected, bleConnectedShared]);

  // AppState listener: Disable heavy animations when app goes to background
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        // Pause heavy animations (Skia) when app goes to background
        // BLE connection remains active
        console.log('[Workout] App went to background - animations paused');
      } else if (nextAppState === 'active') {
        // Resume animations when app comes to foreground
        console.log('[Workout] App came to foreground - animations resumed');
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      
      // Cancel all animations on unmount
      cancelAnimation(rawRPMShared);
      cancelAnimation(smoothedRPMShared);
      cancelAnimation(earnedDropsShared);
      cancelAnimation(totalDropsShared);
      cancelAnimation(progressShared);
      cancelAnimation(goalPercentageShared);
      cancelAnimation(currentProgressShared);
      
      // Cleanup reconnect timer
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, []);

  // Debug logging
  useEffect(() => {
    console.log('[Workout] Machine type determined:', {
      paramMachineType,
      machineType: session?.machine?.type,
      equipmentType: session?.equipment?.equipment_type,
      finalMachineType: machineType,
      gymId: session?.gym_id,
    });
  }, [paramMachineType, session?.machine?.type, session?.equipment?.equipment_type, machineType, session?.gym_id]);

  // Load challenge progress
  const { challenges, updateProgress, refresh: refreshChallenges } = useChallengeProgress(
    session?.gym_id || null,
    machineType
  );

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

      try {
        console.log('[SmartCoach] Loading plan item for planId:', planId, 'machineId:', activeMachineId, 'index:', currentExerciseIndex);
        
        const { data, error } = await supabase.rpc('get_plan_item_for_machine', {
          p_plan_id: planId,
          p_machine_id: activeMachineId,
          p_current_index: currentExerciseIndex,
        });

        if (error) {
          console.error('[SmartCoach] Error loading plan item:', error);
          setIsSmartCoachMode(false);
          setCurrentPlanItem(null);
          return;
        }

        // CRITICAL GUARD: Only set currentPlanItem if plan is not completed
        // This prevents useEffect from overwriting currentPlanItem with null during completion
        if (isPlanCompleted) {
          console.log('[SmartCoach] Plan already completed, skipping loadPlanItem');
          return;
        }

        if (data && data.length > 0) {
          const item = data[0];
          console.log('[SmartCoach] Loaded plan item:', item);
          
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
          console.log('[SmartCoach] No plan item found for current index - plan may be completed');
          // CRITICAL: Only set currentPlanItem to null if plan is not already marked as completed
          // This prevents race condition where handleNextExercise already set isPlanCompleted=true
          if (!isPlanCompleted) {
            setIsSmartCoachMode(false);
            setCurrentPlanItem(null);
          }
        }
      } catch (err) {
        console.error('[SmartCoach] Error in loadPlanItem:', err);
        setIsSmartCoachMode(false);
        setCurrentPlanItem(null);
      }
    };

    loadPlanItem();
  }, [planId, machineId, session?.machine_id, currentExerciseIndex, authSession?.user]);

  // BLE Monitoring - REQUIRED to start workout
  useEffect(() => {
    // Use sensorId from params or from session.machine
    const activeSensorId = sensorId || session?.machine?.sensor_id;
    
    if (!session?.machine_id || !activeSensorId || isPaused) {
      setBleConnected(false);
      return;
    }
    let isMonitoring = false;

    const startBLEMonitoring = async () => {
      try {
        console.log('[Workout] Connecting to BLE sensor:', activeSensorId);
        
        // Set up status callback for UI feedback
        bleService.setStatusCallback((status: string) => {
          setBleStatus(status);
          // Update signal status based on status message
          if (status === 'Signal OK') {
            setSignalStatus('ok');
          } else if (status === 'Signal Lost') {
            setSignalStatus('lost');
          }
        });
        
        try {
          const connected = await bleService.connectToDevice(activeSensorId);
          
          if (!connected) {
            throw new Error('Connection returned false');
          }
        } catch (connectError: any) {
          console.error('[Workout] BLE connection error:', connectError);
          setBleConnected(false);
          
          // Unlock machine if connection fails
          if (session?.machine_id && authSession?.user) {
            try {
              await supabase.rpc('unlock_machine', {
                p_machine_id: session.machine_id,
                p_user_id: authSession.user.id,
              });
              console.log('[Workout] Machine unlocked due to connection failure');
            } catch (unlockError) {
              console.error('[Workout] Error unlocking machine:', unlockError);
            }
          }
          
          // CRITICAL: No blocking Alert.alert() - use UI overlay instead
          console.error('[Workout] BLE Connection Failed:', connectError?.message);
          setBleStatus(connectError?.message || 'Connection failed. Auto-reconnecting...');
          setIsReconnecting(true);
          
          // Exponential Backoff: Retry after 1s, 2s, 4s
          reconnectAttemptRef.current = 0;
          const attemptReconnect = async () => {
            reconnectAttemptRef.current++;
            const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current - 1), 4000); // 1s, 2s, 4s max
            
            console.log(`[Workout] Reconnect attempt ${reconnectAttemptRef.current} after ${delay}ms`);
            
            try {
              const reconnected = await bleService.reconnect();
              if (reconnected) {
                console.log('[Workout] Auto-reconnected successfully');
                setIsReconnecting(false);
                setBleConnected(true);
                setBleStatus('');
                reconnectAttemptRef.current = 0;
                
                // Restart monitoring
                await startBLEMonitoring();
              } else if (reconnectAttemptRef.current < 3) {
                // Retry up to 3 times
                reconnectTimerRef.current = setTimeout(attemptReconnect, delay);
              } else {
                // Max attempts reached - show persistent reconnecting overlay
                console.log('[Workout] Max reconnect attempts reached, showing persistent overlay');
                setIsReconnecting(true);
                setBleStatus('Connection lost. Please check sensor.');
              }
            } catch (reconnectError) {
              console.error('[Workout] Reconnect error:', reconnectError);
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
            console.error('[Workout] Error verifying session ownership:', error);
            return false;
          }
        };

        // Start monitoring CSC measurements with sleep detection and reconnect
        await bleService.startMonitoring(
          async (measurement: CSCMeasurement) => {
            const now = Date.now();
            
            // Hard Fix: Glitch Filter - Ignore sudden drop to 0 if we're currently moving fast (> 20 RPM)
            // Ako je measurement.rpm === 0, ali je trenutna rawRPM.value > 20, to je verovatno glitch senzora
            // Ignoriši taj paket i nemoj setovati nulu. Nulu postavi samo ako je prethodni RPM bio nizak ili ako Watchdog potvrdi tišinu
            if (measurement.rpm === 0 && rawRPMShared.value > 20) {
              // High RPM - this is likely a sensor glitch, ignore it
              // Watchdog will handle real 0 when sensor actually stops
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
            
            console.log('[Workout] BLE Measurement:', measurement, 'RawRPM:', measurement.rpm);
            // EXC_BAD_ACCESS fix: skip all setState/native calls if unmounted (BLE can fire after cleanup)
            if (!isMountedRef.current) return;
            // Update signal status to OK when data arrives
            setSignalStatus('ok');
            
            // Critical Fix: Update last packet timestamp immediately for Watchdog
            lastPacketTime.value = now;
            
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
            if (currentRevolutions > lastCrankRevolutionsForAutoResumeRef.current && isPaused && isMountedRef.current) {
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
              
              // Step-to-Drop Calibration: For walking mode, emit drop for each step
              // Even if RPM is 0 (during grace period), if revolutions increased, it's a step
              if (revolutionDelta > 0) {
                // Walking Mode Detection: Low RPM (< stepDetectionThreshold)
                // Walking mode suggests patica (shoe sensor) where steps are detected even with 0 RPM between steps
                const isWalkingMode = (measurement.rpm > 0 && measurement.rpm < stepDetectionThreshold);
                
                // NATIVE-DRIVEN: Machine-specific drop logic
                // Get machine type (treadmill or bike)
                const currentMachineType = machineType || 'treadmill';
                
                // Machine-specific calibration
                let newDrops = 0;
                if (currentMachineType === 'treadmill') {
                  // Treadmill: 1 impulse = 1 drop
                  newDrops = revolutionDelta;
                } else if (currentMachineType === 'bike') {
                  // Bike: 5 impulses = 1 drop
                  newDrops = Math.floor(revolutionDelta / 5);
                } else {
                  // Default: 1 drop per 10 revolutions (cycling mode)
                  newDrops = Math.floor(revolutionDelta / 10);
                }
                
                if (newDrops > 0 && isMountedRef.current) {
                  // NATIVE-DRIVEN: Update SharedValues directly (no setState)
                  earnedDropsShared.value = earnedDropsShared.value + newDrops;
                  totalDropsShared.value = totalDropsShared.value + newDrops;
                  
                  // PRO-FITNESS: Track total crank revolutions for bike (for kcal and pace calculation)
                  if (currentMachineType === 'bike') {
                    totalCrankRevolutionsShared.value = totalCrankRevolutionsShared.value + revolutionDelta;
                  }
                  
                  // Get current progress for drop emitter
                  const currentProgress = Math.min(totalDropsShared.value / targetDrops, 1);
                  
                  // PRO-FITNESS: Add drops to state array for DropEmitter
                  const newDropObjects: Array<{ id: string; startX: number; progress: number }> = [];
                  for (let i = 0; i < newDrops; i++) {
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
                  
                  // PRO-FITNESS: Trigger liquid gauge impact when new drop falls
                  // EXC_BAD_ACCESS fix: try-catch in case native view was deallocated
                  try {
                    liquidGaugeRef.current?.triggerImpact();
                  } catch (_) { /* ignore if unmounted/deallocated */ }
                  
                  // Trigger drop jump animation
                  dropJumpScale.value = withSequence(
                    withTiming(1.15, { duration: 150, easing: Easing.out(Easing.ease) }),
                    withTiming(1, { duration: 150, easing: Easing.in(Easing.ease) })
                  );
                  
                  // Haptic feedback (throttled - max 5/s = 200ms minimum)
                  const now = Date.now();
                  if (!lastHapticTimeRef.current || now - lastHapticTimeRef.current >= 200) {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    lastHapticTimeRef.current = now;
                  }
                }
                
                // Update last crank revolutions based on machine type
                if (currentMachineType === 'treadmill') {
                  lastCrankRevolutionsRef.current = currentRevolutions;
                } else if (currentMachineType === 'bike') {
                  const remainingRevolutions = revolutionDelta % 5;
                  lastCrankRevolutionsRef.current = currentRevolutions - remainingRevolutions;
                } else {
                  const remainingRevolutions = revolutionDelta % 10;
                  lastCrankRevolutionsRef.current = currentRevolutions - remainingRevolutions;
                }
                
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
                  console.error('[Workout] Failed to update RPM:', error);
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
                    console.error('[SmartCoach] Error calculating percentage:', error);
                  }
                }
              }
            }
            
            // Update last RPM time (use raw RPM, not smoothed, for accurate detection)
            // This ensures we detect when sensor actually stops
            if (rawRPM > 0) {
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
                    setIsPaused(true);
                    setShowAutoPauseOverlay(false);
                    Alert.alert(
                      'Workout Paused',
                      'Trening je automatski pauziran jer senzor ne šalje podatke. Proverite konekciju sa senzorom.',
                      [{ text: 'OK' }]
                    );
                  }
                }, 1000);
              }
            }
          },
          // onSleep callback - triggered when no data for 10+ seconds
          () => {
            // Battery Optimization: Only log critical events
            setShowSensorAsleep(true);
          },
          // onReconnect callback - verify session ownership
          verifySessionOwnership
        );

        // Battery Optimization: Only log critical events
        setBleStatus(''); // Clear status when connected
      } catch (error: any) {
        console.error('[Workout] BLE monitoring error:', error);
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
            console.log('[Workout] Machine unlocked due to monitoring failure');
          } catch (unlockError) {
            console.error('[Workout] Error unlocking machine:', unlockError);
          }
        }
        
        // CRITICAL: No blocking Alert.alert() - use UI overlay instead
        // Set reconnecting state to show overlay
        setIsReconnecting(true);
        setBleStatus(error?.message || 'Connection failed. Auto-reconnecting...');
        
        // Exponential Backoff: Retry after 1s, 2s, 4s
        reconnectAttemptRef.current = 0;
        const attemptReconnect = async () => {
          reconnectAttemptRef.current++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current - 1), 4000); // 1s, 2s, 4s max
          
          console.log(`[Workout] Reconnect attempt ${reconnectAttemptRef.current} after ${delay}ms`);
          
          try {
            const reconnected = await bleService.reconnect();
            if (reconnected) {
              console.log('[Workout] Auto-reconnected successfully');
              setIsReconnecting(false);
              setBleConnected(true);
              setBleStatus('');
              reconnectAttemptRef.current = 0;
              
              // Restart monitoring
              await startBLEMonitoring();
            } else if (reconnectAttemptRef.current < 3) {
              // Retry up to 3 times
              reconnectTimerRef.current = setTimeout(attemptReconnect, delay);
            } else {
              // Max attempts reached - show persistent reconnecting overlay
              console.log('[Workout] Max reconnect attempts reached, showing persistent overlay');
              setIsReconnecting(true);
              setBleStatus('Connection lost. Please check sensor.');
            }
          } catch (reconnectError) {
            console.error('[Workout] Reconnect error:', reconnectError);
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
    }, [session?.machine_id, session?.machine?.sensor_id, sensorId, isPaused, authSession?.user]);

  // Heartbeat update (every 10 seconds) and RPM update (every 30 seconds)
  useEffect(() => {
    if (!session?.machine_id || !authSession?.user || isPaused) {
      return;
    }

    const updateHeartbeat = async () => {
      try {
        await supabase.rpc('update_machine_heartbeat', {
          p_machine_id: session.machine_id,
          p_user_id: authSession.user.id,
        });
      } catch (error) {
        console.error('[Workout] Heartbeat update error:', error);
      }
    };

    // Update heartbeat immediately, then every 10 seconds
    updateHeartbeat();
    heartbeatIntervalRef.current = setInterval(updateHeartbeat, 10000);

    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    };
  }, [session?.machine_id, authSession?.user, isPaused]);

  
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
              average_rpm: averageRPM > 0 ? averageRPM : null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', session.id);
          
          // Battery Optimization: Only log critical events
        } catch (error) {
          console.error('[Workout] Final sync error:', error);
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
    
    // Hard Fix: Watchdog Reset - If no data for more than 2.5s, force direct reset to 0
    // Set rawRPM.value = 0 directly (without animation) to ensure total reset
    // This guarantees exact 0.00 value, no settling on small values like 1-10
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
                    if (__DEV__) console.warn('[SmartCoach] Haptics error:', hapticsError);
                  }
                }
                
                // CRITICAL: Automatically move to next exercise after a short delay (1.5 seconds)
                // This provides better UX - user sees completion feedback, then automatically advances
                // If this is the last exercise, handleNextExercise will detect it and show plan completion overlay
                // Use runOnJS to safely call handleNextExercise from worklet
                runOnJS(() => {
                  setTimeout(() => {
                    if (isMountedRef.current && !isPlanCompleted) {
                      console.log('[SmartCoach] Auto-advancing to next exercise after completion');
                      handleNextExercise();
                    }
                  }, 1500);
                })();
              }
            } catch (e) {
              if (__DEV__) console.warn('[SmartCoach] runOnJS completion error:', e);
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
      console.log('[SmartCoach] handleNextExercise blocked - plan completed or unmounting');
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
        console.log('[SmartCoach] Plan completed! No more exercises found at index:', nextIndex);
        
        // CRITICAL: Stop all intervals BEFORE setting completion flags to prevent crashes
        // Clear time-based progress interval
        if (timeProgressIntervalRef.current) {
          clearInterval(timeProgressIntervalRef.current);
          timeProgressIntervalRef.current = null;
        }
        
        // Clear save/sync intervals
        if (saveIntervalRef.current) {
          clearInterval(saveIntervalRef.current);
          saveIntervalRef.current = null;
        }
        
        if (syncIntervalRef.current) {
          clearInterval(syncIntervalRef.current);
          syncIntervalRef.current = null;
        }
        
        // Clear heartbeat interval
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }
        
        // Clear challenge update interval
        if (challengeUpdateIntervalRef.current) {
          clearInterval(challengeUpdateIntervalRef.current);
          challengeUpdateIntervalRef.current = null;
        }
        
        // Clear all timers
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        
        if (challengeMessageTimerRef.current) {
          clearTimeout(challengeMessageTimerRef.current);
          challengeMessageTimerRef.current = null;
        }
        
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
              console.log('[SmartCoach] Navigating to session summary after plan completion');
              handleFinishWorkout();
            } catch (navError) {
              console.error('[SmartCoach] Error navigating to summary:', navError);
              // Fallback: Try direct navigation if handleFinishWorkout fails
              if (isMountedRef.current && session?.id) {
                try {
                  router.push({
                    pathname: '/session-summary',
                    params: {
                      sessionId: session.id,
                      drops: Math.round(totalDropsShared.value).toString(),
                      duration: duration.toString(),
                    },
                  });
                } catch (routerError) {
                  console.error('[SmartCoach] Error with direct navigation:', routerError);
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
        console.error('[SmartCoach] Invalid plan item received');
        return;
      }
      
      // Machine Switch Logic: Check if next exercise requires different machine
      const nextMachineId = item.machine_id || item.machine?.id;
      const currentMachineId = activeMachineId;
      
      if (nextMachineId && nextMachineId !== currentMachineId) {
        console.log('[SmartCoach] Next exercise requires different machine:', {
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
      console.log('[SmartCoach] Moved to next exercise:', item.exercise_name);
    } catch (err) {
        console.error('[SmartCoach] Error in handleNextExercise:', err);
        Alert.alert('Error', 'Failed to move to next exercise. Please try again.');
    }
  }, [planId, machineId, session?.machine_id, currentExerciseIndex, authSession?.user, isPlanCompleted]);

  // NATIVE-DRIVEN: Display numbers using SharedValue (no re-renders)
  // These run entirely on UI thread
  const animatedRPMText = useSharedValue('--');
  const animatedDropsText = useSharedValue('0');
  const animatedCaloriesText = useSharedValue('0');
  const animatedPaceText = useSharedValue('0:00');
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
  // Pace = Time (seconds) / Distance (km) = seconds per km
  // Then convert to min:sec format
  // Distance for treadmill = total_drops * 0.0008 (average step 0.8m)
  // Distance for bike = ukupni_obrtaji * 0.002 (krug od 2m)
  // If RPM is 0 or distance is 0, display --:--
  useAnimatedReaction(
    () => [duration, totalDropsShared.value, totalCrankRevolutionsShared.value, smoothedRPMShared.value, machineType] as const,
    ([timeSeconds, drops, totalRevolutions, rpm, mType]) => {
      'worklet';
      const currentMachineType = mType || 'treadmill';
      
      // If RPM is 0, display --:--
      if (rpm === 0) {
        animatedPaceText.value = '--:--';
        return;
      }
      
      let distanceKm = 0;
      
      if (currentMachineType === 'treadmill') {
        // Treadmill: Distance = drops * 0.0008 km (0.8m per step)
        distanceKm = drops * 0.0008;
      } else {
        // Bike: Distance = ukupni_obrtaji * 0.002 (krug od 2m)
        distanceKm = totalRevolutions * 0.002;
      }
      
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
  // PREMIUM UI: LiquidGauge Progress Calculation with Damping
  // ============================================================================
  // Advanced Liquid: Progress follows drops with slight damping to create realistic liquid bubbling effect
  // LiquidGauge already receives smoothedRPMShared for dynamic glow synchronization
  useAnimatedReaction(
    () => totalDropsShared.value,
    (drops) => {
      'worklet';
      // Calculate target progress
      const targetProgress = Math.min(drops / targetDrops, 1);
      // Apply slight damping for realistic liquid movement (smooth transition, not instant)
      progressShared.value = withTiming(targetProgress, {
        duration: 300, // Small delay creates realistic liquid bubbling effect
        easing: Easing.out(Easing.quad),
      });
    },
    [totalDropsShared, targetDrops]
  );

  // PRO-FITNESS: Calculate calories based on machine type
  // Bike: Kcal = (ukupni_obrtaji * 0.15)
  // Treadmill: Kcal = (ukupno_kapi * 0.04)
  useAnimatedReaction(
    () => [totalDropsShared.value, totalCrankRevolutionsShared.value, machineType] as const,
    ([drops, totalRevolutions, mType]) => {
      'worklet';
      const currentMachineType = mType || 'treadmill';
      
      if (currentMachineType === 'bike') {
        // Bike formula: Kcal = (ukupni_obrtaji * 0.15)
        caloriesShared.value = Math.floor(totalRevolutions * 0.15);
      } else {
        // Treadmill formula: Kcal = (ukupno_kapi * 0.04)
        caloriesShared.value = Math.floor(drops * 0.04);
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

  // Create new session
  const createSession = async () => {
    if (!authSession?.user || !equipmentId || !gymId) {
      console.error('Missing required data for session:', { user: !!authSession?.user, equipmentId, gymId });
      return;
    }

    // GYM SUSPEND CHECK: Verify gym is not suspended before creating session
    const { data: gym, error: gymError } = await supabase
      .from('gyms')
      .select('id, name, status, is_suspended')
      .eq('id', gymId)
      .single();

    if (gymError || !gym) {
      console.error('Error fetching gym:', gymError);
      // CRITICAL: No blocking Alert.alert() - log error and continue
      console.error('[Workout] Failed to verify gym status');
      // Continue with workout - user can still use the app
      return; // Exit early if gym not found
    }

    if (gym.status === 'suspended' || gym.is_suspended) {
      // CRITICAL: No blocking Alert.alert() - log warning and continue
      console.warn('[Workout] Gym is suspended, but continuing with workout');
      // Continue with workout - user can still track their session
    }

    const { data, error } = await supabase
      .from('sessions')
      .insert({
        user_id: authSession.user.id,
        gym_id: gymId,
        equipment_id: equipmentId, // Keep for backward compatibility
        started_at: new Date().toISOString(),
        is_active: true,
      })
      .select('*, machine:machine_id(*), equipment:equipment_id(*), gym:gym_id(*)')
      .single();

    if (error) {
      console.error('Error creating session:', error);
      // CRITICAL: No blocking Alert.alert() - log error and continue
      console.error('[Workout] Failed to start workout:', error.message);
      // Continue with mock session or show error in UI
      setBleStatus(`Failed to start workout: ${error.message}`);
    }

    if (data) {
      console.log('Session created:', { id: data.id, gym_id: data.gym_id, gym_name: data.gym?.name });
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
      
      console.log('[Workout] Session loaded:', {
        id: data.id,
        gymId: data.gym_id,
        machine: data.machine,
        equipment: data.equipment,
        machineType: data.machine?.type || data.equipment?.equipment_type,
      });
      
      // Load saved progress (update SharedValues)
      if (data.drops_earned > 0) {
        earnedDropsShared.value = data.drops_earned;
        totalDropsShared.value = data.drops_earned;
      }
      if (data.duration_seconds) {
        setDuration(data.duration_seconds);
        // Reset challenge update ref if resuming a session
        lastChallengeUpdateRef.current = Math.floor(data.duration_seconds / 60);
        // Recalculate calories based on drops (1 drop ≈ 0.4 kcal)
        setCalories(Math.floor(data.drops_earned * 0.4));
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
        // Update session with earnedDrops and averageRPM (read from SharedValues)
        const currentEarnedDrops = Math.round(earnedDropsShared.value);
        await supabase
          .from('sessions')
          .update({
            drops_earned: currentEarnedDrops,
            duration_seconds: duration,
            average_rpm: averageRPM > 0 ? averageRPM : null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', session.id);
        
        lastSyncRef.current = now;
        // Battery Optimization: Only log critical sync events
      } catch (error) {
        console.error('[Workout] Sync error:', error);
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

  // Legacy save interval (kept for backward compatibility, but syncIntervalRef is primary)
  useEffect(() => {
    if (!session?.id || session.id === 'mock-session' || !authSession?.user) return;
    if (isPaused) return;

    const saveProgress = async () => {
      const currentDrops = Math.round(totalDropsShared.value);
      await supabase
        .from('sessions')
        .update({
          drops_earned: currentDrops,
          duration_seconds: duration,
          updated_at: new Date().toISOString(),
        })
        .eq('id', session.id);
    };

    // Save immediately, then every 30 seconds (fallback)
    saveProgress();
    saveIntervalRef.current = setInterval(saveProgress, 30000);

    return () => {
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
      }
    };
  }, [session?.id, duration, isPaused, authSession]); // Removed displayDrops, calories - using SharedValues

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

        // Pace calculation moved to useAnimatedReaction (uses SharedValues)
      }
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [session, startTime, isPaused, pausedTime, bleConnected, isPlanCompleted]);

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
      console.warn('[SmartCoach] currentPlanItem missing target_metric');
      return;
    }
    
    const targetMetric = currentPlanItemRef.current.target_metric;
    
    // Only handle time-based goals here
    if (targetMetric !== 'time') {
      return;
    }
    
    if (!currentPlanItemRef.current.target_value) {
      console.warn('[SmartCoach] currentPlanItem missing target_value');
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
            console.log('[SmartCoach] Time progress update:', {
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
          console.error('[SmartCoach] Error updating time progress:', error);
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

  // Update challenge progress every minute (only when a new minute is reached)
  useEffect(() => {
    if (!session?.gym_id || !machineType || isPaused) {
      return;
    }

    // Don't update if challenges haven't loaded yet
    if (challenges.length === 0) {
      return;
    }
    
    // Only update when we cross a new minute threshold (1, 2, 3, etc.)
    // Don't update on every second - only when minutes change
    if (currentMinutes > 0 && currentMinutes > lastChallengeUpdateRef.current) {
      const minutesToAdd = 1; // Always add exactly 1 minute per update
      
      console.log('[Workout] Updating challenge progress:', {
        minutes: currentMinutes,
        minutesToAdd,
        gymId: session.gym_id,
        machineType,
      });

      lastChallengeUpdateRef.current = currentMinutes;

      // Update challenge progress
      if (updateProgress) {
        updateProgress(minutesToAdd).then((result) => {
          if (!isMountedRef.current) return;
          console.log('[Workout] Challenge update result:', result);
          if (result.success && result.totalDropsAwarded && result.totalDropsAwarded > 0) {
            if (!isMountedRef.current) return;
            setChallengeMessage(`Challenge Completed! 🎉\n+${result.totalDropsAwarded} drops`);
            if (challengeMessageTimerRef.current) {
              clearTimeout(challengeMessageTimerRef.current);
            }
            challengeMessageTimerRef.current = setTimeout(() => {
              if (!isMountedRef.current) return;
              setChallengeMessage(null);
              challengeMessageTimerRef.current = null;
            }, 5000);
          } else if (!result.success) {
            console.error('[Workout] Challenge update failed:', result.error);
          } else {
            console.log('[Workout] Challenge progress updated successfully (no completions)');
          }
        }).catch((error) => {
          console.error('[Workout] Challenge update error:', error);
        });
      } else {
        console.error('[Workout] updateProgress function is not available');
      }
    }
  }, [currentMinutes, session?.gym_id, machineType, isPaused, updateProgress, challenges.length]);

  // Cleanup challenge message timer on unmount
  useEffect(() => {
    return () => {
      if (challengeMessageTimerRef.current) {
        clearTimeout(challengeMessageTimerRef.current);
      }
    };
  }, []);

  // REMOVED: Old drop creation logic - drops are now managed imperatively via dropEmitterRef.current?.emit()
  // Drops are emitted directly in BLE callback when new drops are earned

  // Pause/Resume
  const togglePause = () => {
    if (isPaused) {
      // Resume
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
      setIsPaused(false);
      pausedOverlayOpacity.value = withSpring(0, { damping: 15, stiffness: 100, mass: 1 });
    } else {
      // Pause
      setPausedTime(new Date());
      setIsPaused(true);
      pausedOverlayOpacity.value = withSpring(1, { damping: 15, stiffness: 100, mass: 1 });
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

    // Immediately disconnect BLE when workout ends
    try {
      console.log('[Workout] Disconnecting BLE on workout end...');
      await bleService.stopMonitoring();
      await bleService.disconnect();
      setBleConnected(false);
      console.log('[Workout] BLE disconnected successfully');
    } catch (error) {
      console.error('[Workout] Error disconnecting BLE:', error);
      // Continue even if disconnect fails
    }
    
    // Cleanup RPM persistence
    lastNonZeroRPMRef.current = 0;

    // Check if workout is too short (< 1 minute)
    // No blocking alert - just continue with workout
    if (duration < 60) {
      console.log('[Workout] Workout is less than 1 minute, but continuing anyway');
      // Continue with workout instead of blocking user
    }

    if (!authSession?.user || !session?.id || session.id === 'mock-session') {
      // Mock mode
      router.push({
        pathname: '/session-summary',
        params: {
          sessionId: 'mock',
          drops: Math.round(totalDropsShared.value).toString(),
          duration: duration.toString(),
        },
      });
      return;
    }

    // Verify session has gym_id before ending
    if (!session.gym_id) {
      console.error('Session missing gym_id:', session);
      // No blocking alert - log error and continue
      console.error('[Workout] Cannot save workout: missing gym information');
      // Still navigate to summary with available data
    }

    // PRO-FITNESS: Get final values from SharedValues
    const finalEarnedDrops = Math.round(totalDropsShared.value);
    const finalSmoothedRPM = smoothedRPMShared.value;
    // Calculate average RPM from smoothed RPM (use current value as approximation)
    // In production, you might want to track RPM history for true average
    const finalAverageRPM = finalSmoothedRPM > 0 ? Math.round(finalSmoothedRPM) : (averageRPM > 0 ? averageRPM : null);
    
    console.log('Ending session:', {
      sessionId: session.id,
      gymId: session.gym_id,
      drops: finalEarnedDrops,
      averageRPM: finalAverageRPM,
      smoothedRPM: finalSmoothedRPM,
      userId: authSession.user.id,
    });

    // Final sync before ending: Ensure last data is saved
    try {
      await supabase
        .from('sessions')
        .update({
          drops_earned: finalEarnedDrops,
          duration_seconds: duration,
          average_rpm: finalAverageRPM,
          updated_at: new Date().toISOString(),
        })
        .eq('id', session.id);
      console.log('[Workout] Final sync completed:', { earnedDrops: finalEarnedDrops, averageRPM: finalAverageRPM, duration });
    } catch (syncError) {
      console.error('[Workout] Final sync error:', syncError);
      // No blocking alert - continue with navigation
    }

    // End session in Supabase
    // This will automatically:
    // 1. Update the session with end time and drops_earned
    // 2. Add drops to global balance (profiles.total_drops)
    // 3. Add drops to local balance (gym_memberships.local_drops_balance) for the gym where workout was performed
    const { data: endSessionData, error } = await supabase.rpc('end_session', {
      p_session_id: session.id,
      p_drops_earned: finalEarnedDrops, // Use earnedDrops from sensor data (SharedValue)
    });

    if (error) {
      console.error('Error ending session:', error);
      // No blocking alert - log error and continue to summary
      console.error('[Workout] Failed to save workout:', error.message);
      // Still navigate to summary to show user their workout data
    }

    console.log('Session ended successfully:', endSessionData);

    // Verify that drops were saved by checking the profile
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('total_drops')
      .eq('id', authSession.user.id)
      .single();

    if (profileError) {
      console.error('Error verifying drops:', profileError);
    } else {
      console.log('Profile total_drops after workout:', profileData?.total_drops);
    }

    // Verify local balance
    const { data: membershipData, error: membershipError } = await supabase
      .from('gym_memberships')
      .select('local_drops_balance')
      .eq('user_id', authSession.user.id)
      .eq('gym_id', session.gym_id)
      .single();

    if (membershipError && membershipError.code !== 'PGRST116') {
      console.error('Error verifying local drops:', membershipError);
    } else if (membershipData) {
      console.log('Local drops balance after workout:', membershipData.local_drops_balance);
    } else {
      console.warn('No gym membership found - this might be normal if add_drops failed to create it');
    }

    // Final challenge progress update with remaining minutes
    const finalMinutes = Math.floor(duration / 60);
    const remainingMinutes = finalMinutes - lastChallengeUpdateRef.current;
    if (remainingMinutes > 0 && machineType) {
      const result = await updateProgress(remainingMinutes);
      if (result.success && result.totalDropsAwarded && result.totalDropsAwarded > 0) {
        // Challenge completion will be shown in session summary
        console.log('Challenges completed:', result.completedChallenges);
      }
    }

    // Unlock machine if it was locked
    if (session.machine_id && authSession?.user) {
      try {
        await supabase.rpc('unlock_machine', {
          p_machine_id: session.machine_id,
          p_user_id: authSession.user.id,
        });
        console.log('[Workout] Machine unlocked');
      } catch (error) {
        console.error('[Workout] Failed to unlock machine:', error);
      }
    }

    // BLE disconnect disabled
    // if (bleMonitoringRef.current) {
    //   await bleService.disconnect();
    //   bleMonitoringRef.current = false;
    // }

    router.push({
      pathname: '/session-summary',
      params: {
        sessionId: session.id,
        drops: finalEarnedDrops.toString(), // Use earnedDrops from sensor data (SharedValue)
        duration: duration.toString(),
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
      const currentProgress = Math.min(drops / targetDrops, 1);
      const overachieved = drops > targetDrops;
      const bonus = drops > 0 && Math.floor(drops) % 100 === 0;
      
      runOnJS(setIsOverachieved)(overachieved);
      runOnJS(setShowBonus)(bonus);
    },
    [totalDropsShared, targetDrops]
  );
  
  // Get current progress for CircularProgressRing (needs JS value)
  const progress = useDerivedValue(() => {
    return Math.min(totalDropsShared.value / targetDrops, 1);
  }, [totalDropsShared, targetDrops]);
  
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
      {/* Premium Blurred Background with Animated Gradients (RPM-based zones) */}
      <BlurView intensity={20} style={StyleSheet.absoluteFill} tint="dark">
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            useAnimatedStyle(() => ({
              backgroundColor: backgroundGradientColor.value,
              opacity: 0.1,
            })),
          ]}
        />
      </BlurView>

      {/* Header with Gym Info */}
      <View style={styles.header}>
        <View style={styles.leftHeader}>
          {session?.gym?.name && (
            <View style={styles.gymTag}>
              <Ionicons name="location" size={14} color={theme.colors.textSecondary} />
              <Text style={styles.gymTagText}>At: {session.gym.name}</Text>
            </View>
          )}
        </View>
        <View style={styles.headerDrops}>
          <Ionicons name="water" size={20} color={theme.colors.primary} />
          <AnimatedText 
            text={animatedDropsText}
            style={[styles.headerDropsText, getNumberStyle(18), { color: theme.colors.primary }]}
          />
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
            +100 <Ionicons name="water" size={16} color={theme.colors.primary} /> DROPS BONUS
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
              Exercise Completed!
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.nextExerciseButton, { backgroundColor: branding.primary }]}
            onPress={handleNextExercise}
          >
            <Text style={[styles.nextExerciseButtonText, { color: branding.onPrimary }]}>
              Next Exercise
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
              Plan Completed!
            </Text>
            <Text style={styles.planCompletedSubtitle}>
              Congratulations! You've completed all exercises.
            </Text>
          </View>
        </BlurView>
      )}

      {/* Workout Summary Modal */}
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
            <Animated.View style={dropJumpStyle}>
              {/* Premium UI: Advanced LiquidGauge with Damping Effect */}
              {/* LiquidGauge follows rawRPM via smoothedRPMShared (already has damping from smoothing chain) */}
              {/* This creates realistic liquid bubbling effect as you pedal */}
              <LiquidGauge
                ref={liquidGaugeRef}
                progress={progressShared} // Pass SharedValue directly for real-time updates (with damping)
                value={liquidGaugeValue} // JS state synced from liquidGaugeDisplayValueShared (drops, not percentage)
                size={280}
                strokeWidth={4}
                rpm={smoothedRPMShared} // Pass smoothed RPM for dynamic glow synchronization (damping already applied)
              />
            </Animated.View>
          )}

          {/* Circular Progress Ring - Only show when BLE is connected */}
          {/* Render AFTER LiquidGauge so it's on top */}
          {bleConnected && (
            <CircularProgressRing
              progress={progressJS}
              size={290}
              strokeWidth={3}
              rpm={smoothedRPMShared} // Pass RPM for laser sweep speed
              primaryColor={branding.primary} // Dynamic primary color from branding
            />
          )}

          {/* DROPS Label - Only show when BLE is connected */}
          {bleConnected && (
            <View style={styles.dropsLabelContainer}>
              <Text style={styles.dropsLabel}>DROPS</Text>
              {isOverachieved && (
                <Text style={styles.overachievedText}>🎉 Overachieved!</Text>
              )}
            </View>
          )}

          {/* Premium DropEmitter - Zero-Lag Optimized (no Skia per drop) */}
          {bleConnected && (
            <DropEmitter
              drops={activeDrops}
              containerSize={280}
              onImpact={(x, y) => {
                // Impact Sync: Trigger impact effect when drop hits water
                liquidGaugeRef.current?.triggerImpact();
              }}
              onDropComplete={(dropId) => {
                setActiveDrops((prev) => prev.filter((drop) => drop.id !== dropId));
              }}
            />
          )}
        </View>
      </View>

      {/* Stats Grid (Time, Calories, Pace, RPM) */}
      <View style={styles.statsGrid}>
        <View style={styles.statItem}>
          <Ionicons name="time-outline" size={24} color={theme.colors.text} />
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
          <Text style={styles.statLabel}>kcal</Text>
        </View>

        <View style={styles.statItem}>
          <Ionicons name="speedometer-outline" size={24} color={branding.primary} />
          <AnimatedText 
            text={animatedPaceText}
            style={[styles.statValue, getNumberStyle(20)]}
          />
          <Text style={styles.statLabel}>min/km</Text>
        </View>

        {/* Premium UI: RPM Display with Dynamic Color & Pulse Effect (only show if sensor is connected) */}
        {(session?.machine?.sensor_id || sensorId) && (
          <Animated.View style={[styles.statItem, rpmPulseStyle]}>
            <View style={styles.rpmHeader}>
              <Ionicons 
                name="pulse-outline" 
                size={24} 
                color={bleConnected ? branding.primary : theme.colors.textSecondary} 
              />
              {/* Live Signal Indicator */}
              {bleConnected && (
                <SignalIndicator status={signalStatus} />
              )}
            </View>
            <AnimatedText 
              text={animatedRPMText}
              style={[
                styles.statValue, 
                getNumberStyle(20),
                rpmTextColorStyle, // Premium UI: Dynamic color based on RPM intensity
              ]}
            />
            <Text style={styles.statLabel}>RPM</Text>
          </Animated.View>
        )}
      </View>

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
          <Text style={styles.targetText}>Target: </Text>
          <Text style={[styles.targetNumber, getNumberStyle(16)]}>{targetDrops}</Text>
          <Ionicons name="water" size={16} color={theme.colors.primary} />
        </View>
      </View>

      {/* Paused Overlay */}
      {isPaused && (
        <Animated.View style={[styles.pausedOverlay, pausedOverlayStyle]} pointerEvents="none">
          <Text style={styles.pausedText}>PAUSED</Text>
        </Animated.View>
      )}

      {/* Auto-Pause Warning Overlay (when RPM = 0 for 10+ seconds) */}
      {showAutoPauseOverlay && !isPaused && (session?.machine?.sensor_id || sensorId) && (
        <Animated.View style={[styles.autoPauseOverlay, pausedOverlayStyle]} pointerEvents="none">
          <Ionicons name="warning-outline" size={48} color={theme.colors.warning || '#FFA500'} />
          <Text style={styles.autoPauseTitle}>Senzor Ne Šalje Podatke</Text>
          <Text style={styles.autoPauseText}>
            Trening će biti automatski pauziran ako se senzor ne poveže u narednih 20 sekundi.
          </Text>
        </Animated.View>
      )}

      {/* Sensor Asleep Overlay (when no data for 10+ seconds) */}
      {showSensorAsleep && !isPaused && (session?.machine?.sensor_id || sensorId) && (
        <Animated.View style={[styles.sensorAsleepOverlay, pausedOverlayStyle]}>
          <Ionicons name="bluetooth-outline" size={64} color={theme.colors.textSecondary} />
          <Text style={styles.sensorAsleepTitle}>Senzor Uspavan</Text>
          <Text style={styles.sensorAsleepText}>
            Senzor ne šalje podatke. Proverite da li je uključen i u Cadence modu (crveno svetlo).
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
                <Text style={styles.reconnectButtonText}>Ponovo Poveži</Text>
              </>
            )}
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* BLE Connection Required Overlay */}
      {!bleConnected && session?.machine_id && (session?.machine?.sensor_id || sensorId) && (
        <Animated.View style={[styles.bleConnectionOverlay, pausedOverlayStyle]}>
          <ActivityIndicator size="large" color={branding.primary} />
          <Text style={styles.bleConnectionTitle}>Povezivanje sa senzorom...</Text>
          <Text style={styles.bleConnectionText}>
            {bleStatus || 'Molimo sačekajte dok se aplikacija povezuje sa Magene S3+ senzorom.'}
          </Text>
        </Animated.View>
      )}

      {/* Control Buttons */}
      <View style={styles.controls}>
        {/* Pause/Resume Button */}
        <TouchableOpacity
          style={[styles.controlButton, styles.pauseButton]}
          onPress={togglePause}
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
            <Text style={styles.finishButtonText}>Finish Workout</Text>
          </View>
        </Pressable>
      </View>
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
    color: theme.colors.textSecondary,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: '500',
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
    color: theme.colors.primary,
    fontWeight: 'bold',
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
    color: theme.colors.text,
    fontSize: theme.typography.fontSize.base,
    fontWeight: 'bold',
    textAlign: 'center',
    letterSpacing: 1,
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
    color: theme.colors.text,
    fontSize: theme.typography.fontSize.lg,
    fontWeight: '600',
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
    color: theme.colors.text,
    fontSize: theme.typography.fontSize.base,
    fontWeight: '600',
    letterSpacing: 2,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  overachievedText: {
    color: theme.colors.secondary,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: '600',
    marginTop: theme.spacing.xs,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
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
    color: theme.colors.text,
    fontWeight: 'bold',
  },
  statLabel: {
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  targetText: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.fontSize.sm,
  },
  targetNumber: {
    color: theme.colors.text,
    fontWeight: '600',
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
    color: theme.colors.text,
    fontSize: theme.typography.fontSize['3xl'],
    fontWeight: 'bold',
    letterSpacing: 4,
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
    color: theme.colors.text,
    fontSize: theme.typography.fontSize.xl,
    fontWeight: 'bold',
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  autoPauseText: {
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
    color: theme.colors.text,
    fontSize: theme.typography.fontSize.xl,
    fontWeight: 'bold',
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  sensorAsleepText: {
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
    color: theme.colors.background,
    fontSize: theme.typography.fontSize.base,
    fontWeight: 'bold',
    letterSpacing: 0.5,
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
    color: theme.colors.text,
    fontSize: theme.typography.fontSize.xl,
    fontWeight: 'bold',
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  bleConnectionText: {
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
    fontSize: theme.typography.fontSize.lg,
    fontWeight: '700',
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
    fontSize: theme.typography.fontSize.base,
    fontWeight: '700',
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
    color: theme.colors.text,
    fontSize: theme.typography.fontSize.lg,
    fontWeight: '600',
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
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: '700',
    textAlign: 'center',
  },
  planCompletedSubtitle: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
});
