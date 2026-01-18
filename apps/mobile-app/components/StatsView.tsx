import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { theme, getNumberStyle } from '@/lib/theme';
import { useTheme } from '@/lib/contexts/ThemeContext';

interface StatPeriod {
  label: 'Today' | 'This Month' | 'All Time';
  key: 'daily' | 'monthly' | 'total';
}

interface UserStats {
  hours: number;
  workouts: number;
  goalsCompleted: number;
  dropsEarned: number;
}

export default function StatsView() {
  const { session } = useSession();
  const { branding } = useTheme();
  const [selectedPeriod, setSelectedPeriod] = useState<StatPeriod['key']>('daily');
  const [stats, setStats] = useState<UserStats>({
    hours: 0,
    workouts: 0,
    goalsCompleted: 0,
    dropsEarned: 0,
  });
  const [loading, setLoading] = useState(true);

  const periods: StatPeriod[] = [
    { label: 'Today', key: 'daily' },
    { label: 'This Month', key: 'monthly' },
    { label: 'All Time', key: 'total' },
  ];

  useEffect(() => {
    if (session?.user) {
      loadStats();
    }
  }, [session?.user, selectedPeriod]);

  const loadStats = async () => {
    if (!session?.user) return;

    setLoading(true);
    try {
      let query = supabase
        .from('sessions')
        .select('duration_seconds, drops_earned, ended_at')
        .eq('user_id', session.user.id)
        .not('ended_at', 'is', null)
        .not('duration_seconds', 'is', null);

      // Filter by period
      const now = new Date();
      if (selectedPeriod === 'daily') {
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        query = query.gte('ended_at', today.toISOString());
      } else if (selectedPeriod === 'monthly') {
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        query = query.gte('ended_at', firstDayOfMonth.toISOString());
      }
      // 'total' uses no filter

      const { data: sessionsData, error: sessionsError } = await query;

      if (sessionsError) throw sessionsError;

      // Calculate stats from sessions
      const totalDuration = (sessionsData || []).reduce(
        (sum, s) => sum + (s.duration_seconds || 0),
        0
      );
      const totalDrops = (sessionsData || []).reduce(
        (sum, s) => sum + (s.drops_earned || 0),
        0
      );

      // Load completed plan goals (for SmartCoach goals completed)
      let goalsQuery = supabase
        .from('active_subscriptions')
        .select('id, status, completed_at')
        .eq('user_id', session.user.id)
        .eq('status', 'completed');

      if (selectedPeriod === 'daily') {
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        goalsQuery = goalsQuery.gte('completed_at', today.toISOString());
      } else if (selectedPeriod === 'monthly') {
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        goalsQuery = goalsQuery.gte('completed_at', firstDayOfMonth.toISOString());
      }

      const { count: goalsCount, error: goalsError } = await goalsQuery;

      if (goalsError) {
        console.error('Error loading goals:', goalsError);
      }

      setStats({
        hours: Math.round((totalDuration / 3600) * 10) / 10, // Round to 1 decimal
        workouts: sessionsData?.length || 0,
        goalsCompleted: goalsCount || 0,
        dropsEarned: totalDrops,
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (hours: number) => {
    if (hours < 1) {
      const minutes = Math.round(hours * 60);
      return `${minutes}m`;
    }
    const wholeHours = Math.floor(hours);
    const minutes = Math.round((hours - wholeHours) * 60);
    if (minutes > 0) {
      return `${wholeHours}h ${minutes}m`;
    }
    return `${wholeHours}h`;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <LinearGradient
          colors={['#000000', '#0A0E1A', '#000000']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={branding.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Background Gradient */}
      <LinearGradient
        colors={['#000000', '#0A0E1A', '#000000']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Statistics</Text>
          <Text style={styles.subtitle}>Track your fitness journey</Text>
        </View>

        {/* Period Selector */}
        <View style={styles.periodSelector}>
          {periods.map((period) => (
            <TouchableOpacity
              key={period.key}
              style={[
                styles.periodButton,
                selectedPeriod === period.key && {
                  backgroundColor: branding.primary,
                },
              ]}
              onPress={() => setSelectedPeriod(period.key)}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.periodButtonText,
                  selectedPeriod === period.key && {
                    color: branding.onPrimary,
                  },
                ]}
              >
                {period.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          {/* Hours */}
          <View style={[styles.statCard, { borderColor: branding.primary }]}>
            <LinearGradient
              colors={[branding.primaryLight, theme.colors.surface]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.statCardGradient}
            >
              <Ionicons name="time" size={32} color={branding.primary} />
              <Text style={[styles.statValue, getNumberStyle(36), { color: branding.primary }]}>
                {formatTime(stats.hours)}
              </Text>
              <Text style={styles.statLabel}>Hours</Text>
            </LinearGradient>
          </View>

          {/* Workouts */}
          <View style={[styles.statCard, { borderColor: branding.primary }]}>
            <LinearGradient
              colors={[branding.primaryLight, theme.colors.surface]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.statCardGradient}
            >
              <Ionicons name="fitness" size={32} color={branding.primary} />
              <Text style={[styles.statValue, getNumberStyle(36), { color: branding.primary }]}>
                {stats.workouts}
              </Text>
              <Text style={styles.statLabel}>Workouts</Text>
            </LinearGradient>
          </View>

          {/* Goals Completed */}
          <View style={[styles.statCard, { borderColor: branding.primary }]}>
            <LinearGradient
              colors={[branding.primaryLight, theme.colors.surface]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.statCardGradient}
            >
              <Ionicons name="trophy" size={32} color={branding.primary} />
              <Text style={[styles.statValue, getNumberStyle(36), { color: branding.primary }]}>
                {stats.goalsCompleted}
              </Text>
              <Text style={styles.statLabel}>Goals</Text>
            </LinearGradient>
          </View>

          {/* Drops Earned */}
          <View style={[styles.statCard, { borderColor: branding.primary }]}>
            <LinearGradient
              colors={[branding.primaryLight, theme.colors.surface]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.statCardGradient}
            >
              <Ionicons name="water" size={32} color={branding.primary} />
              <Text style={[styles.statValue, getNumberStyle(36), { color: branding.primary }]}>
                {stats.dropsEarned.toLocaleString()}
              </Text>
              <Text style={styles.statLabel}>Drops</Text>
            </LinearGradient>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0E1A',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing.lg,
    gap: theme.spacing.lg,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    gap: theme.spacing.xs,
  },
  title: {
    fontSize: theme.typography.fontSize['3xl'],
    fontWeight: '700',
    color: theme.colors.text,
  },
  subtitle: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
  },
  periodSelector: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.xs,
    borderRadius: theme.borderRadius.lg,
  },
  periodButton: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
  },
  periodButtonText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  statsGrid: {
    gap: theme.spacing.md,
  },
  statCard: {
    borderRadius: theme.borderRadius.xl,
    borderWidth: 2,
    overflow: 'hidden',
    ...theme.shadows.md,
  },
  statCardGradient: {
    padding: theme.spacing.xl,
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  statValue: {
    fontSize: theme.typography.fontSize['3xl'],
    fontWeight: '700',
    color: theme.colors.text,
  },
  statLabel: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
});
