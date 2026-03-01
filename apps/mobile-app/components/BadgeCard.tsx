import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useBranding } from '@/lib/contexts/ThemeContext';
import { theme } from '@/lib/theme';
import type { UserBadge } from '@/hooks/useUserBadges';

interface BadgeCardProps {
  badge: UserBadge;
  isLocked: boolean;
  progress?: number; // 0-100 for locked badges
  onPress: () => void;
  size?: 'small' | 'medium' | 'large';
}

export const BadgeCard: React.FC<BadgeCardProps> = ({
  badge,
  isLocked,
  progress = 0,
  onPress,
  size = 'medium',
}) => {
  const branding = useBranding();
  const pulseAnim = useSharedValue(0);

  // Pulse animation for unlocked badges
  React.useEffect(() => {
    if (!isLocked) {
      pulseAnim.value = withRepeat(
        withTiming(1, {
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
        }),
        -1,
        true
      );
    }
  }, [isLocked, pulseAnim]);

  const pulseStyle = useAnimatedStyle(() => {
    if (isLocked) return {};
    
    const opacity = interpolate(pulseAnim.value, [0, 1], [0.3, 0.8]);
    const scale = interpolate(pulseAnim.value, [0, 1], [1, 1.05]);
    
    return {
      opacity,
      transform: [{ scale }],
    };
  });

  const glowStyle = useAnimatedStyle(() => {
    if (isLocked) return {};
    
    const opacity = interpolate(pulseAnim.value, [0, 1], [0.2, 0.6]);
    
    return {
      opacity,
    };
  });

  const sizeStyles = {
    small: { width: 100, height: 100, imageSize: 60, iconSize: 16 },
    medium: { width: 140, height: 140, imageSize: 80, iconSize: 20 },
    large: { width: 180, height: 180, imageSize: 100, iconSize: 24 },
  };

  const currentSize = sizeStyles[size];

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[styles.container, { width: currentSize.width, height: currentSize.height }]}
    >
      {/* Glow effect for unlocked badges */}
      {!isLocked && (
        <Animated.View
          style={[
            styles.glow,
            glowStyle,
            {
              width: currentSize.width + 20,
              height: currentSize.height + 20,
              borderRadius: (currentSize.width + 20) / 2,
              backgroundColor: branding.primary,
            },
          ]}
        />
      )}

      {/* Card container */}
      <Animated.View
        style={[
          styles.card,
          isLocked && styles.cardLocked,
          !isLocked && pulseStyle,
          {
            width: currentSize.width,
            height: currentSize.height,
            borderRadius: currentSize.width / 2,
          },
        ]}
      >
        {/* Badge image or placeholder */}
        {badge.badge_image_url ? (
          <Image
            source={{ uri: badge.badge_image_url }}
            style={[
              styles.badgeImage,
              {
                width: currentSize.imageSize,
                height: currentSize.imageSize,
              },
              isLocked && styles.badgeImageLocked,
            ]}
            contentFit="contain"
          />
        ) : (
          <View
            style={[
              styles.badgePlaceholder,
              {
                width: currentSize.imageSize,
                height: currentSize.imageSize,
                borderRadius: currentSize.imageSize / 2,
                backgroundColor: isLocked
                  ? 'rgba(255, 255, 255, 0.1)'
                  : branding.primaryLight + '20',
              },
            ]}
          >
            <Ionicons
              name="trophy"
              size={currentSize.imageSize * 0.5}
              color={isLocked ? theme.colors.textSecondary : branding.primary}
            />
          </View>
        )}

        {/* Lock icon overlay for locked badges */}
        {isLocked && (
          <View style={styles.lockOverlay}>
            <View
              style={[
                styles.lockIconContainer,
                { backgroundColor: 'rgba(0, 0, 0, 0.6)' },
              ]}
            >
              <Ionicons
                name="lock-closed"
                size={currentSize.iconSize}
                color={theme.colors.textSecondary}
              />
            </View>
          </View>
        )}

        {/* Progress bar for locked badges */}
        {isLocked && progress > 0 && (
          <View style={styles.progressContainer}>
            <View style={[styles.progressBar, { backgroundColor: 'rgba(255, 255, 255, 0.1)' }]}>
              <LinearGradient
                colors={[branding.primary, branding.primaryDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.progressFill, { width: `${progress}%` }]}
              />
            </View>
            <Text style={styles.progressText}>{Math.round(progress)}%</Text>
          </View>
        )}
      </Animated.View>

      {/* Badge name */}
      <Text style={[styles.badgeName, isLocked && styles.badgeNameLocked]} numberOfLines={2}>
        {badge.badge_name}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  glow: {
    position: 'absolute',
    top: -10,
    left: -10,
  },
  card: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 2,
    borderColor: theme.colors.primary,
    overflow: 'hidden',
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  cardLocked: {
    borderColor: 'rgba(255, 255, 255, 0.2)',
    opacity: 0.5,
  },
  badgeImage: {
    borderRadius: 40,
  },
  badgeImageLocked: {
    opacity: 0.4,
  },
  badgePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressContainer: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    right: 8,
    alignItems: 'center',
  },
  progressBar: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressText: {
    fontSize: 10,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  badgeName: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text,
    textAlign: 'center',
    fontWeight: theme.typography.fontWeight.medium,
    marginTop: theme.spacing.xs,
    maxWidth: 140,
  },
  badgeNameLocked: {
    color: theme.colors.textSecondary,
  },
});
