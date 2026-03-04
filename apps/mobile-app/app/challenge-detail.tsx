import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { theme, getNumberStyle } from '@/lib/theme';
import BackButton from '@/components/BackButton';
import { useChallengeProgress } from '@/hooks/useChallengeProgress';
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

export default function ChallengeDetailScreen() {
  const { t } = useTranslation('challenges');
  const router = useRouter();
  const { challengeId, gymId } = useLocalSearchParams<{
    challengeId: string;
    gymId?: string;
  }>();
  const { session } = useSession();
  const branding = useBranding();
  const [challenge, setChallenge] = useState<any>(null);
  const [progress, setProgress] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const { challenges: allChallenges } = useChallengeProgress(gymId || null, null);
  const challengeProgress = allChallenges.find((c) => c.challenge_id === challengeId);

  useEffect(() => {
    if (challengeId && session?.user) {
      loadChallenge();
    }
  }, [challengeId, session]);

  const loadChallenge = async () => {
    if (!challengeId || !session?.user) return;
    setLoading(true);

    try {
      const { data: challengeData, error: challengeError } = await supabase
        .from('gym_challenges')
        .select('*')
        .eq('id', challengeId)
        .single();

      if (challengeError) {
        console.error('Error loading challenge:', challengeError);
        setLoading(false);
        return;
      }

      setChallenge(challengeData);

      const { data: progressData, error: progressError } = await supabase
        .from('challenge_progress')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('challenge_id', challengeId)
        .single();

      if (progressError && progressError.code !== 'PGRST116') {
        console.error('Error loading progress:', progressError);
      } else if (progressData) {
        setProgress(progressData);
      }
    } catch (error) {
      console.error('Error in loadChallenge:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTimeRemaining = (endDate: string) => {
    const end = new Date(endDate);
    const now = new Date();
    const diff = end.getTime() - now.getTime();

    if (diff <= 0) return t('ended');

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) return t('timeLeft', { days, hours, minutes });
    if (hours > 0) return t('hoursLeft', { hours, minutes });
    return t('minutesLeft', { minutes });
  };

  const getChallengeTypeLabel = (challengeType: string) => {
    switch (challengeType) {
      case 'daily': return t('dailyChallenge');
      case 'weekly': return t('weeklyChallenge');
      case 'monthly': return t('monthlyChallenge');
      case 'streak': return t('streakChallenge');
      case 'milestone': return t('milestoneChallenge');
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
      default: return 'star-outline';
    }
  };

  const getMachineTypeLabel = (machineType: string) => {
    switch (machineType) {
      case 'treadmill': return t('treadmill');
      case 'bike': return t('bike');
      case 'any': return t('anyMachine');
      default: return machineType;
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

  if (!challenge) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <BackButton />
          <Text style={styles.headerTitle}>{t('challenge')}</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.centerContent}>
          <Ionicons name="alert-circle-outline" size={64} color={theme.colors.textSecondary} />
          <Text style={styles.emptyText}>{t('challengeNotFound')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  let target = 0;
  if (challenge?.challenge_type === 'milestone') {
    target = challenge.milestone_threshold || 0;
  } else if (challenge?.challenge_type === 'streak') {
    target = challenge.streak_days || challenge.target_drops || 0;
  } else {
    target = challenge?.target_drops || 0;
  }

  let current = 0;
  if (challenge?.challenge_type === 'streak') {
    current = challengeProgress?.current_streak_days || progress?.current_streak_days || 0;
  } else {
    current = challengeProgress?.current_drops || progress?.current_drops || 0;
  }

  const isCompleted = challengeProgress?.is_completed || progress?.is_completed || false;
  const progressRatio = target > 0 ? Math.min(current / target, 1) : 0;
  const rewardDrops = challenge?.reward_drops || 0;
  const unit = challenge.challenge_type === 'streak' ? t('unit_days') : t('unit_drops');

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
        <Text style={styles.headerTitle}>{t('challengeDetails')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Main Challenge Card */}
        <Animated.View entering={FadeInDown.delay(100).duration(400)}>
          <View style={[styles.challengeCard, { borderColor: hexToRgba(branding.primary, 0.2) }]}>
            <BlurView intensity={50} tint="dark" style={[styles.challengeBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
              {/* Type Badge + Icon */}
              <View style={styles.cardTop}>
                <View style={[styles.typeIcon, { backgroundColor: hexToRgba(branding.primary, 0.1) }]}>
                  <Ionicons name={getChallengeIcon(challenge.challenge_type)} size={22} color={branding.primary} />
                </View>
                <View style={[styles.typeBadge, { backgroundColor: hexToRgba(branding.primary, 0.1), borderColor: hexToRgba(branding.primary, 0.2) }]}>
                  <Text style={[styles.typeText, { color: branding.primary }]}>
                    {getChallengeTypeLabel(challenge.challenge_type || 'daily')}
                  </Text>
                </View>
              </View>

              {/* Name */}
              <Text style={styles.challengeName}>{challenge.name}</Text>

              {/* Description */}
              {challenge.description && (
                <Text style={styles.challengeDescription}>{challenge.description}</Text>
              )}

              {/* Info pills */}
              <View style={styles.infoPills}>
                <View style={[styles.infoPill, { backgroundColor: hexToRgba(branding.primary, 0.08) }]}>
                  <Ionicons name="trophy-outline" size={16} color={branding.primary} />
                  <Text style={styles.infoPillText}>{t('needed', { count: target, unit })}</Text>
                </View>
                <View style={[styles.infoPill, { backgroundColor: hexToRgba(branding.primary, 0.08) }]}>
                  <Ionicons name="water" size={16} color={branding.primary} />
                  <Text style={styles.infoPillText}>{t('dropsReward', { count: rewardDrops })}</Text>
                </View>
                {challenge.end_date && (
                  <View style={[styles.infoPill, { backgroundColor: 'rgba(255, 255, 255, 0.05)' }]}>
                    <Ionicons name="time-outline" size={16} color={theme.colors.textSecondary} />
                    <Text style={styles.infoPillText}>{getTimeRemaining(challenge.end_date)}</Text>
                  </View>
                )}
              </View>
            </BlurView>
          </View>
        </Animated.View>

        {/* Progress Card */}
        <Animated.View entering={FadeInDown.delay(250).duration(400)}>
          <View style={[styles.progressCard, { borderColor: hexToRgba(branding.primary, 0.15) }]}>
            <BlurView intensity={50} tint="dark" style={[styles.progressBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
              <View style={styles.progressHeader}>
                <Text style={styles.progressTitle}>{t('yourProgress')}</Text>
                <Text style={[styles.progressPercentage, getNumberStyle(20), { color: branding.primary }]}>
                  {Math.round(progressRatio * 100)}%
                </Text>
              </View>

              {/* Progress Bar */}
              <View style={styles.progressBarTrack}>
                <LinearGradient
                  colors={isCompleted
                    ? [theme.colors.secondary, theme.colors.secondary]
                    : [branding.primary, hexToRgba(branding.primary, 0.6)]
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.progressFill, { width: `${progressRatio * 100}%` }]}
                />
              </View>

              {/* Progress numbers */}
              <View style={styles.progressNumbers}>
                <Text style={[styles.progressCurrent, getNumberStyle(32), { color: branding.primary }]}>
                  {current}
                </Text>
                <Text style={styles.progressDivider}> / </Text>
                <Text style={[styles.progressTarget, getNumberStyle(32)]}>
                  {target}
                </Text>
                <Text style={styles.progressUnit}> {unit}</Text>
              </View>

              {!isCompleted && (
                <Text style={styles.remainingText}>
                  {t('remaining', { count: Math.max(target - current, 0), unit })}
                </Text>
              )}

              {/* Completed */}
              {isCompleted && (
                <View style={styles.completedBadge}>
                  <Ionicons name="checkmark-circle" size={24} color={theme.colors.secondary} />
                  <View>
                    <Text style={styles.completedText}>{t('challengeCompleted')}</Text>
                    <Text style={styles.completedSubtext}>{t('youEarned', { drops: rewardDrops })}</Text>
                  </View>
                </View>
              )}
            </BlurView>
          </View>
        </Animated.View>

        {/* How to Participate */}
        <Animated.View entering={FadeInDown.delay(400).duration(400)}>
          <View style={[styles.howToCard, { borderColor: hexToRgba(branding.primary, 0.1) }]}>
            <BlurView intensity={50} tint="dark" style={[styles.howToBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
              <Text style={styles.howToTitle}>{t('howToParticipate')}</Text>
              <View style={styles.howToSteps}>
                {[
                  t('step1', { machine: getMachineTypeLabel(challenge.machine_type || 'any').toLowerCase() }),
                  t('step2'),
                  t('step3', { drops: rewardDrops }),
                ].map((stepText, idx) => (
                  <View key={idx} style={styles.step}>
                    <View style={[styles.stepNumber, { backgroundColor: hexToRgba(branding.primary, 0.1), borderColor: hexToRgba(branding.primary, 0.2) }]}>
                      <Text style={[styles.stepNumberText, getNumberStyle(14), { color: branding.primary }]}>{idx + 1}</Text>
                    </View>
                    <Text style={styles.stepText}>{stepText}</Text>
                  </View>
                ))}
              </View>
            </BlurView>
          </View>
        </Animated.View>
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
    gap: theme.spacing.md,
  },
  emptyText: {
    fontSize: theme.typography.fontSize.lg,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing['3xl'],
  },
  /* Main Challenge Card */
  challengeCard: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    marginBottom: theme.spacing.md,
    borderWidth: 1,
  },
  challengeBlur: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    padding: theme.spacing.xl,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  typeIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  typeBadge: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
  },
  typeText: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  challengeName: {
    fontSize: theme.typography.fontSize['3xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
    letterSpacing: 0.5,
  },
  challengeDescription: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.lg,
    lineHeight: 22,
    letterSpacing: 0.3,
  },
  infoPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  infoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
  },
  infoPillText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text,
    letterSpacing: 0.3,
  },
  /* Progress Card */
  progressCard: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    marginBottom: theme.spacing.md,
    borderWidth: 1,
  },
  progressBlur: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    padding: theme.spacing.xl,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  progressTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    letterSpacing: 0.3,
  },
  progressPercentage: {
    fontWeight: theme.typography.fontWeight.bold,
  },
  progressBarTrack: {
    height: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: theme.spacing.lg,
  },
  progressFill: {
    height: '100%',
    borderRadius: 5,
  },
  progressNumbers: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginBottom: theme.spacing.sm,
  },
  progressCurrent: {
    fontWeight: theme.typography.fontWeight.bold,
  },
  progressDivider: {
    fontSize: theme.typography.fontSize.xl,
    color: theme.colors.textSecondary,
  },
  progressTarget: {
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textSecondary,
  },
  progressUnit: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
  },
  remainingText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    marginTop: theme.spacing.lg,
    padding: theme.spacing.lg,
    backgroundColor: 'rgba(0, 255, 127, 0.08)',
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 127, 0.2)',
  },
  completedText: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.secondary,
    letterSpacing: 0.3,
  },
  completedSubtext: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
    marginTop: 2,
  },
  /* How-To Card */
  howToCard: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
  },
  howToBlur: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    padding: theme.spacing.xl,
  },
  howToTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
    letterSpacing: 0.3,
  },
  howToSteps: {
    gap: theme.spacing.lg,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  stepNumberText: {
    fontWeight: theme.typography.fontWeight.bold,
  },
  stepText: {
    flex: 1,
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    lineHeight: 22,
    letterSpacing: 0.3,
    paddingTop: 5,
  },
});
