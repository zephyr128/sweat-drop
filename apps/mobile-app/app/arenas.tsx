import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCallback, useEffect, useMemo } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { theme, fontStyles, getNumberStyle } from '@/lib/theme';
import BackButton from '@/components/BackButton';
import { useBranding } from '@/lib/contexts/ThemeContext';
import Animated, { FadeInDown, useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useAvailableArenas, AvailableArena } from '@/hooks/useAvailableArenas';
import { useSession } from '@/hooks/useSession';

function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(0, 229, 255, ${alpha})`;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const SCORING_ICONS: Record<string, string> = {
  total_drops: '💧',
  days_visited: '📅',
  variety_score: '🏋️',
  streak_days: '🔥',
};

// ── Helper: Get arena colors (custom branding or default) ──
function getArenaColors(arena: AvailableArena, fallbackPrimary: string) {
  return {
    primary: arena.card_color || fallbackPrimary,
    text: arena.card_text_color || '#FFFFFF',
    gradientEnd: arena.card_gradient_end || null,
  };
}

// ── Helper: Opt-in badge text ──
function getOptInBadge(arena: AvailableArena): { icon: string; text: string } | null {
  switch (arena.opt_in_type) {
    case 'drops':
      return { icon: '💧', text: `${arena.opt_in_value}` };
    case 'streak':
      return { icon: '🔥', text: `${arena.opt_in_value}d` };
    case 'level':
      return { icon: '⭐', text: `${arena.opt_in_value}` };
    case 'free':
    default:
      return null;
  }
}

// ── Helper: Days until start ──
function getDaysUntilStart(startDate: string) {
  const start = new Date(startDate);
  const now = new Date();
  const diff = Math.ceil((start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

// ── Pulsing border for upcoming cards ──
function PulsingBorderCard({ children, color }: { children: React.ReactNode; color: string }) {
  const pulseOpacity = useSharedValue(0.15);

  useEffect(() => {
    pulseOpacity.value = withRepeat(
      withTiming(0.4, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const animatedBorderStyle = useAnimatedStyle(() => ({
    borderColor: `rgba(${parseInt(color.slice(1, 3), 16)}, ${parseInt(color.slice(3, 5), 16)}, ${parseInt(color.slice(5, 7), 16)}, ${pulseOpacity.value})`,
  }));

  return (
    <Animated.View style={[styles.arenaCard, animatedBorderStyle, { opacity: 0.9 }]}>
      {children}
    </Animated.View>
  );
}

export default function ArenasScreen() {
  const router = useRouter();
  const { session } = useSession();
  const branding = useBranding();
  const { t } = useTranslation('arena');
  const { arenas, loading, refresh } = useAvailableArenas();

  useFocusEffect(
    useCallback(() => {
      if (session?.user) {
        refresh();
      }
    }, [session?.user, refresh])
  );

  const getDaysLeft = (endDate: string) => {
    const end = new Date(endDate);
    const now = new Date();
    const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  };

  // Split arenas into upcoming, active, and completed
  const upcomingArenas = useMemo(() => arenas.filter(a => a.arena_status === 'upcoming'), [arenas]);
  const activeArenas = useMemo(() => arenas.filter(a => a.arena_status === 'active'), [arenas]);
  const completedArenas = useMemo(() => arenas.filter(a => a.arena_status === 'ended'), [arenas]);

  const renderArenaCard = (arena: AvailableArena, index: number, isUpcoming: boolean) => {
    const colors = getArenaColors(arena, branding.primary);
    const daysLeft = getDaysLeft(arena.end_date);
    const daysUntilStart = getDaysUntilStart(arena.start_date);
    const scoringIcon = SCORING_ICONS[arena.scoring_model] || '💧';
    const optInBadge = getOptInBadge(arena);

    const cardContent = (
      <TouchableOpacity
        onPress={() => router.push({ pathname: '/arena/[id]', params: { id: arena.arena_id } })}
        activeOpacity={0.8}
        style={{ flex: 1 }}
      >
        <BlurView intensity={50} tint="dark" style={styles.arenaCardBlur}>
          {/* Opt-in requirement badge — top-right corner */}
          {optInBadge && (
            <View style={[styles.optInBadge, { backgroundColor: hexToRgba(colors.primary, 0.15) }]}>
              <Text style={styles.optInBadgeIcon}>{optInBadge.icon}</Text>
              <Text style={[styles.optInBadgeText, { color: colors.primary }]}>{optInBadge.text}</Text>
            </View>
          )}

          {/* Upcoming banner */}
          {isUpcoming && (
            <View style={[styles.upcomingBanner, { backgroundColor: hexToRgba(colors.primary, 0.1) }]}>
              <Ionicons name="time-outline" size={14} color={colors.primary} />
              <Text style={[styles.upcomingBannerText, { color: colors.primary }]}>
                {daysUntilStart > 30
                  ? `${t('startsOn')} ${new Date(arena.start_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
                  : daysUntilStart === 0
                    ? t('startingNow')
                    : `${t('startsIn')} ${daysUntilStart} ${daysUntilStart === 1 ? t('day') : t('days')}`}
              </Text>
            </View>
          )}

          {/* Top row: sponsor + name + scoring */}
          <View style={styles.arenaCardTop}>
            {arena.sponsor_logo ? (
              <Image source={{ uri: arena.sponsor_logo }} style={styles.sponsorLogo} resizeMode="contain" />
            ) : (
              <View style={[styles.sponsorLogoPlaceholder, { backgroundColor: hexToRgba(colors.primary, 0.15) }]}>
                <Ionicons name="trophy" size={20} color={colors.primary} />
              </View>
            )}
            <View style={styles.arenaCardInfo}>
              <Text style={[styles.arenaName, { color: colors.text }]} numberOfLines={1}>{arena.name}</Text>
              <Text style={[styles.sponsorLabel, { color: colors.primary }]}>{arena.sponsor_name}</Text>
            </View>
            <View style={styles.arenaCardMeta}>
              <Text style={styles.scoringIcon}>{scoringIcon}</Text>
            </View>
          </View>

          {/* Description */}
          {arena.description && (
            <Text style={styles.arenaDescription} numberOfLines={2}>
              {arena.description}
            </Text>
          )}

          {/* Bottom row: stats + rank/join */}
          <View style={styles.arenaCardBottom}>
            <View style={styles.arenaStats}>
              <View style={styles.arenaStat}>
                <Ionicons name="people-outline" size={14} color={theme.colors.textSecondary} />
                <Text style={styles.arenaStatText}>{arena.participant_count} {t('participants').toLowerCase()}</Text>
              </View>
              <Text style={styles.arenaStatDot}>·</Text>
              <View style={styles.arenaStat}>
                <Ionicons
                  name={isUpcoming ? 'calendar-outline' : 'time-outline'}
                  size={14}
                  color={!isUpcoming && daysLeft <= 3 ? theme.colors.secondary : theme.colors.textSecondary}
                />
                <Text style={[styles.arenaStatText, !isUpcoming && daysLeft <= 3 && { color: theme.colors.secondary }]}>
                  {isUpcoming
                    ? `${daysUntilStart} ${daysUntilStart === 1 ? t('day') : t('days')}`
                    : `${daysLeft} ${t('daysLeft').toLowerCase()}`}
                </Text>
              </View>
            </View>
            {arena.user_opted_in ? (
              <View style={[styles.arenaRankBadge, { backgroundColor: hexToRgba(colors.primary, 0.12) }]}>
                <Text style={[styles.arenaRankText, { color: colors.primary }]}>
                  #{arena.user_rank ?? '—'}
                </Text>
              </View>
            ) : (
              <View style={[styles.joinBadge, { borderColor: hexToRgba(colors.primary, 0.3) }]}>
                <Ionicons name="add-circle-outline" size={14} color={colors.primary} />
                <Text style={[styles.joinBadgeText, { color: colors.primary }]}>
                  {isUpcoming ? t('optInEarly') : t('joinArena')}
                </Text>
              </View>
            )}
          </View>

          {/* Prizes preview */}
          {arena.prizes && arena.prizes.length > 0 && (
            <View style={[styles.prizesRow, { borderTopColor: hexToRgba(colors.primary, 0.08) }]}>
              {arena.prizes.slice(0, 3).map((prize, i) => {
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
                return (
                  <View key={i} style={styles.prizePill}>
                    <Text style={styles.prizeMedal}>{medal}</Text>
                    <Text style={styles.prizeText} numberOfLines={1}>{prize.prize}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </BlurView>
      </TouchableOpacity>
    );

    return (
      <Animated.View key={arena.arena_id} entering={FadeInDown.delay(100 + index * 80).duration(400)}>
        {isUpcoming ? (
          <PulsingBorderCard color={colors.primary}>
            {cardContent}
          </PulsingBorderCard>
        ) : (
          <View style={[styles.arenaCard, { borderColor: hexToRgba(colors.primary, 0.15) }]}>
            {cardContent}
          </View>
        )}
      </Animated.View>
    );
  };

  const renderCompletedCard = (arena: AvailableArena, index: number) => {
    const colors = getArenaColors(arena, branding.primary);
    const scoringIcon = SCORING_ICONS[arena.scoring_model] || '💧';
    const endedDate = new Date(arena.end_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

    return (
      <Animated.View key={arena.arena_id} entering={FadeInDown.delay(100 + index * 80).duration(400)}>
        <View style={[styles.arenaCard, { borderColor: hexToRgba(colors.primary, 0.08), opacity: 0.85 }]}>
          <TouchableOpacity
            onPress={() => router.push({ pathname: '/arena/[id]', params: { id: arena.arena_id } })}
            activeOpacity={0.8}
            style={{ flex: 1 }}
          >
            <BlurView intensity={50} tint="dark" style={styles.arenaCardBlur}>
              {/* ENDED badge — top-right */}
              <View style={[styles.endedBadge, { backgroundColor: 'rgba(255, 255, 255, 0.06)' }]}>
                <Ionicons name="flag" size={11} color={theme.colors.textTertiary} />
                <Text style={styles.endedBadgeText}>{t('ended')}</Text>
              </View>

              {/* Top row: sponsor + name + scoring */}
              <View style={styles.arenaCardTop}>
                {arena.sponsor_logo ? (
                  <Image source={{ uri: arena.sponsor_logo }} style={[styles.sponsorLogo, { opacity: 0.7 }]} resizeMode="contain" />
                ) : (
                  <View style={[styles.sponsorLogoPlaceholder, { backgroundColor: hexToRgba(colors.primary, 0.08) }]}>
                    <Ionicons name="trophy" size={20} color={hexToRgba(colors.primary, 0.5)} />
                  </View>
                )}
                <View style={styles.arenaCardInfo}>
                  <Text style={[styles.arenaName, { color: hexToRgba(colors.text, 0.8) }]} numberOfLines={1}>{arena.name}</Text>
                  <Text style={[styles.sponsorLabel, { color: hexToRgba(colors.primary, 0.6) }]}>{arena.sponsor_name}</Text>
                </View>
                <View style={styles.arenaCardMeta}>
                  <Text style={[styles.scoringIcon, { opacity: 0.5 }]}>{scoringIcon}</Text>
                </View>
              </View>

              {/* Bottom row: ended date + rank or "View Results" */}
              <View style={styles.arenaCardBottom}>
                <View style={styles.arenaStats}>
                  <View style={styles.arenaStat}>
                    <Ionicons name="calendar-outline" size={14} color={theme.colors.textTertiary} />
                    <Text style={[styles.arenaStatText, { color: theme.colors.textTertiary }]}>
                      {t('endedOn', { date: endedDate })}
                    </Text>
                  </View>
                  <Text style={styles.arenaStatDot}>·</Text>
                  <View style={styles.arenaStat}>
                    <Ionicons name="people-outline" size={14} color={theme.colors.textTertiary} />
                    <Text style={[styles.arenaStatText, { color: theme.colors.textTertiary }]}>
                      {arena.participant_count}
                    </Text>
                  </View>
                </View>
                {arena.user_opted_in && arena.user_rank != null ? (
                  <View style={[styles.arenaRankBadge, { backgroundColor: hexToRgba(colors.primary, 0.08) }]}>
                    <Text style={[styles.arenaRankText, { color: hexToRgba(colors.primary, 0.7) }]}>
                      #{arena.user_rank} / {arena.participant_count}
                    </Text>
                  </View>
                ) : (
                  <View style={[styles.viewResultsBadge, { borderColor: hexToRgba(colors.primary, 0.2) }]}>
                    <Text style={[styles.viewResultsText, { color: hexToRgba(colors.primary, 0.7) }]}>
                      {t('viewResults')}
                    </Text>
                    <Ionicons name="chevron-forward" size={14} color={hexToRgba(colors.primary, 0.5)} />
                  </View>
                )}
              </View>

              {/* Prizes — highlight won prize */}
              {arena.prizes && arena.prizes.length > 0 && (
                <View style={[styles.prizesRow, { borderTopColor: hexToRgba(colors.primary, 0.05) }]}>
                  {arena.prizes.slice(0, 3).map((prize, i) => {
                    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
                    const isWon = arena.user_opted_in && arena.user_rank === prize.rank;
                    return (
                      <View key={i} style={[styles.prizePill, isWon && { backgroundColor: hexToRgba(colors.primary, 0.1) }]}>
                        <Text style={styles.prizeMedal}>{medal}</Text>
                        <Text style={[styles.prizeText, isWon && { color: colors.primary }]} numberOfLines={1}>
                          {isWon ? `🏆 ${prize.prize}` : prize.prize}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </BlurView>
          </TouchableOpacity>
        </View>
      </Animated.View>
    );
  };

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

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={branding.primary} />
          </View>
        ) : arenas.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="trophy-outline" size={64} color={theme.colors.textSecondary} />
            <Text style={styles.emptyText}>{t('noArenas')}</Text>
            <Text style={styles.emptySubtext}>{t('noArenasDesc')}</Text>
          </View>
        ) : (
          <>
            {/* 🔜 UPCOMING ARENAS SECTION */}
            {upcomingArenas.length > 0 && (
              <>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionLabel}>🔜 {t('comingSoon')}</Text>
                </View>
                {upcomingArenas.map((arena, index) => renderArenaCard(arena, index, true))}
              </>
            )}

            {/* ⚡ ACTIVE ARENAS SECTION */}
            {activeArenas.length > 0 && (
              <>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionLabel}>⚡ {t('activeNow')}</Text>
                </View>
                {activeArenas.map((arena, index) => renderArenaCard(arena, index + upcomingArenas.length, false))}
              </>
            )}

            {/* 🏁 COMPLETED ARENAS SECTION */}
            {completedArenas.length > 0 && (
              <>
                <View style={styles.sectionHeaderRow}>
                  <Text style={[styles.sectionLabel, { color: theme.colors.textSecondary }]}>🏁 {t('completedArenas')}</Text>
                </View>
                {completedArenas.map((arena, index) => renderCompletedCard(arena, index + upcomingArenas.length + activeArenas.length))}
              </>
            )}
          </>
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
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  headerTitle: {
    ...fontStyles.heading,
    flex: 1,
    fontSize: 26,
    color: theme.colors.text,
    textAlign: 'center',
    pointerEvents: 'none',
  },
  headerSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  /* Section Headers */
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    marginTop: 8,
  },
  sectionLabel: {
    ...fontStyles.heading,
    fontSize: 18,
    color: theme.colors.text,
    letterSpacing: 1,
  },
  /* Loading / Empty */
  loadingContainer: {
    padding: theme.spacing['3xl'],
    alignItems: 'center',
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
  /* Arena Card */
  arenaCard: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    marginBottom: theme.spacing.md,
  },
  arenaCardBlur: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    padding: theme.spacing.lg,
    backgroundColor: 'rgba(20, 20, 30, 0.75)',
  },
  arenaCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  sponsorLogo: {
    width: 40,
    height: 40,
    borderRadius: 10,
  },
  sponsorLogoPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  arenaCardInfo: {
    flex: 1,
  },
  arenaName: {
    ...fontStyles.bodySemiBold,
    fontSize: 15,
    letterSpacing: 0.3,
  },
  sponsorLabel: {
    ...fontStyles.bodySemiBold,
    fontSize: 11,
    letterSpacing: 0.3,
    marginTop: 2,
  },
  arenaCardMeta: {
    alignItems: 'center',
  },
  scoringIcon: {
    fontSize: 20,
  },
  arenaDescription: {
    ...fontStyles.body,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: 12,
    letterSpacing: 0.3,
    lineHeight: 20,
  },
  arenaCardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  arenaStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  arenaStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  arenaStatText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    letterSpacing: 0.2,
  },
  arenaStatDot: {
    fontSize: 12,
    color: theme.colors.textTertiary,
  },
  arenaRankBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  arenaRankText: {
    ...fontStyles.number,
    fontSize: 14,
  },
  joinBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  joinBadgeText: {
    ...fontStyles.heading,
    fontSize: 14,
  },
  prizesRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  prizePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  prizeMedal: {
    fontSize: 14,
  },
  prizeText: {
    ...fontStyles.bodyMedium,
    fontSize: 10,
    color: theme.colors.textSecondary,
    flex: 1,
  },
  /* Opt-in badge */
  optInBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    zIndex: 1,
  },
  optInBadgeIcon: {
    fontSize: 11,
  },
  optInBadgeText: {
    ...fontStyles.bodySemiBold,
    fontSize: 10,
    letterSpacing: 0.3,
  },
  /* Upcoming banner */
  upcomingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  upcomingBannerText: {
    ...fontStyles.bodySemiBold,
    fontSize: 12,
    letterSpacing: 0.3,
  },
  /* Ended badge */
  endedBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    zIndex: 1,
  },
  endedBadgeText: {
    ...fontStyles.bodySemiBold,
    fontSize: 10,
    color: theme.colors.textTertiary,
    letterSpacing: 0.5,
  },
  /* View Results badge */
  viewResultsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  viewResultsText: {
    ...fontStyles.bodySemiBold,
    fontSize: 12,
    letterSpacing: 0.3,
  },
});
