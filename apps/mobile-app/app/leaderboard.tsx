import { View, Text, StyleSheet, FlatList, ScrollView, TouchableOpacity, Pressable, ActivityIndicator } from 'react-native';
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
  card_color: string | null;
  card_text_color: string | null;
  card_gradient_end: string | null;
}
type TabType = 'gym' | 'global' | 'arenas';

const SCORING_ICONS: Record<string, ComponentProps<typeof Ionicons>['name']> = {
  total_drops: 'water',
  days_visited: 'calendar-outline',
  variety_score: 'barbell-outline',
  streak_days: 'flame-outline',
};

const CYAN = '#22D3EE';
// Match compete tab colors exactly
const GOLD = '#EAB308';
const SILVER = '#94A3B8';
const BRONZE = '#CD7F32';
const MEDAL_COLORS = [GOLD, SILVER, BRONZE] as const;

function getArenaColors(arena: AvailableArena, fallbackPrimary: string) {
  return {
    primary: arena.card_color || fallbackPrimary,
    text: arena.card_text_color || '#FFFFFF',
    gradientEnd: arena.card_gradient_end || null,
    hasBranding: !!(arena.card_color),
  };
}

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
  const [infoSheetVisible, setInfoSheetVisible] = useState(false);
  const [expandedSnapshots, setExpandedSnapshots] = useState<Record<string, boolean>>({});
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
          // Use get_leaderboard_snapshot_history to get my_rank/my_drops per snapshot
          (supabase.rpc as any)('get_leaderboard_snapshot_history', {
            p_gym_id: activeGymId,
            p_period: p === 'all_time' ? null : p,
            p_limit: 6,
          }),
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

  const formatSnapshotDateRange = (snapshot: any) => {
    const start = new Date(snapshot.period_start);
    const end = new Date(snapshot.period_end);
    if (snapshot.period === 'weekly') {
      const fmtDay = (d: Date) =>
        fmtDate(d, { day: 'numeric', month: 'short' });
      return `${fmtDay(start)} – ${fmtDay(end)}`;
    }
    // monthly
    return fmtDate(start, { month: 'long', year: 'numeric' });
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

  const renderLeaderboardItem = useCallback(({ item: entry, index, extraData }: {
    item: LeaderboardEntry;
    index: number;
    extraData?: { count: number; hasMore: boolean; podiumEntries: LeaderboardEntry[] };
  }) => {
    const isCurrent = isCurrentUser(entry.user_id);
    const isFirst = index === 0;
    const count = extraData?.count ?? 0;
    const moreBelow = extraData?.hasMore ?? false;
    const isLast = index === count - 1 && !moreBelow;

    const rankNum = entry.rank;
    const medalColor = rankNum === 1 ? GOLD : rankNum === 2 ? SILVER : rankNum === 3 ? BRONZE : null;
    const textColor = rankNum === 1 ? GOLD : isCurrent ? branding.primary : theme.colors.textSecondary;

    // Gap text: how many drops to reach rank above (rank 3 for those below top3, rank 2 for rank 4)
    const podiumEntries = extraData?.podiumEntries ?? [];
    let gapText: string | null = null;
    if (rankNum > 3 && podiumEntries.length >= 1) {
      const targetEntry = rankNum === 4 ? podiumEntries.find(e => e.rank === 2) : podiumEntries.find(e => e.rank === 3);
      if (targetEntry) {
        const targetScore = parseInt(cleanScore(targetEntry.score_label).replace(/,/g, ''), 10);
        const myScore = parseInt(cleanScore(entry.score_label).replace(/,/g, ''), 10);
        const gap = isNaN(targetScore) || isNaN(myScore) ? null : Math.max(0, targetScore - myScore);
        if (gap != null && gap > 0) {
          gapText = t('gapToNext', { drops: gap.toLocaleString(), rank: rankNum === 4 ? 3 : 3 });
        }
      }
    }

    return (
      <Animated.View entering={FadeInDown.delay(Math.min(index * 40, 400)).duration(350)}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => router.push({ pathname: '/user/[id]', params: { id: entry.user_id } })}
          style={[
            styles.listItem,
            {
              backgroundColor: isCurrent ? hexToRgba(branding.primary, 0.08) : 'rgba(20, 20, 30, 0.75)',
              borderColor: isCurrent ? hexToRgba(branding.primary, 0.25) : 'rgba(255,255,255,0.06)',
              borderLeftWidth: isCurrent ? 3 : 1,
              borderLeftColor: isCurrent ? branding.primary : 'rgba(255,255,255,0.06)',
              borderRightWidth: 1,
            },
            isFirst && [styles.listItemFirst, { borderTopWidth: 1 }],
            isLast && [styles.listItemLast, { borderBottomWidth: 1 }],
            !isLast && styles.listItemBorder,
          ]}
        >
          {/* Rank */}
          <View style={styles.rankContainer}>
            {medalColor ? (
              <View style={[styles.rankMedalBubble, { backgroundColor: hexToRgba(medalColor, 0.18), borderColor: hexToRgba(medalColor, 0.45) }]}>
                <Text style={[styles.rankMedalText, { color: medalColor }]}>#{rankNum}</Text>
              </View>
            ) : (
              <Text style={[styles.rankText, { color: isCurrent ? branding.primary : theme.colors.textTertiary }]}>
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
              <Text style={[styles.username, { color: isCurrent ? branding.primary : theme.colors.text }]} numberOfLines={1}>
                {entry.username}
              </Text>
              {isCurrent && (
                <View style={[styles.youBadge, { backgroundColor: hexToRgba(branding.primary, 0.18), borderColor: hexToRgba(branding.primary, 0.4) }]}>
                  <Text style={[styles.youBadgeText, { color: branding.primary }]}>{t('you')}</Text>
                </View>
              )}
              {entry.is_newcomer && (
                <View style={styles.newcomerPill}>
                  <Text style={styles.newcomerPillText}>NEW</Text>
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

          {/* Score + gap */}
          <View style={styles.scoreRightCol}>
            <View style={styles.scoreContainer}>
              <Ionicons name="water" size={12} color={textColor} style={{ marginRight: 3 }} />
              <Text style={[styles.scoreLabel, { color: textColor }]}>
                {cleanScore(entry.score_label)}
              </Text>
            </View>
            {gapText && (
              <Text style={styles.gapText}>{gapText}</Text>
            )}
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  }, [periodStates, period, session?.user?.id]);


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
        {arenas.map((arena, idx) => {
          const daysLeft = getDaysLeft(arena.end_date);
          const isEnded = daysLeft === 0;
          const scoringIcon = SCORING_ICONS[arena.scoring_model] ?? 'water';
          const ac = getArenaColors(arena, CYAN);
          const prizes = (arena.prizes || []).slice(0, 3);

          return (
            <Animated.View key={arena.arena_id} entering={FadeInDown.delay(idx * 60).duration(380)}>
              <TouchableOpacity
                style={[
                  styles.arenaCard,
                  ac.hasBranding
                    ? { borderColor: 'transparent' }
                    : {
                        borderTopColor: hexToRgba(ac.primary, 0.38),
                        borderLeftColor: hexToRgba(ac.primary, 0.14),
                        borderRightColor: 'rgba(255,255,255,0.05)',
                        borderBottomColor: 'rgba(255,255,255,0.03)',
                      },
                ]}
                onPress={() => router.push({ pathname: '/arena/[id]', params: { id: arena.arena_id } })}
                activeOpacity={0.8}
              >
                {ac.hasBranding ? (
                  <LinearGradient
                    colors={[ac.primary, ac.gradientEnd || ac.primary]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={styles.arenaCardBlur}
                  >
                    {/* Top row */}
                    <View style={styles.arenaCardTop}>
                      {arena.sponsor_logo ? (
                        <Image source={arena.sponsor_logo} style={styles.sponsorLogo} contentFit="contain" transition={200} />
                      ) : (
                        <View style={[styles.sponsorLogoPlaceholder, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
                          <Ionicons name="trophy" size={20} color={ac.text} />
                        </View>
                      )}
                      <View style={styles.arenaCardInfo}>
                        <Text style={[styles.arenaName, { color: ac.text }]} numberOfLines={1}>{arena.name}</Text>
                        <Text style={[styles.sponsorLabel, { color: hexToRgba(ac.text, 0.7) }]}>{arena.sponsor_name}</Text>
                      </View>
                      <View style={[styles.scoringBadge, { backgroundColor: hexToRgba(CYAN, 0.22), borderColor: hexToRgba(CYAN, 0.5) }]}>
                        <Ionicons name={scoringIcon} size={15} color={CYAN} />
                      </View>
                    </View>

                    {/* Prize pills */}
                    {prizes.length > 0 && (
                      <View style={styles.prizePillsRow}>
                        {prizes.map((p, i) => (
                          <View key={i} style={[styles.prizePill, { backgroundColor: hexToRgba('#000', 0.25), borderColor: hexToRgba(MEDAL_COLORS[i] ?? MEDAL_COLORS[2], 0.5) }]}>
                            <Text style={[styles.prizePillText, { color: MEDAL_COLORS[i] ?? MEDAL_COLORS[2] }]}>#{p.rank}</Text>
                            <Text style={[styles.prizePillLabel, { color: hexToRgba(ac.text, 0.85) }]} numberOfLines={1}>{p.prize}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Bottom row */}
                    <View style={styles.arenaCardBottom}>
                      <View style={styles.arenaStats}>
                        <Text style={[styles.arenaStatText, { color: hexToRgba(ac.text, 0.7) }]}>{t('participants', { count: arena.participant_count })}</Text>
                        {isEnded ? (
                          <View style={[styles.endedPill, { backgroundColor: hexToRgba('#000', 0.3), borderColor: hexToRgba(ac.text, 0.3) }]}>
                            <Text style={[styles.endedPillText, { color: ac.text }]}>{t('ended')}</Text>
                          </View>
                        ) : (
                          <>
                            <Text style={[styles.arenaStatDot, { color: hexToRgba(ac.text, 0.4) }]}>·</Text>
                            <Text style={[styles.arenaStatText, { color: daysLeft <= 3 ? theme.colors.secondary : hexToRgba(ac.text, 0.7) }]}>
                              {daysLeft}d left
                            </Text>
                          </>
                        )}
                      </View>
                      {arena.user_rank != null && (
                        <View style={[styles.arenaRankBadge, { backgroundColor: hexToRgba(CYAN, 0.22), borderColor: hexToRgba(CYAN, 0.45) }]}>
                          <Text style={[styles.arenaRankText, { color: CYAN }]}>#{arena.user_rank}</Text>
                        </View>
                      )}
                    </View>
                  </LinearGradient>
                ) : (
                  <PlatformBlur intensity={50} tint="dark" style={styles.arenaCardBlur} androidColor="rgba(12,12,22,0.97)">
                    <LinearGradient
                      colors={[hexToRgba(ac.primary, 0.08), 'rgba(255,255,255,0.02)', 'transparent']}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFill}
                      pointerEvents="none"
                    />
                    {/* Top row */}
                    <View style={styles.arenaCardTop}>
                      {arena.sponsor_logo ? (
                        <Image source={arena.sponsor_logo} style={styles.sponsorLogo} contentFit="contain" transition={200} />
                      ) : (
                        <View style={[styles.sponsorLogoPlaceholder, { backgroundColor: hexToRgba(ac.primary, 0.15) }]}>
                          <Ionicons name="trophy" size={20} color={ac.primary} />
                        </View>
                      )}
                      <View style={styles.arenaCardInfo}>
                        <Text style={styles.arenaName} numberOfLines={1}>{arena.name}</Text>
                        <Text style={[styles.sponsorLabel, { color: ac.primary }]}>{arena.sponsor_name}</Text>
                      </View>
                      <View style={[styles.scoringBadge, { backgroundColor: hexToRgba(CYAN, 0.15), borderColor: hexToRgba(CYAN, 0.35) }]}>
                        <Ionicons name={scoringIcon} size={15} color={CYAN} />
                      </View>
                    </View>

                    {/* Prize pills */}
                    {prizes.length > 0 && (
                      <View style={styles.prizePillsRow}>
                        {prizes.map((p, i) => (
                          <View key={i} style={[styles.prizePill, { backgroundColor: hexToRgba(MEDAL_COLORS[i] ?? MEDAL_COLORS[2], 0.08), borderColor: hexToRgba(MEDAL_COLORS[i] ?? MEDAL_COLORS[2], 0.35) }]}>
                            <Text style={[styles.prizePillText, { color: MEDAL_COLORS[i] ?? MEDAL_COLORS[2] }]}>#{p.rank}</Text>
                            <Text style={[styles.prizePillLabel, { color: theme.colors.textSecondary }]} numberOfLines={1}>{p.prize}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Bottom row */}
                    <View style={styles.arenaCardBottom}>
                      <View style={styles.arenaStats}>
                        <Text style={styles.arenaStatText}>{t('participants', { count: arena.participant_count })}</Text>
                        {isEnded ? (
                          <View style={[styles.endedPill, { backgroundColor: hexToRgba(ac.primary, 0.12), borderColor: hexToRgba(ac.primary, 0.3) }]}>
                            <Text style={[styles.endedPillText, { color: ac.primary }]}>{t('ended')}</Text>
                          </View>
                        ) : (
                          <>
                            <Text style={styles.arenaStatDot}>·</Text>
                            <Text style={[styles.arenaStatText, daysLeft <= 3 && { color: theme.colors.secondary }]}>
                              {daysLeft}d left
                            </Text>
                          </>
                        )}
                      </View>
                      {arena.user_rank != null && (
                        <View style={[styles.arenaRankBadge, { backgroundColor: hexToRgba(CYAN, 0.12), borderColor: hexToRgba(CYAN, 0.3) }]}>
                          <Text style={[styles.arenaRankText, { color: CYAN }]}>#{arena.user_rank}</Text>
                        </View>
                      )}
                    </View>
                  </PlatformBlur>
                )}
              </TouchableOpacity>
            </Animated.View>
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

      <ScreenHeader
        title={t('title')}
        right={
          <TouchableOpacity
            onPress={() => setInfoSheetVisible(true)}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="information-circle-outline" size={22} color={branding.primary} />
          </TouchableOpacity>
        }
      />

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

            // Gap to leader for user context banner
            const userGapToLeader = (() => {
              if (!pageCurrentUserEntry || !ps.leaderboard[0] || (ps.currentUserRank ?? 0) <= 1) return null;
              const leaderScore = parseInt(cleanScore(ps.leaderboard[0].score_label).replace(/,/g, ''), 10);
              const userScore = parseInt(cleanScore(pageCurrentUserEntry.score_label).replace(/,/g, ''), 10);
              const gap = isNaN(leaderScore) || isNaN(userScore) ? null : Math.max(0, leaderScore - userScore);
              return gap;
            })();

            // Reward for user's rank (banner)
            const userReward = ps.rewards.find(r => r.rank_position === ps.currentUserRank);

            const pageHeader = (
              <>
                {/* ── User Context Banner ── */}
                {!ps.loading && pageCurrentUserEntry && ps.currentUserRank != null && (
                  <Animated.View entering={FadeInDown.duration(300)} style={[styles.userBanner, { borderColor: hexToRgba(branding.primary, 0.3) }]}>
                    <LinearGradient
                      colors={[hexToRgba(branding.primary, 0.16), hexToRgba(branding.primary, 0.04)]}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFillObject}
                    />
                    {/* Rank bubble */}
                    <View style={[styles.userBannerRankBubble, { backgroundColor: hexToRgba(branding.primary, 0.18), borderColor: hexToRgba(branding.primary, 0.4) }]}>
                      <Text style={[styles.userBannerRankText, { color: branding.primary }]}>#{ps.currentUserRank}</Text>
                    </View>
                    {/* Info */}
                    <View style={styles.userBannerInfo}>
                      <View style={styles.userBannerScoreRow}>
                        <Ionicons name="water" size={13} color={branding.primary} />
                        <Text style={[styles.userBannerScore, { color: branding.primary }]}>{cleanScore(pageCurrentUserEntry.score_label)}</Text>
                        <Text style={styles.userBannerScoreLabel}>{t('drops')}</Text>
                      </View>
                      {ps.currentUserRank === 1 ? (
                        <Text style={styles.userBannerGap}>
                          {t('youAreFirst')}{userReward ? ` · ${t('prizeBanner', { name: userReward.reward_name })}` : ''}
                        </Text>
                      ) : userGapToLeader != null ? (
                        <Text style={styles.userBannerGap}>
                          {t('gapToFirstBanner', { drops: userGapToLeader.toLocaleString() })}{userReward ? ` · ${t('prizeBanner', { name: userReward.reward_name })}` : ''}
                        </Text>
                      ) : null}
                    </View>
                    {/* Winner badge */}
                    {winnerBanner && !bannerDismissed && winnerBanner.period === p && (
                      <TouchableOpacity
                        style={styles.yourRankWinBadge}
                        onPress={() => { dismissWinnerBanner(); router.push('/redemptions'); }}
                        activeOpacity={0.7}
                      >
                        <LinearGradient
                          colors={[hexToRgba(GOLD, 0.2), hexToRgba(GOLD, 0.06)]}
                          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                          style={StyleSheet.absoluteFillObject}
                        />
                        <Ionicons name="gift" size={14} color={GOLD} />
                        <Text style={[styles.yourRankWinText, { color: GOLD }]}>{t('youWon')}</Text>
                      </TouchableOpacity>
                    )}
                  </Animated.View>
                )}

                {/* ── Reward Cards (always visible when gym has rewards) ── */}
                {activeTab === 'gym' && ps.rewards.length > 0 && !ps.loading && (
                  <Animated.View entering={FadeInDown.delay(100).duration(350)} style={styles.rewardCardsRow}>
                    {ps.rewards
                      .sort((a, b) => a.rank_position - b.rank_position)
                      .slice(0, 3)
                      .map((reward) => {
                        const rIdx = reward.rank_position - 1;
                        const medalColor = MEDAL_COLORS[rIdx] ?? BRONZE;
                        const isUsersRank = reward.rank_position === ps.currentUserRank;
                        return (
                          <View
                            key={reward.id}
                            style={[
                              styles.rewardCard,
                              {
                                borderColor: hexToRgba(medalColor, isUsersRank ? 0.65 : 0.3),
                                borderWidth: 1,
                                borderTopColor: hexToRgba(medalColor, isUsersRank ? 0.9 : 0.65),
                                borderTopWidth: 3,
                              },
                            ]}
                          >
                            {/* Glass blur base */}
                            <PlatformBlur intensity={40} tint="dark" style={StyleSheet.absoluteFill} androidColor="rgba(10,10,20,0.97)" />
                            {/* Medal gradient overlay */}
                            <LinearGradient
                              colors={[hexToRgba(medalColor, 0.18), hexToRgba(medalColor, 0.04), 'rgba(10,10,20,0)']}
                              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                              style={StyleSheet.absoluteFill}
                              pointerEvents="none"
                            />
                            <Text style={[styles.rewardCardRank, { color: medalColor, fontSize: 15 }]}>
                              #{reward.rank_position}{isUsersRank ? ' · Ti' : ''}
                            </Text>
                            <Text style={styles.rewardCardName} numberOfLines={2}>{reward.reward_name}</Text>
                            {reward.reward_description ? (
                              <Text style={styles.rewardCardDesc} numberOfLines={2}>{reward.reward_description}</Text>
                            ) : null}
                          </View>
                        );
                      })}
                  </Animated.View>
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
                  <View style={styles.podiumStage}>
                    {/* Render order: 2nd (left), 1st (center, elevated), 3rd (right) */}
                    {([1, 0, 2] as const).map((podiumIdx) => {
                      const entry = ps.leaderboard[podiumIdx];
                      if (!entry) return null;
                      const rank = entry.rank;
                      const isChampion = rank === 1;
                      const medalColor = rank === 1 ? GOLD : rank === 2 ? SILVER : BRONZE;
                      const avatarSize = rank === 1 ? 84 : rank === 2 ? 66 : 58;
                      const pedestalHeight = rank === 1 ? 110 : rank === 2 ? 76 : 60;
                      const isCurrent = isCurrentUser(entry.user_id);
                      // Ring color: always medal color; current user gets pulsing branding ring
                      const ringColor = medalColor;
                      const animDelay = rank === 1 ? 0 : rank === 2 ? 150 : 250;

                      return (
                        <TouchableOpacity
                          key={entry.user_id}
                          style={[styles.podiumColumn, isChampion && styles.podiumColumnChampion]}
                          onPress={() => router.push({ pathname: '/user/[id]', params: { id: entry.user_id } })}
                          activeOpacity={0.85}
                        >
                          {/* ── Avatar section ── */}
                          <Animated.View
                            entering={ZoomIn.delay(animDelay + 100).duration(400).springify()}
                            style={styles.podiumAvatarSection}
                          >
                            {/* Avatar ring — medal color always; current user gets pulsing animation with medal color */}
                            {isCurrent ? (
                              <PulsingRing size={avatarSize} color={medalColor} isChampion={isChampion}>
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
                                  borderColor: ringColor,
                                  borderWidth: isChampion ? 2.5 : 2,
                                  shadowColor: ringColor,
                                  shadowOpacity: isChampion ? 0.8 : 0.45,
                                  shadowRadius: isChampion ? 18 : 10,
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

                            {/* Name + streak */}
                            <View style={styles.podiumNameRow}>
                              <Text style={[styles.podiumName, isChampion && styles.podiumNameChamp]} numberOfLines={1}>
                                {entry.username}{isCurrent ? ' · Ti' : ''}
                              </Text>
                              {entry.streak_days > 0 && (
                                <View style={styles.podiumStreakChip}>
                                  <Ionicons name="flame" size={9} color="#FF9100" />
                                  <Text style={styles.podiumStreakVal}>{entry.streak_days}</Text>
                                </View>
                              )}
                            </View>
                          </Animated.View>

                          {/* ── Pedestal platform ── */}
                          <Animated.View
                            entering={FadeInUp.delay(animDelay).duration(450)}
                            style={[
                              styles.pedestalBar,
                              {
                                height: pedestalHeight,
                                borderColor: hexToRgba(medalColor, isChampion ? 0.55 : 0.28),
                              },
                            ]}
                          >
                            {/* Glass blur base */}
                            <PlatformBlur intensity={35} tint="dark" style={StyleSheet.absoluteFill} androidColor="rgba(10,10,20,0.97)" />
                            {/* Medal gradient overlay */}
                            <LinearGradient
                              colors={[hexToRgba(medalColor, isChampion ? 0.28 : 0.14), hexToRgba(medalColor, 0.04), 'rgba(10,10,20,0)']}
                              start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
                              style={StyleSheet.absoluteFill}
                              pointerEvents="none"
                            />
                            {/* Top accent bar */}
                            <View style={[styles.pedestalTopAccent, { backgroundColor: hexToRgba(medalColor, isChampion ? 0.85 : 0.55) }]} />
                            {/* Large rank number — center hero */}
                            <Text style={[styles.pedestalRank, { color: medalColor, fontSize: isChampion ? 32 : 24 }]}>#{rank}</Text>
                            <View style={styles.podiumScoreRow}>
                              <Ionicons name="water" size={isChampion ? 11 : 10} color={hexToRgba(medalColor, 0.75)} />
                              <Text style={[styles.podiumScoreVal, isChampion && { fontSize: 13 }, { color: hexToRgba(medalColor, 0.9) }]} numberOfLines={1}>
                                {cleanScore(entry.score_label)}
                              </Text>
                            </View>
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
                        const medalColor = rankNum === 1 ? GOLD : rankNum === 2 ? SILVER : rankNum === 3 ? BRONZE : null;
                        const isCurrent = isCurrentUser(entry.user_id);
                        const isLast = idx === extraRows.length - 1;
                        const textColor = medalColor ?? (isCurrent ? branding.primary : theme.colors.textSecondary);
                        return (
                          <TouchableOpacity
                            key={entry.user_id}
                            activeOpacity={0.7}
                            onPress={() => router.push({ pathname: '/user/[id]', params: { id: entry.user_id } })}
                            style={[
                              styles.listItem,
                              {
                                backgroundColor: isCurrent ? hexToRgba(branding.primary, 0.08) : 'rgba(20, 20, 30, 0.75)',
                                borderColor: isCurrent ? hexToRgba(branding.primary, 0.25) : 'rgba(255,255,255,0.06)',
                                borderLeftWidth: isCurrent ? 3 : 1,
                                borderLeftColor: isCurrent ? branding.primary : 'rgba(255,255,255,0.06)',
                                borderRightWidth: 1,
                              },
                              isLast && [styles.listItemLast, { borderBottomWidth: 1 }],
                              !isLast && styles.listItemBorder,
                            ]}
                          >
                            <View style={styles.rankContainer}>
                              {medalColor ? (
                                <View style={[styles.rankMedalBubble, { backgroundColor: hexToRgba(medalColor, 0.18), borderColor: hexToRgba(medalColor, 0.45) }]}>
                                  <Text style={[styles.rankMedalText, { color: medalColor }]}>#{rankNum}</Text>
                                </View>
                              ) : (
                                <Text style={[styles.rankText, { color: isCurrent ? branding.primary : theme.colors.textTertiary }]}>#{rankNum}</Text>
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
                                <Text style={[styles.username, { color: isCurrent ? branding.primary : theme.colors.text }]} numberOfLines={1}>
                                  {entry.username}
                                </Text>
                                {isCurrent && (
                                  <View style={[styles.youBadge, { backgroundColor: hexToRgba(branding.primary, 0.18), borderColor: hexToRgba(branding.primary, 0.4) }]}>
                                    <Text style={[styles.youBadgeText, { color: branding.primary }]}>{t('you')}</Text>
                                  </View>
                                )}
                                {entry.is_newcomer && <View style={styles.newcomerPill}><Text style={styles.newcomerPillText}>NEW</Text></View>}
                                {entry.streak_days > 0 && (
                                  <View style={styles.streakPill}>
                                    <Ionicons name="flame" size={10} color="#FF9100" />
                                    <Text style={styles.streakSmall}>{entry.streak_days}</Text>
                                  </View>
                                )}
                              </View>
                            </View>
                            <View style={styles.scoreContainer}>
                              <Ionicons name="water" size={12} color={textColor} style={{ marginRight: 3 }} />
                              <Text style={[styles.scoreLabel, { color: textColor }]}>
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
                            <View style={[styles.youBadge, { backgroundColor: hexToRgba(branding.primary, 0.18), borderColor: hexToRgba(branding.primary, 0.4) }]}>
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

                {/* ── Past Winners ── */}
                {activeTab === 'gym' && ps.snapshots.length > 0 && (
                  <View style={styles.historySection}>
                    <Text style={[styles.historySectionLabel, { color: branding.primary }]}>
                      {t('pastWinnersTitle')}
                    </Text>
                    {ps.snapshots.slice(0, 3).map((snapshot, idx) => {
                      const rankings = (snapshot.rankings || []) as Array<{ rank: number; user_id: string; username: string; drops: number }>;
                      const top3 = rankings.filter(r => r.rank <= 3).sort((a, b) => a.rank - b.rank);
                      if (top3.length === 0) return null;
                      const myRank: number | null = snapshot.my_rank ?? null;
                      const myDrops: number | null = snapshot.my_drops ?? null;
                      const iAmTop3 = myRank != null && myRank <= 3;
                      const iAmOutsideTop3 = myRank != null && myRank > 3;
                      const snapshotKey = snapshot.snapshot_id ?? snapshot.id ?? String(idx);
                      const isExpanded = expandedSnapshots[snapshotKey] ?? false;
                      const winner = top3[0];
                      return (
                        <Animated.View
                          key={snapshotKey}
                          entering={FadeInDown.delay(idx * 80).duration(300)}
                          style={[styles.historyCard, { borderColor: hexToRgba(branding.primary, 0.12) }]}
                        >
                          {/* Tappable header row */}
                          <Pressable
                            onPress={() =>
                              setExpandedSnapshots(prev => ({ ...prev, [snapshotKey]: !prev[snapshotKey] }))
                            }
                            style={styles.historyCardHeader}
                          >
                            <View style={styles.historyCardHeaderLeft}>
                              <Text style={styles.historyPeriodLabel}>{formatSnapshotDateRange(snapshot)}</Text>
                              {/* Winner preview — always shown in header */}
                              {winner && (
                                <View style={styles.historyWinnerPreview}>
                                  <Ionicons name="trophy" size={10} color={GOLD} />
                                  <Text style={styles.historyWinnerPreviewText} numberOfLines={1}>
                                    {winner.username}
                                  </Text>
                                </View>
                              )}
                            </View>
                            <View style={styles.historyCardHeaderRight}>
                              {iAmTop3 && (
                                <View style={styles.historyWonBadge}>
                                  <Text style={styles.historyWonText}>{t('wonPrizeBadge')}</Text>
                                </View>
                              )}
                              <Ionicons
                                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                                size={14}
                                color={theme.colors.textSecondary}
                              />
                            </View>
                          </Pressable>

                          {/* Expandable content */}
                          {isExpanded && (
                            <View style={styles.historyCardBody}>
                              {top3.map((entry) => {
                                const entryMedalColor = entry.rank === 1 ? GOLD : entry.rank === 2 ? SILVER : BRONZE;
                                const isMe = entry.user_id === session?.user?.id;
                                return (
                                  <View key={entry.user_id} style={styles.historyRow}>
                                    <Text style={[styles.historyRank, { color: entryMedalColor }]}>#{entry.rank}</Text>
                                    <Text style={[styles.historyUsername, isMe && { color: branding.primary }]} numberOfLines={1}>
                                      {isMe ? `${entry.username} (Ti)` : entry.username}
                                    </Text>
                                    <View style={styles.historyDropsRow}>
                                      <Ionicons name="water" size={10} color={isMe ? branding.primary : theme.colors.textTertiary} />
                                      <Text style={[styles.historyDrops, isMe && { color: branding.primary }]}>
                                        {entry.drops.toLocaleString()}
                                      </Text>
                                    </View>
                                  </View>
                                );
                              })}
                              {iAmOutsideTop3 && myDrops != null && (
                                <View style={[styles.historyRow, styles.historyMyRow]}>
                                  <View style={[styles.historyMyPill, { backgroundColor: hexToRgba(branding.primary, 0.12), borderColor: hexToRgba(branding.primary, 0.3) }]}>
                                    <Text style={[styles.historyMyPillText, { color: branding.primary }]}>#{myRank} Ti</Text>
                                    <Ionicons name="water" size={10} color={branding.primary} />
                                    <Text style={[styles.historyMyPillDrops, { color: branding.primary }]}>{myDrops.toLocaleString()}</Text>
                                  </View>
                                </View>
                              )}
                            </View>
                          )}
                        </Animated.View>
                      );
                    })}
                    {ps.snapshots.length > 3 && (
                      <TouchableOpacity activeOpacity={0.7} style={styles.historyViewAll}>
                        <Text style={[styles.historyViewAllText, { color: branding.primary }]}>{t('seeAllArrow')}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </>
            );

            const podiumEntries = ps.leaderboard.slice(0, 3);

            return (
              <FlatList
                key={p}
                data={pageData}
                renderItem={(props) => renderLeaderboardItem({ ...props, extraData: { count: pageData.length, hasMore, podiumEntries } })}
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
            period={period}
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
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
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
    gap: 2,
    paddingVertical: 6,
  },
  pedestalRank: {
    ...fontStyles.heading,
    fontSize: 18,
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
    marginBottom: 10,
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
  scoringBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prizePillsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  prizePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  prizePillText: {
    ...fontStyles.number,
    fontSize: 11,
  },
  prizePillLabel: {
    ...fontStyles.bodySemiBold,
    fontSize: 10,
    flex: 1,
  },
  endedPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  endedPillText: {
    ...fontStyles.heading,
    fontSize: 10,
    letterSpacing: 1,
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
    borderWidth: 1,
  },
  arenaRankText: {
    ...fontStyles.number,
    fontSize: 14,
  },

  /* ── User Context Banner ── */
  userBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
    padding: 12,
    marginBottom: 12,
    gap: 10,
  },
  userBannerRankBubble: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userBannerRankText: {
    ...fontStyles.heading,
    fontSize: 18,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  userBannerInfo: {
    flex: 1,
    gap: 2,
  },
  userBannerScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  userBannerScore: {
    ...fontStyles.number,
    fontSize: 16,
    color: '#FFFFFF',
  },
  userBannerScoreLabel: {
    ...fontStyles.body,
    fontSize: 12,
    color: theme.colors.textTertiary,
  },
  userBannerGap: {
    ...fontStyles.body,
    fontSize: 11,
    color: theme.colors.textTertiary,
    letterSpacing: 0.2,
  },
  yourRankWinBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    overflow: 'hidden',
  },
  yourRankWinText: {
    ...fontStyles.bodySemiBold,
    fontSize: 11,
    letterSpacing: 0.2,
  },

  /* ── Reward Cards ── */
  rewardCardsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  rewardCard: {
    flex: 1,
    borderRadius: 12,
    padding: 10,
    gap: 4,
    overflow: 'hidden',
    minHeight: 80,
  },
  rewardCardRank: {
    ...fontStyles.heading,
    fontSize: 11,
    letterSpacing: 1,
  },
  rewardCardName: {
    ...fontStyles.bodySemiBold,
    fontSize: 11,
    color: theme.colors.text,
    letterSpacing: 0.2,
  },
  rewardCardDesc: {
    ...fontStyles.body,
    fontSize: 10,
    color: theme.colors.textTertiary,
    letterSpacing: 0.1,
  },

  /* ── Score right column (score + gap) ── */
  scoreRightCol: {
    alignItems: 'flex-end',
    gap: 2,
  },
  gapText: {
    ...fontStyles.body,
    fontSize: 10,
    color: theme.colors.textTertiary,
    letterSpacing: 0.1,
  },

  /* ── Newcomer pill (inline in name row) ── */
  newcomerPill: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
    backgroundColor: hexToRgba(SILVER, 0.14),
    borderWidth: 1,
    borderColor: hexToRgba(SILVER, 0.3),
  },
  newcomerPillText: {
    ...fontStyles.heading,
    fontSize: 9,
    letterSpacing: 1,
    color: SILVER,
  },

  /* ── Champion pill above avatar ── */
  podiumChampionPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: GOLD,
    marginBottom: -2,
    alignSelf: 'center',
  },
  podiumChampionPillText: {
    ...fontStyles.heading,
    fontSize: 11,
    color: '#1A0F00',
    letterSpacing: 0.8,
  },

  /* ── Pedestal top accent bar ── */
  pedestalTopAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },

  /* ── History Section ── */
  historySection: {
    marginTop: theme.spacing.xl,
    gap: 10,
  },
  historySectionLabel: {
    ...fontStyles.heading,
    fontSize: 11,
    letterSpacing: 2,
    color: 'rgba(255,255,255,0.7)',
  },
  historyCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(20, 20, 30, 0.6)',
    padding: 14,
  },
  historyCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  historyCardHeaderLeft: {
    flex: 1,
    gap: 4,
  },
  historyCardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  historyCardBody: {
    marginTop: 10,
    gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.07)',
    paddingTop: 10,
  },
  historyPeriodLabel: {
    ...fontStyles.bodySemiBold,
    fontSize: 13,
    color: theme.colors.text,
    letterSpacing: 0.2,
  },
  historyWinnerPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  historyWinnerPreviewText: {
    ...fontStyles.body,
    fontSize: 11,
    color: theme.colors.textSecondary,
    letterSpacing: 0.1,
  },
  historyWonBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: hexToRgba(GOLD, 0.12),
    borderWidth: 1,
    borderColor: hexToRgba(GOLD, 0.3),
  },
  historyWonText: {
    ...fontStyles.bodySemiBold,
    fontSize: 10,
    color: GOLD,
    letterSpacing: 0.3,
  },
  historyWinnerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: hexToRgba(GOLD, 0.12),
    borderWidth: 1,
    borderColor: hexToRgba(GOLD, 0.3),
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  historyWinnerRank: {
    ...fontStyles.heading,
    fontSize: 12,
    color: GOLD,
  },
  historyWinnerName: {
    ...fontStyles.bodySemiBold,
    flex: 1,
    fontSize: 13,
    color: GOLD,
    letterSpacing: 0.2,
  },
  historyWinnerDrops: {
    ...fontStyles.number,
    fontSize: 12,
    color: hexToRgba(GOLD, 0.8),
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 3,
  },
  historyRank: {
    ...fontStyles.number,
    width: 28,
    fontSize: 12,
    textAlign: 'center',
  },
  historyUsername: {
    ...fontStyles.bodyMedium,
    flex: 1,
    fontSize: 13,
    color: theme.colors.text,
    letterSpacing: 0.2,
  },
  historyDropsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  historyDrops: {
    ...fontStyles.number,
    fontSize: 11,
    color: theme.colors.textTertiary,
  },
  historyMyRow: {
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  historyMyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  historyMyPillText: {
    ...fontStyles.heading,
    fontSize: 12,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  historyMyPillDrops: {
    ...fontStyles.number,
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
  },
  historyViewAll: {
    alignSelf: 'center',
    paddingVertical: 8,
  },
  historyViewAllText: {
    ...fontStyles.bodySemiBold,
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 0.3,
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
