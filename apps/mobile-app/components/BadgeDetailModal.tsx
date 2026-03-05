import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { useTheme, useBranding } from '@/lib/contexts/ThemeContext';
import { theme, fontStyles } from '@/lib/theme';
import { UserBadge } from '@/hooks/useUserBadges';
import { useSession } from '@/hooks/useSession';
import { supabase } from '@/lib/supabase';
import { ShareableBadgeCard, ShareableBadgeData } from './ShareableBadgeCard';

// AGENT NOTE: [2026-03-03] - mobile-coder
// Fixed: replaced springify().damping(20) with smoother animation
// Added: shareable badge image generation via react-native-view-shot + expo-sharing

interface BadgeDetailModalProps {
  visible: boolean;
  badge: UserBadge | null;
  onClose: () => void;
}

function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(0, 229, 255, ${alpha})`;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Badge category color mapping (same as BadgeCard)
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
}) => {
  const { theme: currentTheme } = useTheme();
  const branding = useBranding();
  const { session } = useSession();
  const viewShotRef = useRef<ViewShot>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [username, setUsername] = useState<string | null>(null);

  // Fetch username from profiles
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

  const handleShare = async () => {
    if (!badge || isSharing) return;

    setIsSharing(true);
    try {
      // Capture the badge card as an image
      const uri = await captureRef(viewShotRef, {
        format: 'png',
        quality: 1,
      });

      // Check if sharing is available
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

  if (!badge) return null;

  const categoryColor = getBadgeCategoryColor(badge.badge_name, branding.primary);

  // Data for the shareable card
  const shareData: ShareableBadgeData = {
    badgeName: badge.badge_name,
    badgeDescription: badge.badge_description,
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
      onRequestClose={onClose}
    >
      <Animated.View
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(150)}
        style={styles.overlay}
      >
        <BlurView intensity={20} style={StyleSheet.absoluteFill} tint="dark" />
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
        />

        <Animated.View
          entering={SlideInDown.duration(350).damping(22).stiffness(200)}
          exiting={SlideOutDown.duration(250)}
          style={styles.modalContainer}
        >
          <SafeAreaView edges={['bottom']} style={styles.modalContent}>
            {/* Handle bar */}
            <View style={styles.handleBar}>
              <View style={styles.handle} />
            </View>

            {/* Badge Image — Apple Fitness style */}
            <View style={styles.badgeHero}>
              <View
                style={[
                  styles.outerRing,
                  { borderColor: hexToRgba(categoryColor, 0.2) },
                ]}
              >
                <View
                  style={[
                    styles.innerCircle,
                    {
                      borderColor: categoryColor,
                      backgroundColor: hexToRgba(categoryColor, 0.06),
                    },
                  ]}
                >
                  {badge.badge_image_url ? (
                    <Image
                      source={{ uri: badge.badge_image_url }}
                      style={styles.badgeImage}
                      contentFit="contain"
                    />
                  ) : (
                    <Ionicons name="trophy" size={56} color={categoryColor} />
                  )}
                </View>
              </View>
            </View>

            {/* Badge Info */}
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              <Text style={styles.badgeName}>{badge.badge_name}</Text>

              {badge.badge_type === 'gym' && badge.gym_name && (
                <View style={styles.badgeTypeRow}>
                  <Ionicons name="business" size={14} color={categoryColor} />
                  <Text style={[styles.badgeType, { color: categoryColor }]}>
                    {badge.gym_name}
                  </Text>
                </View>
              )}

              {badge.badge_description && (
                <Text style={styles.badgeDescription}>{badge.badge_description}</Text>
              )}

              {badge.earned_at && (
                <View style={styles.earnedRow}>
                  <View style={[styles.earnedPill, { backgroundColor: hexToRgba(categoryColor, 0.08) }]}>
                    <Ionicons name="checkmark-circle" size={15} color={categoryColor} />
                    <Text style={[styles.earnedText, { color: categoryColor }]}>
                      Earned {formatDate(badge.earned_at)}
                    </Text>
                  </View>
                </View>
              )}
            </ScrollView>

            {/* Share Button */}
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
                style={styles.shareButtonGradient}
              >
                {isSharing ? (
                  <ActivityIndicator size="small" color="#000" />
                ) : (
                  <>
                    <Ionicons name="share-outline" size={18} color="#000" />
                    <Text style={styles.shareButtonText}>Share to Social</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </SafeAreaView>
        </Animated.View>
      </Animated.View>

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
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#141418',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 20,
  },
  modalContent: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 20,
  },
  handleBar: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  /* Badge hero */
  badgeHero: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  outerRing: {
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerCircle: {
    width: 108,
    height: 108,
    borderRadius: 54,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeImage: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  /* Scroll */
  scrollView: {
    maxHeight: 200,
  },
  scrollContent: {
    alignItems: 'center',
    paddingBottom: 8,
  },
  badgeName: {
    fontSize: 22,
    ...fontStyles.heading,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  badgeTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 12,
  },
  badgeType: {
    fontSize: 13,
    ...fontStyles.bodyMedium,
  },
  badgeDescription: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 16,
    maxWidth: '90%',
  },
  earnedRow: {
    marginBottom: 4,
  },
  earnedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  earnedText: {
    fontSize: 13,
    ...fontStyles.bodySemiBold,
  },
  /* Share button */
  shareButton: {
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 12,
  },
  shareButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  shareButtonText: {
    ...fontStyles.heading,
    fontSize: 16,
    color: '#000',
    letterSpacing: 0.2,
  },
  /* Off-screen capture area */
  offScreenCapture: {
    position: 'absolute',
    top: -9999,
    left: -9999,
    opacity: 1, // Must be visible for ViewShot to capture
  },
});
