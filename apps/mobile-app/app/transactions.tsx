/**
 * SWEATDROP — Transaction History Screen
 *
 * AGENT NOTE: [2026-04-20] - mobile-coder
 * Reference: docs/plans/bugfix_redemption_cancel_and_pending_spent_transactions.md Step 5
 *
 * Changes vs previous version:
 *   - Data source switched from drops_transactions direct select → get_user_transactions RPC
 *     which returns redemption_status so we can distinguish confirmed vs pending reward claims.
 *   - New TxFilter values: 'pending' and 'refunded' (per QA suggestion to separate Earned/Refunded).
 *   - 'refund' removed from 'earned' filter; it now lives exclusively in 'refunded'.
 *   - 'spent' filter applies client-side redemption_status guard: only confirmed reward_claim/
 *     redemption rows count as spent. Pending ones appear under 'pending'.
 *   - renderItem shows amber "Pending" badge + amber colour for unconfirmed reward claims,
 *     and dims cancelled rows (shows them under 'all' / 'rewards' with strikethrough).
 *
 * Related files:
 *   - apps/mobile-app/app/wallet.tsx (entry point via "See all")
 *   - apps/mobile-app/app/home.tsx (entry point via recent activity)
 *   - apps/mobile-app/app/_layout.tsx (route registration)
 *   - backend/supabase/migrations/20260420000003_get_user_transactions_rpc.sql (new RPC)
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
import { PlatformBlur } from '@/components/PlatformBlur';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { useGymStore } from '@/lib/stores/useGymStore';
import { theme, getNumberStyle, fontStyles, hexToRgba } from '@/lib/theme';
import ScreenHeader from '@/components/ScreenHeader';
import { BottomSheet } from '@/components/BottomSheet';
import { useBranding } from '@/lib/contexts/ThemeContext';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import { log } from '@/lib/logger';
import { formatTime as fmtTime, formatDate as fmtDate } from '@/lib/utils/formatDate';

// ────────────────────────────────────────────────────
//  Types & constants
// ────────────────────────────────────────────────────

// AGENT NOTE: [2026-04-20] - mobile-coder
// 'pending' and 'refunded' are new filter buckets. 'refund' removed from 'earned'.
// onlyConfirmed / pendingOnly are post-fetch client-side guards on redemption_status
// because the RPC returns all matching types and we slice by status in the render layer.
type TxFilter = 'all' | 'earned' | 'spent' | 'pending' | 'refunded' | 'rewards' | 'expired';

interface TxRow {
  id: string;
  transaction_type: string;
  amount: number;
  balance_after: number | null;
  description: string | null;
  created_at: string;
  gym_id: string | null;
  reference_id: string | null;
  redemption_status: string | null;
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

// onlyConfirmed: after fetching, keep only reward_claim/redemption rows whose
//   redemption_status = 'confirmed' (others show under 'pending').
// pendingOnly: keep only reward_claim/redemption rows whose redemption_status
//   is 'pending' or 'pending_verification'.
interface FilterDef {
  types: string[] | null;
  sign?: 'negative' | 'positive';
  onlyConfirmed?: boolean;
  pendingOnly?: boolean;
}

const FILTER_TYPES: Record<TxFilter, FilterDef> = {
  all:      { types: null },
  earned:   { types: ['session', 'checkin', 'challenge', 'bonus', 'arena', 'referral_reward', 'streak', 'milestone', 'leaderboard_prize'], sign: 'positive' },
  spent:    { types: ['reward_claim', 'redemption', 'arena_entry'], sign: 'negative', onlyConfirmed: true },
  pending:  { types: ['reward_claim', 'redemption'], sign: 'negative', pendingOnly: true },
  refunded: { types: ['refund'], sign: 'positive' },
  rewards:  { types: ['reward_claim', 'redemption', 'leaderboard_prize'] },
  expired:  { types: ['expired'] },
};

const isRedemptionType = (type: string) =>
  type === 'reward_claim' || type === 'redemption';

const FILTER_OPTIONS: {
  key: TxFilter;
  labelKey: string;
  descKey: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}[] = [
  { key: 'all',      labelKey: 'filterAll',      descKey: 'filterAllDesc',      icon: 'list-outline',         color: '#FFFFFF'  },
  { key: 'earned',   labelKey: 'filterEarned',    descKey: 'filterEarnedDesc',   icon: 'water-outline',        color: '#4CD964'  },
  { key: 'spent',    labelKey: 'filterSpent',     descKey: 'filterSpentDesc',    icon: 'bag-outline',          color: '#FF3B30'  },
  { key: 'pending',  labelKey: 'filterPending',   descKey: 'filterPendingDesc',  icon: 'time-outline',         color: '#fbbf24'  },
  { key: 'refunded', labelKey: 'filterRefunded',  descKey: 'filterRefundedDesc', icon: 'arrow-undo-outline',   color: '#60a5fa'  },
  { key: 'rewards',  labelKey: 'filterRewards',   descKey: 'filterRewardsDesc',  icon: 'gift-outline',         color: '#FFD700'  },
  { key: 'expired',  labelKey: 'filterExpired',   descKey: 'filterExpiredDesc',  icon: 'hourglass-outline',    color: '#94a3b8'  },
];

const PAGE_SIZE = 20;

// ────────────────────────────────────────────────────
//  Filter Sheet
// ────────────────────────────────────────────────────

interface FilterSheetProps {
  visible: boolean;
  activeFilter: TxFilter;
  onSelect: (f: TxFilter) => void;
  onClose: () => void;
  branding: { primary: string };
  t: (key: string) => string;
  bottomInset: number;
}

function FilterSheet({ visible, activeFilter, onSelect, onClose, branding, t, bottomInset }: FilterSheetProps) {
  return (
    <BottomSheet visible={visible} onClose={onClose} accentColor={branding.primary}>
      <Text style={sheetStyles.title}>{t('filterBy')}</Text>
      <View style={[sheetStyles.optionsWrap, { paddingBottom: bottomInset + 8 }]}>
        {FILTER_OPTIONS.map((opt, i) => {
          const isActive = activeFilter === opt.key;
          const color = opt.key === 'all' ? branding.primary : opt.color;
          return (
            <TouchableOpacity
              key={opt.key}
              style={[
                sheetStyles.optionRow,
                i < FILTER_OPTIONS.length - 1 && sheetStyles.optionDivider,
                isActive && { backgroundColor: hexToRgba(color, 0.08) },
              ]}
              onPress={() => { onSelect(opt.key); onClose(); }}
              activeOpacity={0.7}
            >
              <View style={[sheetStyles.iconBubble, { backgroundColor: hexToRgba(color, isActive ? 0.20 : 0.10) }]}>
                <Ionicons name={opt.icon} size={18} color={isActive ? color : hexToRgba(color, 0.65)} />
              </View>
              <View style={sheetStyles.optionText}>
                <Text style={[sheetStyles.optionLabel, isActive && { color }]}>{t(opt.labelKey)}</Text>
                <Text style={sheetStyles.optionDesc}>{t(opt.descKey)}</Text>
              </View>
              {isActive && (
                <View style={[sheetStyles.checkBadge, { backgroundColor: hexToRgba(color, 0.15), borderColor: hexToRgba(color, 0.45) }]}>
                  <Ionicons name="checkmark" size={13} color={color} />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </BottomSheet>
  );
}

const sheetStyles = StyleSheet.create({
  title: {
    ...fontStyles.heading,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.35)',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  optionsWrap: {
    paddingBottom: 4,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 13,
    gap: 14,
  },
  optionDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  iconBubble: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  optionText: {
    flex: 1,
    gap: 2,
  },
  optionLabel: {
    ...fontStyles.bodySemiBold,
    fontSize: 15,
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  optionDesc: {
    ...fontStyles.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
  },
  checkBadge: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});

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
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [gymScope] = useState<string | null>(activeGymId);
  const [transactions, setTransactions] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const pageRef = useRef(0);
  const loadingRef = useRef(false);

  // Client-side filter applied after fetching: for spent/pending filters,
  // gate on redemption_status to separate confirmed from in-flight claims.
  const applyStatusFilter = useCallback(
    (rows: TxRow[], filterDef: FilterDef): TxRow[] => {
      if (filterDef.onlyConfirmed) {
        return rows.filter((r) =>
          !isRedemptionType(r.transaction_type) || r.redemption_status === 'confirmed',
        );
      }
      if (filterDef.pendingOnly) {
        return rows.filter(
          (r) =>
            isRedemptionType(r.transaction_type) &&
            (r.redemption_status === 'pending' || r.redemption_status === 'pending_verification'),
        );
      }
      return rows;
    },
    [],
  );

  const loadTransactions = useCallback(
    async (page: number) => {
      if (!session?.user) return;
      if (loadingRef.current) return;
      loadingRef.current = true;
      try {
        const filterDef = FILTER_TYPES[activeFilter];

        // Fetch an extra row to detect if more pages exist
        const rpcLimit = PAGE_SIZE + 1;
        const rpcOffset = page * PAGE_SIZE;

        const { data, error } = await (supabase.rpc as any)('get_user_transactions', {
          p_gym_id:       gymScope ?? null,
          p_types:        filterDef.types ?? null,
          p_amount_sign:  filterDef.sign ?? null,
          p_limit:        rpcLimit,
          p_offset:       rpcOffset,
        });

        if (error) {
          log.error('[Transactions] Load error:', error.message);
          return;
        }

        const allRows: TxRow[] = (data ?? []).map((r: any) => ({
          id: r.id,
          transaction_type: r.transaction_type,
          amount: r.amount ?? 0,
          balance_after: r.balance_after ?? null,
          description: r.description ?? null,
          created_at: r.created_at,
          gym_id: r.gym_id ?? null,
          reference_id: r.reference_id ?? null,
          redemption_status: r.redemption_status ?? null,
        }));

        const hasNextPage = allRows.length > PAGE_SIZE;
        const pageRows = applyStatusFilter(allRows.slice(0, PAGE_SIZE), filterDef);

        if (page === 0) {
          setTransactions(pageRows);
        } else {
          setTransactions((prev) => {
            const existingIds = new Set(prev.map((t) => t.id));
            return [...prev, ...pageRows.filter((r) => !existingIds.has(r.id))];
          });
        }
        setHasMore(hasNextPage);
      } catch (err) {
        log.error('[Transactions] Unexpected error:', err);
      } finally {
        setLoading(false);
        loadingRef.current = false;
      }
    },
    [session?.user, activeFilter, gymScope, applyStatusFilter],
  );

  const refreshAll = useCallback(async () => {
    pageRef.current = 0;
    loadingRef.current = false;
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
    if (loadingRef.current || !hasMore) return;
    pageRef.current += 1;
    loadTransactions(pageRef.current);
  }, [loadTransactions, hasMore]);

  const handleFilterSelect = useCallback((filter: TxFilter) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveFilter(filter);
    pageRef.current = 0;
  }, []);

  // ── Render helpers ──

  const formatDate = (iso: string): string => {
    const d = new Date(iso);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 86400000);
    const twoDaysAgo = new Date(yesterdayStart.getTime() - 86400000);

    if (d >= todayStart) {
      return `${t('today')} · ${fmtTime(d, { hour: '2-digit', minute: '2-digit' })}`;
    }
    if (d >= yesterdayStart) {
      return `${t('yesterday')} · ${fmtTime(d, { hour: '2-digit', minute: '2-digit' })}`;
    }
    if (d >= twoDaysAgo) {
      const diffH = Math.floor((now.getTime() - d.getTime()) / 3600000);
      return `${diffH}h ago`;
    }
    return fmtDate(d, { day: 'numeric', month: 'short', year: 'numeric' });
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
      const isPendingClaim =
        isRedemptionType(tx.transaction_type) &&
        (tx.redemption_status === 'pending' || tx.redemption_status === 'pending_verification');
      const isCancelledClaim =
        isRedemptionType(tx.transaction_type) && tx.redemption_status === 'cancelled';

      const isPositive = tx.amount >= 0;
      // Pending claims show in amber; cancelled claims dim; everything else normal.
      const amountColor = isPendingClaim
        ? '#fbbf24'
        : isPositive
        ? branding.primary
        : '#FF3B30';
      const amountStr = `${isPositive ? '+' : ''}${tx.amount.toLocaleString()}`;
      const rowOpacity = isCancelledClaim ? 0.45 : 1;

      return (
        // Outer View holds opacity so it doesn't conflict with Reanimated's
        // layout animation on the inner Animated.View (mixing style.opacity
        // with entering= triggers a Reanimated warning).
        <View style={{ opacity: rowOpacity }}>
          <Animated.View
            entering={FadeInDown.delay(Math.min(index * 30, 300)).duration(350)}
          >
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
              <View style={styles.txLabelRow}>
                {isPendingClaim && (
                  <View style={styles.pendingBadge}>
                    <Text style={styles.pendingBadgeText}>{t('pendingBadge')}</Text>
                  </View>
                )}
                <Text style={styles.txDate}>{formatDate(tx.created_at)}</Text>
              </View>
            </View>

            <View style={styles.txRight}>
              <View style={styles.txAmountRow}>
                <Text
                  style={[
                    styles.txAmount,
                    getNumberStyle(15),
                    { color: amountColor },
                    isCancelledClaim && styles.txAmountStrike,
                  ]}
                >
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
        </View>
      );
    },
    [transactions.length, branding.primary, t],
  );

  // ── Active filter display ──
  const activeOpt = FILTER_OPTIONS.find((f) => f.key === activeFilter)!;
  const activeColor = activeFilter === 'all' ? branding.primary : activeOpt.color;

  const listEmpty = !loading ? (
    <View style={styles.emptyState}>
      <Ionicons name="swap-horizontal-outline" size={52} color={theme.colors.textTertiary} />
      <Text style={styles.emptyTitle}>{t('noTransactions')}</Text>
      <Text style={styles.emptySub}>{t('noTransactionsDesc')}</Text>
    </View>
  ) : null;

  const listFooter = hasMore ? (
    <TouchableOpacity
      style={[styles.loadMoreBtn, { borderColor: hexToRgba(branding.primary, 0.20) }]}
      onPress={loadMore}
      activeOpacity={0.7}
    >
      <Ionicons name="chevron-down-outline" size={14} color={branding.primary} />
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

      {/* ── Filter trigger ── */}
      <View style={styles.filterBarWrapper}>
        <TouchableOpacity
          style={[styles.filterTrigger, { borderColor: hexToRgba(activeColor, 0.30) }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setDropdownOpen(true);
          }}
          activeOpacity={0.8}
        >
          <PlatformBlur intensity={50} tint="dark" style={styles.filterTriggerBlur} androidColor="rgba(14,16,26,0.95)">
            <LinearGradient
              colors={[hexToRgba(activeColor, 0.10), 'rgba(255,255,255,0.02)']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={[styles.filterTriggerDot, { backgroundColor: activeColor }]} />
            <Ionicons name={activeOpt.icon} size={15} color={activeColor} />
            <Text style={[styles.filterTriggerLabel, { color: activeColor }]}>
              {t(activeOpt.labelKey)}
            </Text>
            <View style={styles.filterTriggerSpacer} />
            <Ionicons name="chevron-down" size={14} color={hexToRgba(activeColor, 0.6)} />
          </PlatformBlur>
        </TouchableOpacity>

        {/* Result count badge */}
        {!loading && transactions.length > 0 && (
          <View style={[styles.countBadge, { backgroundColor: hexToRgba(activeColor, 0.12), borderColor: hexToRgba(activeColor, 0.25) }]}>
            <Text style={[styles.countBadgeText, { color: hexToRgba(activeColor, 0.85) }]}>
              {transactions.length}{hasMore ? '+' : ''}
            </Text>
          </View>
        )}
      </View>

      {/* ── List ── */}
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

      {/* ── Filter bottom sheet ── */}
      <FilterSheet
        visible={dropdownOpen}
        activeFilter={activeFilter}
        onSelect={handleFilterSelect}
        onClose={() => setDropdownOpen(false)}
        branding={branding}
        t={t}
        bottomInset={insets.bottom}
      />
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
    paddingTop: 4,
    paddingBottom: 40,
  },

  // ── Filter trigger ──
  filterBarWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  filterTrigger: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    height: 44,
  },
  filterTriggerBlur: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 8,
    borderRadius: 14,
    overflow: 'hidden',
  },
  filterTriggerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  filterTriggerLabel: {
    ...fontStyles.heading,
    fontSize: 13,
    letterSpacing: 0.6,
  },
  filterTriggerSpacer: {
    flex: 1,
  },
  countBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  countBadgeText: {
    ...getNumberStyle(12),
    fontWeight: '600',
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
  txLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexWrap: 'nowrap',
  },
  pendingBadge: {
    backgroundColor: 'rgba(251,191,36,0.15)',
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
    flexShrink: 0,
  },
  pendingBadgeText: {
    ...fontStyles.bodySemiBold,
    fontSize: 9,
    color: '#fbbf24',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  txLabel: {
    ...fontStyles.bodySemiBold,
    fontSize: 14,
    color: theme.colors.text,
    letterSpacing: 0.2,
    flexShrink: 1,
  },
  txAmountStrike: {
    textDecorationLine: 'line-through',
    opacity: 0.6,
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
  loadMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 4,
    marginBottom: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  loadMoreText: {
    ...fontStyles.bodySemiBold,
    fontSize: 13,
    letterSpacing: 0.3,
  },

  // ── Loading ──
  loadingIndicator: {
    position: 'absolute',
    alignSelf: 'center',
    top: '50%',
  },
});
