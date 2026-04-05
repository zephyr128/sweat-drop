import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';
import { useSession } from '@/hooks/useSession';
import { theme, getNumberStyle, fontStyles, hexToRgba } from '@/lib/theme';
import ScreenHeader from '@/components/ScreenHeader';
import { useChallengeProgress } from '@/hooks/useChallengeProgress';
import { useBranding } from '@/lib/contexts/ThemeContext';
import Animated, { FadeInDown, FadeInUp, ZoomIn } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

// ── Helpers ──────────────────────────────────────────────────────────────────

function getTimeUntilMidnight(): string {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const diff = midnight.getTime() - now.getTime();
  return `${Math.floor(diff / 3_600_000)}h ${Math.floor((diff % 3_600_000) / 60_000)}m`;
}

function getTimeUntilSunday(): string {
  const now = new Date();
  const daysUntilSunday = now.getDay() === 0 ? 7 : 7 - now.getDay();
  const sunday = new Date(now);
  sunday.setDate(sunday.getDate() + daysUntilSunday);
  sunday.setHours(0, 0, 0, 0);
  const diff = sunday.getTime() - now.getTime();
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  return days > 0 ? `${days}d ${hours}h` : `${hours}h`;
}

type TimeStyle = 'countdown' | 'recurring' | 'permanent' | 'completed';

function getChallengeTimeDisplay(
  challengeType: string,
  endDate: string | null,
  isCompleted: boolean,
  t: (key: string, opts?: Record<string, unknown>) => string,
): { text: string; style: TimeStyle } | null {
  if (isCompleted) {
    if (challengeType === 'daily') return { text: t('completedResetsIn', { time: getTimeUntilMidnight() }), style: 'completed' };
    if (challengeType === 'weekly') return { text: t('completedResetsSunday', { time: getTimeUntilSunday() }), style: 'completed' };
    return { text: t('completedLabel'), style: 'completed' };
  }
  if (challengeType === 'milestone' || !endDate) return { text: t('ongoing'), style: 'permanent' };

  const end = new Date(endDate + 'T23:59:59');
  const diff = end.getTime() - Date.now();
  if (diff <= 0) return { text: t('ended'), style: 'countdown' };
  if (challengeType === 'daily') return { text: t('resetsIn', { time: getTimeUntilMidnight() }), style: 'recurring' };
  if (challengeType === 'weekly') return { text: t('resetsIn', { time: getTimeUntilSunday() }), style: 'recurring' };

  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  if (days > 0) return { text: t('timeLeft', { days, hours, minutes }), style: 'countdown' };
  if (hours > 0) return { text: t('hoursLeft', { hours, minutes }), style: 'countdown' };
  return { text: t('minutesLeft', { minutes }), style: 'countdown' };
}

function getChallengeIcon(type: string): keyof typeof Ionicons.glyphMap {
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
}

function getChallengeTypeLabel(type: string, t: (k: string) => string): string {
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
}

function getMachineTypeLabel(type: string, t: (k: string) => string): string {
  switch (type) {
    case 'treadmill': return t('treadmill');
    case 'bike': return t('bike');
    case 'any': return t('anyMachine');
    default: return type;
  }
}

// ── Circular progress ring (SVG-based, reliable) ─────────────────────────────

