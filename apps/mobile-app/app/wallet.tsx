import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { theme, getNumberStyle } from '@/lib/theme';
import BackButton from '@/components/BackButton';

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
        <Text style={styles.headerTitle}>Wallet</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>Total Balance</Text>
          <View style={styles.totalRow}>
            <Ionicons name="water" size={48} color={theme.colors.primary} />
            <Text style={[styles.totalValue, getNumberStyle(48)]}>
              {profile?.total_drops || 0}
            </Text>
          </View>
        </View>

        <View style={styles.statsContainer}>
          <Text style={styles.sectionTitle}>Earned Drops</Text>

          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Today</Text>
            <View style={styles.statValueContainer}>
              <Ionicons name="water" size={20} color={theme.colors.primary} />
              <Text style={[styles.statValue, getNumberStyle(18)]}>{todayDrops}</Text>
            </View>
          </View>

          <View style={styles.statRow}>
            <Text style={styles.statLabel}>This Week</Text>
            <View style={styles.statValueContainer}>
              <Ionicons name="water" size={20} color={theme.colors.primary} />
              <Text style={[styles.statValue, getNumberStyle(18)]}>{weekDrops}</Text>
            </View>
          </View>

          <View style={styles.statRow}>
            <Text style={styles.statLabel}>This Month</Text>
            <View style={styles.statValueContainer}>
              <Ionicons name="water" size={20} color={theme.colors.primary} />
              <Text style={[styles.statValue, getNumberStyle(18)]}>{monthDrops}</Text>
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
  },
  totalCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.xl,
    marginBottom: theme.spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  totalLabel: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
    letterSpacing: 0.3,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  totalValue: {
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeight.bold,
  },
  statsContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
    letterSpacing: 0.5,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  statLabel: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
  },
  statValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  statValue: {
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeight.semibold,
  },
});
