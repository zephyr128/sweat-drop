import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { useBranding } from '@/lib/contexts/ThemeContext';
import { theme } from '@/lib/theme';
import type { UserBadge } from '@/hooks/useUserBadges';

// AGENT NOTE: [2026-03-03] - mobile-coder
// Redesigned to Apple Fitness badge style:
// - Clean circular badges, no heavy glow/pulse
// - Earned: full color with subtle shadow + check ring
// - Locked: desaturated, low opacity, circular progress ring
// - Tight spacing between badge and name

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_PADDING = 16;
const GRID_GAP = 8;
const COLUMNS = 3;
const BADGE_SIZE = Math.floor(
  (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP * (COLUMNS - 1)) / COLUMNS
);
const CIRCLE_SIZE = BADGE_SIZE - 16; // Leave some padding for the progress ring
const ICON_SIZE = CIRCLE_SIZE * 0.48;

interface BadgeCardProps {
  badge: UserBadge;
  isLocked: boolean;
  progress?: number; // 0-100 for locked badges
  onPress: () => void;
  size?: 'small' | 'medium' | 'large';
}

// Progress ring component (Apple Watch ring style)
const ProgressRing: React.FC<{
  progress: number;
  size: number;
  color: string;
}> = ({ progress, size, color }) => {
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <Svg width={size} height={size} style={styles.progressRing}>
      {/* Background ring */}
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="rgba(255, 255, 255, 0.08)"
        strokeWidth={strokeWidth}
        fill="none"
      />
      {/* Progress ring */}
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
        rotation="-90"
        origin={`${size / 2}, ${size / 2}`}
      />
    </Svg>
  );
};

// Badge category color mapping
function getBadgeCategoryColor(badgeName: string, brandPrimary: string): string {
  const name = badgeName.toLowerCase();
  if (name.includes('streak') || name.includes('warm-up') || name.includes('unstoppable') || name.includes('iron will'))
    return '#FF9500'; // Orange for streaks
  if (name.includes('drop') || name.includes('collector') || name.includes('hoarder') || name.includes('legend'))
    return '#30D158'; // Green for drops milestones
  if (name.includes('gym') || name.includes('explorer'))
    return '#BF5AF2'; // Purple for exploration
  return brandPrimary; // Default brand color for sessions/other
}

export const BadgeCard: React.FC<BadgeCardProps> = ({
  badge,
  isLocked,
  progress = 0,
  onPress,
  size = 'medium',
}) => {
  const branding = useBranding();
  const categoryColor = getBadgeCategoryColor(badge.badge_name, branding.primary);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={isLocked ? 1 : 0.7}
      disabled={isLocked}
      style={styles.container}
    >
      {/* Badge circle */}
      <View
        style={[
          styles.badgeCircle,
          {
            width: CIRCLE_SIZE,
            height: CIRCLE_SIZE,
            borderRadius: CIRCLE_SIZE / 2,
          },
          !isLocked && {
            backgroundColor: 'rgba(255, 255, 255, 0.06)',
            shadowColor: categoryColor,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.4,
            shadowRadius: 12,
            elevation: 6,
          },
          isLocked && {
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
          },
        ]}
      >
        {/* Progress ring for locked badges */}
        {isLocked && progress > 0 && (
          <ProgressRing
            progress={progress}
            size={CIRCLE_SIZE}
            color={categoryColor}
          />
        )}

        {/* Earned ring border */}
        {!isLocked && (
          <View
            style={[
              styles.earnedRing,
              {
                width: CIRCLE_SIZE,
                height: CIRCLE_SIZE,
                borderRadius: CIRCLE_SIZE / 2,
                borderColor: categoryColor,
              },
            ]}
          />
        )}

        {/* Badge image or placeholder */}
        {badge.badge_image_url ? (
          <Image
            source={{ uri: badge.badge_image_url }}
            style={[
              styles.badgeImage,
              {
                width: ICON_SIZE,
                height: ICON_SIZE,
              },
              isLocked && styles.badgeImageLocked,
            ]}
            contentFit="contain"
          />
        ) : (
          <Ionicons
            name="trophy"
            size={ICON_SIZE * 0.75}
            color={isLocked ? 'rgba(255,255,255,0.2)' : categoryColor}
          />
        )}

        {/* Lock icon for locked badges (no progress) */}
        {isLocked && progress === 0 && (
          <View style={styles.lockBadge}>
            <Ionicons name="lock-closed" size={14} color="rgba(255,255,255,0.4)" />
          </View>
        )}
      </View>

      {/* Badge name */}
      <Text
        style={[
          styles.badgeName,
          isLocked && styles.badgeNameLocked,
        ]}
        numberOfLines={2}
      >
        {badge.badge_name}
      </Text>

      {/* Gym name for gym badges */}
      {badge.badge_type === 'gym' && badge.gym_name && (
        <Text style={[styles.gymName, isLocked && styles.gymNameLocked]} numberOfLines={1}>
          {badge.gym_name}
        </Text>
      )}

      {/* Progress text for locked badges */}
      {isLocked && progress > 0 && (
        <Text style={[styles.progressText, { color: categoryColor }]}>
          {Math.round(progress)}%
        </Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    width: BADGE_SIZE,
    alignItems: 'center',
    paddingVertical: 8,
  },
  badgeCircle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  earnedRing: {
    position: 'absolute',
    borderWidth: 2.5,
  },
  progressRing: {
    position: 'absolute',
  },
  badgeImage: {
    borderRadius: 999,
  },
  badgeImageLocked: {
    opacity: 0.25,
  },
  lockBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeName: {
    fontSize: 12,
    color: theme.colors.text,
    textAlign: 'center',
    fontWeight: theme.typography.fontWeight.medium,
    marginTop: 6,
    lineHeight: 15,
    maxWidth: BADGE_SIZE - 4,
  },
  badgeNameLocked: {
    color: 'rgba(255, 255, 255, 0.35)',
  },
  gymName: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.4)',
    textAlign: 'center' as const,
    marginTop: 1,
    maxWidth: BADGE_SIZE - 4,
  },
  gymNameLocked: {
    color: 'rgba(255, 255, 255, 0.2)',
  },
  progressText: {
    fontSize: 10,
    fontWeight: theme.typography.fontWeight.semibold,
    marginTop: 2,
  },
});
