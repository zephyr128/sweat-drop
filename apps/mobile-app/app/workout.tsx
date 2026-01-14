import { View, Text, StyleSheet, TouchableOpacity, Alert, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { theme, getNumberStyle } from '@/lib/theme';
import LiquidGauge, { LiquidGaugeRef } from '@/components/LiquidGauge';
import FallingDrop from '@/components/FallingDrop';
import CircularProgressRing from '@/components/CircularProgressRing';
import { useChallengeProgress } from '@/hooks/useChallengeProgress';

interface ActiveDrop {
  id: string;
  startX: number;
}

export default function WorkoutScreen() {
  const { sessionId, equipmentId, gymId, machineType: paramMachineType } = useLocalSearchParams<{
    sessionId?: string;
    equipmentId?: string;
    gymId?: string;
    machineType?: string;
  }>();
  const [session, setSession] = useState<any>(null);
  const [drops, setDrops] = useState(0);
  const [displayDrops, setDisplayDrops] = useState(0);
  const [duration, setDuration] = useState(0);
  const [calories, setCalories] = useState(0);
  const [pace, setPace] = useState<string>('0:00'); // min/km
  const [targetDrops, setTargetDrops] = useState(500);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [pausedTime, setPausedTime] = useState<Date | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [activeDrops, setActiveDrops] = useState<ActiveDrop[]>([]);
  const [challengeMessage, setChallengeMessage] = useState<string | null>(null);
  const router = useRouter();
  const { session: authSession } = useSession();
  const liquidGaugeRef = useRef<LiquidGaugeRef>(null);
  const saveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const challengeUpdateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastChallengeUpdateRef = useRef<number>(0);
  const challengeMessageTimerRef = useRef<NodeJS.Timeout | null>(null);

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

  
  // Animation values
  const splashAnim = useSharedValue(0);
  const pausedOverlayOpacity = useSharedValue(0);
  const finishPressProgress = useSharedValue(0);

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

  // Save session progress to Supabase (every 30 seconds)
  useEffect(() => {
    if (!session?.id || session.id === 'mock-session' || !authSession?.user) return;
    if (isPaused) return; // Don't save when paused

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

    // Save immediately, then every 30 seconds
    saveProgress();
    saveIntervalRef.current = setInterval(saveProgress, 30000);

    return () => {
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
      }
    };
  }, [session?.id, displayDrops, duration, calories, isPaused, authSession]);

  // Timer for drops and duration
  useEffect(() => {
    if (!session && !startTime) return;
    if (isPaused) return;

    const interval = setInterval(() => {
      const now = new Date();
      const start = startTime || (session ? new Date(session.started_at) : now);
      const pausedOffset = pausedTime ? now.getTime() - pausedTime.getTime() : 0;
      const seconds = Math.floor((now.getTime() - start.getTime() - pausedOffset) / 1000);

      if (seconds >= 0) {
        setDuration(seconds);

        // Calculate drops (1 drop per 10 seconds, with bonus milestones)
        const baseDrops = Math.floor(seconds / 10);
        const bonus = Math.floor(baseDrops / 100) * 100;
        const newDrops = baseDrops + bonus;

        setDrops((prevDrops) => {
          if (newDrops > prevDrops && newDrops % 100 === 0 && newDrops > 0) {
            splashAnim.value = withSequence(
              withTiming(1, { duration: 300 }),
              withTiming(0, { duration: 300 })
            );
          }
          return newDrops;
        });

        setDisplayDrops(newDrops);

        // Calculate calories (rough estimate: 1 drop ≈ 0.4 kcal)
        setCalories(Math.floor(newDrops * 0.4));

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

    return () => clearInterval(interval);
  }, [session, startTime, isPaused, pausedTime, splashAnim]);

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

  // Track drops changes and add falling drops
  const prevDropsRef = useRef(0);
  useEffect(() => {
    if (drops > prevDropsRef.current && !isPaused) {
      const newDropsCount = drops - prevDropsRef.current;
      
      for (let i = 0; i < newDropsCount; i++) {
        const dropId = `${Date.now()}-${Math.random()}`;
        const gaugeWidth = 280;
        const padding = 40;
        const startX = padding + Math.random() * (gaugeWidth - padding * 2);
        
        setActiveDrops((prev) => [...prev, { id: dropId, startX }]);
      }
    }
    prevDropsRef.current = drops;
  }, [drops, isPaused]);

  // Handle drop completion
  const handleDropDone = useCallback((dropId: string) => {
    setActiveDrops((prev) => prev.filter((drop) => drop.id !== dropId));
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

    // End session in Supabase
    // This will automatically:
    // 1. Update the session with end time and drops_earned
    // 2. Add drops to global balance (profiles.total_drops)
    // 3. Add drops to local balance (gym_memberships.local_drops_balance) for the gym where workout was performed
    const { data: endSessionData, error } = await supabase.rpc('end_session', {
      p_session_id: session.id,
      p_drops_earned: displayDrops,
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

    router.push({
      pathname: '/session-summary',
      params: {
        sessionId: session.id,
        drops: displayDrops.toString(),
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
          {/* Circular Progress Ring */}
          <CircularProgressRing
            progress={progress}
            size={290}
            strokeWidth={3}
          />

          {/* LiquidGauge Component */}
          <LiquidGauge
            ref={liquidGaugeRef}
            progress={progress}
            value={challengeMessage || displayDrops}
            size={280}
            strokeWidth={4}
          />

          {/* DROPS Label */}
          <View style={styles.dropsLabelContainer}>
            <Text style={styles.dropsLabel}>DROPS</Text>
            {isOverachieved && (
              <Text style={styles.overachievedText}>🎉 Overachieved!</Text>
            )}
          </View>

          {/* Falling Drops - Circular Container with overflow hidden */}
          <View style={styles.fallingDropsContainer} pointerEvents="none">
            {activeDrops.map((drop) => {
              const gaugeSize = 280;
              const waterLevelFromBottom = progress * gaugeSize;
              // waterLevelY is distance from bottom, pass it to component
              const waterLevelY = waterLevelFromBottom;
              
              return (
                <FallingDrop
                  key={drop.id}
                  startX={drop.startX}
                  targetY={waterLevelY}
                  containerHeight={gaugeSize}
                  onDone={() => handleDropDone(drop.id)}
                  delay={0}
                />
              );
            })}
          </View>
        </View>
      </View>

      {/* Stats Grid (Time, Calories, Pace) */}
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
