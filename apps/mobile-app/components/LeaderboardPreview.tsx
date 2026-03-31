import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { PressableCard } from '@/components/PressableCard';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { useBranding } from '@/lib/contexts/ThemeContext';
import { theme, getNumberStyle, fontStyles, hexToRgba } from '@/lib/theme';
import { useTranslation } from 'react-i18next';
import { log } from '@/lib/logger';

interface LeaderboardEntry {
  user_id: string;
  username: string;
  drops: number;
  score_label?: string;
}

interface LeaderboardPreviewProps {
  gymId: string | null;
  isUnlocked: boolean;
}

const RANK_ICONS = ['🥇', '🥈', '🥉'];
const SHIMMER: [string, string] = ['rgba(255,255,255,0.14)', 'rgba(255,255,255,0.01)'];

export const LeaderboardPreview: React.FC<LeaderboardPreviewProps> = ({ gymId, isUnlocked }) => {
  const router = useRouter();
  const { session } = useSession();
  const branding = useBranding();
  const { t } = useTranslation('home');
  const [topUsers, setTopUsers] = useState<LeaderboardEntry[]>([]);
  const [currentUserRank, setCurrentUserRank] = useState<number | null>(null);
  const [currentUserEntry, setCurrentUserEntry] = useState<LeaderboardEntry | null>(null);
  const [activePeriod, setActivePeriod] = useState<string>('weekly');
  const [loading, setLoading] = useState(true);
  const [hasPrizes, setHasPrizes] = useState(false);

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
      setLoading(false);
      return;
    }

    try {
      const periods = ['weekly', 'monthly', 'all_time'] as const;
      let entries: LeaderboardEntry[] = [];
      let usedPeriod = 'weekly';

      for (const period of periods) {
        entries = await fetchPeriod(period);
        if (entries.length > 0) {
          usedPeriod = period;
          break;
        }
      }

      setActivePeriod(usedPeriod);
      setTopUsers(entries.slice(0, 3));

      const userIndex = entries.findIndex((e) => e.user_id === session.user.id);
      if (userIndex !== -1) {
        setCurrentUserRank(userIndex + 1);
        if (userIndex >= 3) {
          setCurrentUserEntry(entries[userIndex]);
        }
      }

      // Check if gym has active prizes
      if (gymId) {
        const { count } = await supabase
          .from('leaderboard_rewards')
          .select('*', { count: 'exact', head: true })
          .eq('gym_id', gymId)
          .eq('is_active', true);
        setHasPrizes(!!count && count > 0);
      }
    } catch (err) {
      log.error('[LeaderboardPreview] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id, gymId, fetchPeriod]);

  useEffect(() => {
    loadLeaderboard();
  }, [loadLeaderboard]);

  // Show loading state or empty state, but don't hide completely
  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('leaderboard')}</Text>
        </View>
        <View style={styles.card}>
          <BlurView intensity={50} tint="dark" style={styles.blurContainer}>
            <LinearGradient colors={SHIMMER} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <View style={styles.row}>
              <Text style={[styles.username, { color: theme.colors.textSecondary }]}>Loading...</Text>
            </View>
          </BlurView>
        </View>
      </View>
    );
  }

  if (topUsers.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('leaderboard')}</Text>
        </View>
        <View style={styles.card}>
          <BlurView intensity={50} tint="dark" style={styles.blurContainer}>
            <LinearGradient colors={SHIMMER} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <View style={styles.row}>
              <Text style={[styles.username, { color: theme.colors.textSecondary }]}>{t('noLeaderboardData')}</Text>
            </View>
          </BlurView>
        </View>
      </View>
    );
  }

  const periodLabel = activePeriod === 'weekly'
    ? t('weeklyPeriod')
    : activePeriod === 'monthly'
      ? t('monthlyPeriod')
      : t('allTimePeriod');

  const isCurrentUser = (userId: string) => userId === session?.user?.id;

  return (
    <View style={styles.container}>
      {/* Section Header */}
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderLeft}>
          <Text style={styles.sectionTitle}>{t('leaderboard')}</Text>
          {activePeriod !== 'weekly' && (
            <View style={[styles.periodBadge, { backgroundColor: hexToRgba(branding.primary, 0.1) }]}>
              <Text style={[styles.periodBadgeText, { color: branding.primary }]}>{periodLabel}</Text>
            </View>
          )}
        </View>
        <TouchableOpacity
          onPress={() => {
            if (!isUnlocked) return;
            router.push('/leaderboard');
          }}
          activeOpacity={0.7}
          disabled={!isUnlocked}
        >
          <Text style={[styles.viewAllLink, { color: branding.primary }]}>{t('viewAll')}</Text>
        </TouchableOpacity>
      </View>

      {/* Leaderboard Card */}
      <PressableCard
        style={styles.card}
        onPress={() => { if (isUnlocked) router.push('/leaderboard'); }}
        disabled={!isUnlocked}
      >
        <BlurView intensity={50} tint="dark" style={styles.blurContainer}>
          <LinearGradient colors={SHIMMER} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          {topUsers.map((entry, index) => {
            const isMe = isCurrentUser(entry.user_id);
            return (
              <View
                key={entry.user_id}
                style={[
                  styles.row,
                  isMe && { backgroundColor: hexToRgba(branding.primary, 0.12) },
                  index < topUsers.length - 1 && styles.rowBorder,
                ]}
              >
                {/* Rank */}
                <Text style={styles.rankEmoji}>{RANK_ICONS[index]}</Text>

                {/* Username */}
                <View style={styles.userInfo}>
                  <Text
                    style={[
                      styles.username,
                      isMe && { color: branding.primary },
                    ]}
                    numberOfLines={1}
                  >
                    {entry.username}
                    {isMe && ' (You)'}
                  </Text>
                </View>

                {/* Drops */}
                <View style={styles.dropsContainer}>
                  <Ionicons name="water" size={14} color={branding.primary} />
                  <Text style={[styles.dropsText, getNumberStyle(14), { color: branding.primary }]}>
                    {entry.drops.toLocaleString()}
                  </Text>
                </View>
              </View>
            );
          })}

          {/* Current user row if not in top 3 */}
          {currentUserRank && currentUserRank > 3 && currentUserEntry && (
            <>
              <View style={styles.separatorDots}>
                <Text style={styles.dotsText}>• • •</Text>
              </View>
              <View
                style={[
                  styles.row,
                  { backgroundColor: hexToRgba(branding.primary, 0.12) },
                ]}
              >
                <Text style={[styles.rankNumber, { color: branding.primary }]}>
                  #{currentUserRank}
                </Text>
                <View style={styles.userInfo}>
                  <Text style={[styles.username, { color: branding.primary }]} numberOfLines={1}>
                    {currentUserEntry.username} (You)
                  </Text>
                </View>
                <View style={styles.dropsContainer}>
                  <Ionicons name="water" size={14} color={branding.primary} />
                  <Text style={[styles.dropsText, getNumberStyle(14), { color: branding.primary }]}>
                    {currentUserEntry.drops.toLocaleString()}
                  </Text>
                </View>
              </View>
            </>
          )}
        </BlurView>
      </PressableCard>

      {/* Prize hint */}
      {hasPrizes && (
        <View style={styles.prizeHint}>
          <Text style={[styles.prizeHintText, { color: branding.primary }]}>
            🏆 {t('winPrizesThisWeek')}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  periodBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  periodBadgeText: {
    ...fontStyles.bodySemiBold,
    fontSize: 11,
    letterSpacing: 0.3,
  },
  sectionTitle: {
    ...fontStyles.heading,
    fontSize: 22,
    color: '#FFFFFF',
  },
  viewAllLink: {
    ...fontStyles.bodySemiBold,
    fontSize: 13,
    letterSpacing: 0.3,
  },
  card: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.22)',
    borderLeftColor: 'rgba(255,255,255,0.10)',
    borderRightColor: 'rgba(255,255,255,0.06)',
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  blurContainer: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(12, 12, 22, 0.38)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  rankEmoji: {
    fontSize: 20,
    width: 32,
    textAlign: 'center',
  },
  rankNumber: {
    ...fontStyles.number,
    fontSize: 14,
    width: 32,
    textAlign: 'center',
  },
  userInfo: {
    flex: 1,
    minWidth: 0,
  },
  username: {
    ...fontStyles.bodySemiBold,
    fontSize: 15,
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  dropsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dropsText: {
    letterSpacing: 0.3,
  },
  separatorDots: {
    paddingVertical: 4,
    alignItems: 'center',
  },
  dotsText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.3)',
    letterSpacing: 4,
  },
  prizeHint: {
    marginTop: 8,
    alignItems: 'center',
  },
  prizeHintText: {
    ...fontStyles.bodySemiBold,
    fontSize: 12,
    letterSpacing: 0.3,
  },
});
