import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { useBranding } from '@/lib/contexts/ThemeContext';
import { theme, fontStyles, hexToRgba } from '@/lib/theme';
import type { UserBadge } from '@/hooks/useUserBadges';
import type { AchievementTier } from '@/hooks/useAllBadges';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_PADDING = 16;
const GRID_GAP = 10;
const COLUMNS = 3;
const BADGE_SIZE = Math.floor(
  (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP * (COLUMNS - 1)) / COLUMNS
);
const CIRCLE_SIZE = BADGE_SIZE - 16;
const ICON_SIZE = CIRCLE_SIZE * 0.68;

// "small" cards live in the per-category horizontal carousels in the
// Trophy Room. The previous 96px version still read as a thumbnail
// next to the row chrome — bumped to 120 so the badge artwork is the
// hero of the row (this is the showcase carousel, not a grid). The
// per-category drill-down screen still uses medium for its full grid.
const SMALL_BADGE_SIZE = 120;
const SMALL_CIRCLE_SIZE = SMALL_BADGE_SIZE - 16;
const SMALL_ICON_SIZE = SMALL_CIRCLE_SIZE * 0.68;

export const TIER_COLORS: Record<AchievementTier, string> = {
  bronze: '#CD7F32',
  silver: '#C0C0C0',
  gold: '#FFD700',
  platinum: '#E5E4E2',
  diamond: '#B9F2FF',
};

interface BadgeCardProps {
  badge: UserBadge;
  isLocked: boolean;
  progress?: number;
  onPress: () => void;
  size?: 'small' | 'medium' | 'large';
  tier?: AchievementTier | null;
  // Explicit width override for non-3-column layouts (e.g. the 4-col grid
  // on the member profile screen). When provided, the internal circle and
  // icon scale to match so the proportions read identically to the
  // standard sizes — just smaller.
  customSize?: number;
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
  size = 'medium',
  tier,
  customSize,
}) => {
  const branding = useBranding();
  const tierColor = tier ? TIER_COLORS[tier] : null;
  const categoryColor = tierColor || getBadgeCategoryColor(badge.badge_name, branding.primary);

  const isSmall = size === 'small';
  const isCustom = typeof customSize === 'number' && customSize > 0;
  const badgeSize = isCustom ? customSize : isSmall ? SMALL_BADGE_SIZE : BADGE_SIZE;
  // Keep the same circle/icon ratios the standard sizes use so the badge
  // reads identically — just at a different scale.
  const circleSize = isCustom ? badgeSize - 16 : isSmall ? SMALL_CIRCLE_SIZE : CIRCLE_SIZE;
  const iconSize = isCustom ? circleSize * 0.68 : isSmall ? SMALL_ICON_SIZE : ICON_SIZE;
  const useTightOverlay = isSmall || isCustom;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.container, (isSmall || isCustom) && { width: badgeSize }]}
    >
      {/* Outer glow ring — earned only */}
      {!isLocked && (
        <View
          style={[
            styles.outerGlow,
            {
              width: circleSize + 10,
              height: circleSize + 10,
              borderRadius: (circleSize + 10) / 2,
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
            width: circleSize,
            height: circleSize,
            borderRadius: circleSize / 2,
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
            opacity: 0.35,
          },
        ]}
      >
        {/* Tier-colored inner ring */}
        {tierColor && !isLocked && (
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                borderRadius: circleSize / 2,
                borderWidth: 2,
                borderColor: hexToRgba(tierColor, 0.8),
              },
            ]}
            pointerEvents="none"
          />
        )}

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
            style={[StyleSheet.absoluteFill, { borderRadius: circleSize / 2 }]}
          />
        )}

        {/* Progress ring */}
        {isLocked && progress > 0 && (
          <ProgressRing
            progress={progress}
            size={circleSize}
            color={categoryColor}
          />
        )}

        {/* Badge artwork */}
        {badge.badge_image_url ? (
          <Image
            source={{ uri: badge.badge_image_url }}
            style={[
              styles.badgeImage,
              { width: iconSize, height: iconSize },
              isLocked && styles.badgeImageLocked,
            ]}
            contentFit="contain"
          />
        ) : (
          <Ionicons
            name="trophy"
            size={iconSize * 0.65}
            color={isLocked ? 'rgba(255,255,255,0.12)' : categoryColor}
          />
        )}
      </View>

      {/* Lock overlay for locked tier badges */}
      {isLocked && (
        <View
          style={[
            styles.lockBadge,
            useTightOverlay && styles.lockBadgeSmall,
            isCustom && {
              top: 10 + circleSize - 10,
              right: (badgeSize - circleSize) / 2 - 1,
            },
          ]}
        >
          <Ionicons name="lock-closed" size={useTightOverlay ? 8 : 9} color="rgba(255,255,255,0.55)" />
        </View>
      )}

      {/* Earned checkmark — pinned to the bottom-right of the badge circle,
          mirroring the lock badge position. Without the small-size override
          the check inherits medium-size offsets and floats off below the
          name on small carousel cards. */}
      {!isLocked && (
        <View style={[
          styles.checkBadge,
          useTightOverlay && styles.checkBadgeSmall,
          isCustom && {
            top: 10 + circleSize - 10,
            right: (badgeSize - circleSize) / 2 - 1,
          },
          { backgroundColor: categoryColor, borderColor: '#000' },
        ]}>
          <Ionicons name="checkmark" size={useTightOverlay ? 8 : 9} color="#000" />
        </View>
      )}

      {/* Badge name */}
      <Text
        style={[
          styles.badgeName,
          isLocked && styles.badgeNameLocked,
          (isSmall || isCustom) && styles.badgeNameSmall,
          isCustom && { maxWidth: badgeSize - 4 },
        ]}
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
    // iOS: colored glow via shadow props. Android: elevation is omitted because
    // it ignores shadowColor and renders a grey material shadow instead.
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
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
  lockBadgeSmall: {
    top: 10 + SMALL_CIRCLE_SIZE - 10,
    right: (SMALL_BADGE_SIZE - SMALL_CIRCLE_SIZE) / 2 - 1,
    width: 16,
    height: 16,
    borderRadius: 8,
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
  },
  checkBadgeSmall: {
    top: 10 + SMALL_CIRCLE_SIZE - 10,
    right: (SMALL_BADGE_SIZE - SMALL_CIRCLE_SIZE) / 2 - 1,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
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
  badgeNameSmall: {
    fontSize: 10,
    lineHeight: 13,
    maxWidth: SMALL_BADGE_SIZE - 4,
    marginTop: 7,
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
