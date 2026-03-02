import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, TextInput, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/hooks/useSession';
import { useUserBadges, UserBadge } from '@/hooks/useUserBadges';
import { useAllBadges, BadgeWithProgress } from '@/hooks/useAllBadges';
import { useUserProgress } from '@/hooks/useUserProgress';
import { useTheme, useBranding } from '@/lib/contexts/ThemeContext';
import { theme } from '@/lib/theme';
import BackButton from './BackButton';
import { BadgeCard } from './BadgeCard';
import { BadgeDetailModal } from './BadgeDetailModal';
import Animated, { FadeInDown } from 'react-native-reanimated';

function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(0, 229, 255, ${alpha})`;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BENTO_GAP = 12;
const BENTO_PADDING = 16;

interface TrophyRoomProps {
  userId?: string;
  onClose?: () => void;
}

export const TrophyRoom: React.FC<TrophyRoomProps> = ({ userId, onClose }) => {
  const { theme: currentTheme } = useTheme();
  const branding = useBranding();
  const { badges: earnedBadges, loading: badgesLoading } = useUserBadges(userId);
  const { globalAchievements, gymChallenges, loading: allBadgesLoading } = useAllBadges();
  const { progress: userProgress, isCompleted } = useUserProgress(userId);
  const [filterType, setFilterType] = useState<'all' | 'global' | 'gym'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBadge, setSelectedBadge] = useState<UserBadge | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const loading = badgesLoading || allBadgesLoading;

  const allBadgesWithProgress = useMemo((): BadgeWithProgress[] => {
    const badges: BadgeWithProgress[] = [];

    globalAchievements.forEach((achievement) => {
      const earnedBadge = earnedBadges.find(
        (b) => b.badge_type === 'global' && b.badge_name === achievement.name
      );
      const progress = userProgress.find((p) => p.global_achievement_id === achievement.id);

      let progressPercent = 0;
      if (progress) {
        progressPercent = progress.is_completed ? 100 : 50;
      }

      badges.push({
        id: achievement.id,
        name: achievement.name,
        description: achievement.description,
        badge_image_url: achievement.badge_image_url,
        badge_type: 'global',
        gym_name: null,
        is_earned: !!earnedBadge,
        earned_at: earnedBadge?.earned_at || null,
        progress: progressPercent,
        progress_data: progress?.progress_data,
      });
    });

    gymChallenges.forEach((challenge) => {
      const earnedBadge = earnedBadges.find(
        (b) => b.badge_type === 'gym' && b.badge_name === challenge.name
      );
      const progress = userProgress.find((p) => p.gym_challenge_id === challenge.id);

      let progressPercent = 0;
      if (progress) {
        progressPercent = progress.is_completed ? 100 : 50;
      }

      badges.push({
        id: challenge.id,
        name: challenge.name,
        description: challenge.description,
        badge_image_url: challenge.badge_image_url,
        badge_type: 'gym',
        gym_name: null,
        is_earned: !!earnedBadge,
        earned_at: earnedBadge?.earned_at || null,
        progress: progressPercent,
        progress_data: progress?.progress_data,
      });
    });

    return badges;
  }, [globalAchievements, gymChallenges, earnedBadges, userProgress]);

  const filteredBadges = useMemo(() => {
    let filtered = allBadgesWithProgress;

    if (filterType !== 'all') {
      filtered = filtered.filter((badge) => badge.badge_type === filterType);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((badge) =>
        badge.name.toLowerCase().includes(query) ||
        (badge.description && badge.description.toLowerCase().includes(query))
      );
    }

    return filtered;
  }, [allBadgesWithProgress, filterType, searchQuery]);

  const globalBadges = filteredBadges.filter((b) => b.badge_type === 'global');
  const gymBadges = filteredBadges.filter((b) => b.badge_type === 'gym');

  // Stats
  const totalEarned = earnedBadges.length;
  const totalAvailable = allBadgesWithProgress.length;

  const handleBadgePress = (badge: BadgeWithProgress) => {
    if (!badge.is_earned) return;

    const earnedBadge = earnedBadges.find(
      (b) => b.badge_name === badge.name && b.badge_type === badge.badge_type
    );

    if (earnedBadge) {
      setSelectedBadge(earnedBadge);
      setModalVisible(true);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <LinearGradient
          colors={['#000000', '#0A0E1A', '#000000']}
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
        style={StyleSheet.absoluteFillObject}
      />

      {/* Header */}
      <View style={styles.header}>
        {onClose ? (
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
        ) : (
          <BackButton />
        )}
        <Text style={styles.headerTitle}>Trophy Room</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Stats bar */}
      <Animated.View entering={FadeInDown.delay(100).duration(400)}>
        <View style={styles.statsBar}>
          <View style={[styles.statsPill, { borderColor: hexToRgba(branding.primary, 0.2) }]}>
            <BlurView intensity={50} tint="dark" style={[styles.statsPillBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
              <Ionicons name="trophy" size={16} color={branding.primary} />
              <Text style={[styles.statsPillText, { color: branding.primary }]}>
                {totalEarned} / {totalAvailable} earned
              </Text>
            </BlurView>
          </View>
        </View>
      </Animated.View>

      {/* Search & Filter */}
      <Animated.View entering={FadeInDown.delay(200).duration(400)}>
        <View style={styles.filterContainer}>
          <View style={[styles.searchContainer, { borderColor: hexToRgba(branding.primary, 0.12) }]}>
            <BlurView intensity={50} tint="dark" style={[styles.searchBlur, { backgroundColor: 'rgba(20, 20, 30, 0.75)' }]}>
              <Ionicons name="search" size={18} color={theme.colors.textSecondary} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search badges..."
                placeholderTextColor={theme.colors.textSecondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
                  <Ionicons name="close-circle" size={18} color={theme.colors.textSecondary} />
                </TouchableOpacity>
              )}
            </BlurView>
          </View>

          <View style={styles.filterButtons}>
            {(['all', 'global', 'gym'] as const).map((type) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.filterButton,
                  filterType === type && { backgroundColor: branding.primary },
                ]}
                onPress={() => setFilterType(type)}
              >
                <Text
                  style={[
                    styles.filterButtonText,
                    filterType === type && { color: branding.onPrimary, fontWeight: theme.typography.fontWeight.semibold },
                  ]}
                >
                  {type === 'all' ? 'All' : type === 'global' ? 'Global' : 'Gym'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Animated.View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {filteredBadges.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="trophy-outline" size={64} color={theme.colors.textSecondary} />
            <Text style={styles.emptyTitle}>No badges found</Text>
            <Text style={styles.emptyText}>
              {searchQuery ? 'Try adjusting your search' : 'Complete challenges to earn badges!'}
            </Text>
          </View>
        ) : (
          <>
            {/* Global Achievements */}
            {globalBadges.length > 0 && (
              <Animated.View entering={FadeInDown.delay(300).duration(400)}>
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Ionicons name="globe" size={20} color={branding.primary} />
                    <Text style={[styles.sectionTitle, { color: branding.primary }]}>
                      Global Achievements
                    </Text>
                    <Text style={styles.sectionCount}>{globalBadges.length}</Text>
                  </View>
                  <View style={styles.bentoGrid}>
                    {globalBadges.map((badge) => {
                      const earnedBadge = earnedBadges.find(
                        (b) => b.badge_name === badge.name && b.badge_type === 'global'
                      );
                      return (
                        <BadgeCard
                          key={`global-${badge.id}`}
                          badge={earnedBadge || {
                            badge_id: badge.id,
                            badge_name: badge.name,
                            badge_description: badge.description,
                            badge_image_url: badge.badge_image_url,
                            earned_at: badge.earned_at || '',
                            badge_type: 'global',
                            gym_name: null,
                          }}
                          isLocked={!badge.is_earned}
                          progress={badge.progress}
                          onPress={() => handleBadgePress(badge)}
                          size="medium"
                        />
                      );
                    })}
                  </View>
                </View>
              </Animated.View>
            )}

            {/* Club Challenges */}
            {gymBadges.length > 0 && (
              <Animated.View entering={FadeInDown.delay(400).duration(400)}>
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Ionicons name="business" size={20} color={branding.primary} />
                    <Text style={[styles.sectionTitle, { color: branding.primary }]}>
                      Club Challenges
                    </Text>
                    <Text style={styles.sectionCount}>{gymBadges.length}</Text>
                  </View>
                  <View style={styles.bentoGrid}>
                    {gymBadges.map((badge) => {
                      const earnedBadge = earnedBadges.find(
                        (b) => b.badge_name === badge.name && b.badge_type === 'gym'
                      );
                      return (
                        <BadgeCard
                          key={`gym-${badge.id}`}
                          badge={earnedBadge || {
                            badge_id: badge.id,
                            badge_name: badge.name,
                            badge_description: badge.description,
                            badge_image_url: badge.badge_image_url,
                            earned_at: badge.earned_at || '',
                            badge_type: 'gym',
                            gym_name: badge.gym_name,
                          }}
                          isLocked={!badge.is_earned}
                          progress={badge.progress}
                          onPress={() => handleBadgePress(badge)}
                          size="medium"
                        />
                      );
                    })}
                  </View>
                </View>
              </Animated.View>
            )}
          </>
        )}
      </ScrollView>

      {/* Badge Detail Modal */}
      <BadgeDetailModal
        visible={modalVisible}
        badge={selectedBadge}
        onClose={() => {
          setModalVisible(false);
          setSelectedBadge(null);
        }}
      />
    </SafeAreaView>
  );
};

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
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    letterSpacing: 0.5,
    pointerEvents: 'none',
  },
  headerSpacer: {
    width: 40,
  },
  /* Stats bar */
  statsBar: {
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    alignItems: 'center',
  },
  statsPill: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
  },
  statsPillBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
  },
  statsPillText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    letterSpacing: 0.3,
  },
  /* Search & Filter */
  filterContainer: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
    gap: theme.spacing.md,
  },
  searchContainer: {
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
  },
  searchBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm + 2,
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
  },
  searchInput: {
    flex: 1,
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text,
  },
  clearButton: {
    padding: theme.spacing.xs,
  },
  filterButtons: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  filterButton: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  filterButtonText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
  },
  /* Content */
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: BENTO_PADDING,
    paddingBottom: theme.spacing['3xl'],
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: theme.spacing['3xl'],
    gap: theme.spacing.md,
  },
  emptyTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    letterSpacing: 0.3,
  },
  emptyText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  section: {
    marginBottom: theme.spacing['2xl'],
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    letterSpacing: 0.3,
    flex: 1,
  },
  sectionCount: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  bentoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: BENTO_GAP,
    justifyContent: 'space-between',
  },
});
