import { View, Text, StyleSheet, FlatList, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback, useMemo, type ComponentProps } from 'react';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';
import { useSession } from '@/hooks/useSession';
import { theme, getNumberStyle, fontStyles, hexToRgba} from '@/lib/theme';
import ScreenHeader from '@/components/ScreenHeader';
import { SliderTabs } from '@/components/SliderTabs';
import { useGymStore } from '@/lib/stores/useGymStore';
import { useBranding } from '@/lib/contexts/ThemeContext';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import i18n from '@/lib/i18n';
// ── Types (mirrored from backend/types/sweatdrop.ts) ──
type LeaderboardPeriod = 'weekly' | 'monthly' | 'all_time';

interface LeaderboardEntry {
  rank: number;
  user_id: string;
  username: string;
  avatar_url: string | null;
  score: number;
  score_label: string;
  is_newcomer: boolean;
  streak_days: number;
  gym_name: string | null;
}

interface LeaderboardReward {
  id: string;
  gym_id: string;
  rank_position: number;
  reward_name: string;
  reward_description: string | null;
  reward_type: string;
  value: string | null;
  is_active: boolean;
  period: LeaderboardPeriod;
}

interface AvailableArena {
  arena_id: string;
  name: string;
  description: string | null;
  sponsor_name: string;
  sponsor_logo: string | null;
  scoring_model: string;
  start_date: string;
  end_date: string;
  participant_count: number;
  user_opted_in: boolean;
  user_rank: number | null;
  user_score: number | null;
  prizes: Array<{ rank: number; prize: string; value?: string }>;
}
type TabType = 'gym' | 'global' | 'arenas';

const SCORING_ICONS: Record<string, ComponentProps<typeof Ionicons>['name']> = {
  total_drops: 'water',
  days_visited: 'calendar-outline',
  variety_score: 'barbell-outline',
  streak_days: 'flame-outline',
};

// ── Per-period cache ────────────────────────────────────────────────────────
interface PeriodCache {
  leaderboard: LeaderboardEntry[];
  rewards: LeaderboardReward[];
  snapshots: any[];
  currentUserRank: number | null;
  loading: boolean;
}

const EMPTY_PERIOD: PeriodCache = {
  leaderboard: [], rewards: [], snapshots: [], currentUserRank: null, loading: false,
};

const lbCache = new Map<string, PeriodCache>();

const PERIODS_LB: LeaderboardPeriod[] = ['weekly', 'monthly', 'all_time'];

