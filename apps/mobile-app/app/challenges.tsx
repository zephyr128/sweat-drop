import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { theme, getNumberStyle } from '@/lib/theme';
import BackButton from '@/components/BackButton';
import { useBranding } from '@/lib/contexts/ThemeContext';

export default function ChallengesScreen() {
  const router = useRouter();
  const { session } = useSession();
  const branding = useBranding();
  const [challenges, setChallenges] = useState<any[]>([]);
  const [progress, setProgress] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (session?.user) {
      loadChallenges();
    }
  }, [session]);

  // Refresh challenges when screen is focused (to update progress after workout)
  useFocusEffect(
    useCallback(() => {
      if (session?.user) {
        loadChallenges();
      }
    }, [session?.user])
  );

  useEffect(() => {
    if (challenges.length > 0) {
      loadProgress();
    }
    setLoading(false);
  }, [challenges]);

  const loadChallenges = async () => {
    if (!session?.user) return;

    const { data: profileData } = await supabase
      .from('profiles')
      .select('home_gym_id')
      .eq('id', session.user.id)
      .single();

    const gymId = profileData?.home_gym_id;

    if (!gymId) {
      setChallenges([]);
      return;
    }

    // Query challenges directly with new schema (challenge_type, target_drops, current_drops)
    const today = new Date().toISOString().split('T')[0];
    
    const { data: challengesData, error: challengesError } = await supabase
      .from('challenges')
      .select(`
        id,
        name,
        description,
        challenge_type,
        target_drops,
        milestone_threshold,
        reward_drops,
        streak_days,
        start_date,
        end_date,
        gym_id,
        created_at,
        updated_at
      `)
      .eq('gym_id', gymId)
      .eq('is_active', true)
      .lte('start_date', today)
      .gte('end_date', today);

    if (challengesError) {
      console.error('Error loading challenges:', challengesError);
      setChallenges([]);
      return;
    }

    if (!challengesData || challengesData.length === 0) {
      setChallenges([]);
      return;
    }

    // Get challenge progress for user
    const challengeIds = challengesData.map((c) => c.id);
    const { data: progressData, error: progressError } = await supabase
      .from('challenge_progress')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('gym_id', gymId)
      .in('challenge_id', challengeIds);

    if (progressError) {
      console.error('Error loading challenge progress:', progressError);
      // Continue without progress data
    }

    // Merge challenges with progress
    const mergedChallenges = challengesData.map((challenge) => {
      const progress = progressData?.find((p) => p.challenge_id === challenge.id);
      return {
        ...challenge,
        progress: progress,
      };
    });

    setChallenges(mergedChallenges);
  };

  const loadProgress = async () => {
    if (!session?.user) return;

    // Progress is already loaded in loadChallenges
    // Just create a map from the progress data
    const progressMap: Record<string, any> = {};
    challenges.forEach((c: any) => {
      if (c.progress) {
        // Use current_drops for drops-based challenges, current_streak_days for streak
        const current = c.challenge_type === 'streak' 
          ? (c.progress.current_streak_days || 0)
          : (c.progress.current_drops || 0);
        
        progressMap[c.id] = {
          current_drops: current,
          current_minutes: current, // Keep for backward compatibility
          current_streak_days: c.progress.current_streak_days || 0,
          is_completed: c.progress.is_completed || false,
        };
      }
    });
    setProgress(progressMap);
  };

  const getTimeRemaining = (endDate: string) => {
    const end = new Date(endDate);
    const now = new Date();
    const diff = end.getTime() - now.getTime();

    if (diff <= 0) return 'Ended';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days > 0) return `${days}d ${hours}h left`;
    return `${hours}h left`;
  };

  const getChallengeTypeLabel = (type: string) => {
    switch (type) {
      case 'daily':
        return 'Daily';
      case 'weekly':
        return 'Weekly';
      case 'monthly':
        return 'Monthly';
      case 'streak':
        return 'Streak';
      case 'milestone':
        return 'Milestone';
      default:
        return type;
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={branding.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Radial gradient background */}
      <LinearGradient
        colors={['#000000', '#0A0E1A', '#000000']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Header */}
      <View style={styles.header}>
        <BackButton />
        <Text style={styles.headerTitle}>Challenges</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {challenges.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No active challenges</Text>
          </View>
        ) : (
          challenges.map((challenge: any) => {
            const userProgress = progress[challenge.id];
            
            // Calculate target based on challenge type
            let target = 0;
            if (challenge.challenge_type === 'milestone') {
              target = challenge.milestone_threshold || 0;
            } else if (challenge.challenge_type === 'streak') {
              target = challenge.streak_days || challenge.target_drops || 0;
            } else {
              target = challenge.target_drops || 0;
            }
            
            // Calculate current progress based on challenge type
            let current = 0;
            if (challenge.challenge_type === 'streak') {
              current = userProgress?.current_streak_days || 0;
            } else {
              current = userProgress?.current_drops || userProgress?.current_minutes || 0;
            }
            
            const progressPercent = target > 0 
              ? Math.min((current / target) * 100, 100)
              : 0;
            const isCompleted = userProgress?.is_completed || false;

            // Determine challenge type label
            const challengeTypeLabel = getChallengeTypeLabel(challenge.challenge_type || 'daily');

            return (
              <TouchableOpacity
                key={challenge.id}
                style={styles.challengeCard}
                onPress={() => {
                  router.push({
                    pathname: '/challenge-detail',
                    params: {
                      challengeId: challenge.id,
                      gymId: challenge.gym_id,
                    },
                  });
                }}
                activeOpacity={0.9}
              >
                <View style={styles.challengeHeader}>
                  <View>
                    <Text style={[styles.challengeType, { color: branding.primary }]}>
                      {challengeTypeLabel}
                    </Text>
                    <Text style={styles.challengeName}>{challenge.name}</Text>
                  </View>
                  {challenge.end_date && (
                    <Text style={styles.timeRemaining}>
                      {getTimeRemaining(challenge.end_date)}
                    </Text>
                  )}
                </View>

                {challenge.description && (
                  <Text style={styles.challengeDescription}>
                    {challenge.description}
                  </Text>
                )}

                <View style={styles.progressContainer}>
                  <View style={[styles.progressBar, { backgroundColor: branding.primaryLight }]}>
                    <View
                      style={[
                        styles.progressFill,
                        { 
                          width: `${progressPercent}%`,
                          backgroundColor: isCompleted ? theme.colors.secondary : branding.primary,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.progressText}>
                    <Text style={[getNumberStyle(14), { color: branding.primary }]}>{current}</Text>
                    {' / '}
                    <Text style={[getNumberStyle(14), { color: branding.primary }]}>{target}</Text>
                    {' '}
                    {challenge.challenge_type === 'streak' ? 'days' : 'drops'}
                  </Text>
                </View>

                {challenge.reward_drops > 0 && (
                  <View style={styles.rewardInfo}>
                    <Ionicons name="water" size={14} color="#00E5FF" />
                    <Text style={[styles.rewardText, { color: branding.primary }]}>
                      {challenge.reward_drops} drops reward
                    </Text>
                  </View>
                )}

                {isCompleted && (
                  <View style={styles.completedBadge}>
                    <Text style={styles.completedText}>
                      ✅ Completed! {challenge.reward_drops || 0} drops earned
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  headerTitle: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    letterSpacing: 0.5,
    pointerEvents: 'none', // Don't block touch events
  },
  headerSpacer: {
    width: 40,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing.lg,
  },
  emptyState: {
    padding: theme.spacing['3xl'],
    alignItems: 'center',
  },
  emptyText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
  },
  challengeCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  challengeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.md,
  },
  challengeType: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.primary,
    textTransform: 'uppercase',
    marginBottom: theme.spacing.xs,
    letterSpacing: 0.5,
  },
  challengeName: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    letterSpacing: 0.3,
  },
  timeRemaining: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
  },
  challengeDescription: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
    letterSpacing: 0.3,
  },
  progressContainer: {
    marginTop: theme.spacing.sm,
  },
  progressBar: {
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: theme.borderRadius.sm,
    marginBottom: theme.spacing.sm,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.sm,
  },
  progressFillCompleted: {
    backgroundColor: theme.colors.secondary,
  },
  progressText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
  },
  completedBadge: {
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.secondary + '15',
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.secondary + '30',
  },
  completedText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.secondary,
    letterSpacing: 0.3,
  },
  rewardInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  rewardText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeight.semibold,
    letterSpacing: 0.3,
  },
});
