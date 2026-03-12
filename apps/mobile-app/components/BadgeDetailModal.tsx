import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  withSequence,
  Easing,
  runOnJS,
  interpolate,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { useTheme, useBranding } from '@/lib/contexts/ThemeContext';
import { theme, fontStyles, getNumberStyle } from '@/lib/theme';
import { UserBadge } from '@/hooks/useUserBadges';
import { useSession } from '@/hooks/useSession';
import { supabase } from '@/lib/supabase';
import { ShareableBadgeCard, ShareableBadgeData } from './ShareableBadgeCard';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface BadgeDetailModalProps {
  visible: boolean;
  badge: UserBadge | null;
  onClose: () => void;
  isLocked?: boolean;
  progress?: number; // 0-100 for locked badges
}

function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(0, 229, 255, ${alpha})`;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getBadgeCategoryColor(badgeName: string, brandPrimary: string): string {
  const name = badgeName.toLowerCase();
  if (name.includes('streak') || name.includes('warm-up') || name.includes('unstoppable') || name.includes('iron will'))
    return '#FF9500';
  if (name.includes('drop') || name.includes('collector') || name.includes('hoarder') || name.includes('legend'))
    return '#30D158';
  if (name.includes('gym') || name.includes('explorer'))
    return '#BF5AF2';
  return brandPrimary;
}

export const BadgeDetailModal: React.FC<BadgeDetailModalProps> = ({
  visible,
  badge,
  onClose,
  isLocked = false,
  progress = 0,
}) => {
  const { theme: currentTheme } = useTheme();
  const branding = useBranding();
  const { session } = useSession();
  const viewShotRef = useRef<ViewShot>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  // Animation shared values
  const backdropOpacity = useSharedValue(0);
  const coinRotation = useSharedValue(180);
  const coinScale = useSharedValue(0.6);
  const coinOpacity = useSharedValue(0);
  const infoTranslateY = useSharedValue(30);
  const infoOpacity = useSharedValue(0);
  const shareTranslateY = useSharedValue(20);
  const shareOpacity = useSharedValue(0);

  // Fetch username
  useEffect(() => {
    if (!session?.user?.id) return;
    supabase
      .from('profiles')
      .select('username')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        if (data?.username) setUsername(data.username);
      });
  }, [session?.user?.id]);

  // Entrance animation — scale first, then 360° flip
  useEffect(() => {
    if (visible && badge) {
      setIsClosing(false);

      // Backdrop: fast fade
      backdropOpacity.value = withTiming(1, { duration: 180 });

      // Phase 1: Pop in — scale from tiny to full size
      coinOpacity.value = withTiming(1, { duration: 80 });
      coinRotation.value = withTiming(0, { duration: 0 }); // start face-up
      coinScale.value = withSequence(
        withTiming(0.2, { duration: 0 }),
        withSpring(1, { damping: 10, stiffness: 260, mass: 0.7 })
      );

      // Phase 2: Full 360° flip after scale settles (~350ms)
      coinRotation.value = withDelay(
        350,
        withTiming(360, { duration: 600, easing: Easing.inOut(Easing.cubic) })
      );

      // Info: appears after flip starts
      infoOpacity.value = withDelay(500, withTiming(1, { duration: 200 }));
      infoTranslateY.value = withDelay(500, withSpring(0, { damping: 14, stiffness: 200 }));

      // Share button: after info
      shareOpacity.value = withDelay(650, withTiming(1, { duration: 180 }));
      shareTranslateY.value = withDelay(650, withSpring(0, { damping: 14, stiffness: 200 }));
    }
  }, [visible, badge]);

  // Close animation — snappy reverse
  const handleClose = () => {
    if (isClosing) return;
    setIsClosing(true);

    shareOpacity.value = withTiming(0, { duration: 100 });
    shareTranslateY.value = withTiming(15, { duration: 100 });
    infoOpacity.value = withTiming(0, { duration: 100 });
    infoTranslateY.value = withTiming(15, { duration: 100 });
    coinRotation.value = withTiming(0, { duration: 200, easing: Easing.in(Easing.cubic) });
    coinScale.value = withTiming(0.2, { duration: 250, easing: Easing.in(Easing.cubic) });
    coinOpacity.value = withDelay(120, withTiming(0, { duration: 100 }));
    backdropOpacity.value = withDelay(80, withTiming(0, { duration: 180 }));

    // Call onClose after animation
    setTimeout(() => {
      onClose();
      setIsClosing(false);
    }, 320);
  };

  const handleShare = async () => {
    if (!badge || isSharing || isLocked) return;

    setIsSharing(true);
    try {
      const uri = await captureRef(viewShotRef, {
        format: 'png',
        quality: 1,
      });

      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: `I earned the ${badge.badge_name} badge!`,
        });
      }
    } catch (error: any) {
      if (error.message !== 'User did not share') {
        console.error('Error sharing badge:', error);
      }
    } finally {
      setIsSharing(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  // Animated styles
  const backdropAnimStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const coinAnimStyle = useAnimatedStyle(() => ({
    opacity: coinOpacity.value,
    transform: [
      { perspective: 1200 },
      { rotateY: `${coinRotation.value}deg` },
      { scale: coinScale.value },
    ],
  }));

  const infoAnimStyle = useAnimatedStyle(() => ({
    opacity: infoOpacity.value,
    transform: [{ translateY: infoTranslateY.value }],
  }));

  const shareAnimStyle = useAnimatedStyle(() => ({
    opacity: shareOpacity.value,
    transform: [{ translateY: shareTranslateY.value }],
  }));

  if (!badge) return null;

  const categoryColor = getBadgeCategoryColor(badge.badge_name, branding.primary);
  const COIN_SIZE = 160;

  // Data for the shareable card
  const shareData: ShareableBadgeData = {
    badgeName: badge.badge_name,
    badgeDescription: badge.badge_description,
    badgeImageUrl: badge.badge_image_url,
    badgeType: badge.badge_type,
    earnedAt: badge.earned_at,
    gymName: badge.gym_name,
    username: username,
    brandColor: branding.primary,
    brandColorDark: branding.primaryDark,
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <Animated.View style={[styles.overlay, backdropAnimStyle]}>
        <BlurView intensity={40} style={StyleSheet.absoluteFill} tint="dark" />
        <View style={styles.darkOverlay} />
      </Animated.View>

      {/* Tap-to-close layer + Centered content */}
      <TouchableOpacity
        style={styles.contentLayer}
        activeOpacity={1}
        onPress={handleClose}
      >
        <View style={styles.centeredContent} pointerEvents="box-none">
          {/* Coin badge — 3D flip animation */}
          <Animated.View style={[styles.coinWrapper, coinAnimStyle]}>
            {/* Outer metallic ring */}
            <View style={[
              styles.coinOuter,
              {
                width: COIN_SIZE + 16,
                height: COIN_SIZE + 16,
                borderRadius: (COIN_SIZE + 16) / 2,
                borderColor: isLocked
                  ? 'rgba(255,255,255,0.08)'
                  : hexToRgba(categoryColor, 0.3),
                shadowColor: isLocked ? 'transparent' : categoryColor,
              },
            ]}>
              {/* Inner ring */}
              <View style={[
                styles.coinInner,
                {
                  width: COIN_SIZE,
                  height: COIN_SIZE,
                  borderRadius: COIN_SIZE / 2,
                  borderColor: isLocked
                    ? 'rgba(255,255,255,0.12)'
                    : categoryColor,
                  backgroundColor: isLocked
                    ? 'rgba(255,255,255,0.03)'
                    : hexToRgba(categoryColor, 0.06),
                },
              ]}>
                {/* Metallic shine gradient */}
                {!isLocked && (
                  <LinearGradient
                    colors={[
                      hexToRgba(categoryColor, 0.12),
                      'transparent',
                      hexToRgba(categoryColor, 0.06),
                    ]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[StyleSheet.absoluteFill, { borderRadius: COIN_SIZE / 2 }]}
                  />
                )}

                {/* Badge image or fallback */}
                {badge.badge_image_url ? (
                  <Image
                    source={{ uri: badge.badge_image_url }}
                    style={[
                      styles.coinImage,
                      { width: COIN_SIZE * 0.55, height: COIN_SIZE * 0.55 },
                      isLocked && { opacity: 0.3 },
                    ]}
                    contentFit="contain"
                  />
                ) : (
                  <Ionicons
                    name="trophy"
                    size={COIN_SIZE * 0.38}
                    color={isLocked ? 'rgba(255,255,255,0.15)' : categoryColor}
                  />
                )}

                {/* Lock icon for locked */}
                {isLocked && (
                  <View style={styles.coinLock}>
                    <Ionicons name="lock-closed" size={18} color="rgba(255,255,255,0.5)" />
                  </View>
                )}
              </View>
            </View>

            {/* Earned checkmark */}
            {!isLocked && (
              <View style={[styles.coinCheck, { backgroundColor: categoryColor }]}>
                <Ionicons name="checkmark" size={16} color="#000" />
              </View>
            )}
          </Animated.View>

          {/* Info section */}
          <Animated.View style={[styles.infoSection, infoAnimStyle]}>
            <Text style={styles.badgeName}>{badge.badge_name}</Text>

            {badge.badge_type === 'gym' && badge.gym_name && (
              <View style={styles.badgeTypeRow}>
                <Ionicons name="business" size={14} color={categoryColor} />
                <Text style={[styles.badgeTypeName, { color: categoryColor }]}>
                  {badge.gym_name}
                </Text>
              </View>
            )}

            {badge.badge_description && (
              <Text style={styles.badgeDescription}>{badge.badge_description}</Text>
            )}

            {/* Progress bar for locked badges */}
            {isLocked && progress > 0 && (
              <View style={styles.progressSection}>
                <View style={styles.progressBarBg}>
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: `${Math.min(progress, 100)}%`,
                        backgroundColor: categoryColor,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.progressText, { color: categoryColor }]}>
                  {Math.round(progress)}%
                </Text>
              </View>
            )}

            {/* Earned date */}
            {!isLocked && badge.earned_at && (
              <View style={styles.earnedRow}>
                <View style={[styles.earnedPill, { backgroundColor: hexToRgba(categoryColor, 0.1) }]}>
                  <Ionicons name="checkmark-circle" size={15} color={categoryColor} />
                  <Text style={[styles.earnedText, { color: categoryColor }]}>
                    Earned {formatDate(badge.earned_at)}
                  </Text>
                </View>
              </View>
            )}
          </Animated.View>

          {/* Share button — only for earned badges */}
          {!isLocked && (
            <Animated.View style={[styles.shareSection, shareAnimStyle]}>
              <TouchableOpacity
                style={[styles.shareButton, { opacity: isSharing ? 0.6 : 1 }]}
                onPress={handleShare}
                activeOpacity={0.8}
                disabled={isSharing}
              >
                <LinearGradient
                  colors={[categoryColor, hexToRgba(categoryColor, 0.8)]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.shareGradient}
                >
                  {isSharing ? (
                    <ActivityIndicator size="small" color="#000" />
                  ) : (
                    <>
                      <Ionicons name="share-outline" size={18} color="#000" />
                      <Text style={styles.shareText}>Share Badge</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          )}
        </View>
      </TouchableOpacity>

      {/* Off-screen shareable card for capturing */}
      <View style={styles.offScreenCapture} pointerEvents="none">
        <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1 }}>
          <ShareableBadgeCard data={shareData} />
        </ViewShot>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  darkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  contentLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centeredContent: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    maxWidth: 360,
    width: '100%',
  },
  /* ── Coin ── */
  coinWrapper: {
    alignItems: 'center',
    marginBottom: 28,
    overflow: 'visible',
  },
  coinOuter: {
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 12,
  },
  coinInner: {
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  coinImage: {
    borderRadius: 999,
  },
  coinLock: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinCheck: {
    position: 'absolute',
    bottom: 4,
    right: 16,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#141418',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },

  /* ── Info section ── */
  infoSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  badgeName: {
    fontSize: 26,
    ...fontStyles.heading,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  badgeTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 12,
  },
  badgeTypeName: {
    fontSize: 13,
    ...fontStyles.bodyMedium,
  },
  badgeDescription: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 16,
    maxWidth: '100%',
    ...fontStyles.body,
  },
  progressSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    marginBottom: 12,
  },
  progressBarBg: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 14,
    ...fontStyles.bodySemiBold,
    minWidth: 36,
    textAlign: 'right',
  },
  earnedRow: {
    marginBottom: 4,
  },
  earnedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  earnedText: {
    fontSize: 13,
    ...fontStyles.bodySemiBold,
  },

  /* ── Share button ── */
  shareSection: {
    width: '100%',
  },
  shareButton: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  shareGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 14,
  },
  shareText: {
    ...fontStyles.heading,
    fontSize: 16,
    color: '#000',
    letterSpacing: 0.5,
  },

  /* ── Off-screen capture ── */
  offScreenCapture: {
    position: 'absolute',
    top: -9999,
    left: -9999,
    opacity: 1,
  },
});
