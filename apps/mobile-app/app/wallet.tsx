import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { theme, getNumberStyle, fontStyles } from '@/lib/theme';
import BackButton from '@/components/BackButton';
import { useBranding } from '@/lib/contexts/ThemeContext';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(0, 229, 255, ${alpha})`;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function WalletScreen() {
  const { session } = useSession();
  const branding = useBranding();
  const { t } = useTranslation('wallet');
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
      {/* Gradient background */}
      <LinearGradient
        colors={['#000000', '#0A0E1A', '#000000']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Header */}
      <View style={styles.header}>
        <BackButton />
        <Text style={styles.headerTitle}>{t('title')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Total Balance Card */}
        <Animated.View entering={FadeInDown.delay(100).duration(400)}>
          <View style={[styles.totalCard, { borderColor: hexToRgba(branding.primary, 0.2) }]}>
            <BlurView intensity={50} tint="dark" style={[styles.totalCardBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
              <LinearGradient
                colors={[hexToRgba(branding.primary, 0.08), 'rgba(20, 20, 35, 0.9)', hexToRgba(branding.primary, 0.04)]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.totalCardGradient}
              >
                <Text style={styles.totalLabel}>{t('totalBalance')}</Text>
                <View style={styles.totalRow}>
                  <Ionicons name="water" size={40} color={branding.primary} />
                  <Text style={[styles.totalValue, getNumberStyle(48), { color: branding.primary }]}>
                    {profile?.total_drops || 0}
                  </Text>
                </View>
                <Text style={[styles.totalSubLabel, { color: hexToRgba(branding.primary, 0.5) }]}>{t('drops')}</Text>
              </LinearGradient>
            </BlurView>
          </View>
        </Animated.View>

        {/* Earned Drops Section */}
        <Animated.View entering={FadeInDown.delay(250).duration(400)}>
          <View style={[styles.statsContainer, { borderColor: hexToRgba(branding.primary, 0.15) }]}>
            <BlurView intensity={50} tint="dark" style={[styles.statsBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
              <Text style={styles.sectionTitle}>{t('earnedDrops')}</Text>

              <View style={[styles.statRow, { borderBottomColor: hexToRgba(branding.primary, 0.08) }]}>
                <View style={styles.statLabelRow}>
                  <Ionicons name="today-outline" size={18} color={branding.primary} />
                  <Text style={styles.statLabel}>{t('today')}</Text>
                </View>
                <View style={styles.statValueContainer}>
                  <Ionicons name="water" size={18} color={branding.primary} />
                  <Text style={[styles.statValue, getNumberStyle(18), { color: branding.primary }]}>{todayDrops}</Text>
                </View>
              </View>

              <View style={[styles.statRow, { borderBottomColor: hexToRgba(branding.primary, 0.08) }]}>
                <View style={styles.statLabelRow}>
                  <Ionicons name="calendar-outline" size={18} color={branding.primary} />
                  <Text style={styles.statLabel}>{t('thisWeek')}</Text>
                </View>
                <View style={styles.statValueContainer}>
                  <Ionicons name="water" size={18} color={branding.primary} />
                  <Text style={[styles.statValue, getNumberStyle(18), { color: branding.primary }]}>{weekDrops}</Text>
                </View>
              </View>

              <View style={[styles.statRow, { borderBottomWidth: 0 }]}>
                <View style={styles.statLabelRow}>
                  <Ionicons name="stats-chart-outline" size={18} color={branding.primary} />
                  <Text style={styles.statLabel}>{t('thisMonth')}</Text>
                </View>
                <View style={styles.statValueContainer}>
                  <Ionicons name="water" size={18} color={branding.primary} />
                  <Text style={[styles.statValue, getNumberStyle(18), { color: branding.primary }]}>{monthDrops}</Text>
                </View>
              </View>
            </BlurView>
          </View>
        </Animated.View>
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
    ...fontStyles.heading,
    flex: 1,
    fontSize: 26,
    color: theme.colors.text,
    textAlign: 'center',
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
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    marginBottom: theme.spacing.lg,
    borderWidth: 1,
  },
  totalCardBlur: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
  },
  totalCardGradient: {
    padding: theme.spacing.xl,
    alignItems: 'center',
  },
  totalLabel: {
    ...fontStyles.heading,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  totalValue: {
    ...fontStyles.number,
  },
  totalSubLabel: {
    ...fontStyles.heading,
    fontSize: theme.typography.fontSize.sm,
    marginTop: theme.spacing.xs,
  },
  statsContainer: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
  },
  statsBlur: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    padding: theme.spacing.lg,
  },
  sectionTitle: {
    ...fontStyles.heading,
    fontSize: 20,
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
  },
  statLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  statLabel: {
    ...fontStyles.body,
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
    ...fontStyles.number,
  },
});
