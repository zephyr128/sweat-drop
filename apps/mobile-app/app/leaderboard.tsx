import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { theme, getNumberStyle } from '@/lib/theme';
import BackButton from '@/components/BackButton';
import { useGymStore } from '@/lib/stores/useGymStore';

type Period = 'daily' | 'weekly' | 'monthly';
type LeaderboardType = 'local' | 'global';

export default function LeaderboardScreen() {
  const { session } = useSession();
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
      // Local leaderboard: ranked by local_drops_balance for the active gym
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

        // Find current user rank
        const userIndex = leaderboardData.findIndex((entry) => entry.user_id === session.user.id);
        if (userIndex !== -1) {
          setCurrentUserRank(userIndex + 1);
        } else {
          setCurrentUserRank(null);
        }
      }
    } else {
      // Global leaderboard: ranked by total_drops from profiles
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

        // Find current user rank
        const userIndex = leaderboardData.findIndex((entry) => entry.user_id === session.user.id);
        if (userIndex !== -1) {
          setCurrentUserRank(userIndex + 1);
        } else {
          setCurrentUserRank(null);
        }
      }
    }

    setLoading(false);
  };

  const getRankEmoji = (rank: number) => {
    if (rank === 0) return '🥇';
    if (rank === 1) return '🥈';
    if (rank === 2) return '🥉';
    return `${rank + 1}.`;
  };

  const isCurrentUser = (userId: string) => {
    return session?.user?.id === userId;
  };

  const currentUserEntry = leaderboard.find((entry) => isCurrentUser(entry.user_id));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Radial gradient background */}
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
        <View style={styles.filters}>
          {/* Local/Global Tabs */}
          <View style={styles.typeFilter}>
            {(['local', 'global'] as LeaderboardType[]).map((type) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.typeTab,
                  leaderboardType === type && styles.typeTabActive,
                ]}
                onPress={() => setLeaderboardType(type)}
              >
                <Text
                  style={[
                    styles.typeTabText,
                    leaderboardType === type && styles.typeTabTextActive,
                  ]}
                >
                  {type === 'local' ? 'Local' : 'Global'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Period Filter (only for historical data if needed) */}
          {leaderboardType === 'local' && (
            <View style={styles.periodFilter}>
              <Text style={styles.filterLabel}>Period:</Text>
              {(['daily', 'weekly', 'monthly'] as Period[]).map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.filterButton, period === p && styles.filterButtonActive]}
                  onPress={() => setPeriod(p)}
                >
                  <Text
                    style={[
                      styles.filterButtonText,
                      period === p && styles.filterButtonTextActive,
                    ]}
                  >
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        ) : leaderboard.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No data available</Text>
          </View>
        ) : (
          <>
            <View style={styles.leaderboard}>
              {leaderboard.slice(0, 100).map((entry, index) => (
                <View
                  key={entry.user_id}
                  style={[
                    styles.leaderboardItem,
                    isCurrentUser(entry.user_id) && styles.leaderboardItemCurrent,
                  ]}
                >
                  <Text style={styles.rank}>{getRankEmoji(index)}</Text>
                  <View style={styles.userInfo}>
                    <Text style={styles.username}>
                      {entry.username}
                      {isCurrentUser(entry.user_id) && ' (You)'}
                    </Text>
                  </View>
                  <View style={styles.dropsContainer}>
                    <Ionicons name="water" size={16} color={theme.colors.primary} />
                    <Text style={[styles.drops, getNumberStyle(16)]}>
                      {entry.drops}
                    </Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Sticky Footer - Current User Position */}
            {currentUserEntry && currentUserRank !== null && currentUserRank > 100 && (
              <View style={styles.stickyFooter}>
                <Text style={styles.stickyFooterText}>
                  Rank {currentUserRank} - {currentUserEntry.username} -{' '}
                  <Text style={[getNumberStyle(16)]}>{currentUserEntry.drops}</Text>{' '}
                  <Ionicons name="water" size={16} color={theme.colors.primary} />
                </Text>
              </View>
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
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  headerTitle: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    flex: 1,
    letterSpacing: 0.5,
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
  filters: {
    marginBottom: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  periodFilter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  typeFilter: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: theme.borderRadius.lg,
    padding: 4,
  },
  typeTab: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeTabActive: {
    backgroundColor: theme.colors.primary + '20',
    borderWidth: 1,
    borderColor: theme.colors.primary + '40',
  },
  typeTabText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textSecondary,
    letterSpacing: 0.5,
  },
  typeTabTextActive: {
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeight.bold,
  },
  filterLabel: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text,
    marginRight: theme.spacing.sm,
    letterSpacing: 0.3,
  },
  filterButton: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  filterButtonActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  filterButtonText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.fontWeight.medium,
    letterSpacing: 0.3,
  },
  filterButtonTextActive: {
    color: '#000000',
    fontWeight: theme.typography.fontWeight.semibold,
  },
  loadingContainer: {
    padding: theme.spacing['3xl'],
    alignItems: 'center',
  },
  emptyState: {
    padding: theme.spacing['3xl'],
    alignItems: 'center',
  },
  emptyText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
  },
  leaderboard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  leaderboardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  leaderboardItemCurrent: {
    backgroundColor: theme.colors.primary + '15',
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.primary,
  },
  rank: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    width: 40,
    fontFamily: theme.typography.fontFamily.monospace,
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
  drops: {
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  stickyFooter: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.xl,
    marginTop: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.primary + '50',
  },
  stickyFooterText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
});
