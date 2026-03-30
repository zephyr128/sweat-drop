import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Share,
  Platform,
  Clipboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useBranding, useTheme } from '@/lib/contexts/ThemeContext';
import { useSession } from '@/hooks/useSession';
import { theme, fontStyles, hexToRgba} from '@/lib/theme';
import {
  applyFriendInviteCode,
  fetchFriendInviteStatusList,
  fetchMyFriendInviteCode,
  fetchReferralMonthlyStats,
  type FriendInviteStatusRow,
  type ReferralMonthlyStats,
} from '@/lib/friendSocialApi';
import { usePendingReferralStore } from '@/lib/stores/usePendingReferralStore';
import { log } from '@/lib/logger';

function SafeBackButton() {
  const router = useRouter();
  const branding = useBranding();
  return (
    <TouchableOpacity
      style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
        borderWidth: 1,
        borderColor: hexToRgba(branding.primary, 0.15),
      }}
      onPress={() => {
        try {
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace('/home');
          }
        } catch {
          router.replace('/home');
        }
      }}
      activeOpacity={0.7}
    >
      <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
    </TouchableOpacity>
  );
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
      return { icon: 'information-circle-outline', color: 'rgba(255,255,255,0.45)' };
  }
}

export default function InviteFriendScreen() {
  const { session } = useSession();
  const branding = useBranding();
  const { activeGym } = useTheme();
  const { t } = useTranslation('socialFriends');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [joinUrl, setJoinUrl] = useState<string | null>(null);
  const [statusItems, setStatusItems] = useState<FriendInviteStatusRow[]>([]);
  const [monthlyStats, setMonthlyStats] = useState<ReferralMonthlyStats | null>(null);
  const [codeUnavailable, setCodeUnavailable] = useState(false);
  const [listUnavailable, setListUnavailable] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [applyInput, setApplyInput] = useState('');
  const [applying, setApplying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showApply, setShowApply] = useState(false);
  const [faqOpen, setFaqOpen] = useState<number | null>(null);

  const storePendingCode = usePendingReferralStore((s) => s.pendingCode);
  const clearPendingCode = usePendingReferralStore((s) => s.clearPendingCode);
  // Capture pending code on mount and clear from store immediately
  // so navigating back to home won't re-trigger the deep link push.
  const [pendingCode] = useState(() => {
    const code = storePendingCode;
    if (code) clearPendingCode();
    return code;
  });

  const load = useCallback(async () => {
    setLoadError(null);
    const [codeRes, listRes, statsRes] = await Promise.all([
      fetchMyFriendInviteCode(activeGym?.id),
      fetchFriendInviteStatusList(activeGym?.id),
      fetchReferralMonthlyStats(activeGym?.id),
    ]);
    if (codeRes.errorMessage) setLoadError(codeRes.errorMessage);
    else if (listRes.errorMessage) setLoadError(listRes.errorMessage);
    setInviteCode(codeRes.code);
    setJoinUrl(codeRes.joinUrl);
    setCodeUnavailable(codeRes.unavailable);
    setStatusItems(listRes.items);
    setListUnavailable(listRes.unavailable);
    setMonthlyStats(statsRes);
  }, [activeGym?.id]);

  const onMount = useCallback(async () => {
    setLoading(true);
    await load();
    setLoading(false);
  }, [load]);

  useEffect(() => {
    void onMount();
  }, [onMount]);

  // Auto-apply pending deep-link referral code
  useEffect(() => {
    if (!pendingCode || !activeGym?.id || !session?.user || loading) return;

    const autoApply = async () => {
      if (__DEV__) log.debug('[InviteFriend] Auto-applying pending referral code:', pendingCode);

      Alert.alert(
        t('deepLinkTitle'),
        t('deepLinkConfirm', { code: pendingCode, gym: activeGym.name || '' }),
        [
          {
            text: t('common:cancel'),
            style: 'cancel',
            onPress: () => clearPendingCode(),
          },
          {
            text: t('applyCta'),
            onPress: async () => {
              const res = await applyFriendInviteCode(pendingCode, activeGym.id);
              clearPendingCode();
              if (res.ok) {
                Alert.alert(t('applySuccess'));
                await load();
              } else {
                Alert.alert(t('applyFailed'), res.message || t('loadError'));
              }
            },
          },
        ],
      );
    };

    autoApply();
  }, [pendingCode, activeGym?.id, session?.user, loading]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const fullUnavailable = codeUnavailable && listUnavailable;

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
      Alert.alert(t('applyFailed'), t('applyEmpty'));
      return;
    }
    if (!activeGym?.id) {
      Alert.alert(t('applyFailed'), t('gymRequired'));
      return;
    }
    setApplying(true);
    const res = await applyFriendInviteCode(trimmed, activeGym.id);
    setApplying(false);
    if (res.unavailable) {
      Alert.alert(t('backendUnavailableTitle'), t('backendUnavailableBody'));
      return;
    }
    if (res.ok) {
      setApplyInput('');
      setShowApply(false);
      Alert.alert(t('applySuccess'));
      await load();
      return;
    }
    Alert.alert(t('applyFailed'), res.message || t('loadError'));
  }, [activeGym?.id, applyInput, load, t]);

  if (!session?.user) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={[hexToRgba(branding.primary, 0.06), 'transparent']}
          style={styles.gradientTop}
        />
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <View style={styles.header}>
            <SafeBackButton />
            <Text style={styles.headerTitle}>{t('inviteTitle')}</Text>
            <View style={{ width: 40 }} />
          </View>
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
        <View style={styles.header}>
          <SafeBackButton />
          <Text style={styles.headerTitle}>{t('inviteTitle')}</Text>
          <View style={{ width: 40 }} />
        </View>

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

            {/* ── How it works ── */}
            <Animated.View entering={FadeInDown.delay(80).duration(400)}>
              <Text style={styles.sectionLabel}>{t('howItWorks')}</Text>
              <View style={[styles.card, { borderColor: hexToRgba(branding.primary, 0.18) }]}>
                <BlurView intensity={50} tint="dark" style={styles.cardBlur}>
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
                </BlurView>
              </View>
            </Animated.View>

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
                      {/* Share — filled pill */}
                      <TouchableOpacity
                        onPress={inviteCode ? onShare : onRefresh}
                        activeOpacity={0.85}
                        style={[styles.ctaBtn, !inviteCode && { opacity: 0.45 }]}
                      >
                        <LinearGradient
                          colors={[branding.primary, branding.primaryDark]}
                          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                          style={styles.ctaBtnGradient}
                        >
                          <Ionicons
                            name={inviteCode ? 'share-outline' : 'refresh-outline'}
                            size={20}
                            color={branding.onPrimary}
                          />
                        </LinearGradient>
                      </TouchableOpacity>

                      {/* Copy — outlined pill */}
                      {inviteCode && (
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
                      )}
                    </View>
                  </LinearGradient>
                </BlurView>
              </View>
            </Animated.View>

            {/* ── Monthly payout counter ── */}
            {monthlyStats && (
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

            {/* ── Have a code? (collapsible) ── */}
            <Animated.View entering={FadeInDown.delay(270).duration(400)}>
              <TouchableOpacity
                style={styles.applyToggle}
                onPress={() => setShowApply((v) => !v)}
                activeOpacity={0.7}
              >
                <Text style={[styles.applyToggleText, { color: branding.primary }]}>
                  {t('applySection')}
                </Text>
                <Ionicons
                  name={showApply ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={branding.primary}
                />
              </TouchableOpacity>
              {showApply && (
                <Animated.View entering={FadeInDown.duration(250)}>
                  <View style={[styles.card, { borderColor: hexToRgba(branding.primary, 0.18) }]}>
                    <BlurView intensity={50} tint="dark" style={styles.cardBlur}>
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
                        disabled={applying || fullUnavailable}
                        activeOpacity={0.85}
                        style={fullUnavailable ? { opacity: 0.4 } : undefined}
                      >
                        <LinearGradient
                          colors={[branding.primary, branding.primaryDark]}
                          style={styles.applyCta}
                        >
                          {applying ? (
                            <ActivityIndicator color={branding.onPrimary} />
                          ) : (
                            <Text style={[styles.applyCtaText, { color: branding.onPrimary }]}>
                              {t('applyCta')}
                            </Text>
                          )}
                        </LinearGradient>
                      </TouchableOpacity>
                    </BlurView>
                  </View>
                </Animated.View>
              )}
            </Animated.View>

            {/* ── Activity / timeline ── */}
            {statusItems.length > 0 && (
              <Animated.View entering={FadeInDown.delay(320).duration(400)}>
                <Text style={styles.sectionLabel}>{t('statusSection')}</Text>
                <View style={[styles.card, { borderColor: hexToRgba(branding.primary, 0.18) }]}>
                  <BlurView intensity={50} tint="dark" style={styles.cardBlur}>
                    {statusItems.map((row, idx) => {
                      const { icon, color } = timelineStateForRow(row);
                      return (
                        <View key={row.id}>
                          {idx > 0 && (
                            <View
                              style={[styles.rowDivider, { backgroundColor: hexToRgba(branding.primary, 0.08) }]}
                            />
                          )}
                          <View style={styles.statusRow}>
                            <Ionicons name={icon} size={20} color={color} />
                            <View style={{ flex: 1 }}>
                              <Text style={styles.statusTitle}>{row.title}</Text>
                              {row.subtitle ? (
                                <Text style={styles.statusSub}>{row.subtitle}</Text>
                              ) : null}
                            </View>
                            <Text style={[styles.stateTag, { color }]}>
                              {row.state === 'pending' && t('statePending')}
                              {row.state === 'completed' && t('stateDone')}
                              {row.state === 'failed' && t('stateFailed')}
                              {row.state === 'info' && t('stateInfo')}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </BlurView>
                </View>
              </Animated.View>
            )}

            {/* ── Empty state ── */}
            {statusItems.length === 0 && (
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

            {/* ── FAQ accordion ── */}
            <Animated.View entering={FadeInDown.delay(380).duration(400)}>
              <Text style={styles.sectionLabel}>{t('faqTitle')}</Text>
              <View style={[styles.card, { borderColor: 'rgba(255,255,255,0.08)' }]}>
                <BlurView intensity={50} tint="dark" style={styles.cardBlur}>
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
          </ScrollView>
        )}
      </SafeAreaView>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    ...fontStyles.heading,
    fontSize: 18,
    color: theme.colors.text,
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
    ...fontStyles.bodySemiBold,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: theme.colors.textTertiary,
    marginBottom: 8,
    marginTop: 18,
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

  applyToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    marginTop: 4,
  },
  applyToggleText: {
    ...fontStyles.bodySemiBold,
    fontSize: 14,
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
