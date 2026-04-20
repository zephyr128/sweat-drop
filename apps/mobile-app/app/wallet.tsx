import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useFocusEffect } from 'expo-router';
import { useThrottledRouter } from '@/hooks/useThrottledRouter';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { PlatformBlur } from '@/components/PlatformBlur';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { useGymStore } from '@/lib/stores/useGymStore';
import {
  theme,
  getNumberStyle,
  fontStyles,
  hexToRgba,
  glassCard,
} from '@/lib/theme';
import ScreenHeader from '@/components/ScreenHeader';
import { SliderTabs } from '@/components/SliderTabs';
import { useBranding } from '@/lib/contexts/ThemeContext';
import { useLocalDrops } from '@/hooks/useLocalDrops';
import { log } from '@/lib/logger';
import { useDropLimitStatus } from '@/hooks/useDropLimitStatus';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import * as Haptics from 'expo-haptics';

// ────────────────────────────────────────────────────
//  Types
// ────────────────────────────────────────────────────

type ExpiryState = 'safe' | 'warning' | 'critical';

interface EarnedData {
  today: number;
  week: number;
  month: number;
  allTime: number;
}

interface SpentData {
  today: number;
  week: number;
  month: number;
  allTime: number;
}

interface ExpiryData {
  expiringIn7d: number;
  expiringIn30d: number;
  nextExpiryDate: string | null;
  daysSinceLastVisit: number;
}

type SummaryPeriod = 'today' | 'week' | 'month' | 'allTime';

// ────────────────────────────────────────────────────
//  Screen
// ────────────────────────────────────────────────────