export default function LeaderboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const branding = useBranding();
  const { getActiveGymId } = useGymStore();
  const activeGymId = getActiveGymId();
  const { t } = useTranslation('leaderboard');

  const [activeTab, setActiveTab] = useState<TabType>('gym');
  const [period, setPeriod] = useState<LeaderboardPeriod>('weekly');
  const [newcomerOnly, setNewcomerOnly] = useState(false);
  const [arenas, setArenas] = useState<AvailableArena[]>([]);
  const [arenasLoading, setArenasLoading] = useState(false);
  const [showPastWinners, setShowPastWinners] = useState(false);
  const [winnerBanner, setWinnerBanner] = useState<{
    rank: number;
    period: string;
    periodLabel: string;
    reward?: string;
    snapshotId: string;
  } | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Per-period cached state
  const [periodStates, setPeriodStates] = useState<Record<LeaderboardPeriod, PeriodCache>>({
    weekly: { ...EMPTY_PERIOD },
    monthly: { ...EMPTY_PERIOD },
    all_time: { ...EMPTY_PERIOD },
  });

  const cacheKey = useCallback((p: LeaderboardPeriod) =>
    `${activeTab}:${p}:${newcomerOnly ? '1' : '0'}:${activeGymId ?? 'global'}`,
  [activeTab, newcomerOnly, activeGymId]);

  const loadLeaderboard = useCallback(async (p: LeaderboardPeriod) => {
    if (!session?.user) return;
    const key = cacheKey(p);
    const cached = lbCache.get(key);

    // Show cached data immediately, then refresh in background
    if (cached) {
      setPeriodStates((prev) => ({ ...prev, [p]: { ...cached, loading: false } }));
    } else {
      setPeriodStates((prev) => ({ ...prev, [p]: { ...prev[p], loading: true } }));
    }

    try {
      const isGym = activeTab === 'gym';

      if (isGym && !activeGymId) {
        const empty = { ...EMPTY_PERIOD, loading: false };
        lbCache.set(key, empty);
        setPeriodStates((prev) => ({ ...prev, [p]: empty }));
        return;
      }

      let { data, error } = await supabase.rpc('get_leaderboard', {
        p_type: isGym ? 'gym' : 'global',
        p_scope_id: isGym ? activeGymId : null,
        p_period: p,
        p_limit: 100,
        p_newcomer_only: newcomerOnly,
      });

      if (error && error.code === 'PGRST202') {
        log.warn('[Leaderboard] get_leaderboard RPC not found, trying fallback...');
        if (isGym && activeGymId) {
          const { data: fd, error: fe } = await supabase.rpc('get_local_leaderboard', {
            p_gym_id: activeGymId, p_period: p, p_limit: 100, p_newcomer_only: newcomerOnly,
          });
          if (!fe && fd) { data = fd; error = null; }
        } else {
          const { data: fd, error: fe } = await supabase.rpc('get_global_leaderboard', {
            p_period: p, p_limit: 100, p_newcomer_only: newcomerOnly,
          });
          if (!fe && fd) { data = fd; error = null; }
        }
      }

      const entries: LeaderboardEntry[] = error ? [] : (data as LeaderboardEntry[]) || [];
      const currentUserRank = entries.find((e) => e.user_id === session.user.id)?.rank ?? null;

      let rewards: LeaderboardReward[] = [];
      let snapshots: any[] = [];
      if (isGym && activeGymId) {
        const [{ data: rewardData }, { data: snapshotData }] = await Promise.all([
          supabase.from('leaderboard_rewards').select('*')
            .eq('gym_id', activeGymId).eq('period', p).eq('is_active', true)
            .order('rank_position', { ascending: true }).limit(3),
          supabase.from('leaderboard_snapshots')
            .select('id, period, period_start, period_end, rankings, prizes_distributed')
            .eq('gym_id', activeGymId)
            .order('period_end', { ascending: false }).limit(5),
        ]);
        rewards = (rewardData as LeaderboardReward[]) || [];
        snapshots = snapshotData || [];
      }

      const newState: PeriodCache = { leaderboard: entries, rewards, snapshots, currentUserRank, loading: false };
      lbCache.set(key, newState);
      setPeriodStates((prev) => ({ ...prev, [p]: newState }));
    } catch (err) {
      log.error('Leaderboard error:', err);
      setPeriodStates((prev) => ({ ...prev, [p]: { ...prev[p], loading: false } }));
    }
  }, [session?.user?.id, activeTab, activeGymId, newcomerOnly, cacheKey]);

  const loadArenas = useCallback(async () => {
    if (!session?.user) return;
    setArenasLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_available_arenas', { p_user_id: session.user.id });
      if (error) { log.error('[Leaderboard] Error loading arenas:', error); setArenas([]); }
      else setArenas((data as AvailableArena[]) || []);
    } catch (err) {
      log.error('[Leaderboard] Arenas exception:', err);
      setArenas([]);
    } finally {
      setArenasLoading(false);
    }
  }, [session?.user?.id]);

  // Preload all periods when tab/scope changes; load arenas when on arenas tab
  useEffect(() => {
    if (!session?.user) return;
    if (activeTab === 'arenas') {
      loadArenas();
    } else {
      PERIODS_LB.forEach((p) => loadLeaderboard(p));
    }
  }, [session?.user?.id, activeTab, activeGymId, newcomerOnly]);

  const getRankDisplay = (rank: number) => {
    if (rank === 1) return { emoji: '🥇', isTop: true };
    if (rank === 2) return { emoji: '🥈', isTop: true };
    if (rank === 3) return { emoji: '🥉', isTop: true };
    return { emoji: `${rank}`, isTop: false };
  };

  const isCurrentUser = (userId: string) => session?.user?.id === userId;

  const getDaysLeft = (endDate: string) => {
    const end = new Date(endDate);
    const now = new Date();
    const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  };

  const formatPeriodLabel = (snapshot: any) => {
    const start = new Date(snapshot.period_start);
    const end = new Date(snapshot.period_end);
    if (snapshot.period === 'weekly') {
      const fmt = (d: Date) => `${d.getDate()}/${d.getMonth() + 1}`;
      return `${t('weekly')} · ${fmt(start)} - ${fmt(end)}`;
    }
    const monthName = start.toLocaleDateString(i18n.language === 'sr' ? 'sr-RS' : 'en-US', { month: 'long' });
    return `${t('monthly')} · ${monthName}`;
  };

  const getMedalEmoji = (rank: number) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
  };

  // Winner banner: check if current user was top 3 in any recent snapshot across ALL periods
  const allSnapshots = useMemo(() => {
    const seen = new Set<string>();
    const merged: any[] = [];
    for (const p of PERIODS_LB) {
      for (const s of periodStates[p].snapshots) {
        if (!seen.has(s.id)) { seen.add(s.id); merged.push(s); }
      }
    }
    return merged;
  }, [periodStates]);
  const allRewards = useMemo(() => {
    const seen = new Set<string>();
    const merged: LeaderboardReward[] = [];
    for (const p of PERIODS_LB) {
      for (const r of periodStates[p].rewards) {
        if (!seen.has(r.id)) { seen.add(r.id); merged.push(r); }
      }
    }
    return merged;
  }, [periodStates]);

  useEffect(() => {
    if (!session?.user?.id || allSnapshots.length === 0) {
      setWinnerBanner(null);
      return;
    }

    (async () => {
      for (const snapshot of allSnapshots) {
        const rankings = (snapshot.rankings || []) as Array<{ rank: number; user_id: string; username: string; drops: number }>;
        const userEntry = rankings.find(r => r.user_id === session.user.id && r.rank <= 3);
        if (userEntry) {
          const dismissed = await AsyncStorage.getItem(`dismissedWinBanner_${snapshot.id}`);
          if (dismissed) continue;

          const matchingReward = allRewards.find((r: LeaderboardReward) =>
            r.rank_position === userEntry.rank && r.period === snapshot.period,
          );
          setWinnerBanner({
            rank: userEntry.rank,
            period: snapshot.period,
            periodLabel: formatPeriodLabel(snapshot),
            reward: matchingReward?.reward_name,
            snapshotId: snapshot.id,
          });
          setBannerDismissed(false);
          return;
        }
      }
      setWinnerBanner(null);
    })();
  }, [allSnapshots, session?.user?.id, allRewards]);

  const dismissWinnerBanner = async () => {
    if (winnerBanner) {
      await AsyncStorage.setItem(`dismissedWinBanner_${winnerBanner.snapshotId}`, '1');
      setBannerDismissed(true);
    }
  };

  const renderLeaderboardItem = useCallback(({ item: entry, index }: { item: LeaderboardEntry; index: number }) => {
    const rank = getRankDisplay(entry.rank);
    const isCurrent = isCurrentUser(entry.user_id);
    const isFirst = index === 0;
    const isLast = index === periodStates[period].leaderboard.length - 1;
    return (
      <Animated.View entering={FadeInDown.delay(400).duration(400)}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => router.push({ pathname: '/user/[id]', params: { id: entry.user_id } })}
          style={[
            styles.listItem,
            { backgroundColor: 'rgba(20, 20, 30, 0.75)', borderColor: hexToRgba(branding.primary, 0.15), borderLeftWidth: 1, borderRightWidth: 1 },
            isFirst && [styles.listItemFirst, { borderTopWidth: 1 }],
            isLast && [styles.listItemLast, { borderBottomWidth: 1 }],
            !isLast && styles.listItemBorder,
            isCurrent && {
              backgroundColor: hexToRgba(branding.primary, 0.08),
              borderLeftWidth: 3,
              borderLeftColor: branding.primary,
            },
          ]}
        >
        <View style={styles.rankContainer}>
          <Text style={[
            styles.rankText,
            rank.isTop && styles.rankTextTop,
            getNumberStyle(rank.isTop ? 20 : 16),
          ]}>
            {rank.emoji}
          </Text>
        </View>

        {entry.avatar_url && entry.avatar_url.startsWith('http') ? (
          <Image source={entry.avatar_url} style={styles.listAvatar} transition={200} />
        ) : entry.avatar_url ? (
          <View style={styles.listAvatarPlaceholder}>
            <Text style={styles.listAvatarEmoji}>{entry.avatar_url}</Text>
          </View>
        ) : (
          <View style={styles.listAvatarPlaceholder}>
            <Text style={styles.listAvatarInitial}>
              {(entry.username || 'U').charAt(0).toUpperCase()}
            </Text>
          </View>
        )}

        <View style={styles.userInfo}>
          <View style={styles.userNameRow}>
            <Text style={[styles.username, isCurrent && { color: branding.primary }]} numberOfLines={1}>
              {entry.username}
              {isCurrent && ` ${t('you')}`}
            </Text>
            {entry.streak_days > 0 && (
              <Text style={styles.streakSmall}>🔥{entry.streak_days}</Text>
            )}
          </View>
          {entry.is_newcomer && (
            <View style={[styles.newcomerBadge, { backgroundColor: hexToRgba(branding.primary, 0.15) }]}>
              <Ionicons name="sparkles" size={10} color={branding.primary} />
              <Text style={[styles.newcomerBadgeText, { color: branding.primary }]}>{t('new')}</Text>
            </View>
          )}
        </View>

        <Text style={[
          styles.scoreLabel,
          { color: isCurrent ? branding.primary : theme.colors.textSecondary },
        ]}>
          {entry.score_label}
        </Text>
      </TouchableOpacity>
      </Animated.View>
    );
  }, [periodStates, period, branding.primary, session?.user?.id]);


  // Per-period header/footer/data builders — each page gets its own snapshot of state
  const buildPageProps = useCallback((p: LeaderboardPeriod) => {
    const ps = periodStates[p];
    const data = activeTab === 'arenas' || ps.loading || ps.leaderboard.length === 0 ? [] : ps.leaderboard;
    return { data, ps };
  }, [periodStates, activeTab]);

  const arenasHeader = useMemo(() => (
    arenasLoading ? (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={branding.primary} />
      </View>
    ) : arenas.length === 0 ? (
      <View style={styles.emptyState}>
        <Ionicons name="trophy-outline" size={64} color={theme.colors.textSecondary} />
        <Text style={styles.emptyText}>{t('noActiveArenas')}</Text>
        <Text style={styles.emptySubtext}>No arenas available at this time. Check back soon!</Text>
      </View>
    ) : (
      <>
        {arenas.map((arena) => {
          const daysLeft = getDaysLeft(arena.end_date);
          const scoringIcon = SCORING_ICONS[arena.scoring_model] ?? 'water';
          return (
            <TouchableOpacity
              key={arena.arena_id}
              style={[styles.arenaCard, {
                borderTopColor: hexToRgba(branding.primary, 0.28),
                borderLeftColor: hexToRgba(branding.primary, 0.12),
                borderRightColor: 'rgba(255,255,255,0.05)',
                borderBottomColor: 'rgba(255,255,255,0.03)',
              }]}
              onPress={() => router.push({ pathname: '/arena/[id]', params: { id: arena.arena_id } })}
              activeOpacity={0.8}
            >
              <BlurView intensity={50} tint="dark" style={styles.arenaCardBlur}>
                <LinearGradient
                  colors={[hexToRgba(branding.primary, 0.08), 'rgba(255,255,255,0.02)', 'transparent']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />
                <View style={styles.arenaCardTop}>
                  {arena.sponsor_logo ? (
                    <Image source={arena.sponsor_logo} style={styles.sponsorLogo} contentFit="contain" transition={200} />
                  ) : (
                    <View style={[styles.sponsorLogoPlaceholder, { backgroundColor: hexToRgba(branding.primary, 0.15) }]}>
                      <Ionicons name="trophy" size={20} color={branding.primary} />
                    </View>
                  )}
                  <View style={styles.arenaCardInfo}>
                    <Text style={styles.arenaName} numberOfLines={1}>{arena.name}</Text>
                    <Text style={[styles.sponsorLabel, { color: branding.primary }]}>{arena.sponsor_name}</Text>
                  </View>
                  <View style={styles.arenaCardMeta}>
                    <Ionicons name={scoringIcon} size={20} color={branding.primary} />
                  </View>
                </View>
                <View style={styles.arenaCardBottom}>
                  <View style={styles.arenaStats}>
                    <Text style={styles.arenaStatText}>{arena.participant_count} participants</Text>
                    <Text style={styles.arenaStatDot}>·</Text>
                    <Text style={[styles.arenaStatText, daysLeft <= 3 && { color: theme.colors.secondary }]}>
                      {daysLeft} days left
                    </Text>
                  </View>
                  {arena.user_rank != null && (
                    <View style={styles.arenaRankBadge}>
                      <Text style={[styles.arenaRankText, { color: branding.primary }]}>#{arena.user_rank}</Text>
                    </View>
                  )}
                </View>
              </BlurView>
            </TouchableOpacity>
          );
        })}
      </>
    )
  ), [arenasLoading, arenas, branding.primary]);

  const arenasList = (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={[styles.periodPageContent, { paddingBottom: insets.bottom + 32 }]}
      showsVerticalScrollIndicator={false}
    >
      {arenasHeader}
    </ScrollView>
  );

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#000000', '#0A0E1A', '#000000']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <ScreenHeader title={t('title')} />

      {/* Scope tabs — My Gym / Global / Arenas (always at top) */}
      <View style={styles.scopeRowWrapper}>
        <View style={styles.scopeRow}>
          {([
            { key: 'gym' as TabType, label: t('myGym'), icon: 'location' as const },
            { key: 'global' as TabType, label: t('global'), icon: 'globe-outline' as const },
            { key: 'arenas' as TabType, label: t('arenas'), icon: 'trophy' as const },
          ]).map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[
                  styles.scopeTab,
                  isActive && { backgroundColor: hexToRgba(branding.primary, 0.14), borderColor: hexToRgba(branding.primary, 0.35) },
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setActiveTab(tab.key);
                }}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={tab.icon}
                  size={14}
                  color={isActive ? branding.primary : 'rgba(255,255,255,0.38)'}
                />
                <Text style={[styles.scopeTabLabel, isActive && { color: branding.primary }]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {activeTab === 'arenas' ? (
        arenasList
      ) : (
        <SliderTabs
          tabs={[
            { key: 'weekly', label: t('weekly') },
            { key: 'monthly', label: t('monthly') },
            { key: 'all_time', label: t('allTime') },
          ]}
          activeKey={period}
          onChange={(key) => setPeriod(key as LeaderboardPeriod)}
          accentColor={branding.primary}
          style={{ flex: 1 }}
          barStyle={{ marginBottom: 4, marginHorizontal: theme.spacing.lg }}
        >
          {PERIODS_LB.map((p) => {
            const { data: pageData, ps } = buildPageProps(p);
            const pageCurrentUserEntry = ps.leaderboard.find((e) => isCurrentUser(e.user_id));

            const pageHeader = (
              <>
                {winnerBanner && !bannerDismissed && activeTab === 'gym' && (
                  <TouchableOpacity
                    style={[styles.winnerBanner, { borderColor: hexToRgba('#FFD700', 0.3) }]}
                    onPress={() => router.push('/redemptions')}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={[hexToRgba('#FFD700', 0.12), hexToRgba('#FFD700', 0.04)]}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFillObject}
                    />
                    <View style={styles.winnerBannerContent}>
                      <Text style={styles.winnerMedal}>{getMedalEmoji(winnerBanner.rank)}</Text>
                      <View style={styles.winnerBannerInfo}>
                        <Text style={styles.winnerBannerTitle}>
                          {t('youFinished', { rank: winnerBanner.rank, period: winnerBanner.periodLabel })}
                        </Text>
                        {winnerBanner.reward && (
                          <Text style={[styles.winnerBannerPrize, { color: branding.primary }]}>
                            {t('prize', { prize: winnerBanner.reward })}
                          </Text>
                        )}
                        <Text style={[styles.winnerBannerLink, { color: branding.primary }]}>
                          {t('checkRedemptions')}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={dismissWinnerBanner} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="close" size={18} color={theme.colors.textSecondary} />
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                )}

                {activeTab === 'gym' && (
                  <TouchableOpacity
                    style={[styles.newcomerToggle, newcomerOnly && { backgroundColor: hexToRgba(branding.primary, 0.15), borderColor: hexToRgba(branding.primary, 0.3) }]}
                    onPress={() => setNewcomerOnly(!newcomerOnly)}
                  >
                    <Ionicons name="sparkles" size={14} color={newcomerOnly ? branding.primary : theme.colors.textSecondary} />
                    <Text style={[styles.newcomerText, newcomerOnly && { color: branding.primary }]}>{t('newcomersOnly')}</Text>
                  </TouchableOpacity>
                )}

                {!ps.loading && ps.leaderboard.length > 0 && (
                  <View style={styles.scoreExplainer}>
                    <Ionicons name="information-circle-outline" size={14} color={theme.colors.textTertiary} />
                    <Text style={styles.scoreExplainerText}>{t('scoreExplanation')}</Text>
                  </View>
                )}

                {activeTab === 'gym' && ps.rewards.length > 0 && (
                  <View style={styles.prizeRow}>
                    {ps.rewards.map((r) => {
                      const medal = r.rank_position === 1 ? '🥇' : r.rank_position === 2 ? '🥈' : '🥉';
                      return (
                        <View key={r.id} style={[styles.prizeBadge, { borderColor: hexToRgba(branding.primary, 0.2) }]}>
                          <Text style={styles.prizeMedal}>{medal}</Text>
                          <Text style={styles.prizeName} numberOfLines={1}>{r.reward_name}</Text>
                        </View>
                      );
                    })}
                  </View>
                )}

                {ps.loading ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={branding.primary} />
                  </View>
                ) : ps.leaderboard.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="trophy-outline" size={64} color={theme.colors.textSecondary} />
                    <Text style={styles.emptyText}>{t('noRankings')}</Text>
                    <Text style={styles.emptySubtext}>
                      {activeTab === 'gym' ? t('beFirstGym') : t('beFirstGlobal')}
                    </Text>
                  </View>
                ) : ps.leaderboard.length >= 3 ? (
                  <View style={styles.podium}>
                    {[1, 0, 2].map((podiumIdx) => {
                      const entry = ps.leaderboard[podiumIdx];
                      if (!entry) return null;
                      const isFirst = podiumIdx === 0;
                      const isSecond = podiumIdx === 1;
                      const reward = ps.rewards.find((r) => r.rank_position === entry.rank);
                      const medalColors = { 0: '#FFD700', 1: '#C0C0C0', 2: '#CD7F32' };
                      const medalColor = medalColors[podiumIdx as keyof typeof medalColors];
                      const avatarSize = isFirst ? 68 : 52;
                      const platformHeight = isFirst ? 48 : isSecond ? 32 : 20;
                      return (
                        <View key={entry.user_id} style={[styles.podiumItem, isFirst && styles.podiumItemFirst]}>
                          <Text style={styles.podiumMedal}>{isFirst ? '🥇' : isSecond ? '🥈' : '🥉'}</Text>
                          <View style={[
                            styles.podiumAvatar,
                            { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2, borderColor: medalColor, borderWidth: isFirst ? 3 : 2 },
                            isFirst && { shadowColor: medalColor, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 12, elevation: 8 },
                            isCurrentUser(entry.user_id) && { backgroundColor: hexToRgba(branding.primary, 0.15) },
                          ]}>
                            {entry.avatar_url && entry.avatar_url.startsWith('http') ? (
                              <Image source={entry.avatar_url} style={[styles.podiumAvatarImage, { borderRadius: avatarSize / 2 }]} transition={200} />
                            ) : entry.avatar_url ? (
                              <Text style={[styles.podiumEmoji, isFirst && styles.podiumEmojiFirst]}>{entry.avatar_url}</Text>
                            ) : (
                              <Text style={[styles.podiumEmoji, isFirst && styles.podiumEmojiFirst]}>{getRankDisplay(entry.rank).emoji}</Text>
                            )}
                          </View>
                          {entry.streak_days > 0 && <Text style={styles.streakBadge}>🔥{entry.streak_days}</Text>}
                          <Text style={[styles.podiumName, isCurrentUser(entry.user_id) && { color: branding.primary }]} numberOfLines={1}>
                            {entry.username}
                          </Text>
                          <Text style={[styles.podiumScore, { color: branding.primary }]} numberOfLines={1}>{entry.score_label}</Text>
                          {reward && <Text style={[styles.prizeLabel, { color: branding.primary }]} numberOfLines={1}>{reward.reward_name}</Text>}
                          <View style={[styles.podiumPlatform, { height: platformHeight, backgroundColor: hexToRgba(medalColor, 0.12), borderColor: hexToRgba(medalColor, 0.25) }]} />
                        </View>
                      );
                    })}
                  </View>
                ) : null}
              </>
            );

            const pageFooter = ps.loading || ps.leaderboard.length === 0 ? null : (
              <>
                {pageCurrentUserEntry && ps.currentUserRank != null && ps.currentUserRank > 50 && (
                  <View style={[styles.stickyFooter, { borderColor: hexToRgba(branding.primary, 0.3) }]}>
                    <BlurView intensity={50} tint="dark" style={[styles.stickyFooterBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
                      <Text style={styles.stickyFooterRank}>#{pageCurrentUserEntry.rank}</Text>
                      <Text style={styles.stickyFooterName}>{pageCurrentUserEntry.username}</Text>
                      <Text style={[styles.scoreLabel, { color: branding.primary }]}>{pageCurrentUserEntry.score_label}</Text>
                    </BlurView>
                  </View>
                )}
                {activeTab === 'gym' && p !== 'all_time' && (
                  <Text style={styles.resetNote}>
                    {p === 'weekly' ? t('prizesResetWeekly') : t('prizesResetMonthly')}
                  </Text>
                )}
                {activeTab === 'gym' && ps.snapshots.length > 0 && (
                  <TouchableOpacity
                    style={[styles.pastWinnersToggle, { borderColor: hexToRgba(branding.primary, 0.15) }]}
                    onPress={() => setShowPastWinners(!showPastWinners)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.pastWinnersToggleIcon}>📜</Text>
                    <Text style={styles.pastWinnersToggleText}>{t('pastWinners')}</Text>
                    <Ionicons name={showPastWinners ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.textSecondary} />
                  </TouchableOpacity>
                )}
                {activeTab === 'gym' && showPastWinners && ps.snapshots.length > 0 && (
                  <View style={[styles.pastWinnersContainer, { borderColor: hexToRgba(branding.primary, 0.15) }]}>
                    <BlurView intensity={50} tint="dark" style={[styles.pastWinnersBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
                      {ps.snapshots.map((snapshot, idx) => {
                        const rankings = (snapshot.rankings || []) as Array<{ rank: number; user_id: string; username: string; drops: number }>;
                        const top3 = rankings.filter(r => r.rank <= 3).sort((a, b) => a.rank - b.rank);
                        if (top3.length === 0) return null;
                        return (
                          <View key={snapshot.id} style={[styles.snapshotBlock, idx > 0 && styles.snapshotBlockBorder]}>
                            <Text style={styles.snapshotLabel}>{formatPeriodLabel(snapshot)}</Text>
                            {top3.map((entry) => (
                              <View key={entry.user_id} style={styles.snapshotEntry}>
                                <Text style={styles.snapshotMedal}>{getMedalEmoji(entry.rank)}</Text>
                                <Text style={styles.snapshotUsername} numberOfLines={1}>@{entry.username}</Text>
                                <Text style={[styles.snapshotDrops, { color: branding.primary }]}>{entry.drops.toLocaleString()} {t('drops')}</Text>
                              </View>
                            ))}
                          </View>
                        );
                      })}
                    </BlurView>
                  </View>
                )}
              </>
            );

            return (
              <FlatList
                key={p}
                data={pageData}
                renderItem={renderLeaderboardItem}
                keyExtractor={(item) => item.user_id || String(item.rank)}
                contentContainerStyle={[styles.periodPageContent, { paddingBottom: insets.bottom + 32 }]}
                showsVerticalScrollIndicator={false}
                ListHeaderComponent={pageHeader}
                ListFooterComponent={pageFooter}
              />
            );
          })}
        </SliderTabs>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  /* Scope row — My Gym / Global / Arenas */
  scopeRowWrapper: {
    paddingHorizontal: theme.spacing.lg,
    marginBottom: 10,
  },
  scopeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  scopeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  scopeTabLabel: {
    ...fontStyles.heading,
    fontSize: 13,
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.42)',
  },
  periodPageContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
  },
  /* Newcomer Toggle */
  newcomerToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: theme.spacing.lg,
  },
  newcomerText: {
    ...fontStyles.bodyMedium,
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
  },
  /* Score Explainer */
  scoreExplainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
    marginBottom: theme.spacing.md,
  },
  scoreExplainerText: {
    ...fontStyles.body,
    fontSize: 11,
    color: theme.colors.textTertiary,
    flex: 1,
    letterSpacing: 0.2,
  },
  /* Prize Row */
  prizeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: theme.spacing.lg,
  },
  prizeBadge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
  },
  prizeMedal: {
    fontSize: 16,
  },
  prizeName: {
    ...fontStyles.bodyMedium,
    fontSize: 11,
    color: theme.colors.textSecondary,
    flex: 1,
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
  /* Podium */
  podium: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingHorizontal: theme.spacing.sm,
    marginBottom: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  podiumItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingTop: theme.spacing.xl,
  },
  podiumItemFirst: {
    paddingTop: 0,
  },
  podiumMedal: {
    fontSize: 20,
    marginBottom: 4,
  },
  podiumAvatar: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  podiumAvatarImage: {
    width: '100%',
    height: '100%',
  },
  podiumEmoji: {
    fontSize: 22,
  },
  podiumEmojiFirst: {
    fontSize: 30,
  },
  podiumPlatform: {
    width: '80%',
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 8,
  },
  streakBadge: {
    ...fontStyles.bodySemiBold,
    fontSize: 10,
    color: theme.colors.secondary,
  },
  podiumName: {
    ...fontStyles.bodySemiBold,
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.text,
    letterSpacing: 0.3,
    textAlign: 'center',
    maxWidth: 80,
  },
  podiumScore: {
    ...fontStyles.number,
    fontSize: 12,
    letterSpacing: 0.3,
  },
  prizeLabel: {
    ...fontStyles.bodySemiBold,
    fontSize: 9,
    letterSpacing: 0.3,
    textAlign: 'center',
    maxWidth: 80,
    marginTop: 2,
  },
  /* List */
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    overflow: 'hidden',
  },
  listItemFirst: {
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
  },
  listItemLast: {
    borderBottomLeftRadius: theme.borderRadius.xl,
    borderBottomRightRadius: theme.borderRadius.xl,
  },
  listItemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  rankContainer: {
    width: 32,
    alignItems: 'center',
  },
  rankText: {
    ...fontStyles.number,
    color: theme.colors.textSecondary,
  },
  rankTextTop: {
    fontSize: 20,
  },
  listAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginLeft: 8,
  },
  listAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginLeft: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  listAvatarEmoji: {
    fontSize: 18,
  },
  listAvatarInitial: {
    ...fontStyles.heading,
    fontSize: 15,
    color: theme.colors.textSecondary,
  },
  userInfo: {
    flex: 1,
    marginLeft: theme.spacing.sm,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  username: {
    ...fontStyles.bodySemiBold,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text,
    letterSpacing: 0.3,
    flexShrink: 1,
  },
  streakSmall: {
    fontSize: 10,
    color: theme.colors.secondary,
  },
  newcomerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 2,
  },
  newcomerBadgeText: {
    ...fontStyles.heading,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  scoreLabel: {
    ...fontStyles.number,
    fontSize: 13,
  },
  /* Sticky Footer */
  stickyFooter: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    marginTop: theme.spacing.md,
    borderWidth: 1,
  },
  stickyFooterBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
  },
  stickyFooterRank: {
    ...fontStyles.number,
    fontSize: theme.typography.fontSize.lg,
    color: theme.colors.text,
    width: 50,
  },
  stickyFooterName: {
    ...fontStyles.bodySemiBold,
    flex: 1,
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text,
    letterSpacing: 0.3,
  },
  resetNote: {
    ...fontStyles.body,
    textAlign: 'center',
    fontSize: 11,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing.md,
    letterSpacing: 0.3,
  },

  /* ─── Arena Cards ─── */
  arenaCard: {
    borderRadius: 18,
    overflow: 'hidden',
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    marginBottom: 12,
  },
  arenaCardBlur: {
    borderRadius: 18,
    overflow: 'hidden',
    padding: theme.spacing.lg,
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
    color: theme.colors.text,
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
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  arenaRankText: {
    ...fontStyles.number,
    fontSize: 14,
  },

  /* Winner Banner */
  winnerBanner: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    marginBottom: theme.spacing.md,
  },
  winnerBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  winnerMedal: {
    fontSize: 28,
  },
  winnerBannerInfo: {
    flex: 1,
  },
  winnerBannerTitle: {
    ...fontStyles.bodySemiBold,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text,
    letterSpacing: 0.3,
  },
  winnerBannerPrize: {
    ...fontStyles.bodyMedium,
    fontSize: theme.typography.fontSize.xs,
    marginTop: 2,
  },
  winnerBannerLink: {
    ...fontStyles.bodySemiBold,
    fontSize: theme.typography.fontSize.xs,
    marginTop: 4,
  },

  /* Past Winners */
  pastWinnersToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
  },
  pastWinnersToggleIcon: {
    fontSize: 16,
  },
  pastWinnersToggleText: {
    ...fontStyles.bodySemiBold,
    flex: 1,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text,
    letterSpacing: 0.3,
  },
  pastWinnersContainer: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    marginTop: theme.spacing.sm,
  },
  pastWinnersBlur: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    padding: theme.spacing.lg,
  },
  snapshotBlock: {
    paddingVertical: theme.spacing.sm,
  },
  snapshotBlockBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.md,
  },
  snapshotLabel: {
    ...fontStyles.bodySemiBold,
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
    marginBottom: theme.spacing.sm,
  },
  snapshotEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  snapshotMedal: {
    fontSize: 16,
    width: 24,
    textAlign: 'center',
  },
  snapshotUsername: {
    ...fontStyles.bodyMedium,
    flex: 1,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text,
    letterSpacing: 0.3,
  },
  snapshotDrops: {
    ...fontStyles.number,
    fontSize: 12,
  },
});
