import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { useUserBadges, type UserBadge } from '@/hooks/useUserBadges';
import { useGymStore } from '@/lib/stores/useGymStore';
import { theme, getNumberStyle, fontStyles, hexToRgba} from '@/lib/theme';
import { useBranding, useTheme } from '@/lib/contexts/ThemeContext';
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
import { log } from '@/lib/logger';

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

function formatMemberSince(iso: string, lang: string = 'sr'): string {
  const d = new Date(iso);
  const locale = lang === 'sr' ? 'sr-RS' : 'en-US';
  return d.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const branding = useBranding();
  const { activeGym } = useTheme();
  const { badges } = useUserBadges();
  const { homeGymId } = useGymStore();
  const hasGym = !!homeGymId;
  const { t, i18n } = useTranslation('profile');
  const { t: tSocial } = useTranslation('socialFriends');
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [stats, setStats] = useState<ProfileStats>({ totalWorkouts: 0, totalHours: 0, totalDropsEarned: 0 });
  const [userGyms, setUserGyms] = useState<UserGym[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
    if (!session?.user) return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url, total_drops, available_drops, weekly_drops, monthly_drops, streak_days, is_newcomer, created_at, home_gym_id')
        .eq('id', session.user.id)
        .single();
      if (!error && data) setProfile(data as ProfileData);
    } catch (err) {
      log.error('[Profile] Error:', err);
    }
  }, [session?.user?.id]);

  const loadStats = useCallback(async () => {
    if (!session?.user) return;
    try {
      const { data: sessionData } = await supabase
        .from('sessions')
        .select('duration_seconds, drops_earned')
        .eq('user_id', session.user.id)
        .eq('is_active', false);
      const totalWorkouts = sessionData?.length || 0;
      const totalSeconds = sessionData?.reduce((sum, s) => sum + (s.duration_seconds || 0), 0) || 0;
      const totalDropsEarned = sessionData?.reduce((sum, s) => sum + (s.drops_earned || 0), 0) || 0;
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

  useEffect(() => { loadProfile(); }, [loadProfile]);
  useEffect(() => {
    if (profile) { loadStats(); loadUserGyms(); }
  }, [profile, loadStats, loadUserGyms]);

  useFocusEffect(useCallback(() => { loadProfile(); }, [loadProfile]));

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
          <View style={[styles.heroCard, { borderColor: hexToRgba(branding.primary, 0.2) }]}>
            <BlurView intensity={50} tint="dark" style={[styles.heroBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
              <LinearGradient
                colors={[hexToRgba(branding.primary, 0.1), 'rgba(20, 20, 35, 0.95)', hexToRgba(branding.primary, 0.05)]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={styles.heroGradient}
              >
                {/* Avatar Flip Card */}
                <TouchableOpacity onPress={handleAvatarFlip} activeOpacity={0.95} style={styles.flipCardContainer} disabled={!highestBadge}>
                  <Animated.View style={[styles.flipCardFace, frontAnimatedStyle]}>
                    <View style={[styles.avatarContainer, { borderColor: branding.primary }]}>
                      {profile?.avatar_url && profile.avatar_url.startsWith('http') ? (
                        <Image source={profile.avatar_url} style={styles.avatar} transition={200} />
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
                    {highestBadge && (
                      <View style={[styles.badgePeekIndicator, { backgroundColor: branding.primaryDark, borderColor: 'rgba(255, 215, 0, 0.6)' }]}>
                        <Ionicons name="trophy" size={12} color="#FFD700" />
                      </View>
                    )}
                  </Animated.View>
                  <Animated.View style={[styles.flipCardFace, styles.flipCardBack, backAnimatedStyle]}>
                    <View style={[styles.avatarContainer, { borderColor: '#FFD700', borderWidth: 2.5 }]}>
                      {highestBadge?.badge_image_url ? (
                        <Image source={highestBadge.badge_image_url} style={styles.avatar} transition={200} />
                      ) : (
                        <LinearGradient colors={['#2A1F00', '#1A1200']} style={styles.avatarPlaceholder}>
                          <Ionicons name="trophy" size={36} color="#FFD700" />
                        </LinearGradient>
                      )}
                    </View>
                    {highestBadge && (
                      <View style={styles.badgeNameChip}>
                        <Text style={styles.badgeNameChipText} numberOfLines={1}>{highestBadge.badge_name}</Text>
                      </View>
                    )}
                  </Animated.View>
                </TouchableOpacity>

                <Text style={styles.username}>{profile?.username || t('common:user')}</Text>
                {profile?.full_name && <Text style={styles.fullName}>{profile.full_name}</Text>}

                <View style={styles.heroPills}>
                  <View style={[styles.heroPill, { backgroundColor: hexToRgba(branding.primary, 0.1) }]}>
                    <Ionicons name="calendar-outline" size={12} color={branding.primary} />
                    <Text style={[styles.heroPillText, { color: branding.primary }]}>
                      {t('memberSince', { date: profile ? formatMemberSince(profile.created_at, i18n.language) : '' })}
                    </Text>
                  </View>
                  {profile && profile.streak_days > 0 && (
                    <View style={[styles.heroPill, { backgroundColor: 'rgba(255, 145, 0, 0.12)' }]}>
                      <Text style={{ fontSize: 12 }}>🔥</Text>
                      <Text style={[styles.heroPillText, { color: theme.colors.secondary }]}>
                        {t('dayStreakPill', { count: profile.streak_days })}
                      </Text>
                    </View>
                  )}
                  {profile?.is_newcomer && (
                    <View style={[styles.heroPill, { backgroundColor: 'rgba(76, 175, 80, 0.12)' }]}>
                      <Text style={{ fontSize: 12 }}>🌱</Text>
                      <Text style={[styles.heroPillText, { color: '#4CAF50' }]}>{t('newcomer')}</Text>
                    </View>
                  )}
                </View>

                {/* Home gym chip */}
                {activeGym && (
                  <TouchableOpacity
                    style={[styles.gymChip, { borderColor: hexToRgba(branding.primary, 0.2) }]}
                    onPress={() => router.push({ pathname: '/gym-detail', params: { gymId: activeGym.id } } as any)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="fitness-outline" size={14} color={branding.primary} />
                    <Text style={[styles.gymChipText, { color: branding.primary }]}>{activeGym.name}</Text>
                    <Ionicons name="chevron-forward" size={12} color={hexToRgba(branding.primary, 0.5)} />
                  </TouchableOpacity>
                )}
              </LinearGradient>
            </BlurView>
          </View>
        </Animated.View>

        {/* MY STATS ROW */}
        <Animated.View entering={FadeInDown.delay(200).duration(400)}>
          <TouchableOpacity
            style={[styles.statsRowCard, { borderColor: hexToRgba(branding.primary, 0.12) }]}
            onPress={() => router.push('/stats')}
            activeOpacity={0.7}
          >
            <BlurView intensity={40} tint="dark" style={[styles.statsRowBlur, { backgroundColor: 'rgba(20, 20, 30, 0.7)' }]}>
              <View style={styles.statsRowInner}>
                {[
                  { icon: 'water' as const, value: profile?.total_drops || 0, label: t('totalDrops'), color: branding.primary },
                  { icon: 'barbell' as const, value: stats.totalWorkouts, label: t('totalWorkouts'), color: branding.primary },
                  { icon: 'time' as const, value: stats.totalHours > 0 ? `${stats.totalHours}h` : '—', label: t('trained'), color: branding.primary },
                ].map((s, i) => (
                  <View key={i} style={styles.statsRowItem}>
                    <Ionicons name={s.icon} size={16} color={s.color} />
                    <Text style={[styles.statsRowValue, getNumberStyle(18), { color: s.color }]}>
                      {typeof s.value === 'number' ? (s.value === 0 ? '—' : s.value.toLocaleString()) : s.value}
                    </Text>
                    <Text style={styles.statsRowLabel}>{s.label}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.statsRowLink}>
                <Text style={[styles.statsRowLinkText, { color: branding.primary }]}>{t('viewDetailedStats')}</Text>
              </View>
            </BlurView>
          </TouchableOpacity>
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
                  <BlurView intensity={30} tint="dark" style={[styles.gymCardBlur, { backgroundColor: 'rgba(20, 20, 30, 0.7)' }]}>
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
                  </BlurView>
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>
        )}

        {/* ACHIEVEMENTS PREVIEW */}
        {badges.length > 0 && (
          <Animated.View entering={FadeInDown.delay(340).duration(400)}>
            <SectionLabel label={t('achievements')} />
            <View style={[styles.achieveCard, { borderColor: hexToRgba(branding.primary, 0.08) }]}>
              <BlurView intensity={40} tint="dark" style={[styles.achieveBlur, { backgroundColor: 'rgba(20, 20, 30, 0.7)' }]}>
                <View style={styles.achieveRow}>
                  {badges.slice(0, 4).map((badge, i) => (
                    <View key={badge.badge_id || i} style={styles.achieveBadge}>
                      {badge.badge_image_url ? (
                        <Image source={badge.badge_image_url} style={styles.achieveBadgeImg} transition={200} />
                      ) : (
                        <View style={[styles.achieveBadgePlaceholder, { backgroundColor: hexToRgba('#FFD700', 0.12) }]}>
                          <Ionicons name="trophy" size={18} color="#FFD700" />
                        </View>
                      )}
                      <Text style={styles.achieveBadgeName} numberOfLines={1}>{badge.badge_name}</Text>
                    </View>
                  ))}
                </View>
                <TouchableOpacity
                  style={styles.achieveLink}
                  onPress={() => router.push('/trophy-room')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.achieveLinkText, { color: branding.primary }]}>
                    {t('viewTrophyRoom')}
                  </Text>
                  <View style={[styles.achieveCount, { backgroundColor: hexToRgba(branding.primary, 0.12) }]}>
                    <Text style={[styles.achieveCountText, { color: branding.primary }]}>{badges.length}</Text>
                  </View>
                </TouchableOpacity>
              </BlurView>
            </View>
          </Animated.View>
        )}

        {/* ACTIVITY LINKS */}
        <Animated.View entering={FadeInDown.delay(400).duration(300)}>
          <SectionLabel label={t('sections.activity')} />
          <View style={[styles.linksCard, { borderColor: hexToRgba(branding.primary, 0.08) }]}>
            <BlurView intensity={50} tint="dark" style={[styles.linksBlur, { backgroundColor: 'rgba(20, 20, 30, 0.7)' }]}>
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
            </BlurView>
          </View>
        </Animated.View>

        {/* SOCIAL LINKS */}
        <Animated.View entering={FadeInDown.delay(430).duration(300)}>
          <SectionLabel label={t('sections.social')} />
          <View style={[styles.linksCard, { borderColor: hexToRgba(branding.primary, 0.08) }]}>
            <BlurView intensity={50} tint="dark" style={[styles.linksBlur, { backgroundColor: 'rgba(20, 20, 30, 0.7)' }]}>
              {socialLinks.map((link, i) => (
                <View key={link.route}>
                  <TouchableOpacity style={styles.linkRow} onPress={() => router.push(link.route as any)} activeOpacity={0.7}>
                    <View style={[styles.linkIcon, { backgroundColor: hexToRgba(branding.primary, 0.1) }]}>
                      <Ionicons name={link.icon} size={20} color={branding.primary} />
                    </View>
                    <Text style={styles.linkLabel}>{link.label}</Text>
                    <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
                  </TouchableOpacity>
                  {i < socialLinks.length - 1 && <SectionDivider />}
                </View>
              ))}
            </BlurView>
          </View>
        </Animated.View>

        {/* REWARDS LINKS */}
        <Animated.View entering={FadeInDown.delay(460).duration(300)}>
          <SectionLabel label={t('sections.rewards')} />
          <View style={[styles.linksCard, { borderColor: hexToRgba(branding.primary, 0.08) }]}>
            <BlurView intensity={50} tint="dark" style={[styles.linksBlur, { backgroundColor: 'rgba(20, 20, 30, 0.7)' }]}>
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
            </BlurView>
          </View>
        </Animated.View>

        <View style={{ height: 40 }} />
      </ScrollView>
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

  heroCard: { borderRadius: theme.borderRadius.xl, borderWidth: 1, overflow: 'hidden', marginBottom: theme.spacing.lg },
  heroBlur: { borderRadius: theme.borderRadius.xl, overflow: 'hidden' },
  heroGradient: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: theme.spacing.lg },
  flipCardContainer: { width: 88, height: 100, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  flipCardFace: { alignItems: 'center', backfaceVisibility: 'hidden' },
  flipCardBack: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' },
  badgePeekIndicator: { position: 'absolute', bottom: 8, right: -2, width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center', borderWidth: 2, zIndex: 10 },
  badgeNameChip: { marginTop: 4, backgroundColor: 'rgba(255, 215, 0, 0.12)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, maxWidth: 88 },
  badgeNameChipText: { ...fontStyles.bodySemiBold, fontSize: 9, color: '#FFD700', textAlign: 'center' },
  avatarContainer: { width: 84, height: 84, borderRadius: 42, borderWidth: 2, overflow: 'hidden' },
  avatar: { width: '100%', height: '100%' },
  avatarPlaceholder: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
  avatarEmoji: { fontSize: 42 },
  avatarInitial: { ...fontStyles.heading, fontSize: 34 },
  username: { ...fontStyles.bodySemiBold, fontSize: theme.typography.fontSize['2xl'], color: theme.colors.text, marginBottom: 2 },
  fullName: { ...fontStyles.body, fontSize: theme.typography.fontSize.base, color: theme.colors.textSecondary, marginBottom: 12 },
  heroPills: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  heroPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  heroPillText: { ...fontStyles.bodySemiBold, fontSize: 12 },
  gymChip: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.04)' },
  gymChipText: { ...fontStyles.bodySemiBold, fontSize: 13 },

  statsRowCard: { borderRadius: theme.borderRadius.lg, borderWidth: 1, overflow: 'hidden', marginBottom: theme.spacing.lg },
  statsRowBlur: { borderRadius: theme.borderRadius.lg, overflow: 'hidden', padding: theme.spacing.md },
  statsRowInner: { flexDirection: 'row', justifyContent: 'space-around' },
  statsRowItem: { alignItems: 'center', gap: 4 },
  statsRowValue: {},
  statsRowLabel: { ...fontStyles.heading, fontSize: 11, color: theme.colors.textTertiary },
  statsRowLink: { alignItems: 'center', marginTop: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.06)' },
  statsRowLinkText: { ...fontStyles.bodySemiBold, fontSize: 13 },

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

  achieveCard: { borderRadius: theme.borderRadius.md, borderWidth: 1, overflow: 'hidden', marginBottom: theme.spacing.sm },
  achieveBlur: { borderRadius: theme.borderRadius.md, overflow: 'hidden', padding: theme.spacing.md },
  achieveRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 12 },
  achieveBadge: { alignItems: 'center', gap: 4, width: 60 },
  achieveBadgeImg: { width: 44, height: 44, borderRadius: 22 },
  achieveBadgePlaceholder: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  achieveBadgeName: { ...fontStyles.body, fontSize: 10, color: theme.colors.textSecondary, textAlign: 'center' },
  achieveLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.06)' },
  achieveLinkText: { ...fontStyles.bodySemiBold, fontSize: 13 },
  achieveCount: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  achieveCountText: { ...fontStyles.heading, fontSize: 12 },

  linksCard: { borderRadius: theme.borderRadius.md, borderWidth: 1, overflow: 'hidden' },
  linksBlur: { borderRadius: theme.borderRadius.md, overflow: 'hidden' },
  linkRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, gap: 12 },
  linkIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  linkLabel: { ...fontStyles.bodySemiBold, flex: 1, fontSize: theme.typography.fontSize.base, color: theme.colors.text },

  sectionLabel: { ...fontStyles.heading, fontSize: 13, color: theme.colors.textTertiary, marginBottom: 8, marginLeft: 4, marginTop: theme.spacing.lg },
  sectionDivider: { height: 1, backgroundColor: 'rgba(255, 255, 255, 0.05)' },
});
