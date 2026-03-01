import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, TextInput, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
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

  // Combine all badges with progress data
  const allBadgesWithProgress = useMemo((): BadgeWithProgress[] => {
    const badges: BadgeWithProgress[] = [];

    // Add global achievements
    globalAchievements.forEach((achievement) => {
      const earnedBadge = earnedBadges.find(
        (b) => b.badge_type === 'global' && b.badge_name === achievement.name
      );
      const progress = userProgress.find((p) => p.global_achievement_id === achievement.id);
      
      // Calculate progress percentage (simplified - would need to evaluate criteria)
      let progressPercent = 0;
      if (progress) {
        // Extract progress from progress_data JSONB
        const progressData = progress.progress_data || {};
        // This is a simplified calculation - actual criteria evaluation would be more complex
        progressPercent = progress.is_completed ? 100 : 50; // Placeholder
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

    // Add gym challenges
    gymChallenges.forEach((challenge) => {
      const earnedBadge = earnedBadges.find(
        (b) => b.badge_type === 'gym' && b.badge_name === challenge.name
      );
      const progress = userProgress.find((p) => p.gym_challenge_id === challenge.id);
      
      // Calculate progress percentage
      let progressPercent = 0;
      if (progress) {
        const progressData = progress.progress_data || {};
        // Simplified calculation
        progressPercent = progress.is_completed ? 100 : 50; // Placeholder
      }

      badges.push({
        id: challenge.id,
        name: challenge.name,
        description: challenge.description,
        badge_image_url: challenge.badge_image_url,
        badge_type: 'gym',
        gym_name: null, // Would need to fetch gym name
        is_earned: !!earnedBadge,
        earned_at: earnedBadge?.earned_at || null,
        progress: progressPercent,
        progress_data: progress?.progress_data,
      });
    });

    return badges;
  }, [globalAchievements, gymChallenges, earnedBadges, userProgress]);

  // Filter and search badges
  const filteredBadges = useMemo(() => {
    let filtered = allBadgesWithProgress;

    // Filter by type
    if (filterType !== 'all') {
      filtered = filtered.filter((badge) => badge.badge_type === filterType);
    }

    // Search by name
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((badge) =>
        badge.name.toLowerCase().includes(query) ||
        (badge.description && badge.description.toLowerCase().includes(query))
      );
    }

    return filtered;
  }, [allBadgesWithProgress, filterType, searchQuery]);

  // Separate into Global and Gym sections
  const globalBadges = filteredBadges.filter((b) => b.badge_type === 'global');
  const gymBadges = filteredBadges.filter((b) => b.badge_type === 'gym');

  const handleBadgePress = (badge: BadgeWithProgress) => {
    if (!badge.is_earned) return; // Only show detail for earned badges
    
    // Find corresponding earned badge for detail modal
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
            <Ionicons name="arrow-back" size={24} color={currentTheme.colors.text} />
          </TouchableOpacity>
        ) : (
          <BackButton />
        )}
        <Text style={styles.headerTitle}>Trophy Room</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Filter and Search */}
      <View style={styles.filterContainer}>
        <View style={[styles.searchContainer, { backgroundColor: 'rgba(255, 255, 255, 0.05)' }]}>
          <Ionicons name="search" size={20} color={currentTheme.colors.textSecondary} style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, { color: currentTheme.colors.text }]}
            placeholder="Search badges..."
            placeholderTextColor={currentTheme.colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
              <Ionicons name="close-circle" size={20} color={currentTheme.colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.filterButtons}>
          {(['all', 'global', 'gym'] as const).map((type) => (
            <TouchableOpacity
              key={type}
              style={[
                styles.filterButton,
                filterType === type && { backgroundColor: branding.primary, borderColor: branding.primary },
              ]}
              onPress={() => setFilterType(type)}
            >
              <Text
                style={[
                  styles.filterButtonText,
                  filterType === type && { color: branding.onPrimary },
                ]}
              >
                {type === 'all' ? 'All' : type === 'global' ? 'Global' : 'Gym'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {filteredBadges.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="trophy-outline" size={64} color={currentTheme.colors.textSecondary} />
            <Text style={styles.emptyTitle}>No badges found</Text>
            <Text style={styles.emptyText}>
              {searchQuery ? 'Try adjusting your search' : 'Complete challenges to earn badges!'}
            </Text>
          </View>
        ) : (
          <>
            {/* Global Achievements Section */}
            {globalBadges.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="globe" size={24} color={branding.primary} />
                  <Text style={[styles.sectionTitle, { color: branding.primary }]}>
                    Global Achievements
                  </Text>
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
            )}

            {/* Club Challenges Section */}
            {gymBadges.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="business" size={24} color={branding.primary} />
                  <Text style={[styles.sectionTitle, { color: branding.primary }]}>
                    Club Challenges
                  </Text>
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
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  backButton: {
    padding: theme.spacing.sm,
  },
  headerTitle: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    letterSpacing: 0.5,
  },
  headerSpacer: {
    width: 40,
  },
  filterContainer: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  searchIcon: {
    marginRight: theme.spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: theme.typography.fontSize.base,
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
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
  },
  filterButtonText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: BENTO_PADDING,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: theme.spacing['3xl'],
  },
  emptyTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
    letterSpacing: 0.5,
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
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    letterSpacing: 0.5,
  },
  bentoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: BENTO_GAP,
    justifyContent: 'space-between',
  },
});
