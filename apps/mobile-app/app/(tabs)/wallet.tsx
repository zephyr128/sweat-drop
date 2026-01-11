import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';

export default function WalletScreen() {
  const { session } = useSession();
  const [profile, setProfile] = useState<any>(null);
  const [todayDrops, setTodayDrops] = useState(0);
  const [weekDrops, setWeekDrops] = useState(0);
  const [monthDrops, setMonthDrops] = useState(0);

  useEffect(() => {
    if (session?.user) {
      loadProfile();
      loadDropsStats();
    }
  }, [session]);

  const loadProfile = async () => {
    if (!session?.user) return;

    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();

    if (data) {
      setProfile(data);
    }
  };

  const loadDropsStats = async () => {
    if (!session?.user) return;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(today);
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    // Today
    const { data: todayData } = await supabase
      .from('drops_transactions')
      .select('amount')
      .eq('user_id', session.user.id)
      .gte('created_at', today.toISOString())
      .gt('amount', 0);

    const todayTotal = todayData?.reduce((sum, t) => sum + (t.amount || 0), 0) || 0;
    setTodayDrops(todayTotal);

    // This week
    const { data: weekData } = await supabase
      .from('drops_transactions')
      .select('amount')
      .eq('user_id', session.user.id)
      .gte('created_at', weekAgo.toISOString())
      .gt('amount', 0);

    const weekTotal = weekData?.reduce((sum, t) => sum + (t.amount || 0), 0) || 0;
    setWeekDrops(weekTotal);

    // This month
    const { data: monthData } = await supabase
      .from('drops_transactions')
      .select('amount')
      .eq('user_id', session.user.id)
      .gte('created_at', monthAgo.toISOString())
      .gt('amount', 0);

    const monthTotal = monthData?.reduce((sum, t) => sum + (t.amount || 0), 0) || 0;
    setMonthDrops(monthTotal);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.content}>
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Total Balance</Text>
            <View style={styles.totalRow}>
              <Text style={styles.totalEmoji}>💧</Text>
              <Text style={styles.totalValue}>{profile?.total_drops || 0}</Text>
            </View>
          </View>

          <View style={styles.statsContainer}>
            <Text style={styles.sectionTitle}>Earned Drops</Text>

            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Today</Text>
              <View style={styles.statValueContainer}>
                <Text style={styles.statValue}>💧 {todayDrops}</Text>
              </View>
            </View>

            <View style={styles.statRow}>
              <Text style={styles.statLabel}>This Week</Text>
              <View style={styles.statValueContainer}>
                <Text style={styles.statValue}>💧 {weekDrops}</Text>
              </View>
            </View>

            <View style={styles.statRow}>
              <Text style={styles.statLabel}>This Month</Text>
              <View style={styles.statValueContainer}>
                <Text style={styles.statValue}>💧 {monthDrops}</Text>
              </View>
            </View>
          </View>
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
  totalCard: {
    backgroundColor: '#6366f1',
    borderRadius: 20,
    padding: 32,
    marginBottom: 24,
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 16,
    color: '#e0e7ff',
    marginBottom: 12,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  totalEmoji: {
    fontSize: 40,
  },
  totalValue: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#fff',
  },
  statsContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 20,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  statLabel: {
    fontSize: 16,
    color: '#6b7280',
  },
  statValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
});
