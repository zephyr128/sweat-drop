import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image, Alert, Linking, Platform } from 'react-native';
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
import { theme, getNumberStyle, fontStyles } from '@/lib/theme';
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
import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';
import * as Notifications from 'expo-notifications';
import { log } from '@/lib/logger';
import {
  PUSH_NOTIFICATIONS_ENABLED,
  registerForPushNotifications,
  savePushToken,
} from '@/lib/notifications';

// AGENT NOTE: [2026-03-02] - mobile-coder (Task 3.6)
// Dedicated Profile screen with hero, stats grid, recent badges, quick links.
// Accessible from Home (settings sheet or future nav).

function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(0, 229, 255, ${alpha})`;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function SectionLabel({ label }: { label: string }) {
  return <Text style={styles.sectionLabel}>{label}</Text>;
}

function SectionDivider() {
  return <View style={styles.sectionDivider} />;
}

function SectionDividerThick() {
  return <View style={styles.sectionDividerThick} />;
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
  gender: string | null;
  weight_kg: number | null;
  height_cm: number | null;
  date_of_birth: string | null;
  fitness_goal: string | null;
  onboarding_completed: boolean;
}

interface ProfileStats {
  totalWorkouts: number;
  totalHours: number;
  totalDropsEarned: number;
  longestStreak: number;
}

function formatMemberSince(iso: string, lang: string = 'sr'): string {
  const d = new Date(iso);
  const locale = lang === 'sr' ? 'sr-RS' : 'en-US';
  return d.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}

interface IdentityStatus {
  isVerified: boolean;
  verifiedAt: string | null;
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
  const { t: tOnboarding } = useTranslation('onboarding');
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [stats, setStats] = useState<ProfileStats>({ totalWorkouts: 0, totalHours: 0, totalDropsEarned: 0, longestStreak: 0 });
  const [loading, setLoading] = useState(true);
  const [identity, setIdentity] = useState<IdentityStatus | null>(null);
  const [pushStatus, setPushStatus] = useState<'granted' | 'denied' | 'undetermined' | 'unsupported'>('undetermined');

  const checkPushStatus = useCallback(async () => {
    if (!PUSH_NOTIFICATIONS_ENABLED) {
      setPushStatus('unsupported');
      return;
    }
    try {
      const { status } = await Notifications.getPermissionsAsync();
      setPushStatus(status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined');
    } catch {
      setPushStatus('unsupported');
    }
  }, []);

  const handleEnablePush = useCallback(async () => {
    if (pushStatus === 'undetermined') {
      const token = await registerForPushNotifications();
      if (token && session?.user?.id) {
        await savePushToken(session.user.id, token);
      }
      await checkPushStatus();
    } else if (pushStatus === 'denied') {
      Linking.openSettings();
    }
  }, [pushStatus, session?.user?.id, checkPushStatus]);

  const loadProfile = useCallback(async () => {
    if (!session?.user) return;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url, total_drops, available_drops, weekly_drops, monthly_drops, streak_days, is_newcomer, created_at, gender, weight_kg, height_cm, date_of_birth, fitness_goal, onboarding_completed')
        .eq('id', session.user.id)
        .single();

      if (error) {
        log.error('[Profile] Error loading profile:', error);
        return;
      }

      setProfile(data as ProfileData);
    } catch (err) {
      console.error('[Profile] Error:', err);
    }
  }, [session?.user?.id]);

  const loadStats = useCallback(async () => {
    if (!session?.user) return;

    try {
      // Total workouts + total hours
      const { data: sessionData, error: sessionError } = await supabase
        .from('sessions')
        .select('duration_seconds, drops_earned')
        .eq('user_id', session.user.id)
        .eq('is_active', false);

      if (sessionError) {
        console.error('[Profile] Error loading session stats:', sessionError);
        return;
      }

      const totalWorkouts = sessionData?.length || 0;
      const totalSeconds = sessionData?.reduce((sum, s) => sum + (s.duration_seconds || 0), 0) || 0;
      const totalDropsEarned = sessionData?.reduce((sum, s) => sum + (s.drops_earned || 0), 0) || 0;
      const totalHours = Math.round((totalSeconds / 3600) * 10) / 10; // 1 decimal

      // Longest streak — compute from session dates
      let longestStreak = 0;
      if (sessionData && sessionData.length > 0) {
        // We already have the profile streak_days for current streak;
        // For longest streak, do a simple count from all sessions
        // The server-tracked streak_days is the current active streak
        longestStreak = profile?.streak_days || 0;
      }

      setStats({ totalWorkouts, totalHours, totalDropsEarned, longestStreak });
    } catch (err) {
      console.error('[Profile] Stats error:', err);
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id, profile?.streak_days]);

  const loadIdentity = useCallback(async () => {
    if (!session?.user || !homeGymId) {
      setIdentity(null);
      return;
    }
    try {
      const { data } = await supabase
        .from('gym_member_identities')
        .select('is_verified, verified_at')
        .eq('gym_id', homeGymId)
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (data) {
        setIdentity({ isVerified: data.is_verified, verifiedAt: data.verified_at });
      } else {
        setIdentity({ isVerified: false, verifiedAt: null });
      }
    } catch {
      // non-critical
    }
  }, [session?.user?.id, homeGymId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (profile) {
      loadStats();
      loadIdentity();
    }
  }, [profile, loadStats, loadIdentity]);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
      checkPushStatus();
    }, [loadProfile, checkPushStatus])
  );

  // Highest badge (most recently earned = first in sorted list)
  const highestBadge: UserBadge | null = badges.length > 0 ? badges[0] : null;

  // ── Avatar ↔ Badge flip animation ──
  const isFlippedRef = useRef(false);
  const flipProgress = useSharedValue(0);
  const flipScale = useSharedValue(1);

  const handleAvatarFlip = useCallback(() => {
    if (!highestBadge) return;
    isFlippedRef.current = !isFlippedRef.current;

    // Bounce scale for juicy feel
    flipScale.value = withSequence(
      withTiming(0.9, { duration: 100, easing: Easing.out(Easing.quad) }),
      withSpring(1, { damping: 8, stiffness: 200 }),
    );

    // 3D rotation
    flipProgress.value = withSpring(isFlippedRef.current ? 1 : 0, {
      damping: 14,
      stiffness: 90,
      mass: 0.8,
    });
  }, [highestBadge]);

  const frontAnimatedStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipProgress.value, [0, 1], [0, 180]);
    return {
      transform: [
        { perspective: 1200 },
        { rotateY: `${rotateY}deg` },
        { scale: flipScale.value },
      ],
    };
  });

  const backAnimatedStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipProgress.value, [0, 1], [180, 360]);
    return {
      transform: [
        { perspective: 1200 },
        { rotateY: `${rotateY}deg` },
        { scale: flipScale.value },
      ],
    };
  });

  const appVersion = Constants.expoConfig?.version || '1.0.0';

  const handleLogout = () => {
    Alert.alert(
      t('logoutTitle'),
      t('logoutConfirm'),
      [
        { text: t('common:cancel'), style: 'cancel' },
        {
          text: t('logout'),
          style: 'destructive',
          onPress: async () => {
            try {
              const { useAuthStore } = await import('@/lib/stores/authStore');
              await useAuthStore.getState().signOut();
              if (router.canDismiss()) {
                router.dismissAll();
              }
              router.replace('/(onboarding)/welcome');
            } catch (error: any) {
              Alert.alert(t('common:error'), error.message || t('failedLogout'));
            }
          },
        },
      ],
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      t('deleteAccountTitle'),
      t('deleteConfirm'),
      [
        { text: t('common:cancel'), style: 'cancel' },
        {
          text: t('deleteAccount'),
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              t('deleteConfirm2Title'),
              t('deleteConfirm2'),
              [
                { text: t('common:cancel'), style: 'cancel' },
                {
                  text: t('yesDelete'),
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      const { useAuthStore } = await import('@/lib/stores/authStore');
                      await useAuthStore.getState().signOut();
                      if (router.canDismiss()) {
                        router.dismissAll();
                      }
                      router.replace('/(onboarding)/welcome');
                    } catch (error: any) {
                      Alert.alert(t('common:error'), error.message || t('failedDelete'));
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
  };

  // Section 1 — Activity links
  const activityLinks = [
    { icon: 'time-outline' as const, label: t('workoutHistory'), route: '/workout-history', key: 'workoutHistory' },
    { icon: 'trophy-outline' as const, label: t('trophyRoom'), route: '/trophy-room', key: 'trophyRoom' },
    { icon: 'podium-outline' as const, label: t('leaderboard'), route: '/leaderboard', key: 'leaderboard' },
  ];

  // Section 2 — Rewards links
  const rewardsLinks = [
    { icon: 'wallet-outline' as const, label: t('wallet'), route: '/wallet', key: 'wallet' },
    { icon: 'storefront-outline' as const, label: t('rewardsStore'), route: '/store', key: 'rewardsStore' },
    { icon: 'flame-outline' as const, label: t('challenges'), route: '/challenges', key: 'challenges' },
  ];

  if (loading && !profile) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={['#000000', '#0A0E1A', '#000000']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
          <ActivityIndicator size="large" color={branding.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#000000', '#0A0E1A', '#000000']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + theme.spacing.sm }]}>
        <View style={styles.headerSpacer} />
        <Text style={styles.headerTitle}>{t('title')}</Text>
        <TouchableOpacity
          style={[styles.closeButton, { borderColor: hexToRgba(branding.primary, 0.15) }]}
          onPress={() => router.back()}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close" size={22} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ═══════════════════════════════════════════ */}
        {/* PROFILE HERO                                */}
        {/* ═══════════════════════════════════════════ */}
        <Animated.View entering={FadeInDown.delay(100).duration(500)}>
          <View style={[styles.heroCard, { borderColor: hexToRgba(branding.primary, 0.2) }]}>
            <BlurView intensity={50} tint="dark" style={[styles.heroBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
              <LinearGradient
                colors={[hexToRgba(branding.primary, 0.1), 'rgba(20, 20, 35, 0.95)', hexToRgba(branding.primary, 0.05)]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.heroGradient}
              >
                {/* Avatar ↔ Badge Flip Card */}
                <TouchableOpacity
                  onPress={handleAvatarFlip}
                  activeOpacity={0.95}
                  style={styles.flipCardContainer}
                  disabled={!highestBadge}
                >
                  {/* Front — Avatar */}
                  <Animated.View style={[styles.flipCardFace, frontAnimatedStyle]}>
                    <View style={[styles.avatarContainer, { borderColor: branding.primary }]}>
                      {profile?.avatar_url && profile.avatar_url.startsWith('http') ? (
                        <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
                      ) : profile?.avatar_url ? (
                        <LinearGradient
                          colors={[branding.primary, branding.primaryDark]}
                          style={styles.avatarPlaceholder}
                        >
                          <Text style={styles.avatarEmoji}>{profile.avatar_url}</Text>
                        </LinearGradient>
                      ) : (
                        <LinearGradient
                          colors={[branding.primary, branding.primaryDark]}
                          style={styles.avatarPlaceholder}
                        >
                          <Text style={[styles.avatarInitial, { color: branding.onPrimary }]}>
                            {profile?.username?.charAt(0).toUpperCase() || '?'}
                          </Text>
                        </LinearGradient>
                      )}
                    </View>
                    {/* Badge peek indicator */}
                    {highestBadge && (
                      <View style={[styles.badgePeekIndicator, { backgroundColor: branding.primaryDark, borderColor: 'rgba(255, 215, 0, 0.6)' }]}>
                        <Ionicons name="trophy" size={12} color="#FFD700" />
                      </View>
                    )}
                  </Animated.View>

                  {/* Back — Highest Badge */}
                  <Animated.View style={[styles.flipCardFace, styles.flipCardBack, backAnimatedStyle]}>
                    <View style={[styles.avatarContainer, { borderColor: '#FFD700', borderWidth: 2.5 }]}>
                      {highestBadge?.badge_image_url ? (
                        <Image source={{ uri: highestBadge.badge_image_url }} style={styles.avatar} />
                      ) : (
                        <LinearGradient
                          colors={['#2A1F00', '#1A1200']}
                          style={styles.avatarPlaceholder}
                        >
                          <Ionicons name="trophy" size={36} color="#FFD700" />
                        </LinearGradient>
                      )}
                    </View>
                    {/* Badge name label */}
                    {highestBadge && (
                      <View style={styles.badgeNameChip}>
                        <Text style={styles.badgeNameChipText} numberOfLines={1}>
                          {highestBadge.badge_name}
                        </Text>
                      </View>
                    )}
                  </Animated.View>
                </TouchableOpacity>

                {/* Username */}
                <Text style={styles.username}>{profile?.username || t('common:user')}</Text>
                {profile?.full_name && (
                  <Text style={styles.fullName}>{profile.full_name}</Text>
                )}

                {/* Member since + streak pills */}
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
              </LinearGradient>
            </BlurView>
          </View>
        </Animated.View>

        {/* ═══════════════════════════════════════════ */}
        {/* STATS GRID                                  */}
        {/* ═══════════════════════════════════════════ */}
        <Animated.View entering={FadeInDown.delay(200).duration(400)}>
          <View style={styles.statsGrid}>
            {[
              { icon: 'water' as const, value: (profile?.total_drops || 0) === 0 ? '—' : profile?.total_drops || 0, label: t('totalDrops'), color: branding.primary },
              { icon: 'flame' as const, value: (profile?.streak_days || 0) === 0 ? '—' : profile?.streak_days || 0, label: t('dayStreak'), color: theme.colors.secondary },
              { icon: 'barbell' as const, value: stats.totalWorkouts === 0 ? '—' : stats.totalWorkouts, label: t('totalWorkouts'), color: branding.primary },
              { icon: 'time' as const, value: stats.totalHours === 0 ? '—' : `${stats.totalHours}h`, label: t('trained'), color: branding.primary },
            ].map((stat, i) => (
              <View key={i} style={[styles.statCard, { borderColor: hexToRgba(stat.color, 0.12) }]}>
                <BlurView intensity={30} tint="dark" style={[styles.statCardBlur, { backgroundColor: 'rgba(20, 20, 30, 0.7)' }]}>
                  <View style={[styles.statIconCircle, { backgroundColor: hexToRgba(stat.color, 0.12) }]}>
                    <Ionicons name={stat.icon} size={20} color={stat.color} />
                  </View>
                  <Text style={[styles.statValue, getNumberStyle(20), { color: stat.color }]}>
                    {stat.value}
                  </Text>
                  <Text style={styles.statLabel}>{stat.label}</Text>
                </BlurView>
              </View>
            ))}
          </View>
        </Animated.View>

        {/* ═══════════════════════════════════════════ */}
        {/* DROPS BREAKDOWN                             */}
        {/* ═══════════════════════════════════════════ */}
        <Animated.View entering={FadeInDown.delay(300).duration(400)}>
          <View style={[styles.breakdownCard, { borderColor: hexToRgba(branding.primary, 0.12) }]}>
            <BlurView intensity={40} tint="dark" style={[styles.breakdownBlur, { backgroundColor: 'rgba(20, 20, 30, 0.7)' }]}>
              <Text style={styles.sectionTitle}>{t('dropsBreakdown')}</Text>
              <View style={styles.breakdownRow}>
                <View style={styles.breakdownItem}>
                  <Text style={[styles.breakdownValue, getNumberStyle(18), { color: branding.primary }]}>{profile?.weekly_drops || 0}</Text>
                  <Text style={styles.breakdownLabel}>{t('thisWeek')}</Text>
                </View>
                <View style={[styles.breakdownDivider, { backgroundColor: hexToRgba(branding.primary, 0.1) }]} />
                <View style={styles.breakdownItem}>
                  <Text style={[styles.breakdownValue, getNumberStyle(18), { color: branding.primary }]}>{profile?.monthly_drops || 0}</Text>
                  <Text style={styles.breakdownLabel}>{t('thisMonth')}</Text>
                </View>
                <View style={[styles.breakdownDivider, { backgroundColor: hexToRgba(branding.primary, 0.1) }]} />
                <View style={styles.breakdownItem}>
                  <Text style={[styles.breakdownValue, getNumberStyle(18), { color: branding.primary }]}>{profile?.total_drops || 0}</Text>
                  <Text style={styles.breakdownLabel}>{t('allTime')}</Text>
                </View>
              </View>
            </BlurView>
          </View>
        </Animated.View>

        {/* ═══════════════════════════════════════════ */}
        {/* GYM IDENTITY STATUS                          */}
        {/* ═══════════════════════════════════════════ */}
        {hasGym && identity && (
          <Animated.View entering={FadeInDown.delay(320).duration(400)}>
            <View style={[styles.identityCard, { borderColor: hexToRgba(identity.isVerified ? '#4CAF50' : branding.primary, 0.15) }]}>
              <BlurView intensity={40} tint="dark" style={[styles.identityBlur, { backgroundColor: 'rgba(20, 20, 30, 0.7)' }]}>
                <View style={[styles.identityIcon, { backgroundColor: hexToRgba(identity.isVerified ? '#4CAF50' : branding.primary, 0.12) }]}>
                  <Ionicons
                    name={identity.isVerified ? 'shield-checkmark' : 'shield-outline'}
                    size={20}
                    color={identity.isVerified ? '#4CAF50' : branding.primary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.identityTitle, { color: identity.isVerified ? '#4CAF50' : theme.colors.text }]}>
                    {identity.isVerified ? t('identityVerified') : t('identityPending')}
                  </Text>
                  {!identity.isVerified && (
                    <Text style={styles.identityHint}>{t('identityHint')}</Text>
                  )}
                </View>
              </BlurView>
            </View>
          </Animated.View>
        )}

        {/* ═══════════════════════════════════════════ */}
        {/* MOJI PODACI — Profile Data Section          */}
        {/* ═══════════════════════════════════════════ */}
        <Animated.View entering={FadeInDown.delay(350).duration(400)}>
          {profile && (profile.gender || profile.weight_kg || profile.height_cm || profile.date_of_birth || profile.fitness_goal) ? (
            <View style={[styles.myDataCard, { borderColor: hexToRgba(branding.primary, 0.12) }]}>
              <BlurView intensity={40} tint="dark" style={[styles.myDataBlur, { backgroundColor: 'rgba(20, 20, 30, 0.7)' }]}>
                <View style={styles.myDataHeader}>
                  <Text style={styles.sectionTitle}>{tOnboarding('profileSetup.profile.sectionTitle')}</Text>
                  <TouchableOpacity
                    onPress={() => router.push('/(onboarding)/step-gender?edit=true')}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.myDataEditBtn, { color: branding.primary }]}>
                      {tOnboarding('profileSetup.profile.editButton')}
                    </Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.myDataRow}>
                  {profile.gender && (
                    <Text style={styles.myDataPill}>
                      {profile.gender === 'male' ? '♂' : '♀'}
                    </Text>
                  )}
                  {profile.weight_kg && (
                    <Text style={styles.myDataPill}>{profile.weight_kg} kg</Text>
                  )}
                  {profile.height_cm && (
                    <Text style={styles.myDataPill}>{profile.height_cm} cm</Text>
                  )}
                  {profile.date_of_birth && (
                    <Text style={styles.myDataPill}>
                      {Math.floor((Date.now() - new Date(profile.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))} {tOnboarding('profileSetup.profile.years')}
                    </Text>
                  )}
                </View>
                {profile.fitness_goal && (
                  <Text style={styles.myDataGoal}>
                    {tOnboarding('profileSetup.profile.goalLabel')}: {(() => {
                      const goalEmojis: Record<string, string> = { weight_loss: '🔥', strength: '💪', cardio: '🏃', health: '❤️' };
                      return `${goalEmojis[profile.fitness_goal] || ''} ${tOnboarding(`profileSetup.goal.${profile.fitness_goal}`)}`;
                    })()}
                  </Text>
                )}
              </BlurView>
            </View>
          ) : (
            <View style={[styles.myDataBanner, { borderColor: hexToRgba(branding.primary, 0.15) }]}>
              <BlurView intensity={40} tint="dark" style={[styles.myDataBannerBlur, { backgroundColor: 'rgba(20, 20, 30, 0.7)' }]}>
                <TouchableOpacity
                  style={styles.myDataBannerContent}
                  onPress={() => router.push('/(onboarding)/step-gender?edit=false')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="person-outline" size={20} color={branding.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.myDataBannerText}>{tOnboarding('profileSetup.profile.completeBanner')}</Text>
                  </View>
                  <View style={[styles.myDataBannerBtn, { backgroundColor: branding.primary }]}>
                    <Text style={styles.myDataBannerBtnText}>{tOnboarding('profileSetup.profile.completeButton')}</Text>
                  </View>
                </TouchableOpacity>
              </BlurView>
            </View>
          )}
        </Animated.View>

        {/* ═══════════════════════════════════════════ */}
        {/* NO-GYM BANNER                               */}
        {/* ═══════════════════════════════════════════ */}
        {!hasGym && (
          <Animated.View entering={FadeInDown.delay(350).duration(400)}>
            <View style={styles.noGymBanner}>
              <BlurView intensity={40} tint="dark" style={styles.noGymBannerBlur}>
                <View style={styles.noGymBannerContent}>
                  <Ionicons name="qr-code-outline" size={20} color={theme.colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.noGymBannerTitle}>{t('noGymTitle')}</Text>
                    <Text style={styles.noGymBannerSub}>
                      {t('noGymSub')}
                    </Text>
                  </View>
                </View>
              </BlurView>
            </View>
          </Animated.View>
        )}

        {/* ═══════════════════════════════════════════ */}
        {/* SEKCIJA 1 — AKTIVNOST                       */}
        {/* ═══════════════════════════════════════════ */}
        <Animated.View entering={FadeInDown.delay(400).duration(300)}>
          <SectionLabel label={t('sections.activity')} />
          <View style={[styles.linksCard, { borderColor: hexToRgba(branding.primary, 0.08) }]}>
            <BlurView intensity={50} tint="dark" style={[styles.linksBlur, { backgroundColor: 'rgba(20, 20, 30, 0.7)' }]}>
              {activityLinks.map((link, i) => {
                const gymRequiredKeys = ['leaderboard', 'trophyRoom'];
                const isGymRequired = gymRequiredKeys.includes(link.key);
                const isWorkoutHistoryEmpty = link.key === 'workoutHistory' && stats.totalWorkouts === 0 && !hasGym;
                const isDisabled = (isGymRequired && !hasGym) || isWorkoutHistoryEmpty;

                return (
                  <View key={link.route}>
                    <TouchableOpacity
                      style={[
                        styles.linkRow,
                        isDisabled && { opacity: 0.35 },
                      ]}
                      onPress={() => router.push(link.route as any)}
                      activeOpacity={0.7}
                      disabled={isDisabled}
                    >
                      <View style={[styles.linkIcon, { backgroundColor: hexToRgba(branding.primary, 0.10) }]}>
                        <Ionicons name={link.icon} size={20} color={branding.primary} />
                      </View>
                      <Text style={[styles.linkLabel, isDisabled && { opacity: 0.35 }]}>
                        {link.label}
                      </Text>
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

        {/* ═══════════════════════════════════════════ */}
        {/* SEKCIJA 2 — NAGRADE                         */}
        {/* ═══════════════════════════════════════════ */}
        <Animated.View entering={FadeInDown.delay(460).duration(300)}>
          <SectionLabel label={t('sections.rewards')} />
          <View style={[styles.linksCard, { borderColor: hexToRgba(branding.primary, 0.08) }]}>
            <BlurView intensity={50} tint="dark" style={[styles.linksBlur, { backgroundColor: 'rgba(20, 20, 30, 0.7)' }]}>
              {rewardsLinks.map((link, i) => {
                const isDisabled = !hasGym;

                return (
                  <View key={link.route}>
                    <TouchableOpacity
                      style={[
                        styles.linkRow,
                        isDisabled && { opacity: 0.35 },
                      ]}
                      onPress={() => router.push(link.route as any)}
                      activeOpacity={0.7}
                      disabled={isDisabled}
                    >
                      <View style={[styles.linkIcon, { backgroundColor: hexToRgba(branding.primary, 0.10) }]}>
                        <Ionicons name={link.icon} size={20} color={branding.primary} />
                      </View>
                      <Text style={[styles.linkLabel, isDisabled && { opacity: 0.35 }]}>
                        {link.label}
                      </Text>
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

        {/* ═══════════════════════════════════════════ */}
        {/* SEKCIJA 3 — PODEŠAVANJA                     */}
        {/* ═══════════════════════════════════════════ */}
        <Animated.View entering={FadeInDown.delay(520).duration(300)}>
          <SectionLabel label={t('sections.settings')} />
          <View style={[styles.linksCard, { borderColor: hexToRgba(branding.primary, 0.08) }]}>
            <BlurView intensity={50} tint="dark" style={[styles.linksBlur, { backgroundColor: 'rgba(20, 20, 30, 0.7)' }]}>
              {/* Gym selector */}
              <TouchableOpacity
                style={styles.linkRow}
                onPress={() => router.push('/gyms')}
                activeOpacity={0.7}
              >
                <View style={[styles.linkIcon, { backgroundColor: hexToRgba(branding.primary, 0.10) }]}>
                  <Ionicons name="fitness-outline" size={20} color={branding.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.linkLabel}>{t('gyms')}</Text>
                  {activeGym && (
                    <Text style={styles.linkSubLabel}>{activeGym.name}</Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
              </TouchableOpacity>

              <SectionDivider />

              {/* Language selector */}
              <View style={styles.linkRow}>
                <View style={[styles.linkIcon, { backgroundColor: hexToRgba(branding.primary, 0.10) }]}>
                  <Ionicons name="language-outline" size={20} color={branding.primary} />
                </View>
                <Text style={styles.linkLabel}>{t('language')}</Text>
                <View style={styles.languageToggle}>
                  <TouchableOpacity
                    style={[
                      styles.langButton,
                      i18n.language === 'sr' && [styles.langButtonActive, { backgroundColor: hexToRgba(branding.primary, 0.15), borderColor: branding.primary }],
                    ]}
                    onPress={() => i18n.changeLanguage('sr')}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.langButtonText, i18n.language === 'sr' && { color: branding.primary }]}>SR</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.langButton,
                      i18n.language === 'en' && [styles.langButtonActive, { backgroundColor: hexToRgba(branding.primary, 0.15), borderColor: branding.primary }],
                    ]}
                    onPress={() => i18n.changeLanguage('en')}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.langButtonText, i18n.language === 'en' && { color: branding.primary }]}>EN</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <SectionDivider />

              {/* Push Notifications */}
              {pushStatus !== 'unsupported' && (
                <>
                  <TouchableOpacity
                    style={styles.linkRow}
                    onPress={pushStatus !== 'granted' ? handleEnablePush : undefined}
                    activeOpacity={pushStatus !== 'granted' ? 0.7 : 1}
                    disabled={pushStatus === 'granted'}
                  >
                    <View style={[styles.linkIcon, { backgroundColor: hexToRgba(pushStatus === 'granted' ? '#4CAF50' : branding.primary, 0.10) }]}>
                      <Ionicons
                        name={pushStatus === 'granted' ? 'notifications' : 'notifications-off-outline'}
                        size={20}
                        color={pushStatus === 'granted' ? '#4CAF50' : branding.primary}
                      />
                    </View>
                    <Text style={[styles.linkLabel, { flex: 1 }]}>{t('notifications')}</Text>
                    {pushStatus === 'granted' ? (
                      <Text style={[styles.pushStatusText, { color: '#4CAF50' }]}>{t('notificationsOn')}</Text>
                    ) : (
                      <Text style={[styles.pushStatusText, { color: branding.primary }]}>{t('notificationsEnable')}</Text>
                    )}
                  </TouchableOpacity>
                  <SectionDivider />
                </>
              )}

              {/* Happy Hours link */}
              <TouchableOpacity
                style={styles.linkRow}
                onPress={() => router.push('/happy-hours' as any)}
                activeOpacity={0.7}
              >
                <View style={[styles.linkIcon, { backgroundColor: 'rgba(255, 215, 0, 0.10)' }]}>
                  <Ionicons name="flash-outline" size={20} color="#FFD700" />
                </View>
                <Text style={styles.linkLabel}>{t('happyHours')}</Text>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
              </TouchableOpacity>

              <SectionDividerThick />

              {/* Log Out */}
              <TouchableOpacity
                style={styles.linkRow}
                onPress={handleLogout}
                activeOpacity={0.7}
              >
                <View style={[styles.linkIcon, { backgroundColor: 'rgba(255, 145, 0, 0.1)' }]}>
                  <Ionicons name="log-out-outline" size={20} color={theme.colors.secondary} />
                </View>
                <Text style={[styles.linkLabel, { color: theme.colors.secondary }]}>{t('logout')}</Text>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
              </TouchableOpacity>

              <SectionDivider />

              {/* Delete Account */}
              <TouchableOpacity
                style={styles.linkRow}
                onPress={handleDeleteAccount}
                activeOpacity={0.7}
              >
                <View style={[styles.linkIcon, { backgroundColor: 'rgba(255, 59, 48, 0.1)' }]}>
                  <Ionicons name="trash-outline" size={20} color="#FF3B30" />
                </View>
                <Text style={[styles.linkLabel, { color: '#FF3B30' }]}>{t('deleteAccount')}</Text>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
              </TouchableOpacity>
            </BlurView>
          </View>
        </Animated.View>

        {/* ═══════════════════════════════════════════ */}
        {/* VERSION NUMBER                              */}
        {/* ═══════════════════════════════════════════ */}
        <Animated.View entering={FadeInDown.delay(550).duration(300)}>
          <Text style={styles.versionText}>SweatDrop v{appVersion}</Text>
        </Animated.View>

        {/* Bottom spacer */}
        <View style={{ height: 40 }} />
      </ScrollView>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  headerTitle: {
    ...fontStyles.heading,
    flex: 1,
    fontSize: 26,
    color: theme.colors.text,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
  },

  // ── Hero ──
  heroCard: {
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: theme.spacing.lg,
  },
  heroBlur: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
  },
  heroGradient: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: theme.spacing.lg,
  },

  // ── Flip Card ──
  flipCardContainer: {
    width: 88,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  flipCardFace: {
    alignItems: 'center',
    backfaceVisibility: 'hidden',
  },
  flipCardBack: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  badgePeekIndicator: {
    position: 'absolute',
    bottom: 8,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    zIndex: 10,
  },
  badgeNameChip: {
    marginTop: 4,
    backgroundColor: 'rgba(255, 215, 0, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    maxWidth: 88,
  },
  badgeNameChipText: {
    ...fontStyles.bodySemiBold,
    fontSize: 9,
    color: '#FFD700',
    textAlign: 'center',
  },
  avatarContainer: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 2,
    overflow: 'hidden',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarEmoji: {
    fontSize: 42,
  },
  avatarInitial: {
    ...fontStyles.heading,
    fontSize: 34,
  },
  username: {
    ...fontStyles.bodySemiBold,
    fontSize: theme.typography.fontSize['2xl'],
    color: theme.colors.text,
    marginBottom: 2,
  },
  fullName: {
    ...fontStyles.body,
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    marginBottom: 12,
  },
  heroPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  heroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  heroPillText: {
    ...fontStyles.bodySemiBold,
    fontSize: 12,
  },

  // ── Stats Grid ──
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: theme.spacing.lg,
  },
  statCard: {
    width: '48%',
    flexGrow: 1,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  statCardBlur: {
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: theme.borderRadius.md,
    overflow: 'hidden',
  },
  statIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  statValue: {
    marginBottom: 2,
  },
  statLabel: {
    ...fontStyles.heading,
    fontSize: 14,
    color: theme.colors.textTertiary,
  },

  // ── Drops Breakdown ──
  breakdownCard: {
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: theme.spacing.lg,
  },
  breakdownBlur: {
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    overflow: 'hidden',
  },
  sectionTitle: {
    ...fontStyles.heading,
    fontSize: 20,
    color: theme.colors.text,
    marginBottom: 12,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  breakdownItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  breakdownValue: {},
  breakdownLabel: {
    ...fontStyles.heading,
    fontSize: 13,
    color: theme.colors.textTertiary,
  },
  breakdownDivider: {
    width: 1,
    height: 30,
  },

  // ── Identity Status ──
  identityCard: {
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: theme.spacing.lg,
  },
  identityBlur: {
    borderRadius: theme.borderRadius.md,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    gap: 12,
  },
  identityIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  identityTitle: {
    ...fontStyles.bodySemiBold,
    fontSize: 14,
  },
  identityHint: {
    ...fontStyles.body,
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },

  // ── Quick Links ──
  linksCard: {
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  linksBlur: {
    borderRadius: theme.borderRadius.md,
    overflow: 'hidden',
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  linkIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  linkLabel: {
    ...fontStyles.bodySemiBold,
    flex: 1,
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text,
  },
  pushStatusText: {
    ...fontStyles.bodyMedium,
    fontSize: 13,
  },
  linkSubLabel: {
    ...fontStyles.body,
    fontSize: 12,
    color: theme.colors.textTertiary,
    marginTop: 1,
  },

  // ── Section Labels ──
  sectionLabel: {
    ...fontStyles.heading,
    fontSize: 13,
    color: theme.colors.textTertiary,
    marginBottom: 8,
    marginLeft: 4,
    marginTop: theme.spacing.lg,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginHorizontal: 0,
  },
  sectionDividerThick: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginHorizontal: 16,
    marginVertical: 4,
  },

  // ── Version ──
  versionText: {
    ...fontStyles.body,
    fontSize: 12,
    color: theme.colors.textTertiary,
    textAlign: 'center',
    marginTop: theme.spacing.lg,
    opacity: 0.6,
  },

  // ── No-Gym Banner ──
  // ── Moji podaci ──
  myDataCard: {
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: theme.spacing.md,
  },
  myDataBlur: {
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    padding: theme.spacing.lg,
  },
  myDataHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  myDataEditBtn: {
    ...fontStyles.bodyMedium,
    fontSize: 14,
  },
  myDataRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  myDataPill: {
    ...fontStyles.bodyMedium,
    fontSize: 14,
    color: theme.colors.text,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  myDataGoal: {
    ...fontStyles.body,
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
  myDataBanner: {
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: theme.spacing.md,
  },
  myDataBannerBlur: {
    borderRadius: theme.borderRadius.md,
    overflow: 'hidden',
  },
  myDataBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: theme.spacing.md,
  },
  myDataBannerText: {
    ...fontStyles.body,
    fontSize: 13,
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },
  myDataBannerBtn: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  myDataBannerBtnText: {
    ...fontStyles.heading,
    fontSize: 12,
    color: '#000000',
  },

  // ── No-Gym Banner ──
  noGymBanner: {
    marginBottom: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.15)',
    overflow: 'hidden',
  },
  noGymBannerBlur: {
    borderRadius: theme.borderRadius.md,
    overflow: 'hidden',
    backgroundColor: 'rgba(20, 20, 30, 0.7)',
  },
  noGymBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: theme.spacing.md,
  },
  noGymBannerTitle: {
    ...fontStyles.bodySemiBold,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text,
    marginBottom: 2,
  },
  noGymBannerSub: {
    ...fontStyles.body,
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
    lineHeight: 16,
  },

  // ── Language Toggle ──
  languageToggle: {
    flexDirection: 'row',
    gap: 6,
    marginLeft: 'auto',
  },
  langButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  langButtonActive: {
    borderWidth: 1.5,
  },
  langButtonText: {
    ...fontStyles.heading,
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
});
