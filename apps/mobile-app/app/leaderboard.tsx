import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { theme, getNumberStyle, fontStyles } from '@/lib/theme';
import BackButton from '@/components/BackButton';
import { useGymStore } from '@/lib/stores/useGymStore';
import { useBranding } from '@/lib/contexts/ThemeContext';
import Animated, { FadeInDown } from 'react-native-reanimated';
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

function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(0, 229, 255, ${alpha})`;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

type TabType = 'gym' | 'global' | 'arenas';

const SCORING_ICONS: Record<string, string> = {
  total_drops: '💧',
  days_visited: '📅',
  variety_score: '🏋️',
  streak_days: '🔥',
};

export default function LeaderboardScreen() {
  const router = useRouter();
  const { session } = useSession();
  const branding = useBranding();
  const { getActiveGymId } = useGymStore();
  const activeGymId = getActiveGymId();
  const { t } = useTranslation('leaderboard');

  const [activeTab, setActiveTab] = useState<TabType>('gym');
  const [period, setPeriod] = useState<LeaderboardPeriod>('weekly');
  const [newcomerOnly, setNewcomerOnly] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [rewards, setRewards] = useState<LeaderboardReward[]>([]);
  const [arenas, setArenas] = useState<AvailableArena[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentUserRank, setCurrentUserRank] = useState<number | null>(null);
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [showPastWinners, setShowPastWinners] = useState(false);
  const [winnerBanner, setWinnerBanner] = useState<{
    rank: number;
    period: string;
    periodLabel: string;
    reward?: string;
    snapshotId: string;
  } | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    if (session?.user) {
      if (activeTab === 'arenas') {
        loadArenas();
      } else {
        loadLeaderboard();
      }
    }
  }, [session, period, activeTab, activeGymId, newcomerOnly]);

  const loadLeaderboard = async () => {
    if (!session?.user) return;
    setLoading(true);

    try {
      const isGym = activeTab === 'gym';

      if (isGym && !activeGymId) {
        setLeaderboard([]);
        setLoading(false);
        return;
      }

      // Try get_leaderboard RPC first
      let { data, error } = await supabase.rpc('get_leaderboard', {
        p_type: isGym ? 'gym' : 'global',
        p_scope_id: isGym ? activeGymId : null,
        p_period: period,
        p_limit: 100,
        p_newcomer_only: newcomerOnly,
      });

      // Fallback to old RPCs if get_leaderboard fails
      if (error && error.code === 'PGRST202') {
        console.warn('[Leaderboard] get_leaderboard RPC not found, trying fallback...');
        if (isGym && activeGymId) {
          const { data: fallbackData, error: fallbackError } = await supabase.rpc('get_local_leaderboard', {
            p_gym_id: activeGymId,
            p_period: period,
            p_limit: 100,
            p_newcomer_only: newcomerOnly,
          });
          if (!fallbackError && fallbackData) {
            data = fallbackData;
            error = null;
          }
        } else {
          const { data: fallbackData, error: fallbackError } = await supabase.rpc('get_global_leaderboard', {
            p_period: period,
            p_limit: 100,
            p_newcomer_only: newcomerOnly,
          });
          if (!fallbackError && fallbackData) {
            data = fallbackData;
            error = null;
          }
        }
      }

      if (error) {
        console.error('[Leaderboard] Error loading leaderboard:', error);
        console.error('[Leaderboard] Error details:', JSON.stringify(error, null, 2));
        setLeaderboard([]);
      } else if (data) {
        const entries = (data as LeaderboardEntry[]) || [];
        setLeaderboard(entries);

        const userEntry = entries.find(
          (e) => e.user_id === session.user.id
        );
        setCurrentUserRank(userEntry?.rank ?? null);
      } else {
        // No data returned from RPC
        setLeaderboard([]);
      }

      // Fetch prizes for gym tab
      if (isGym && activeGymId) {
        const { data: rewardData } = await supabase
          .from('leaderboard_rewards')
          .select('*')
          .eq('gym_id', activeGymId)
          .eq('period', period)
          .eq('is_active', true)
          .order('rank_position', { ascending: true })
          .limit(3);

        setRewards((rewardData as LeaderboardReward[]) || []);

        // Fetch past winner snapshots
        const { data: snapshotData } = await supabase
          .from('leaderboard_snapshots')
          .select('id, period, period_start, period_end, rankings, prizes_distributed')
          .eq('gym_id', activeGymId)
          .order('period_end', { ascending: false })
          .limit(5);

        setSnapshots(snapshotData || []);
      } else {
        setRewards([]);
        setSnapshots([]);
      }
    } catch (error) {
      console.error('Leaderboard error:', error);
      setLeaderboard([]);
    } finally {
      setLoading(false);
    }
  };

  const loadArenas = async () => {
    if (!session?.user) {
      console.warn('[Leaderboard] loadArenas: No session');
      return;
    }
    setLoading(true);

    try {
      // Loading arenas for user
      const { data, error } = await supabase.rpc('get_available_arenas', {
        p_user_id: session.user.id,
      });

      if (error) {
        console.error('[Leaderboard] Error loading arenas:', error);
        console.error('[Leaderboard] Error details:', JSON.stringify(error, null, 2));
        setArenas([]);
      } else {
        const allArenas = (data as AvailableArena[]) || [];
        // Show all available arenas (same as home screen) - user can see and opt-in
        setArenas(allArenas);
      }
    } catch (error) {
      console.error('[Leaderboard] Arenas exception:', error);
      setArenas([]);
    } finally {
      setLoading(false);
    }
  };

  const getRankDisplay = (rank: number) => {
    if (rank === 1) return { emoji: '🥇', isTop: true };
    if (rank === 2) return { emoji: '🥈', isTop: true };
    if (rank === 3) return { emoji: '🥉', isTop: true };
    return { emoji: `${rank}`, isTop: false };
  };

  const isCurrentUser = (userId: string) => session?.user?.id === userId;

  const getRewardForRank = (rank: number): LeaderboardReward | undefined =>
    rewards.find((r) => r.rank_position === rank);

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

  // Winner banner: check if current user was top 3 in any recent snapshot
  useEffect(() => {
    if (!session?.user?.id || snapshots.length === 0) {
      setWinnerBanner(null);
      return;
    }

    (async () => {
      for (const snapshot of snapshots) {
        const rankings = (snapshot.rankings || []) as Array<{ rank: number; user_id: string; username: string; drops: number }>;
        const userEntry = rankings.find(r => r.user_id === session.user.id && r.rank <= 3);
        if (userEntry) {
          const dismissed = await AsyncStorage.getItem(`dismissedWinBanner_${snapshot.id}`);
          if (dismissed) continue;

          const matchingReward = rewards.find(r => r.rank_position === userEntry.rank);
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
  }, [snapshots, session?.user?.id, rewards]);

  const dismissWinnerBanner = async () => {
    if (winnerBanner) {
      await AsyncStorage.setItem(`dismissedWinBanner_${winnerBanner.snapshotId}`, '1');
      setBannerDismissed(true);
    }
  };

  const currentUserEntry = leaderboard.find((entry) => isCurrentUser(entry.user_id));

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

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Winner Banner */}
        {winnerBanner && !bannerDismissed && activeTab === 'gym' && (
          <Animated.View entering={FadeInDown.delay(50).duration(400)}>
            <TouchableOpacity
              style={[styles.winnerBanner, { borderColor: hexToRgba('#FFD700', 0.3) }]}
              onPress={() => router.push('/redemptions')}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={[hexToRgba('#FFD700', 0.12), hexToRgba('#FFD700', 0.04)]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
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
                <TouchableOpacity
                  onPress={dismissWinnerBanner}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close" size={18} color={theme.colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* 3-Tab Toggle: My Gym | Global | Arenas */}
        <Animated.View entering={FadeInDown.delay(100).duration(400)}>
          <View style={[styles.typeToggle, { borderColor: hexToRgba(branding.primary, 0.15) }]}>
            <BlurView intensity={50} tint="dark" style={[styles.typeToggleBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
              {([
                { key: 'gym' as TabType, label: t('myGym'), icon: 'location' as const },
                { key: 'global' as TabType, label: t('global'), icon: 'globe-outline' as const },
                { key: 'arenas' as TabType, label: t('arenas'), icon: 'trophy' as const },
              ]).map((tab) => (
                <TouchableOpacity
                  key={tab.key}
                  style={[
                    styles.typeTab,
                    activeTab === tab.key && {
                      backgroundColor: hexToRgba(branding.primary, 0.15),
                      borderColor: hexToRgba(branding.primary, 0.3),
                      borderWidth: 1,
                    },
                  ]}
                  onPress={() => setActiveTab(tab.key)}
                >
                  <Ionicons
                    name={tab.icon}
                    size={14}
                    color={activeTab === tab.key ? branding.primary : theme.colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.typeTabText,
                      activeTab === tab.key && { color: branding.primary },
                    ]}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </BlurView>
          </View>
        </Animated.View>

        {/* Period Filter (gym + global tabs) */}
        {activeTab !== 'arenas' && (
          <Animated.View entering={FadeInDown.delay(200).duration(400)}>
            <View style={styles.periodFilter}>
              {(['weekly', 'monthly', 'all_time'] as LeaderboardPeriod[]).map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[
                    styles.periodButton,
                    period === p && { backgroundColor: branding.primary },
                  ]}
                  onPress={() => setPeriod(p)}
                >
                  <Text
                    style={[
                      styles.periodButtonText,
                      period === p && { color: branding.onPrimary },
                    ]}
                  >
                    {p === 'all_time' ? t('allTime') : p === 'weekly' ? t('weekly') : t('monthly')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Newcomer filter */}
            {activeTab === 'gym' && (
              <TouchableOpacity
                style={[styles.newcomerToggle, newcomerOnly && { backgroundColor: hexToRgba(branding.primary, 0.15), borderColor: hexToRgba(branding.primary, 0.3) }]}
                onPress={() => setNewcomerOnly(!newcomerOnly)}
              >
                <Ionicons name="sparkles" size={14} color={newcomerOnly ? branding.primary : theme.colors.textSecondary} />
                <Text style={[styles.newcomerText, newcomerOnly && { color: branding.primary }]}>{t('newcomersOnly')}</Text>
              </TouchableOpacity>
            )}
          </Animated.View>
        )}

        {/* Prize badges for gym tab */}
        {activeTab === 'gym' && rewards.length > 0 && (
          <Animated.View entering={FadeInDown.delay(250).duration(400)}>
            <View style={styles.prizeRow}>
              {rewards.map((r) => {
                const medal = r.rank_position === 1 ? '🥇' : r.rank_position === 2 ? '🥈' : '🥉';
                return (
                  <View key={r.id} style={[styles.prizeBadge, { borderColor: hexToRgba(branding.primary, 0.2) }]}>
                    <Text style={styles.prizeMedal}>{medal}</Text>
                    <Text style={styles.prizeName} numberOfLines={1}>{r.reward_name}</Text>
                  </View>
                );
              })}
            </View>
          </Animated.View>
        )}

        {/* ─── ARENAS TAB ─── */}
        {activeTab === 'arenas' && (
          loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={branding.primary} />
            </View>
          ) : arenas.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="trophy-outline" size={64} color={theme.colors.textSecondary} />
              <Text style={styles.emptyText}>{t('noActiveArenas')}</Text>
              <Text style={styles.emptySubtext}>
                {loading ? 'Loading arenas...' : 'No arenas available at this time. Check back soon!'}
              </Text>
              {__DEV__ && (
                <Text style={[styles.emptySubtext, { marginTop: 8, fontSize: 12 }]}>
                  Debug: session={session?.user?.id ? 'exists' : 'null'}, arenas={arenas.length}
                </Text>
              )}
            </View>
          ) : (
            <Animated.View entering={FadeInDown.delay(200).duration(400)}>
              {arenas.map((arena) => {
                const daysLeft = getDaysLeft(arena.end_date);
                const scoringIcon = SCORING_ICONS[arena.scoring_model] || '💧';
                return (
                  <TouchableOpacity
                    key={arena.arena_id}
                    style={[styles.arenaCard, { borderColor: hexToRgba(branding.primary, 0.15) }]}
                    onPress={() => router.push({ pathname: '/arena/[id]', params: { id: arena.arena_id } })}
                    activeOpacity={0.8}
                  >
                    <BlurView intensity={50} tint="dark" style={[styles.arenaCardBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
                      <View style={styles.arenaCardTop}>
                        {arena.sponsor_logo ? (
                          <Image source={{ uri: arena.sponsor_logo }} style={styles.sponsorLogo} resizeMode="contain" />
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
                          <Text style={styles.scoringIcon}>{scoringIcon}</Text>
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
                            <Text style={[styles.arenaRankText, { color: branding.primary }]}>
                              #{arena.user_rank}
                            </Text>
                          </View>
                        )}
                      </View>
                    </BlurView>
                  </TouchableOpacity>
                );
              })}
            </Animated.View>
          )
        )}

        {/* ─── GYM / GLOBAL LEADERBOARD ─── */}
        {activeTab !== 'arenas' && (
          loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={branding.primary} />
            </View>
          ) : leaderboard.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="trophy-outline" size={64} color={theme.colors.textSecondary} />
              <Text style={styles.emptyText}>{t('noRankings')}</Text>
              <Text style={styles.emptySubtext}>
                {activeTab === 'gym' ? t('beFirstGym') : t('beFirstGlobal')}
              </Text>
              {__DEV__ && (
                <Text style={[styles.emptySubtext, { marginTop: 8, fontSize: 12 }]}>
                  Debug: activeTab={activeTab}, activeGymId={activeGymId || 'null'}, period={period}, loading={loading.toString()}
                </Text>
              )}
            </View>
          ) : (
            <>
              {/* Top 3 Podium */}
              {leaderboard.length >= 3 && (
                <Animated.View entering={FadeInDown.delay(300).duration(500)}>
                  <View style={styles.podium}>
                    {[1, 0, 2].map((podiumIdx) => {
                      const entry = leaderboard[podiumIdx];
                      if (!entry) return null;
                      const isFirst = podiumIdx === 0;
                      const isSecond = podiumIdx === 1;
                      const reward = getRewardForRank(entry.rank);
                      const medalColors = {
                        0: '#FFD700', // gold
                        1: '#C0C0C0', // silver
                        2: '#CD7F32', // bronze
                      };
                      const medalColor = medalColors[podiumIdx as keyof typeof medalColors];
                      const avatarSize = isFirst ? 68 : 52;
                      const platformHeight = isFirst ? 48 : isSecond ? 32 : 20;
                      return (
                        <View
                          key={entry.user_id}
                          style={[styles.podiumItem, isFirst && styles.podiumItemFirst]}
                        >
                          {/* Medal indicator */}
                          <Text style={styles.podiumMedal}>
                            {isFirst ? '🥇' : isSecond ? '🥈' : '🥉'}
                          </Text>

                          {/* Avatar */}
                          <View
                            style={[
                              styles.podiumAvatar,
                              {
                                width: avatarSize,
                                height: avatarSize,
                                borderRadius: avatarSize / 2,
                                borderColor: medalColor,
                                borderWidth: isFirst ? 3 : 2,
                              },
                              isFirst && {
                                shadowColor: medalColor,
                                shadowOffset: { width: 0, height: 0 },
                                shadowOpacity: 0.6,
                                shadowRadius: 12,
                                elevation: 8,
                              },
                              isCurrentUser(entry.user_id) && {
                                backgroundColor: hexToRgba(branding.primary, 0.15),
                              },
                            ]}
                          >
                            {entry.avatar_url && entry.avatar_url.startsWith('http') ? (
                              <Image source={{ uri: entry.avatar_url }} style={[styles.podiumAvatarImage, { borderRadius: avatarSize / 2 }]} />
                            ) : entry.avatar_url ? (
                              <Text style={[styles.podiumEmoji, isFirst && styles.podiumEmojiFirst]}>
                                {entry.avatar_url}
                              </Text>
                            ) : (
                              <Text style={[styles.podiumEmoji, isFirst && styles.podiumEmojiFirst]}>
                                {getRankDisplay(entry.rank).emoji}
                              </Text>
                            )}
                          </View>
                          {/* Streak badge */}
                          {entry.streak_days > 0 && (
                            <Text style={styles.streakBadge}>🔥{entry.streak_days}</Text>
                          )}
                          <Text
                            style={[
                              styles.podiumName,
                              isCurrentUser(entry.user_id) && { color: branding.primary },
                            ]}
                            numberOfLines={1}
                          >
                            {entry.username}
                          </Text>
                          <Text style={[styles.podiumScore, { color: branding.primary }]} numberOfLines={1}>
                            {entry.score_label}
                          </Text>
                          {/* Prize label */}
                          {reward && (
                            <Text style={[styles.prizeLabel, { color: branding.primary }]} numberOfLines={1}>
                              {reward.reward_name}
                            </Text>
                          )}
                          {/* Podium platform */}
                          <View style={[
                            styles.podiumPlatform,
                            {
                              height: platformHeight,
                              backgroundColor: hexToRgba(medalColor, 0.12),
                              borderColor: hexToRgba(medalColor, 0.25),
                            },
                          ]} />
                        </View>
                      );
                    })}
                  </View>
                </Animated.View>
              )}

              {/* Full Leaderboard List */}
              <Animated.View entering={FadeInDown.delay(400).duration(400)}>
                <View style={[styles.listContainer, { borderColor: hexToRgba(branding.primary, 0.15) }]}>
                  <BlurView intensity={50} tint="dark" style={[styles.listBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
                    {leaderboard.map((entry, index) => {
                      const rank = getRankDisplay(entry.rank);
                      const isCurrent = isCurrentUser(entry.user_id);
                      return (
                        <TouchableOpacity
                          key={entry.user_id}
                          activeOpacity={0.7}
                          onPress={() => router.push({ pathname: '/user/[id]', params: { id: entry.user_id } })}
                          style={[
                            styles.listItem,
                            index < leaderboard.length - 1 && styles.listItemBorder,
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

                          {/* Avatar */}
                          {entry.avatar_url && entry.avatar_url.startsWith('http') ? (
                            <Image source={{ uri: entry.avatar_url }} style={styles.listAvatar} />
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
                      );
                    })}
                  </BlurView>
                </View>
              </Animated.View>

              {/* Sticky footer for user outside visible list */}
              {currentUserEntry && currentUserRank != null && currentUserRank > 50 && (
                <Animated.View entering={FadeInDown.delay(500).duration(400)}>
                  <View style={[styles.stickyFooter, { borderColor: hexToRgba(branding.primary, 0.3) }]}>
                    <BlurView intensity={50} tint="dark" style={[styles.stickyFooterBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
                      <Text style={styles.stickyFooterRank}>#{currentUserEntry.rank}</Text>
                      <Text style={styles.stickyFooterName}>{currentUserEntry.username}</Text>
                      <Text style={[styles.scoreLabel, { color: branding.primary }]}>{currentUserEntry.score_label}</Text>
                    </BlurView>
                  </View>
                </Animated.View>
              )}

              {/* Period reset note */}
              {activeTab === 'gym' && period !== 'all_time' && (
                <Animated.View entering={FadeInDown.delay(600).duration(400)}>
                  <Text style={styles.resetNote}>
                    {period === 'weekly' ? t('prizesResetWeekly') : t('prizesResetMonthly')}
                  </Text>
                </Animated.View>
              )}

              {/* Past Winners */}
              {activeTab === 'gym' && snapshots.length > 0 && (
                <Animated.View entering={FadeInDown.delay(700).duration(400)}>
                  <TouchableOpacity
                    style={[styles.pastWinnersToggle, { borderColor: hexToRgba(branding.primary, 0.15) }]}
                    onPress={() => setShowPastWinners(!showPastWinners)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.pastWinnersToggleIcon}>📜</Text>
                    <Text style={styles.pastWinnersToggleText}>{t('pastWinners')}</Text>
                    <Ionicons
                      name={showPastWinners ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={theme.colors.textSecondary}
                    />
                  </TouchableOpacity>

                  {showPastWinners && (
                    <View style={[styles.pastWinnersContainer, { borderColor: hexToRgba(branding.primary, 0.15) }]}>
                      <BlurView intensity={50} tint="dark" style={[styles.pastWinnersBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
                        {snapshots.map((snapshot, idx) => {
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
                                  <Text style={[styles.snapshotDrops, { color: branding.primary }]}>
                                    {entry.drops.toLocaleString()} {t('drops')}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          );
                        })}
                      </BlurView>
                    </View>
                  )}
                </Animated.View>
              )}
            </>
          )
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
  /* Type Toggle */
  typeToggle: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    marginBottom: theme.spacing.md,
    borderWidth: 1,
  },
  typeToggleBlur: {
    flexDirection: 'row',
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    padding: 4,
  },
  typeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: theme.spacing.sm + 2,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  typeTabText: {
    ...fontStyles.heading,
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  /* Period Filter */
  periodFilter: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  periodButton: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  periodButtonText: {
    ...fontStyles.heading,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
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
  listContainer: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
  },
  listBlur: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
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
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    marginBottom: theme.spacing.md,
  },
  arenaCardBlur: {
    borderRadius: theme.borderRadius.xl,
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
  scoringIcon: {
    fontSize: 20,
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