export default function WalletScreen() {
  const router = useThrottledRouter();
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const branding = useBranding();
  const { t } = useTranslation('wallet');
  const { activeGym, getActiveGymId } = useGymStore();
  const activeGymId = getActiveGymId();
  const { localDrops, refreshLocalDrops } = useLocalDrops(activeGymId);
  const dropLimits = useDropLimitStatus(activeGymId);

  const [earned, setEarned] = useState<EarnedData>({ today: 0, week: 0, month: 0, allTime: 0 });
  const [spent, setSpent] = useState<SpentData>({ today: 0, week: 0, month: 0, allTime: 0 });
  /** SUM(amount) per period from server — matches ledger (incl. refunds); may differ from earned−spent in edge cases */
  const [summaryNet, setSummaryNet] = useState<EarnedData>({ today: 0, week: 0, month: 0, allTime: 0 });
  const [expiry, setExpiry] = useState<ExpiryData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activePeriod, setActivePeriod] = useState<SummaryPeriod>('week');

  type ScopeType = 'gym' | 'global';
  const [scope, setScope] = useState<ScopeType>('gym');
  const selectedGymId = scope === 'gym' ? activeGymId : null;
  const [userGyms, setUserGyms] = useState<{ id: string; name: string; local_drops: number }[]>([]);
  const [totalDrops, setTotalDrops] = useState(0);

  // ── Data loading ──

  const loadGyms = useCallback(async () => {
    if (!session?.user) return;
    try {
      const [{ data: memberships }, { data: profile }] = await Promise.all([
        supabase
          .from('gym_memberships')
          .select('gym_id, local_drops_balance, gyms(id, name)')
          .eq('user_id', session.user.id),
        supabase
          .from('profiles')
          .select('total_drops')
          .eq('id', session.user.id)
          .single(),
      ]);
      setTotalDrops(profile?.total_drops ?? 0);
      setUserGyms(
        (memberships ?? [])
          .filter((m: any) => m.gyms)
          .map((m: any) => ({
            id: m.gym_id,
            name: (m.gyms as any).name,
            local_drops: m.local_drops_balance ?? 0,
          })),
      );
    } catch (err) {
      log.error('[Wallet] Error loading gyms:', err);
    }
  }, [session?.user]);

  const loadSummary = useCallback(async () => {
    if (!session?.user) return;
    try {
      const { data, error } = await supabase.rpc('get_wallet_summary', {
        p_gym_id: selectedGymId ?? null,
      });
      if (error) { log.error('[Wallet] Summary RPC error:', error); return; }
      const rows = data as Array<{ period: string; earned: number; spent: number; net: number }> | null;
      if (!rows) return;

      const e: EarnedData = { today: 0, week: 0, month: 0, allTime: 0 };
      const s: SpentData = { today: 0, week: 0, month: 0, allTime: 0 };
      const n: EarnedData = { today: 0, week: 0, month: 0, allTime: 0 };
      for (const r of rows) {
        const key = r.period as keyof EarnedData;
        if (key in e) {
          e[key] = Number(r.earned) || 0;
          s[key] = Number(r.spent) || 0;
          n[key] = Number(r.net) || 0;
        }
      }
      setEarned(e);
      setSpent(s);
      setSummaryNet(n);
    } catch (err) {
      log.error('[Wallet] Error loading summary:', err);
    }
  }, [session?.user, selectedGymId]);

  const loadExpiry = useCallback(async () => {
    if (!session?.user || !activeGymId) { setExpiry(null); return; }
    try {
      const { data, error } = await supabase.rpc('get_user_expiring_drops', { p_gym_id: activeGymId });
      if (error) {
        if (error.code === 'PGRST202') { setExpiry(null); return; }
        setExpiry(null);
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;

      const { data: checkinRows } = await supabase.rpc('get_my_checkins', {
        p_gym_id: null,
        p_since: null,
        p_limit: 1,
      });
      const lastCheckin = checkinRows?.[0] ?? null;

      const daysSinceLastVisit = lastCheckin?.checked_in_at
        ? Math.floor((Date.now() - new Date(lastCheckin.checked_in_at).getTime()) / 86400000)
        : 999;

      const expiringIn7d = Number(row?.expiring_in_7d ?? 0);
      const expiringIn30d = Number(row?.expiring_in_30d ?? 0);

      // Don't show expiry card at all if user has no drops at risk
      if (!row || (expiringIn7d === 0 && expiringIn30d === 0 && daysSinceLastVisit === 999)) {
        setExpiry(null);
        return;
      }

      setExpiry({
        expiringIn7d,
        expiringIn30d,
        nextExpiryDate: row.next_expiry_date ?? null,
        daysSinceLastVisit,
      });
    } catch {
      setExpiry(null);
    }
  }, [session?.user, activeGymId]);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      loadGyms(),
      loadSummary(),
      loadExpiry(),
      refreshLocalDrops(),
    ]);
  }, [loadGyms, loadSummary, loadExpiry, refreshLocalDrops]);

  useEffect(() => {
    if (session?.user) refreshAll();
  }, [session?.user, activeGymId, scope]);

  useFocusEffect(useCallback(() => {
    if (session?.user) refreshAll();
  }, [session?.user, activeGymId]));

  useRealtimeRefresh({
    table: 'drops_transactions',
    filterColumn: 'user_id',
    filterValue: session?.user?.id ?? null,
    onEvent: refreshAll,
    enabled: !!session?.user,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  }, [refreshAll]);

  // ── Derived state ──

  const expiryState: ExpiryState = (() => {
    if (!expiry) return 'safe';
    if (expiry.daysSinceLastVisit >= 28) return 'critical';
    if (expiry.daysSinceLastVisit >= 25) return 'warning';
    if (expiry.expiringIn7d > 0) return 'warning';
    return 'safe';
  })();

  const daysUntilExpiry = expiry ? Math.max(0, 30 - expiry.daysSinceLastVisit) : 30;
  const dropsAtRisk = expiry
    ? expiryState === 'critical'
      ? expiry.expiringIn7d + expiry.expiringIn30d
      : expiry.expiringIn7d
    : 0;

  const dailyTarget = dropLimits.maxDropsPerDay || 300;
  const dailyProgress = Math.min(earned.today / dailyTarget, 1);
  const weeklyTarget = dropLimits.maxDropsPerWeek || 1500;
  const weeklyProgress = Math.min(earned.week / weeklyTarget, 1);

  const heroBalance = scope === 'gym' ? localDrops : totalDrops;
  const heroLabel = scope === 'gym'
    ? t('availableToSpend')
    : t('totalBalance');

  // ────────────────────────────────────────────────────
  //  UI
  // ────────────────────────────────────────────────────

  // Derived: values for the active period tab
  const periodEarned = earned[activePeriod];
  const periodSpent = spent[activePeriod];
  const periodNet = summaryNet[activePeriod];

  // Period tab config
  const periodTabs: { key: SummaryPeriod; label: string }[] = useMemo(() => [
    { key: 'today', label: t('today') },
    { key: 'week', label: t('thisWeek') },
    { key: 'month', label: t('thisMonth') },
    { key: 'allTime', label: t('allTime') },
  ], [t]);

  const historyButton = (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push('/transactions');
      }}
      style={({ pressed }) => [styles.historyBtn, pressed && { opacity: 0.6 }]}
    >
      <Ionicons name="receipt-outline" size={22} color={branding.primary} />
    </Pressable>
  );

  return (
    <View style={styles.safe}>
      <LinearGradient
        colors={['#000000', '#080A14', '#000000']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <ScreenHeader title={t('title')} right={historyButton} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 48 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={branding.primary}
          />
        }
      >
        {/* ── Scope tabs (multi-gym only) ── */}
        {userGyms.length > 1 && (
          <Animated.View entering={FadeInDown.delay(40).duration(400)} style={{ marginBottom: 16 }}>
            <SliderTabs
              tabs={[
                { key: 'gym', label: t('myGym'), icon: 'location' },
                { key: 'global', label: t('global'), icon: 'globe-outline' },
              ]}
              activeKey={scope}
              onChange={(key) => setScope(key as ScopeType)}
              accentColor={branding.primary}
            />
          </Animated.View>
        )}

        {/* ── Hero balance card ── */}
        <Animated.View entering={FadeInDown.delay(80).duration(500)}>
          <View style={[styles.heroOuter, { borderColor: hexToRgba(branding.primary, 0.25) }]}>
            <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={glassCard.blur} tint="dark" style={styles.heroBlur}>
              <LinearGradient
                colors={[
                  hexToRgba(branding.primary, 0.14),
                  'rgba(12, 12, 22, 0.92)',
                  hexToRgba(branding.primary, 0.06),
                ]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.heroGradient}
              >
                <Text style={styles.heroLabel}>{heroLabel}</Text>
                <View style={styles.heroRow}>
                  <Ionicons name="water" size={36} color={branding.primary} />
                  <Animated.Text
                    key={`hero-${scope}`}
                    entering={FadeInDown.duration(300)}
                    style={[styles.heroNumber, getNumberStyle(52), { color: branding.primary }]}
                  >
                    {heroBalance.toLocaleString()}
                  </Animated.Text>
                </View>
                <Text style={[styles.heroSub, { color: hexToRgba(branding.primary, 0.5) }]}>
                  {scope === 'gym' ? `${activeGym?.name ?? ''} ` : ''}{t('drops')}
                </Text>
                {scope === 'gym' && (
                  <TouchableOpacity
                    style={[styles.heroCTA, { backgroundColor: branding.primary }]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push('/store');
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.heroCTAText, { color: branding.onPrimary }]}>
                      {t('goToStore')} →
                    </Text>
                  </TouchableOpacity>
                )}
              </LinearGradient>
            </PlatformBlur>
          </View>
        </Animated.View>

        {/* ── Unified Earned / Spent summary card ── */}
        <Animated.View entering={FadeInDown.delay(160).duration(500)}>
          <View style={[styles.sectionCard, { borderColor: hexToRgba(branding.primary, 0.12) }]}>
            <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={glassCard.blur} tint="dark" style={styles.sectionBlur}>

              {/* Period selector tabs — flush to the card top edge, full width */}
              <SliderTabs
                tabs={periodTabs}
                activeKey={activePeriod}
                onChange={(key) => setActivePeriod(key as SummaryPeriod)}
                accentColor={branding.primary}
                barStyle={styles.periodSlider}
              />

              <View style={styles.sectionInner}>
                {/* Earned / Spent columns */}
                <View style={styles.summaryColumns}>
                  {/* Earned column */}
                  <View style={styles.summaryCol}>
                    <View style={styles.summaryColHeader}>
                      <Ionicons name="arrow-down-circle-outline" size={15} color={branding.primary} />
                      <Text style={[styles.summaryColLabel, { color: branding.primary }]}>{t('earned')}</Text>
                    </View>
                    <Animated.Text
                      key={`earned-${activePeriod}`}
                      entering={FadeInDown.duration(250)}
                      style={[styles.summaryValue, getNumberStyle(28), { color: branding.primary }]}
                    >
                      {periodEarned.toLocaleString()}
                    </Animated.Text>
                    <View style={styles.summaryDropsRow}>
                      <Ionicons name="water" size={12} color={hexToRgba(branding.primary, 0.6)} />
                      <Text style={[styles.summaryDropsLabel, { color: hexToRgba(branding.primary, 0.5) }]}>drops</Text>
                    </View>
                    {activePeriod === 'today' && dailyProgress > 0 && (
                      <View style={styles.progressWrap}>
                        <View style={styles.progressTrack}>
                          <View style={[styles.progressFill, { width: `${Math.round(dailyProgress * 100)}%`, backgroundColor: branding.primary }]} />
                        </View>
                        <Text style={styles.progressLabel}>{t('dailyTarget', { target: dailyTarget.toLocaleString() })}</Text>
                      </View>
                    )}
                    {activePeriod === 'week' && weeklyProgress > 0 && (
                      <View style={styles.progressWrap}>
                        <View style={styles.progressTrack}>
                          <View style={[styles.progressFill, { width: `${Math.round(weeklyProgress * 100)}%`, backgroundColor: branding.primary }]} />
                        </View>
                        <Text style={styles.progressLabel}>{t('weeklyTarget', { target: weeklyTarget.toLocaleString() })}</Text>
                      </View>
                    )}
                  </View>

                  {/* Divider */}
                  <View style={styles.summaryDivider} />

                  {/* Spent column */}
                  <View style={styles.summaryCol}>
                    <View style={styles.summaryColHeader}>
                      <Ionicons name="arrow-up-circle-outline" size={15} color="#FF3B30" />
                      <Text style={[styles.summaryColLabel, { color: '#FF3B30' }]}>{t('spent')}</Text>
                    </View>
                    <Animated.Text
                      key={`spent-${activePeriod}`}
                      entering={FadeInDown.duration(250)}
                      style={[styles.summaryValue, getNumberStyle(28), { color: periodSpent > 0 ? '#FF3B30' : theme.colors.textTertiary }]}
                    >
                      {periodSpent.toLocaleString()}
                    </Animated.Text>
                    <View style={styles.summaryDropsRow}>
                      <Ionicons name="water" size={12} color="rgba(255,59,48,0.5)" />
                      <Text style={styles.summaryDropsLabel}>drops</Text>
                    </View>
                    <Text style={styles.summarySpentHint}>{t('spentHint')}</Text>
                  </View>
                </View>

                {/* Net row */}
                <View style={[styles.netRow, { borderTopColor: 'rgba(255,255,255,0.06)' }]}>
                  <Ionicons
                    name={periodNet >= 0 ? 'trending-up-outline' : 'trending-down-outline'}
                    size={14}
                    color={periodNet >= 0 ? branding.primary : '#FF3B30'}
                  />
                  <Text style={styles.netLabel}>{t('net')}</Text>
                  <Text style={[styles.netValue, getNumberStyle(14), { color: periodNet >= 0 ? branding.primary : '#FF3B30' }]}>
                    {periodNet >= 0 ? '+' : ''}{periodNet.toLocaleString()}
                  </Text>
                </View>
              </View>

            </PlatformBlur>
          </View>
        </Animated.View>

        {/* ── Per-gym breakdown (global scope) ── */}
        {scope === 'global' && userGyms.length > 0 && (
          <Animated.View entering={FadeInDown.delay(220).duration(500)}>
            <View style={[styles.sectionCard, { borderColor: hexToRgba(branding.primary, 0.12) }]}>
              <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={glassCard.blur} tint="dark" style={styles.sectionBlur}>
                <View style={styles.sectionInner}>
                  <Text style={styles.sectionTitle}>{t('balanceByGym')}</Text>
                  {(() => {
                    const maxDrops = Math.max(...userGyms.map((g) => g.local_drops), 1);
                    return userGyms.map((gym, idx) => (
                      <Animated.View key={gym.id} entering={FadeInDown.delay(240 + idx * 50).duration(350)}>
                        <TouchableOpacity
                          style={[styles.gymBreakdownRow, idx < userGyms.length - 1 && styles.gymBreakdownRowBorder]}
                          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setScope('gym'); }}
                          activeOpacity={0.7}
                        >
                          <View style={styles.gymBreakdownTop}>
                            <Text style={styles.gymBreakdownName} numberOfLines={1}>{gym.name}</Text>
                            <View style={styles.gymBreakdownDropsRow}>
                              <Ionicons name="water" size={14} color={branding.primary} />
                              <Text style={[styles.gymBreakdownDrops, getNumberStyle(15), { color: branding.primary }]}>
                                {gym.local_drops.toLocaleString()}
                              </Text>
                            </View>
                          </View>
                          <View style={styles.gymBreakdownBarTrack}>
                            <View style={[styles.gymBreakdownBarFill, { width: `${Math.round((gym.local_drops / maxDrops) * 100)}%`, backgroundColor: branding.primary }]} />
                          </View>
                        </TouchableOpacity>
                      </Animated.View>
                    ));
                  })()}
                </View>
              </PlatformBlur>
            </View>
          </Animated.View>
        )}

        {/* ── Expiry card — only shown when there are drops that could actually expire ── */}
        {expiry && (expiryState !== 'safe' ? dropsAtRisk > 0 : true) && (
          <Animated.View entering={FadeInDown.delay(260).duration(500)}>
            <ExpiryCard
              state={expiryState}
              dropsAtRisk={dropsAtRisk}
              daysUntilExpiry={daysUntilExpiry}
              primary={branding.primary}
              t={t}
              onSpend={() => router.push('/store')}
            />
          </Animated.View>
        )}

        {/* ── Transaction history CTA ── */}
        <Animated.View entering={FadeInDown.delay(300).duration(500)}>
          <TouchableOpacity
            style={[styles.historyCtaCard, { borderColor: hexToRgba(branding.primary, 0.15) }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/transactions');
            }}
            activeOpacity={0.75}
          >
            <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={glassCard.blur} tint="dark" style={styles.historyCtaBlur}>
              <View style={[styles.historyCtaIcon, { backgroundColor: hexToRgba(branding.primary, 0.1) }]}>
                <Ionicons name="receipt-outline" size={20} color={branding.primary} />
              </View>
              <View style={styles.historyCtaText}>
                <Text style={styles.historyCtaTitle}>{t('transactionHistory')}</Text>
                <Text style={styles.historyCtaSub}>{t('transactionHistorySub')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={hexToRgba(branding.primary, 0.5)} />
            </PlatformBlur>
          </TouchableOpacity>
        </Animated.View>

      </ScrollView>
    </View>
  );
}


