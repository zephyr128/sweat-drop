import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useCallback, useMemo, useRef, type ComponentProps } from 'react';
import { useFocusEffect } from 'expo-router';
import { useThrottledRouter } from '@/hooks/useThrottledRouter';
import { Ionicons } from '@expo/vector-icons';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { PlatformBlur } from '@/components/PlatformBlur';
import { theme, fontStyles, hexToRgba } from '@/lib/theme';
import ScreenHeader from '@/components/ScreenHeader';
import { useBranding } from '@/lib/contexts/ThemeContext';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { formatDate as fmtDate } from '@/lib/utils/formatDate';
import { useAvailableArenas, type AvailableArena } from '@/hooks/useAvailableArenas';
import { useSession } from '@/hooks/useSession';
import { SliderTabs } from '@/components/SliderTabs';
import { ArenaInfoSheet } from '@/components/ArenaInfoSheet';

const CYAN = '#22D3EE';
const GOLD = '#EAB308';
const SILVER = '#94A3B8';
const BRONZE = '#CD7F32';

const SCORING_ICONS: Record<string, ComponentProps<typeof Ionicons>['name']> = {
  total_drops: 'water',
  days_visited: 'calendar-outline',
  variety_score: 'barbell-outline',
  streak_days: 'flame-outline',
};

const MEDAL_COLORS = [GOLD, SILVER, BRONZE] as const;

function getArenaColors(arena: AvailableArena, fallbackPrimary: string) {
  return {
    primary: arena.card_color || fallbackPrimary,
    text: arena.card_text_color || '#FFFFFF',
    gradientEnd: arena.card_gradient_end || null,
    hasBranding: !!(arena.card_color),
  };
}

