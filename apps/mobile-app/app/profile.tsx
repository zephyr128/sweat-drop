import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { localAvatarSource } from '@/lib/avatars';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useFocusEffect } from 'expo-router';
import { useThrottledRouter } from '@/hooks/useThrottledRouter';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { PlatformBlur } from '@/components/PlatformBlur';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { useUserBadges, type UserBadge } from '@/hooks/useUserBadges';
import { useGymStore } from '@/lib/stores/useGymStore';
import { theme, getNumberStyle, fontStyles, hexToRgba} from '@/lib/theme';
import { useBranding } from '@/lib/contexts/ThemeContext';
import { VerificationSheet } from '@/components/VerificationSheet';
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { formatMonthYear } from '@/lib/utils/formatDate';
import { log } from '@/lib/logger';
import { useIsDemoUser } from '@/hooks/useIsDemoUser';

function SectionLabel({ label }: { label: string }) {
  return <Text style={styles.sectionLabel}>{label}</Text>;
}

function SectionDivider() {
  return <View style={styles.sectionDivider} />;
}

interface ProfileData {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  total_drops: number;
  available_drops: number;
  weekly_drops: number;
  monthly_drops: number;
  streak_days: number;
  is_newcomer: boolean;
  created_at: string;
  home_gym_id: string | null;
}

interface ProfileStats {
  totalWorkouts: number;
  totalHours: number;
  totalDropsEarned: number;
}

interface UserGym {
  id: string;
  name: string;
  logo_url: string | null;
  local_drops: number;
  isHome: boolean;
}

function formatMemberSince(iso: string): string {
  return formatMonthYear(iso);
}

