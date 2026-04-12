import { View, Text, StyleSheet, FlatList, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback, useMemo, useRef, type ComponentProps } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { PlatformBlur } from '@/components/PlatformBlur';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';
import { useSession } from '@/hooks/useSession';
import { theme, getNumberStyle, fontStyles, hexToRgba} from '@/lib/theme';
import ScreenHeader from '@/components/ScreenHeader';
import { SliderTabs } from '@/components/SliderTabs';
import { LeaderboardInfoSheet } from '@/components/LeaderboardInfoSheet';
import { useGymStore } from '@/lib/stores/useGymStore';
import { useBranding } from '@/lib/contexts/ThemeContext';
import Animated, {
  FadeInDown,
  FadeInUp,
  ZoomIn,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import i18n from '@/lib/i18n';
import { formatDate as fmtDate } from '@/lib/utils/formatDate';
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

// Pulse: the avatar image itself scales 1.0 → 1.08 so it visibly "breathes",
// with a soft halo behind it that fades 0 → 0.22 — just enough to feel alive
// without looking garish. Border stays static.
function PulsingRing({
  size,
  color,
  isChampion,
  children,
}: {
  size: number;
  color: string;
  isChampion: boolean;
  children: React.ReactNode;
}) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, []);

  const ringSize = size + (isChampion ? 8 : 6);
  const haloSize = size + (isChampion ? 28 : 20);

  const avatarScale = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.22 }],
  }));

  const haloStyle = useAnimatedStyle(() => ({
    opacity: pulse.value * 0.18,
  }));

  return (
    <View style={{ width: haloSize, height: haloSize, justifyContent: 'center', alignItems: 'center' }}>
      {/* Faint glow halo behind everything */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: haloSize,
            height: haloSize,
            borderRadius: haloSize / 2,
            backgroundColor: color,
          },
          haloStyle,
        ]}
      />
      {/* Static ring border */}
      <View
        style={{
          position: 'absolute',
          width: ringSize,
          height: ringSize,
          borderRadius: ringSize / 2,
          borderWidth: isChampion ? 2.5 : 2,
          borderColor: color,
        }}
      />
      {/*
        Avatar wrapper — overflow:hidden is intentionally REMOVED so the scale
        transform actually shows outside the box. The children (podiumAvatarInner)
        already clips the image into a circle with its own overflow:hidden.
      */}
      <Animated.View
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            justifyContent: 'center',
            alignItems: 'center',
          },
          avatarScale,
        ]}
      >
        {children}
      </Animated.View>
    </View>
  );
}

// Dropdown accordion: children slide in/out by animating container height.
// A hidden copy (opacity 0, position absolute) measures the real content height
// so the visible clip container always knows the correct target.
function ExpandableRows({ expanded, children }: { expanded: boolean; children: React.ReactNode }) {
  const animHeight = useSharedValue(0);
  const contentHeight = useRef(0);
  const prevExpanded = useRef(false);

  const clipStyle = useAnimatedStyle(() => ({
    height: animHeight.value,
    overflow: 'hidden' as const,
  }));

  useEffect(() => {
    if (expanded && !prevExpanded.current && contentHeight.current > 0) {
      animHeight.value = withTiming(contentHeight.current, { duration: 300, easing: Easing.out(Easing.ease) });
    } else if (!expanded && prevExpanded.current) {
      animHeight.value = withTiming(0, { duration: 250, easing: Easing.in(Easing.ease) });
    }
    prevExpanded.current = expanded;
  }, [expanded]);

  const handleLayout = useCallback((e: { nativeEvent: { layout: { height: number } } }) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0) {
      contentHeight.current = h;
      if (prevExpanded.current && animHeight.value === 0) {
        animHeight.value = h;
      }
    }
  }, []);

  return (
    <View>
      {/* Hidden measurement layer — always rendered at full size so onLayout fires */}
      <View style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }} onLayout={handleLayout}>
        {children}
      </View>
      {/* Visible clipped layer */}
      <Animated.View style={clipStyle}>
        {children}
      </Animated.View>
    </View>
  );
}

