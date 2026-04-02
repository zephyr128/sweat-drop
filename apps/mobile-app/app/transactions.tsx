/**
 * SWEATDROP — Transaction History Screen
 *
 * AGENT NOTE: [2026-04-02] - mobile-coder
 * Reference: docs/plans/bugfix_transaction_list_cancel_redemption_push_notifications.md
 * Bug #1 Step 2: Full-screen paginated transaction history with type filters and balance_after.
 *
 * Related files:
 *   - apps/mobile-app/app/wallet.tsx (entry point via "See all")
 *   - apps/mobile-app/app/home.tsx (entry point via recent activity)
 *   - apps/mobile-app/app/_layout.tsx (route registration)
 */
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { useGymStore } from '@/lib/stores/useGymStore';
import { theme, getNumberStyle, fontStyles, hexToRgba } from '@/lib/theme';
import ScreenHeader from '@/components/ScreenHeader';
import { SliderTabs } from '@/components/SliderTabs';
import { useBranding } from '@/lib/contexts/ThemeContext';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { log } from '@/lib/logger';

// ────────────────────────────────────────────────────
//  Types & constants
// ────────────────────────────────────────────────────

type TxFilter = 'all' | 'earned' | 'spent' | 'rewards' | 'expired';

interface TxRow {
  id: string;
  transaction_type: string;
  amount: number;
  balance_after: number | null;
  description: string | null;
  created_at: string;
  gym_id: string | null;
}

const TX_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  session: 'bicycle-outline',
  checkin: 'location-outline',
  challenge: 'trophy-outline',
  referral_reward: 'people-outline',
  redemption: 'bag-outline',
  reward_claim: 'gift-outline',
  milestone: 'medal-outline',
  streak: 'flame-outline',
  expired: 'hourglass-outline',
  bonus: 'star-outline',
  arena: 'shield-outline',
  arena_entry: 'shield-half-outline',
  refund: 'arrow-undo-outline',
  leaderboard_prize: 'podium-outline',
};

const FILTER_TYPES: Record<TxFilter, string[] | null> = {
  all: null,
  earned: ['session', 'checkin', 'challenge', 'bonus', 'arena', 'referral_reward', 'streak', 'milestone', 'refund', 'leaderboard_prize'],
  spent: ['redemption', 'reward_claim', 'arena_entry'],
  rewards: ['redemption', 'reward_claim', 'leaderboard_prize'],
  expired: ['expired'],
};

const PAGE_SIZE = 20;

// ────────────────────────────────────────────────────
//  Screen
// ────────────────────────────────────────────────────