function ExpiryCard({
  state,
  dropsAtRisk,
  daysUntilExpiry,
  primary,
  t,
  onSpend,
}: {
  state: ExpiryState;
  dropsAtRisk: number;
  daysUntilExpiry: number;
  primary: string;
  t: (key: string, opts?: Record<string, any>) => string;
  onSpend: () => void;
}) {
  const cfg = {
    safe: {
      icon: 'checkmark-circle-outline' as const,
      color: '#4CD964',
      bg: 'rgba(76, 217, 100, 0.06)',
      border: 'rgba(76, 217, 100, 0.15)',
    },
    warning: {
      icon: 'alert-circle-outline' as const,
      color: '#FF9500',
      bg: 'rgba(255, 149, 0, 0.06)',
      border: 'rgba(255, 149, 0, 0.2)',
    },
    critical: {
      icon: 'warning-outline' as const,
      color: '#FF3B30',
      bg: 'rgba(255, 59, 48, 0.08)',
      border: 'rgba(255, 59, 48, 0.3)',
    },
  }[state];

  const title = state === 'safe'
    ? t('expiry.safe.title')
    : state === 'warning'
      ? t('expiry.warning.title')
      : t('expiry.critical.title', { days: daysUntilExpiry });

  const message = state === 'safe'
    ? t('expiry.safe.message')
    : state === 'warning'
      ? t('expiry.warning.message', { count: dropsAtRisk, days: daysUntilExpiry })
      : t('expiry.critical.message', { count: dropsAtRisk });

  const showCTA = state !== 'safe';

  return (
    <View style={[styles.expiryCard, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
      <View style={styles.expiryHeader}>
        <Ionicons name={cfg.icon} size={20} color={cfg.color} />
        <Text style={[styles.expiryTitle, { color: cfg.color }]}>{title}</Text>
      </View>
      <Text style={styles.expiryMessage}>{message}</Text>
      {showCTA && (
        <TouchableOpacity
          style={[styles.expiryCTA, { borderColor: cfg.color }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onSpend();
          }}
          activeOpacity={0.8}
        >
          <Text style={[styles.expiryCTAText, { color: cfg.color }]}>
            {state === 'warning' ? t('expiry.warning.cta') : t('expiry.critical.cta')} →
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ────────────────────────────────────────────────────
//  Styles
// ────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scroll: { flex: 1 },
  scrollContent: {
    padding: theme.spacing.lg,
  },

  // ── Header history button ──
  historyBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Hero ──
  heroOuter: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    marginBottom: theme.spacing.lg,
  },
  heroBlur: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    backgroundColor: glassCard.bg,
  },
  heroGradient: {
    padding: 28,
    alignItems: 'center',
  },
  heroLabel: {
    ...fontStyles.heading,
    fontSize: 11,
    color: theme.colors.textSecondary,
    letterSpacing: 2,
    marginBottom: theme.spacing.md,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  heroNumber: {},
  heroSub: {
    ...fontStyles.heading,
    fontSize: 12,
    letterSpacing: 1.5,
    marginTop: 2,
  },
  heroCTA: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: theme.borderRadius.md,
  },
  heroCTAText: {
    ...fontStyles.heading,
    fontSize: 15,
    letterSpacing: 1,
  },

  // ── Section card ──
  sectionCard: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    marginBottom: theme.spacing.lg,
  },
  sectionBlur: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    backgroundColor: glassCard.bg,
    // No padding here — handled per-section so tabs can sit flush at the top
  },
  sectionInner: {
    padding: theme.spacing.lg,
  },
  sectionTitle: {
    ...fontStyles.heading,
    fontSize: 13,
    color: theme.colors.textTertiary,
    letterSpacing: 2,
    marginBottom: theme.spacing.md,
  },

  // ── Period slider — flush to card top, full width, no rounded corners ──
  periodSlider: {
    borderRadius: 0,
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    marginBottom: 0,
  },

  // ── Summary columns ──
  summaryColumns: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  summaryCol: {
    flex: 1,
    gap: 4,
  },
  summaryColHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  summaryColLabel: {
    ...fontStyles.heading,
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  summaryValue: {
    lineHeight: 34,
  },
  summaryDropsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  summaryDropsLabel: {
    ...fontStyles.heading,
    fontSize: 10,
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.25)',
  },
  summarySpentHint: {
    ...fontStyles.body,
    fontSize: 9,
    color: 'rgba(255,255,255,0.20)',
    letterSpacing: 0.2,
    marginTop: 2,
    textAlign: 'center',
  },
  summaryDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: 16,
  },

  // ── Progress bar (weekly target) ──
  progressWrap: {
    marginTop: 8,
    gap: 4,
  },
  progressTrack: {
    width: '100%',
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressLabel: {
    ...fontStyles.body,
    fontSize: 10,
    color: theme.colors.textTertiary,
    letterSpacing: 0.2,
  },

  // ── Net row ──
  netRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  netLabel: {
    ...fontStyles.heading,
    fontSize: 11,
    color: theme.colors.textTertiary,
    letterSpacing: 1.5,
    flex: 1,
  },
  netValue: {},

  // ── Gym breakdown ──
  gymBreakdownRow: {
    paddingVertical: 14,
    gap: 8,
  },
  gymBreakdownRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  gymBreakdownTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  gymBreakdownName: {
    ...fontStyles.bodySemiBold,
    fontSize: 14,
    color: theme.colors.text,
    letterSpacing: 0.2,
    flex: 1,
    marginRight: theme.spacing.sm,
  },
  gymBreakdownDropsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  gymBreakdownDrops: {},
  gymBreakdownBarTrack: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  gymBreakdownBarFill: {
    height: '100%',
    borderRadius: 2,
    minWidth: 4,
  },

  // ── Expiry card ──
  expiryCard: {
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },
  expiryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: 6,
  },
  expiryTitle: {
    ...fontStyles.heading,
    fontSize: 13,
    letterSpacing: 1.5,
  },
  expiryMessage: {
    ...fontStyles.body,
    fontSize: 13,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
    lineHeight: 19,
  },
  expiryCTA: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: theme.borderRadius.sm,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
  },
  expiryCTAText: {
    ...fontStyles.bodySemiBold,
    fontSize: 13,
    letterSpacing: 0.3,
  },

  // ── Transaction history CTA card ──
  historyCtaCard: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    marginBottom: theme.spacing.lg,
  },
  historyCtaBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    backgroundColor: glassCard.bg,
  },
  historyCtaIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  historyCtaText: {
    flex: 1,
  },
  historyCtaTitle: {
    ...fontStyles.bodySemiBold,
    fontSize: 15,
    color: theme.colors.text,
    letterSpacing: 0.2,
  },
  historyCtaSub: {
    ...fontStyles.body,
    fontSize: 12,
    color: theme.colors.textTertiary,
    letterSpacing: 0.2,
    marginTop: 2,
  },
});