export default function LeaderboardScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ period?: string }>();
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
  const [arenasChecked, setArenasChecked] = useState(false);
  const [showPastWinners, setShowPastWinners] = useState(false);
  const [infoSheetVisible, setInfoSheetVisible] = useState(false);
  const [winnerBanner, setWinnerBanner] = useState<{
    rank: number;
    period: string;
    periodLabel: string;
    reward?: string;
    snapshotId: string;
  } | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  // Per-period "See all" expanded state
  const [showAll, setShowAll] = useState<Record<LeaderboardPeriod, boolean>>({
    weekly: false, monthly: false, all_time: false,
  });

  // Per-period cached state
  const [periodStates, setPeriodStates] = useState<Record<LeaderboardPeriod, PeriodCache>>({
    weekly: { ...EMPTY_PERIOD },
    monthly: { ...EMPTY_PERIOD },
    all_time: { ...EMPTY_PERIOD },
  });

  useEffect(() => {
    const incomingPeriod = params.period;
    if (incomingPeriod === 'weekly' || incomingPeriod === 'monthly' || incomingPeriod === 'all_time') {
      setPeriod(incomingPeriod);
    }
  }, [params.period]);

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
      setArenasChecked(true);
    }
  }, [session?.user?.id]);

  // Preload all periods when tab/scope changes; load arenas when on arenas tab
  // Also collapse any expanded lists when the data context changes
  useEffect(() => {
    if (!session?.user) return;
    setShowAll({ weekly: false, monthly: false, all_time: false });
    if (activeTab === 'arenas') {
      loadArenas();
    } else {
      PERIODS_LB.forEach((p) => loadLeaderboard(p));
    }
  }, [session?.user?.id, activeTab, activeGymId, newcomerOnly]);

  // Always load arenas on mount to determine whether to show the top tabs
  useEffect(() => {
    if (!session?.user || arenasChecked) return;
    void loadArenas();
  }, [session?.user?.id, arenasChecked]);

  const getRankDisplay = (rank: number) => {
    if (rank === 1) return { isTop: true };
    if (rank === 2) return { isTop: true };
    if (rank === 3) return { isTop: true };
    return { isTop: false };
  };

  // Strip emoji from backend score_label (e.g. "1,240 💧" → "1,240")
  const cleanScore = (label: string) => label.replace(/\s*💧\s*/g, '').trim();

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
    const monthName = fmtDate(start, { month: 'long' });
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

  const renderLeaderboardItem = useCallback(({ item: entry, index, extraData }: { item: LeaderboardEntry; index: number; extraData?: { count: number; hasMore: boolean } }) => {
    const rank = getRankDisplay(entry.rank);
    const isCurrent = isCurrentUser(entry.user_id);
    const isFirst = index === 0;
    const count = extraData?.count ?? 0;
    const moreBelow = extraData?.hasMore ?? false;
    // Last visible FlatList item — but if more rows expand below, don't round the bottom
    const isLast = index === count - 1 && !moreBelow;

    const rankNum = entry.rank;
    const medalColor = rankNum === 1 ? '#FFD700' : rankNum === 2 ? '#C0C0C0' : rankNum === 3 ? '#CD7F32' : null;

    return (
      <Animated.View entering={FadeInDown.delay(Math.min(index * 40, 400)).duration(350)}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => router.push({ pathname: '/user/[id]', params: { id: entry.user_id } })}
          style={[
            styles.listItem,
            { backgroundColor: 'rgba(20, 20, 30, 0.75)', borderColor: hexToRgba(branding.primary, 0.12), borderLeftWidth: 1, borderRightWidth: 1 },
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
          {/* Rank number */}
          <View style={styles.rankContainer}>
            {rank.isTop && medalColor ? (
              <View style={[styles.rankMedalBubble, { backgroundColor: hexToRgba(medalColor, 0.18), borderColor: hexToRgba(medalColor, 0.45) }]}>
                <Text style={[styles.rankMedalText, { color: medalColor }]}>#{rankNum}</Text>
              </View>
            ) : (
              <Text style={styles.rankText}>
                #{rankNum}
              </Text>
            )}
          </View>

          {/* Avatar */}
          <View style={[styles.listAvatarWrap, isCurrent && { borderColor: branding.primary, borderWidth: 2 }]}>
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
          </View>

          {/* Name + badges */}
          <View style={styles.userInfo}>
            <View style={styles.userNameRow}>
              <Text style={[styles.username, isCurrent && { color: branding.primary }]} numberOfLines={1}>
                {entry.username}
              </Text>
              {isCurrent && (
                <View style={[styles.youBadge, { backgroundColor: hexToRgba(branding.primary, 0.18), borderColor: hexToRgba(branding.primary, 0.5) }]}>
                  <Text style={[styles.youBadgeText, { color: branding.primary }]}>{t('you')}</Text>
                </View>
              )}
              {entry.streak_days > 0 && (
                <View style={styles.streakPill}>
                  <Ionicons name="flame" size={10} color="#FF9100" />
                  <Text style={styles.streakSmall}>{entry.streak_days}</Text>
                </View>
              )}
            </View>
            {entry.is_newcomer && (
              <View style={[styles.newcomerBadge, { backgroundColor: hexToRgba(branding.primary, 0.15) }]}>
                <Ionicons name="sparkles" size={10} color={branding.primary} />
                <Text style={[styles.newcomerBadgeText, { color: branding.primary }]}>{t('new')}</Text>
              </View>
            )}
          </View>

          {/* Score */}
          <View style={styles.scoreContainer}>
            <Ionicons name="water" size={12} color={isCurrent ? branding.primary : theme.colors.textTertiary} style={{ marginRight: 3 }} />
            <Text style={[styles.scoreLabel, { color: isCurrent ? branding.primary : theme.colors.textSecondary }]}>
              {cleanScore(entry.score_label)}
            </Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  }, [periodStates, period, branding.primary, session?.user?.id]);


  // Podium shows top 3 → list shows next 7 → total visible = top 10
  const VISIBLE_ROWS = 7;

  // Per-period header/footer/data builders — each page gets its own snapshot of state
  const buildPageProps = useCallback((p: LeaderboardPeriod) => {
    const ps = periodStates[p];
    const hasPodium = ps.leaderboard.length >= 3;
    // When podium is shown, exclude top 3 from the flat list to avoid duplication
    const fullList = ps.leaderboard.length === 0 ? [] : hasPodium ? ps.leaderboard.slice(3) : ps.leaderboard;
    // FlatList always shows only the collapsed rows — expansion happens in footer
    const data = activeTab === 'arenas' || ps.loading ? [] : fullList.slice(0, VISIBLE_ROWS);
    const extraRows = fullList.slice(VISIBLE_ROWS); // rows beyond top 10
    const hasMore = extraRows.length > 0;
    const isExpanded = showAll[p];
    return { data, ps, fullList, extraRows, hasMore, isExpanded };
  }, [periodStates, activeTab, showAll]);

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
              <PlatformBlur intensity={50} tint="dark" style={styles.arenaCardBlur} androidColor="rgba(12,12,22,0.97)">
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
              </PlatformBlur>
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

      {/* Scope tabs — hidden when there's only a single gym context and no active arenas */}
      {(!arenasChecked || arenas.length > 0) && (
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
      )}

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
            const { data: pageData, ps, fullList, extraRows, hasMore, isExpanded } = buildPageProps(p);
            const pageCurrentUserEntry = ps.leaderboard.find((e) => isCurrentUser(e.user_id));
            // Current user's entry if it's outside the visible top-10 window
            const currentUserEntry = fullList.find((e) => isCurrentUser(e.user_id));
            const currentUserBeyondVisible = !isExpanded && hasMore && currentUserEntry && !pageData.find((e) => isCurrentUser(e.user_id));

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

                <View style={styles.filterRow}>
                  {activeTab === 'gym' ? (
                    <TouchableOpacity
                      style={[styles.newcomerToggle, newcomerOnly && { backgroundColor: hexToRgba(branding.primary, 0.15), borderColor: hexToRgba(branding.primary, 0.3) }]}
                      onPress={() => setNewcomerOnly(!newcomerOnly)}
                    >
                      <Ionicons name="sparkles" size={14} color={newcomerOnly ? branding.primary : theme.colors.textSecondary} />
                      <Text style={[styles.newcomerText, newcomerOnly && { color: branding.primary }]}>{t('newcomersOnly')}</Text>
                    </TouchableOpacity>
                  ) : (
                    <View />
                  )}

                  {/* Info badge — pushed to the right */}
                  {!ps.loading && ps.leaderboard.length > 0 && (
                    <TouchableOpacity
                      style={[styles.infoBadge, { borderColor: hexToRgba(branding.primary, 0.3), backgroundColor: hexToRgba(branding.primary, 0.07) }]}
                      onPress={() => setInfoSheetVisible(true)}
                      activeOpacity={0.75}
                    >
                      <Ionicons name="trophy-outline" size={14} color={branding.primary} />
                      <Text style={[styles.infoBadgeText, { color: branding.primary }]}>
                        {activeTab === 'gym' && ps.rewards.length > 0
                          ? t('leaderboardPrize')
                          : t('infoSheetTitle')}
                      </Text>
                      <Ionicons name="chevron-up" size={13} color={branding.primary} />
                    </TouchableOpacity>
                  )}
                </View>

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
                  <View style={styles.podiumStage}>
                    {/* Render order: 2nd (left), 1st (center, elevated), 3rd (right) */}
                    {([1, 0, 2] as const).map((podiumIdx) => {
                      const entry = ps.leaderboard[podiumIdx];
                      if (!entry) return null;
                      const rank = entry.rank;
                      const isChampion = rank === 1;
                      const medalColor = rank === 1 ? '#FFD700' : rank === 2 ? '#C0C0C0' : '#CD7F32';
                      const avatarSize = rank === 1 ? 88 : rank === 2 ? 68 : 60;
                      const pedestalHeight = rank === 1 ? 72 : rank === 2 ? 48 : 36;
                      const reward = ps.rewards.find((r) => r.rank_position === rank);
                      const isCurrent = isCurrentUser(entry.user_id);
                      const animDelay = rank === 1 ? 0 : rank === 2 ? 150 : 250;

                      return (
                        <TouchableOpacity
                          key={entry.user_id}
                          style={[styles.podiumColumn, isChampion && styles.podiumColumnChampion]}
                          onPress={() => router.push({ pathname: '/user/[id]', params: { id: entry.user_id } })}
                          activeOpacity={0.85}
                        >
                          {/* ── Avatar section (floats above pedestal) ── */}
                          <Animated.View
                            entering={ZoomIn.delay(animDelay + 100).duration(400).springify()}
                            style={styles.podiumAvatarSection}
                          >
                            {/* Crown for #1 */}
                            {isChampion && (
                              <Animated.Text
                                entering={FadeInDown.delay(animDelay + 350).duration(300)}
                                style={styles.podiumCrown}
                              >
                                👑
                              </Animated.Text>
                            )}

                            {/* Glow ring — pulses for current user, static for others */}
                            {isCurrent ? (
                              <PulsingRing size={avatarSize} color={branding.primary} isChampion={isChampion}>
                                <View style={[styles.podiumAvatarInner, { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 }]}>
                                  {entry.avatar_url && entry.avatar_url.startsWith('http') ? (
                                    <Image source={entry.avatar_url} style={[styles.podiumAvatarImg, { borderRadius: avatarSize / 2 }]} transition={200} />
                                  ) : entry.avatar_url ? (
                                    <Text style={[styles.podiumAvatarEmoji, isChampion && { fontSize: 34 }]}>{entry.avatar_url}</Text>
                                  ) : (
                                    <Text style={[styles.podiumAvatarInitial, isChampion && { fontSize: 34 }]}>
                                      {(entry.username || 'U').charAt(0).toUpperCase()}
                                    </Text>
                                  )}
                                </View>
                              </PulsingRing>
                            ) : (
                              <View style={[
                                styles.podiumGlowRing,
                                {
                                  width: avatarSize + 10,
                                  height: avatarSize + 10,
                                  borderRadius: (avatarSize + 10) / 2,
                                  borderColor: medalColor,
                                  borderWidth: isChampion ? 3 : 2,
                                  shadowColor: medalColor,
                                  shadowOpacity: isChampion ? 0.9 : 0.5,
                                  shadowRadius: isChampion ? 22 : 12,
                                },
                              ]}>
                                <View style={[styles.podiumAvatarInner, { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 }]}>
                                  {entry.avatar_url && entry.avatar_url.startsWith('http') ? (
                                    <Image source={entry.avatar_url} style={[styles.podiumAvatarImg, { borderRadius: avatarSize / 2 }]} transition={200} />
                                  ) : entry.avatar_url ? (
                                    <Text style={[styles.podiumAvatarEmoji, isChampion && { fontSize: 34 }]}>{entry.avatar_url}</Text>
                                  ) : (
                                    <Text style={[styles.podiumAvatarInitial, isChampion && { fontSize: 34 }]}>
                                      {(entry.username || 'U').charAt(0).toUpperCase()}
                                    </Text>
                                  )}
                                </View>
                              </View>
                            )}

                            {/* Name + streak in one line */}
                            <View style={styles.podiumNameRow}>
                              <Text style={[styles.podiumName, isChampion && styles.podiumNameChamp, isCurrent && { color: branding.primary }]} numberOfLines={1}>
                                {entry.username}
                              </Text>
                              {entry.streak_days > 0 && (
                                <View style={styles.podiumStreakChip}>
                                  <Ionicons name="flame" size={9} color="#FF9100" />
                                  <Text style={styles.podiumStreakVal}>{entry.streak_days}</Text>
                                </View>
                              )}
                            </View>

                            {/* Score — plain text, no badge */}
                            <View style={styles.podiumScoreRow}>
                              <Ionicons name="water" size={isChampion ? 13 : 11} color={medalColor} />
                              <Text style={[styles.podiumScoreVal, isChampion && { fontSize: 15 }, { color: medalColor }]} numberOfLines={1}>
                                {cleanScore(entry.score_label)}
                              </Text>
                            </View>
                          </Animated.View>

                          {/* ── Reward chip (above pedestal, never clipped) ── */}
                          {reward && (
                            <Animated.View
                              entering={FadeInUp.delay(animDelay + 80).duration(350)}
                              style={[styles.pedestalReward, { backgroundColor: hexToRgba(medalColor, 0.1), borderColor: hexToRgba(medalColor, 0.3) }]}
                            >
                              <Ionicons name="gift-outline" size={9} color={medalColor} />
                              <Text style={[styles.pedestalRewardText, { color: medalColor }]} numberOfLines={2}>
                                {reward.reward_name}
                              </Text>
                            </Animated.View>
                          )}

                          {/* ── Pedestal bar ── */}
                          <Animated.View
                            entering={FadeInUp.delay(animDelay).duration(450)}
                            style={[
                              styles.pedestalBar,
                              {
                                height: pedestalHeight,
                                borderColor: hexToRgba(medalColor, isChampion ? 0.5 : 0.25),
                              },
                            ]}
                          >
                            <LinearGradient
                              colors={[hexToRgba(medalColor, isChampion ? 0.28 : 0.12), hexToRgba(medalColor, 0.03)]}
                              start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
                              style={StyleSheet.absoluteFill}
                            />
                            {/* Rank with # prefix */}
                            <Text style={[styles.pedestalRank, { color: hexToRgba(medalColor, 0.85) }]}>
                              #{rank}
                            </Text>
                          </Animated.View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : null}
              </>
            );

            const pageFooter = ps.loading || ps.leaderboard.length === 0 ? null : (
              <>
                {/* ── Expandable rows: dropdown animation ── */}
                {hasMore && (
                  <>
                    <ExpandableRows expanded={isExpanded}>
                      {extraRows.map((entry, idx) => {
                        const rankNum = entry.rank;
                        const medalColor = rankNum === 1 ? '#FFD700' : rankNum === 2 ? '#C0C0C0' : rankNum === 3 ? '#CD7F32' : null;
                        const isCurrent = isCurrentUser(entry.user_id);
                        const isLast = idx === extraRows.length - 1;
                        return (
                          <TouchableOpacity
                            key={entry.user_id}
                            activeOpacity={0.7}
                            onPress={() => router.push({ pathname: '/user/[id]', params: { id: entry.user_id } })}
                            style={[
                              styles.listItem,
                              { backgroundColor: 'rgba(20, 20, 30, 0.75)', borderColor: hexToRgba(branding.primary, 0.12), borderLeftWidth: 1, borderRightWidth: 1 },
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
                              {medalColor ? (
                                <View style={[styles.rankMedalBubble, { backgroundColor: hexToRgba(medalColor, 0.18), borderColor: hexToRgba(medalColor, 0.45) }]}>
                                  <Text style={[styles.rankMedalText, { color: medalColor }]}>#{rankNum}</Text>
                                </View>
                              ) : (
                                <Text style={[styles.rankText, isCurrent && { color: branding.primary }]}>#{rankNum}</Text>
                              )}
                            </View>
                            <View style={[styles.listAvatarWrap, isCurrent && { borderColor: branding.primary, borderWidth: 2 }]}>
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
                            </View>
                            <View style={styles.userInfo}>
                              <View style={styles.userNameRow}>
                                <Text style={[styles.username, isCurrent && { color: branding.primary }]} numberOfLines={1}>
                                  {entry.username}
                                </Text>
                                {isCurrent && (
                                  <View style={[styles.youBadge, { backgroundColor: hexToRgba(branding.primary, 0.18), borderColor: hexToRgba(branding.primary, 0.5) }]}>
                                    <Text style={[styles.youBadgeText, { color: branding.primary }]}>{t('you')}</Text>
                                  </View>
                                )}
                                {entry.streak_days > 0 && (
                                  <View style={styles.streakPill}>
                                    <Ionicons name="flame" size={10} color="#FF9100" />
                                    <Text style={styles.streakSmall}>{entry.streak_days}</Text>
                                  </View>
                                )}
                              </View>
                            </View>
                            <View style={styles.scoreContainer}>
                              <Ionicons name="water" size={12} color={isCurrent ? branding.primary : theme.colors.textTertiary} style={{ marginRight: 3 }} />
                              <Text style={[styles.scoreLabel, { color: isCurrent ? branding.primary : theme.colors.textSecondary }]}>
                                {cleanScore(entry.score_label)}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </ExpandableRows>

                    {/* Ellipsis separator — only when collapsed and user is beyond visible */}
                    {!isExpanded && currentUserBeyondVisible && currentUserEntry && (
                      <View style={styles.ellipsisRow}>
                        <View style={[styles.ellipsisDivider, { backgroundColor: hexToRgba(branding.primary, 0.12) }]} />
                        <Text style={styles.ellipsisText}>• • •</Text>
                        <View style={[styles.ellipsisDivider, { backgroundColor: hexToRgba(branding.primary, 0.12) }]} />
                      </View>
                    )}

                    {/* Current user card — shown when collapsed and user is beyond visible */}
                    {!isExpanded && currentUserBeyondVisible && currentUserEntry && (
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => router.push({ pathname: '/user/[id]', params: { id: currentUserEntry.user_id } })}
                        style={[
                          styles.listItem,
                          styles.listItemFirst,
                          styles.listItemLast,
                          {
                            backgroundColor: hexToRgba(branding.primary, 0.1),
                            borderColor: hexToRgba(branding.primary, 0.4),
                            borderWidth: 1,
                            borderLeftWidth: 3,
                            borderLeftColor: branding.primary,
                            marginBottom: 10,
                          },
                        ]}
                      >
                        <View style={styles.rankContainer}>
                          <Text style={[styles.rankText, { color: branding.primary }]}>#{currentUserEntry.rank}</Text>
                        </View>
                        <View style={[styles.listAvatarWrap, { borderColor: branding.primary, borderWidth: 2 }]}>
                          {currentUserEntry.avatar_url && currentUserEntry.avatar_url.startsWith('http') ? (
                            <Image source={currentUserEntry.avatar_url} style={styles.listAvatar} transition={200} />
                          ) : currentUserEntry.avatar_url ? (
                            <View style={styles.listAvatarPlaceholder}>
                              <Text style={styles.listAvatarEmoji}>{currentUserEntry.avatar_url}</Text>
                            </View>
                          ) : (
                            <View style={styles.listAvatarPlaceholder}>
                              <Text style={styles.listAvatarInitial}>
                                {(currentUserEntry.username || 'U').charAt(0).toUpperCase()}
                              </Text>
                            </View>
                          )}
                        </View>
                        <View style={styles.userInfo}>
                          <View style={styles.userNameRow}>
                            <Text style={[styles.username, { color: branding.primary }]} numberOfLines={1}>
                              {currentUserEntry.username}
                            </Text>
                            <View style={[styles.youBadge, { backgroundColor: hexToRgba(branding.primary, 0.18), borderColor: hexToRgba(branding.primary, 0.5) }]}>
                              <Text style={[styles.youBadgeText, { color: branding.primary }]}>{t('you')}</Text>
                            </View>
                          </View>
                        </View>
                        <View style={styles.scoreContainer}>
                          <Ionicons name="water" size={12} color={branding.primary} style={{ marginRight: 3 }} />
                          <Text style={[styles.scoreLabel, { color: branding.primary }]}>{cleanScore(currentUserEntry.score_label)}</Text>
                        </View>
                      </TouchableOpacity>
                    )}

                    {/* See all / Collapse toggle */}
                    <TouchableOpacity
                      style={[styles.seeAllButton, { borderColor: hexToRgba(branding.primary, 0.3), backgroundColor: hexToRgba(branding.primary, 0.06) }]}
                      onPress={() => setShowAll((prev) => ({ ...prev, [p]: !isExpanded }))}
                      activeOpacity={0.75}
                    >
                      <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={15} color={branding.primary} />
                      <Text style={[styles.seeAllText, { color: branding.primary }]}>
                        {isExpanded ? t('collapseList') : t('seeAll')}
                      </Text>
                    </TouchableOpacity>
                  </>
                )}

                {pageCurrentUserEntry && ps.currentUserRank != null && ps.currentUserRank > 50 && (
                  <View style={[styles.stickyFooter, { borderColor: hexToRgba(branding.primary, 0.3) }]}>
                    <PlatformBlur intensity={50} tint="dark" style={[styles.stickyFooterBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]} androidColor="rgba(20,20,30,0.97)">
                      <Text style={styles.stickyFooterRank}>#{pageCurrentUserEntry.rank}</Text>
                      <Text style={styles.stickyFooterName}>{pageCurrentUserEntry.username}</Text>
                      <Text style={[styles.scoreLabel, { color: branding.primary }]}>{cleanScore(pageCurrentUserEntry.score_label)}</Text>
                    </PlatformBlur>
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
                    <PlatformBlur intensity={50} tint="dark" style={[styles.pastWinnersBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]} androidColor="rgba(20,20,30,0.97)">
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
                                <View style={styles.snapshotDropsRow}>
                                <Ionicons name="water" size={11} color={branding.primary} />
                                <Text style={[styles.snapshotDrops, { color: branding.primary }]}>{entry.drops.toLocaleString()}</Text>
                              </View>
                              </View>
                            ))}
                          </View>
                        );
                      })}
                    </PlatformBlur>
                  </View>
                )}
              </>
            );

            return (
              <FlatList
                key={p}
                data={pageData}
                renderItem={(props) => renderLeaderboardItem({ ...props, extraData: { count: pageData.length, hasMore } })}
                keyExtractor={(item) => item.user_id || String(item.rank)}
                contentContainerStyle={[styles.periodPageContent, { paddingBottom: insets.bottom + 32 }]}
                showsVerticalScrollIndicator={false}
                ListHeaderComponent={pageHeader}
                ListFooterComponent={pageFooter}
                extraData={`${pageData.length}-${hasMore}-${isExpanded}`}
              />
            );
          })}
        </SliderTabs>
      )}

      {/* Leaderboard Info Sheet */}
      {infoSheetVisible && (() => {
        const ps = periodStates[period];
        const currentEntry = ps.leaderboard.find((e) => isCurrentUser(e.user_id));
        const leaderEntry = ps.leaderboard[0];
        return (
          <LeaderboardInfoSheet
            visible={infoSheetVisible}
            onClose={() => setInfoSheetVisible(false)}
            rewards={ps.rewards}
            currentUserRank={ps.currentUserRank}
            leaderScoreLabel={leaderEntry?.score_label ?? null}
            currentUserScoreLabel={currentEntry?.score_label ?? null}
            accentColor={branding.primary}
          />
        );
      })()}
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
  /* Scope row */
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
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
  },
  /* Newcomer Toggle */
  newcomerToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  newcomerText: {
    ...fontStyles.bodySemiBold,
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  /* Info badge */
  infoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
  },
  infoBadgeText: {
    ...fontStyles.bodySemiBold,
    fontSize: 13,
    letterSpacing: 0.3,
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
  /* ─── Podium Stage ─── */
  podiumStage: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: 4,
    marginBottom: theme.spacing.lg,
    marginTop: theme.spacing.md,
    gap: 6,
  },
  podiumColumn: {
    flex: 1,
    alignItems: 'center',
  },
  podiumColumnChampion: {
    flex: 1.25,
  },
  podiumAvatarSection: {
    alignItems: 'center',
    marginBottom: 8,
    gap: 5,
  },
  podiumCrown: {
    fontSize: 28,
    marginBottom: -6,
  },
  podiumGlowRing: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    // elevation is intentionally omitted: on Android it ignores shadowColor and
    // renders a grey material shadow behind the ring, ruining the glow effect.
  },
  podiumAvatarInner: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  podiumAvatarImg: {
    width: '100%',
    height: '100%',
  },
  podiumAvatarEmoji: {
    fontSize: 26,
    color: theme.colors.text,
  },
  podiumAvatarInitial: {
    ...fontStyles.heading,
    fontSize: 26,
    color: theme.colors.textSecondary,
  },
  podiumNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
    maxWidth: '100%',
  },
  podiumName: {
    ...fontStyles.bodySemiBold,
    fontSize: 12,
    color: theme.colors.text,
    letterSpacing: 0.2,
    textAlign: 'center',
    flexShrink: 1,
  },
  podiumNameChamp: {
    fontSize: 14,
    letterSpacing: 0.3,
  },
  podiumScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  podiumScoreVal: {
    ...fontStyles.number,
    fontSize: 12,
    letterSpacing: 0.3,
  },
  podiumStreakChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 145, 0, 0.12)',
  },
  podiumStreakVal: {
    ...fontStyles.bodySemiBold,
    fontSize: 10,
    color: '#FF9100',
  },
  /* Reward chip — sits between avatar section and pedestal, never clipped */
  pedestalReward: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 4,
    width: '100%',
  },
  pedestalRewardText: {
    ...fontStyles.bodySemiBold,
    fontSize: 8,
    letterSpacing: 0.2,
    flex: 1,
    textAlign: 'center',
  },
  /* Pedestal bar below avatar area */
  pedestalBar: {
    width: '100%',
    borderRadius: 14,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pedestalRank: {
    ...fontStyles.heading,
    fontSize: 22,
    letterSpacing: 1,
  },
  /* List */
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
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
    borderBottomColor: 'rgba(255, 255, 255, 0.07)',
  },
  rankContainer: {
    width: 48,
    alignItems: 'center',
  },
  rankMedalBubble: {
    width: 38,
    height: 28,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  rankMedalText: {
    ...fontStyles.heading,
    fontSize: 13,
  },
  rankText: {
    ...fontStyles.heading,
    fontSize: 24,
    color: theme.colors.textSecondary,
  },
  listAvatarWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginLeft: 6,
    borderWidth: 0,
    overflow: 'hidden',
  },
  listAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  listAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  listAvatarEmoji: {
    fontSize: 20,
  },
  listAvatarInitial: {
    ...fontStyles.heading,
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  userInfo: {
    flex: 1,
    marginLeft: 10,
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
    letterSpacing: 0.2,
    flexShrink: 1,
  },
  youBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  youBadgeText: {
    ...fontStyles.heading,
    fontSize: 9,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 145, 0, 0.12)',
  },
  streakSmall: {
    fontSize: 10,
    color: '#FF9100',
    fontFamily: 'Inter_600SemiBold',
  },
  newcomerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 3,
  },
  newcomerBadgeText: {
    ...fontStyles.heading,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
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
  snapshotDropsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  snapshotDrops: {
    ...fontStyles.number,
    fontSize: 12,
  },
  /* Ellipsis separator between top-10 and current user row */
  ellipsisRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 6,
    paddingHorizontal: 4,
  },
  ellipsisDivider: {
    flex: 1,
    height: 1,
  },
  ellipsisText: {
    ...fontStyles.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.2)',
    letterSpacing: 3,
  },
  /* See all / Collapse button */
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
    marginBottom: 4,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  seeAllText: {
    ...fontStyles.heading,
    fontSize: 14,
    letterSpacing: 1.2,
  },
});