function CircularProgressRing({
  radius,
  strokeWidth,
  progress,
  color,
  bgColor,
  children,
}: {
  radius: number;
  strokeWidth: number;
  progress: number; // 0–1
  color: string;
  bgColor: string;
  children?: React.ReactNode;
}) {
  const size = (radius + strokeWidth) * 2;
  const circumference = 2 * Math.PI * radius;
  const filled = Math.min(Math.max(progress, 0), 1) * circumference;
  const cx = size / 2;
  const cy = size / 2;

  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        {/* Background track */}
        <Circle
          cx={cx}
          cy={cy}
          r={radius}
          stroke={bgColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress arc — starts at top (rotate -90°) */}
        <Circle
          cx={cx}
          cy={cy}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference - filled}
          strokeLinecap="round"
          rotation={-90}
          origin={`${cx}, ${cy}`}
        />
      </Svg>
      <View style={{ position: 'absolute', justifyContent: 'center', alignItems: 'center' }}>
        {children}
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function ChallengeDetailScreen() {
  const { t } = useTranslation('challenges');
  const router = useRouter();
  const { challengeId, gymId } = useLocalSearchParams<{ challengeId: string; gymId?: string }>();
  const { session } = useSession();
  const branding = useBranding();

  const [challenge, setChallenge] = useState<any>(null);
  const [progress, setProgress] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  // Tracks whether we've successfully fetched at least once this mount cycle
  const hasLoadedRef = useRef(false);

  const { challenges: allChallenges } = useChallengeProgress(gymId || null, null);
  const challengeProgress = allChallenges.find((c) => c.challenge_id === challengeId);

  useEffect(() => {
    if (challengeId && session?.user) loadChallenge();
  }, [challengeId, session]);

  const loadChallenge = async () => {
    if (!challengeId || !session?.user) return;
    // Show full-screen spinner only on first fetch, not on back-navigation remount
    if (!hasLoadedRef.current) setLoading(true);
    try {
      const { data: challengeData, error: challengeError } = await supabase
        .from('gym_challenges')
        .select('*')
        .eq('id', challengeId)
        .single();

      if (challengeError) { log.error('Error loading challenge:', challengeError); setLoading(false); return; }
      setChallenge(challengeData);
      hasLoadedRef.current = true;

      const { data: progressData, error: progressError } = await supabase
        .from('challenge_progress')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('challenge_id', challengeId)
        .single();

      if (progressError && progressError.code !== 'PGRST116') {
        log.error('Error loading progress:', progressError);
      } else if (progressData) {
        setProgress(progressData);
      }
    } catch (err) {
      log.error('Error in loadChallenge:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <LinearGradient colors={['#000000', '#0A0E1A', '#000000']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFillObject} />
        <ScreenHeader title={t('challengeDetails')} insetHandled />
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={branding.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!challenge) {
    return (
      <SafeAreaView style={styles.container}>
        <LinearGradient colors={['#000000', '#0A0E1A', '#000000']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFillObject} />
        <ScreenHeader title={t('challenge')} insetHandled />
        <View style={styles.centerContent}>
          <Ionicons name="alert-circle-outline" size={64} color={theme.colors.textSecondary} />
          <Text style={styles.emptyText}>{t('challengeNotFound')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Computed values ────────────────────────────────────────────────────────

  const isStreak = challenge.challenge_type === 'streak' || challenge.challenge_type === 'checkin_streak';
  const target = challenge.challenge_type === 'milestone'
    ? (challenge.milestone_threshold || 0)
    : isStreak
      ? (challenge.streak_days || challenge.target_drops || 0)
      : (challenge.target_drops || 0);

  const current = isStreak
    ? (challengeProgress?.current_streak_days || progress?.current_streak_days || 0)
    : (challengeProgress?.current_drops || progress?.current_drops || 0);

  const dbCompleted = challengeProgress?.is_completed || progress?.is_completed || false;
  const isCompleted = dbCompleted || (target > 0 && current >= target);
  const progressRatio = target > 0 ? Math.min(current / target, 1) : 0;
  const rewardDrops = challenge.reward_drops || 0;
  const unit = isStreak
    ? t('unit_days')
    : challenge.challenge_type === 'checkin_count'
      ? t('unit_checkins')
      : t('unit_drops');

  const timeInfo = getChallengeTimeDisplay(challenge.challenge_type, challenge.end_date, isCompleted, t);
  const typeLabel = getChallengeTypeLabel(challenge.challenge_type, t);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient
        colors={['#000000', '#0A0E1A', '#000000']}
        start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <ScreenHeader title={t('challengeDetails')} insetHandled />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Hero card: badge + title ─────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(80).duration(380)}>
          <View style={[styles.heroCard, {
            borderTopColor: hexToRgba(branding.primary, 0.35),
            borderLeftColor: hexToRgba(branding.primary, 0.15),
            borderRightColor: 'rgba(255,255,255,0.05)',
            borderBottomColor: 'rgba(255,255,255,0.03)',
          }]}>
            <BlurView intensity={55} tint="dark" style={styles.heroBlur}>
              <LinearGradient
                colors={isCompleted
                  ? ['rgba(74,222,128,0.08)', 'transparent']
                  : [hexToRgba(branding.primary, 0.1), 'rgba(255,255,255,0.02)', 'transparent']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />

              <View style={styles.heroContent}>
                {/* Badge image / placeholder */}
                <Animated.View entering={ZoomIn.delay(180).duration(350)}>
                  {challenge.badge_image_url ? (
                    <View style={[styles.badgeWrap, { borderColor: isCompleted ? 'rgba(74,222,128,0.4)' : hexToRgba(branding.primary, 0.4) }]}>
                      <Image
                        source={challenge.badge_image_url}
                        style={styles.badgeImage}
                        contentFit="contain"
                        transition={250}
                      />
                      {isCompleted && (
                        <View style={styles.badgeCompletedOverlay}>
                          <Ionicons name="checkmark-circle" size={28} color="#4ade80" />
                        </View>
                      )}
                    </View>
                  ) : (
                    <View style={[styles.badgeWrap, styles.badgePlaceholder, { borderColor: hexToRgba(branding.primary, 0.3), backgroundColor: hexToRgba(branding.primary, 0.08) }]}>
                      <Ionicons name={getChallengeIcon(challenge.challenge_type)} size={36} color={branding.primary} />
                    </View>
                  )}
                </Animated.View>

                {/* Title block */}
                <View style={styles.heroMeta}>
                  <View style={styles.heroTopRow}>
                    <View style={[styles.typeBadge, { backgroundColor: hexToRgba(branding.primary, 0.1), borderColor: hexToRgba(branding.primary, 0.25) }]}>
                      <Ionicons name={getChallengeIcon(challenge.challenge_type)} size={11} color={branding.primary} />
                      <Text style={[styles.typeBadgeText, { color: branding.primary }]}>{typeLabel}</Text>
                    </View>

                    {timeInfo && (
                      <View style={[
                        styles.timePill,
                        timeInfo.style === 'completed' && { backgroundColor: 'rgba(74,222,128,0.1)' },
                        timeInfo.style === 'recurring' && { backgroundColor: 'rgba(96,165,250,0.1)' },
                      ]}>
                        <Ionicons
                          name={timeInfo.style === 'completed' ? 'checkmark-circle' : timeInfo.style === 'permanent' ? 'infinite' : timeInfo.style === 'recurring' ? 'refresh' : 'time-outline'}
                          size={10}
                          color={timeInfo.style === 'completed' ? '#4ade80' : theme.colors.textSecondary}
                        />
                        <Text style={[styles.timePillText, timeInfo.style === 'completed' && { color: '#4ade80' }]}>
                          {timeInfo.text}
                        </Text>
                      </View>
                    )}
                  </View>

                  <Text style={styles.heroTitle}>{challenge.name}</Text>

                  {challenge.description ? (
                    <Text style={styles.heroDescription}>{challenge.description}</Text>
                  ) : null}
                </View>
              </View>

              {/* Info pills row */}
              <View style={styles.pillsRow}>
                <View style={[styles.infoPill, { backgroundColor: hexToRgba(branding.primary, 0.08), borderColor: hexToRgba(branding.primary, 0.15) }]}>
                  <Ionicons name="trophy-outline" size={13} color={branding.primary} />
                  <Text style={[styles.infoPillText, { color: theme.colors.text }]}>{t('needed', { count: target, unit })}</Text>
                </View>
                <View style={[styles.infoPill, { backgroundColor: hexToRgba(branding.primary, 0.08), borderColor: hexToRgba(branding.primary, 0.15) }]}>
                  <Ionicons name="water" size={13} color={branding.primary} />
                  <Text style={[styles.infoPillText, { color: theme.colors.text }]}>{t('dropsReward', { count: rewardDrops })}</Text>
                </View>
              </View>
            </BlurView>
          </View>
        </Animated.View>

        {/* ── Progress card ────────────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(200).duration(380)}>
          <View style={[styles.card, { borderTopColor: hexToRgba(branding.primary, 0.2), borderLeftColor: hexToRgba(branding.primary, 0.1), borderRightColor: 'rgba(255,255,255,0.04)', borderBottomColor: 'rgba(255,255,255,0.02)' }]}>
            <BlurView intensity={50} tint="dark" style={styles.cardBlur}>
              <LinearGradient
                colors={[hexToRgba(branding.primary, 0.05), 'transparent']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />

              <View style={styles.progressCardInner}>
                {/* Ring */}
                <Animated.View entering={ZoomIn.delay(320).duration(400)}>
                  <CircularProgressRing
                    radius={46}
                    strokeWidth={7}
                    progress={progressRatio}
                    color={isCompleted ? '#4ade80' : branding.primary}
                    bgColor="rgba(255,255,255,0.07)"
                  >
                    <Text style={[getNumberStyle(26), { color: isCompleted ? '#4ade80' : branding.primary }]}>
                      {Math.round(progressRatio * 100)}
                    </Text>
                    <Text style={styles.ringPct}>%</Text>
                  </CircularProgressRing>
                </Animated.View>

                {/* Numbers + bar */}
                <View style={styles.progressRight}>
                  <Text style={styles.progressTitle}>{t('yourProgress')}</Text>

                  <View style={styles.progressBarTrack}>
                    <LinearGradient
                      colors={isCompleted ? ['#4ade80', '#22c55e'] : [branding.primary, hexToRgba(branding.primary, 0.6)]}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                      style={[styles.progressBarFill, { width: `${progressRatio * 100}%` }]}
                    />
                  </View>

                  <View style={styles.progressNumRow}>
                    <Text style={[getNumberStyle(28), { color: isCompleted ? '#4ade80' : branding.primary }]}>
                      {current}
                    </Text>
                    <Text style={styles.progressSlash}> / </Text>
                    <Text style={[getNumberStyle(22), { color: theme.colors.textSecondary }]}>
                      {target}
                    </Text>
                    <Text style={styles.progressUnit}> {unit}</Text>
                  </View>

                  {!isCompleted && (
                    <Text style={styles.remainingText}>
                      {t('remaining', { count: Math.max(target - current, 0), unit })}
                    </Text>
                  )}
                </View>
              </View>

              {/* Completed banner */}
              {isCompleted && (
                <Animated.View entering={FadeInUp.delay(420).duration(350)} style={styles.completedBanner}>
                  <View style={styles.completedBannerInner}>
                    <Ionicons name="checkmark-circle" size={22} color="#4ade80" />
                    <View>
                      <Text style={styles.completedBannerTitle}>{t('challengeCompleted')}</Text>
                      <Text style={styles.completedBannerSub}>{t('youEarned', { drops: rewardDrops })}</Text>
                    </View>
                  </View>
                </Animated.View>
              )}
            </BlurView>
          </View>
        </Animated.View>

        {/* ── How to participate ───────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(340).duration(380)}>
          <View style={[styles.card, { borderTopColor: hexToRgba(branding.primary, 0.15), borderLeftColor: hexToRgba(branding.primary, 0.08), borderRightColor: 'rgba(255,255,255,0.04)', borderBottomColor: 'rgba(255,255,255,0.02)' }]}>
            <BlurView intensity={50} tint="dark" style={styles.cardBlur}>

              <View style={styles.howToHeader}>
                <View style={[styles.howToIconWrap, { backgroundColor: hexToRgba(branding.primary, 0.1) }]}>
                  <Ionicons name="bulb-outline" size={18} color={branding.primary} />
                </View>
                <Text style={styles.howToTitle}>{t('howToParticipate')}</Text>
              </View>

              <View style={styles.stepsContainer}>
                {[
                  t('step1', { machine: getMachineTypeLabel(challenge.machine_type || 'any', t).toLowerCase() }),
                  t('step2'),
                  t('step3', { drops: rewardDrops }),
                ].map((stepText, idx) => (
                  <Animated.View
                    key={idx}
                    entering={FadeInDown.delay(400 + idx * 80).duration(320)}
                    style={styles.stepRow}
                  >
                    <LinearGradient
                      colors={[hexToRgba(branding.primary, 0.18), hexToRgba(branding.primary, 0.08)]}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                      style={styles.stepNumGradient}
                    >
                      <Text style={[styles.stepNum, getNumberStyle(13), { color: branding.primary }]}>
                        {idx + 1}
                      </Text>
                    </LinearGradient>
                    {idx < 2 && (
                      <View style={[styles.stepConnector, { backgroundColor: hexToRgba(branding.primary, 0.15) }]} />
                    )}
                    <Text style={styles.stepText}>{stepText}</Text>
                  </Animated.View>
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
    gap: 12,
  },
  /* Hero card */
  heroCard: {
    borderRadius: 20,
    overflow: 'hidden',
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
  },
  heroBlur: {
    borderRadius: 20,
    overflow: 'hidden',
    padding: theme.spacing.xl,
    backgroundColor: 'rgba(16, 16, 28, 0.82)',
  },
  heroContent: {
    flexDirection: 'row',
    gap: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },
  badgeWrap: {
    width: 80,
    height: 80,
    borderRadius: 18,
    borderWidth: 2,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  badgePlaceholder: {
    backgroundColor: 'transparent',
  },
  badgeImage: {
    width: 80,
    height: 80,
  },
  badgeCompletedOverlay: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    backgroundColor: '#000',
    borderRadius: 14,
  },
  heroMeta: {
    flex: 1,
    justifyContent: 'center',
    gap: 6,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  typeBadgeText: {
    ...fontStyles.heading,
    fontSize: 11,
    letterSpacing: 0.8,
  },
  timePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  timePillText: {
    ...fontStyles.body,
    fontSize: 10,
    color: theme.colors.textSecondary,
    letterSpacing: 0.2,
  },
  heroTitle: {
    ...fontStyles.heading,
    fontSize: 22,
    color: theme.colors.text,
    letterSpacing: 0.3,
    lineHeight: 28,
  },
  heroDescription: {
    ...fontStyles.body,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    lineHeight: 20,
    letterSpacing: 0.2,
  },
  pillsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  infoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  infoPillText: {
    ...fontStyles.bodySemiBold,
    fontSize: theme.typography.fontSize.sm,
    letterSpacing: 0.2,
  },
  /* Generic card */
  card: {
    borderRadius: 18,
    overflow: 'hidden',
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
  },
  cardBlur: {
    borderRadius: 18,
    overflow: 'hidden',
    padding: theme.spacing.xl,
    backgroundColor: 'rgba(16, 16, 28, 0.82)',
  },
  /* Progress card */
  progressCardInner: {
    flexDirection: 'row',
    gap: theme.spacing.lg,
    alignItems: 'center',
  },
  ringPct: {
    ...fontStyles.body,
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginTop: -4,
  },
  progressRight: {
    flex: 1,
    gap: 8,
  },
  progressTitle: {
    ...fontStyles.heading,
    fontSize: 14,
    color: theme.colors.text,
    letterSpacing: 1,
  },
  progressBarTrack: {
    height: 7,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressNumRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  progressSlash: {
    fontSize: 18,
    color: theme.colors.textSecondary,
  },
  progressUnit: {
    ...fontStyles.body,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    letterSpacing: 0.2,
  },
  remainingText: {
    ...fontStyles.body,
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
    letterSpacing: 0.2,
  },
  completedBanner: {
    marginTop: theme.spacing.lg,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(74,222,128,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.25)',
  },
  completedBannerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
  },
  completedBannerTitle: {
    ...fontStyles.heading,
    fontSize: theme.typography.fontSize.base,
    color: '#4ade80',
    letterSpacing: 0.3,
  },
  completedBannerSub: {
    ...fontStyles.body,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginTop: 1,
  },
  /* How to */
  howToHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: theme.spacing.lg,
  },
  howToIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  howToTitle: {
    ...fontStyles.heading,
    fontSize: 15,
    color: theme.colors.text,
    letterSpacing: 0.5,
  },
  stepsContainer: {
    gap: 0,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
    position: 'relative',
    paddingBottom: theme.spacing.lg,
  },
  stepNumGradient: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  stepConnector: {
    position: 'absolute',
    left: 14,
    top: 30,
    width: 2,
    height: theme.spacing.lg,
    borderRadius: 1,
  },
  stepNum: {
    ...fontStyles.heading,
  },
  stepText: {
    flex: 1,
    ...fontStyles.body,
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    lineHeight: 22,
    letterSpacing: 0.2,
    paddingTop: 4,
  },
});
