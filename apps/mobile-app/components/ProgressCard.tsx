/**
 * ProgressCard — shared card layout for "Next Award" and "Next Badge".
 * Thumbnail (image or icon fallback) + eyebrow label + title + progress bar + chevron.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PlatformBlur } from '@/components/PlatformBlur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import Animated, { useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { PressableCard } from '@/components/PressableCard';
import { fontStyles, hexToRgba } from '@/lib/theme';

const GLASS_BG = 'rgba(12, 12, 22, 0.38)';
const SHIMMER: [string, string] = ['rgba(255,255,255,0.14)', 'rgba(255,255,255,0.01)'];
const THUMB_SIZE = 52;

export interface ProgressCardProps {
  /** Small all-caps label above the title (e.g. "NEXT AWARD", "NEXT BADGE") */
  eyebrow: string;
  /** Main title line */
  title: string;
  /** 0–100 */
  progressPercent: number;
  /** Text shown below the bar (e.g. "420 drops to unlock", "67%") */
  progressLabel: string;
  /** Image URL for the thumbnail (badge or reward photo) */
  imageUrl?: string | null;
  /** Fallback icon name when no image */
  fallbackIcon?: React.ComponentProps<typeof Ionicons>['name'];
  /** Brand primary color */
  primary: string;
  /** Optional darker shade for gradient bar fill */
  primaryDark?: string;
  onPress?: () => void;
}

export const ProgressCard: React.FC<ProgressCardProps> = ({
  eyebrow,
  title,
  progressPercent,
  progressLabel,
  imageUrl,
  fallbackIcon = 'ribbon',
  primary,
  primaryDark,
  onPress,
}) => {
  const barStyle = useAnimatedStyle(() => ({
    width: withTiming(`${Math.min(progressPercent, 100)}%` as any, {
      duration: 800,
      easing: Easing.out(Easing.cubic),
    }),
  }));

  return (
    <PressableCard style={styles.outer} onPress={onPress}>
      <PlatformBlur intensity={50} tint="dark" style={styles.blur} androidColor="rgba(12,12,22,0.97)">
        <LinearGradient
          colors={SHIMMER}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.gradient}
        >
          {/* Thumbnail */}
          <View style={[styles.thumb, { borderColor: hexToRgba(primary, 0.22) }]}>
            {imageUrl ? (
              <Image
                source={{ uri: imageUrl }}
                style={styles.thumbImage}
                contentFit="cover"
                transition={200}
              />
            ) : (
              <View style={[styles.thumbPlaceholder, { backgroundColor: hexToRgba(primary, 0.14) }]}>
                <Ionicons name={fallbackIcon} size={24} color={hexToRgba(primary, 0.75)} />
              </View>
            )}
          </View>

          {/* Info block */}
          <View style={styles.info}>
            <Text style={styles.eyebrow}>{eyebrow.toUpperCase()}</Text>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>

            {/* Progress bar */}
            <View style={styles.barTrack}>
              <View style={[styles.barBg, { backgroundColor: hexToRgba(primary, 0.12) }]}>
                <Animated.View style={[styles.barFillWrap, barStyle]}>
                  <LinearGradient
                    colors={[primary, primaryDark ?? primary]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.barFill}
                  />
                </Animated.View>
              </View>
              <Text style={styles.progressLabel} numberOfLines={1}>{progressLabel}</Text>
            </View>
          </View>

          {/* Chevron */}
          <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.22)" />
        </LinearGradient>
      </PlatformBlur>
    </PressableCard>
  );
};

const styles = StyleSheet.create({
  outer: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: GLASS_BG,
    borderWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.22)',
    borderLeftColor: 'rgba(255,255,255,0.10)',
    borderRightColor: 'rgba(255,255,255,0.06)',
    borderBottomColor: 'rgba(255,255,255,0.04)',
    marginBottom: 12,
  },
  blur: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  gradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 14,
  },

  // Thumbnail
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    flexShrink: 0,
  },
  thumbImage: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
  },
  thumbPlaceholder: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Info
  info: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  eyebrow: {
    ...fontStyles.heading,
    fontSize: 9,
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.40)',
  },
  title: {
    ...fontStyles.bodySemiBold,
    fontSize: 15,
    color: 'rgba(255,255,255,0.75)',
    letterSpacing: 0.2,
  },

  // Progress bar
  barTrack: {
    gap: 5,
    marginTop: 4,
  },
  barBg: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFillWrap: {
    height: '100%',
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressLabel: {
    ...fontStyles.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.38)',
    letterSpacing: 0.2,
  },
});
