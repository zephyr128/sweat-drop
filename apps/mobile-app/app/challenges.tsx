import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';
import { useSession } from '@/hooks/useSession';
import { theme, getNumberStyle, fontStyles, hexToRgba} from '@/lib/theme';
import BackButton from '@/components/BackButton';
import { useBranding } from '@/lib/contexts/ThemeContext';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import i18n from '@/lib/i18n';

export default function ChallengesScreen() {
  const router = useRouter();
  const { session } = useSession();
  const branding = useBranding();
  const { t } = useTranslation('challenges');
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
      .or(`end_date.gte.${today},end_date.is.null`);

    if (challengesError) {
      log.error('Error loading challenges:', challengesError);
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
      log.error('Error loading challenge progress:', progressError);
    }

    // For milestone challenges, fetch actual local_drops_balance
    const hasMilestone = challengesData.some((c) => c.challenge_type === 'milestone');
    let localDropsBalance = 0;
    if (hasMilestone) {
      const { data: membershipData } = await supabase
        .from('gym_memberships')
        .select('local_drops_balance')
        .eq('user_id', session.user.id)
        .eq('gym_id', gymId)
        .single();
      localDropsBalance = membershipData?.local_drops_balance || 0;
    }

    const mergedChallenges = challengesData.map((challenge) => {
      const prog = progressData?.find((p) => p.challenge_id === challenge.id);
      
      // For milestone challenges, override progress with local_drops_balance
      if (challenge.challenge_type === 'milestone' && prog) {
        return {
          ...challenge,
          progress: {
            ...prog,
            current_drops: localDropsBalance,
            // If actual balance >= milestone threshold, mark as completed on client
            is_completed: prog.is_completed || localDropsBalance >= (challenge.milestone_threshold || challenge.target_drops || 0),
          },
        };
      }
      
      return { ...challenge, progress: prog };
    });

    setChallenges(mergedChallenges);
  };

  const loadProgress = async () => {
    if (!session?.user) return;

    const progressMap: Record<string, any> = {};
    challenges.forEach((c: any) => {
      if (c.progress) {
        const current = (c.challenge_type === 'streak' || c.challenge_type === 'checkin_streak')
          ? (c.progress.current_streak_days || 0)
          : (c.progress.current_drops || 0);

        progressMap[c.id] = {
          current_drops: current,
          current_minutes: current,
          current_streak_days: c.progress.current_streak_days || 0,
          is_completed: c.progress.is_completed || false,
          updated_at: c.progress.updated_at || null,
        };
      }
    });
    setProgress(progressMap);
  };

  const getTimeUntilMidnight = (): string => {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const diff = midnight.getTime() - now.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  const getTimeUntilSunday = (): string => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysUntilSunday = dayOfWeek === 0 ? 7 : 7 - dayOfWeek;
    const sunday = new Date(now);
    sunday.setDate(sunday.getDate() + daysUntilSunday);
    sunday.setHours(0, 0, 0, 0);
    const diff = sunday.getTime() - now.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (days > 0) return `${days}d ${hours}h`;
    return `${hours}h`;
  };

  const getChallengeTimeDisplay = (
    challengeType: string,
    endDate: string | null,
    isCompleted: boolean
  ): { text: string; style: 'countdown' | 'recurring' | 'permanent' | 'completed' } | null => {
    if (isCompleted) {
      if (challengeType === 'daily') {
        return { text: t('completedResetsIn', { time: getTimeUntilMidnight() }), style: 'completed' };
      }
      if (challengeType === 'weekly') {
        return { text: t('completedResetsSunday', { time: getTimeUntilSunday() }), style: 'completed' };
      }
      return { text: t('completedLabel'), style: 'completed' };
    }

    if (challengeType === 'milestone') {
      return { text: t('ongoing'), style: 'permanent' };
    }

    if (!endDate) {
      return { text: t('ongoing'), style: 'permanent' };
    }

    const end = new Date(endDate + 'T23:59:59');
    const now = new Date();
    const diff = end.getTime() - now.getTime();

    if (diff <= 0) return { text: t('ended'), style: 'countdown' };

    if (challengeType === 'daily') {
      return { text: t('resetsIn', { time: getTimeUntilMidnight() }), style: 'recurring' };
    }
    if (challengeType === 'weekly') {
      return { text: t('resetsIn', { time: getTimeUntilSunday() }), style: 'recurring' };
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) return { text: t('timeLeft', { days, hours, minutes }), style: 'countdown' };
    if (hours > 0) return { text: t('hoursLeft', { hours, minutes }), style: 'countdown' };
    return { text: t('minutesLeft', { minutes }), style: 'countdown' };
  };

  const getChallengeTypeLabel = (type: string) => {
    switch (type) {
      case 'daily': return t('dailyChallenge');
      case 'weekly': return t('weeklyChallenge');
      case 'monthly': return t('monthlyChallenge');
      case 'streak': return t('streakChallenge');
      case 'milestone': return t('milestoneChallenge');
      case 'checkin_streak': return t('checkinStreakChallenge');
      case 'checkin_count': return t('checkinCountChallenge');
      default: return t('challenge');
    }
  };

  const getChallengeIcon = (type: string): keyof typeof Ionicons.glyphMap => {
    switch (type) {
      case 'daily': return 'sunny-outline';
      case 'weekly': return 'calendar-outline';
      case 'monthly': return 'trophy-outline';
      case 'streak': return 'flame-outline';
      case 'milestone': return 'flag-outline';
      case 'checkin_streak': return 'flame-outline';
      case 'checkin_count': return 'location-outline';
      default: return 'star-outline';
    }
  };

  const activeChallenges = useMemo(() => challenges.filter((c: any) => {
    const isCompleted = progress[c.id]?.is_completed || false;
    if (!isCompleted) return true;
    return c.challenge_type === 'daily' || c.challenge_type === 'weekly';
  }), [challenges, progress]);

  const completedChallenges = useMemo(() => challenges.filter((c: any) => {
    const isCompleted = progress[c.id]?.is_completed || false;
    if (!isCompleted) return false;
    return c.challenge_type !== 'daily' && c.challenge_type !== 'weekly';
  }), [challenges, progress]);

  const formatCompletedDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString(
      i18n.language === 'sr' ? 'sr-RS' : 'en-US',
      { month: 'short', day: 'numeric' }
    );
  };

  type ListItem =
    | { type: 'active_header'; id: string }
    | { type: 'active'; id: string; challenge: any; index: number }
    | { type: 'no_active'; id: string }
    | { type: 'completed_header'; id: string }
    | { type: 'completed'; id: string; challenge: any; index: number };

  const listData = useMemo(() => {
    const items: ListItem[] = [];

    if (activeChallenges.length > 0) {
      items.push({ type: 'active_header', id: 'header-active' });
      activeChallenges.forEach((challenge: any, index: number) => {
        items.push({ type: 'active', id: challenge.id, challenge, index });
      });
    }

    if (activeChallenges.length === 0 && completedChallenges.length > 0) {
      items.push({ type: 'no_active', id: 'no-active' });
    }

    if (completedChallenges.length > 0) {
      items.push({ type: 'completed_header', id: 'header-completed' });
      completedChallenges.forEach((challenge: any, index: number) => {
        items.push({ type: 'completed', id: `completed-${challenge.id}`, challenge, index });
      });
    }

    return items;
  }, [activeChallenges, completedChallenges]);

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
        <Text style={styles.headerTitle}>{t('title')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <FlatList
        data={listData}
        keyExtractor={(item) => item.id}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="flash-outline" size={64} color={theme.colors.textSecondary} />
            <Text style={styles.emptyText}>{t('noChallenges')}</Text>
            <Text style={styles.emptySubtext}>{t('checkBackSoon')}</Text>
          </View>
        }
        renderItem={({ item }) => {
          if (item.type === 'active_header') {
            return <Text style={styles.sectionLabel}>{t('active')}</Text>;
          }

          if (item.type === 'no_active') {
            return (
              <View style={styles.emptySection}>
                <Text style={styles.emptySectionText}>{t('noActive')}</Text>
              </View>
            );
          }

          if (item.type === 'completed_header') {
            return <Text style={[styles.sectionLabel, { marginTop: theme.spacing.lg }]}>{t('completed')}</Text>;
          }

          if (item.type === 'completed') {
            const { challenge, index } = item;
            const userProgress = progress[challenge.id];
            return (
              <Animated.View entering={FadeInDown.delay(100 + index * 80).duration(400)}>
                <TouchableOpacity
                  style={[styles.completedCard, { borderColor: hexToRgba(branding.primary, 0.08) }]}
                  onPress={() => router.push({
                    pathname: '/challenge-detail',
                    params: { challengeId: challenge.id, gymId: challenge.gym_id },
                  })}
                  activeOpacity={0.8}
                >
                  <View style={styles.completedLeft}>
                    {challenge.badge_image_url ? (
                      <Image source={challenge.badge_image_url} style={styles.completedBadgeImg} transition={200} />
                    ) : (
                      <View style={[styles.completedBadgePlaceholder, { backgroundColor: hexToRgba(branding.primary, 0.1) }]}>
                        <Text style={styles.completedCheck}>✅</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.completedName} numberOfLines={1}>{challenge.name}</Text>
                      <Text style={styles.completedDate}>
                        {t('completedOn', { date: formatCompletedDate(userProgress?.updated_at || challenge.updated_at) })}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.completedRight}>
                    <Text style={[styles.completedDrops, { color: branding.primary }]}>
                      +{challenge.reward_drops || 0}
                    </Text>
                    <Text style={styles.completedDropsLabel}>drops</Text>
                  </View>
                </TouchableOpacity>
              </Animated.View>
            );
          }

          const { challenge, index } = item;
          const userProgress = progress[challenge.id];

          let target = 0;
          if (challenge.challenge_type === 'milestone') {
            target = challenge.milestone_threshold || 0;
          } else if (challenge.challenge_type === 'streak' || challenge.challenge_type === 'checkin_streak') {
            target = challenge.streak_days || challenge.target_drops || 0;
          } else {
            target = challenge.target_drops || 0;
          }

          let current = 0;
          if (challenge.challenge_type === 'streak' || challenge.challenge_type === 'checkin_streak') {
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
            <Animated.View entering={FadeInDown.delay(100 + index * 80).duration(400)}>
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
                  <View style={styles.challengeHeader}>
                    <View style={[styles.typeIcon, { backgroundColor: hexToRgba(branding.primary, 0.1) }]}>
                      <Ionicons name={getChallengeIcon(challenge.challenge_type)} size={18} color={branding.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.challengeType, { color: branding.primary }]}>
                        {challengeTypeLabel}
                      </Text>
                      <Text style={styles.challengeName}>{challenge.name}</Text>
                      {(() => {
                        const timeInfo = getChallengeTimeDisplay(
                          challenge.challenge_type,
                          challenge.end_date,
                          isCompleted
                        );
                        if (!timeInfo) return null;
                        return (
                          <View style={[
                            styles.timeBadge,
                            timeInfo.style === 'completed' && styles.timeBadgeCompleted,
                            timeInfo.style === 'permanent' && styles.timeBadgePermanent,
                            timeInfo.style === 'recurring' && styles.timeBadgeRecurring,
                          ]}>
                            <Ionicons
                              name={
                                timeInfo.style === 'completed' ? 'checkmark-circle' :
                                timeInfo.style === 'permanent' ? 'infinite' :
                                timeInfo.style === 'recurring' ? 'refresh' :
                                'time-outline'
                              }
                              size={12}
                              color={
                                timeInfo.style === 'completed' ? '#4ade80' :
                                theme.colors.textSecondary
                              }
                            />
                            <Text style={[
                              styles.timeRemaining,
                              timeInfo.style === 'completed' && { color: '#4ade80' },
                            ]}>
                              {timeInfo.text}
                            </Text>
                          </View>
                        );
                      })()}
                    </View>
                  </View>

                  {challenge.description && (
                    <Text style={styles.challengeDescription} numberOfLines={2}>
                      {challenge.description}
                    </Text>
                  )}

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
                          {' '}{(challenge.challenge_type === 'streak' || challenge.challenge_type === 'checkin_streak')
                            ? t('unit_days')
                            : challenge.challenge_type === 'checkin_count'
                              ? t('unit_checkins')
                              : t('unit_drops')}
                        </Text>
                      </Text>
                      <Text style={[styles.progressPercent, getNumberStyle(12)]}>
                        {Math.round(progressPercent)}%
                      </Text>
                    </View>
                  </View>

                  {challenge.reward_drops > 0 && !isCompleted && (
                    <View style={[styles.rewardInfo, { borderTopColor: hexToRgba(branding.primary, 0.1) }]}>
                      <Ionicons name="water" size={14} color={branding.primary} />
                      <Text style={[styles.rewardText, { color: branding.primary }]}>
                        {challenge.reward_drops} drops reward
                      </Text>
                    </View>
                  )}

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
        }}
      />
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
    ...fontStyles.heading,
    flex: 1,
    fontSize: 26,
    color: theme.colors.text,
    textAlign: 'center',
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
    ...fontStyles.heading,
    fontSize: 22,
    color: theme.colors.text,
  },
  emptySubtext: {
    ...fontStyles.body,
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
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  typeIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  challengeType: {
    ...fontStyles.heading,
    fontSize: 14,
    marginBottom: 2,
  },
  challengeName: {
    ...fontStyles.bodySemiBold,
    fontSize: theme.typography.fontSize.lg,
    color: theme.colors.text,
    letterSpacing: 0.3,
  },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.md,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginTop: 6,
  },
  timeBadgeCompleted: {
    backgroundColor: 'rgba(74, 222, 128, 0.1)',
  },
  timeBadgePermanent: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  timeBadgeRecurring: {
    backgroundColor: 'rgba(96, 165, 250, 0.1)',
  },
  timeRemaining: {
    ...fontStyles.body,
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
  },
  challengeDescription: {
    ...fontStyles.body,
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
    ...fontStyles.bodySemiBold,
    fontSize: theme.typography.fontSize.sm,
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
    ...fontStyles.bodySemiBold,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.secondary,
    letterSpacing: 0.3,
  },
  /* Section labels */
  sectionLabel: {
    ...fontStyles.heading,
    fontSize: 18,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
    letterSpacing: 0.3,
  },
  emptySection: {
    padding: theme.spacing.xl,
    alignItems: 'center',
  },
  emptySectionText: {
    ...fontStyles.body,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
  },
  /* Completed challenge card (minimal) */
  completedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  completedLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    flex: 1,
  },
  completedBadgeImg: {
    width: 40,
    height: 40,
    borderRadius: theme.borderRadius.md,
  },
  completedBadgePlaceholder: {
    width: 40,
    height: 40,
    borderRadius: theme.borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  completedCheck: {
    fontSize: 20,
  },
  completedName: {
    ...fontStyles.bodySemiBold,
    fontSize: 14,
    color: theme.colors.text,
  },
  completedDate: {
    ...fontStyles.body,
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  completedRight: {
    alignItems: 'flex-end',
  },
  completedDrops: {
    ...fontStyles.heading,
    fontSize: 18,
  },
  completedDropsLabel: {
    ...fontStyles.body,
    fontSize: 10,
    color: theme.colors.textSecondary,
    letterSpacing: 0.5,
  },
});
