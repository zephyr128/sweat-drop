import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThrottledRouter } from '@/hooks/useThrottledRouter';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { useBranding } from '@/lib/contexts/ThemeContext';
import { getNumberStyle, fontStyles, hexToRgba } from '@/lib/theme';
import { useTranslation } from 'react-i18next';
import { log } from '@/lib/logger';

export type LeaderboardPeriod = 'weekly' | 'monthly' | 'all_time';

interface LeaderboardEntry {
  user_id: string;
  username: string;
  drops: number;
  score_label?: string;
}

interface LeaderboardPreviewProps {
  gymId: string | null;
  isUnlocked: boolean;
  activePeriod?: LeaderboardPeriod;
  onPeriodChange?: (period: LeaderboardPeriod) => void;
  onCurrentUserRankChange?: (data: {
    rank: number;
    totalMembers: number;
    period: LeaderboardPeriod;
  }) => void;
}

const RANK_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32'] as const;
const PERIODS: LeaderboardPeriod[] = ['weekly', 'monthly', 'all_time'];

export const LeaderboardPreview: React.FC<LeaderboardPreviewProps> = React.memo(function LeaderboardPreview({
  gymId,
  isUnlocked,
  activePeriod: controlledPeriod,
  onPeriodChange,
  onCurrentUserRankChange,
}) {
  const router = useThrottledRouter();
  const { session } = useSession();
  const branding = useBranding();
  const { t } = useTranslation('home');
  const [topUsers, setTopUsers] = useState<LeaderboardEntry[]>([]);
  const [currentUserRank, setCurrentUserRank] = useState<number | null>(null);
  const [currentUserEntry, setCurrentUserEntry] = useState<LeaderboardEntry | null>(null);
  const [internalPeriod, setInternalPeriod] = useState<LeaderboardPeriod>('weekly');
  const [loading, setLoading] = useState(true);
  const activePeriod = controlledPeriod ?? internalPeriod;
  const onCurrentUserRankChangeRef = useRef(onCurrentUserRankChange);

  useEffect(() => {
    onCurrentUserRankChangeRef.current = onCurrentUserRankChange;
  }, [onCurrentUserRankChange]);

  const fetchPeriod = useCallback(async (period: string): Promise<LeaderboardEntry[]> => {
    if (!gymId) return [];

    const { data, error } = await supabase.rpc('get_leaderboard', {
      p_type: 'gym',
      p_scope_id: gymId,
      p_period: period,
      p_limit: 50,
      p_newcomer_only: false,
    });

    if (error) {
      const { data: fallbackData, error: fallbackErr } = await supabase.rpc('get_local_leaderboard', {
        p_gym_id: gymId,
        p_period: period,
        p_limit: 50,
        p_newcomer_only: false,
      });

      if (!fallbackErr && fallbackData) {
        return (fallbackData as any[]).map((entry) => ({
          user_id: entry.user_id,
          username: entry.username || 'Unknown',
          drops: entry.drops || entry.score || 0,
          score_label: entry.score_label,
        }));
      }

      if (period === 'all_time') {
        const { data: directData } = await supabase
          .from('gym_memberships')
          .select('user_id, local_drops_balance, profiles:user_id(username)')
          .eq('gym_id', gymId)
          .order('local_drops_balance', { ascending: false })
          .limit(50);

        if (directData) {
          return directData
            .map((entry: any) => ({
              user_id: entry.user_id,
              username: entry.profiles?.username || 'Unknown',
              drops: entry.local_drops_balance || 0,
            }))
            .sort((a, b) => b.drops - a.drops);
        }
      }

      return [];
    }

    if (data) {
      return (data as any[]).map((entry) => ({
        user_id: entry.user_id,
        username: entry.username || 'Unknown',
        drops: entry.score || 0,
        score_label: entry.score_label,
      }));
    }

    return [];
  }, [gymId]);

  const loadLeaderboard = useCallback(async () => {
    if (!session?.user || !gymId) {
      onCurrentUserRankChangeRef.current?.({ rank: 0, totalMembers: 0, period: activePeriod });
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const entries = await fetchPeriod(activePeriod);

      setTopUsers(entries.slice(0, 3));

      const userIndex = entries.findIndex((e) => e.user_id === session.user.id);
      if (userIndex !== -1) {
        setCurrentUserRank(userIndex + 1);
        onCurrentUserRankChangeRef.current?.({
          rank: userIndex + 1,
          totalMembers: entries.length,
          period: activePeriod,
        });
        if (userIndex >= 3) {
          setCurrentUserEntry(entries[userIndex]);
        } else {
          setCurrentUserEntry(null);
        }
      } else {
        setCurrentUserRank(null);
        setCurrentUserEntry(null);
        onCurrentUserRankChangeRef.current?.({
          rank: 0,
          totalMembers: entries.length,
          period: activePeriod,
        });
      }
    } catch (err) {
      log.error('[LeaderboardPreview] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id, gymId, fetchPeriod, activePeriod]);

  useEffect(() => {
    loadLeaderboard();
  }, [loadLeaderboard]);

  const periodLabels: Record<LeaderboardPeriod, string> = {
    weekly: t('weeklyPeriod'),
    monthly: t('monthlyPeriod'),
    all_time: t('allTimePeriod'),
  };
  const handlePeriodPress = (period: LeaderboardPeriod) => {
    if (controlledPeriod == null) {
      setInternalPeriod(period);
    }
    onPeriodChange?.(period);
  };

  const isCurrentUser = (userId: string) => userId === session?.user?.id;

  if (loading) {
    return (
      <View style={styles.card}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.row, i < 2 && styles.rowBorder]}>
            <View style={[styles.rankBadge, { backgroundColor: 'rgba(255,255,255,0.04)' }]} />
            <View style={styles.userInfo}>
              <View style={{ width: 80, height: 12, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.06)' }} />
            </View>
            <View style={{ width: 50, height: 12, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.04)' }} />
          </View>
        ))}
      </View>
    );
  }

  if (topUsers.length === 0) {
    return (
      <View style={styles.emptyCard}>
        <Ionicons name="podium-outline" size={24} color="rgba(255,255,255,0.15)" />
        <Text style={styles.emptyText}>{t('noLeaderboardData')}</Text>
      </View>
    );
  }

  return (
    <View>
      {/* Period switcher + View All */}
      <View style={styles.headerRow}>
        <View style={styles.periodSwitcher}>
          {PERIODS.map((p) => (
            <TouchableOpacity
              key={p}
              style={[
                styles.periodPill,
                activePeriod === p && { backgroundColor: hexToRgba(branding.primary, 0.18), borderColor: hexToRgba(branding.primary, 0.4) },
              ]}
              onPress={() => handlePeriodPress(p)}
              activeOpacity={0.75}
            >
              <Text style={[
                styles.periodPillText,
                { color: activePeriod === p ? branding.primary : 'rgba(255,255,255,0.4)' },
              ]}>
                {periodLabels[p]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity
          onPress={() => { if (isUnlocked) router.push('/leaderboard'); }}
          activeOpacity={0.7}
          disabled={!isUnlocked}
        >
          <Text style={[styles.viewAllLink, { color: branding.primary }]}>{t('viewAll')}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.card}
        onPress={() => { if (isUnlocked) router.push('/leaderboard'); }}
        activeOpacity={isUnlocked ? 0.8 : 1}
        disabled={!isUnlocked}
      >
        {topUsers.map((entry, index) => {
          const isMe = isCurrentUser(entry.user_id);
          const rankColor = RANK_COLORS[index] ?? 'rgba(255,255,255,0.3)';
          const initial = (entry.username[0] ?? 'U').toUpperCase();

          return (
            <View
              key={entry.user_id}
              style={[
                styles.row,
                isMe && { backgroundColor: hexToRgba(branding.primary, 0.08) },
                index < topUsers.length - 1 && styles.rowBorder,
              ]}
            >
              <View style={[styles.rankBadge, { backgroundColor: hexToRgba(rankColor, 0.15) }]}>
                <Text style={[styles.rankBadgeText, { color: rankColor }]}>{index + 1}</Text>
              </View>

              <View style={styles.avatarCircle}>
                <Text style={[styles.avatarInitial, isMe && { color: branding.primary }]}>{initial}</Text>
              </View>

              <View style={styles.userInfo}>
                <Text style={[styles.username, isMe && { color: branding.primary }]} numberOfLines={1}>
                  {entry.username}{isMe ? ' (You)' : ''}
                </Text>
              </View>

              <View style={styles.scoreContainer}>
                <Ionicons name="water" size={12} color={isMe ? branding.primary : 'rgba(255,255,255,0.35)'} />
                <Text style={[styles.scoreText, getNumberStyle(13), isMe ? { color: branding.primary } : { color: 'rgba(255,255,255,0.7)' }]}>
                  {entry.drops.toLocaleString()}
                </Text>
              </View>
            </View>
          );
        })}

        {/* Current user if outside top 3 */}
        {currentUserRank != null && currentUserRank > 3 && currentUserEntry && (
          <>
            <View style={styles.separatorDots}>
              <View style={styles.dotLine} />
              <Text style={styles.separatorEllipsis}>···</Text>
              <View style={styles.dotLine} />
            </View>
            <View style={[styles.row, { backgroundColor: hexToRgba(branding.primary, 0.1) }]}>
              <View style={[styles.rankBadge, { backgroundColor: hexToRgba(branding.primary, 0.15) }]}>
                <Text style={[styles.rankBadgeText, { color: branding.primary }]}>{currentUserRank}</Text>
              </View>
              <View style={styles.avatarCircle}>
                <Text style={[styles.avatarInitial, { color: branding.primary }]}>
                  {(currentUserEntry.username[0] ?? 'U').toUpperCase()}
                </Text>
              </View>
              <View style={styles.userInfo}>
                <Text style={[styles.username, { color: branding.primary }]} numberOfLines={1}>
                  {currentUserEntry.username} (You)
                </Text>
              </View>
              <View style={styles.scoreContainer}>
                <Ionicons name="water" size={12} color={branding.primary} />
                <Text style={[styles.scoreText, getNumberStyle(13), { color: branding.primary }]}>
                  {currentUserEntry.drops.toLocaleString()}
                </Text>
              </View>
            </View>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
});

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  periodSwitcher: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
  },
  periodPill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  periodPillText: {
    ...fontStyles.bodySemiBold,
    fontSize: 11,
    letterSpacing: 0.2,
  },
  viewAllLink: {
    ...fontStyles.bodySemiBold,
    fontSize: 13,
    letterSpacing: 0.3,
  },
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(12,12,22,0.85)',
    borderWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.10)',
    borderLeftColor: 'rgba(255,255,255,0.06)',
    borderRightColor: 'rgba(255,255,255,0.04)',
    borderBottomColor: 'rgba(255,255,255,0.03)',
  },
  emptyCard: {
    borderRadius: 16,
    backgroundColor: 'rgba(12,12,22,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    ...fontStyles.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankBadgeText: {
    ...fontStyles.heading,
    fontSize: 13,
  },
  avatarCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    ...fontStyles.heading,
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },
  userInfo: {
    flex: 1,
    minWidth: 0,
  },
  username: {
    ...fontStyles.bodySemiBold,
    fontSize: 14,
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  scoreText: {
    letterSpacing: 0.3,
  },
  separatorDots: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 4,
    gap: 6,
  },
  dotLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  separatorEllipsis: {
    ...fontStyles.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.25)',
    letterSpacing: 3,
  },
});
