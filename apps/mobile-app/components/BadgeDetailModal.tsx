import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Share,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { useTheme, useBranding } from '@/lib/contexts/ThemeContext';
import { theme } from '@/lib/theme';
import { UserBadge } from '@/hooks/useUserBadges';

interface BadgeDetailModalProps {
  visible: boolean;
  badge: UserBadge | null;
  onClose: () => void;
}

export const BadgeDetailModal: React.FC<BadgeDetailModalProps> = ({
  visible,
  badge,
  onClose,
}) => {
  const { theme: currentTheme } = useTheme();
  const branding = useBranding();

  const handleShare = async () => {
    if (!badge) return;

    try {
      const message = `🏆 I just earned the "${badge.badge_name}" badge in SweatDrop! ${badge.badge_description || ''}`;
      
      if (Platform.OS === 'web') {
        // Web sharing
        if (navigator.share) {
          await navigator.share({
            title: badge.badge_name,
            text: message,
          });
        }
      } else {
        // Native sharing
        const result = await Share.share({
          message,
          title: badge.badge_name,
        });

        if (result.action === Share.sharedAction) {
          console.log('Badge shared successfully');
        }
      }
    } catch (error: any) {
      if (error.message !== 'User did not share') {
        console.error('Error sharing badge:', error);
      }
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

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <Animated.View
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(200)}
        style={styles.overlay}
      >
        <BlurView intensity={20} style={StyleSheet.absoluteFill} tint="dark" />
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
        />
        
        <Animated.View
          entering={SlideInDown.springify().damping(20)}
          exiting={SlideOutDown.duration(200)}
          style={styles.modalContainer}
        >
          <SafeAreaView edges={['bottom']} style={styles.modalContent}>
            {/* Handle bar */}
            <View style={styles.handleBar}>
              <View style={[styles.handle, { backgroundColor: currentTheme.colors.textSecondary }]} />
            </View>

            {/* Badge Image */}
            <View style={styles.badgeImageContainer}>
              {badge.badge_image_url ? (
                <Image
                  source={{ uri: badge.badge_image_url }}
                  style={styles.badgeImage}
                  contentFit="contain"
                />
              ) : (
                <View style={[styles.badgePlaceholder, { backgroundColor: branding.primaryLight + '20' }]}>
                  <Ionicons name="trophy" size={80} color={branding.primary} />
                </View>
              )}
            </View>

            {/* Badge Info */}
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.badgeName}>{badge.badge_name}</Text>
              
              {badge.badge_type === 'gym' && badge.gym_name && (
                <View style={styles.badgeTypeContainer}>
                  <Ionicons name="business" size={16} color={branding.primary} />
                  <Text style={[styles.badgeType, { color: branding.primary }]}>
                    {badge.gym_name}
                  </Text>
                </View>
              )}

              {badge.badge_description && (
                <Text style={styles.badgeDescription}>{badge.badge_description}</Text>
              )}

              {badge.earned_at && (
                <View style={styles.earnedContainer}>
                  <Ionicons name="calendar" size={16} color={currentTheme.colors.textSecondary} />
                  <Text style={styles.earnedText}>
                    Earned on {formatDate(badge.earned_at)}
                  </Text>
                </View>
              )}
            </ScrollView>

            {/* Share Button */}
            <TouchableOpacity
              style={[styles.shareButton, { backgroundColor: branding.primary }]}
              onPress={handleShare}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={[branding.primary, branding.primaryDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.shareButtonGradient}
              >
                <Ionicons name="share-social" size={20} color={branding.onPrimary} />
                <Text style={[styles.shareButtonText, { color: branding.onPrimary }]}>
                  Share to Social
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </SafeAreaView>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius['2xl'],
    borderTopRightRadius: theme.borderRadius['2xl'],
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 20,
  },
  modalContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
  },
  handleBar: {
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  badgeImageContainer: {
    alignItems: 'center',
    marginVertical: theme.spacing.lg,
  },
  badgeImage: {
    width: 150,
    height: 150,
  },
  badgePlaceholder: {
    width: 150,
    height: 150,
    borderRadius: 75,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
    maxHeight: 300,
  },
  scrollContent: {
    paddingBottom: theme.spacing.md,
  },
  badgeName: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
    letterSpacing: 0.5,
  },
  badgeTypeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.md,
  },
  badgeType: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
  },
  badgeDescription: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: theme.spacing.lg,
  },
  earnedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.md,
  },
  earnedText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  shareButton: {
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    marginTop: theme.spacing.md,
  },
  shareButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
  },
  shareButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
  },
});