function getDaysLeft(dateStr: string): number {
  return Math.max(0, Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
}

export default function ArenasScreen() {
  const router = useThrottledRouter();
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const branding = useBranding();
  const { t } = useTranslation('arena');
  const { arenas, loading, refresh } = useAvailableArenas();
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'completed'>('active');
  const [infoSheetVisible, setInfoSheetVisible] = useState(false);
  const hasLoadedRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (session?.user && !hasLoadedRef.current) {
        hasLoadedRef.current = true;
        refresh();
      } else if (session?.user) {
        refresh();
      }
    }, [session?.user, refresh]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const activeArenas = useMemo(
    () => arenas.filter((a) => a.arena_status === 'upcoming' || a.arena_status === 'active'),
    [arenas],
  );
  const completedArenas = useMemo(
    () => arenas.filter((a) => a.arena_status === 'ended'),
    [arenas],
  );

  if (loading && !refreshing) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={['#000000', '#0A0E1A', '#000000']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <ScreenHeader title={t('title')} />
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={branding.primary} />
        </View>
      </View>
    );
  }

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={CYAN}
      colors={[CYAN]}
    />
  );

  // ── Active page ────────────────────────────────────────────────────────────

  const activePage = (
    <ScrollView
      style={styles.page}
      contentContainerStyle={[styles.pageContent, { paddingBottom: insets.bottom + 32 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}
    >
      {activeArenas.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="sword-cross" size={56} color={theme.colors.textSecondary} />
          <Text style={styles.emptyText}>{t('noActiveArenas')}</Text>
          <Text style={styles.emptySubtext}>{t('noActiveArenasDesc')}</Text>
        </View>
      ) : (
        activeArenas.map((arena, index) => {
          const colors = getArenaColors(arena, CYAN);
          const isUpcoming = arena.arena_status === 'upcoming';
          const daysLeft = isUpcoming
            ? getDaysLeft(arena.start_date)
            : getDaysLeft(arena.end_date);
          const scoringIcon = SCORING_ICONS[arena.scoring_model] ?? 'water';

          // When the arena has custom branding colors, render a full-color gradient card.
          // When there's no branding, fall back to the dark glass card.
          const statIconColor = colors.hasBranding ? hexToRgba(colors.text, 0.65) : 'rgba(255,255,255,0.45)';
          const statTextStyle = colors.hasBranding ? { color: hexToRgba(colors.text, 0.65) } : {};

          const brandedCardContent = (
            <>
              {/* Header row: logo + info + scoring icon */}
              <View style={styles.activeCardHeader}>
                <View style={styles.activeCardMeta}>
                  {arena.sponsor_logo ? (
                    <Image
                      source={arena.sponsor_logo}
                      style={[
                        styles.sponsorLogo,
                        colors.hasBranding && styles.sponsorLogoBranded,
                      ]}
                      contentFit="contain"
                      transition={200}
                    />
                  ) : (
                    <View style={[
                      styles.sponsorLogoPlaceholder,
                      { backgroundColor: colors.hasBranding ? 'rgba(255,255,255,0.15)' : hexToRgba(colors.primary, 0.14) },
                    ]}>
                      <MaterialCommunityIcons name="sword-cross" size={20} color={colors.hasBranding ? colors.text : colors.primary} />
                    </View>
                  )}

                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.sponsorLabel,
                        { color: colors.hasBranding ? hexToRgba(colors.text, 0.75) : colors.primary },
                      ]}
                      numberOfLines={1}
                    >
                      {arena.sponsor_name}
                    </Text>
                    <Text
                      style={[
                        styles.arenaName,
                        colors.hasBranding && { color: colors.text },
                      ]}
                      numberOfLines={1}
                    >
                      {arena.name}
                    </Text>
                  </View>
                </View>

                {/* Scoring icon badge — always CYAN so it pops on any background */}
                <View style={[styles.scoringBadge, { backgroundColor: hexToRgba(CYAN, colors.hasBranding ? 0.20 : 0.12) }]}>
                  <Ionicons name={scoringIcon} size={14} color={CYAN} />
                </View>
              </View>

              {!!arena.description && (
                <Text
                  style={[
                    styles.arenaDescription,
                    colors.hasBranding && { color: hexToRgba(colors.text, 0.75) },
                  ]}
                  numberOfLines={2}
                >
                  {arena.description}
                </Text>
              )}

              <View style={styles.activeCardFooter}>
                <View style={styles.statsRow}>
                  {isUpcoming && (
                    <View style={[
                      styles.upcomingPill,
                      colors.hasBranding
                        ? { backgroundColor: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.3)' }
                        : { backgroundColor: hexToRgba(colors.primary, 0.12), borderColor: hexToRgba(colors.primary, 0.25) },
                    ]}>
                      <Ionicons name="time-outline" size={10} color={colors.hasBranding ? colors.text : colors.primary} />
                      <Text style={[styles.upcomingPillText, { color: colors.hasBranding ? colors.text : colors.primary }]}>
                        {t('upcomingPill')}
                      </Text>
                    </View>
                  )}
                  <View style={styles.statPill}>
                    <Ionicons name="people-outline" size={11} color={statIconColor} />
                    <Text style={[styles.statText, statTextStyle]}>{arena.participant_count}</Text>
                  </View>
                  <View style={styles.statPill}>
                    <Ionicons
                      name={isUpcoming ? 'calendar-outline' : 'time-outline'}
                      size={11}
                      color={!colors.hasBranding && !isUpcoming && daysLeft <= 3 ? theme.colors.secondary : statIconColor}
                    />
                    <Text style={[
                      styles.statText,
                      statTextStyle,
                      !colors.hasBranding && !isUpcoming && daysLeft <= 3 && { color: theme.colors.secondary },
                    ]}>
                      {isUpcoming
                        ? `${daysLeft}d`
                        : `${daysLeft} ${t('daysLeft').toLowerCase()}`}
                    </Text>
                  </View>
                </View>

                {/* Rank / join badge — always CYAN */}
                {arena.user_opted_in ? (
                  <View style={[styles.rankBadge, { backgroundColor: hexToRgba(CYAN, colors.hasBranding ? 0.22 : 0.14) }]}>
                    <Text style={[styles.rankBadgeText, { color: CYAN }]}>
                      #{arena.user_rank ?? '—'}
                    </Text>
                  </View>
                ) : (
                  <View style={[styles.joinBadge, { borderColor: hexToRgba(CYAN, colors.hasBranding ? 0.45 : 0.35) }]}>
                    <Ionicons name="add-circle-outline" size={12} color={CYAN} />
                    <Text style={[styles.joinBadgeText, { color: CYAN }]}>
                      {isUpcoming ? t('optInEarly') : t('joinArena')}
                    </Text>
                  </View>
                )}
              </View>

              {/* Prizes strip — always gold/silver/bronze */}
              {arena.prizes && arena.prizes.length > 0 && (
                <View style={[
                  styles.prizesStrip,
                  { borderTopColor: colors.hasBranding ? 'rgba(255,255,255,0.18)' : hexToRgba(colors.primary, 0.10) },
                ]}>
                  {arena.prizes.slice(0, 3).map((prize, i) => {
                    const medalColor = MEDAL_COLORS[i] ?? GOLD;
                    return (
                      <View
                        key={i}
                        style={[
                          styles.prizePill,
                          colors.hasBranding && { backgroundColor: 'rgba(0,0,0,0.18)' },
                        ]}
                      >
                        <Ionicons name="gift-outline" size={10} color={hexToRgba(medalColor, 0.9)} />
                        <Text style={[styles.prizeRank, { color: medalColor }]}>#{prize.rank}</Text>
                        <Text
                          style={[styles.prizeText, colors.hasBranding && { color: hexToRgba(colors.text, 0.75) }]}
                          numberOfLines={1}
                        >
                          {prize.prize}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </>
          );

          return (
            <Animated.View key={arena.arena_id} entering={FadeInDown.delay(80 + index * 70).duration(380)}>
              <TouchableOpacity
                style={[
                  styles.activeCard,
                  colors.hasBranding
                    ? { borderColor: 'transparent' }
                    : {
                        borderTopColor: hexToRgba(colors.primary, 0.38),
                        borderLeftColor: hexToRgba(colors.primary, 0.14),
                        borderRightColor: 'rgba(255,255,255,0.05)',
                        borderBottomColor: 'rgba(255,255,255,0.03)',
                      },
                ]}
                onPress={() => router.push({ pathname: '/arena/[id]', params: { id: arena.arena_id } })}
                activeOpacity={0.8}
              >
                {colors.hasBranding ? (
                  /* ── Branded card: full gradient fill ── */
                  <LinearGradient
                    colors={[colors.primary, colors.gradientEnd || colors.primary]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.brandedCardInner}
                  >
                    {brandedCardContent}
                  </LinearGradient>
                ) : (
                  /* ── Default glass card ── */
                  <PlatformBlur intensity={50} tint="dark" style={styles.activeBlur} androidColor="rgba(16,16,28,0.97)">
                    <LinearGradient
                      colors={[hexToRgba(colors.primary, 0.10), 'rgba(255,255,255,0.02)', 'transparent']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFill}
                      pointerEvents="none"
                    />
                    {brandedCardContent}
                  </PlatformBlur>
                )}
              </TouchableOpacity>
            </Animated.View>
          );
        })
      )}
    </ScrollView>
  );

  // ── Completed page ─────────────────────────────────────────────────────────

  const completedPage = (
    <ScrollView
      style={styles.page}
      contentContainerStyle={[styles.pageContent, { paddingBottom: insets.bottom + 32 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}
    >
      {completedArenas.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="flag-outline" size={56} color={theme.colors.textSecondary} />
          <Text style={styles.emptyText}>{t('noCompletedArenas')}</Text>
          <Text style={styles.emptySubtext}>{t('noCompletedArenasDesc')}</Text>
        </View>
      ) : (
        completedArenas.map((arena, index) => {
          const colors = getArenaColors(arena, CYAN);
          const endedDate = fmtDate(arena.end_date, { month: 'short', day: 'numeric' });
          const hasResult = arena.user_opted_in && arena.user_rank != null;

          return (
            <Animated.View key={arena.arena_id} entering={FadeInDown.delay(80 + index * 60).duration(350)}>
              <TouchableOpacity
                style={[
                  styles.completedCard,
                  {
                    borderTopColor: hexToRgba(colors.primary, 0.16),
                    borderLeftColor: hexToRgba(colors.primary, 0.07),
                    borderRightColor: 'rgba(255,255,255,0.03)',
                    borderBottomColor: 'rgba(255,255,255,0.02)',
                  },
                ]}
                onPress={() => router.push({ pathname: '/arena/[id]', params: { id: arena.arena_id } })}
                activeOpacity={0.8}
              >
                <PlatformBlur intensity={40} tint="dark" style={styles.completedBlur} androidColor="rgba(16,16,28,0.97)">
                  <LinearGradient
                    colors={[hexToRgba(colors.primary, 0.06), 'transparent']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                  />

                  <View style={styles.completedRow}>
                    {/* Sponsor logo (dimmed) */}
                    {arena.sponsor_logo ? (
                      <Image
                        source={arena.sponsor_logo}
                        style={[styles.sponsorLogoSm, { opacity: 0.65 }]}
                        contentFit="contain"
                        transition={200}
                      />
                    ) : (
                      <View style={[styles.sponsorLogoSmPlaceholder, { backgroundColor: hexToRgba(colors.primary, 0.08) }]}>
                        <MaterialCommunityIcons name="sword-cross" size={16} color={hexToRgba(colors.primary, 0.5)} />
                      </View>
                    )}

                    {/* Info */}
                    <View style={styles.completedInfo}>
                      <Text style={[styles.completedSponsor, { color: hexToRgba(colors.primary, 0.65) }]} numberOfLines={1}>
                        {arena.sponsor_name}
                      </Text>
                      <Text style={[styles.completedName, { color: hexToRgba(colors.text, 0.80) }]} numberOfLines={1}>
                        {arena.name}
                      </Text>
                      <Text style={styles.completedDate}>
                        {t('endedOn', { date: endedDate })} · {arena.participant_count}
                      </Text>
                    </View>

                    {/* Rank or view results */}
                    {hasResult ? (
                      <View style={styles.completedReward}>
                        <View style={[styles.completedRankCircle, { backgroundColor: hexToRgba(colors.primary, 0.10), borderColor: hexToRgba(colors.primary, 0.25) }]}>
                          <Text style={[styles.completedRankText, { color: hexToRgba(colors.primary, 0.85) }]}>
                            #{arena.user_rank}
                          </Text>
                        </View>
                        <Text style={styles.completedRankLabel}>
                          {`/ ${arena.participant_count}`}
                        </Text>
                      </View>
                    ) : (
                      <View style={[styles.viewResultsBadge, { borderColor: hexToRgba(colors.primary, 0.22) }]}>
                        <Text style={[styles.viewResultsText, { color: hexToRgba(colors.primary, 0.65) }]}>
                          {t('viewResults')}
                        </Text>
                        <Ionicons name="chevron-forward" size={12} color={hexToRgba(colors.primary, 0.45)} />
                      </View>
                    )}
                  </View>
                </PlatformBlur>
              </TouchableOpacity>
            </Animated.View>
          );
        })
      )}
    </ScrollView>
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#000000', '#0A0E1A', '#000000']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <ScreenHeader
        title={t('title')}
        right={
          <TouchableOpacity
            onPress={() => setInfoSheetVisible(true)}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="information-circle-outline" size={22} color={CYAN} />
          </TouchableOpacity>
        }
      />

      <SliderTabs
        tabs={[
          { key: 'active', label: t('tabActive'), icon: 'flash-outline' },
          { key: 'completed', label: t('tabCompleted'), icon: 'flag-outline' },
        ]}
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as 'active' | 'completed')}
        accentColor={CYAN}
        style={{ flex: 1 }}
        barStyle={styles.tabBar}
      >
        {activePage}
        {completedPage}
      </SliderTabs>

      <ArenaInfoSheet
        visible={infoSheetVisible}
        onClose={() => setInfoSheetVisible(false)}
        accentColor={CYAN}
      />
    </View>
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
  },
  tabBar: {
    marginHorizontal: theme.spacing.lg,
    marginBottom: 6,
  },
  page: {
    flex: 1,
  },
  pageContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
  },

  /* Empty states */
  emptyState: {
    paddingTop: theme.spacing['3xl'],
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  emptyText: {
    ...fontStyles.heading,
    fontSize: 20,
    color: theme.colors.text,
    textAlign: 'center',
  },
  emptySubtext: {
    ...fontStyles.body,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    letterSpacing: 0.3,
    paddingHorizontal: theme.spacing.xl,
  },

  /* Active card */
  activeCard: {
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 12,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
  },
  activeBlur: {
    borderRadius: 18,
    overflow: 'hidden',
    padding: theme.spacing.lg,
    backgroundColor: 'rgba(16, 16, 28, 0.82)',
  },
  brandedCardInner: {
    borderRadius: 18,
    overflow: 'hidden',
    padding: theme.spacing.lg,
  },
  sponsorLogoBranded: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10,
  },
  activeCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    marginBottom: 10,
  },
  activeCardMeta: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  sponsorLogo: {
    width: 40,
    height: 40,
    borderRadius: 10,
    flexShrink: 0,
  },
  sponsorLogoPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  sponsorLabel: {
    ...fontStyles.heading,
    fontSize: 11,
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  arenaName: {
    ...fontStyles.bodySemiBold,
    fontSize: 15,
    color: theme.colors.text,
    letterSpacing: 0.2,
  },
  scoringBadge: {
    width: 32,
    height: 32,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  arenaDescription: {
    ...fontStyles.body,
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
    lineHeight: 17,
    marginBottom: 10,
    letterSpacing: 0.2,
  },
  activeCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    flexWrap: 'wrap',
  },
  upcomingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
    borderWidth: 1,
  },
  upcomingPillText: {
    ...fontStyles.heading,
    fontSize: 9,
    letterSpacing: 0.8,
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  statText: {
    ...fontStyles.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 0.2,
  },
  rankBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9,
    flexShrink: 0,
  },
  rankBadgeText: {
    ...fontStyles.heading,
    fontSize: 13,
    letterSpacing: 0.5,
  },
  joinBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 9,
    borderWidth: 1,
    flexShrink: 0,
  },
  joinBadgeText: {
    ...fontStyles.heading,
    fontSize: 11,
    letterSpacing: 0.5,
  },

  /* Prizes strip */
  prizesStrip: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  prizePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  prizeRank: {
    ...fontStyles.heading,
    fontSize: 9,
    letterSpacing: 0.3,
    flexShrink: 0,
  },
  prizeText: {
    ...fontStyles.body,
    fontSize: 10,
    color: theme.colors.textSecondary,
    flex: 1,
  },

  /* Completed card */
  completedCard: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 10,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
  },
  completedBlur: {
    borderRadius: 16,
    overflow: 'hidden',
    padding: theme.spacing.md,
    backgroundColor: 'rgba(16, 16, 28, 0.82)',
  },
  completedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  sponsorLogoSm: {
    width: 44,
    height: 44,
    borderRadius: 10,
    flexShrink: 0,
  },
  sponsorLogoSmPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  completedInfo: {
    flex: 1,
    gap: 2,
  },
  completedSponsor: {
    ...fontStyles.heading,
    fontSize: 10,
    letterSpacing: 1.0,
  },
  completedName: {
    ...fontStyles.bodySemiBold,
    fontSize: 14,
    letterSpacing: 0.2,
  },
  completedDate: {
    ...fontStyles.body,
    fontSize: 11,
    color: theme.colors.textTertiary,
    marginTop: 1,
  },
  completedReward: {
    alignItems: 'center',
    gap: 3,
    flexShrink: 0,
  },
  completedRankCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  completedRankText: {
    ...fontStyles.heading,
    fontSize: 13,
    letterSpacing: 0.5,
  },
  completedRankLabel: {
    ...fontStyles.body,
    fontSize: 10,
    color: theme.colors.textTertiary,
    letterSpacing: 0.2,
  },
  viewResultsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 9,
    borderWidth: 1,
    flexShrink: 0,
  },
  viewResultsText: {
    ...fontStyles.bodySemiBold,
    fontSize: 11,
    letterSpacing: 0.3,
  },
});
