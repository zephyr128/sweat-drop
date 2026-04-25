import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { PlatformBlur } from '@/components/PlatformBlur';
import { useBranding } from '@/lib/contexts/ThemeContext';
import { fontStyles, hexToRgba } from '@/lib/theme';
import { UserBadge } from '@/hooks/useUserBadges';
import { AchievementTier } from '@/hooks/useAllBadges';
import { useSession } from '@/hooks/useSession';
import { supabase } from '@/lib/supabase';
import { formatDate as fmtDate } from '@/lib/utils/formatDate';
import { ShareableBadgeCard, ShareableBadgeData } from './ShareableBadgeCard';
import { TIER_COLORS, getBadgeCategoryColor } from './BadgeCard';
import { log } from '@/lib/logger';

interface BadgeDetailModalProps {
  visible: boolean;
  badge: UserBadge | null;
  onClose: () => void;
  isLocked?: boolean;
  progress?: number;
  tier?: AchievementTier | null;
  // When false, hides the "Share badge" button. Used on member profile
  // screens (app/user/[id].tsx) where the viewer is looking at another
  // user's badge — sharing someone else's accomplishment as your own is
  // misleading, so we suppress the action.
  canShare?: boolean;
}

export const BadgeDetailModal: React.FC<BadgeDetailModalProps> = ({
  visible,
  badge,
  onClose,
  isLocked = false,
  progress = 0,
  tier = null,
  canShare = true,
}) => {
  const branding = useBranding();
  const { session } = useSession();
  const { t } = useTranslation('trophyRoom');
  const viewShotRef = useRef<View>(null);
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

  // Entrance: scale-in pop, then a single 360° flip while the info
  // section stages in below. Same staging the original modal had — keeps
  // the "trophy reveal" moment intact across this redesign.
  useEffect(() => {
    if (visible && badge) {
      setIsClosing(false);

      backdropOpacity.value = withTiming(1, { duration: 180 });

      coinOpacity.value = withTiming(1, { duration: 80 });
      coinRotation.value = withTiming(0, { duration: 0 });
      coinScale.value = withSequence(
        withTiming(0.2, { duration: 0 }),
        withSpring(1, { damping: 10, stiffness: 260, mass: 0.7 }),
      );

      coinRotation.value = withDelay(
        350,
        withTiming(360, { duration: 600, easing: Easing.inOut(Easing.cubic) }),
      );

      infoOpacity.value = withDelay(500, withTiming(1, { duration: 200 }));
      infoTranslateY.value = withDelay(500, withSpring(0, { damping: 14, stiffness: 200 }));

      shareOpacity.value = withDelay(650, withTiming(1, { duration: 180 }));
      shareTranslateY.value = withDelay(650, withSpring(0, { damping: 14, stiffness: 200 }));
    }
  }, [visible, badge]);

  const handleClose = () => {
    if (isClosing) return;
    setIsClosing(true);

    shareOpacity.value = withTiming(0, { duration: 120 });
    infoOpacity.value = withTiming(0, { duration: 140 });
    coinOpacity.value = withTiming(0, { duration: 160 });
    backdropOpacity.value = withTiming(0, { duration: 200 });

    setTimeout(() => {
      onClose();
      setIsClosing(false);
    }, 220);
  };

  const handleShare = async () => {
    if (!badge || isSharing || isLocked) return;

    setIsSharing(true);
    try {
      const { captureRef } = await import('react-native-view-shot');
      const Sharing = await import('expo-sharing');
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
        log.error('Error sharing badge:', error);
      }
    } finally {
      setIsSharing(false);
    }
  };

  const formatDate = (dateString: string) =>
    fmtDate(dateString, { year: 'numeric', month: 'long', day: 'numeric' });

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

  // Single source of truth for the "what colour is this badge?" question:
  //   1. tier colour (if the badge has a tier — bronze/silver/.../diamond)
  //   2. category colour (legacy name-based fallback for badges without tier)
  // The same primary colour drives the inner ring, glow, gradient shine,
  // tier pill, share button gradient, and the shareable card. So the modal
  // visually reads as "the same badge you tapped, just bigger".
  const tierColor = tier ? TIER_COLORS[tier] : null;
  const categoryColor = tierColor || getBadgeCategoryColor(badge.badge_name, branding.primary);
  const COIN_SIZE = 168;
  const tierLabel = tier ? t(`tier${tier.charAt(0).toUpperCase()}${tier.slice(1)}`) : null;

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
    tier: tier,
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <Animated.View style={[styles.overlay, backdropAnimStyle]}>
        {Platform.OS === 'ios' ? (
          <PlatformBlur intensity={40} style={StyleSheet.absoluteFill} tint="dark" androidColor="rgba(0,0,0,0.85)" />
        ) : null}
        <View style={[styles.darkOverlay, Platform.OS === 'android' && styles.androidBackdrop]} />
      </Animated.View>

      <TouchableOpacity
        style={styles.contentLayer}
        activeOpacity={1}
        onPress={handleClose}
      >
        <View style={styles.centeredContent} pointerEvents="box-none">
          <Animated.View style={[styles.coinWrapper, coinAnimStyle]} pointerEvents="box-none">
            {/* Outer halo — uses iOS shadowColor for the coloured glow on
                iOS, and a softly bordered ring on Android (where coloured
                shadows don't work). Earned only — locked stays muted. */}
            {!isLocked && (
              <View
                style={[
                  styles.coinHalo,
                  {
                    width: COIN_SIZE + 24,
                    height: COIN_SIZE + 24,
                    borderRadius: (COIN_SIZE + 24) / 2,
                    shadowColor: categoryColor,
                    borderColor: hexToRgba(categoryColor, 0.22),
                  },
                ]}
              />
            )}

            <View
              style={[
                styles.coinOuter,
                {
                  width: COIN_SIZE + 12,
                  height: COIN_SIZE + 12,
                  borderRadius: (COIN_SIZE + 12) / 2,
                  borderColor: isLocked
                    ? 'rgba(255,255,255,0.10)'
                    : hexToRgba(categoryColor, 0.32),
                },
              ]}
            >
              <View
                style={[
                  styles.coinInner,
                  {
                    width: COIN_SIZE,
                    height: COIN_SIZE,
                    borderRadius: COIN_SIZE / 2,
                    borderColor: isLocked
                      ? 'rgba(255,255,255,0.14)'
                      : categoryColor,
                    backgroundColor: isLocked
                      ? 'rgba(255,255,255,0.03)'
                      : hexToRgba(categoryColor, 0.07),
                  },
                ]}
              >
                {/* Layered metallic sheen (subtle two-stop gradient) */}
                {!isLocked && (
                  <>
                    <LinearGradient
                      colors={[
                        hexToRgba(categoryColor, 0.22),
                        'transparent',
                        hexToRgba(categoryColor, 0.05),
                      ]}
                      start={{ x: 0.15, y: 0 }}
                      end={{ x: 0.85, y: 1 }}
                      style={[StyleSheet.absoluteFill, { borderRadius: COIN_SIZE / 2 }]}
                    />
                    {/* Top-left specular highlight — gives the disc that
                        polished-metal feel rather than flat colour fill. */}
                    <LinearGradient
                      colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 0.6, y: 0.55 }}
                      style={[StyleSheet.absoluteFill, { borderRadius: COIN_SIZE / 2 }]}
                    />
                  </>
                )}

                {badge.badge_image_url ? (
                  <Image
                    source={{ uri: badge.badge_image_url }}
                    style={[
                      styles.coinImage,
                      { width: COIN_SIZE * 0.74, height: COIN_SIZE * 0.74 },
                      isLocked && { opacity: 0.28 },
                    ]}
                    contentFit="contain"
                  />
                ) : (
                  <Ionicons
                    name="trophy"
                    size={COIN_SIZE * 0.48}
                    color={isLocked ? 'rgba(255,255,255,0.15)' : categoryColor}
                  />
                )}
              </View>

              {isLocked && (
                <View style={styles.coinLock}>
                  <Ionicons name="lock-closed" size={18} color="rgba(255,255,255,0.7)" />
                </View>
              )}

              {!isLocked && (
                <View style={[styles.coinCheck, { backgroundColor: categoryColor }]}>
                  <Ionicons name="checkmark" size={16} color="#000" />
                </View>
              )}
            </View>
          </Animated.View>

          <Animated.View style={[styles.infoSection, infoAnimStyle]}>
            {/* Tier pill — sits above the name, like a small "GOLD" stamp.
                Makes the rarity instantly readable without forcing the
                user to recognise tier colour from the ring alone. */}
            {tierLabel && !isLocked && (
              <View style={[styles.tierPill, { backgroundColor: hexToRgba(categoryColor, 0.12), borderColor: hexToRgba(categoryColor, 0.35) }]}>
                <View style={[styles.tierDot, { backgroundColor: categoryColor }]} />
                <Text style={[styles.tierPillText, { color: categoryColor }]}>{tierLabel.toUpperCase()}</Text>
              </View>
            )}

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

            {!isLocked && badge.earned_at && (
              <View style={styles.earnedRow}>
                <View style={[styles.earnedPill, { backgroundColor: hexToRgba(categoryColor, 0.10) }]}>
                  <Ionicons name="checkmark-circle" size={15} color={categoryColor} />
                  <Text style={[styles.earnedText, { color: categoryColor }]}>
                    {t('earned')} {formatDate(badge.earned_at)}
                  </Text>
                </View>
              </View>
            )}
          </Animated.View>

          {!isLocked && canShare && (
            <Animated.View style={[styles.shareSection, shareAnimStyle]}>
              <TouchableOpacity
                style={[styles.shareButton, { opacity: isSharing ? 0.6 : 1 }]}
                onPress={handleShare}
                activeOpacity={0.8}
                disabled={isSharing}
              >
                <LinearGradient
                  colors={[categoryColor, hexToRgba(categoryColor, 0.78)]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.shareGradient}
                >
                  {isSharing ? (
                    <ActivityIndicator size="small" color="#000" />
                  ) : (
                    <>
                      <Ionicons name="share-outline" size={18} color="#000" />
                      <Text style={styles.shareText}>{t('shareBadge')}</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          )}
        </View>
      </TouchableOpacity>

      {/* Off-screen shareable card. Captured into a PNG by view-shot when
          the user taps "Share Badge" — kept mounted (not just rendered on
          demand) so layout settles before capture. */}
      <View style={styles.offScreenCapture} pointerEvents="none">
        <View ref={viewShotRef} collapsable={false}>
          <ShareableBadgeCard data={shareData} />
        </View>
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
  androidBackdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.88)',
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
    justifyContent: 'center',
    marginBottom: 26,
    overflow: 'visible',
  },
  coinHalo: {
    position: 'absolute',
    borderWidth: 1,
    shadowOffset: { width: 0, height: 0 },
    // Toned down from 0.55/32 → 0.35/22. The previous strong tier-coloured
    // bloom leaked into the surrounding backdrop and read as a "half-tinted
    // overlay" rather than a clean modal — the user explicitly called this
    // out. The coin's own ring + inner sheen carry enough colour identity.
    shadowOpacity: 0.35,
    shadowRadius: 22,
  },
  coinOuter: {
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
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
    bottom: 6,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinCheck: {
    position: 'absolute',
    bottom: 4,
    right: 14,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#0A0E1A',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },

  /* ── Info section ── */
  infoSection: {
    alignItems: 'center',
    marginBottom: 22,
  },
  tierPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  tierDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  tierPillText: {
    ...fontStyles.heading,
    fontSize: 11,
    letterSpacing: 1.6,
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
    color: 'rgba(255, 255, 255, 0.55)',
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
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 14,
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
