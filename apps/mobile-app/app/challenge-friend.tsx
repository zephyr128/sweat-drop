import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useAppModal } from '@/lib/stores/useAppModal';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { PlatformBlur } from '@/components/PlatformBlur';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import ScreenHeader from '@/components/ScreenHeader';
import { useBranding, useTheme } from '@/lib/contexts/ThemeContext';
import { useSession } from '@/hooks/useSession';
import { theme, fontStyles, hexToRgba} from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import {
  createFriend1v1Challenge,
  fetchFriend1v1Invitations,
  respondFriend1v1Invitation,
  searchGymMembers,
  type Friend1v1ChallengeType,
  type Friend1v1Invitation,
  type GymMemberSearchResult,
} from '@/lib/friendSocialApi';

const DURATIONS = [3, 7, 14] as const;

function isRuntimeFlagEnabled(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  if (typeof value === 'number') return value === 1;
  return false;
}

export default function ChallengeFriendScreen() {
  const { session } = useSession();
  const branding = useBranding();
  const { activeGym } = useTheme();
  const { t } = useTranslation('socialFriends');
  const showModal = useAppModal((s) => s.showModal);

  const challengeTypes: { key: Friend1v1ChallengeType; label: string }[] = useMemo(
    () => [
      { key: 'drops_race', label: t('typeDrops') },
      { key: 'streak_race', label: t('typeStreak') },
      { key: 'sessions_race', label: t('typeSessions') },
    ],
    [t],
  );

  const [loading, setLoading] = useState(true);
  const [featureEnabled, setFeatureEnabled] = useState(false);
  const [featureReady, setFeatureReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [invitations, setInvitations] = useState<Friend1v1Invitation[]>([]);
  const [listUnavailable, setListUnavailable] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [challengeType, setChallengeType] = useState<Friend1v1ChallengeType>('drops_race');
  const [selectedOpponent, setSelectedOpponent] = useState<GymMemberSearchResult | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GymMemberSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [rewardStr, setRewardStr] = useState('');
  const [durationDays, setDurationDays] = useState<number>(7);
  const [creating, setCreating] = useState(false);

  const [respondingId, setRespondingId] = useState<string | null>(null);

  const loadInvites = useCallback(async () => {
    setLoadError(null);
    const res = await fetchFriend1v1Invitations(session?.user?.id);
    if (res.errorMessage) setLoadError(res.errorMessage);
    setInvitations(res.items);
    setListUnavailable(res.unavailable);
  }, [session?.user?.id]);

  const initialLoad = useCallback(async () => {
    setLoading(true);
    const { data: featureFlag, error: featureFlagError } = await supabase.rpc('get_runtime_flag', {
      p_key: 'friend_challenges_enabled',
    });
    const enabled = !featureFlagError && isRuntimeFlagEnabled(featureFlag);
    setFeatureEnabled(enabled);
    setFeatureReady(true);
    if (!enabled) {
      setInvitations([]);
      setListUnavailable(true);
      setLoading(false);
      return;
    }
    await loadInvites();
    setLoading(false);
  }, [loadInvites]);

  useEffect(() => {
    void initialLoad();
  }, [initialLoad]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (selectedOpponent || searchQuery.trim().length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      if (!activeGym?.id) { setSearching(false); return; }
      const results = await searchGymMembers(searchQuery, activeGym.id, session?.user?.id);
      setSearchResults(results);
      setSearching(false);
    }, 350);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchQuery, selectedOpponent, activeGym?.id, session?.user?.id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadInvites();
    setRefreshing(false);
  }, [loadInvites]);

  const onCreate = useCallback(async () => {
    if (!activeGym?.id) {
      showModal({ title: t('createFailed'), body: t('gymRequired') });
      return;
    }
    if (!selectedOpponent) {
      showModal({ title: t('createFailed'), body: t('opponentRequired') });
      return;
    }
    const rewardDrops = Math.max(0, Math.round(Number(rewardStr.replace(',', '.')) || 0));
    setCreating(true);
    const res = await createFriend1v1Challenge({
      gymId: activeGym.id,
      opponentUserId: selectedOpponent.userId,
      challengeType,
      durationDays,
      rewardDropsPerUser: rewardDrops,
    });
    setCreating(false);
    if (res.unavailable) {
      showModal({ title: t('backendUnavailableTitle'), body: t('challengeBackendUnavailableBody') });
      return;
    }
    if (res.ok) {
      showModal({ title: t('createSuccess') });
      setSelectedOpponent(null);
      setSearchQuery('');
      setRewardStr('');
      await loadInvites();
      return;
    }
    showModal({ title: t('createFailed'), body: res.message || t('loadError') });
  }, [activeGym?.id, challengeType, durationDays, loadInvites, selectedOpponent, rewardStr, t]);

  const onRespond = useCallback(
    async (invitationId: string, accept: boolean) => {
      setRespondingId(invitationId);
      const res = await respondFriend1v1Invitation(invitationId, accept);
      setRespondingId(null);
      if (res.unavailable) {
        showModal({ title: t('backendUnavailableTitle'), body: t('challengeBackendUnavailableBody') });
        return;
      }
      if (res.ok) {
        showModal({ title: t('respondSuccess') });
        await loadInvites();
        return;
      }
      showModal({ title: t('respondFailed'), body: res.message || t('loadError') });
    },
    [loadInvites, t],
  );

  const typeLabel = useCallback(
    (key: string) => {
      if (key === 'drops_race') return t('typeDrops');
      if (key === 'streak_race') return t('typeStreak');
      if (key === 'sessions_race') return t('typeSessions');
      return key;
    },
    [t],
  );

  if (!session?.user) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={[hexToRgba(branding.primary, 0.06), 'transparent']}
          style={styles.gradientTop}
        />
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <ScreenHeader title={t('challengeTitle')} insetHandled />
          <Text style={styles.centerMessage}>{t('signInRequired')}</Text>
        </SafeAreaView>
      </View>
    );
  }

  if (featureReady && !featureEnabled) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={[hexToRgba(branding.primary, 0.08), 'transparent']}
          style={styles.gradientTop}
        />
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <ScreenHeader title={t('challengeTitle')} insetHandled />
          <View style={styles.loadingBox}>
            <Text style={styles.centerMessage}>{t('challengeBackendUnavailableBody')}</Text>
          </View>
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
        <ScreenHeader title={t('challengeTitle')} insetHandled />

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
            {listUnavailable && invitations.length === 0 && (
              <Animated.View entering={FadeInDown.delay(80).duration(400)}>
                <View style={[styles.banner, { borderColor: hexToRgba(branding.primary, 0.2) }]}>
                  <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={40} tint="dark" style={styles.bannerBlur}>
                    <Ionicons name="flash-outline" size={22} color={branding.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.bannerTitle}>{t('backendUnavailableTitle')}</Text>
                      <Text style={styles.bannerBody}>{t('challengeBackendUnavailableBody')}</Text>
                    </View>
                  </PlatformBlur>
                </View>
              </Animated.View>
            )}

            {loadError && !listUnavailable && (
              <Text style={styles.errorText}>
                {t('loadError')}: {loadError}
              </Text>
            )}

            <Animated.View entering={FadeInDown.delay(100).duration(400)}>
              <Text style={styles.sectionLabel}>{t('createSection')}</Text>
              <View style={[styles.card, { borderColor: hexToRgba(branding.primary, 0.12) }]}>
                <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={45} tint="dark" style={styles.cardBlur}>
                  <Text style={styles.fieldLabel}>{t('challengeType')}</Text>
                  <View style={styles.chipRow}>
                    {challengeTypes.map((ct) => {
                      const active = challengeType === ct.key;
                      return (
                        <TouchableOpacity
                          key={ct.key}
                          onPress={() => setChallengeType(ct.key)}
                          activeOpacity={0.8}
                          style={[
                            styles.chip,
                            {
                              borderColor: active
                                ? branding.primary
                                : hexToRgba(branding.primary, 0.15),
                              backgroundColor: active
                                ? hexToRgba(branding.primary, 0.15)
                                : 'rgba(255,255,255,0.03)',
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              { color: active ? branding.primary : theme.colors.textSecondary },
                            ]}
                          >
                            {ct.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <Text style={[styles.fieldLabel, { marginTop: 12 }]}>{t('opponentLabel')}</Text>
                  {selectedOpponent ? (
                    <View style={styles.selectedOpponent}>
                      <View style={styles.selectedInfo}>
                        <Ionicons name="person-circle" size={28} color={branding.primary} />
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text style={styles.selectedName}>
                            {selectedOpponent.fullName || selectedOpponent.username}
                          </Text>
                          {selectedOpponent.fullName ? (
                            <Text style={styles.selectedUsername}>@{selectedOpponent.username}</Text>
                          ) : null}
                        </View>
                      </View>
                      <TouchableOpacity
                        onPress={() => { setSelectedOpponent(null); setSearchQuery(''); }}
                        hitSlop={8}
                      >
                        <Ionicons name="close-circle" size={22} color="rgba(255,255,255,0.4)" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View>
                      <View style={styles.searchInputRow}>
                        <Ionicons name="search" size={16} color="rgba(255,255,255,0.4)" style={{ marginRight: 8 }} />
                        <TextInput
                          value={searchQuery}
                          onChangeText={setSearchQuery}
                          placeholder={t('searchPlaceholder')}
                          placeholderTextColor="rgba(255,255,255,0.35)"
                          style={styles.searchInput}
                          editable={!creating}
                          autoCorrect={false}
                          autoCapitalize="none"
                        />
                        {searching && <ActivityIndicator size="small" color={branding.primary} />}
                      </View>
                      {searchResults.length > 0 && (
                        <View style={styles.searchResults}>
                          {searchResults.map((member) => (
                            <TouchableOpacity
                              key={member.userId}
                              style={styles.searchResultRow}
                              activeOpacity={0.7}
                              onPress={() => {
                                setSelectedOpponent(member);
                                setSearchResults([]);
                                setSearchQuery('');
                              }}
                            >
                              <Ionicons name="person-circle-outline" size={24} color="rgba(255,255,255,0.5)" />
                              <View style={{ flex: 1, marginLeft: 10 }}>
                                <Text style={styles.resultName}>
                                  {member.fullName || member.username}
                                </Text>
                                {member.fullName ? (
                                  <Text style={styles.resultUsername}>@{member.username}</Text>
                                ) : null}
                              </View>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                      {searchQuery.trim().length >= 2 && !searching && searchResults.length === 0 && (
                        <Text style={styles.noResults}>{t('noMembersFound')}</Text>
                      )}
                    </View>
                  )}

                  <Text style={[styles.fieldLabel, { marginTop: 8 }]}>{t('rewardLabel')}</Text>
                  <TextInput
                    value={rewardStr}
                    onChangeText={setRewardStr}
                    placeholder={t('rewardPlaceholder')}
                    placeholderTextColor="rgba(255,255,255,0.35)"
                    keyboardType="number-pad"
                    style={styles.input}
                    editable={!creating}
                  />

                  <Text style={[styles.fieldLabel, { marginTop: 4 }]}>{t('durationLabel')}</Text>
                  <View style={styles.chipRow}>
                    {DURATIONS.map((d) => {
                      const active = durationDays === d;
                      return (
                        <TouchableOpacity
                          key={d}
                          onPress={() => setDurationDays(d)}
                          activeOpacity={0.8}
                          style={[
                            styles.chipSm,
                            {
                              borderColor: active
                                ? branding.primary
                                : hexToRgba(branding.primary, 0.12),
                              backgroundColor: active
                                ? hexToRgba(branding.primary, 0.12)
                                : 'rgba(255,255,255,0.03)',
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              { color: active ? branding.primary : theme.colors.textSecondary },
                            ]}
                          >
                            {d}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <TouchableOpacity
                    onPress={onCreate}
                    disabled={creating}
                    activeOpacity={0.85}
                    style={{ marginTop: 14 }}
                  >
                    <LinearGradient
                      colors={[branding.primary, branding.primaryDark]}
                      style={styles.cta}
                    >
                      {creating ? (
                        <ActivityIndicator color={branding.onPrimary} />
                      ) : (
                        <Text style={[styles.ctaText, { color: branding.onPrimary }]}>
                          {t('createCta')}
                        </Text>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                </PlatformBlur>
              </View>
            </Animated.View>

            {!(listUnavailable && invitations.length === 0) && (
              <Animated.View entering={FadeInDown.delay(180).duration(400)}>
                <Text style={styles.sectionLabel}>{t('incomingSection')}</Text>
                <View style={[styles.card, { borderColor: hexToRgba(branding.primary, 0.12) }]}>
                  <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={45} tint="dark" style={styles.cardBlur}>
                    {invitations.length === 0 ? (
                      <Text style={styles.empty}>{t('incomingEmpty')}</Text>
                    ) : (
                      invitations.map((inv, idx) => (
                        <View key={inv.id}>
                          {idx > 0 && (
                            <View
                              style={[styles.rowDivider, { backgroundColor: hexToRgba(branding.primary, 0.08) }]}
                            />
                          )}
                          <Text style={styles.invTitle}>{t('fromUser', { name: inv.fromUsername })}</Text>
                          <Text style={styles.invSub}>
                            {t('challengeSummary', {
                              type: typeLabel(inv.challengeType),
                              days: inv.durationDays || '—',
                            })}
                          </Text>
                          {inv.expiresAt ? (
                            <Text style={styles.invMeta}>{inv.expiresAt}</Text>
                          ) : null}
                          {respondingId === inv.id ? (
                            <ActivityIndicator
                              style={{ marginTop: 14 }}
                              color={branding.primary}
                            />
                          ) : (
                            <View style={styles.invActions}>
                              <TouchableOpacity
                                onPress={() => onRespond(inv.id, false)}
                                style={[styles.secondaryBtn, { borderColor: hexToRgba(branding.primary, 0.25) }]}
                                activeOpacity={0.75}
                              >
                                <Text style={styles.secondaryBtnText}>{t('decline')}</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => onRespond(inv.id, true)}
                                style={{ flex: 1 }}
                                activeOpacity={0.85}
                              >
                                <LinearGradient
                                  colors={[branding.primary, branding.primaryDark]}
                                  style={styles.acceptCta}
                                >
                                  <Text style={[styles.acceptCtaText, { color: branding.onPrimary }]}>
                                    {t('accept')}
                                  </Text>
                                </LinearGradient>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      ))
                    )}
                  </PlatformBlur>
                </View>
              </Animated.View>
            )}

            <View style={{ height: 32 }} />
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
    marginTop: 4,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 14,
  },
  cardBlur: {
    padding: 16,
    backgroundColor: 'rgba(20, 20, 30, 0.75)',
  },
  fieldLabel: {
    ...fontStyles.body,
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipSm: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    minWidth: 44,
    alignItems: 'center',
  },
  chipText: {
    ...fontStyles.bodySemiBold,
    fontSize: 13,
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
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  cta: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  ctaText: {
    ...fontStyles.heading,
    fontSize: 18,
    letterSpacing: 1.5,
  },
  invTitle: {
    ...fontStyles.bodySemiBold,
    fontSize: 15,
    color: theme.colors.text,
  },
  invSub: {
    ...fontStyles.body,
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
  invMeta: {
    ...fontStyles.body,
    fontSize: 11,
    color: theme.colors.textTertiary,
    marginTop: 4,
  },
  invActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  secondaryBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    minWidth: 100,
    alignItems: 'center',
  },
  secondaryBtnText: {
    ...fontStyles.heading,
    fontSize: 15,
    letterSpacing: 1.2,
    color: theme.colors.textSecondary,
  },
  acceptCta: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  acceptCtaText: {
    ...fontStyles.bodySemiBold,
    fontSize: 15,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 14,
  },
  empty: {
    ...fontStyles.body,
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 8,
  },
  banner: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 14,
  },
  bannerBlur: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    backgroundColor: 'rgba(25, 22, 35, 0.85)',
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
  selectedOpponent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  selectedInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  selectedName: {
    ...fontStyles.bodySemiBold,
    fontSize: 15,
    color: theme.colors.text,
  },
  selectedUsername: {
    ...fontStyles.body,
    fontSize: 12,
    color: theme.colors.textTertiary,
    marginTop: 1,
  },
  searchInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  searchInput: {
    ...fontStyles.body,
    fontSize: 16,
    color: theme.colors.text,
    flex: 1,
    paddingVertical: 12,
  },
  searchResults: {
    backgroundColor: 'rgba(20,20,30,0.95)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginTop: 6,
    overflow: 'hidden',
  },
  searchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  resultName: {
    ...fontStyles.bodySemiBold,
    fontSize: 14,
    color: theme.colors.text,
  },
  resultUsername: {
    ...fontStyles.body,
    fontSize: 11,
    color: theme.colors.textTertiary,
    marginTop: 1,
  },
  noResults: {
    ...fontStyles.body,
    fontSize: 13,
    color: theme.colors.textTertiary,
    textAlign: 'center',
    paddingVertical: 10,
  },
});
