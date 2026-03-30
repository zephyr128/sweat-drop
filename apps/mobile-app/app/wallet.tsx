import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
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
import BackButton from '@/components/BackButton';
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

interface ExpiryData {
  expiringIn7d: number;
  expiringIn30d: number;
  nextExpiryDate: string | null;
  daysSinceLastVisit: number;
}

interface Transaction {
  id: string;
  type: string;
  amount: number;
  created_at: string;
  metadata?: Record<string, any>;
}

const TX_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  session: 'bicycle-outline',
  checkin: 'location-outline',
  challenge: 'trophy-outline',
  referral_reward: 'people-outline',
  redemption: 'bag-outline',
  milestone: 'medal-outline',
  streak: 'flame-outline',
  expired: 'hourglass-outline',
  bonus: 'star-outline',
  arena: 'shield-outline',
  refund: 'arrow-undo-outline',
};

const PAGE_SIZE = 15;

// ────────────────────────────────────────────────────
//  Screen
// ────────────────────────────────────────────────────

export default function WalletScreen() {
  const router = useRouter();
  const { session } = useSession();
  const branding = useBranding();
  const { t } = useTranslation('wallet');
  const { activeGym, getActiveGymId } = useGymStore();
  const activeGymId = getActiveGymId();
  const { localDrops, refreshLocalDrops } = useLocalDrops(activeGymId);
  const dropLimits = useDropLimitStatus(activeGymId);

  const [earned, setEarned] = useState<EarnedData>({ today: 0, week: 0, month: 0, allTime: 0 });
  const [expiry, setExpiry] = useState<ExpiryData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txLoading, setTxLoading] = useState(true);
  const [hasMoreTx, setHasMoreTx] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const pageRef = useRef(0);

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

  const loadEarned = useCallback(async () => {
    if (!session?.user || !activeGymId) return;
    try {
      const userId = session.user.id;
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const dayOfWeek = now.getDay();
      const weekOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - weekOffset);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const EARN_TYPES = ['session', 'checkin', 'challenge', 'bonus', 'arena', 'referral_reward', 'streak'];

      let query = supabase
        .from('drops_transactions')
        .select('amount, created_at')
        .eq('user_id', userId)
        .gt('amount', 0)
        .in('transaction_type', EARN_TYPES)
        .order('created_at', { ascending: false })
        .limit(500);
      if (selectedGymId) query = query.eq('gym_id', selectedGymId);

      const { data: txRows } = await query;

      let today = 0;
      let week = 0;
      let month = 0;
      let allTime = 0;
      for (const row of txRows ?? []) {
        const a = row.amount ?? 0;
        const d = new Date(row.created_at);
        allTime += a;
        if (d >= monthStart) month += a;
        if (d >= weekStart) week += a;
        if (d >= todayStart) today += a;
      }
      setEarned({ today, week, month, allTime });
    } catch (err) {
      log.error('[Wallet] Error loading earned:', err);
    }
  }, [session?.user, activeGymId, scope]);

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

      const { data: lastCheckin } = await supabase
        .from('gym_checkins')
        .select('checked_in_at')
        .eq('user_id', session.user.id)
        .order('checked_in_at', { ascending: false })
        .limit(1)
        .single();

      const daysSinceLastVisit = lastCheckin?.checked_in_at
        ? Math.floor((Date.now() - new Date(lastCheckin.checked_in_at).getTime()) / 86400000)
        : 999;

      if (row) {
        setExpiry({
          expiringIn7d: Number(row.expiring_in_7d ?? 0),
          expiringIn30d: Number(row.expiring_in_30d ?? 0),
          nextExpiryDate: row.next_expiry_date ?? null,
          daysSinceLastVisit,
        });
      } else {
        setExpiry({ expiringIn7d: 0, expiringIn30d: 0, nextExpiryDate: null, daysSinceLastVisit });
      }
    } catch {
      setExpiry(null);
    }
  }, [session?.user, activeGymId]);

  const loadTransactions = useCallback(async (page: number) => {
    if (!session?.user) return;
    try {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE;

      let query = supabase
        .from('drops_transactions')
        .select('id, amount, transaction_type, created_at, metadata')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .range(from, to);
      if (selectedGymId) query = query.eq('gym_id', selectedGymId);

      const { data } = await query;

      const rows: Transaction[] = (data ?? []).map((r) => ({
        id: r.id,
        type: r.transaction_type,
        amount: r.amount ?? 0,
        created_at: r.created_at,
        metadata: r.metadata as Record<string, any> | undefined,
      }));

      if (page === 0) {
        setTransactions(rows);
      } else {
        setTransactions((prev) => [...prev, ...rows]);
      }
      setHasMoreTx(rows.length > PAGE_SIZE);
      setTxLoading(false);
    } catch (err) {
      log.error('[Wallet] Error loading transactions:', err);
    }
  }, [session?.user, scope]);

  const refreshAll = useCallback(async () => {
    pageRef.current = 0;
    setTxLoading(true);
    await Promise.all([
      loadGyms(),
      loadEarned(),
      loadExpiry(),
      loadTransactions(0),
      refreshLocalDrops(),
    ]);
  }, [loadGyms, loadEarned, loadExpiry, loadTransactions, refreshLocalDrops]);

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
    pollIntervalMs: 30_000,
    enabled: !!session?.user,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  }, [refreshAll]);

  const loadMoreTx = useCallback(() => {
    pageRef.current += 1;
    loadTransactions(pageRef.current);
  }, [loadTransactions]);

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

  const weeklyTarget = dropLimits.maxDropsPerWeek || 1500;
  const weeklyProgress = Math.min(earned.week / weeklyTarget, 1);

  const heroBalance = scope === 'gym' ? localDrops : totalDrops;
  const heroLabel = scope === 'gym'
    ? t('availableToSpend')
    : t('totalBalance');

  // ── Render helpers ──

  const formatDate = (iso: string): string => {
    const d = new Date(iso);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 86400000);

    if (d >= todayStart) {
      return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    }
    if (d >= yesterdayStart) {
      return t('common:back') || 'Yesterday';
    }
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const getTxIcon = (type: string): keyof typeof Ionicons.glyphMap =>
    TX_ICONS[type] ?? 'swap-horizontal-outline';

  const getTxLabel = (tx: Transaction): string => {
    const key = `txType.${tx.type}`;
    const translated = t(key);
    if (translated !== key) return translated;
    return tx.type.replace(/_/g, ' ');
  };

  // ────────────────────────────────────────────────────
  //  UI
  // ────────────────────────────────────────────────────

  const renderTransaction = useCallback(({ item: tx, index }: { item: Transaction; index: number }) => (
    <View style={[styles.txRow, index < transactions.length - 1 && styles.txRowBorder]}>
      <View style={[styles.txIconWrap, { backgroundColor: hexToRgba(tx.amount >= 0 ? branding.primary : '#FF3B30', 0.08) }]}>
        <Ionicons
          name={getTxIcon(tx.type)}
          size={18}
          color={tx.amount >= 0 ? branding.primary : '#FF3B30'}
        />
      </View>
      <View style={styles.txInfo}>
        <Text style={styles.txLabel} numberOfLines={1}>
          {getTxLabel(tx)}
        </Text>
        <Text style={styles.txDate}>{formatDate(tx.created_at)}</Text>
      </View>
      <Text
        style={[
          styles.txAmount,
          getNumberStyle(16),
          { color: tx.amount >= 0 ? branding.primary : '#FF3B30' },
        ]}
      >
        {tx.amount >= 0 ? '+' : ''}{tx.amount} 💧
      </Text>
    </View>
  ), [transactions.length, branding.primary]);

  const walletListHeader = useMemo(() => (
    <>
      {userGyms.length > 1 && (
        <Animated.View entering={FadeInDown.delay(40).duration(400)}>
          <View style={[styles.scopeToggle, { borderColor: hexToRgba(branding.primary, 0.15) }]}>
            <BlurView intensity={glassCard.blur} tint="dark" style={[styles.scopeToggleBlur, { backgroundColor: glassCard.bg }]}>
              {([
                { key: 'gym' as ScopeType, label: t('myGym'), icon: 'location' as const },
                { key: 'global' as ScopeType, label: t('global'), icon: 'globe-outline' as const },
              ]).map((tab) => (
                <TouchableOpacity
                  key={tab.key}
                  style={[
                    styles.scopeTab,
                    scope === tab.key && {
                      backgroundColor: hexToRgba(branding.primary, 0.15),
                      borderColor: hexToRgba(branding.primary, 0.3),
                      borderWidth: 1,
                    },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setScope(tab.key);
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={tab.icon}
                    size={14}
                    color={scope === tab.key ? branding.primary : 'rgba(255,255,255,0.40)'}
                  />
                  <Text
                    style={[
                      styles.scopeTabText,
                      scope === tab.key && { color: branding.primary },
                    ]}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </BlurView>
          </View>
        </Animated.View>
      )}

      <Animated.View entering={FadeInDown.delay(80).duration(500)}>
        <View style={[styles.heroOuter, { borderColor: hexToRgba(branding.primary, 0.25) }]}>
          <BlurView intensity={glassCard.blur} tint="dark" style={styles.heroBlur}>
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
          </BlurView>
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(180).duration(500)}>
        <View style={[styles.sectionCard, { borderColor: hexToRgba(branding.primary, 0.12) }]}>
          <BlurView intensity={glassCard.blur} tint="dark" style={styles.sectionBlur}>
            <Text style={styles.sectionTitle}>{t('earned')}</Text>

            <EarnedRow
              icon="today-outline"
              label={t('today')}
              value={earned.today}
              color={branding.primary}
              last={false}
            />
            <EarnedRow
              icon="calendar-outline"
              label={t('thisWeek')}
              value={earned.week}
              color={branding.primary}
              last={false}
              progressFill={weeklyProgress}
              progressLabel={t('weeklyTarget', { target: weeklyTarget.toLocaleString() })}
            />
            <EarnedRow
              icon="stats-chart-outline"
              label={t('thisMonth')}
              value={earned.month}
              color={branding.primary}
              last={false}
            />
            <EarnedRow
              icon="trophy-outline"
              label={t('allTime')}
              value={earned.allTime}
              color={branding.primary}
              last
            />
          </BlurView>
        </View>
      </Animated.View>

      {scope === 'global' && userGyms.length > 0 && (
        <Animated.View entering={FadeInDown.delay(240).duration(500)}>
          <View style={[styles.sectionCard, { borderColor: hexToRgba(branding.primary, 0.12) }]}>
            <BlurView intensity={glassCard.blur} tint="dark" style={styles.sectionBlur}>
              <Text style={styles.sectionTitle}>{t('balanceByGym')}</Text>
              {(() => {
                const maxDrops = Math.max(...userGyms.map((g) => g.local_drops), 1);
                return userGyms.map((gym, idx) => (
                  <Animated.View
                    key={gym.id}
                    entering={FadeInDown.delay(260 + idx * 60).duration(350)}
                  >
                    <TouchableOpacity
                      style={[
                        styles.gymBreakdownRow,
                        idx < userGyms.length - 1 && styles.gymBreakdownRowBorder,
                      ]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setScope('gym');
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.gymBreakdownTop}>
                        <Text style={styles.gymBreakdownName} numberOfLines={1}>
                          {gym.name}
                        </Text>
                        <View style={styles.gymBreakdownDropsRow}>
                          <Ionicons name="water" size={14} color={branding.primary} />
                          <Text
                            style={[
                              styles.gymBreakdownDrops,
                              getNumberStyle(15),
                              { color: branding.primary },
                            ]}
                          >
                            {gym.local_drops.toLocaleString()}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.gymBreakdownBarTrack}>
                        <Animated.View
                          style={[
                            styles.gymBreakdownBarFill,
                            {
                              width: `${Math.round((gym.local_drops / maxDrops) * 100)}%`,
                              backgroundColor: branding.primary,
                            },
                          ]}
                        />
                      </View>
                    </TouchableOpacity>
                  </Animated.View>
                ));
              })()}
            </BlurView>
          </View>
        </Animated.View>
      )}

      {expiry && (
        <Animated.View entering={FadeInDown.delay(280).duration(500)}>
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

      <Text style={styles.sectionTitle}>{t('activity')}</Text>

      {txLoading && (
        <ActivityIndicator
          color={branding.primary}
          style={{ marginTop: theme.spacing.lg }}
        />
      )}
    </>
  ), [scope, branding, heroBalance, heroLabel, earned, weeklyProgress, weeklyTarget, userGyms, expiry, expiryState, dropsAtRisk, daysUntilExpiry, txLoading, activeGymId]);

  const walletListEmpty = useMemo(() => {
    if (txLoading) return null;
    return (
      <View style={styles.emptyState}>
        <Ionicons name="water-outline" size={48} color={theme.colors.textTertiary} />
        <Text style={styles.emptyTitle}>{t('noActivity')}</Text>
        <Text style={styles.emptySub}>{t('noActivityDesc')}</Text>
        <TouchableOpacity
          style={[styles.emptyCTA, { borderColor: hexToRgba(branding.primary, 0.3) }]}
          onPress={() => router.push('/scan')}
          activeOpacity={0.8}
        >
          <Text style={[styles.emptyCTAText, { color: branding.primary }]}>
            {t('startWorkout')} →
          </Text>
        </TouchableOpacity>
      </View>
    );
  }, [txLoading, branding.primary]);

  const walletListFooter = useMemo(() => {
    if (!hasMoreTx) return null;
    return (
      <TouchableOpacity style={styles.loadMore} onPress={loadMoreTx} activeOpacity={0.7}>
        <Text style={[styles.loadMoreText, { color: branding.primary }]}>
          {t('loadMore')}
        </Text>
      </TouchableOpacity>
    );
  }, [hasMoreTx, branding.primary, loadMoreTx]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <LinearGradient
        colors={['#000000', '#080A14', '#000000']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <View style={styles.header}>
        <BackButton />
        <Text style={styles.headerTitle}>{t('title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={txLoading ? [] : transactions}
        renderItem={renderTransaction}
        keyExtractor={(item) => item.id}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={branding.primary}
          />
        }
        ListHeaderComponent={walletListHeader}
        ListEmptyComponent={walletListEmpty}
        ListFooterComponent={walletListFooter}
        onEndReached={hasMoreTx ? loadMoreTx : undefined}
        onEndReachedThreshold={0.3}
      />
    </SafeAreaView>
  );
}

// ────────────────────────────────────────────────────
//  Sub-components
// ────────────────────────────────────────────────────

function EarnedRow({
  icon,
  label,
  value,
  color,
  last,
  progressFill,
  progressLabel,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number;
  color: string;
  last: boolean;
  progressFill?: number;
  progressLabel?: string;
}) {
  return (
    <View style={[styles.earnedRow, !last && styles.earnedRowBorder]}>
      <View style={styles.earnedLeft}>
        <Ionicons name={icon} size={18} color={color} />
        <Text style={styles.earnedLabel}>{label}</Text>
      </View>
      <View style={styles.earnedRight}>
        <View style={styles.earnedAmountRow}>
          <Ionicons name="water" size={16} color={color} />
          <Text style={[styles.earnedValue, getNumberStyle(17), { color }]}>
            {value.toLocaleString()}
          </Text>
        </View>
        {progressFill != null && (
          <View style={styles.progressWrap}>
            <View style={styles.progressTrack}>
              <Animated.View
                style={[
                  styles.progressFill,
                  { width: `${Math.round(progressFill * 100)}%`, backgroundColor: color },
                ]}
              />
            </View>
            {progressLabel && (
              <Text style={styles.progressLabel}>{progressLabel}</Text>
            )}
          </View>
        )}
      </View>
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
  scroll: { flex: 1 },
  scrollContent: {
    padding: theme.spacing.lg,
    paddingBottom: 48,
  },

  // ── Scope toggle ──
  scopeToggle: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    marginBottom: theme.spacing.md,
    borderWidth: 1,
  },
  scopeToggleBlur: {
    flexDirection: 'row',
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    padding: 4,
  },
  scopeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  scopeTabText: {
    ...fontStyles.heading,
    fontSize: 14,
    color: 'rgba(255,255,255,0.40)',
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
    padding: theme.spacing.lg,
  },
  sectionTitle: {
    ...fontStyles.heading,
    fontSize: 13,
    color: theme.colors.textSecondary,
    letterSpacing: 2,
    marginBottom: theme.spacing.md,
  },

  // ── Earned rows ──
  earnedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 14,
  },
  earnedRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  earnedLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  earnedLabel: {
    ...fontStyles.body,
    fontSize: 15,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
  },
  earnedRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  earnedAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  earnedValue: {},
  progressWrap: {
    alignItems: 'flex-end',
    gap: 3,
    width: 100,
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

  // ── Transactions ──
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  txRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  txIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  txInfo: {
    flex: 1,
    gap: 2,
  },
  txLabel: {
    ...fontStyles.bodySemiBold,
    fontSize: 14,
    color: theme.colors.text,
    letterSpacing: 0.2,
  },
  txDate: {
    ...fontStyles.body,
    fontSize: 11,
    color: theme.colors.textTertiary,
    letterSpacing: 0.2,
  },
  txAmount: {},

  // ── Empty state ──
  emptyState: {
    alignItems: 'center',
    paddingVertical: theme.spacing['2xl'],
    gap: theme.spacing.sm,
  },
  emptyTitle: {
    ...fontStyles.heading,
    fontSize: 18,
    color: theme.colors.text,
  },
  emptySub: {
    ...fontStyles.body,
    fontSize: 13,
    color: theme.colors.textTertiary,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  emptyCTA: {
    marginTop: theme.spacing.md,
    borderWidth: 1,
    borderRadius: theme.borderRadius.sm,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  emptyCTAText: {
    ...fontStyles.bodySemiBold,
    fontSize: 14,
    letterSpacing: 0.3,
  },

  // ── Load more ──
  loadMore: {
    alignItems: 'center',
    paddingVertical: theme.spacing.lg,
  },
  loadMoreText: {
    ...fontStyles.bodySemiBold,
    fontSize: 14,
    letterSpacing: 0.3,
  },
});
