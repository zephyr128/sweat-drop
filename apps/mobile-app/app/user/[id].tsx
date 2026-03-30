import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { useUserBadges, type UserBadge } from '@/hooks/useUserBadges';
import { useBranding } from '@/lib/contexts/ThemeContext';
import { theme, getNumberStyle, fontStyles, hexToRgba} from '@/lib/theme';
import BackButton from '@/components/BackButton';

interface PublicProfile {
  id: string;
  username: string;
  avatar_url: string | null;
  total_drops: number;
  streak_days: number;
  created_at: string;
  is_newcomer: boolean;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Avg', 'Sep', 'Okt', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation('memberProfile');
  const { session } = useSession();
  const branding = useBranding();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { badges, loading: badgesLoading } = useUserBadges(id);
  const isOwnProfile = session?.user?.id === id;

  const loadProfile = useCallback(async () => {
    if (!id) return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, avatar_url, total_drops, streak_days, created_at, is_newcomer')
        .eq('id', id)
        .single();

      if (!error && data) {
        setProfile(data);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadProfile();
  }, [loadProfile]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <BackButton />
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={branding.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <BackButton />
        </View>
        <View style={styles.center}>
          <Ionicons name="person-outline" size={64} color={theme.colors.textSecondary} />
          <Text style={styles.emptyText}>{t('userNotFound')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const renderAvatar = () => {
    if (profile.avatar_url && profile.avatar_url.startsWith('http')) {
      return <Image source={profile.avatar_url} style={styles.avatarImage} transition={200} />;
    }
    if (profile.avatar_url) {
      return <Text style={styles.avatarEmoji}>{profile.avatar_url}</Text>;
    }
    return (
      <Text style={styles.avatarInitial}>
        {(profile.username || 'U').charAt(0).toUpperCase()}
      </Text>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <BackButton />
        <Text style={styles.headerTitle}>{t('title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={branding.primary} />}
      >
        {/* Hero section */}
        <Animated.View entering={FadeInDown.duration(400)}>
          <View style={[styles.heroCard, { borderColor: hexToRgba(branding.primary, 0.2) }]}>
            <BlurView intensity={50} tint="dark" style={[styles.heroBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
              <LinearGradient
                colors={[hexToRgba(branding.primary, 0.08), 'transparent']}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={styles.heroGradient}
              >
                <View style={[styles.avatarContainer, { borderColor: hexToRgba(branding.primary, 0.4) }]}>
                  {renderAvatar()}
                </View>

                <Text style={styles.username}>{profile.username}</Text>

                {profile.is_newcomer && (
                  <View style={[styles.newcomerBadge, { backgroundColor: hexToRgba(branding.primary, 0.15) }]}>
                    <Ionicons name="sparkles" size={12} color={branding.primary} />
                    <Text style={[styles.newcomerText, { color: branding.primary }]}>{t('newcomer')}</Text>
                  </View>
                )}

                <Text style={styles.memberSince}>
                  {t('memberSince', { date: formatDate(profile.created_at) })}
                </Text>
              </LinearGradient>
            </BlurView>
          </View>
        </Animated.View>

        {/* Stats row */}
        <Animated.View entering={FadeInDown.delay(100).duration(400)}>
          <View style={styles.statsRow}>
            <View style={[styles.statCard, { borderColor: hexToRgba(branding.primary, 0.15) }]}>
              <BlurView intensity={40} tint="dark" style={[styles.statBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
                <Ionicons name="water" size={20} color={branding.primary} />
                <Text style={[styles.statValue, getNumberStyle(20), { color: branding.primary }]}>
                  {profile.total_drops.toLocaleString()}
                </Text>
                <Text style={styles.statLabel}>{t('totalDrops')}</Text>
              </BlurView>
            </View>

            <View style={[styles.statCard, { borderColor: hexToRgba(branding.primary, 0.15) }]}>
              <BlurView intensity={40} tint="dark" style={[styles.statBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
                <Ionicons name="flame" size={20} color="#FF6B35" />
                <Text style={[styles.statValue, getNumberStyle(20)]}>
                  {profile.streak_days}
                </Text>
                <Text style={styles.statLabel}>{t('streak')}</Text>
              </BlurView>
            </View>

            <View style={[styles.statCard, { borderColor: hexToRgba(branding.primary, 0.15) }]}>
              <BlurView intensity={40} tint="dark" style={[styles.statBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
                <Ionicons name="ribbon" size={20} color="#FFD700" />
                <Text style={[styles.statValue, getNumberStyle(20)]}>
                  {badges.length}
                </Text>
                <Text style={styles.statLabel}>{t('badges')}</Text>
              </BlurView>
            </View>
          </View>
        </Animated.View>

        {/* Badges section */}
        <Animated.View entering={FadeInDown.delay(200).duration(400)}>
          <View style={[styles.badgesSection, { borderColor: hexToRgba(branding.primary, 0.15) }]}>
            <BlurView intensity={50} tint="dark" style={[styles.badgesSectionBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
              <View style={styles.badgesSectionHeader}>
                <Ionicons name="trophy" size={18} color={branding.primary} />
                <Text style={[styles.badgesSectionTitle, { color: branding.primary }]}>
                  {t('earnedBadges')}
                </Text>
                <Text style={styles.badgesCount}>
                  {badges.length}
                </Text>
              </View>

              {badgesLoading ? (
                <ActivityIndicator size="small" color={branding.primary} style={{ padding: 20 }} />
              ) : badges.length === 0 ? (
                <View style={styles.noBadges}>
                  <Ionicons name="trophy-outline" size={32} color={theme.colors.textTertiary} />
                  <Text style={styles.noBadgesText}>{t('noBadgesYet')}</Text>
                </View>
              ) : (
                <View style={styles.badgesGrid}>
                  {badges.map((badge: UserBadge) => (
                    <View key={badge.badge_id} style={styles.badgeItem}>
                      {badge.badge_image_url ? (
                        <Image source={badge.badge_image_url} style={styles.badgeImage} transition={200} />
                      ) : (
                        <View style={[styles.badgePlaceholder, { backgroundColor: hexToRgba(branding.primary, 0.1) }]}>
                          <Ionicons name="ribbon" size={20} color={branding.primary} />
                        </View>
                      )}
                      <Text style={styles.badgeName} numberOfLines={2}>
                        {badge.badge_name}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </BlurView>
          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  headerTitle: {
    ...fontStyles.heading,
    fontSize: 20,
    color: theme.colors.text,
    flex: 1,
    textAlign: 'center',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    ...fontStyles.body,
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },

  // Hero
  heroCard: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  heroBlur: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  heroGradient: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 20,
    gap: 8,
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: 4,
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarEmoji: {
    fontSize: 40,
  },
  avatarInitial: {
    ...fontStyles.heading,
    fontSize: 32,
    color: theme.colors.textSecondary,
  },
  username: {
    ...fontStyles.heading,
    fontSize: 24,
    color: theme.colors.text,
    letterSpacing: 0.5,
  },
  newcomerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  newcomerText: {
    ...fontStyles.bodySemiBold,
    fontSize: 12,
  },
  memberSince: {
    ...fontStyles.body,
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  statBlur: {
    borderRadius: 16,
    overflow: 'hidden',
    padding: 14,
    alignItems: 'center',
    gap: 6,
  },
  statValue: {
    fontSize: 20,
    color: theme.colors.text,
  },
  statLabel: {
    ...fontStyles.body,
    fontSize: 11,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },

  // Badges section
  badgesSection: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  badgesSectionBlur: {
    borderRadius: 20,
    overflow: 'hidden',
    padding: 16,
  },
  badgesSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  badgesSectionTitle: {
    ...fontStyles.heading,
    fontSize: 16,
    flex: 1,
  },
  badgesCount: {
    ...fontStyles.bodySemiBold,
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  noBadges: {
    alignItems: 'center',
    padding: 24,
    gap: 8,
  },
  noBadgesText: {
    ...fontStyles.body,
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  badgesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  badgeItem: {
    width: '22%' as any,
    alignItems: 'center',
    gap: 4,
  },
  badgeImage: {
    width: 48,
    height: 48,
    borderRadius: 12,
  },
  badgePlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeName: {
    ...fontStyles.body,
    fontSize: 10,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 13,
  },
});
