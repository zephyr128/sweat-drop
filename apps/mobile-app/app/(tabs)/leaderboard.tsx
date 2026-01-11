import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';

type Period = 'daily' | 'weekly' | 'monthly';
type Scope = 'gym' | 'city' | 'country';

export default function LeaderboardScreen() {
  const { session } = useSession();
  const [period, setPeriod] = useState<Period>('daily');
  const [scope, setScope] = useState<Scope>('gym');
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (session?.user) {
      loadLeaderboard();
    }
  }, [session, period, scope]);

  const loadLeaderboard = async () => {
    if (!session?.user) return;

    setLoading(true);

    // Get user's gym
    const { data: profileData } = await supabase
      .from('profiles')
      .select('home_gym_id, gym:home_gym_id(city, country)')
      .eq('id', session.user.id)
      .single();

    const gymId = profileData?.home_gym_id;

    // Calculate date range
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
      // Aggregate by user
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

      // Convert to array and sort
      const leaderboardData = Object.entries(userMap)
        .map(([userId, data]) => ({
          user_id: userId,
          ...data,
        }))
        .sort((a, b) => b.drops - a.drops)
        .slice(0, 100);

      setLeaderboard(leaderboardData);
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

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.content}>
          <Text style={styles.title}>Leaderboard</Text>

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
              <Text>Loading...</Text>
            </View>
          ) : leaderboard.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No data available</Text>
            </View>
          ) : (
            <View style={styles.leaderboard}>
              {leaderboard.map((entry, index) => (
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
                  <Text style={styles.drops}>💧 {entry.drops}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 24,
  },
  filters: {
    marginBottom: 24,
    gap: 16,
  },
  periodFilter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  scopeFilter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  filterLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginRight: 8,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  filterButtonActive: {
    backgroundColor: '#6366f1',
    borderColor: '#6366f1',
  },
  filterButtonText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  filterButtonTextActive: {
    color: '#fff',
  },
  loadingContainer: {
    padding: 48,
    alignItems: 'center',
  },
  emptyState: {
    padding: 48,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#6b7280',
  },
  leaderboard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  leaderboardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  leaderboardItemCurrent: {
    backgroundColor: '#eef2ff',
  },
  rank: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    width: 40,
  },
  userInfo: {
    flex: 1,
    marginLeft: 12,
  },
  username: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  drops: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6366f1',
  },
});
