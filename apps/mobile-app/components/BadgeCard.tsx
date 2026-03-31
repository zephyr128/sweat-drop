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
const GRID_GAP = 10;
const COLUMNS = 3;
const BADGE_SIZE = Math.floor(
  (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP * (COLUMNS - 1)) / COLUMNS
);
const CIRCLE_SIZE = BADGE_SIZE - 16;
const ICON_SIZE = CIRCLE_SIZE * 0.68;

interface BadgeCardProps {
  badge: UserBadge;
  isLocked: boolean;
  progress?: number;
  onPress: () => void;
  size?: 'small' | 'medium' | 'large';
}

const ProgressRing: React.FC<{
  progress: number;
  size: number;
  color: string;
}> = ({ progress, size, color }) => {
  const strokeWidth = 2.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <Svg width={size} height={size} style={styles.progressRing}>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="rgba(255, 255, 255, 0.05)"
        strokeWidth={strokeWidth}
        fill="none"
      />
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

export function getBadgeCategoryColor(badgeName: string, brandPrimary: string): string {
  const name = badgeName.toLowerCase();
  if (name.includes('streak') || name.includes('warm-up') || name.includes('unstoppable') || name.includes('iron will'))
    return '#FF9500';
  if (name.includes('drop') || name.includes('collector') || name.includes('hoarder') || name.includes('legend'))
    return '#30D158';
  if (name.includes('gym') || name.includes('explorer'))
    return '#BF5AF2';
  return brandPrimary;
}

export const BadgeCard: React.FC<BadgeCardProps> = ({
  badge,
  isLocked,
  progress = 0,
  onPress,
}) => {
  const branding = useBranding();
  const categoryColor = getBadgeCategoryColor(badge.badge_name, branding.primary);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={styles.container}
    >
      {/* Outer glow ring — earned only */}
      {!isLocked && (
        <View
          style={[
            styles.outerGlow,
            {
              width: CIRCLE_SIZE + 10,
              height: CIRCLE_SIZE + 10,
              borderRadius: (CIRCLE_SIZE + 10) / 2,
              shadowColor: categoryColor,
              borderColor: hexToRgba(categoryColor, 0.22),
            },
          ]}
        />
      )}

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
            backgroundColor: hexToRgba(categoryColor, 0.06),
            borderColor: hexToRgba(categoryColor, 0.6),
            borderWidth: 2,
          },
          isLocked && {
            backgroundColor: 'rgba(255, 255, 255, 0.02)',
            borderColor: 'rgba(255, 255, 255, 0.07)',
            borderWidth: 1.5,
          },
        ]}
      >
        {/* Earned shine */}
        {!isLocked && (
          <LinearGradient
            colors={[
              hexToRgba(categoryColor, 0.18),
              'transparent',
              hexToRgba(categoryColor, 0.06),
            ]}
            start={{ x: 0.15, y: 0 }}
            end={{ x: 0.85, y: 1 }}
            style={[StyleSheet.absoluteFill, { borderRadius: CIRCLE_SIZE / 2 }]}
          />
        )}

        {/* Progress ring */}
        {isLocked && progress > 0 && (
          <ProgressRing
            progress={progress}
            size={CIRCLE_SIZE}
            color={categoryColor}
          />
        )}

        {/* Badge artwork */}
        {badge.badge_image_url ? (
          <Image
            source={{ uri: badge.badge_image_url }}
            style={[
              styles.badgeImage,
              { width: ICON_SIZE, height: ICON_SIZE },
              isLocked && styles.badgeImageLocked,
            ]}
            contentFit="contain"
          />
        ) : (
          <Ionicons
            name="trophy"
            size={ICON_SIZE * 0.65}
            color={isLocked ? 'rgba(255,255,255,0.12)' : categoryColor}
          />
        )}
      </View>

      {/* Lock badge — outside the circle so overflow:hidden doesn't clip it */}
      {isLocked && progress === 0 && (
        <View style={styles.lockBadge}>
          <Ionicons name="lock-closed" size={9} color="rgba(255,255,255,0.55)" />
        </View>
      )}

      {/* Earned checkmark — outside the circle */}
      {!isLocked && (
        <View style={[styles.checkBadge, { backgroundColor: categoryColor, borderColor: '#000' }]}>
          <Ionicons name="checkmark" size={9} color="#000" />
        </View>
      )}

      {/* Badge name */}
      <Text
        style={[styles.badgeName, isLocked && styles.badgeNameLocked]}
        numberOfLines={2}
      >
        {badge.badge_name}
      </Text>

      {/* Gym name */}
      {badge.badge_type === 'gym' && badge.gym_name && (
        <Text style={[styles.gymName, isLocked && styles.gymNameLocked]} numberOfLines={1}>
          {badge.gym_name}
        </Text>
      )}

      {/* Progress % for in-progress badges */}
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
    top: 10 - 5,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 8,
  },
  badgeCircle: {
    alignItems: 'center',
    justifyContent: 'center',
    // No overflow:hidden — lock/check badges are rendered outside this view
  },
  progressRing: {
    position: 'absolute',
  },
  badgeImage: {
    borderRadius: 999,
  },
  badgeImageLocked: {
    opacity: 0.18,
  },
  lockBadge: {
    position: 'absolute',
    top: 10 + CIRCLE_SIZE - 12,
    right: (BADGE_SIZE - CIRCLE_SIZE) / 2 - 1,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(20, 20, 28, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  checkBadge: {
    position: 'absolute',
    top: 10 + CIRCLE_SIZE - 12,
    right: (BADGE_SIZE - CIRCLE_SIZE) / 2 - 1,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    zIndex: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 3,
  },
  badgeName: {
    fontSize: 11,
    color: theme.colors.text,
    textAlign: 'center',
    ...fontStyles.bodyMedium,
    marginTop: 8,
    lineHeight: 14,
    maxWidth: BADGE_SIZE - 4,
  },
  badgeNameLocked: {
    color: 'rgba(255, 255, 255, 0.28)',
  },
  gymName: {
    fontSize: 9,
    color: 'rgba(255, 255, 255, 0.35)',
    textAlign: 'center',
    marginTop: 2,
    maxWidth: BADGE_SIZE - 4,
    ...fontStyles.body,
  },
  gymNameLocked: {
    color: 'rgba(255, 255, 255, 0.15)',
  },
  progressText: {
    fontSize: 10,
    ...fontStyles.bodySemiBold,
    marginTop: 2,
  },
});
