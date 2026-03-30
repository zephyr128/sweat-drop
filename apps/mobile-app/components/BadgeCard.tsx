import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { useBranding } from '@/lib/contexts/ThemeContext';
import { theme, fontStyles, hexToRgba } from '@/lib/theme';
import type { UserBadge } from '@/hooks/useUserBadges';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_PADDING = 16;
const GRID_GAP = 12;
const COLUMNS = 3;
const BADGE_SIZE = Math.floor(
  (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP * (COLUMNS - 1)) / COLUMNS
);
const CIRCLE_SIZE = BADGE_SIZE - 12;
/** Badge artwork fills most of the coin (was 0.5 — too small on phones). */
const ICON_SIZE = CIRCLE_SIZE * 0.72;

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
        stroke="rgba(255, 255, 255, 0.06)"
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
export function getBadgeCategoryColor(badgeName: string, brandPrimary: string): string {
  const name = badgeName.toLowerCase();
  if (name.includes('streak') || name.includes('warm-up') || name.includes('unstoppable') || name.includes('iron will'))
    return '#FF9500'; // Orange for streaks
  if (name.includes('drop') || name.includes('collector') || name.includes('hoarder') || name.includes('legend'))
    return '#30D158'; // Green for drops milestones
  if (name.includes('gym') || name.includes('explorer'))
    return '#BF5AF2'; // Purple for exploration
  return brandPrimary; // Default brand color
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
      activeOpacity={0.7}
      style={styles.container}
    >
      {/* Outer glow for earned badges */}
      {!isLocked && (
        <View
          style={[
            styles.outerGlow,
            {
              width: CIRCLE_SIZE + 8,
              height: CIRCLE_SIZE + 8,
              borderRadius: (CIRCLE_SIZE + 8) / 2,
              shadowColor: categoryColor,
              borderColor: hexToRgba(categoryColor, 0.2),
            },
          ]}
        />
      )}

      {/* Badge circle — coin style */}
      <View
        style={[
          styles.badgeCircle,
          {
            width: CIRCLE_SIZE,
            height: CIRCLE_SIZE,
            borderRadius: CIRCLE_SIZE / 2,
          },
          !isLocked && {
            backgroundColor: hexToRgba(categoryColor, 0.05),
            borderColor: categoryColor,
            borderWidth: 2.5,
          },
          isLocked && {
            backgroundColor: 'rgba(255, 255, 255, 0.02)',
            borderColor: 'rgba(255, 255, 255, 0.08)',
            borderWidth: 1.5,
          },
        ]}
      >
        {/* Metallic shine gradient (earned only) */}
        {!isLocked && (
          <LinearGradient
            colors={[
              hexToRgba(categoryColor, 0.15),
              'transparent',
              hexToRgba(categoryColor, 0.08),
            ]}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={[StyleSheet.absoluteFill, { borderRadius: CIRCLE_SIZE / 2 }]}
          />
        )}

        {/* Progress ring for locked badges */}
        {isLocked && progress > 0 && (
          <ProgressRing
            progress={progress}
            size={CIRCLE_SIZE}
            color={categoryColor}
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
            size={ICON_SIZE * 0.7}
            color={isLocked ? 'rgba(255,255,255,0.15)' : categoryColor}
          />
        )}

        {/* Lock icon for locked badges (no progress) */}
        {isLocked && progress === 0 && (
          <View style={styles.lockBadge}>
            <Ionicons name="lock-closed" size={12} color="rgba(255,255,255,0.4)" />
          </View>
        )}
      </View>

      {/* Earned checkmark badge */}
      {!isLocked && (
        <View style={[styles.checkBadge, { backgroundColor: categoryColor }]}>
          <Ionicons name="checkmark" size={10} color="#000" />
        </View>
      )}

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
    paddingVertical: 10,
  },
  outerGlow: {
    position: 'absolute',
    top: 10 - 4, // container paddingVertical - half of extra size
    borderWidth: 1,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 6,
  },
  badgeCircle: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  progressRing: {
    position: 'absolute',
  },
  badgeImage: {
    borderRadius: 999,
  },
  badgeImageLocked: {
    opacity: 0.2,
  },
  lockBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBadge: {
    position: 'absolute',
    top: 10 + CIRCLE_SIZE - 14, // container paddingVertical + circleSize - overlap
    right: (BADGE_SIZE - CIRCLE_SIZE) / 2 - 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#000',
    zIndex: 1,
  },
  badgeName: {
    fontSize: 11,
    color: theme.colors.text,
    textAlign: 'center',
    ...fontStyles.bodyMedium,
    marginTop: 6,
    lineHeight: 14,
    maxWidth: BADGE_SIZE - 4,
  },
  badgeNameLocked: {
    color: 'rgba(255, 255, 255, 0.3)',
  },
  gymName: {
    fontSize: 9,
    color: 'rgba(255, 255, 255, 0.35)',
    textAlign: 'center' as const,
    marginTop: 1,
    maxWidth: BADGE_SIZE - 4,
    ...fontStyles.body,
  },
  gymNameLocked: {
    color: 'rgba(255, 255, 255, 0.18)',
  },
  progressText: {
    fontSize: 10,
    ...fontStyles.bodySemiBold,
    marginTop: 2,
  },
});
