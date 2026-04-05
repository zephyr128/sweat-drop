import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Share,
  Platform,
  Clipboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useBranding, useTheme } from '@/lib/contexts/ThemeContext';
import { useAppModal } from '@/lib/stores/useAppModal';
import { useSession } from '@/hooks/useSession';
import { theme, fontStyles, hexToRgba } from '@/lib/theme';
import ScreenHeader from '@/components/ScreenHeader';
import { ReferralAcceptSheet, type ReferralAcceptSheetGym } from '@/components/ReferralAcceptSheet';
import {
  applyFriendInviteCode,
  fetchFriendInviteStatusList,
  fetchMyFriendInviteCode,
  fetchMyReceivedReferral,
  fetchReferralMonthlyStats,
  previewReferralCode,
  type FriendInviteStatusRow,
  type ReceivedReferral,
  type ReferralJourneyStep,
  type ReferralMonthlyStats,
} from '@/lib/friendSocialApi';
import { supabase } from '@/lib/supabase';
import { useGymStore } from '@/lib/stores/useGymStore';
import { usePendingReferralStore } from '@/lib/stores/usePendingReferralStore';
import { log } from '@/lib/logger';


interface SheetData {
  code: string;
  gym: ReferralAcceptSheetGym;
  referrerName?: string | null;
  mode: 'apply' | 'join';
}

interface HowItWorksStep {
  icon: keyof typeof Ionicons.glyphMap;
  titleKey: string;
  descKey: string;
}

const HOW_IT_WORKS_STEPS: HowItWorksStep[] = [
  { icon: 'link-outline', titleKey: 'howStep1Title', descKey: 'howStep1Desc' },
  { icon: 'person-add-outline', titleKey: 'howStep2Title', descKey: 'howStep2Desc' },
  { icon: 'qr-code-outline', titleKey: 'howStep3Title', descKey: 'howStep3Desc' },
  { icon: 'gift-outline', titleKey: 'howStep4Title', descKey: 'howStep4Desc' },
];

function timelineStateForRow(row: FriendInviteStatusRow): {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
} {
  switch (row.state) {
    case 'completed':
      return { icon: 'checkmark-circle', color: '#4CAF50' };
    case 'failed':
      return { icon: 'close-circle', color: '#E57373' };
    case 'pending':
      return { icon: 'time-outline', color: '#FFB74D' };
    default:
      return { icon: 'information-circle-outline', color: '#81D4FA' };
  }
}