export default function TransactionsScreen() {
  const { t } = useTranslation('transactions');
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const branding = useBranding();
  const { getActiveGymId } = useGymStore();
  const activeGymId = getActiveGymId();
  const params = useLocalSearchParams<{ filter?: string }>();

  const [activeFilter, setActiveFilter] = useState<TxFilter>(
    (params.filter as TxFilter) ?? 'all',
  );
  const [gymScope, setGymScope] = useState<string | null>(activeGymId);
  const [transactions, setTransactions] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const pageRef = useRef(0);

  const loadTransactions = useCallback(
    async (page: number) => {
      if (!session?.user) return;
      try {
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE;

        const filterTypes = FILTER_TYPES[activeFilter];

        // Negative-only for 'spent' filter
        const isSpentFilter = activeFilter === 'spent';

        let query = supabase
          .from('drops_transactions')
          .select('id, transaction_type, amount, balance_after, description, created_at, gym_id')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false })
          .range(from, to);

        if (gymScope) query = query.eq('gym_id', gymScope);
        if (filterTypes) query = query.in('transaction_type', filterTypes);
        if (isSpentFilter) query = query.lt('amount', 0);

        const { data, error } = await query;
        if (error) {
          log.error('[Transactions] Load error:', error.message);
          return;
        }

        const rows: TxRow[] = (data ?? []).map((r) => ({
          id: r.id,
          transaction_type: r.transaction_type,
          amount: r.amount ?? 0,
          balance_after: r.balance_after ?? null,
          description: r.description ?? null,
          created_at: r.created_at,
          gym_id: r.gym_id,
        }));

        if (page === 0) {
          setTransactions(rows);
        } else {
          setTransactions((prev) => [...prev, ...rows]);
        }
        setHasMore(rows.length > PAGE_SIZE);
      } catch (err) {
        log.error('[Transactions] Unexpected error:', err);
      } finally {
        setLoading(false);
      }
    },
    [session?.user, activeFilter, gymScope],
  );

  const refreshAll = useCallback(async () => {
    pageRef.current = 0;
    setLoading(true);
    await loadTransactions(0);
  }, [loadTransactions]);

  useEffect(() => {
    if (session?.user) refreshAll();
  }, [session?.user, activeFilter, gymScope]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  }, [refreshAll]);

  const loadMore = useCallback(() => {
    pageRef.current += 1;
    loadTransactions(pageRef.current);
  }, [loadTransactions]);

  // ── Render helpers ──

  const formatDate = (iso: string): string => {
    const d = new Date(iso);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 86400000);
    const twoDaysAgo = new Date(yesterdayStart.getTime() - 86400000);

    if (d >= todayStart) {
      return `${t('today')} · ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
    }
    if (d >= yesterdayStart) {
      return `${t('yesterday')} · ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
    }
    if (d >= twoDaysAgo) {
      const diffH = Math.floor((now.getTime() - d.getTime()) / 3600000);
      return `${diffH}h ago`;
    }
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const getTxLabel = (tx: TxRow): string => {
    if (tx.description) return tx.description;
    const key = `txType.${tx.transaction_type}`;
    const translated = t(key);
    if (translated !== key) return translated;
    return tx.transaction_type.replace(/_/g, ' ');
  };

  const getTxIcon = (type: string): keyof typeof Ionicons.glyphMap =>
    TX_ICONS[type] ?? 'swap-horizontal-outline';

  const renderItem = useCallback(
    ({ item: tx, index }: { item: TxRow; index: number }) => {
      const isPositive = tx.amount >= 0;
      const amountColor = isPositive ? branding.primary : '#FF3B30';
      const amountStr = `${isPositive ? '+' : ''}${tx.amount.toLocaleString()}`;

      return (
        <Animated.View entering={FadeInDown.delay(Math.min(index * 30, 300)).duration(350)}>
          <View
            style={[
              styles.txRow,
              index < transactions.length - 1 && styles.txRowBorder,
            ]}
          >
            <View
              style={[
                styles.txIconWrap,
                { backgroundColor: hexToRgba(amountColor, 0.08) },
              ]}
            >
              <Ionicons name={getTxIcon(tx.transaction_type)} size={18} color={amountColor} />
            </View>

            <View style={styles.txInfo}>
              <Text style={styles.txLabel} numberOfLines={1}>
                {getTxLabel(tx)}
              </Text>
              <Text style={styles.txDate}>{formatDate(tx.created_at)}</Text>
            </View>

            <View style={styles.txRight}>
              <View style={styles.txAmountRow}>
                <Text style={[styles.txAmount, getNumberStyle(15), { color: amountColor }]}>
                  {amountStr}
                </Text>
                <Ionicons name="water" size={13} color={amountColor} />
              </View>
              {tx.balance_after != null && (
                <Text style={styles.txBalance}>
                  {t('balanceAfter')}: {tx.balance_after.toLocaleString()}
                </Text>
              )}
            </View>
          </View>
        </Animated.View>
      );
    },
    [transactions.length, branding.primary],
  );

  // ── Filter pills ──

  const filterTabs = [
    { key: 'all', label: t('filterAll') },
    { key: 'earned', label: t('filterEarned') },
    { key: 'spent', label: t('filterSpent') },
    { key: 'rewards', label: t('filterRewards') },
    { key: 'expired', label: t('filterExpired') },
  ];

  const listHeader = (
    <SliderTabs
      tabs={filterTabs}
      activeKey={activeFilter}
      onChange={(key) => {
        setActiveFilter(key as TxFilter);
        pageRef.current = 0;
      }}
      accentColor={branding.primary}
      barStyle={styles.filterSlider}
    />
  );

  const listEmpty = !loading ? (
    <View style={styles.emptyState}>
      <Ionicons name="swap-horizontal-outline" size={52} color={theme.colors.textTertiary} />
      <Text style={styles.emptyTitle}>{t('noTransactions')}</Text>
      <Text style={styles.emptySub}>{t('noTransactionsDesc')}</Text>
    </View>
  ) : null;

  const listFooter = hasMore ? (
    <TouchableOpacity style={styles.loadMore} onPress={loadMore} activeOpacity={0.7}>
      <Text style={[styles.loadMoreText, { color: branding.primary }]}>
        {t('loadMore')}
      </Text>
    </TouchableOpacity>
  ) : null;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#000000', '#0A0E1A', '#000000']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <ScreenHeader title={t('title')} />

      <FlatList
        data={loading ? [] : transactions}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        style={styles.list}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={branding.primary}
          />
        }
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        ListFooterComponent={listFooter}
        onEndReached={hasMore ? loadMore : undefined}
        onEndReachedThreshold={0.3}
      />

      {loading && (
        <ActivityIndicator
          color={branding.primary}
          style={styles.loadingIndicator}
        />
      )}
    </View>
  );
}

// ────────────────────────────────────────────────────
//  Styles
// ────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: 40,
  },

  // ── Filter slider ──
  filterSlider: {
    marginBottom: theme.spacing.lg,
  },

  // ── Transaction rows ──
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    gap: 12,
  },
  txRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  txIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  txInfo: {
    flex: 1,
    minWidth: 0,
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
  txRight: {
    alignItems: 'flex-end',
    gap: 2,
    flexShrink: 0,
  },
  txAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  txAmount: {},
  txBalance: {
    ...fontStyles.body,
    fontSize: 10,
    color: 'rgba(255,255,255,0.25)',
    letterSpacing: 0.2,
  },

  // ── Empty ──
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
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

  // ── Loading ──
  loadingIndicator: {
    position: 'absolute',
    alignSelf: 'center',
    top: '50%',
  },
});