export default function ProfileScreen() {
  const router = useThrottledRouter();
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const branding = useBranding();
  const { badges: allBadges } = useUserBadges();
  const { homeGymId } = useGymStore();
  const hasGym = !!homeGymId;

  // Filter to home gym's badges + global badges (mirrors Trophy Room filtering)
  const badges = useMemo(() => {
    if (!homeGymId) return allBadges;
    return allBadges.filter(
      (b) => b.badge_type === 'global' || b.gym_id === homeGymId,
    );
  }, [allBadges, homeGymId]);
  const isDemo = useIsDemoUser();
  const { t } = useTranslation('profile');
  const { t: tCommon } = useTranslation('common');
  const { t: tSocial } = useTranslation('socialFriends');
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [stats, setStats] = useState<ProfileStats>({ totalWorkouts: 0, totalHours: 0, totalDropsEarned: 0 });
  const [userGyms, setUserGyms] = useState<UserGym[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isVerified, setIsVerified] = useState<boolean | null>(null);
  const [showVerificationSheet, setShowVerificationSheet] = useState(false);

  // Avatar flip animation
  const highestBadge: UserBadge | null = badges.length > 0 ? badges[0] : null;
  const isFlippedRef = useRef(false);
  const flipProgress = useSharedValue(0);
  const flipScale = useSharedValue(1);

  const handleAvatarFlip = useCallback(() => {
    if (!highestBadge) return;
    isFlippedRef.current = !isFlippedRef.current;
    flipScale.value = withSequence(
      withTiming(0.9, { duration: 100, easing: Easing.out(Easing.quad) }),
      withSpring(1, { damping: 8, stiffness: 200 }),
    );
    flipProgress.value = withSpring(isFlippedRef.current ? 1 : 0, {
      damping: 14, stiffness: 90, mass: 0.8,
    });
  }, [highestBadge]);

  const frontAnimatedStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipProgress.value, [0, 1], [0, 180]);
    return { transform: [{ perspective: 1200 }, { rotateY: `${rotateY}deg` }, { scale: flipScale.value }] };
  });

  const backAnimatedStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipProgress.value, [0, 1], [180, 360]);
    return { transform: [{ perspective: 1200 }, { rotateY: `${rotateY}deg` }, { scale: flipScale.value }] };
  });

  const loadProfile = useCallback(async () => {
    if (!session?.user) { setLoading(false); return; }
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url, total_drops, available_drops, weekly_drops, monthly_drops, streak_days, is_newcomer, created_at, home_gym_id')
        .eq('id', session.user.id)
        .single();
      if (!error && data) {
        setProfile(data as ProfileData);
      } else {
        setLoading(false);
      }
    } catch (err) {
      log.error('[Profile] Error:', err);
      setLoading(false);
    }
  }, [session?.user?.id]);

  const loadStats = useCallback(async () => {
    if (!session?.user) return;
    try {
      const { data: rpcData } = await supabase.rpc('get_my_sessions', {
        p_gym_id: null,
        p_active_only: false,
        p_since: null,
        p_limit: 5000,
      });
      const sessionData = (rpcData ?? []).filter((s: any) => !s.is_active);
      const totalWorkouts = sessionData.length;
      const totalSeconds = sessionData.reduce((sum: number, s: any) => sum + (s.duration_seconds || 0), 0);
      const totalDropsEarned = sessionData.reduce((sum: number, s: any) => sum + (s.drops_earned || 0), 0);
      const totalHours = Math.round((totalSeconds / 3600) * 10) / 10;
      setStats({ totalWorkouts, totalHours, totalDropsEarned });
    } catch (err) {
      log.error('[Profile] Stats error:', err);
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  const loadUserGyms = useCallback(async () => {
    if (!session?.user) return;
    try {
      const { data: memberships } = await supabase
        .from('gym_memberships')
        .select('gym_id, local_drops_balance')
        .eq('user_id', session.user.id);
      if (!memberships || memberships.length === 0) { setUserGyms([]); return; }

      const gymIds = memberships.map(m => m.gym_id);
      const { data: gyms } = await supabase
        .from('gyms')
        .select('id, name, owner_id')
        .in('id', gymIds);

      const ownerIds = [...new Set((gyms ?? []).filter(g => g.owner_id).map(g => g.owner_id!))];
      let logoMap: Record<string, string> = {};
      if (ownerIds.length > 0) {
        const { data: brandingData } = await supabase
          .from('owner_branding')
          .select('owner_id, logo_url')
          .in('owner_id', ownerIds);
        if (brandingData) logoMap = Object.fromEntries(brandingData.map(b => [b.owner_id, b.logo_url]));
      }

      const result: UserGym[] = (gyms ?? []).map(g => {
        const membership = memberships.find(m => m.gym_id === g.id);
        return {
          id: g.id,
          name: g.name,
          logo_url: g.owner_id ? logoMap[g.owner_id] ?? null : null,
          local_drops: membership?.local_drops_balance ?? 0,
          isHome: g.id === profile?.home_gym_id,
        };
      });
      setUserGyms(result.sort((a, b) => (b.isHome ? 1 : 0) - (a.isHome ? 1 : 0)));
    } catch (err) {
      log.error('[Profile] Gyms error:', err);
    }
  }, [session?.user?.id, profile?.home_gym_id]);

  const checkVerification = useCallback(async () => {
    if (!session?.user || !homeGymId) return;
    const { data } = await supabase
      .from('gym_member_identities')
      .select('is_verified')
      .eq('user_id', session.user.id)
      .eq('gym_id', homeGymId)
      .maybeSingle();
    setIsVerified(data?.is_verified === true);
  }, [session?.user?.id, homeGymId]);

  useEffect(() => { loadProfile(); }, [loadProfile]);
  useEffect(() => {
    if (profile) { loadStats(); loadUserGyms(); }
  }, [profile, loadStats, loadUserGyms]);
  useEffect(() => { checkVerification(); }, [checkVerification]);

  useFocusEffect(useCallback(() => { loadProfile(); checkVerification(); }, [loadProfile, checkVerification]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadProfile(), loadStats(), loadUserGyms()]);
    setRefreshing(false);
  }, [loadProfile, loadStats, loadUserGyms]);

  const activityLinks = [
    { icon: 'time-outline' as const, label: t('workoutHistory'), route: '/workout-history', key: 'workoutHistory' },
    { icon: 'podium-outline' as const, label: t('leaderboard'), route: '/leaderboard', key: 'leaderboard' },
  ];
  const rewardsLinks = [
    { icon: 'wallet-outline' as const, label: t('wallet'), route: '/wallet', key: 'wallet' },
    { icon: 'storefront-outline' as const, label: t('rewardsStore'), route: '/store', key: 'rewardsStore' },
    { icon: 'flame-outline' as const, label: t('challenges'), route: '/challenges', key: 'challenges' },
  ];
  const socialLinks = [
    { icon: 'person-add-outline' as const, label: tSocial('inviteTitle'), route: '/invite-friend' },
  ];

  if (loading && !profile) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={['#000000', '#0A0E1A', '#000000']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFillObject} />
        <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
          <ActivityIndicator size="large" color={branding.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#000000', '#0A0E1A', '#000000']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFillObject} />

      {/* Header: Close | Profile | Gear */}
      <View style={[styles.header, { paddingTop: insets.top + theme.spacing.sm }]}>
        <TouchableOpacity
          style={[styles.closeButton, { borderColor: hexToRgba(branding.primary, 0.15) }]}
          onPress={() => router.back()}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close" size={20} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('title')}</Text>
        <TouchableOpacity
          style={[styles.gearButton, { borderColor: hexToRgba(branding.primary, 0.15) }]}
          onPress={() => router.push('/settings')}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="settings-outline" size={20} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={branding.primary} />}
      >
        {/* HERO CARD */}
        <Animated.View entering={FadeInDown.delay(100).duration(500)}>
          <View style={[styles.heroCard, {
            borderTopColor: hexToRgba(branding.primary, 0.35),
            borderLeftColor: hexToRgba(branding.primary, 0.14),
            borderRightColor: 'rgba(255,255,255,0.05)',
            borderBottomColor: 'rgba(255,255,255,0.04)',
          }]}>
            <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={55} tint="dark" style={styles.heroBlur}>
              <View style={styles.heroCardBody}>
                <LinearGradient
                  colors={[hexToRgba(branding.primary, 0.12), 'rgba(255,255,255,0.03)', 'rgba(12,12,22,0.0)']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />

                {isDemo && (
                  <View style={styles.demoPill}>
                    <Ionicons name="flask-outline" size={11} color="#FF9900" />
                    <Text style={styles.demoPillText}>{tCommon('demoMode')}</Text>
                  </View>
                )}

                {homeGymId && isVerified !== null && (
                  <TouchableOpacity
                    onPress={() => { if (!isVerified) setShowVerificationSheet(true); }}
                    activeOpacity={isVerified ? 1 : 0.75}
                    style={[
                      styles.verifiedBadgePill,
                      isVerified ? styles.verifiedBadgePillOn : styles.verifiedBadgePillOff,
                      {
                        borderColor: isVerified
                          ? hexToRgba('#4ade80', 0.42)
                          : hexToRgba('#fbbf24', 0.38),
                        shadowColor: isVerified ? '#4ade80' : '#fbbf24',
                      },
                    ]}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                  >
                    <View
                      style={[
                        styles.verifiedBadgeIconWrap,
                        { backgroundColor: isVerified ? hexToRgba('#4ade80', 0.2) : hexToRgba('#fbbf24', 0.18) },
                      ]}
                    >
                      <Ionicons
                        name={isVerified ? 'shield-checkmark' : 'shield-outline'}
                        size={11}
                        color={isVerified ? '#86efac' : '#fcd34d'}
                      />
                    </View>
                    <Text
                      style={[
                        styles.verifiedBadgePillText,
                        { color: isVerified ? '#a7f3d0' : '#fde68a' },
                      ]}
                      numberOfLines={1}
                    >
                      {isVerified ? t('verifiedBadge') : t('notVerified')}
                    </Text>
                  </TouchableOpacity>
                )}

                {/* ── Identity row: avatar + name block ── */}
                <View
                  style={[
                    styles.heroIdentityRow,
                    homeGymId && isVerified !== null && styles.heroIdentityRowWithVerification,
                  ]}
                >
                {/* Flip card */}
                <TouchableOpacity onPress={handleAvatarFlip} activeOpacity={0.92} style={styles.flipCardContainer} disabled={!highestBadge}>
                  <Animated.View style={[styles.flipCardFace, frontAnimatedStyle]}>
                    {/* Glow ring */}
                    <View style={styles.avatarGlowRing}>
                      <View style={styles.avatarContainer}>
                        {profile?.avatar_url && profile.avatar_url.startsWith('http') ? (
                          <Image source={localAvatarSource(profile.avatar_url)} style={styles.avatar} transition={200} />
                        ) : profile?.avatar_url ? (
                          <LinearGradient colors={[branding.primary, branding.primaryDark]} style={styles.avatarPlaceholder}>
                            <Text style={styles.avatarEmoji}>{profile.avatar_url}</Text>
                          </LinearGradient>
                        ) : (
                          <LinearGradient colors={[branding.primary, branding.primaryDark]} style={styles.avatarPlaceholder}>
                            <Text style={[styles.avatarInitial, { color: branding.onPrimary }]}>
                              {profile?.username?.charAt(0).toUpperCase() || '?'}
                            </Text>
                          </LinearGradient>
                        )}
                      </View>
                    </View>
                    {highestBadge && (
                      <View style={[styles.badgePeekIndicator, { backgroundColor: branding.primaryDark, borderColor: 'rgba(255,215,0,0.6)' }]}>
                        <Ionicons name="trophy" size={10} color="#FFD700" />
                      </View>
                    )}
                  </Animated.View>
                  <Animated.View style={[styles.flipCardFace, styles.flipCardBack, backAnimatedStyle]}>
                    <View style={styles.avatarGlowRing}>
                      <View style={styles.avatarContainer}>
                        {highestBadge?.badge_image_url ? (
                          <Image source={highestBadge.badge_image_url} style={styles.avatar} transition={200} />
                        ) : (
                          <LinearGradient colors={['#2A1F00', '#1A1200']} style={styles.avatarPlaceholder}>
                            <Ionicons name="trophy" size={32} color="#FFD700" />
                          </LinearGradient>
                        )}
                      </View>
                    </View>
                    {highestBadge && (
                      <View style={styles.badgeNameChip}>
                        <Text style={styles.badgeNameChipText} numberOfLines={1}>{highestBadge.badge_name}</Text>
                      </View>
                    )}
                  </Animated.View>
                </TouchableOpacity>

                {/* Name + meta */}
                <View
                  style={[
                    styles.heroNameBlock,
                    homeGymId && isVerified !== null && styles.heroNameBlockWithVerification,
                  ]}
                >
                  <Text style={styles.username} numberOfLines={1}>
                    {profile?.username || t('common:user')}
                  </Text>
                  {profile?.full_name ? (
                    <Text style={styles.fullName} numberOfLines={1}>{profile.full_name}</Text>
                  ) : null}

                  {/* Member since + newcomer inline */}
                  <View style={styles.heroMeta}>
                    <Ionicons name="calendar-outline" size={11} color="rgba(255,255,255,0.35)" />
                    <Text style={styles.heroMetaText}>
                      {profile ? formatMemberSince(profile.created_at) : ''}
                    </Text>
                    {profile?.is_newcomer && (
                      <View style={styles.newcomerDot}>
                        <Text style={styles.newcomerDotText}>🌱</Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>

              {/* ── Stat strip ── */}
              <View style={[styles.heroStatStrip, { borderTopColor: hexToRgba(branding.primary, 0.10) }]}>
                {[
                  { icon: 'water' as const,   value: profile?.total_drops  ?? 0,          label: t('totalDrops'),   color: branding.primary, numeric: true },
                  { icon: 'flame' as const,    value: profile?.streak_days  ?? 0,          label: t('streak'),       color: '#FF6B00',         numeric: true },
                  { icon: 'barbell' as const,  value: stats.totalWorkouts,                 label: t('totalWorkouts'), color: branding.primary, numeric: true },
                  { icon: 'time' as const,     value: stats.totalHours > 0 ? `${stats.totalHours}h` : '—', label: t('trained'), color: branding.primary, numeric: false },
                ].map((s, i, arr) => (
                  <View key={i} style={styles.heroStatItem}>
                    {i > 0 && <View style={[styles.heroStatDivider, { backgroundColor: hexToRgba(branding.primary, 0.10) }]} />}
                    <Ionicons name={s.icon} size={14} color={s.color} />
                    <Text style={[styles.heroStatValue, getNumberStyle(15), { color: '#FFFFFF' }]}>
                      {s.numeric && typeof s.value === 'number'
                        ? (s.value === 0 ? '—' : s.value.toLocaleString())
                        : s.value}
                    </Text>
                    <Text style={styles.heroStatLabel}>{s.label}</Text>
                  </View>
                ))}
              </View>

              {/* ── View detailed stats strip ── */}
              <TouchableOpacity
                style={[styles.gymStrip, { borderTopColor: hexToRgba(branding.primary, 0.10) }]}
                onPress={() => router.push('/stats')}
                activeOpacity={0.7}
              >
                <Ionicons name="stats-chart-outline" size={13} color={hexToRgba(branding.primary, 0.70)} />
                <Text style={[styles.gymStripText, { color: hexToRgba(branding.primary, 0.80) }]}>
                  {t('viewDetailedStats')}
                </Text>
                <Ionicons name="chevron-forward" size={12} color={hexToRgba(branding.primary, 0.35)} />
              </TouchableOpacity>
              </View>
            </PlatformBlur>
          </View>
        </Animated.View>

        {/* MY GYMS — only shown when user belongs to more than one gym */}
        {userGyms.length > 1 && (
          <Animated.View entering={FadeInDown.delay(280).duration(400)}>
            <SectionLabel label={t('myGyms')} />
            <View style={styles.gymsGrid}>
              {userGyms.map((gym) => (
                <TouchableOpacity
                  key={gym.id}
                  style={[styles.gymCard, { borderColor: hexToRgba(gym.isHome ? branding.primary : '#FFFFFF', gym.isHome ? 0.25 : 0.06) }]}
                  onPress={() => router.push({ pathname: '/gym-detail', params: { gymId: gym.id } } as any)}
                  activeOpacity={0.7}
                >
                  <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={30} tint="dark" style={[styles.gymCardBlur, { backgroundColor: 'rgba(20, 20, 30, 0.7)' }]}>
                    {gym.logo_url ? (
                      <Image source={gym.logo_url} style={styles.gymLogo} transition={200} />
                    ) : (
                      <View style={[styles.gymLogoPlaceholder, { backgroundColor: hexToRgba(branding.primary, 0.08) }]}>
                        <Ionicons name="fitness" size={20} color={branding.primary} />
                      </View>
                    )}
                    <Text style={styles.gymCardName} numberOfLines={1}>{gym.name}</Text>
                    <View style={styles.gymCardRow}>
                      <Ionicons name="water" size={12} color={branding.primary} />
                      <Text style={[styles.gymCardDrops, getNumberStyle(14), { color: branding.primary }]}>
                        {gym.local_drops.toLocaleString()}
                      </Text>
                    </View>
                    {gym.isHome && (
                      <View style={[styles.homeBadge, { backgroundColor: hexToRgba(branding.primary, 0.12) }]}>
                        <Text style={[styles.homeBadgeText, { color: branding.primary }]}>{t('homeGymBadge')}</Text>
                      </View>
                    )}
                  </PlatformBlur>
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>
        )}

        {/* ACHIEVEMENTS PREVIEW */}
        {badges.length > 0 && (
          <Animated.View entering={FadeInDown.delay(340).duration(400)}>
            <SectionLabel label={t('achievements')} />
            <View style={[styles.achieveCard, {
              borderTopColor: hexToRgba(branding.primary, 0.22),
              borderLeftColor: hexToRgba(branding.primary, 0.08),
              borderRightColor: 'rgba(255,255,255,0.04)',
              borderBottomColor: 'rgba(255,255,255,0.03)',
            }]}>
              <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={50} tint="dark" style={styles.achieveBlur}>
                <LinearGradient
                  colors={[hexToRgba(branding.primary, 0.08), 'transparent']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />
                <View style={styles.achieveRow}>
                  {badges.slice(0, 4).map((badge, i) => (
                    <View key={badge.badge_id || i} style={styles.achieveBadge}>
                      <View style={[styles.achieveBadgeImgWrap, { borderColor: hexToRgba(branding.primary, 0.20), shadowColor: branding.primary }]}>
                        {badge.badge_image_url ? (
                          <Image source={badge.badge_image_url} style={styles.achieveBadgeImg} transition={200} />
                        ) : (
                          <View style={[styles.achieveBadgePlaceholder, { backgroundColor: hexToRgba(branding.primary, 0.12) }]}>
                            <Ionicons name="trophy" size={24} color={branding.primary} />
                          </View>
                        )}
                      </View>
                      <Text style={styles.achieveBadgeName} numberOfLines={2}>{badge.badge_name}</Text>
                    </View>
                  ))}
                </View>
                <TouchableOpacity
                  style={[styles.achieveLink, { borderTopColor: hexToRgba(branding.primary, 0.10) }]}
                  onPress={() => router.push('/trophy-room')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.achieveLinkText, { color: branding.primary }]}>
                    {t('viewTrophyRoom')}
                  </Text>
                  <View style={[styles.achieveCount, { backgroundColor: hexToRgba(branding.primary, 0.14) }]}>
                    <Text style={[styles.achieveCountText, { color: branding.primary }]}>{badges.length}</Text>
                  </View>
                </TouchableOpacity>
              </PlatformBlur>
            </View>
          </Animated.View>
        )}

        {/* ACTIVITY LINKS */}
        <Animated.View entering={FadeInDown.delay(400).duration(300)}>
          <SectionLabel label={t('sections.activity')} />
          <View style={[styles.linksCard, { borderColor: hexToRgba(branding.primary, 0.08) }]}>
            <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={50} tint="dark" style={[styles.linksBlur, { backgroundColor: 'rgba(20, 20, 30, 0.7)' }]}>
              {activityLinks.map((link, i) => {
                const isDisabled = link.key === 'leaderboard' && !hasGym;
                return (
                  <View key={link.route}>
                    <TouchableOpacity
                      style={[styles.linkRow, isDisabled && { opacity: 0.35 }]}
                      onPress={() => router.push(link.route as any)}
                      activeOpacity={0.7}
                      disabled={isDisabled}
                    >
                      <View style={[styles.linkIcon, { backgroundColor: hexToRgba(branding.primary, 0.10) }]}>
                        <Ionicons name={link.icon} size={20} color={branding.primary} />
                      </View>
                      <Text style={[styles.linkLabel, isDisabled && { opacity: 0.35 }]}>{link.label}</Text>
                      {isDisabled
                        ? <Ionicons name="lock-closed-outline" size={14} color={theme.colors.textTertiary} />
                        : <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
                      }
                    </TouchableOpacity>
                    {i < activityLinks.length - 1 && <SectionDivider />}
                  </View>
                );
              })}
            </PlatformBlur>
          </View>
        </Animated.View>

        {/* SOCIAL LINKS */}
        <Animated.View entering={FadeInDown.delay(430).duration(300)}>
          <SectionLabel label={t('sections.social')} />
          <View style={[styles.linksCard, { borderColor: hexToRgba(branding.primary, 0.08) }]}>
            <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={50} tint="dark" style={[styles.linksBlur, { backgroundColor: 'rgba(20, 20, 30, 0.7)' }]}>
              {socialLinks.map((link, i) => {
                const isDisabled = !hasGym;
                return (
                  <View key={link.route}>
                    <TouchableOpacity
                      style={[styles.linkRow, isDisabled && { opacity: 0.35 }]}
                      onPress={() => router.push(link.route as any)}
                      activeOpacity={0.7}
                      disabled={isDisabled}
                    >
                      <View style={[styles.linkIcon, { backgroundColor: hexToRgba(branding.primary, 0.1) }]}>
                        <Ionicons name={link.icon} size={20} color={branding.primary} />
                      </View>
                      <Text style={[styles.linkLabel, isDisabled && { opacity: 0.35 }]}>{link.label}</Text>
                      {isDisabled
                        ? <Ionicons name="lock-closed-outline" size={14} color={theme.colors.textTertiary} />
                        : <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
                      }
                    </TouchableOpacity>
                    {i < socialLinks.length - 1 && <SectionDivider />}
                  </View>
                );
              })}
            </PlatformBlur>
          </View>
        </Animated.View>

        {/* REWARDS LINKS */}
        <Animated.View entering={FadeInDown.delay(460).duration(300)}>
          <SectionLabel label={t('sections.rewards')} />
          <View style={[styles.linksCard, { borderColor: hexToRgba(branding.primary, 0.08) }]}>
            <PlatformBlur androidColor="rgba(12,12,22,0.97)" intensity={50} tint="dark" style={[styles.linksBlur, { backgroundColor: 'rgba(20, 20, 30, 0.7)' }]}>
              {rewardsLinks.map((link, i) => {
                const isDisabled = !hasGym;
                return (
                  <View key={link.route}>
                    <TouchableOpacity
                      style={[styles.linkRow, isDisabled && { opacity: 0.35 }]}
                      onPress={() => router.push(link.route as any)}
                      activeOpacity={0.7}
                      disabled={isDisabled}
                    >
                      <View style={[styles.linkIcon, { backgroundColor: hexToRgba(branding.primary, 0.10) }]}>
                        <Ionicons name={link.icon} size={20} color={branding.primary} />
                      </View>
                      <Text style={[styles.linkLabel, isDisabled && { opacity: 0.35 }]}>{link.label}</Text>
                      {isDisabled
                        ? <Ionicons name="lock-closed-outline" size={14} color={theme.colors.textTertiary} />
                        : <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
                      }
                    </TouchableOpacity>
                    {i < rewardsLinks.length - 1 && <SectionDivider />}
                  </View>
                );
              })}
            </PlatformBlur>
          </View>
        </Animated.View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <VerificationSheet
        visible={showVerificationSheet}
        onClose={() => setShowVerificationSheet(false)}
        brandColor={branding.primary}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  headerTitle: {
    ...fontStyles.heading,
    flex: 1,
    fontSize: 22,
    color: theme.colors.text,
    textAlign: 'center',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  gearButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm },

  // ── Hero card ──
  heroCard: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 12,
    backgroundColor: 'rgba(12,12,22,0.50)',
  },
  heroBlur: { borderRadius: 24, overflow: 'hidden' },
  heroCardBody: { position: 'relative' },

  heroIdentityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 18,
  },
  heroIdentityRowWithVerification: { paddingTop: 42 },

  // flip card
  flipCardContainer: { width: 82, height: 96, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  flipCardFace: { alignItems: 'center', backfaceVisibility: 'hidden' },
  flipCardBack: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' },

  // avatar
  avatarGlowRing: {
    width: 78, height: 78, borderRadius: 39,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarContainer: { width: 78, height: 78, borderRadius: 39, overflow: 'hidden' },
  avatar: { width: '100%', height: '100%' },
  avatarPlaceholder: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
  avatarEmoji: { fontSize: 34 },
  avatarInitial: { ...fontStyles.heading, fontSize: 28 },
  badgePeekIndicator: { position: 'absolute', bottom: 4, right: -2, width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, zIndex: 10 },
  badgeNameChip: { marginTop: 4, backgroundColor: 'rgba(255,215,0,0.12)', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 7, maxWidth: 80 },
  badgeNameChipText: { ...fontStyles.bodySemiBold, fontSize: 9, color: '#FFD700', textAlign: 'center' },

  // name block
  heroNameBlock: { flex: 1, minWidth: 0 },
  heroNameBlockWithVerification: { paddingRight: 0 },
  username: {
    ...fontStyles.heading,
    fontSize: 22,
    color: '#FFFFFF',
    letterSpacing: 0.2,
    marginBottom: 1,
  },
  fullName: {
    ...fontStyles.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
    marginBottom: 6,
  },
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 },
  heroMetaText: { ...fontStyles.body, fontSize: 11, color: 'rgba(255,255,255,0.35)' },
  newcomerDot: { marginLeft: 2 },
  newcomerDotText: { fontSize: 11 },

  demoPill: {
    position: 'absolute',
    top: 10,
    left: 14,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 153, 0, 0.50)',
    backgroundColor: 'rgba(40, 28, 10, 0.72)',
  },
  demoPillText: {
    ...fontStyles.bodySemiBold,
    fontSize: 9,
    letterSpacing: 0.6,
    color: '#FF9900',
    textTransform: 'uppercase',
  },

  verifiedBadgePill: {
    position: 'absolute',
    top: 10,
    right: 14,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
    paddingLeft: 4,
    paddingRight: 9,
    borderRadius: 16,
    borderWidth: 1,
    maxWidth: '42%',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
  },
  verifiedBadgePillOn: {
    backgroundColor: 'rgba(16, 40, 28, 0.72)',
  },
  verifiedBadgePillOff: {
    backgroundColor: 'rgba(45, 36, 14, 0.72)',
  },
  verifiedBadgeIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  verifiedBadgePillText: {
    ...fontStyles.bodySemiBold,
    fontSize: 9,
    letterSpacing: 0.2,
    flexShrink: 1,
  },

  // stat strip
  heroStatStrip: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  heroStatItem: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    position: 'relative',
  },
  heroStatDivider: {
    position: 'absolute', left: 0, top: '10%', bottom: '10%',
    width: StyleSheet.hairlineWidth,
  },
  heroStatValue: { lineHeight: 19 },
  heroStatLabel: { ...fontStyles.body, fontSize: 9, color: 'rgba(255,255,255,0.38)', letterSpacing: 0.3, textTransform: 'uppercase', textAlign: 'center' },

  // gym strip
  gymStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderTopWidth: 1,
    paddingVertical: 11,
    paddingHorizontal: 20,
  },
  gymStripText: { ...fontStyles.bodySemiBold, fontSize: 12, flex: 1 },


  gymsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 4 },
  gymCard: { width: (Dimensions.get('window').width - theme.spacing.lg * 2 - 12) / 2, height: 150, borderRadius: theme.borderRadius.md, borderWidth: 1, overflow: 'hidden' },
  gymCardBlur: { borderRadius: theme.borderRadius.md, overflow: 'hidden', padding: 14, alignItems: 'center', justifyContent: 'center', gap: 8, flex: 1 },
  gymLogo: { width: 40, height: 40, borderRadius: 12 },
  gymLogoPlaceholder: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  gymCardName: { ...fontStyles.bodySemiBold, fontSize: 13, color: theme.colors.text, textAlign: 'center' },
  gymCardRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  gymCardDrops: {},
  homeBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  homeBadgeText: { ...fontStyles.heading, fontSize: 9, letterSpacing: 1 },

  achieveCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: theme.spacing.sm,
    backgroundColor: 'rgba(12,12,22,0.50)',
  },
  achieveBlur: { borderRadius: 18, overflow: 'hidden', padding: 16 },
  achieveRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
    gap: 8,
  },
  achieveBadge: {
    flex: 1,
    alignItems: 'center',
    gap: 7,
  },
  achieveBadgeImgWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 1.5,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  achieveBadgeImg: { width: 58, height: 58, borderRadius: 29 },
  achieveBadgePlaceholder: { width: 58, height: 58, borderRadius: 29, justifyContent: 'center', alignItems: 'center' },
  achieveBadgeName: {
    ...fontStyles.bodySemiBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.65)',
    textAlign: 'center',
    lineHeight: 13,
  },
  achieveLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  achieveLinkText: { ...fontStyles.bodySemiBold, fontSize: 13 },
  achieveCount: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  achieveCountText: { ...fontStyles.heading, fontSize: 12 },

  linksCard: { borderRadius: theme.borderRadius.md, borderWidth: 1, overflow: 'hidden' },
  linksBlur: { borderRadius: theme.borderRadius.md, overflow: 'hidden' },
  linkRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, gap: 12 },
  linkIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  linkLabel: { ...fontStyles.bodySemiBold, flex: 1, fontSize: theme.typography.fontSize.base, color: theme.colors.text },

  sectionLabel: { ...fontStyles.heading, fontSize: 13, letterSpacing: 2, color: theme.colors.textTertiary, marginBottom: 8, marginLeft: 4, marginTop: theme.spacing.lg },
  sectionDivider: { height: 1, backgroundColor: 'rgba(255, 255, 255, 0.05)' },
});