export default function InviteFriendScreen() {
  const { session } = useSession();
  const branding = useBranding();
  const { activeGym } = useTheme();
  const { t } = useTranslation('socialFriends');
  const showModal = useAppModal((s) => s.showModal);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [joinUrl, setJoinUrl] = useState<string | null>(null);
  const [statusItems, setStatusItems] = useState<FriendInviteStatusRow[]>([]);
  const [monthlyStats, setMonthlyStats] = useState<ReferralMonthlyStats | null>(null);
  const [codeUnavailable, setCodeUnavailable] = useState(false);
  const [listUnavailable, setListUnavailable] = useState(false);
  const [noGym, setNoGym] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [applyInput, setApplyInput] = useState('');
  const [applying, setApplying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showApply, setShowApply] = useState(false);
  const [faqOpen, setFaqOpen] = useState<number | null>(null);
  const [expandedReferralId, setExpandedReferralId] = useState<string | null>(null);
  const [learnOpen, setLearnOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'in_progress' | 'rewarded' | 'blocked'>('all');
  const [receivedReferral, setReceivedReferral] = useState<ReceivedReferral | null>(null);

  // Referral accept bottom sheet
  const [sheetData, setSheetData] = useState<SheetData | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const sheetVisible = sheetData !== null;

  // Subscribe reactively — when the store gets a new code (e.g. deep link fires
  // while this screen is already mounted) we pick it up immediately.
  const pendingCode = usePendingReferralStore((s) => s.pendingCode);
  const clearPendingCode = usePendingReferralStore((s) => s.clearPendingCode);

  const load = useCallback(async () => {
    setLoadError(null);
    const [codeRes, listRes, statsRes, received] = await Promise.all([
      fetchMyFriendInviteCode(activeGym?.id),
      fetchFriendInviteStatusList(activeGym?.id),
      fetchReferralMonthlyStats(activeGym?.id),
      fetchMyReceivedReferral(),
    ]);
    if (codeRes.errorMessage) setLoadError(codeRes.errorMessage);
    else if (listRes.errorMessage) setLoadError(listRes.errorMessage);
    setInviteCode(codeRes.code);
    setJoinUrl(codeRes.joinUrl);
    setCodeUnavailable(codeRes.unavailable);
    setNoGym(codeRes.noGym);
    setStatusItems(listRes.items);
    setListUnavailable(listRes.unavailable);
    setMonthlyStats(statsRes);
    setReceivedReferral(received);

    // If the user has an active inbound referral that hasn't been fully rewarded yet,
    // proactively re-evaluate qualification. This picks up admin-side changes like
    // identity verification without requiring another check-in/workout.
    if (received && received.status === 'active' && received.currentStatus !== 'rewarded') {
      supabase
        .rpc('evaluate_referral_qualification', { p_referral_id: null })
        .then(async ({ error: evalErr }) => {
          if (evalErr) {
            if (__DEV__) log.warn('[InviteFriend] evaluate_referral_qualification failed:', evalErr.message);
            return;
          }
          // Re-fetch to show updated status
          const updated = await fetchMyReceivedReferral();
          if (updated) setReceivedReferral(updated);
        });
    }
  }, [activeGym?.id]);

  const onMount = useCallback(async () => {
    setLoading(true);
    await load();
    setLoading(false);
  }, [load]);

  useEffect(() => {
    void onMount();
  }, [onMount]);

  // Handle pending deep-link referral code once loading finishes.
  // Both with-gym and no-gym cases now preview the code to get gym info,
  // then open the accept sheet with the appropriate mode.
  useEffect(() => {
    if (!pendingCode || !session?.user || loading) return;

    let cancelled = false;
    const openSheet = async () => {
      if (activeGym?.id) {
        // User already has a gym — show apply sheet immediately
        if (__DEV__) log.debug('[InviteFriend] Opening apply sheet for pending code:', pendingCode);
        setSheetData({
          code: pendingCode,
          gym: {
            id: activeGym.id,
            name: activeGym.name || '',
            logoUrl: (activeGym as any).logo_url ?? null,
            primaryColor: branding.primary,
          },
          mode: 'apply',
        });
        return;
      }

      // No gym — preview the code to get gym info, then open join sheet
      if (__DEV__) log.debug('[InviteFriend] Previewing code for no-gym user:', pendingCode);
      setPreviewing(true);
      const preview = await previewReferralCode(pendingCode);
      if (cancelled) return;
      setPreviewing(false);

      if (preview.status === 'valid' && preview.gymId && preview.gymName) {
        setSheetData({
          code: pendingCode,
          gym: {
            id: preview.gymId,
            name: preview.gymName,
            city: preview.gymCity,
            logoUrl: preview.gymLogoUrl,
            primaryColor: preview.gymPrimaryColor || branding.primary,
          },
          referrerName: preview.referrerName,
          mode: 'join',
        });
      } else {
        // Preview failed or code is invalid — pre-fill the manual input
        setApplyInput(pendingCode);
        setShowApply(true);
        clearPendingCode();
      }
    };

    void openSheet();
    return () => { cancelled = true; };
  }, [pendingCode, activeGym?.id, session?.user, loading]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const fullUnavailable = !noGym && codeUnavailable && listUnavailable;
  // Only show the "sent" section when at least one referral has been engaged with
  // (not just an auto-generated unused code sitting at 'invited' stage).
  const hasEngagedReferrals = useMemo(
    () => statusItems.some((row) => row.stage !== 'invited'),
    [statusItems],
  );
  const referralKpis = useMemo(() => {
    const invited = statusItems.length;
    const joined = statusItems.filter((row) => row.stage !== 'invited' && row.stage !== 'blocked' && row.stage !== 'expired').length;
    const verified = statusItems.filter((row) => row.stage === 'verified_checkin' || row.stage === 'rewarded' || row.stage === 'cap_blocked').length;
    const rewarded = statusItems.filter((row) => row.state === 'completed').length;
    return { invited, joined, verified, rewarded };
  }, [statusItems]);
  const filteredStatusItems = useMemo(() => {
    if (statusFilter === 'rewarded') {
      return statusItems.filter((row) => row.state === 'completed');
    }
    if (statusFilter === 'blocked') {
      return statusItems.filter((row) => row.state === 'failed');
    }
    if (statusFilter === 'in_progress') {
      return statusItems.filter((row) => row.state === 'pending' || row.state === 'info');
    }
    return statusItems;
  }, [statusItems, statusFilter]);

  const formatStepTime = useCallback((iso?: string | null) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString(undefined, {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, []);

  const stepMeta = useCallback((step: ReferralJourneyStep) => {
    if (step.key === 'invite_sent') {
      return { label: t('stepInviteSent'), icon: 'paper-plane-outline' as const };
    }
    if (step.key === 'friend_joined') {
      return { label: t('stepFriendJoined'), icon: 'person-add-outline' as const };
    }
    if (step.key === 'first_checkin') {
      return { label: t('stepFirstCheckin'), icon: 'qr-code-outline' as const };
    }
    if (step.key === 'verified_checkin') {
      return { label: t('stepVerifiedCheckin'), icon: 'shield-checkmark-outline' as const };
    }
    return { label: t('stepRewardSettled'), icon: 'gift-outline' as const };
  }, [t]);

  const onShare = useCallback(async () => {
    if (!inviteCode) return;
    const shareUrl = joinUrl || '';
    try {
      await Share.share({
        message: t('shareMessage', { code: inviteCode, url: shareUrl }),
        ...(Platform.OS === 'ios' ? { url: shareUrl } : {}),
      });
    } catch {
      // user cancelled
    }
  }, [inviteCode, joinUrl, t]);

  const onCopy = useCallback(() => {
    if (!inviteCode) return;
    Clipboard.setString(joinUrl || inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [inviteCode, joinUrl]);

  const onApply = useCallback(async () => {
    const trimmed = applyInput.trim();
    if (!trimmed) {
      showModal({ title: t('applyFailed'), body: t('applyEmpty') });
      return;
    }

    if (activeGym?.id) {
      // User has a gym — open apply sheet
      setSheetData({
        code: trimmed,
        gym: {
          id: activeGym.id,
          name: activeGym.name || '',
          logoUrl: (activeGym as any).logo_url ?? null,
          primaryColor: branding.primary,
        },
        mode: 'apply',
      });
      return;
    }

    // No gym — preview the code to get gym info, then open join sheet
    setPreviewing(true);
    const preview = await previewReferralCode(trimmed);
    setPreviewing(false);

    if (preview.status === 'valid' && preview.gymId && preview.gymName) {
      setSheetData({
        code: trimmed,
        gym: {
          id: preview.gymId,
          name: preview.gymName,
          city: preview.gymCity,
          logoUrl: preview.gymLogoUrl,
          primaryColor: preview.gymPrimaryColor || branding.primary,
        },
        referrerName: preview.referrerName,
        mode: 'join',
      });
    } else if (preview.status === 'expired' || preview.status === 'used' || preview.status === 'invalid') {
      showModal({ title: t('applyFailed'), body: t('acceptSheet.errorTitle') });
    } else {
      // Preview API unreachable — save code for later and prompt to scan QR
      usePendingReferralStore.getState().setPendingCode(trimmed);
      showModal({
        title: t('noGymTitle'),
        body: t('noGymBody'),
        buttons: [{ label: t('noGymCta') }],
      });
    }
  }, [activeGym?.id, activeGym?.name, branding.primary, applyInput, t]);

  const handleSheetAccept = useCallback(async (): Promise<boolean> => {
    if (!sheetData) return false;
    const { code: sheetCode, gym: sheetGym, mode } = sheetData;

    try {
      if (mode === 'join') {
        const userId = session?.user?.id;
        if (!userId) return false;

        // 1. Create gym membership (ON CONFLICT DO NOTHING)
        const { error: membershipErr } = await supabase
          .from('gym_memberships')
          .upsert(
            { user_id: userId, gym_id: sheetGym.id, local_drops_balance: 0 },
            { onConflict: 'user_id,gym_id', ignoreDuplicates: true },
          );
        if (membershipErr) {
          log.error('[InviteFriend] Failed to create gym membership:', membershipErr);
          return false;
        }

        // 2. Set home gym in profiles
        const { error: profileErr } = await supabase
          .from('profiles')
          .update({ home_gym_id: sheetGym.id })
          .eq('id', userId);
        if (profileErr) {
          log.error('[InviteFriend] Failed to set home gym:', profileErr);
          return false;
        }

        // 3. Update local gym store so the app reflects the new gym
        const gymStore = useGymStore.getState();
        gymStore.setHomeGymId(sheetGym.id);
        gymStore.clearPreview();
      }

      // 4. Apply referral code
      const gymId = mode === 'join' ? sheetGym.id : activeGym?.id;
      if (!gymId) return false;

      const res = await applyFriendInviteCode(sheetCode, gymId);
      if (res.ok) {
        clearPendingCode();
        setApplyInput('');
        setShowApply(false);
        return true;
      }

      log.warn('[InviteFriend] apply_referral_code failed:', res.message);
      return false;
    } catch (e) {
      log.error('[InviteFriend] handleSheetAccept error:', e);
      return false;
    }
  }, [sheetData, session?.user?.id, activeGym?.id]);

  const handleSheetDecline = useCallback(() => {
    clearPendingCode();
    setSheetData(null);
  }, []);

  if (!session?.user) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={[hexToRgba(branding.primary, 0.06), 'transparent']}
          style={styles.gradientTop}
        />
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <ScreenHeader title={t('inviteTitle')} insetHandled />
          <Text style={styles.centerMessage}>{t('signInRequired')}</Text>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[hexToRgba(branding.primary, 0.08), 'transparent']}
        style={styles.gradientTop}
      />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader title={t('inviteTitle')} insetHandled />

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={branding.primary} />
          </View>
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={branding.primary}
                colors={[branding.primary]}
              />
            }
          >
            {noGym && (
              <Animated.View entering={FadeInDown.delay(80).duration(400)}>
                <View style={[styles.banner, { borderColor: hexToRgba(branding.primary, 0.22) }]}>
                  <BlurView intensity={50} tint="dark" style={styles.bannerBlur}>
                    <View style={[styles.noGymIconWrap, { backgroundColor: hexToRgba(branding.primary, 0.12) }]}>
                      <Ionicons name="qr-code-outline" size={22} color={branding.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.bannerTitle}>{t('noGymTitle')}</Text>
                      <Text style={styles.bannerBody}>{t('noGymBody')}</Text>
                      {pendingCode && (
                        <View style={styles.pendingCodePill}>
                          <Ionicons name="ticket-outline" size={12} color={branding.primary} />
                          <Text style={[styles.pendingCodeText, { color: branding.primary }]}>
                            {pendingCode}
                          </Text>
                        </View>
                      )}
                    </View>
                  </BlurView>
                </View>
              </Animated.View>
            )}

            {loadError && (
              <Animated.View entering={FadeInDown.delay(80).duration(400)}>
                <View style={[styles.banner, { borderColor: hexToRgba('#E57373', 0.2) }]}>
                  <BlurView intensity={50} tint="dark" style={styles.bannerBlur}>
                    <Ionicons name="alert-circle-outline" size={22} color="#E57373" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.bannerTitle}>{t('loadError')}</Text>
                      <Text style={styles.bannerBody}>{loadError}</Text>
                    </View>
                  </BlurView>
                </View>
              </Animated.View>
            )}

            {fullUnavailable && !loadError && (
              <Animated.View entering={FadeInDown.delay(80).duration(400)}>
                <View style={[styles.banner, { borderColor: hexToRgba(branding.primary, 0.2) }]}>
                  <BlurView intensity={50} tint="dark" style={styles.bannerBlur}>
                    <Ionicons name="cloud-offline-outline" size={22} color={branding.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.bannerTitle}>{t('backendUnavailableTitle')}</Text>
                      <Text style={styles.bannerBody}>{t('backendUnavailableBody')}</Text>
                    </View>
                  </BlurView>
                </View>
              </Animated.View>
            )}

            {/* ── Accepted invite (inbound referral) ── */}
            {receivedReferral && (
              <Animated.View entering={FadeInDown.delay(120).duration(400)}>
                <View style={[styles.receivedCard, { borderColor: hexToRgba(branding.primary, 0.25) }]}>
                  <BlurView intensity={50} tint="dark" style={styles.receivedCardBlur}>
                    <LinearGradient
                      colors={[hexToRgba(branding.primary, 0.08), 'transparent']}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFill}
                    />
                    <View style={styles.receivedHeader}>
                      <View style={[styles.receivedIcon, { backgroundColor: hexToRgba(branding.primary, 0.14) }]}>
                        <Ionicons name="person-add" size={18} color={branding.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.receivedTitle}>
                          {t('receivedReferral.title')}
                        </Text>
                        {receivedReferral.referrerName && (
                          <Text style={styles.receivedReferrer}>
                            {t('receivedReferral.invitedBy', { name: receivedReferral.referrerName })}
                          </Text>
                        )}
                        {receivedReferral.gymName && (
                          <Text style={styles.receivedGym}>
                            {receivedReferral.gymName}
                            {receivedReferral.gymCity ? ` · ${receivedReferral.gymCity}` : ''}
                          </Text>
                        )}
                      </View>
                      <View style={[
                        styles.receivedStatusBadge,
                        {
                          backgroundColor: hexToRgba(
                            receivedReferral.currentStatus === 'rewarded' ? '#4CAF50'
                              : receivedReferral.currentStatus === 'blocked' ? '#E57373'
                              : branding.primary,
                            0.14,
                          ),
                        },
                      ]}>
                        <Text style={[
                          styles.receivedStatusText,
                          {
                            color: receivedReferral.currentStatus === 'rewarded' ? '#4CAF50'
                              : receivedReferral.currentStatus === 'blocked' ? '#E57373'
                              : branding.primary,
                          },
                        ]}>
                          {t(`receivedReferral.status_${receivedReferral.currentStatus}`, {
                            defaultValue: t('statePending'),
                          })}
                        </Text>
                      </View>
                    </View>
                    {/* Mini progress stepper */}
                    <View style={styles.receivedSteps}>
                      {([
                        { key: 'accepted', done: true },
                        { key: 'checkin', done: !!receivedReferral.qualifiedCheckinAt },
                        { key: 'verified', done: !!receivedReferral.qualifiedVerifiedAt },
                        { key: 'rewarded', done: receivedReferral.currentStatus === 'rewarded' },
                      ] as const).map((step, idx, arr) => (
                        <View key={step.key} style={styles.receivedStepItem}>
                          <View style={[
                            styles.receivedStepDot,
                            {
                              backgroundColor: step.done
                                ? '#4CAF50'
                                : hexToRgba(branding.primary, 0.18),
                              borderColor: step.done
                                ? '#4CAF50'
                                : hexToRgba(branding.primary, 0.35),
                            },
                          ]}>
                            {step.done && <Ionicons name="checkmark" size={8} color="#fff" />}
                          </View>
                          <Text style={[
                            styles.receivedStepLabel,
                            step.done && { color: '#4CAF50' },
                          ]}>
                            {t(`receivedReferral.step_${step.key}`)}
                          </Text>
                          {idx < arr.length - 1 && (
                            <View style={[
                              styles.receivedStepLine,
                              {
                                backgroundColor: arr[idx + 1].done
                                  ? hexToRgba('#4CAF50', 0.4)
                                  : 'rgba(255,255,255,0.08)',
                              },
                            ]} />
                          )}
                        </View>
                      ))}
                    </View>
                  </BlurView>
                </View>
              </Animated.View>
            )}

            {/* ── Your code + Share CTA ── */}
            <Animated.View entering={FadeInDown.delay(160).duration(400)}>
              <View style={[styles.codeCard, { borderColor: hexToRgba(branding.primary, 0.20) }]}>
                <BlurView intensity={50} tint="dark" style={styles.codeCardBlur}>
                  <LinearGradient
                    colors={[hexToRgba(branding.primary, 0.09), hexToRgba(branding.primary, 0.02)]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={styles.codeCardGradient}
                  >
                    {/* Reward badge */}
                    <View style={[styles.heroRewardBadge, { backgroundColor: hexToRgba(branding.primary, 0.12), alignSelf: 'center', marginBottom: 12 }]}>
                      <Ionicons name="gift-outline" size={13} color={branding.primary} />
                      <Text style={[styles.heroRewardText, { color: branding.primary }]}>
                        {t('heroBonusLabel')}
                      </Text>
                    </View>

                    {/* Code display */}
                    {inviteCode ? (
                      <>
                        <Text style={styles.codeText} selectable>{inviteCode}</Text>
                        {joinUrl && (
                          <Text style={styles.joinUrlText} numberOfLines={1}>{joinUrl}</Text>
                        )}
                      </>
                    ) : (
                      <Text style={[styles.codeText, styles.codePlaceholder]}>
                        {fullUnavailable ? t('backendUnavailableTitle') : '—'}
                      </Text>
                    )}

                    {/* Icon-only action row */}
                    <View style={styles.ctaRow}>
                      {inviteCode ? (
                        <>
                          {/* Share — filled pill */}
                          <TouchableOpacity
                            onPress={onShare}
                            activeOpacity={0.85}
                            style={styles.ctaBtn}
                          >
                            <LinearGradient
                              colors={[branding.primary, branding.primaryDark]}
                              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                              style={styles.ctaBtnGradient}
                            >
                              <Ionicons name="share-outline" size={20} color={branding.onPrimary} />
                            </LinearGradient>
                          </TouchableOpacity>
                          {/* Copy — outlined pill */}
                          <TouchableOpacity
                            onPress={onCopy}
                            activeOpacity={0.75}
                            style={[styles.ctaBtn, styles.ctaBtnOutline, { borderColor: hexToRgba(branding.primary, 0.28) }]}
                          >
                            <Ionicons
                              name={copied ? 'checkmark' : 'copy-outline'}
                              size={20}
                              color={copied ? '#4CD964' : branding.primary}
                            />
                          </TouchableOpacity>
                        </>
                      ) : (
                        <TouchableOpacity
                          onPress={onRefresh}
                          activeOpacity={0.85}
                          style={[styles.ctaBtn, { opacity: 0.45 }]}
                        >
                          <LinearGradient
                            colors={[branding.primary, branding.primaryDark]}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                            style={styles.ctaBtnGradient}
                          >
                            <Ionicons name="refresh-outline" size={20} color={branding.onPrimary} />
                          </LinearGradient>
                        </TouchableOpacity>
                      )}
                    </View>
                  </LinearGradient>
                </BlurView>
              </View>
            </Animated.View>

            {/* ── Have a friend's code? (prominent secondary CTA) ── */}
            <Animated.View entering={FadeInDown.delay(200).duration(400)}>
              <View style={[styles.applySpotlightCard, { borderColor: hexToRgba(branding.primary, 0.22) }]}>
                <BlurView intensity={50} tint="dark" style={styles.applySpotlightBlur}>
                  <View style={styles.applySpotlightHeader}>
                    <View style={[styles.applySpotlightIconWrap, { backgroundColor: hexToRgba(branding.primary, 0.16) }]}>
                      <Ionicons name="ticket-outline" size={16} color={branding.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.applySpotlightTitle}>{t('applySection')}</Text>
                      <Text style={styles.applySpotlightDesc}>{t('applySpotlightDesc')}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => setShowApply((v) => !v)}
                      activeOpacity={0.8}
                      style={[styles.applyRevealBtn, { borderColor: hexToRgba(branding.primary, 0.35) }]}
                    >
                      <Text style={[styles.applyRevealBtnText, { color: branding.primary }]}>
                        {showApply ? t('common:close') : t('applyRevealCta')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {showApply && (
                    <Animated.View entering={FadeInDown.duration(220)} style={styles.applySpotlightBody}>
                      <TextInput
                        value={applyInput}
                        onChangeText={setApplyInput}
                        placeholder={t('applyPlaceholder')}
                        placeholderTextColor="rgba(255,255,255,0.35)"
                        autoCapitalize="characters"
                        autoCorrect={false}
                        style={styles.input}
                        editable={!applying}
                      />
                      <TouchableOpacity
                        onPress={onApply}
                        disabled={applying || previewing || fullUnavailable}
                        activeOpacity={0.85}
                        style={(fullUnavailable || previewing) ? { opacity: 0.4 } : undefined}
                      >
                        <LinearGradient
                          colors={[branding.primary, branding.primaryDark]}
                          style={styles.applyCta}
                        >
                          {applying || previewing ? (
                            <ActivityIndicator color={branding.onPrimary} />
                          ) : (
                            <Text style={[styles.applyCtaText, { color: branding.onPrimary }]}>
                              {t('applyCta')}
                            </Text>
                          )}
                        </LinearGradient>
                      </TouchableOpacity>
                    </Animated.View>
                  )}
                </BlurView>
              </View>
            </Animated.View>

            {/* ── Monthly payout counter (only when there's referral activity) ── */}
            {monthlyStats && hasEngagedReferrals && (
              <Animated.View entering={FadeInDown.delay(220).duration(400)}>
                <View style={[styles.capCard, { borderColor: hexToRgba(branding.primary, 0.18) }]}>
                  <BlurView intensity={50} tint="dark" style={styles.capCardBlur}>
                    <View style={styles.capRow}>
                      <View style={[styles.capIconCircle, { backgroundColor: hexToRgba(branding.primary, 0.12) }]}>
                        <Ionicons name="gift" size={18} color={branding.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.capTitle}>{t('monthlyCapTitle')}</Text>
                        <Text style={styles.capSubtitle}>
                          {t('monthlyCapDesc', {
                            rewarded: monthlyStats.rewardedThisMonth,
                            max: monthlyStats.monthlyCapMax,
                          })}
                        </Text>
                      </View>
                      <Text style={[styles.capBadge, { color: branding.primary }]}>
                        {monthlyStats.remaining}/{monthlyStats.monthlyCapMax}
                      </Text>
                    </View>
                    <View style={styles.capDots}>
                      {Array.from({ length: monthlyStats.monthlyCapMax }).map((_, i) => (
                        <View
                          key={i}
                          style={[
                            styles.capDot,
                            {
                              backgroundColor:
                                i < monthlyStats.rewardedThisMonth
                                  ? branding.primary
                                  : hexToRgba(branding.primary, 0.15),
                            },
                          ]}
                        />
                      ))}
                    </View>
                  </BlurView>
                </View>
              </Animated.View>
            )}

            {/* ── Funnel / Progress strip (only when there's real activity) ── */}
            {hasEngagedReferrals && (
              <Animated.View entering={FadeInDown.delay(250).duration(400)}>
                <Text style={styles.sectionLabel}>{t('funnelTitle')}</Text>
                <View style={[styles.card, { borderColor: hexToRgba(branding.primary, 0.16) }]}>
                  <BlurView intensity={50} tint="dark" style={styles.cardBlur}>
                    <View style={styles.funnelGrid}>
                      <View style={styles.funnelItem}>
                        <Text style={styles.funnelValue}>{referralKpis.invited}</Text>
                        <Text style={styles.funnelLabel}>{t('funnelInvited')}</Text>
                      </View>
                      <View style={styles.funnelItem}>
                        <Text style={styles.funnelValue}>{referralKpis.joined}</Text>
                        <Text style={styles.funnelLabel}>{t('funnelJoined')}</Text>
                      </View>
                      <View style={styles.funnelItem}>
                        <Text style={styles.funnelValue}>{referralKpis.verified}</Text>
                        <Text style={styles.funnelLabel}>{t('funnelVerified')}</Text>
                      </View>
                      <View style={styles.funnelItem}>
                        <Text style={styles.funnelValue}>{referralKpis.rewarded}</Text>
                        <Text style={styles.funnelLabel}>{t('funnelRewarded')}</Text>
                      </View>
                    </View>
                  </BlurView>
                </View>
              </Animated.View>
            )}

            {/* ── Activity / timeline (only when friends have engaged) ── */}
            {hasEngagedReferrals && statusItems.length > 0 && (
              <Animated.View entering={FadeInDown.delay(320).duration(400)}>
                <Text style={styles.sectionLabel}>{t('sentSection')}</Text>
                <View style={styles.filterRow}>
                  {([
                    { key: 'all', label: t('filterAll') },
                    { key: 'in_progress', label: t('filterInProgress') },
                    { key: 'rewarded', label: t('filterRewarded') },
                    { key: 'blocked', label: t('filterBlocked') },
                  ] as const).map((filter) => (
                    <TouchableOpacity
                      key={filter.key}
                      style={[
                        styles.filterChip,
                        statusFilter === filter.key && {
                          borderColor: hexToRgba(branding.primary, 0.45),
                          backgroundColor: hexToRgba(branding.primary, 0.16),
                        },
                      ]}
                      onPress={() => setStatusFilter(filter.key)}
                      activeOpacity={0.75}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          { color: statusFilter === filter.key ? branding.primary : theme.colors.textSecondary },
                        ]}
                      >
                        {filter.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={[styles.card, { borderColor: hexToRgba(branding.primary, 0.18) }]}>
                  <BlurView intensity={50} tint="dark" style={styles.cardBlur}>
                    {filteredStatusItems.map((row, idx) => {
                      const { icon, color } = timelineStateForRow(row);
                      return (
                        <View key={row.id}>
                          {idx > 0 && (
                            <View
                              style={[styles.rowDivider, { backgroundColor: hexToRgba(branding.primary, 0.08) }]}
                            />
                          )}
                          <TouchableOpacity
                            style={styles.statusRow}
                            onPress={() => setExpandedReferralId((prev) => (prev === row.id ? null : row.id))}
                            activeOpacity={0.75}
                          >
                            <Ionicons name={icon} size={20} color={color} />
                            <View style={{ flex: 1 }}>
                              <Text style={styles.statusTitle}>{row.title}</Text>
                              {row.subtitle ? (
                                <Text style={styles.statusSub}>{row.subtitle}</Text>
                              ) : null}
                              {row.progress ? (
                                <Text style={styles.statusSub}>
                                  {t('progressLabel')}: {row.progress.completed}/{row.progress.total}
                                </Text>
                              ) : null}
                            </View>
                            <View style={styles.statusRight}>
                              <Text style={[styles.stateTag, { color }]}>
                                {row.state === 'pending' && t('statePending')}
                                {row.state === 'completed' && t('stateDone')}
                                {row.state === 'failed' && t('stateFailed')}
                                {row.state === 'info' && t('stateInfo')}
                              </Text>
                              <Ionicons
                                name={expandedReferralId === row.id ? 'chevron-up' : 'chevron-down'}
                                size={16}
                                color="rgba(255,255,255,0.45)"
                              />
                            </View>
                          </TouchableOpacity>
                          {expandedReferralId === row.id && (
                            <View style={styles.stepperCard}>
                              <Text style={styles.stepperTitle}>{t('journeyTitle')}</Text>
                              {row.steps.map((step, stepIndex) => {
                                const meta = stepMeta(step);
                                const isDone = step.completed;
                                const isCurrent = step.current;
                                const stepColor = isDone ? '#4CAF50' : isCurrent ? branding.primary : 'rgba(255,255,255,0.35)';
                                return (
                                  <View key={`${row.id}-${step.key}`} style={styles.stepRow}>
                                    <View style={styles.stepTimeline}>
                                      <View style={[styles.stepDot, { borderColor: stepColor, backgroundColor: hexToRgba(stepColor, isDone || isCurrent ? 0.18 : 0.08) }]}>
                                        <Ionicons
                                          name={isDone ? 'checkmark' : meta.icon}
                                          size={12}
                                          color={stepColor}
                                        />
                                      </View>
                                      {stepIndex < row.steps.length - 1 && (
                                        <View
                                          style={[
                                            styles.stepLine,
                                            {
                                              backgroundColor: row.steps[stepIndex + 1].completed
                                                ? hexToRgba('#4CAF50', 0.32)
                                                : 'rgba(255,255,255,0.12)',
                                            },
                                          ]}
                                        />
                                      )}
                                    </View>
                                    <View style={{ flex: 1 }}>
                                      <Text style={[styles.stepLabel, { color: isDone || isCurrent ? theme.colors.text : theme.colors.textSecondary }]}>
                                        {meta.label}
                                      </Text>
                                      {formatStepTime(step.at) ? (
                                        <Text style={styles.stepTime}>{formatStepTime(step.at)}</Text>
                                      ) : null}
                                    </View>
                                    {isCurrent && !isDone ? (
                                      <Text style={[styles.currentBadge, { color: branding.primary }]}>
                                        {t('stepCurrent')}
                                      </Text>
                                    ) : null}
                                  </View>
                                );
                              })}
                            </View>
                          )}
                        </View>
                      );
                    })}
                    {filteredStatusItems.length === 0 && (
                      <View style={styles.filterEmptyWrap}>
                        <Text style={styles.filterEmptyText}>{t('emptyFiltered')}</Text>
                      </View>
                    )}
                  </BlurView>
                </View>
              </Animated.View>
            )}

            {/* ── Empty state ── */}
            {!hasEngagedReferrals && !receivedReferral && statusItems.length === 0 && (
              <Animated.View entering={FadeInDown.delay(320).duration(400)}>
                <View style={[styles.emptyCard, { borderColor: 'rgba(255,255,255,0.08)' }]}>
                  <BlurView intensity={50} tint="dark" style={styles.emptyCardBlur}>
                    <Ionicons name="people-outline" size={36} color="rgba(255,255,255,0.2)" />
                    <Text style={styles.emptyTitle}>{t('emptyTitle')}</Text>
                    <Text style={styles.emptyDesc}>{t('emptyDesc')}</Text>
                  </BlurView>
                </View>
              </Animated.View>
            )}

            {/* ── Learn more (How it works + FAQ) ── */}
            <Animated.View entering={FadeInDown.delay(420).duration(400)}>
              <TouchableOpacity
                style={styles.learnToggle}
                onPress={() => setLearnOpen((v) => !v)}
                activeOpacity={0.75}
              >
                <Text style={styles.learnToggleText}>{t('learnMore')}</Text>
                <Ionicons
                  name={learnOpen ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color="rgba(255,255,255,0.6)"
                />
              </TouchableOpacity>
              {learnOpen && (
                <Animated.View entering={FadeInDown.duration(250)}>
                  <View style={[styles.card, { borderColor: 'rgba(255,255,255,0.08)' }]}>
                    <BlurView intensity={50} tint="dark" style={styles.cardBlur}>
                      <Text style={styles.sectionInlineLabel}>{t('howItWorks')}</Text>
                      {HOW_IT_WORKS_STEPS.map((step, idx) => (
                        <View key={step.titleKey} style={styles.howRow}>
                          <View style={styles.howTimelineCol}>
                            <View
                              style={[
                                styles.howDot,
                                { backgroundColor: hexToRgba(branding.primary, 0.15), borderColor: branding.primary },
                              ]}
                            >
                              <Ionicons name={step.icon} size={16} color={branding.primary} />
                            </View>
                            {idx < HOW_IT_WORKS_STEPS.length - 1 && (
                              <View style={[styles.howLine, { backgroundColor: hexToRgba(branding.primary, 0.12) }]} />
                            )}
                          </View>
                          <View style={styles.howContent}>
                            <Text style={styles.howStepTitle}>{t(step.titleKey)}</Text>
                            <Text style={styles.howStepDesc}>{t(step.descKey)}</Text>
                          </View>
                        </View>
                      ))}

                      <Text style={[styles.sectionInlineLabel, { marginTop: 14 }]}>{t('faqTitle')}</Text>
                      {([
                        { q: t('faq1Q'), a: t('faq1A'), idx: 0 },
                        { q: t('faq2Q'), a: t('faq2A'), idx: 1 },
                        { q: t('faq3Q'), a: t('faq3A'), idx: 2 },
                      ] as { q: string; a: string; idx: number }[]).map(({ q, a, idx }) => (
                        <View key={idx}>
                          {idx > 0 && (
                            <View style={[styles.rowDivider, { backgroundColor: 'rgba(255,255,255,0.05)', marginVertical: 0 }]} />
                          )}
                          <TouchableOpacity
                            style={styles.faqRow}
                            onPress={() => setFaqOpen((prev) => (prev === idx ? null : idx))}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.faqQ}>{q}</Text>
                            <Ionicons
                              name={faqOpen === idx ? 'chevron-up' : 'chevron-down'}
                              size={15}
                              color="rgba(255,255,255,0.35)"
                            />
                          </TouchableOpacity>
                          {faqOpen === idx && (
                            <Animated.View entering={FadeInDown.duration(200)} style={styles.faqAnswer}>
                              <Text style={styles.faqA}>{a}</Text>
                            </Animated.View>
                          )}
                        </View>
                      ))}
                    </BlurView>
                  </View>
                </Animated.View>
              )}
            </Animated.View>
          </ScrollView>
        )}
      </SafeAreaView>

      {/* Referral accept bottom sheet */}
      {sheetVisible && sheetData && (
        <ReferralAcceptSheet
          visible={sheetVisible}
          code={sheetData.code}
          gym={sheetData.gym}
          referrerName={sheetData.referrerName}
          mode={sheetData.mode}
          onAccept={handleSheetAccept}
          onDecline={handleSheetDecline}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  gradientTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 220,
  },
  safeArea: {
    flex: 1,
  },
  loadingBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  sectionLabel: {
    ...fontStyles.heading,
    fontSize: 13,
    letterSpacing: 2,
    color: theme.colors.textTertiary,
    marginBottom: 8,
    marginTop: 18,
  },
  sectionInlineLabel: {
    ...fontStyles.heading,
    fontSize: 13,
    letterSpacing: 2,
    color: theme.colors.textTertiary,
    marginBottom: 8,
  },
  // Code + CTA card (below How it works)
  codeCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 4,
  },
  codeCardBlur: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(18, 18, 28, 0.80)',
  },
  codeCardGradient: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 18,
    alignItems: 'center',
  },
  heroRewardBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  heroRewardText: {
    ...fontStyles.bodySemiBold,
    fontSize: 12,
    letterSpacing: 0.3,
  },

  // Compact icon-only action row
  ctaRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  ctaBtn: {
    width: 52,
    height: 52,
    borderRadius: 16,
    overflow: 'hidden',
  },
  ctaBtnGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ctaBtnOutline: {
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },

  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 4,
  },
  cardBlur: {
    flex: 1,
    padding: 16,
    backgroundColor: 'rgba(18, 18, 28, 0.80)',
  },

  howRow: {
    flexDirection: 'row',
    minHeight: 52,
  },
  howTimelineCol: {
    width: 36,
    alignItems: 'center',
  },
  howDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  howLine: {
    width: 1.5,
    flex: 1,
    marginVertical: 2,
  },
  howContent: {
    flex: 1,
    paddingLeft: 12,
    paddingBottom: 14,
  },
  howStepTitle: {
    ...fontStyles.bodySemiBold,
    fontSize: 14,
    color: theme.colors.text,
  },
  howStepDesc: {
    ...fontStyles.body,
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
    lineHeight: 17,
  },

  codeText: {
    ...fontStyles.heading,
    fontSize: 24,
    letterSpacing: 3,
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: 6,
  },
  codePlaceholder: {
    opacity: 0.45,
  },
  joinUrlText: {
    ...fontStyles.body,
    fontSize: 11,
    color: theme.colors.textTertiary,
    textAlign: 'center',
    marginBottom: 14,
    letterSpacing: 0.3,
  },

  // Monthly cap card
  capCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    marginTop: 14,
    marginBottom: 4,
  },
  capCardBlur: {
    flex: 1,
    padding: 14,
    backgroundColor: 'rgba(18, 18, 28, 0.80)',
  },
  capRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  capIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  capTitle: {
    ...fontStyles.bodySemiBold,
    fontSize: 13,
    color: theme.colors.text,
  },
  capSubtitle: {
    ...fontStyles.body,
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  capBadge: {
    ...fontStyles.number,
    fontSize: 18,
    letterSpacing: 0.5,
  },
  capDots: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
    justifyContent: 'center',
  },
  capDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  funnelGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  funnelItem: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  funnelValue: {
    ...fontStyles.number,
    fontSize: 18,
    color: theme.colors.text,
  },
  funnelLabel: {
    ...fontStyles.body,
    fontSize: 10,
    color: theme.colors.textTertiary,
    marginTop: 3,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  applySpotlightCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    marginTop: 14,
    marginBottom: 4,
  },
  applySpotlightBlur: {
    flex: 1,
    padding: 12,
    backgroundColor: 'rgba(18, 18, 28, 0.80)',
  },
  applySpotlightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  applySpotlightIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applySpotlightTitle: {
    ...fontStyles.bodySemiBold,
    fontSize: 14,
    color: theme.colors.text,
  },
  applySpotlightDesc: {
    ...fontStyles.body,
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  applyRevealBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  applyRevealBtnText: {
    ...fontStyles.heading,
    fontSize: 14,
    letterSpacing: 1.5,
  },
  applySpotlightBody: {
    marginTop: 10,
  },
  learnToggle: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  learnToggleText: {
    ...fontStyles.heading,
    fontSize: 15,
    letterSpacing: 1.5,
    color: theme.colors.text,
  },
  input: {
    ...fontStyles.body,
    fontSize: 16,
    color: theme.colors.text,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  applyCta: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  applyCtaText: {
    ...fontStyles.bodySemiBold,
    fontSize: 16,
  },

  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  filterChipText: {
    ...fontStyles.heading,
    fontSize: 13,
    letterSpacing: 1.5,
  },
  filterEmptyWrap: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  filterEmptyText: {
    ...fontStyles.body,
    fontSize: 12,
    color: theme.colors.textTertiary,
  },
  statusRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 6,
  },
  statusTitle: {
    ...fontStyles.bodySemiBold,
    fontSize: 14,
    color: theme.colors.text,
  },
  statusSub: {
    ...fontStyles.body,
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  stateTag: {
    ...fontStyles.bodySemiBold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 10,
  },
  stepperCard: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    padding: 12,
  },
  stepperTitle: {
    ...fontStyles.bodySemiBold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.9,
    color: theme.colors.textTertiary,
    marginBottom: 8,
  },
  stepRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 4,
  },
  stepTimeline: {
    width: 20,
    alignItems: 'center',
  },
  stepDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepLine: {
    width: 1.5,
    flex: 1,
    marginTop: 2,
  },
  stepLabel: {
    ...fontStyles.bodySemiBold,
    fontSize: 12,
  },
  stepTime: {
    ...fontStyles.body,
    fontSize: 11,
    color: theme.colors.textTertiary,
    marginTop: 1,
  },
  currentBadge: {
    ...fontStyles.bodySemiBold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },

  emptyCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 4,
  },
  emptyCardBlur: {
    flex: 1,
    padding: 28,
    alignItems: 'center',
    backgroundColor: 'rgba(18, 18, 28, 0.80)',
  },
  emptyTitle: {
    ...fontStyles.bodySemiBold,
    fontSize: 15,
    color: theme.colors.textSecondary,
    marginTop: 12,
  },
  emptyDesc: {
    ...fontStyles.body,
    fontSize: 13,
    color: theme.colors.textTertiary,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },

  faqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    gap: 10,
  },
  faqQ: {
    ...fontStyles.bodySemiBold,
    fontSize: 13,
    color: theme.colors.text,
    flex: 1,
  },
  faqAnswer: {
    paddingBottom: 12,
  },
  faqA: {
    ...fontStyles.body,
    fontSize: 12,
    color: theme.colors.textSecondary,
    lineHeight: 17,
  },

  banner: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 14,
  },
  bannerBlur: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    backgroundColor: 'rgba(18, 18, 28, 0.80)',
  },
  noGymIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  bannerTitle: {
    ...fontStyles.bodySemiBold,
    fontSize: 15,
    color: theme.colors.text,
  },
  bannerBody: {
    ...fontStyles.body,
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 4,
    lineHeight: 18,
  },
  pendingCodePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  pendingCodeText: {
    ...fontStyles.number,
    fontSize: 12,
    letterSpacing: 0.4,
  },
  // Received (inbound) referral card
  receivedCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 14,
  },
  receivedCardBlur: {
    flex: 1,
    padding: 14,
    backgroundColor: 'rgba(18, 18, 28, 0.80)',
  },
  receivedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  receivedIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  receivedTitle: {
    ...fontStyles.bodySemiBold,
    fontSize: 14,
    color: theme.colors.text,
  },
  receivedReferrer: {
    ...fontStyles.body,
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  receivedGym: {
    ...fontStyles.body,
    fontSize: 11,
    color: theme.colors.textTertiary,
    marginTop: 1,
  },
  receivedStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  receivedStatusText: {
    ...fontStyles.bodySemiBold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  receivedSteps: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  receivedStepItem: {
    flex: 1,
    alignItems: 'center',
    position: 'relative',
  },
  receivedStepDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  receivedStepLabel: {
    ...fontStyles.body,
    fontSize: 9,
    color: theme.colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  receivedStepLine: {
    position: 'absolute',
    top: 7,
    left: '55%' as any,
    width: '90%' as any,
    height: 1.5,
  },

  errorText: {
    ...fontStyles.body,
    fontSize: 12,
    color: '#E57373',
    marginBottom: 10,
  },
  centerMessage: {
    ...fontStyles.body,
    fontSize: 15,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: 40,
    paddingHorizontal: 24,
  },
});
