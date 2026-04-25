import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Clipboard,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { useAppModal } from '@/lib/stores/useAppModal';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useCallback, useRef, useEffect } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { PlatformBlur } from '@/components/PlatformBlur';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';
import { useSession } from '@/hooks/useSession';
import { theme, getNumberStyle, fontStyles, hexToRgba } from '@/lib/theme';
import ScreenHeader from '@/components/ScreenHeader';
import { useGymStore } from '@/lib/stores/useGymStore';
import { Ionicons } from '@expo/vector-icons';
import { useBranding } from '@/lib/contexts/ThemeContext';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { formatDate as fmtDate } from '@/lib/utils/formatDate';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { BottomSheet } from '@/components/BottomSheet';
import { VerificationSheet } from '@/components/VerificationSheet';
import {
  getRedemptionDisplayState,
  DISPLAY_STATE_COLOR,
  DISPLAY_STATE_ICON,
  DISPLAY_STATE_LABEL_KEY,
  type RedemptionDisplayState,
} from '@/lib/redemption-state';

const PAGE_SIZE = 20;

type StatusFilter = 'all' | 'pending' | 'confirmed' | 'cancelled' | 'expired';

// Legacy status colours used only for the filter pill in the filter sheet.
// Card-level colours are driven by DISPLAY_STATE_COLOR from lib/redemption-state.ts.
const STATUS_CONFIG: Record<string, { color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  pending:                { color: '#fbbf24', icon: 'time-outline'         },
  pending_verification:   { color: '#f59e0b', icon: 'shield-outline'       },
  confirmed:              { color: '#4ade80', icon: 'checkmark-circle'     },
  cancelled:              { color: '#f87171', icon: 'close-circle'         },
  expired:                { color: '#94a3b8', icon: 'alert-circle-outline' },
};

const FILTER_OPTIONS: {
  key: StatusFilter;
  labelKey: string;
  descKey: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}[] = [
  { key: 'all',       labelKey: 'filterAll',       descKey: 'filterAllDesc',       icon: 'list-outline',        color: '#FFFFFF'  },
  { key: 'pending',   labelKey: 'pending',          descKey: 'filterPendingDesc',   icon: 'time-outline',        color: '#fbbf24'  },
  { key: 'confirmed', labelKey: 'filterConfirmed',  descKey: 'filterConfirmedDesc', icon: 'checkmark-circle',    color: '#4ade80'  },
  { key: 'cancelled', labelKey: 'filterCancelled',  descKey: 'filterCancelledDesc', icon: 'close-circle',        color: '#f87171'  },
  { key: 'expired',   labelKey: 'filterExpired',    descKey: 'filterExpiredDesc',   icon: 'alert-circle-outline',color: '#94a3b8'  },
];

interface TabState {
  data: any[];
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  page: number;
}

const defaultTabState = (): TabState => ({
  data: [], loading: false, refreshing: false, loadingMore: false, hasMore: true, page: 0,
});

// ── Filter Sheet ─────────────────────────────────────────────────────────────

interface FilterSheetProps {
  visible: boolean;
  activeFilter: StatusFilter;
  onSelect: (f: StatusFilter) => void;
  onClose: () => void;
  branding: { primary: string };
  t: (key: string) => string;
  bottomInset: number;
}

