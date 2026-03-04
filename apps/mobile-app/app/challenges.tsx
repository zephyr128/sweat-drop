import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { theme, getNumberStyle } from '@/lib/theme';
import BackButton from '@/components/BackButton';
import { useBranding } from '@/lib/contexts/ThemeContext';
import Animated, { FadeInDown } from 'react-native-reanimated';

function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(0, 229, 255, ${alpha})`;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

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

    const today = new Date().toISOString().split('T')[0];

    const { data: challengesData, error: challengesError } = await supabase
      .from('gym_challenges')
      .select(`
        id, name, description, challenge_type, target_drops,
        milestone_threshold, reward_drops, streak_days,
        start_date, end_date, gym_id, created_at, updated_at
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

    const challengeIds = challengesData.map((c) => c.id);
    const { data: progressData, error: progressError } = await supabase
      .from('challenge_progress')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('gym_id', gymId)
      .in('challenge_id', challengeIds);

    if (progressError) {
      console.error('Error loading challenge progress:', progressError);
    }

    const mergedChallenges = challengesData.map((challenge) => {
      const prog = progressData?.find((p) => p.challenge_id === challenge.id);
      return { ...challenge, progress: prog };
    });

    setChallenges(mergedChallenges);
  };

  const loadProgress = async () => {
    if (!session?.user) return;

    const progressMap: Record<string, any> = {};
    challenges.forEach((c: any) => {
      if (c.progress) {
        const current = c.challenge_type === 'streak'
          ? (c.progress.current_streak_days || 0)
          : (c.progress.current_drops || 0);

        progressMap[c.id] = {
          current_drops: current,
          current_minutes: current,
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
      case 'daily': return 'Daily';
      case 'weekly': return 'Weekly';
      case 'monthly': return 'Monthly';
      case 'streak': return 'Streak';
      case 'milestone': return 'Milestone';
      default: return type;
    }
  };

  const getChallengeIcon = (type: string): keyof typeof Ionicons.glyphMap => {
    switch (type) {
      case 'daily': return 'sunny-outline';
      case 'weekly': return 'calendar-outline';
      case 'monthly': return 'trophy-outline';
      case 'streak': return 'flame-outline';
      case 'milestone': return 'flag-outline';
      default: return 'star-outline';
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
            <Ionicons name="flash-outline" size={64} color={theme.colors.textSecondary} />
            <Text style={styles.emptyText}>No active challenges</Text>
            <Text style={styles.emptySubtext}>Check back later for new challenges from your gym!</Text>
          </View>
        ) : (
          challenges.map((challenge: any, index: number) => {
            const userProgress = progress[challenge.id];

            let target = 0;
            if (challenge.challenge_type === 'milestone') {
              target = challenge.milestone_threshold || 0;
            } else if (challenge.challenge_type === 'streak') {
              target = challenge.streak_days || challenge.target_drops || 0;
            } else {
              target = challenge.target_drops || 0;
            }

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
            const challengeTypeLabel = getChallengeTypeLabel(challenge.challenge_type || 'daily');

            return (
              <Animated.View key={challenge.id} entering={FadeInDown.delay(100 + index * 80).duration(400)}>
                <TouchableOpacity
                  style={[
                    styles.challengeCard,
                    { borderColor: hexToRgba(branding.primary, isCompleted ? 0.3 : 0.15) },
                  ]}
                  onPress={() => {
                    router.push({
                      pathname: '/challenge-detail',
                      params: { challengeId: challenge.id, gymId: challenge.gym_id },
                    });
                  }}
                  activeOpacity={0.8}
                >
                  <BlurView intensity={50} tint="dark" style={[styles.challengeBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
                    {/* Card Header */}
                    <View style={styles.challengeHeader}>
                      <View style={styles.challengeHeaderLeft}>
                        <View style={[styles.typeIcon, { backgroundColor: hexToRgba(branding.primary, 0.1) }]}>
                          <Ionicons name={getChallengeIcon(challenge.challenge_type)} size={18} color={branding.primary} />
                        </View>
                        <View>
                          <Text style={[styles.challengeType, { color: branding.primary }]}>
                            {challengeTypeLabel}
                          </Text>
                          <Text style={styles.challengeName}>{challenge.name}</Text>
                        </View>
                      </View>
                      {challenge.end_date && (
                        <View style={styles.timeBadge}>
                          <Ionicons name="time-outline" size={12} color={theme.colors.textSecondary} />
                          <Text style={styles.timeRemaining}>{getTimeRemaining(challenge.end_date)}</Text>
                        </View>
                      )}
                    </View>

                    {challenge.description && (
                      <Text style={styles.challengeDescription} numberOfLines={2}>
                        {challenge.description}
                      </Text>
                    )}

                    {/* Progress Bar */}
                    <View style={styles.progressContainer}>
                      <View style={styles.progressBarTrack}>
                        <LinearGradient
                          colors={isCompleted
                            ? [theme.colors.secondary, theme.colors.secondary]
                            : [branding.primary, hexToRgba(branding.primary, 0.7)]
                          }
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={[styles.progressFill, { width: `${progressPercent}%` }]}
                        />
                      </View>
                      <View style={styles.progressMeta}>
                        <Text style={styles.progressText}>
                          <Text style={[getNumberStyle(14), { color: branding.primary }]}>{current}</Text>
                          <Text style={styles.progressDivider}> / </Text>
                          <Text style={[getNumberStyle(14), { color: theme.colors.textSecondary }]}>{target}</Text>
                          <Text style={styles.progressUnit}>
                            {' '}{challenge.challenge_type === 'streak' ? 'days' : 'drops'}
                          </Text>
                        </Text>
                        <Text style={[styles.progressPercent, getNumberStyle(12)]}>
                          {Math.round(progressPercent)}%
                        </Text>
                      </View>
                    </View>

                    {/* Reward info */}
                    {challenge.reward_drops > 0 && !isCompleted && (
                      <View style={[styles.rewardInfo, { borderTopColor: hexToRgba(branding.primary, 0.1) }]}>
                        <Ionicons name="water" size={14} color={branding.primary} />
                        <Text style={[styles.rewardText, { color: branding.primary }]}>
                          {challenge.reward_drops} drops reward
                        </Text>
                      </View>
                    )}

                    {/* Completed badge */}
                    {isCompleted && (
                      <View style={styles.completedBadge}>
                        <Ionicons name="checkmark-circle" size={16} color={theme.colors.secondary} />
                        <Text style={styles.completedText}>
                          Completed! {challenge.reward_drops || 0} drops earned
                        </Text>
                      </View>
                    )}
                  </BlurView>
                </TouchableOpacity>
              </Animated.View>
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
    flex: 1,
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    textAlign: 'center',
    letterSpacing: 0.5,
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
    paddingBottom: theme.spacing.xl,
  },
  emptyState: {
    padding: theme.spacing['3xl'],
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  emptyText: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    letterSpacing: 0.3,
  },
  emptySubtext: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  /* Challenge Card */
  challengeCard: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    marginBottom: theme.spacing.md,
    borderWidth: 1,
  },
  challengeBlur: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    padding: theme.spacing.lg,
  },
  challengeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.md,
  },
  challengeHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flex: 1,
  },
  typeIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  challengeType: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.semibold,
    textTransform: 'uppercase',
    marginBottom: 2,
    letterSpacing: 0.5,
  },
  challengeName: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    letterSpacing: 0.3,
  },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.md,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  timeRemaining: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
  },
  challengeDescription: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
    letterSpacing: 0.3,
    lineHeight: 20,
  },
  /* Progress */
  progressContainer: {
    gap: theme.spacing.sm,
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  progressDivider: {
    color: theme.colors.textSecondary,
  },
  progressUnit: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.fontSize.xs,
  },
  progressPercent: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.fontSize.xs,
  },
  /* Reward */
  rewardInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  rewardText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    letterSpacing: 0.3,
  },
  /* Completed */
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.secondary + '12',
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.secondary + '25',
  },
  completedText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.secondary,
    letterSpacing: 0.3,
  },
});
