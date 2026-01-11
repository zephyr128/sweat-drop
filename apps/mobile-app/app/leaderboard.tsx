import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { theme, getNumberStyle } from '@/lib/theme';
import BackButton from '@/components/BackButton';

type Period = 'daily' | 'weekly' | 'monthly';
type Scope = 'gym' | 'city' | 'country';

export default function LeaderboardScreen() {
  const { session } = useSession();
  const [period, setPeriod] = useState<Period>('daily');
  const [scope, setScope] = useState<Scope>('gym');
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentUserRank, setCurrentUserRank] = useState<number | null>(null);

  useEffect(() => {
    if (session?.user) {
      loadLeaderboard();
    }
  }, [session, period, scope]);

  const loadLeaderboard = async () => {
    if (!session?.user) return;

    setLoading(true);

    const { data: profileData } = await supabase
      .from('profiles')
      .select('home_gym_id, gym:home_gym_id(city, country)')
      .eq('id', session.user.id)
      .single();

    const gymId = profileData?.home_gym_id;

    const now = new Date();
    let startDate = new Date();

    switch (period) {
      case 'daily':
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'weekly':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'monthly':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
    }

    let query = supabase
      .from('sessions')
      .select('user_id, drops_earned, profiles:user_id(username)')
      .gte('started_at', startDate.toISOString())
      .not('drops_earned', 'is', null);

    if (scope === 'gym' && gymId) {
      query = query.eq('gym_id', gymId);
    }

    const { data } = await query;

    if (data) {
      const userMap: Record<string, { username: string; drops: number }> = {};

      data.forEach((session: any) => {
        const userId = session.user_id;
        const username = session.profiles?.username || 'Unknown';
        const drops = session.drops_earned || 0;

        if (!userMap[userId]) {
          userMap[userId] = { username, drops: 0 };
        }
        userMap[userId].drops += drops;
      });

      const leaderboardData = Object.entries(userMap)
        .map(([userId, data]) => ({
          user_id: userId,
          ...data,
        }))
        .sort((a, b) => b.drops - a.drops);

      setLeaderboard(leaderboardData);
      
      // Find current user rank
      const userIndex = leaderboardData.findIndex((entry) => entry.user_id === session.user.id);
      if (userIndex !== -1) {
        setCurrentUserRank(userIndex + 1);
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

          <View style={styles.scopeFilter}>
            <Text style={styles.filterLabel}>Scope:</Text>
            {(['gym', 'city', 'country'] as Scope[]).map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.filterButton, scope === s && styles.filterButtonActive]}
                onPress={() => setScope(s)}
              >
                <Text
                  style={[
                    styles.filterButtonText,
                    scope === s && styles.filterButtonTextActive,
                  ]}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
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
  scopeFilter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
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