function FilterSheet({ visible, activeFilter, onSelect, onClose, branding, t, bottomInset }: FilterSheetProps) {
  return (
    <BottomSheet visible={visible} onClose={onClose} accentColor={branding.primary}>
      <Text style={filterStyles.title}>{t('filterBy')}</Text>
      <View style={[filterStyles.optionsWrap, { paddingBottom: bottomInset + 8 }]}>
        {FILTER_OPTIONS.map((opt, i) => {
          const isActive = activeFilter === opt.key;
          const color = opt.key === 'all' ? branding.primary : opt.color;
          return (
            <TouchableOpacity
              key={opt.key}
              style={[
                filterStyles.optionRow,
                i < FILTER_OPTIONS.length - 1 && filterStyles.optionDivider,
                isActive && { backgroundColor: hexToRgba(color, 0.08) },
              ]}
              onPress={() => { onSelect(opt.key); onClose(); }}
              activeOpacity={0.7}
            >
              <View style={[filterStyles.iconBubble, { backgroundColor: hexToRgba(color, isActive ? 0.20 : 0.10) }]}>
                <Ionicons name={opt.icon} size={18} color={isActive ? color : hexToRgba(color, 0.65)} />
              </View>
              <View style={filterStyles.optionText}>
                <Text style={[filterStyles.optionLabel, isActive && { color }]}>{t(opt.labelKey)}</Text>
                <Text style={filterStyles.optionDesc}>{t(opt.descKey)}</Text>
              </View>
              {isActive && (
                <View style={[filterStyles.checkBadge, { backgroundColor: hexToRgba(color, 0.15), borderColor: hexToRgba(color, 0.45) }]}>
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

const filterStyles = StyleSheet.create({
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

// ── Main Screen ──────────────────────────────────────────────────────────────

export default function RedemptionsScreen() {
  const { t } = useTranslation('redemptions');
  const { highlight, verify } = useLocalSearchParams<{ highlight?: string; verify?: string }>();
  const showModal = useAppModal((s) => s.showModal);
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const { getActiveGymId } = useGymStore();
  const branding = useBranding();
  const activeGymId = getActiveGymId();
  const scrollRef = useRef<ScrollView>(null);
  const cardPositions = useRef<Record<string, number>>({});
  const [highlightId, setHighlightId] = useState<string | null>(highlight ?? null);
  // Auto-open VerificationSheet when arriving from a "requires verification" push tap.
  useEffect(() => {
    if (verify === '1') {
      const timer = setTimeout(() => setVerificationSheetVisible(true), 600);
      return () => clearTimeout(timer);
    }
  }, [verify]);

  const [activeFilter, setActiveFilter] = useState<StatusFilter>('all');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [verificationSheetVisible, setVerificationSheetVisible] = useState(false);

  const [tabStates, setTabStates] = useState<Record<StatusFilter, TabState>>(() => {
    const init = {} as Record<StatusFilter, TabState>;
    FILTER_OPTIONS.forEach((f) => { init[f.key] = defaultTabState(); });
    return init;
  });

  const setTab = useCallback((filter: StatusFilter, patch: Partial<TabState>) => {
    setTabStates((prev) => ({ ...prev, [filter]: { ...prev[filter], ...patch } }));
  }, []);

  const fetchPage = useCallback(async (filter: StatusFilter, page: number, append: boolean) => {
    if (!session?.user) return;

    const statuses: string[] | undefined =
      filter === 'pending' ? ['pending', 'pending_verification'] :
      filter !== 'all'     ? [filter] :
      undefined;

    const { data, error } = await supabase.rpc('get_my_redemptions', {
      p_gym_id:   activeGymId ?? undefined,
      p_statuses: statuses,
      p_limit:    PAGE_SIZE,
      p_offset:   page * PAGE_SIZE,
    });
    if (error) { log.error('[Redemptions] fetch error:', error); return; }

    const rows = data || [];
    if (append) {
      setTabStates((prev) => ({
        ...prev,
        [filter]: { ...prev[filter], data: [...prev[filter].data, ...rows], hasMore: rows.length === PAGE_SIZE, page },
      }));
    } else {
      setTab(filter, { data: rows, hasMore: rows.length === PAGE_SIZE, page: 0 });
    }
  }, [activeGymId, session?.user, setTab]);

  const load = useCallback(async (filter: StatusFilter) => {
    setTab(filter, { loading: true });
    try { await fetchPage(filter, 0, false); }
    finally { setTab(filter, { loading: false }); }
  }, [fetchPage, setTab]);

  const onRefresh = useCallback(async () => {
    setTab(activeFilter, { refreshing: true });
    try { await fetchPage(activeFilter, 0, false); }
    finally { setTab(activeFilter, { refreshing: false }); }
  }, [activeFilter, fetchPage, setTab]);

  const onLoadMore = useCallback(async () => {
    const ts = tabStates[activeFilter];
    if (ts.loadingMore || !ts.hasMore) return;
    setTab(activeFilter, { loadingMore: true });
    try { await fetchPage(activeFilter, ts.page + 1, true); }
    finally { setTab(activeFilter, { loadingMore: false }); }
  }, [activeFilter, fetchPage, setTab, tabStates]);

  const handleFilterSelect = useCallback((filter: StatusFilter) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveFilter(filter);
    void load(filter);
  }, [load]);

  useFocusEffect(useCallback(() => {
    void load(activeFilter);
  }, [activeFilter, load]));

  const ts = tabStates[activeFilter];

  // Scroll to highlighted card after data loads
  useEffect(() => {
    if (!highlightId || ts.loading || ts.data.length === 0) return;
    const idx = ts.data.findIndex((r: any) => r.id === highlightId);
    if (idx < 0) return;
    const timer = setTimeout(() => {
      const y = cardPositions.current[highlightId];
      if (y != null) {
        scrollRef.current?.scrollTo({ y: Math.max(0, y - 80), animated: true });
      }
      // Clear highlight after a few seconds
      setTimeout(() => setHighlightId(null), 3000);
    }, 500);
    return () => clearTimeout(timer);
  }, [highlightId, ts.data, ts.loading]);

  // ── Active filter display props ──
  const activeOpt = FILTER_OPTIONS.find((f) => f.key === activeFilter)!;
  const activeColor = activeFilter === 'all' ? branding.primary : activeOpt.color;

  // ── Helpers ──
  const getRedemptionName = useCallback((r: any) => {
    const st = r.source_type;
    if (st === 'leaderboard_prize' || st === 'arena_prize') {
      const desc: string = r.description || '';
      if (st === 'arena_prize') {
        // "Arena Prize: <name> #<rank> - <prize>" → take after LAST " - "
        const lastDashIdx = desc.lastIndexOf(' - ');
        if (lastDashIdx !== -1) return desc.slice(lastDashIdx + 3);
        return desc || t('arenaPrize');
      }
      // Leaderboard uses em-dash separator
      const dashIdx = desc.indexOf(' — ');
      if (dashIdx !== -1) return desc.slice(dashIdx + 3);
      return desc || t('leaderboardPrize');
    }
    return r.reward_name || t('unknownReward');
  }, [t]);

  const getRewardIcon = (type: string): keyof typeof Ionicons.glyphMap => {
    switch (type) {
      case 'coffee':   return 'cafe-outline';
      case 'protein':  return 'nutrition-outline';
      case 'discount': return 'pricetag-outline';
      case 'merch':    return 'shirt-outline';
      default:         return 'gift-outline';
    }
  };

  const getSourceIcon = (sourceType: string): keyof typeof Ionicons.glyphMap | null => {
    if (sourceType === 'leaderboard_prize') return 'podium-outline';
    if (sourceType === 'arena_prize') return 'shield-outline';
    return null;
  };

  const getSourceIconColor = (sourceType: string): string => {
    if (sourceType === 'arena_prize') return '#EAB308';
    return branding.primary;
  };

  const getSourceInfoLine = (r: any): string | null => {
    const st = r.source_type;
    if (st !== 'leaderboard_prize' && st !== 'arena_prize') return null;
    const desc: string = r.description || '';

    if (st === 'arena_prize') {
      // Format: "Arena Prize: <name> #<rank> - <prize>"
      // The source line should show "<name> #<rank>" — everything before the LAST " - ".
      const stripped = desc.replace(/^Arena Prize:\s*/i, '');
      const lastDashIdx = stripped.lastIndexOf(' - ');
      const sourceLine = lastDashIdx !== -1 ? stripped.slice(0, lastDashIdx) : stripped;
      return sourceLine || t('arenaPrize');
    }

    // Leaderboard format: "Leaderboard Prize: #<rank> <period> at <gym> — <prize>"
    const stripped = desc.replace(/^Leaderboard Prize:\s*/i, '');
    const dashIdx = stripped.indexOf(' — ');
    const sourceLine = dashIdx !== -1 ? stripped.slice(0, dashIdx) : stripped;
    return sourceLine || t('leaderboardPrize');
  };

  const copyCode = useCallback((code: string) => {
    Clipboard.setString(code);
    showModal({ title: t('copied'), body: t('codeCopied') });
  }, [showModal, t]);

  // AGENT NOTE: [2026-04-20] - mobile-coder
  // Reference: docs/plans/bugfix_redemption_cancel_and_pending_spent_transactions.md Step 4
  // Fixes Bug #1: item stays on-screen after cancel.
  // Fix A — optimistic removal from ALL tab caches before showing modal so it
  //   disappears immediately regardless of refetch timing on slow devices.
  // Fix B — await load() instead of fire-and-forget so server state is
  //   reconciled before the user can interact again.
  // Fix C — also reload 'cancelled' tab so cancelled item appears there.
  // Fix D — error branch also reloads to avoid stale state.
  const doCancel = useCallback(async (redemption: any) => {
    setCancellingId(redemption.id);
    try {
      const { data, error } = await supabase.rpc('cancel_own_redemption', { p_redemption_id: redemption.id });
      if (error) {
        showModal({ title: t('cancelError'), body: error.message });
        await load(activeFilter);
      } else {
        const result = Array.isArray(data) ? data[0] : data;
        if (result?.success) {
          // Optimistically remove the cancelled row from every tab cache so the
          // UI is correct before the server round-trip completes.
          setTabStates((prev) => {
            const next = { ...prev };
            for (const key of Object.keys(next) as StatusFilter[]) {
              next[key] = {
                ...next[key],
                data: next[key].data.filter((row: any) => row.id !== redemption.id),
              };
            }
            return next;
          });
          showModal({ title: t('cancelSuccess'), body: t('cancelSuccessDesc', { drops: redemption.drops_spent }) });
          // Await reconciliation; also refresh 'cancelled' tab so it appears there.
          await load(activeFilter);
          if (activeFilter !== 'cancelled') {
            void load('cancelled');
          }
        } else {
          showModal({ title: t('cancelError'), body: result?.error_message || t('cancelErrorDesc') });
          await load(activeFilter);
        }
      }
    } catch (err: any) {
      log.error('Error cancelling redemption:', err);
      showModal({ title: t('cancelError'), body: err?.message || t('cancelErrorDesc') });
      await load(activeFilter);
    } finally {
      setCancellingId(null);
    }
  }, [activeFilter, load, showModal, t]);

  const handleCancelRedemption = useCallback((redemption: any) => {
    showModal({
      title: t('cancelTitle'),
      body: t('cancelConfirm', { drops: redemption.drops_spent }),
      buttons: [
        { label: t('cancelNo'), style: 'cancel' },
        { label: t('cancelYes'), style: 'destructive', onPress: () => doCancel(redemption) },
      ],
    });
  }, [doCancel, showModal, t]);

  const renderCard = useCallback(({ item: redemption, index }: { item: any; index: number }) => {
    const displayState: RedemptionDisplayState = getRedemptionDisplayState({
      status: redemption.status,
      fulfilled_at: redemption.fulfilled_at ?? null,
      source_type: redemption.source_type ?? null,
      expires_at: redemption.expires_at ?? null,
    });
    const stateColor = DISPLAY_STATE_COLOR[displayState];
    const stateIcon = DISPLAY_STATE_ICON[displayState] as keyof typeof Ionicons.glyphMap;
    const stateLabelKey = DISPLAY_STATE_LABEL_KEY[displayState];

    const imageUrl = redemption.reward_image;
    const sourceIcon = getSourceIcon(redemption.source_type);
    const sourceIconColor = getSourceIconColor(redemption.source_type);
    const sourceInfoLine = getSourceInfoLine(redemption);
    const isHighlighted = highlightId === redemption.id;

    // States where the code section is shown
    const showCode = (
      displayState === 'pending_verification' ||
      displayState === 'pending_not_fulfilled' ||
      displayState === 'pending_ready'
    ) && redemption.redemption_code;

    // Code is greyed for unverified; full colour for ready states
    const codeOpacity = displayState === 'pending_verification' || displayState === 'pending_not_fulfilled' ? 0.40 : 1;

    // Cancel button only available for actionable pending states
    const canCancel = displayState === 'pending_verification' || displayState === 'pending_not_fulfilled' || displayState === 'pending_ready';

    const gymName = redemption.gym_name || t('unknownGym');

    return (
      <Animated.View
        entering={FadeInDown.delay(30 + index * 40).duration(320)}
        onLayout={(e) => { cardPositions.current[redemption.id] = e.nativeEvent.layout.y; }}
      >
        <View style={[styles.card, {
          borderTopColor:    hexToRgba(stateColor, isHighlighted ? 0.70 : 0.30),
          borderLeftColor:   hexToRgba(stateColor, isHighlighted ? 0.50 : 0.12),
          borderRightColor:  isHighlighted ? hexToRgba(stateColor, 0.30) : 'rgba(255,255,255,0.04)',
          borderBottomColor: isHighlighted ? hexToRgba(stateColor, 0.20) : 'rgba(255,255,255,0.03)',
        }]}>
          <PlatformBlur intensity={50} tint="dark" style={styles.cardBlur} androidColor="rgba(12,12,22,0.97)">
            <LinearGradient
              colors={[hexToRgba(stateColor, 0.07), 'rgba(255,255,255,0.02)', 'transparent']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />

            {/* ── Header row ── */}
            <View style={styles.cardRow}>
              {imageUrl ? (
                <Image
                  source={imageUrl}
                  style={[styles.itemImage, { borderColor: hexToRgba(branding.primary, 0.12) }]}
                  contentFit="cover"
                  transition={200}
                />
              ) : (
                <View style={[styles.itemIconBox, { backgroundColor: hexToRgba(sourceIcon ? sourceIconColor : branding.primary, 0.10) }]}>
                  {sourceIcon ? (
                    <Ionicons name={sourceIcon} size={26} color={sourceIconColor} />
                  ) : (
                    <Ionicons name={getRewardIcon(redemption.reward_type || '')} size={24} color={branding.primary} />
                  )}
                </View>
              )}

              <View style={styles.cardInfo}>
                <Text style={styles.itemName} numberOfLines={2}>{getRedemptionName(redemption)}</Text>
                {sourceInfoLine && (
                  <View style={styles.sourceInfoRow}>
                    <Ionicons name={sourceIcon!} size={11} color={sourceIconColor} />
                    <Text style={[styles.sourceInfoText, { color: sourceIconColor }]} numberOfLines={1}>
                      {sourceInfoLine}
                    </Text>
                  </View>
                )}
                <Text style={styles.itemGym} numberOfLines={1}>{gymName}</Text>
                <Text style={styles.itemDate}>
                  {fmtDate(redemption.created_at, { day: 'numeric', month: 'short', year: 'numeric' })}
                </Text>
                <View style={[styles.statusPill, { backgroundColor: hexToRgba(stateColor, 0.14), marginTop: 6 }]}>
                  <Ionicons name={stateIcon} size={13} color={stateColor} />
                  <Text style={[styles.statusLabel, { color: stateColor }]}>{t(stateLabelKey)}</Text>
                </View>
              </View>
            </View>

            {/* ── pending_verification: amber info banner + verify CTA ── */}
            {displayState === 'pending_verification' && (
              <View style={[styles.infoBanner, { backgroundColor: hexToRgba('#f59e0b', 0.08), borderColor: hexToRgba('#f59e0b', 0.22) }]}>
                <Ionicons name="shield-outline" size={15} color="#f59e0b" style={styles.infoBannerIcon} />
                <Text style={[styles.infoBannerText, { color: 'rgba(255,255,255,0.75)' }]}>
                  {t('states.pendingVerification.body')}
                </Text>
              </View>
            )}

            {/* ── pending_not_fulfilled: neutral info banner ── */}
            {displayState === 'pending_not_fulfilled' && (
              <View style={[styles.infoBanner, { backgroundColor: hexToRgba('#60a5fa', 0.07), borderColor: hexToRgba('#60a5fa', 0.20) }]}>
                <Ionicons name="cube-outline" size={15} color="#60a5fa" style={styles.infoBannerIcon} />
                <Text style={[styles.infoBannerText, { color: 'rgba(255,255,255,0.75)' }]}>
                  {t('states.pendingNotFulfilled.body', { gymName })}
                </Text>
              </View>
            )}

            {/* ── Code section ── */}
            {showCode && (
              <View style={styles.codeSection}>
                <View style={[styles.codeBanner, {
                  backgroundColor: hexToRgba(stateColor, 0.06),
                  borderColor: hexToRgba(stateColor, 0.18),
                  opacity: codeOpacity,
                }]}>
                  <View style={styles.codeLeft}>
                    <Text style={styles.codeLabel}>{t('code')}</Text>
                    <View style={styles.codeInnerRow}>
                      {displayState === 'pending_verification' && (
                        <Ionicons name="lock-closed-outline" size={14} color={hexToRgba(branding.primary, 0.50)} style={{ marginRight: 6 }} />
                      )}
                      <Text style={[styles.codeText, getNumberStyle(20), { color: branding.primary }]}>
                        {redemption.redemption_code}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[styles.copyBtn, { backgroundColor: hexToRgba(branding.primary, 0.1) }]}
                    onPress={() => copyCode(redemption.redemption_code)}
                  >
                    <Ionicons name="copy-outline" size={16} color={branding.primary} />
                  </TouchableOpacity>
                </View>

                {displayState === 'pending_ready' && (
                  <View style={styles.hintRow}>
                    <Ionicons name="information-circle-outline" size={14} color={stateColor} />
                    <Text style={[styles.hintText, { color: stateColor }]}>{t('showCodeToStaff')}</Text>
                  </View>
                )}
              </View>
            )}

            {/* ── pending_verification: "Why verify?" CTA ── */}
            {displayState === 'pending_verification' && (
              <TouchableOpacity
                style={[styles.verifyCta, { borderColor: hexToRgba('#f59e0b', 0.35) }]}
                onPress={() => setVerificationSheetVisible(true)}
                activeOpacity={0.75}
              >
                <Ionicons name="help-circle-outline" size={15} color="#f59e0b" />
                <Text style={styles.verifyCtaText}>{t('states.pendingVerification.cta')}</Text>
              </TouchableOpacity>
            )}

            {/* ── Cancel button (all non-terminal pending states) ── */}
            {canCancel && (
              <TouchableOpacity
                style={[styles.cancelBtn, { borderColor: hexToRgba('#f87171', 0.35) }]}
                onPress={() => handleCancelRedemption(redemption)}
                disabled={cancellingId === redemption.id}
              >
                {cancellingId === redemption.id ? (
                  <ActivityIndicator size="small" color="#f87171" />
                ) : (
                  <>
                    <Ionicons name="close-circle-outline" size={15} color="#f87171" />
                    <Text style={styles.cancelBtnText}>{t('cancelRedemption')}</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {/* ── Expired notice ── */}
            {displayState === 'expired' && (
              <View style={[styles.expiredRow, { backgroundColor: hexToRgba('#94a3b8', 0.07) }]}>
                <Ionicons name="alert-circle-outline" size={14} color="#94a3b8" />
                <Text style={[styles.expiredLabel, { color: '#94a3b8' }]}>{t('expiredDesc')}</Text>
              </View>
            )}

            {redemption.drops_spent > 0 && (
              <View style={styles.dropsRow}>
                <Ionicons name="water" size={14} color={branding.primary} />
                <Text style={[styles.dropsText, getNumberStyle(13), { color: branding.primary }]}>
                  {redemption.drops_spent} drops
                </Text>
              </View>
            )}
          </PlatformBlur>
        </View>
      </Animated.View>
    );
  }, [branding.primary, cancellingId, copyCode, getRedemptionName, handleCancelRedemption, highlightId, t]);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#000000', '#0A0E1A', '#000000']}
        start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <ScreenHeader title={t('title')} />

      {/* ── Filter trigger button ── */}
      <View style={styles.filterBarWrapper}>
        <TouchableOpacity
          style={[styles.filterTrigger, { borderColor: hexToRgba(activeColor, 0.30) }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setDropdownOpen(true);
          }}
          activeOpacity={0.8}
        >
          <PlatformBlur intensity={50} tint="dark" style={styles.filterTriggerBlur} androidColor="rgba(12,12,22,0.97)">
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
        {!ts.loading && ts.data.length > 0 && (
          <View style={[styles.countBadge, { backgroundColor: hexToRgba(activeColor, 0.12), borderColor: hexToRgba(activeColor, 0.25) }]}>
            <Text style={[styles.countBadgeText, { color: hexToRgba(activeColor, 0.85) }]}>
              {ts.data.length}{ts.hasMore ? '+' : ''}
            </Text>
          </View>
        )}
      </View>

      {/* ── Content ── */}
      {ts.loading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={branding.primary} />
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          style={styles.scrollView}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={ts.refreshing} onRefresh={onRefresh} tintColor={branding.primary} />
          }
        >
          {ts.data.length === 0 ? (
            <Animated.View entering={FadeIn.delay(100).duration(400)} style={styles.emptyState}>
              <Ionicons name="receipt-outline" size={60} color={hexToRgba(activeColor, 0.25)} />
              <Text style={styles.emptyText}>
                {activeFilter === 'all' ? t('noRedemptions') : t('noRedemptionsFiltered')}
              </Text>
              <Text style={styles.emptySubtext}>
                {activeFilter === 'all' ? t('noRedemptionsDesc') : t('noRedemptionsFilteredDesc')}
              </Text>
            </Animated.View>
          ) : (
            <>
              {ts.data.map((item, index) => (
                <View key={item.id}>{renderCard({ item, index })}</View>
              ))}
              {ts.hasMore && (
                <TouchableOpacity
                  style={[styles.loadMoreBtn, { borderColor: hexToRgba(branding.primary, 0.20) }]}
                  onPress={onLoadMore}
                  disabled={ts.loadingMore}
                >
                  {ts.loadingMore ? (
                    <ActivityIndicator size="small" color={branding.primary} />
                  ) : (
                    <>
                      <Ionicons name="chevron-down-outline" size={14} color={branding.primary} />
                      <Text style={[styles.loadMoreLabel, { color: branding.primary }]}>{t('loadMore')}</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </>
          )}
        </ScrollView>
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

      {/* ── Verification info sheet ── */}
      <VerificationSheet
        visible={verificationSheetVisible}
        onClose={() => setVerificationSheetVisible(false)}
        brandColor={branding.primary}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
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

  // ── Dropdown sheet ──
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  sheetBlur: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    paddingTop: 12,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  sheetTitle: {
    ...fontStyles.heading,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.35)',
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
  optionIconBubble: {
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
    letterSpacing: 0.2,
  },
  optionCheck: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  // ── List ──
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  emptyState: {
    paddingVertical: 64,
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  emptyText: {
    fontSize: theme.typography.fontSize.xl,
    ...fontStyles.heading,
    color: theme.colors.text,
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
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
  loadMoreLabel: {
    ...fontStyles.bodySemiBold,
    fontSize: 13,
    letterSpacing: 0.3,
  },

  // ── Cards ──
  card: {
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 12,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
  },
  cardBlur: {
    borderRadius: 18,
    overflow: 'hidden',
    padding: theme.spacing.lg,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  itemImage: {
    width: 52,
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
  },
  itemIconBox: {
    width: 52,
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sourceInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  sourceInfoText: {
    ...fontStyles.bodySemiBold,
    fontSize: 11,
    letterSpacing: 0.2,
  },
  cardInfo: {
    flex: 1,
    minWidth: 0,
  },
  itemName: {
    ...fontStyles.bodySemiBold,
    fontSize: 15,
    color: theme.colors.text,
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  itemGym: {
    ...fontStyles.body,
    fontSize: 12,
    color: theme.colors.textSecondary,
    letterSpacing: 0.2,
    marginBottom: 1,
  },
  itemDate: {
    ...fontStyles.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
    letterSpacing: 0.2,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusLabel: {
    ...fontStyles.bodySemiBold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  infoBannerIcon: {
    marginTop: 1,
    flexShrink: 0,
  },
  infoBannerText: {
    ...fontStyles.body,
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  verifyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  verifyCtaText: {
    ...fontStyles.bodySemiBold,
    fontSize: 13,
    color: '#f59e0b',
    letterSpacing: 0.2,
  },
  codeSection: {
    marginTop: 12,
    gap: 8,
  },
  codeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  codeLeft: { gap: 2 },
  codeInnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  codeLabel: {
    ...fontStyles.body,
    fontSize: 11,
    color: theme.colors.textSecondary,
    letterSpacing: 0.2,
  },
  codeText: {
    ...fontStyles.number,
    letterSpacing: 4,
  },
  copyBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
  },
  hintText: {
    ...fontStyles.body,
    fontSize: 12,
    letterSpacing: 0.2,
  },
  dropsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  dropsText: { ...fontStyles.number },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  cancelBtnText: {
    ...fontStyles.bodySemiBold,
    fontSize: 13,
    color: '#f87171',
    letterSpacing: 0.2,
  },
  expiredRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  expiredLabel: {
    ...fontStyles.body,
    fontSize: 12,
    letterSpacing: 0.2,
  },
});
