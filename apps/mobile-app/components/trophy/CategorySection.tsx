import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { PlatformBlur } from '@/components/PlatformBlur';
import { BadgeCard } from '@/components/BadgeCard';
import { useBranding } from '@/lib/contexts/ThemeContext';
import { fontStyles, hexToRgba } from '@/lib/theme';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { BadgeWithProgress, AchievementCategory } from '@/hooks/useAllBadges';
import type { UserBadge } from '@/hooks/useUserBadges';

const CATEGORY_ICONS: Record<AchievementCategory, React.ComponentProps<typeof Ionicons>['name']> = {
  sessions: 'barbell-outline',
  total_drops: 'water-outline',
  streak: 'flame-outline',
  multi_gym: 'map-outline',
  distance: 'bicycle-outline',
  special: 'star-outline',
};

interface CategorySectionProps {
  category: AchievementCategory;
  title: string;
  badges: BadgeWithProgress[];
  earnedCount: number;
  onBadgePress: (badge: BadgeWithProgress) => void;
  index: number;
  earnedBadges: UserBadge[];
}

export const CategorySection: React.FC<CategorySectionProps> = ({
  category,
  title,
  badges,
  earnedCount,
  onBadgePress,
  index,
  earnedBadges,
}) => {
  const branding = useBranding();
  const icon = CATEGORY_ICONS[category];

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 80).duration(400)}
      style={styles.wrapper}
    >
      <View style={[styles.card, { borderColor: hexToRgba(branding.primary, 0.12) }]}>
        <PlatformBlur
          androidColor="rgba(20,20,30,0.75)"
          intensity={50}
          tint="dark"
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={[hexToRgba(branding.primary, 0.08), 'rgba(255,255,255,0.02)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        {/* Header */}
        <View style={styles.header}>
          <Ionicons name={icon} size={22} color={branding.primary} />
          <Text style={styles.title}>{title}</Text>
          <View style={[styles.countPill, { backgroundColor: hexToRgba(branding.primary, 0.14), borderColor: hexToRgba(branding.primary, 0.22) }]}>
            <Text style={[styles.countText, { color: branding.primary }]}>
              {earnedCount}/{badges.length}
            </Text>
          </View>
        </View>

        {/* Tier ladder row */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.ladder}
        >
          {badges.map((badge, i) => {
            const earnedBadge = earnedBadges.find(
              (b) => b.badge_name === badge.name && b.badge_type === badge.badge_type
            );

            return (
              <React.Fragment key={badge.id}>
                {i > 0 && (
                  <View style={[styles.connector, { backgroundColor: hexToRgba(branding.primary, 0.25) }]} />
                )}
                <BadgeCard
                  badge={earnedBadge || {
                    badge_id: badge.id,
                    badge_name: badge.name,
                    badge_description: badge.description,
                    badge_image_url: badge.badge_image_url,
                    earned_at: badge.earned_at || '',
                    badge_type: badge.badge_type,
                    gym_name: badge.gym_name,
                    gym_id: badge.gym_id || null,
                  }}
                  isLocked={!badge.is_earned}
                  progress={badge.progress}
                  onPress={() => onBadgePress(badge)}
                  size="small"
                  tier={badge.tier}
                />
              </React.Fragment>
            );
          })}
        </ScrollView>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 16,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  title: {
    ...fontStyles.heading,
    fontSize: 16,
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 1,
    flex: 1,
  },
  countPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  countText: {
    fontSize: 12,
    ...fontStyles.bodySemiBold,
  },
  ladder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
    paddingVertical: 4,
  },
  connector: {
    width: 12,
    height: 2,
    borderRadius: 1,
    alignSelf: 'center',
    marginTop: -20,
  },
});
