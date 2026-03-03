import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { theme, getNumberStyle } from '@/lib/theme';
import BackButton from '@/components/BackButton';
import { useGymStore } from '@/lib/stores/useGymStore';
import { useBranding } from '@/lib/contexts/ThemeContext';
import Animated, { FadeInDown } from 'react-native-reanimated';
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

  const [activeTab, setActiveTab] = useState<TabType>('gym');
  const [period, setPeriod] = useState<LeaderboardPeriod>('weekly');
  const [newcomerOnly, setNewcomerOnly] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [rewards, setRewards] = useState<LeaderboardReward[]>([]);
  const [arenas, setArenas] = useState<AvailableArena[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentUserRank, setCurrentUserRank] = useState<number | null>(null);

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
        console.log('[Leaderboard] Loaded entries:', entries.length, 'for period:', period, 'type:', isGym ? 'gym' : 'global');
        if (entries.length > 0) {
          console.log('[Leaderboard] First entry sample:', {
            rank: entries[0].rank,
            username: entries[0].username,
            score: entries[0].score,
            score_label: entries[0].score_label,
          });
        }
        setLeaderboard(entries);

        const userEntry = entries.find(
          (e) => e.user_id === session.user.id
        );
        setCurrentUserRank(userEntry?.rank ?? null);
      } else {
        console.warn('[Leaderboard] No data returned from get_leaderboard RPC');
        console.warn('[Leaderboard] Params:', {
          p_type: isGym ? 'gym' : 'global',
          p_scope_id: isGym ? activeGymId : null,
          p_period: period,
          p_limit: 100,
          p_newcomer_only: newcomerOnly,
        });
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
      } else {
        setRewards([]);
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
      console.log('[Leaderboard] Loading arenas for user:', session.user.id);
      const { data, error } = await supabase.rpc('get_available_arenas', {
        p_user_id: session.user.id,
      });

      if (error) {
        console.error('[Leaderboard] Error loading arenas:', error);
        console.error('[Leaderboard] Error details:', JSON.stringify(error, null, 2));
        setArenas([]);
      } else {
        const allArenas = (data as AvailableArena[]) || [];
        console.log('[Leaderboard] Loaded arenas:', allArenas.length, 'total');
        if (allArenas.length > 0) {
          console.log('[Leaderboard] First arena sample:', {
            name: allArenas[0].name,
            user_opted_in: allArenas[0].user_opted_in,
            participant_count: allArenas[0].participant_count,
          });
        }
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
        <Text style={styles.headerTitle}>Leaderboard</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* 3-Tab Toggle: My Gym | Global | Arenas */}
        <Animated.View entering={FadeInDown.delay(100).duration(400)}>
          <View style={[styles.typeToggle, { borderColor: hexToRgba(branding.primary, 0.15) }]}>
            <BlurView intensity={50} tint="dark" style={[styles.typeToggleBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
              {([
                { key: 'gym' as TabType, label: 'My Gym', icon: 'location' as const },
                { key: 'global' as TabType, label: 'Global', icon: 'globe-outline' as const },
                { key: 'arenas' as TabType, label: 'Arenas', icon: 'trophy' as const },
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
                      activeTab === tab.key && { color: branding.primary, fontWeight: theme.typography.fontWeight.bold },
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
                      period === p && { color: branding.onPrimary, fontWeight: theme.typography.fontWeight.semibold },
                    ]}
                  >
                    {p === 'all_time' ? 'All Time' : p.charAt(0).toUpperCase() + p.slice(1)}
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
                <Text style={[styles.newcomerText, newcomerOnly && { color: branding.primary }]}>Newcomers Only</Text>
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
              <Text style={styles.emptyText}>No Active Arenas</Text>
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
              <Text style={styles.emptyText}>No Rankings Yet</Text>
              <Text style={styles.emptySubtext}>
                {activeTab === 'gym' 
                  ? 'Be the first to earn drops at this gym!' 
                  : 'Be the first to earn drops globally!'}
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
                      const reward = getRewardForRank(entry.rank);
                      return (
                        <View
                          key={entry.user_id}
                          style={[styles.podiumItem, isFirst && styles.podiumItemFirst]}
                        >
                          {/* Avatar */}
                          <View
                            style={[
                              styles.podiumAvatar,
                              isFirst && { borderColor: branding.primary, borderWidth: 2 },
                              isCurrentUser(entry.user_id) && {
                                backgroundColor: hexToRgba(branding.primary, 0.15),
                              },
                            ]}
                          >
                            {entry.avatar_url ? (
                              <Image source={{ uri: entry.avatar_url }} style={styles.podiumAvatarImage} />
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
                        <View
                          key={entry.user_id}
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
                          {entry.avatar_url ? (
                            <Image source={{ uri: entry.avatar_url }} style={styles.listAvatar} />
                          ) : (
                            <View style={styles.listAvatarPlaceholder}>
                              <Text style={styles.listAvatarInitial}>
                                {(entry.username || 'U').charAt(0).toUpperCase()}
                              </Text>
                            </View>
                          )}

                          <View style={styles.userInfo}>
                            <View style={styles.userNameRow}>
                              <Text style={[styles.username, isCurrent && { color: branding.primary }]}>
                                {entry.username}
                                {isCurrent && ' (You)'}
                              </Text>
                              {entry.streak_days > 0 && (
                                <Text style={styles.streakSmall}>🔥{entry.streak_days}</Text>
                              )}
                              {entry.is_newcomer && (
                                <View style={[styles.newcomerBadge, { backgroundColor: hexToRgba(branding.primary, 0.15) }]}>
                                  <Text style={[styles.newcomerBadgeText, { color: branding.primary }]}>NEW</Text>
                                </View>
                              )}
                            </View>
                          </View>

                          <Text style={[
                            styles.scoreLabel,
                            { color: isCurrent ? branding.primary : theme.colors.textSecondary },
                          ]}>
                            {entry.score_label}
                          </Text>
                        </View>
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
                    Prizes reset every {period === 'weekly' ? 'week' : 'month'}
                  </Text>
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
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  headerTitle: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    letterSpacing: 0.5,
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
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
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
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.fontWeight.medium,
    letterSpacing: 0.3,
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
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.fontWeight.medium,
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
    fontSize: 11,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.fontWeight.medium,
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
  /* Podium */
  podium: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  podiumItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingTop: theme.spacing.lg,
  },
  podiumItemFirst: {
    paddingTop: 0,
  },
  podiumAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
  },
  podiumAvatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 26,
  },
  podiumEmoji: {
    fontSize: 22,
  },
  podiumEmojiFirst: {
    fontSize: 28,
  },
  streakBadge: {
    fontSize: 10,
    color: theme.colors.secondary,
    fontWeight: '600',
  },
  podiumName: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text,
    letterSpacing: 0.3,
    textAlign: 'center',
    maxWidth: 80,
  },
  podiumScore: {
    fontSize: 12,
    fontWeight: theme.typography.fontWeight.bold,
    fontFamily: theme.typography.fontFamily.monospace,
    letterSpacing: 0.3,
  },
  prizeLabel: {
    fontSize: 9,
    fontWeight: theme.typography.fontWeight.semibold,
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
    fontWeight: theme.typography.fontWeight.bold,
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
  listAvatarInitial: {
    fontSize: 13,
    fontWeight: '700',
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
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text,
    letterSpacing: 0.3,
  },
  streakSmall: {
    fontSize: 10,
    color: theme.colors.secondary,
  },
  newcomerBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  newcomerBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  scoreLabel: {
    fontSize: 13,
    fontWeight: theme.typography.fontWeight.semibold,
    fontFamily: theme.typography.fontFamily.monospace,
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
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    width: 50,
    fontFamily: theme.typography.fontFamily.monospace,
  },
  stickyFooterName: {
    flex: 1,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text,
    letterSpacing: 0.3,
  },
  resetNote: {
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
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
    letterSpacing: 0.3,
  },
  sponsorLabel: {
    fontSize: 11,
    fontWeight: '600',
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
    fontSize: 14,
    fontWeight: '800',
    fontFamily: theme.typography.fontFamily.monospace,
  },
});
