import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { useUserBadges, type UserBadge } from '@/hooks/useUserBadges';
import { theme, getNumberStyle } from '@/lib/theme';
import BackButton from '@/components/BackButton';
import { useBranding } from '@/lib/contexts/ThemeContext';
import Animated, { FadeInDown, FadeIn, SlideInRight } from 'react-native-reanimated';

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
}

interface ProfileStats {
  totalWorkouts: number;
  totalHours: number;
  totalDropsEarned: number;
  longestStreak: number;
}

function formatMemberSince(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export default function ProfileScreen() {
  const router = useRouter();
  const { session } = useSession();
  const branding = useBranding();
  const { badges, loading: badgesLoading } = useUserBadges();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [stats, setStats] = useState<ProfileStats>({ totalWorkouts: 0, totalHours: 0, totalDropsEarned: 0, longestStreak: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!session?.user) return;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url, total_drops, available_drops, weekly_drops, monthly_drops, streak_days, is_newcomer, created_at')
        .eq('id', session.user.id)
        .single();

      if (error) {
        console.error('[Profile] Error loading profile:', error);
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
      setRefreshing(false);
    }
  }, [session?.user?.id, profile?.streak_days]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (profile) {
      loadStats();
    }
  }, [profile, loadStats]);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadProfile();
  };

  // Recent badges (max 6)
  const recentBadges = badges.slice(0, 6);

  // Quick links
  const quickLinks = [
    { icon: 'time-outline' as const, label: 'Workout History', route: '/workout-history' },
    { icon: 'trophy-outline' as const, label: 'Trophy Room', route: '/trophy-room' },
    { icon: 'podium-outline' as const, label: 'Leaderboard', route: '/leaderboard' },
    { icon: 'wallet-outline' as const, label: 'Wallet', route: '/wallet' },
    { icon: 'storefront-outline' as const, label: 'Rewards Store', route: '/store' },
    { icon: 'flame-outline' as const, label: 'Challenges', route: '/challenges' },
  ];

  if (loading && !profile) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <LinearGradient
          colors={['#000000', '#0A0E1A', '#000000']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={branding.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient
        colors={['#000000', '#0A0E1A', '#000000']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Header */}
      <View style={styles.header}>
        <BackButton />
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={branding.primary} />
        }
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
                {/* Avatar */}
                <View style={[styles.avatarContainer, { borderColor: branding.primary }]}>
                  {profile?.avatar_url ? (
                    <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
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

                {/* Username */}
                <Text style={styles.username}>{profile?.username || 'User'}</Text>
                {profile?.full_name && (
                  <Text style={styles.fullName}>{profile.full_name}</Text>
                )}

                {/* Member since + streak pills */}
                <View style={styles.heroPills}>
                  <View style={[styles.heroPill, { backgroundColor: hexToRgba(branding.primary, 0.1) }]}>
                    <Ionicons name="calendar-outline" size={12} color={branding.primary} />
                    <Text style={[styles.heroPillText, { color: branding.primary }]}>
                      Member since {profile ? formatMemberSince(profile.created_at) : ''}
                    </Text>
                  </View>
                  {profile && profile.streak_days > 0 && (
                    <View style={[styles.heroPill, { backgroundColor: 'rgba(255, 145, 0, 0.12)' }]}>
                      <Text style={{ fontSize: 12 }}>🔥</Text>
                      <Text style={[styles.heroPillText, { color: theme.colors.secondary }]}>
                        {profile.streak_days} day streak
                      </Text>
                    </View>
                  )}
                  {profile?.is_newcomer && (
                    <View style={[styles.heroPill, { backgroundColor: 'rgba(76, 175, 80, 0.12)' }]}>
                      <Text style={{ fontSize: 12 }}>🌱</Text>
                      <Text style={[styles.heroPillText, { color: '#4CAF50' }]}>Newcomer</Text>
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
              { icon: 'water' as const, value: profile?.total_drops || 0, label: 'Total Drops', color: branding.primary },
              { icon: 'flame' as const, value: profile?.streak_days || 0, label: 'Day Streak', color: theme.colors.secondary },
              { icon: 'barbell' as const, value: stats.totalWorkouts, label: 'Workouts', color: branding.primary },
              { icon: 'time' as const, value: `${stats.totalHours}h`, label: 'Trained', color: branding.primary },
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
              <Text style={styles.sectionTitle}>Drops Breakdown</Text>
              <View style={styles.breakdownRow}>
                <View style={styles.breakdownItem}>
                  <Text style={[styles.breakdownValue, getNumberStyle(18), { color: branding.primary }]}>{profile?.weekly_drops || 0}</Text>
                  <Text style={styles.breakdownLabel}>This Week</Text>
                </View>
                <View style={[styles.breakdownDivider, { backgroundColor: hexToRgba(branding.primary, 0.1) }]} />
                <View style={styles.breakdownItem}>
                  <Text style={[styles.breakdownValue, getNumberStyle(18), { color: branding.primary }]}>{profile?.monthly_drops || 0}</Text>
                  <Text style={styles.breakdownLabel}>This Month</Text>
                </View>
                <View style={[styles.breakdownDivider, { backgroundColor: hexToRgba(branding.primary, 0.1) }]} />
                <View style={styles.breakdownItem}>
                  <Text style={[styles.breakdownValue, getNumberStyle(18), { color: branding.primary }]}>{profile?.total_drops || 0}</Text>
                  <Text style={styles.breakdownLabel}>All Time</Text>
                </View>
              </View>
            </BlurView>
          </View>
        </Animated.View>

        {/* ═══════════════════════════════════════════ */}
        {/* RECENT BADGES                               */}
        {/* ═══════════════════════════════════════════ */}
        {recentBadges.length > 0 && (
          <Animated.View entering={FadeInDown.delay(400).duration(400)}>
            <View style={styles.badgesSection}>
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>Recent Badges</Text>
                <TouchableOpacity onPress={() => router.push('/trophy-room')} activeOpacity={0.7}>
                  <Text style={[styles.seeAll, { color: branding.primary }]}>See All →</Text>
                </TouchableOpacity>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.badgesScroll}
              >
                {recentBadges.map((badge: UserBadge, i: number) => (
                  <Animated.View key={badge.badge_id} entering={SlideInRight.delay(450 + i * 80).duration(350)}>
                    <View style={[styles.badgeCard, { borderColor: hexToRgba(branding.primary, 0.15) }]}>
                      <BlurView intensity={30} tint="dark" style={[styles.badgeCardBlur, { backgroundColor: 'rgba(20, 20, 30, 0.7)' }]}>
                        {badge.badge_image_url ? (
                          <Image source={{ uri: badge.badge_image_url }} style={styles.badgeImage} />
                        ) : (
                          <View style={[styles.badgeIconFallback, { backgroundColor: hexToRgba(branding.primary, 0.15) }]}>
                            <Ionicons name="trophy" size={24} color={branding.primary} />
                          </View>
                        )}
                        <Text style={styles.badgeName} numberOfLines={2}>{badge.badge_name}</Text>
                      </BlurView>
                    </View>
                  </Animated.View>
                ))}
              </ScrollView>
            </View>
          </Animated.View>
        )}

        {/* ═══════════════════════════════════════════ */}
        {/* QUICK LINKS                                 */}
        {/* ═══════════════════════════════════════════ */}
        <Animated.View entering={FadeInDown.delay(500).duration(400)}>
          <View style={[styles.linksCard, { borderColor: hexToRgba(branding.primary, 0.12) }]}>
            <BlurView intensity={40} tint="dark" style={[styles.linksBlur, { backgroundColor: 'rgba(20, 20, 30, 0.7)' }]}>
              {quickLinks.map((link, i) => (
                <TouchableOpacity
                  key={link.route}
                  style={[
                    styles.linkRow,
                    i < quickLinks.length - 1 && { borderBottomColor: hexToRgba(branding.primary, 0.06), borderBottomWidth: 1 },
                  ]}
                  onPress={() => router.push(link.route as any)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.linkIcon, { backgroundColor: hexToRgba(branding.primary, 0.1) }]}>
                    <Ionicons name={link.icon} size={20} color={branding.primary} />
                  </View>
                  <Text style={styles.linkLabel}>{link.label}</Text>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
                </TouchableOpacity>
              ))}
            </BlurView>
          </View>
        </Animated.View>

        {/* Bottom spacer */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
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
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  headerTitle: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    position: 'absolute',
    left: 0,
    right: 0,
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
  avatarContainer: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 2,
    overflow: 'hidden',
    marginBottom: 12,
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
  avatarInitial: {
    fontSize: 32,
    fontWeight: '700',
  },
  username: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginBottom: 2,
  },
  fullName: {
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
    fontSize: 12,
    fontWeight: '600',
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
    fontSize: theme.typography.fontSize.xs,
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
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
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
    fontSize: 11,
    color: theme.colors.textTertiary,
  },
  breakdownDivider: {
    width: 1,
    height: 30,
  },

  // ── Recent Badges ──
  badgesSection: {
    marginBottom: theme.spacing.lg,
  },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  seeAll: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  badgesScroll: {
    gap: 10,
  },
  badgeCard: {
    width: 90,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  badgeCardBlur: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: theme.borderRadius.md,
    overflow: 'hidden',
  },
  badgeImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginBottom: 6,
  },
  badgeIconFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  badgeName: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.text,
    textAlign: 'center',
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
    flex: 1,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text,
  },
});
