import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { useTheme, useBranding } from '@/lib/contexts/ThemeContext';
import { theme } from '@/lib/theme';
import BackButton from './BackButton';

interface Badge {
  badge_id: string;
  challenge_id: string;
  challenge_name: string;
  badge_image_url: string | null;
  earned_at: string;
}

interface TrophyRoomProps {
  userId?: string;
  onClose?: () => void;
}

export const TrophyRoom: React.FC<TrophyRoomProps> = ({ userId, onClose }) => {
  const { session } = useSession();
  const { theme: currentTheme } = useTheme();
  const branding = useBranding();
  const [badges, setBadges] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(true);

  const targetUserId = userId || session?.user?.id;

  useEffect(() => {
    if (targetUserId) {
      loadBadges();
    }
  }, [targetUserId]);

  const loadBadges = async () => {
    if (!targetUserId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_user_badges', {
        p_user_id: targetUserId,
      });

      if (error) {
        console.error('Error loading badges:', error);
        setBadges([]);
        return;
      }

      setBadges(data || []);
    } catch (err) {
      console.error('Error in loadBadges:', err);
      setBadges([]);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('sr-RS', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <LinearGradient
          colors={['#000000', '#0A0E1A', '#000000']}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={branding.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient
        colors={['#000000', '#0A0E1A', '#000000']}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Header */}
      <View style={styles.header}>
        {onClose ? (
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={currentTheme.colors.text} />
          </TouchableOpacity>
        ) : (
          <BackButton />
        )}
        <Text style={styles.headerTitle}>Trophy Room</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {badges.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="trophy-outline" size={64} color={currentTheme.colors.textSecondary} />
            <Text style={styles.emptyTitle}>No badges earned</Text>
            <Text style={styles.emptyText}>
              Complete challenges to earn badges!
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.badgesHeader}>
              <Text style={styles.badgesCount}>
                {badges.length} {badges.length === 1 ? 'badge' : 'badges'}
              </Text>
            </View>
            <View style={styles.badgesGrid}>
              {badges.map((badge) => (
                <View key={badge.badge_id} style={styles.badgeCard}>
                  {badge.badge_image_url ? (
                    <Image
                      source={{ uri: badge.badge_image_url }}
                      style={styles.badgeImage}
                      resizeMode="contain"
                    />
                  ) : (
                    <View style={[styles.badgePlaceholder, { backgroundColor: branding.primaryLight }]}>
                      <Ionicons name="trophy" size={40} color={branding.primary} />
                    </View>
                  )}
                  <Text style={styles.badgeName} numberOfLines={2}>
                    {badge.challenge_name}
                  </Text>
                  <Text style={styles.badgeDate}>
                    {formatDate(badge.earned_at)}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  backButton: {
    padding: theme.spacing.sm,
  },
  headerTitle: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    letterSpacing: 0.5,
  },
  headerSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing.lg,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: theme.spacing['3xl'],
  },
  emptyTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
    letterSpacing: 0.5,
  },
  emptyText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  badgesHeader: {
    marginBottom: theme.spacing.lg,
  },
  badgesCount: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text,
    letterSpacing: 0.3,
  },
  badgesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  badgeCard: {
    width: '30%',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  badgeImage: {
    width: 80,
    height: 80,
    marginBottom: theme.spacing.sm,
  },
  badgePlaceholder: {
    width: 80,
    height: 80,
    borderRadius: theme.borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  badgeName: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text,
    textAlign: 'center',
    fontWeight: theme.typography.fontWeight.medium,
    marginBottom: theme.spacing.xs,
  },
  badgeDate: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
});
