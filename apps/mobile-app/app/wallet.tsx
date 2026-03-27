import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { useGymStore } from '@/lib/stores/useGymStore';
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

interface GymDropsData {
  gymName: string;
  localBalance: number;
  weeklyDrops: number;
  monthlyDrops: number;
}

interface ExpiryData {
  expiringIn7d: number;
  expiringIn30d: number;
  nextExpiryDate: string | null;
}

interface LedgerSummary {
  walletBalance: number;
  earnedScoreAllTime: number;
}

export default function WalletScreen() {
  const { session } = useSession();
  const branding = useBranding();
  const { t } = useTranslation('wallet');
  const { activeGym, getActiveGymId } = useGymStore();
  const [profile, setProfile] = useState<any>(null);
  const [todayDrops, setTodayDrops] = useState(0);
  const [gymDrops, setGymDrops] = useState<GymDropsData | null>(null);
  const [expiry, setExpiry] = useState<ExpiryData | null>(null);
  const [ledger, setLedger] = useState<LedgerSummary | null>(null);

  const activeGymId = getActiveGymId();

  useEffect(() => {
    if (session?.user) {
      loadProfile();
      loadTodayDrops();
      loadGymDrops();
      loadExpiry();
      loadLedger();
    }
  }, [session, activeGymId]);

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

  const loadTodayDrops = async () => {
    if (!session?.user) return;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const { data: todayData } = await supabase
      .from('drops_transactions')
      .select('amount')
      .eq('user_id', session.user.id)
      .gte('created_at', today.toISOString())
      .gt('amount', 0)
      .in('transaction_type', ['session', 'challenge', 'bonus', 'arena']);

    const todayTotal = todayData?.reduce((sum, tx) => sum + (tx.amount || 0), 0) || 0;
    setTodayDrops(todayTotal);
  };

  const loadGymDrops = async () => {
    if (!session?.user || !activeGymId) {
      setGymDrops(null);
      return;
    }

    try {
      // Get local drops balance from gym_memberships
      const { data: membership } = await supabase
        .from('gym_memberships')
        .select('local_drops_balance')
        .eq('user_id', session.user.id)
        .eq('gym_id', activeGymId)
        .single();

      // Get gym-specific weekly drops (from sessions)
      const weekStart = getWeekStart();
      const { data: weekSessions } = await supabase
        .from('sessions')
        .select('drops_earned')
        .eq('user_id', session.user.id)
        .eq('gym_id', activeGymId)
        .gte('started_at', weekStart.toISOString())
        .gt('drops_earned', 0);

      const weeklyDrops = weekSessions?.reduce((sum, s) => sum + (s.drops_earned || 0), 0) || 0;

      // Get gym-specific monthly drops (from sessions)
      const monthStart = getMonthStart();
      const { data: monthSessions } = await supabase
        .from('sessions')
        .select('drops_earned')
        .eq('user_id', session.user.id)
        .eq('gym_id', activeGymId)
        .gte('started_at', monthStart.toISOString())
        .gt('drops_earned', 0);

      const monthlyDrops = monthSessions?.reduce((sum, s) => sum + (s.drops_earned || 0), 0) || 0;

      setGymDrops({
        gymName: activeGym?.name || t('currentGym'),
        localBalance: membership?.local_drops_balance || 0,
        weeklyDrops,
        monthlyDrops,
      });
    } catch (err) {
      console.error('Error loading gym drops:', err);
      setGymDrops(null);
    }
  };

  const loadExpiry = async () => {
    if (!session?.user || !activeGymId) {
      setExpiry(null);
      return;
    }
    try {
      const { data, error } = await supabase.rpc('get_user_expiring_drops', {
        p_gym_id: activeGymId,
      });
      if (error) {
        if (error.code === 'PGRST202') {
          // RPC not deployed yet — silently skip
          setExpiry(null);
          return;
        }
        console.warn('[Wallet] expiry RPC error:', error.message);
        setExpiry(null);
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (row) {
        setExpiry({
          expiringIn7d: Number(row.expiring_in_7d ?? 0),
          expiringIn30d: Number(row.expiring_in_30d ?? 0),
          nextExpiryDate: row.next_expiry_date ?? null,
        });
      } else {
        setExpiry({ expiringIn7d: 0, expiringIn30d: 0, nextExpiryDate: null });
      }
    } catch {
      setExpiry(null);
    }
  };

  const loadLedger = async () => {
    if (!session?.user || !activeGymId) {
      setLedger(null);
      return;
    }
    try {
      const { data, error } = await supabase.rpc('get_user_drops_ledger_summary', {
        p_gym_id: activeGymId,
      });
      if (error) {
        if (error.code === 'PGRST202') {
          setLedger(null);
          return;
        }
        console.warn('[Wallet] ledger RPC error:', error.message);
        setLedger(null);
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (row) {
        setLedger({
          walletBalance: Number(row.wallet_balance ?? 0),
          earnedScoreAllTime: Number(row.earned_score_all_time ?? 0),
        });
      }
    } catch {
      setLedger(null);
    }
  };

  const formatExpiryDate = (iso: string): string => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  /** Returns Monday 00:00 of the current week (ISO week) */
  const getWeekStart = (): Date => {
    const now = new Date();
    const day = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const diff = day === 0 ? 6 : day - 1; // days since Monday
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
    return monday;
  };

  /** Returns 1st of current month 00:00 */
  const getMonthStart = (): Date => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
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

        {/* Global Earned Drops Section */}
        <Animated.View entering={FadeInDown.delay(200).duration(400)}>
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
                  <Text style={[styles.statValue, getNumberStyle(18), { color: branding.primary }]}>{profile?.weekly_drops || 0}</Text>
                </View>
              </View>

              <View style={[styles.statRow, { borderBottomWidth: 0 }]}>
                <View style={styles.statLabelRow}>
                  <Ionicons name="stats-chart-outline" size={18} color={branding.primary} />
                  <Text style={styles.statLabel}>{t('thisMonth')}</Text>
                </View>
                <View style={styles.statValueContainer}>
                  <Ionicons name="water" size={18} color={branding.primary} />
                  <Text style={[styles.statValue, getNumberStyle(18), { color: branding.primary }]}>{profile?.monthly_drops || 0}</Text>
                </View>
              </View>
            </BlurView>
          </View>
        </Animated.View>

        {/* Gym Drops Section */}
        {gymDrops && (
          <Animated.View entering={FadeInDown.delay(350).duration(400)}>
            <View style={[styles.statsContainer, { borderColor: hexToRgba(branding.primary, 0.15), marginTop: theme.spacing.lg }]}>
              <BlurView intensity={50} tint="dark" style={[styles.statsBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
                <View style={styles.gymSectionHeader}>
                  <Ionicons name="fitness-outline" size={20} color={branding.primary} />
                  <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>{gymDrops.gymName}</Text>
                </View>

                <View style={[styles.statRow, { borderBottomColor: hexToRgba(branding.primary, 0.08) }]}>
                  <View style={styles.statLabelRow}>
                    <Ionicons name="wallet-outline" size={18} color={branding.primary} />
                    <Text style={styles.statLabel}>{t('gymBalance')}</Text>
                  </View>
                  <View style={styles.statValueContainer}>
                    <Ionicons name="water" size={18} color={branding.primary} />
                    <Text style={[styles.statValue, getNumberStyle(18), { color: branding.primary }]}>{gymDrops.localBalance}</Text>
                  </View>
                </View>

                <View style={[styles.statRow, { borderBottomColor: hexToRgba(branding.primary, 0.08) }]}>
                  <View style={styles.statLabelRow}>
                    <Ionicons name="calendar-outline" size={18} color={theme.colors.textSecondary} />
                    <Text style={styles.statLabel}>{t('thisWeek')}</Text>
                  </View>
                  <View style={styles.statValueContainer}>
                    <Ionicons name="water" size={18} color={theme.colors.textSecondary} />
                    <Text style={[styles.statValue, getNumberStyle(18), { color: theme.colors.textSecondary }]}>{gymDrops.weeklyDrops}</Text>
                  </View>
                </View>

                <View style={[styles.statRow, { borderBottomWidth: 0 }]}>
                  <View style={styles.statLabelRow}>
                    <Ionicons name="stats-chart-outline" size={18} color={theme.colors.textSecondary} />
                    <Text style={styles.statLabel}>{t('thisMonth')}</Text>
                  </View>
                  <View style={styles.statValueContainer}>
                    <Ionicons name="water" size={18} color={theme.colors.textSecondary} />
                    <Text style={[styles.statValue, getNumberStyle(18), { color: theme.colors.textSecondary }]}>{gymDrops.monthlyDrops}</Text>
                  </View>
                </View>
              </BlurView>
            </View>
          </Animated.View>
        )}

        {/* Expiry Card */}
        {expiry && (
          <Animated.View entering={FadeInDown.delay(450).duration(400)}>
            <View style={[styles.statsContainer, { borderColor: hexToRgba(branding.primary, 0.15), marginTop: theme.spacing.lg }]}>
              <BlurView intensity={50} tint="dark" style={[styles.statsBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
                <View style={styles.gymSectionHeader}>
                  <Ionicons name="hourglass-outline" size={20} color="#FDE68A" />
                  <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>{t('expiryTitle')}</Text>
                </View>

                {expiry.expiringIn7d === 0 && expiry.expiringIn30d === 0 ? (
                  <View style={styles.expiryEmpty}>
                    <Ionicons name="checkmark-circle-outline" size={18} color={theme.colors.textTertiary} />
                    <Text style={styles.expiryEmptyText}>{t('noExpirySoon')}</Text>
                  </View>
                ) : (
                  <>
                    {expiry.expiringIn7d > 0 && (
                      <View style={[styles.statRow, { borderBottomColor: hexToRgba('#FDE68A', 0.15) }]}>
                        <View style={styles.statLabelRow}>
                          <Ionicons name="alert-circle-outline" size={18} color="#FCA5A5" />
                          <Text style={styles.statLabel}>{t('expiringIn7d')}</Text>
                        </View>
                        <View style={styles.statValueContainer}>
                          <Ionicons name="water" size={18} color="#FCA5A5" />
                          <Text style={[styles.statValue, getNumberStyle(18), { color: '#FCA5A5' }]}>{expiry.expiringIn7d}</Text>
                        </View>
                      </View>
                    )}

                    {expiry.expiringIn30d > 0 && (
                      <View style={[styles.statRow, { borderBottomColor: hexToRgba('#FDE68A', 0.15) }]}>
                        <View style={styles.statLabelRow}>
                          <Ionicons name="time-outline" size={18} color="#FDE68A" />
                          <Text style={styles.statLabel}>{t('expiringIn30d')}</Text>
                        </View>
                        <View style={styles.statValueContainer}>
                          <Ionicons name="water" size={18} color="#FDE68A" />
                          <Text style={[styles.statValue, getNumberStyle(18), { color: '#FDE68A' }]}>{expiry.expiringIn30d}</Text>
                        </View>
                      </View>
                    )}

                    {expiry.nextExpiryDate && (
                      <View style={[styles.statRow, { borderBottomWidth: 0 }]}>
                        <View style={styles.statLabelRow}>
                          <Ionicons name="calendar-outline" size={18} color={theme.colors.textSecondary} />
                          <Text style={styles.statLabel}>{t('nextExpiryDate')}</Text>
                        </View>
                        <Text style={[styles.statValue, { color: theme.colors.textSecondary, fontSize: 14 }]}>
                          {formatExpiryDate(expiry.nextExpiryDate)}
                        </Text>
                      </View>
                    )}
                  </>
                )}
              </BlurView>
            </View>
          </Animated.View>
        )}

        {/* Ledger split — earned score vs wallet (if backend provides it) */}
        {ledger && (
          <Animated.View entering={FadeInDown.delay(550).duration(400)}>
            <View style={styles.ledgerRow}>
              <View style={[styles.ledgerCell, { borderColor: hexToRgba(branding.primary, 0.15) }]}>
                <Ionicons name="wallet-outline" size={16} color={branding.primary} />
                <Text style={styles.ledgerLabel}>{t('walletBalance')}</Text>
                <Text style={[styles.ledgerValue, getNumberStyle(18), { color: branding.primary }]}>{ledger.walletBalance}</Text>
              </View>
              <View style={[styles.ledgerCell, { borderColor: hexToRgba(branding.primary, 0.15) }]}>
                <Ionicons name="trophy-outline" size={16} color={branding.primary} />
                <Text style={styles.ledgerLabel}>{t('earnedScore')}</Text>
                <Text style={[styles.ledgerValue, getNumberStyle(18), { color: branding.primary }]}>{ledger.earnedScoreAllTime}</Text>
              </View>
            </View>
          </Animated.View>
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
  gymSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
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
  expiryEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: theme.spacing.md,
  },
  expiryEmptyText: {
    ...fontStyles.body,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textTertiary,
  },
  ledgerRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
  },
  ledgerCell: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    backgroundColor: 'rgba(20, 20, 30, 0.75)',
  },
  ledgerLabel: {
    ...fontStyles.body,
    fontSize: 11,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  ledgerValue: {
    ...fontStyles.number,
  },
});
