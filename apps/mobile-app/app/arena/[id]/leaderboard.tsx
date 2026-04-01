import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';
import { useSession } from '@/hooks/useSession';
import { theme, getNumberStyle, fontStyles, hexToRgba} from '@/lib/theme';
import ScreenHeader from '@/components/ScreenHeader';
import { useBranding } from '@/lib/contexts/ThemeContext';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

// ── Types ──
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

interface ArenaInfo {
  id: string;
  name: string;
  sponsor_name: string;
  sponsor_logo: string | null;
  is_finalized: boolean;
  prizes: Array<{ rank: number; prize: string; value?: string }>;
}
export default function ArenaLeaderboardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useSession();
  const branding = useBranding();
  const { t } = useTranslation('arena');

  const [arenaInfo, setArenaInfo] = useState<ArenaInfo | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserEntry, setCurrentUserEntry] = useState<LeaderboardEntry | null>(null);

  const loadData = useCallback(async () => {
    if (!session?.user || !id) return;
    setLoading(true);

    try {
      // Load arena info
      const { data: arenaData } = await supabase
        .from('sweat_arenas')
        .select('id, name, sponsor_name, sponsor_logo, is_finalized, prizes')
        .eq('id', id)
        .single();

      if (arenaData) {
        setArenaInfo(arenaData as ArenaInfo);
      }

      // Load full leaderboard
      const { data, error } = await supabase.rpc('get_leaderboard', {
        p_type: 'arena',
        p_scope_id: id,
        p_period: 'all_time',
        p_limit: 100,
        p_newcomer_only: false,
      });

      if (error) {
        log.error('Error loading arena leaderboard:', error);
        setLeaderboard([]);
      } else if (data) {
        const entries = data as LeaderboardEntry[];
        setLeaderboard(entries);

        const userEntry = entries.find((e) => e.user_id === session.user.id);
        setCurrentUserEntry(userEntry || null);
      }
    } catch (err) {
      log.error('Arena leaderboard error:', err);
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id, id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const isCurrentUser = (userId: string) => session?.user?.id === userId;

  const getPrizeForRank = (rank: number) =>
    arenaInfo?.prizes.find((p) => p.rank === rank);

  const getRankDisplay = (rank: number) => {
    if (rank === 1) return { emoji: '🥇', isTop: true };
    if (rank === 2) return { emoji: '🥈', isTop: true };
    if (rank === 3) return { emoji: '🥉', isTop: true };
    return { emoji: `${rank}`, isTop: false };
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient
        colors={['#000000', '#0A0E1A', '#000000']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <ScreenHeader title={arenaInfo?.name || t('arenaLeaderboard')} insetHandled />

      {/* Sponsor banner */}
      {arenaInfo && (
        <Animated.View entering={FadeInDown.delay(50).duration(300)}>
          <View style={styles.sponsorBanner}>
            {arenaInfo.sponsor_logo ? (
              <Image source={arenaInfo.sponsor_logo} style={styles.sponsorLogo} contentFit="contain" transition={200} />
            ) : (
              <Ionicons name="trophy" size={16} color={branding.primary} />
            )}
            <Text style={[styles.sponsorText, { color: branding.primary }]}>
              {t('sponsoredBy', { name: arenaInfo.sponsor_name })}
            </Text>
            {arenaInfo.is_finalized && (
              <View style={[styles.finalizedBadge, { backgroundColor: hexToRgba(branding.primary, 0.15) }]}>
                <Text style={[styles.finalizedText, { color: branding.primary }]}>{t('ended')}</Text>
              </View>
            )}
          </View>
        </Animated.View>
      )}

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={branding.primary} />
          </View>
        ) : leaderboard.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="trophy-outline" size={64} color={theme.colors.textSecondary} />
            <Text style={styles.emptyText}>{t('noParticipants')}</Text>
          </View>
        ) : (
          <>
            {/* Top 3 Podium */}
            {leaderboard.length >= 3 && (
              <Animated.View entering={FadeInDown.delay(100).duration(500)}>
                <View style={styles.podium}>
                  {[1, 0, 2].map((podiumIdx) => {
                    const entry = leaderboard[podiumIdx];
                    if (!entry) return null;
                    const isFirst = podiumIdx === 0;
                    const prize = getPrizeForRank(entry.rank);
                    return (
                      <View key={entry.user_id} style={[styles.podiumItem, isFirst && styles.podiumItemFirst]}>
                        <View
                          style={[
                            styles.podiumAvatar,
                            isFirst && { borderColor: branding.primary, borderWidth: 2 },
                            isCurrentUser(entry.user_id) && { backgroundColor: hexToRgba(branding.primary, 0.15) },
                          ]}
                        >
                          {entry.avatar_url && entry.avatar_url.startsWith('http') ? (
                            <Image source={entry.avatar_url} style={styles.podiumAvatarImg} transition={200} />
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
                        <Text style={[styles.podiumName, isCurrentUser(entry.user_id) && { color: branding.primary }]} numberOfLines={1}>
                          {entry.username}
                        </Text>
                        {/* gym_name hidden for arena leaderboards — arenas are cross-gym */}
                        <Text style={[styles.podiumScore, { color: branding.primary }]} numberOfLines={1}>
                          {entry.score_label}
                        </Text>
                        {prize && (
                          <Text style={[styles.podiumPrize, { color: theme.colors.secondary }]} numberOfLines={1}>
                            {prize.prize}
                          </Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              </Animated.View>
            )}

            {/* Full List */}
            <Animated.View entering={FadeInDown.delay(250).duration(400)}>
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
                          <Text style={[styles.rankText, rank.isTop && styles.rankTextTop, getNumberStyle(rank.isTop ? 18 : 14)]}>
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
                          <Text style={[styles.listUsername, isCurrent && { color: branding.primary }]}>
                            {entry.username}{isCurrent ? t('youSuffix') : ''}
                          </Text>
                        </View>

                        <Text style={[styles.scoreLabel, { color: isCurrent ? branding.primary : theme.colors.textSecondary }]}>
                          {entry.score_label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </BlurView>
              </View>
            </Animated.View>

            {/* Sticky footer if current user not in top 50 */}
            {currentUserEntry && currentUserEntry.rank > 50 && (
              <Animated.View entering={FadeInDown.delay(350).duration(400)}>
                <View style={[styles.stickyFooter, { borderColor: hexToRgba(branding.primary, 0.3) }]}>
                  <BlurView intensity={50} tint="dark" style={[styles.stickyFooterBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
                    <Text style={[styles.stickyRank, { color: branding.primary }]}>#{currentUserEntry.rank}</Text>
                    <Text style={styles.stickyName}>{currentUserEntry.username}</Text>
                    <Text style={[styles.scoreLabel, { color: branding.primary }]}>{currentUserEntry.score_label}</Text>
                  </BlurView>
                </View>
              </Animated.View>
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
  sponsorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
  },
  sponsorLogo: {
    width: 20,
    height: 20,
    borderRadius: 5,
  },
  sponsorText: {
    ...fontStyles.bodySemiBold,
    fontSize: 12,
    letterSpacing: 0.3,
  },
  finalizedBadge: {
    marginLeft: 'auto',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  finalizedText: {
    ...fontStyles.heading,
    fontSize: 12,
    letterSpacing: 0.5,
  },
  scrollView: { flex: 1 },
  scrollContent: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing['3xl'],
  },
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

  /* Podium */
  podium: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  podiumItem: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingTop: theme.spacing.lg,
  },
  podiumItemFirst: { paddingTop: 0 },
  podiumAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
  },
  podiumAvatarImg: {
    width: '100%',
    height: '100%',
    borderRadius: 25,
  },
  podiumEmoji: { fontSize: 20 },
  podiumEmojiFirst: { fontSize: 26 },
  podiumName: {
    ...fontStyles.bodySemiBold,
    fontSize: 12,
    color: theme.colors.text,
    textAlign: 'center',
    maxWidth: 80,
  },
  podiumGym: {
    fontSize: 9,
    color: theme.colors.textTertiary,
    textAlign: 'center',
    maxWidth: 80,
  },
  podiumScore: {
    ...fontStyles.number,
    fontSize: 12,
  },
  podiumPrize: {
    ...fontStyles.bodySemiBold,
    fontSize: 9,
    textAlign: 'center',
    maxWidth: 80,
    marginTop: 1,
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
    paddingVertical: 12,
    paddingHorizontal: 16,
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
  rankTextTop: { fontSize: 18 },
  listAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    marginLeft: 6,
  },
  listAvatarPlaceholder: {
    width: 30,
    height: 30,
    borderRadius: 15,
    marginLeft: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  listAvatarEmoji: {
    fontSize: 16,
  },
  listAvatarInitial: {
    ...fontStyles.heading,
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  userInfo: {
    flex: 1,
    marginLeft: 8,
  },
  listUsername: {
    ...fontStyles.bodySemiBold,
    fontSize: 14,
    color: theme.colors.text,
    letterSpacing: 0.2,
  },
  listGymName: {
    fontSize: 10,
    color: theme.colors.textTertiary,
    marginTop: 1,
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
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
  },
  stickyRank: {
    ...fontStyles.number,
    fontSize: 16,
    width: 50,
  },
  stickyName: {
    ...fontStyles.bodySemiBold,
    flex: 1,
    fontSize: 15,
    color: theme.colors.text,
  },
});
