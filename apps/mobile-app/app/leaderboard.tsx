import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
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

function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(0, 229, 255, ${alpha})`;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

type Period = 'daily' | 'weekly' | 'monthly';
type LeaderboardType = 'local' | 'global';

export default function LeaderboardScreen() {
  const { session } = useSession();
  const branding = useBranding();
  const { getActiveGymId } = useGymStore();
  const activeGymId = getActiveGymId();
  const [period, setPeriod] = useState<Period>('daily');
  const [leaderboardType, setLeaderboardType] = useState<LeaderboardType>('local');
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentUserRank, setCurrentUserRank] = useState<number | null>(null);

  useEffect(() => {
    if (session?.user) {
      loadLeaderboard();
    }
  }, [session, period, leaderboardType, activeGymId]);

  const loadLeaderboard = async () => {
    if (!session?.user) return;

    setLoading(true);

    if (leaderboardType === 'local') {
      if (!activeGymId) {
        setLeaderboard([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('gym_memberships')
        .select('user_id, local_drops_balance, profiles:user_id(username)')
        .eq('gym_id', activeGymId)
        .order('local_drops_balance', { ascending: false })
        .limit(100);

      if (error) {
        console.error('Error loading local leaderboard:', error);
        setLeaderboard([]);
      } else if (data) {
        const leaderboardData = data
          .map((entry: any) => ({
            user_id: entry.user_id,
            username: entry.profiles?.username || 'Unknown',
            drops: entry.local_drops_balance || 0,
          }))
          .sort((a, b) => b.drops - a.drops);

        setLeaderboard(leaderboardData);

        const userIndex = leaderboardData.findIndex((entry) => entry.user_id === session.user.id);
        setCurrentUserRank(userIndex !== -1 ? userIndex + 1 : null);
      }
    } else {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, total_drops')
        .order('total_drops', { ascending: false })
        .limit(100);

      if (error) {
        console.error('Error loading global leaderboard:', error);
        setLeaderboard([]);
      } else if (data) {
        const leaderboardData = data.map((profile: any) => ({
          user_id: profile.id,
          username: profile.username || 'Unknown',
          drops: profile.total_drops || 0,
        }));

        setLeaderboard(leaderboardData);

        const userIndex = leaderboardData.findIndex((entry) => entry.user_id === session.user.id);
        setCurrentUserRank(userIndex !== -1 ? userIndex + 1 : null);
      }
    }

    setLoading(false);
  };

  const getRankDisplay = (rank: number) => {
    if (rank === 0) return { emoji: '🥇', isTop: true };
    if (rank === 1) return { emoji: '🥈', isTop: true };
    if (rank === 2) return { emoji: '🥉', isTop: true };
    return { emoji: `${rank + 1}`, isTop: false };
  };

  const isCurrentUser = (userId: string) => session?.user?.id === userId;

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
        {/* Type Toggle */}
        <Animated.View entering={FadeInDown.delay(100).duration(400)}>
          <View style={[styles.typeToggle, { borderColor: hexToRgba(branding.primary, 0.15) }]}>
            <BlurView intensity={50} tint="dark" style={[styles.typeToggleBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
              {(['local', 'global'] as LeaderboardType[]).map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.typeTab,
                    leaderboardType === type && {
                      backgroundColor: hexToRgba(branding.primary, 0.15),
                      borderColor: hexToRgba(branding.primary, 0.3),
                      borderWidth: 1,
                    },
                  ]}
                  onPress={() => setLeaderboardType(type)}
                >
                  <Ionicons
                    name={type === 'local' ? 'location' : 'globe-outline'}
                    size={16}
                    color={leaderboardType === type ? branding.primary : theme.colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.typeTabText,
                      leaderboardType === type && { color: branding.primary, fontWeight: theme.typography.fontWeight.bold },
                    ]}
                  >
                    {type === 'local' ? 'Local Gym' : 'Global'}
                  </Text>
                </TouchableOpacity>
              ))}
            </BlurView>
          </View>
        </Animated.View>

        {/* Period Filter */}
        {leaderboardType === 'local' && (
          <Animated.View entering={FadeInDown.delay(200).duration(400)}>
            <View style={styles.periodFilter}>
              {(['daily', 'weekly', 'monthly'] as Period[]).map((p) => (
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
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>
        )}

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={branding.primary} />
          </View>
        ) : leaderboard.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="trophy-outline" size={64} color={theme.colors.textSecondary} />
            <Text style={styles.emptyText}>No data available</Text>
            <Text style={styles.emptySubtext}>
              {leaderboardType === 'local' ? 'Start working out to earn drops!' : 'Be the first on the board!'}
            </Text>
          </View>
        ) : (
          <>
            {/* Top 3 Podium */}
            {leaderboard.length >= 3 && (
              <Animated.View entering={FadeInDown.delay(250).duration(500)}>
                <View style={styles.podium}>
                  {[1, 0, 2].map((podiumIndex) => {
                    const entry = leaderboard[podiumIndex];
                    if (!entry) return null;
                    const isFirst = podiumIndex === 0;
                    return (
                      <View
                        key={entry.user_id}
                        style={[styles.podiumItem, isFirst && styles.podiumItemFirst]}
                      >
                        <View
                          style={[
                            styles.podiumAvatar,
                            isFirst && { borderColor: branding.primary, borderWidth: 2 },
                            isCurrentUser(entry.user_id) && {
                              backgroundColor: hexToRgba(branding.primary, 0.15),
                            },
                          ]}
                        >
                          <Text style={[styles.podiumEmoji, isFirst && styles.podiumEmojiFirst]}>
                            {getRankDisplay(podiumIndex).emoji}
                          </Text>
                        </View>
                        <Text
                          style={[
                            styles.podiumName,
                            isCurrentUser(entry.user_id) && { color: branding.primary },
                          ]}
                          numberOfLines={1}
                        >
                          {entry.username}
                        </Text>
                        <View style={styles.podiumDrops}>
                          <Ionicons name="water" size={14} color={branding.primary} />
                          <Text style={[styles.podiumDropsText, getNumberStyle(14), { color: branding.primary }]}>
                            {entry.drops}
                          </Text>
                        </View>
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
                    const rank = getRankDisplay(index);
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
                        <View style={styles.userInfo}>
                          <Text style={[styles.username, isCurrent && { color: branding.primary }]}>
                            {entry.username}
                            {isCurrent && ' (You)'}
                          </Text>
                        </View>
                        <View style={styles.dropsContainer}>
                          <Ionicons name="water" size={16} color={isCurrent ? branding.primary : theme.colors.textSecondary} />
                          <Text style={[
                            styles.dropsText,
                            getNumberStyle(16),
                            { color: isCurrent ? branding.primary : theme.colors.textSecondary },
                          ]}>
                            {entry.drops}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </BlurView>
              </View>
            </Animated.View>

            {/* Sticky footer for user outside top 100 */}
            {currentUserEntry && currentUserRank !== null && currentUserRank > 100 && (
              <Animated.View entering={FadeInDown.delay(500).duration(400)}>
                <View style={[styles.stickyFooter, { borderColor: hexToRgba(branding.primary, 0.3) }]}>
                  <BlurView intensity={50} tint="dark" style={[styles.stickyFooterBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
                    <Text style={styles.stickyFooterRank}>#{currentUserRank}</Text>
                    <Text style={styles.stickyFooterName}>{currentUserEntry.username}</Text>
                    <View style={styles.dropsContainer}>
                      <Ionicons name="water" size={16} color={branding.primary} />
                      <Text style={[styles.dropsText, getNumberStyle(16), { color: branding.primary }]}>
                        {currentUserEntry.drops}
                      </Text>
                    </View>
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
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.sm + 2,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  typeTabText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textSecondary,
    letterSpacing: 0.5,
  },
  /* Period Filter */
  periodFilter: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
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
    gap: theme.spacing.xs,
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
  },
  podiumEmoji: {
    fontSize: 22,
  },
  podiumEmojiFirst: {
    fontSize: 28,
  },
  podiumName: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text,
    letterSpacing: 0.3,
    textAlign: 'center',
    maxWidth: 80,
  },
  podiumDrops: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  podiumDropsText: {
    fontWeight: theme.typography.fontWeight.semibold,
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
    width: 36,
    alignItems: 'center',
  },
  rankText: {
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textSecondary,
  },
  rankTextTop: {
    fontSize: 20,
  },
  userInfo: {
    flex: 1,
    marginLeft: theme.spacing.md,
  },
  username: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text,
    letterSpacing: 0.3,
  },
  dropsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  dropsText: {
    fontWeight: theme.typography.fontWeight.semibold,
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
});
