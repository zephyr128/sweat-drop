import { View, Text, StyleSheet, TouchableOpacity, Alert, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useAnimatedReaction,
  withTiming,
  withSequence,
  withRepeat,
  interpolate,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { theme, getNumberStyle } from '@/lib/theme';
import LiquidGauge, { LiquidGaugeRef } from '@/components/LiquidGauge';
import { DropEmitter } from '@/components/DropEmitter';
import CircularProgressRing from '@/components/CircularProgressRing';
import { useChallengeProgress } from '@/hooks/useChallengeProgress';
import { bleService, CSCMeasurement } from '@/lib/ble-service';

interface ActiveDrop {
  id: string;
  startX: number;
  progress: number; // Water level progress (0 to 1) at time of drop creation
}

export default function WorkoutScreen() {
  const { sessionId, equipmentId, gymId, machineType: paramMachineType, sensorId } = useLocalSearchParams<{
    sessionId?: string;
    equipmentId?: string;
    gymId?: string;
    machineType?: string;
    sensorId?: string;
  }>();
  const [session, setSession] = useState<any>(null);
  const [drops, setDrops] = useState(0);
  const [displayDrops, setDisplayDrops] = useState(0);
  const [earnedDrops, setEarnedDrops] = useState(0); // Real drops from sensor data
  const [duration, setDuration] = useState(0);
  const [calories, setCalories] = useState(0);
  const [pace, setPace] = useState<string>('0:00'); // min/km
  const [targetDrops, setTargetDrops] = useState(500);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [pausedTime, setPausedTime] = useState<Date | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [activeDrops, setActiveDrops] = useState<ActiveDrop[]>([]);
  const [challengeMessage, setChallengeMessage] = useState<string | null>(null);
  const [rpm, setRpm] = useState<number>(0); // Raw RPM from sensor
  const [smoothedRPM, setSmoothedRPM] = useState<number>(0); // Smoothed RPM for UI display
  const [averageRPM, setAverageRPM] = useState<number>(0); // Average RPM for database sync
  const [showAutoPauseOverlay, setShowAutoPauseOverlay] = useState(false);
  const [showSensorAsleep, setShowSensorAsleep] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [bleConnected, setBleConnected] = useState(false);
  const [bleStatus, setBleStatus] = useState<string>('');
  const [signalStatus, setSignalStatus] = useState<'ok' | 'lost'>('ok');
  const router = useRouter();
  const { session: authSession } = useSession();
  const liquidGaugeRef = useRef<LiquidGaugeRef>(null);
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
  // Zero-Drop Prevention: Grace period timer for walking mode
  const gracePeriodTimerRef = useRef<NodeJS.Timeout | null>(null);
  const gracePeriodActiveRef = useRef<boolean>(false);
  const lastNonZeroRPMRef = useRef<number>(0); // Store last non-zero RPM during grace period
  // Step-to-Drop: Track last step detection for walking mode
  const lastStepDetectionRef = useRef<number>(0); // Timestamp of last detected step
  const stepDetectionThreshold = 50; // Minimum RPM to consider as a step (walking mode)
  // Throttled sync: Track last sync time
  const lastSyncRef = useRef<number>(0);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  // Explosion animation when BLE connects
  const explosionScale = useSharedValue(1);
  const explosionOpacity = useSharedValue(0);
  // Connecting state animation (subtle pulse)
  const connectingPulseScale = useSharedValue(1);
  const connectingPulseOpacity = useSharedValue(0.5);
  // High-frequency RPM smoothing (useDerivedValue for smooth transitions)
  const rawRPMShared = useSharedValue(0);
  const smoothedRPMShared = useSharedValue(0);
  // Premium Pulse Rings: 3 concentric rings with different speeds
  const pulseRing1Scale = useSharedValue(1);
  const pulseRing1Opacity = useSharedValue(0);
  const pulseRing2Scale = useSharedValue(1);
  const pulseRing2Opacity = useSharedValue(0);
  const pulseRing3Scale = useSharedValue(1);
  const pulseRing3Opacity = useSharedValue(0);
  // Drop animation: Jump animation when drops increase
  const dropJumpScale = useSharedValue(1);

  // Determine machine type from machine (preferred) or equipment (fallback)
  const machineType = paramMachineType || 
    session?.machine?.type || 
    session?.equipment?.equipment_type || 
    (session?.equipment?.name?.toLowerCase().includes('treadmill') ? 'treadmill' :
     session?.equipment?.name?.toLowerCase().includes('bike') ? 'bike' : null);

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
          
          Alert.alert(
            'BLE Connection Failed',
            connectError?.message || 'Nije moguće povezati se sa senzorom. Proverite da li je senzor uključen i u Cadence modu (crveno svetlo).',
            [
              {
                text: 'Retry',
                onPress: () => startBLEMonitoring(),
              },
              {
                text: 'Cancel',
                onPress: () => {
                  router.back();
                },
              },
            ]
          );
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
            
            console.log('[Workout] BLE Measurement:', measurement);
            
            // Update signal status to OK when data arrives
            setSignalStatus('ok');
            
            // Store raw RPM
            const rawRPM = measurement.rpm;
            setRpm(rawRPM);
            
            // RPM Smoothing: Moving Average (last 4 readings for Walking Mode)
            // Walking Mode: Handle intermittent 0 RPM between steps
            
            if (rawRPM === 0) {
              // Zero-Drop Prevention: Start grace period if we get 0 RPM
              if (!gracePeriodActiveRef.current && lastNonZeroRPMRef.current > 0) {
                // Start grace period: wait 1.5s before showing 0
                gracePeriodActiveRef.current = true;
                lastNonZeroRPMRef.current = smoothedRPM; // Store current smoothed RPM
                
                // Clear existing grace period timer
                if (gracePeriodTimerRef.current) {
                  clearTimeout(gracePeriodTimerRef.current);
                }
                
                // Set grace period timer (1.5 seconds)
                gracePeriodTimerRef.current = setTimeout(() => {
                  // Grace period expired - slowly drop to 0
                  console.log('[Workout] Grace period expired, dropping RPM to 0');
                  gracePeriodActiveRef.current = false;
                  lastNonZeroRPMRef.current = 0;
                  
                  // Clear history when sensor stops
                  rpmRawHistoryRef.current = [0];
                  
                  // Smoothly animate RPM to 0
                  setSmoothedRPM(0);
                  rawRPMShared.value = 0;
                }, 1500); // 1.5 second grace period
              }
              
              // Don't add 0 to history during grace period (keep last non-zero values)
              // Only add 0 if grace period is not active (sensor truly stopped)
              if (!gracePeriodActiveRef.current) {
                const allZeros = rpmRawHistoryRef.current.every(val => val === 0);
                if (allZeros || rpmRawHistoryRef.current.length >= 4) {
                  rpmRawHistoryRef.current = [0];
                } else {
                  rpmRawHistoryRef.current.push(0);
                }
              }
            } else {
              // Non-zero RPM received - cancel grace period if active
              if (gracePeriodActiveRef.current) {
                console.log('[Workout] New step detected during grace period, continuing animation');
                gracePeriodActiveRef.current = false;
                lastNonZeroRPMRef.current = 0;
                
                if (gracePeriodTimerRef.current) {
                  clearTimeout(gracePeriodTimerRef.current);
                  gracePeriodTimerRef.current = null;
                }
              }
              
              // Add raw RPM to history (only non-zero values)
              rpmRawHistoryRef.current.push(rawRPM);
              if (rpmRawHistoryRef.current.length > 4) {
                rpmRawHistoryRef.current.shift();
              }
              
              // Update last non-zero RPM
              lastNonZeroRPMRef.current = rawRPM;
            }
            
            // Calculate moving average (prosek poslednja 4 očitavanja)
            let smoothedValue = 0;
            if (rpmRawHistoryRef.current.length > 0) {
              // During grace period, use last non-zero RPM instead of 0
              if (gracePeriodActiveRef.current && lastNonZeroRPMRef.current > 0) {
                // Use grace period buffer: mix last non-zero RPM with current history
                const nonZeroHistory = rpmRawHistoryRef.current.filter(val => val > 0);
                if (nonZeroHistory.length > 0) {
                  const sum = nonZeroHistory.reduce((acc, val) => acc + val, 0) + lastNonZeroRPMRef.current;
                  smoothedValue = Math.round(sum / (nonZeroHistory.length + 1));
                } else {
                  smoothedValue = lastNonZeroRPMRef.current;
                }
              } else {
                // Normal calculation: average of all values in history
                const sum = rpmRawHistoryRef.current.reduce((acc, val) => acc + val, 0);
                smoothedValue = Math.round(sum / rpmRawHistoryRef.current.length);
              }
            }
            
            // Low RPM Threshold: If smoothed RPM < 10, display as 0 (unless in grace period)
            if (smoothedValue < 10 && !gracePeriodActiveRef.current) {
              smoothedValue = 0;
            }
            
            // Update smoothed RPM for UI
            setSmoothedRPM(smoothedValue);
            
            // Update shared value for fluid RPM animation (this triggers useAnimatedReaction)
            rawRPMShared.value = smoothedValue;
            
            // Update RPM history for average calculation (keep last 30 values, only non-zero)
            if (rawRPM > 0) {
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
            const now = Date.now();
            
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
                  console.log('[Workout] Stale data detected: crankRevolutions decreased without wrap-around. Ignoring.');
                  return;
                }
              }
              
              // Step-to-Drop Calibration: For walking mode, emit drop for each step
              // Even if RPM is 0 (during grace period), if revolutions increased, it's a step
              if (revolutionDelta > 0) {
                // Walking Mode Detection: Low RPM (< stepDetectionThreshold) OR grace period active (intermittent 0 RPM)
                // Walking mode suggests patica (shoe sensor) where steps are detected even with 0 RPM between steps
                const isWalkingMode = (measurement.rpm > 0 && measurement.rpm < stepDetectionThreshold) || 
                                     (gracePeriodActiveRef.current && revolutionDelta > 0);
                
                if (isWalkingMode) {
                  // Walking Mode: Each step (revolution) = 1 drop
                  const stepsDetected = revolutionDelta;
                  if (stepsDetected > 0) {
                    setEarnedDrops((prev) => {
                      const newTotal = prev + stepsDetected;
                      setDrops(newTotal);
                      setDisplayDrops(newTotal);
                      return newTotal;
                    });
                    
                    // Trigger drop jump animation for each step
                    for (let i = 0; i < stepsDetected; i++) {
                      setTimeout(() => {
                        dropJumpScale.value = withSequence(
                          withTiming(1.15, { duration: 150, easing: Easing.out(Easing.ease) }),
                          withTiming(1, { duration: 150, easing: Easing.in(Easing.ease) })
                        );
                        // Subtle haptic feedback for each step
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }, i * 50); // Stagger animations slightly
                    }
                    
                    lastStepDetectionRef.current = now;
                  }
                  
                  // Update last crank revolutions (all steps counted)
                  lastCrankRevolutionsRef.current = currentRevolutions;
                } else {
                  // Cycling Mode: Original logic (1 drop per 10 revolutions)
                  if (revolutionDelta >= 10) {
                    const newDrops = Math.floor(revolutionDelta / 10);
                    setEarnedDrops((prev) => {
                      const newTotal = prev + newDrops;
                      setDrops(newTotal);
                      setDisplayDrops(newTotal);
                      return newTotal;
                    });
                    
                    // Trigger drop jump animation
                    dropJumpScale.value = withSequence(
                      withTiming(1.15, { duration: 150, easing: Easing.out(Easing.ease) }),
                      withTiming(1, { duration: 150, easing: Easing.in(Easing.ease) })
                    );
                    
                    // Haptic feedback on drop earned
                    if (measurement.rpm > 0 && measurement.rpm < 120) {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }
                  }
                  
                  // Update last crank revolutions (accounting for drops already counted)
                  const remainingRevolutions = revolutionDelta % 10;
                  lastCrankRevolutionsRef.current = currentRevolutions - remainingRevolutions;
                }
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
              if (timeSinceLastRPM > 2000 && smoothedValue > 0) {
                console.log('[Workout] Sensor stopped (0 RPM for 2+ seconds), resetting smoothed RPM');
                setSmoothedRPM(0);
                rawRPMShared.value = 0; // Update shared value
                // Clear smoothing history to prevent stale data
                rpmRawHistoryRef.current = [0];
              }
              
              // Show warning after 10 seconds
              if (timeSinceLastRPM > 10000 && timeSinceLastRPM < 30000) {
                setShowAutoPauseOverlay(true);
              }
              
              if (timeSinceLastRPM > 30000 && !isPaused && !autoPauseTimerRef.current) {
                // Auto-pause after 30 seconds of no RPM
                console.log('[Workout] Auto-pausing due to no RPM for 30+ seconds');
                setShowAutoPauseOverlay(true);
                autoPauseTimerRef.current = setTimeout(() => {
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
            console.log('[Workout] Sensor appears to be asleep');
            setShowSensorAsleep(true);
          },
          // onReconnect callback - verify session ownership
          verifySessionOwnership
        );

        console.log('[Workout] BLE monitoring started');
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
        
        Alert.alert(
          'BLE Error',
          error?.message || 'Greška pri povezivanju sa senzorom. Pokušajte ponovo.',
          [
            {
              text: 'Retry',
              onPress: () => startBLEMonitoring(),
            },
            {
              text: 'Cancel',
              onPress: () => {
                router.back();
              },
            },
          ]
        );
      }
    };

    startBLEMonitoring();

    return () => {
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
      
      // If no change in crankEventTime for 3 seconds, reset RPM to 0
      // But respect grace period - don't reset if grace period is active
      if (timeSinceLastChange > 3000 && smoothedRPM > 0 && !gracePeriodActiveRef.current) {
        console.log('[Workout] No change in crankEventTime for 3+ seconds, resetting RPM to 0');
        setRpm(0);
        setSmoothedRPM(0);
        rawRPMShared.value = 0; // Update shared value
        // Clear smoothing history when sensor stops
        rpmRawHistoryRef.current = [];
        // Clear grace period if active
        if (gracePeriodTimerRef.current) {
          clearTimeout(gracePeriodTimerRef.current);
          gracePeriodTimerRef.current = null;
        }
        gracePeriodActiveRef.current = false;
        lastNonZeroRPMRef.current = 0;
      }
    }, 1000);

    return () => {
      clearInterval(checkInterval);
      // Cleanup grace period timer
      if (gracePeriodTimerRef.current) {
        clearTimeout(gracePeriodTimerRef.current);
        gracePeriodTimerRef.current = null;
      }
    };
  }, [smoothedRPM, bleConnected, isPaused]);

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

    // If RPM is 0, start idle timer
    if (smoothedRPM === 0 && !idleSyncRef.current) {
      idleSyncTimerRef.current = setTimeout(async () => {
        // RPM has been 0 for 15+ seconds - do final sync and stop further syncing
        console.log('[Workout] RPM idle for 15+ seconds, performing final sync');
        idleSyncRef.current = true;
        
        try {
          await supabase
            .from('sessions')
            .update({
              drops_earned: earnedDrops,
              duration_seconds: duration,
              average_rpm: averageRPM > 0 ? averageRPM : null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', session.id);
          
          console.log('[Workout] Final sync completed (idle state)');
        } catch (error) {
          console.error('[Workout] Final sync error:', error);
        }
      }, 15000); // 15 seconds
    } else if (smoothedRPM > 0) {
      // RPM is active again - reset idle flag and allow syncing
      idleSyncRef.current = false;
    }

    return () => {
      if (idleSyncTimerRef.current) {
        clearTimeout(idleSyncTimerRef.current);
      }
    };
  }, [smoothedRPM, session?.id, earnedDrops, averageRPM, duration, isPaused, authSession]);

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

  // High-Frequency RPM Smoothing: useAnimatedReaction for smooth number transitions
  useAnimatedReaction(
    () => rawRPMShared.value,
    (targetRPM) => {
      const currentRPM = smoothedRPMShared.value;
      
      if (targetRPM > currentRPM) {
        // RPM increased - quick transition up
        smoothedRPMShared.value = withTiming(targetRPM, {
          duration: 300,
          easing: Easing.out(Easing.ease),
        });
      } else if (targetRPM < currentRPM) {
        // RPM decreased - count down smoothly
        smoothedRPMShared.value = withTiming(targetRPM, {
          duration: 500,
          easing: Easing.inOut(Easing.ease),
        });
      } else {
        // No change
        smoothedRPMShared.value = targetRPM;
      }
    },
    [rawRPMShared, smoothedRPMShared]
  );

  // Fluid RPM Display: Convert shared value to JS state for display
  const [displayRPMValue, setDisplayRPMValue] = useState(0);
  
  useAnimatedReaction(
    () => smoothedRPMShared.value,
    (rpm) => {
      const roundedRPM = Math.round(rpm);
      runOnJS(setDisplayRPMValue)(roundedRPM);
    },
    [smoothedRPMShared]
  );

  // Premium Pulse Rings: 3 concentric rings with different speeds based on RPM
  useEffect(() => {
    if (smoothedRPM === 0 || isPaused || !bleConnected) {
      // Stop all pulse rings when RPM is 0 or paused
      pulseRing1Scale.value = withTiming(1, { duration: 300 });
      pulseRing1Opacity.value = withTiming(0, { duration: 300 });
      pulseRing2Scale.value = withTiming(1, { duration: 300 });
      pulseRing2Opacity.value = withTiming(0, { duration: 300 });
      pulseRing3Scale.value = withTiming(1, { duration: 300 });
      pulseRing3Opacity.value = withTiming(0, { duration: 300 });
      return;
    }

    // Calculate pulse speed and intensity based on smoothed RPM
    const normalizedRPM = Math.min(smoothedRPM / 120, 1);
    const baseDuration = 2000 - (normalizedRPM * 1200); // 2000ms to 800ms (faster at higher RPM)
    
    // Ring 1 (innermost): Fastest, most intense
    const ring1Duration = baseDuration * 0.6;
    const ring1MaxScale = 1.15 + (normalizedRPM * 0.1);
    const ring1MaxOpacity = 0.8;
    
    // Ring 2 (middle): Medium speed
    const ring2Duration = baseDuration * 0.8;
    const ring2MaxScale = 1.12 + (normalizedRPM * 0.08);
    const ring2MaxOpacity = 0.5;
    
    // Ring 3 (outermost): Slowest, most subtle
    const ring3Duration = baseDuration;
    const ring3MaxScale = 1.1 + (normalizedRPM * 0.06);
    const ring3MaxOpacity = 0.3;

    // Start pulse animations for all 3 rings
    pulseRing1Scale.value = withRepeat(
      withSequence(
        withTiming(ring1MaxScale, { duration: ring1Duration / 2, easing: Easing.out(Easing.ease) }),
        withTiming(1, { duration: ring1Duration / 2, easing: Easing.in(Easing.ease) })
      ),
      -1,
      false
    );

    pulseRing1Opacity.value = withRepeat(
      withSequence(
        withTiming(ring1MaxOpacity, { duration: ring1Duration / 2, easing: Easing.out(Easing.ease) }),
        withTiming(0.2, { duration: ring1Duration / 2, easing: Easing.in(Easing.ease) })
      ),
      -1,
      false
    );

    // Ring 2 with slight delay
    setTimeout(() => {
      pulseRing2Scale.value = withRepeat(
        withSequence(
          withTiming(ring2MaxScale, { duration: ring2Duration / 2, easing: Easing.out(Easing.ease) }),
          withTiming(1, { duration: ring2Duration / 2, easing: Easing.in(Easing.ease) })
        ),
        -1,
        false
      );

      pulseRing2Opacity.value = withRepeat(
        withSequence(
          withTiming(ring2MaxOpacity, { duration: ring2Duration / 2, easing: Easing.out(Easing.ease) }),
          withTiming(0.15, { duration: ring2Duration / 2, easing: Easing.in(Easing.ease) })
        ),
        -1,
        false
      );
    }, ring2Duration * 0.2);

    // Ring 3 with more delay
    setTimeout(() => {
      pulseRing3Scale.value = withRepeat(
        withSequence(
          withTiming(ring3MaxScale, { duration: ring3Duration / 2, easing: Easing.out(Easing.ease) }),
          withTiming(1, { duration: ring3Duration / 2, easing: Easing.in(Easing.ease) })
        ),
        -1,
        false
      );

      pulseRing3Opacity.value = withRepeat(
        withSequence(
          withTiming(ring3MaxOpacity, { duration: ring3Duration / 2, easing: Easing.out(Easing.ease) }),
          withTiming(0.1, { duration: ring3Duration / 2, easing: Easing.in(Easing.ease) })
        ),
        -1,
        false
      );
    }, ring3Duration * 0.3);
  }, [smoothedRPM, isPaused, bleConnected]);

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
      Alert.alert('Error', 'Failed to verify gym status. Please try again.');
      router.back();
      return;
    }

    if (gym.status === 'suspended' || gym.is_suspended) {
      Alert.alert(
        'Gym Suspended',
        'This gym\'s subscription has expired. Please contact the gym owner.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
      return;
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
      Alert.alert('Error', `Failed to start workout: ${error.message}`);
      return;
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
      
      // Load saved progress
      if (data.drops_earned > 0) {
        setDrops(data.drops_earned);
        setDisplayDrops(data.drops_earned);
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
      // Only sync if 15 seconds have passed since last sync
      if (lastSyncRef.current && now - lastSyncRef.current < 15000) {
        return;
      }

      try {
        // Update session with earnedDrops and averageRPM
        await supabase
          .from('sessions')
          .update({
            drops_earned: earnedDrops,
            duration_seconds: duration,
            average_rpm: averageRPM > 0 ? averageRPM : null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', session.id);
        
        lastSyncRef.current = now;
        console.log('[Workout] Synced to database:', { earnedDrops, averageRPM, duration });
      } catch (error) {
        console.error('[Workout] Sync error:', error);
      }
    };

    // Sync immediately, then every 15 seconds
    syncToDatabase();
    syncIntervalRef.current = setInterval(syncToDatabase, 15000);

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [session?.id, earnedDrops, averageRPM, duration, isPaused, authSession]);

  // Legacy save interval (kept for backward compatibility, but syncIntervalRef is primary)
  useEffect(() => {
    if (!session?.id || session.id === 'mock-session' || !authSession?.user) return;
    if (isPaused) return;

    const saveProgress = async () => {
      await supabase
        .from('sessions')
        .update({
          drops_earned: displayDrops,
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
  }, [session?.id, displayDrops, duration, calories, isPaused, authSession]);

  // Timer for duration only - REQUIRES BLE connection
  useEffect(() => {
    if (!session && !startTime) return;
    if (isPaused) return;
    if (!bleConnected) return; // Don't start timer until BLE is connected

    const interval = setInterval(() => {
      const now = new Date();
      const start = startTime || (session ? new Date(session.started_at) : now);
      const pausedOffset = pausedTime ? now.getTime() - pausedTime.getTime() : 0;
      const seconds = Math.floor((now.getTime() - start.getTime() - pausedOffset) / 1000);

      if (seconds >= 0) {
        setDuration(seconds);

        // Calculate pace (mock: assume 10 km/h average, so 1 min per km)
        // Real implementation would use actual distance from equipment
        const estimatedDistance = seconds / 60; // km (rough estimate)
        if (estimatedDistance > 0) {
          const paceSeconds = Math.floor(seconds / estimatedDistance);
          const paceMins = Math.floor(paceSeconds / 60);
          const paceSecs = paceSeconds % 60;
          setPace(`${paceMins}:${paceSecs.toString().padStart(2, '0')}`);
        }
      }
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [session, startTime, isPaused, pausedTime, bleConnected]);

  // Calculate current minutes (memoized to avoid recalculating on every render)
  const currentMinutes = useMemo(() => Math.floor(duration / 60), [duration]);

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
          console.log('[Workout] Challenge update result:', result);
          if (result.success && result.totalDropsAwarded && result.totalDropsAwarded > 0) {
            // Show challenge completion message in liquid gauge for 5 seconds
            setChallengeMessage(`Challenge Completed! 🎉\n+${result.totalDropsAwarded} drops`);
            
            // Clear any existing timer
            if (challengeMessageTimerRef.current) {
              clearTimeout(challengeMessageTimerRef.current);
            }
            
            // Hide message after 5 seconds
            challengeMessageTimerRef.current = setTimeout(() => {
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

  // Decoupled Drop Physics: Completely independent from BLE data stream
  // Drops are created when earnedDrops increases, with progress snapshot at creation time
  const prevEarnedDropsRef = useRef(0);
  useEffect(() => {
    // Only create drops when earnedDrops increases (not when displayDrops changes)
    if (earnedDrops > prevEarnedDropsRef.current && !isPaused && bleConnected) {
      const newDropsCount = earnedDrops - prevEarnedDropsRef.current;
      
      // Create independent drop animations for each new drop
      // Each drop captures the current progress at creation time
      const currentProgress = Math.min(drops / targetDrops, 1);
      
      for (let i = 0; i < newDropsCount; i++) {
        // Unique ID with timestamp to ensure independence
        const dropId = `${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`;
        const gaugeWidth = 280;
        const padding = 40;
        const startX = padding + Math.random() * (gaugeWidth - padding * 2);
        
        // Add drop with progress snapshot - this ensures drops don't reset when progress changes
        setActiveDrops((prev) => [...prev, { 
          id: dropId, 
          startX,
          progress: currentProgress, // Snapshot progress at creation time
        }]);
      }
    }
    prevEarnedDropsRef.current = earnedDrops;
  }, [earnedDrops, isPaused, bleConnected, drops, targetDrops]);

  // Handle drop completion with splash effect
  const handleDropDone = useCallback((dropId: string) => {
    // Remove drop from state immediately to free memory
    setActiveDrops((prev) => prev.filter((drop) => drop.id !== dropId));
    
    // Trigger splash effect in LiquidGauge when drop hits water
    liquidGaugeRef.current?.triggerImpact();
  }, []);

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
      pausedOverlayOpacity.value = withTiming(0, { duration: 300 });
    } else {
      // Pause
      setPausedTime(new Date());
      setIsPaused(true);
      pausedOverlayOpacity.value = withTiming(1, { duration: 300 });
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
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
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
    
    // Cleanup grace period timer
    if (gracePeriodTimerRef.current) {
      clearTimeout(gracePeriodTimerRef.current);
      gracePeriodTimerRef.current = null;
    }
    gracePeriodActiveRef.current = false;
    lastNonZeroRPMRef.current = 0;

    // Check if workout is too short (< 1 minute)
    if (duration < 60) {
      Alert.alert(
        'Workout Too Short',
        'Your workout is less than 1 minute. Would you like to discard it?',
        [
          { text: 'Continue', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: async () => {
              if (session?.id && session.id !== 'mock-session' && authSession?.user) {
                await supabase.from('sessions').delete().eq('id', session.id);
              }
              router.back();
            },
          },
        ]
      );
      return;
    }

    if (!authSession?.user || !session?.id || session.id === 'mock-session') {
      // Mock mode
      router.push({
        pathname: '/session-summary',
        params: {
          sessionId: 'mock',
          drops: displayDrops.toString(),
          duration: duration.toString(),
        },
      });
      return;
    }

    // Verify session has gym_id before ending
    if (!session.gym_id) {
      console.error('Session missing gym_id:', session);
      Alert.alert('Error', 'Workout session is missing gym information. Cannot save drops.');
      return;
    }

    console.log('Ending session:', {
      sessionId: session.id,
      gymId: session.gym_id,
      drops: displayDrops,
      userId: authSession.user.id,
    });

    // Final sync before ending: Ensure last data is saved
    try {
      await supabase
        .from('sessions')
        .update({
          drops_earned: earnedDrops,
          duration_seconds: duration,
          average_rpm: averageRPM > 0 ? averageRPM : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', session.id);
      console.log('[Workout] Final sync completed:', { earnedDrops, averageRPM, duration });
    } catch (syncError) {
      console.error('[Workout] Final sync error:', syncError);
    }

    // End session in Supabase
    // This will automatically:
    // 1. Update the session with end time and drops_earned
    // 2. Add drops to global balance (profiles.total_drops)
    // 3. Add drops to local balance (gym_memberships.local_drops_balance) for the gym where workout was performed
    const { data: endSessionData, error } = await supabase.rpc('end_session', {
      p_session_id: session.id,
      p_drops_earned: earnedDrops, // Use earnedDrops from sensor data, not displayDrops
    });

    if (error) {
      console.error('Error ending session:', error);
      Alert.alert('Error', `Failed to save workout: ${error.message}`);
      return;
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
        drops: earnedDrops.toString(), // Use earnedDrops from sensor data
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

  const pausedOverlayStyle = useAnimatedStyle(() => ({
    opacity: pausedOverlayOpacity.value,
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

  // Premium Pulse Rings: 3 concentric rings with different speeds
  const pulseRing1Style = useAnimatedStyle(() => {
    return {
      transform: [{ scale: pulseRing1Scale.value }],
      opacity: pulseRing1Opacity.value,
    };
  });

  const pulseRing2Style = useAnimatedStyle(() => {
    return {
      transform: [{ scale: pulseRing2Scale.value }],
      opacity: pulseRing2Opacity.value,
    };
  });

  const pulseRing3Style = useAnimatedStyle(() => {
    return {
      transform: [{ scale: pulseRing3Scale.value }],
      opacity: pulseRing3Opacity.value,
    };
  });


  // Determine pulse ring colors based on smoothed RPM (gradient: inner strong, outer faint)
  const getPulseRingColor = (ringIndex: 1 | 2 | 3) => {
    if (smoothedRPM === 0) return theme.colors.textSecondary;
    if (smoothedRPM > 90) {
      // High RPM: Neon cyan gradient
      if (ringIndex === 1) return '#00FFE5'; // Innermost: brightest
      if (ringIndex === 2) return '#00FFE5' + 'CC'; // Middle: 80% opacity
      return '#00FFE5' + '80'; // Outermost: 50% opacity
    }
    if (smoothedRPM > 60) {
      // Medium RPM: Primary blue gradient
      if (ringIndex === 1) return theme.colors.primary;
      if (ringIndex === 2) return theme.colors.primary + 'CC';
      return theme.colors.primary + '80';
    }
    // Low RPM: Subtle blue gradient
    if (ringIndex === 1) return theme.colors.primary + 'CC';
    if (ringIndex === 2) return theme.colors.primary + '99';
    return theme.colors.primary + '66';
  };


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
          color={status === 'ok' ? theme.colors.primary : theme.colors.textSecondary}
        />
      </Animated.View>
    );
  };

  // Calculate progress (handle overachievement)
  const progress = Math.min(drops / targetDrops, 1);
  const isOverachieved = drops > targetDrops;
  const showBonus = drops > 0 && drops % 100 === 0 && drops > 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
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
          <Text style={[styles.headerDropsText, getNumberStyle(18)]}>
            {displayDrops.toLocaleString()}
          </Text>
        </View>
      </View>

      {/* Bonus Banner */}
      {showBonus && (
        <Animated.View style={[styles.bonusBanner, splashStyle]}>
          <Text style={styles.bonusText}>
            +100 <Ionicons name="water" size={16} color={theme.colors.primary} /> DROPS BONUS
          </Text>
        </Animated.View>
      )}

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

          {/* Premium Pulse Rings: 3 concentric rings with different speeds */}
          {bleConnected && smoothedRPM > 0 && !isPaused && (
            <>
              {/* Ring 3 (outermost): Slowest, most subtle */}
              <Animated.View
                style={[
                  styles.premiumPulseRing,
                  pulseRing3Style,
                  {
                    width: 320,
                    height: 320,
                    borderRadius: 160,
                    borderColor: getPulseRingColor(3),
                    shadowColor: getPulseRingColor(3),
                  },
                ]}
              />
              {/* Ring 2 (middle): Medium speed */}
              <Animated.View
                style={[
                  styles.premiumPulseRing,
                  pulseRing2Style,
                  {
                    width: 310,
                    height: 310,
                    borderRadius: 155,
                    borderColor: getPulseRingColor(2),
                    shadowColor: getPulseRingColor(2),
                  },
                ]}
              />
              {/* Ring 1 (innermost): Fastest, most intense */}
              <Animated.View
                style={[
                  styles.premiumPulseRing,
                  pulseRing1Style,
                  {
                    width: 300,
                    height: 300,
                    borderRadius: 150,
                    borderColor: getPulseRingColor(1),
                    shadowColor: getPulseRingColor(1),
                  },
                ]}
              />
            </>
          )}

          {/* Explosion Animation: Triggered when BLE connects */}
          {bleConnected && (
            <Animated.View
              style={[
                styles.explosionCircle,
                explosionStyle,
                {
                  borderColor: theme.colors.primary,
                  shadowColor: theme.colors.primary,
                },
              ]}
            />
          )}


          {/* Circular Progress Ring - Only show when BLE is connected */}
          {bleConnected && (
            <CircularProgressRing
              progress={progress}
              size={290}
              strokeWidth={3}
            />
          )}

          {/* LiquidGauge Component - Only show when BLE is connected */}
          {bleConnected && (
            <Animated.View style={dropJumpStyle}>
              <LiquidGauge
                ref={liquidGaugeRef}
                progress={progress}
                value={challengeMessage || displayDrops}
                size={280}
                strokeWidth={4}
              />
            </Animated.View>
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

          {/* Premium DropEmitter - Completely decoupled from BLE stream */}
          {bleConnected && (
            <DropEmitter
              drops={activeDrops}
              containerSize={280}
              onDropComplete={handleDropDone}
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
          <Text style={[styles.statValue, getNumberStyle(20)]}>{calories}</Text>
          <Text style={styles.statLabel}>kcal</Text>
        </View>

        <View style={styles.statItem}>
          <Ionicons name="speedometer-outline" size={24} color={theme.colors.primary} />
          <Text style={[styles.statValue, getNumberStyle(20)]}>{pace}</Text>
          <Text style={styles.statLabel}>min/km</Text>
        </View>

        {/* RPM Display (only show if sensor is connected) */}
        {(session?.machine?.sensor_id || sensorId) && (
          <View style={styles.statItem}>
            <View style={styles.rpmHeader}>
              <Ionicons name="pulse-outline" size={24} color={smoothedRPM > 0 && bleConnected ? theme.colors.primary : theme.colors.textSecondary} />
              {/* Live Signal Indicator */}
              {bleConnected && (
                <SignalIndicator status={signalStatus} />
              )}
            </View>
            <Text style={[
              styles.statValue, 
              getNumberStyle(20),
              { color: displayRPMValue > 0 && bleConnected ? theme.colors.primary : theme.colors.textSecondary }
            ]}>
              {bleConnected ? displayRPMValue : '--'}
            </Text>
            <Text style={styles.statLabel}>RPM</Text>
          </View>
        )}
      </View>

      {/* Progress Bar */}
      <View style={styles.progressBarContainer}>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressBarFill,
              {
                width: `${Math.min(progress * 100, 100)}%`,
                backgroundColor: isOverachieved ? theme.colors.secondary : theme.colors.primary,
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
                  setShowSensorAsleep(false);
                  setBleConnected(true);
                  Alert.alert('Uspešno', 'Senzor ponovo povezan', [{ text: 'OK' }]);
                } else {
                  Alert.alert(
                    'Greška',
                    'Nije moguće ponovo povezati senzor. Proverite da li je senzor uključen i u blizini.',
                    [{ text: 'OK' }]
                  );
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
          <ActivityIndicator size="large" color={theme.colors.primary} />
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
});
