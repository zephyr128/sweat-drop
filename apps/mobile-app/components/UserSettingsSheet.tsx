import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { useRouter } from 'expo-router';
import { theme as baseTheme } from '@/lib/theme';
import { useTheme } from '@/lib/contexts/ThemeContext';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

interface UserSettingsSheetProps {
  visible: boolean;
  onClose: () => void;
  profile: any;
}

export function UserSettingsSheet({ visible, onClose, profile }: UserSettingsSheetProps) {
  const { session } = useSession();
  const { theme } = useTheme();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              await supabase.auth.signOut();
              router.replace('/(onboarding)/auth');
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to logout');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={Platform.OS === 'android'}
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={onClose}
      statusBarTranslucent={Platform.OS === 'android'}
    >
      {Platform.OS === 'ios' ? (
        <View style={styles.iosContainer}>
          <SafeAreaView style={styles.modalContainer} edges={['top', 'bottom']}>
            <LinearGradient
              colors={['#000000', '#0A0E1A', '#000000']}
              style={StyleSheet.absoluteFillObject}
            />
            
            {/* Header with drag handle for iOS */}
            <View style={styles.iosHeaderContainer}>
              <View style={styles.dragHandle} />
              <View style={styles.header}>
                <Text style={styles.headerTitle}>Settings</Text>
                <TouchableOpacity 
                  onPress={onClose} 
                  style={styles.closeButton}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close" size={28} color={baseTheme.colors.text} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Content */}
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* User Info Header */}
              <View style={styles.userHeader}>
                <View style={[styles.avatarContainer, { borderColor: theme.colors.primary + '30' }]}>
                  <Text style={[styles.avatarText, { color: theme.colors.primary }]}>
                    {profile?.username?.charAt(0).toUpperCase() || 'U'}
                  </Text>
                </View>
                <Text style={styles.username}>{profile?.username || 'User'}</Text>
                <Text style={styles.email}>{profile?.email || ''}</Text>
              </View>

              {/* Account Info */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Account Information</Text>
                
                <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)}>
                  <View style={styles.infoRow}>
                    <Ionicons name="person-outline" size={20} color={theme.colors.primary} />
                    <View style={styles.infoContent}>
                      <Text style={styles.infoLabel}>Username</Text>
                      <Text style={styles.infoValue}>{profile?.username || 'N/A'}</Text>
                    </View>
                  </View>
                </Animated.View>

                <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)}>
                  <View style={styles.infoRow}>
                    <Ionicons name="mail-outline" size={20} color={theme.colors.primary} />
                    <View style={styles.infoContent}>
                      <Text style={styles.infoLabel}>Email</Text>
                      <Text style={styles.infoValue}>{profile?.email || 'N/A'}</Text>
                    </View>
                  </View>
                </Animated.View>

                <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)}>
                  <View style={styles.infoRow}>
                    <Ionicons name="calendar-outline" size={20} color={theme.colors.primary} />
                    <View style={styles.infoContent}>
                      <Text style={styles.infoLabel}>Member Since</Text>
                      <Text style={styles.infoValue}>
                        {formatDate(profile?.created_at)}
                      </Text>
                    </View>
                  </View>
                </Animated.View>
              </View>

              {/* Stats */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Statistics</Text>
                
                <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)}>
                  <View style={styles.statsGrid}>
                    <View style={styles.statCard}>
                      <Ionicons name="water-outline" size={24} color={theme.colors.primary} />
                      <Text style={[styles.statValue, { color: theme.colors.primary }]}>
                        {profile?.total_drops || 0}
                      </Text>
                      <Text style={styles.statLabel}>Total Drops</Text>
                    </View>
                  </View>
                </Animated.View>
              </View>

              {/* Actions */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Actions</Text>
                
                <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)}>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => {
                      onClose();
                      router.push('/wallet');
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="wallet-outline" size={20} color={baseTheme.colors.text} />
                    <Text style={styles.actionButtonText}>View Wallet</Text>
                    <Ionicons name="chevron-forward" size={20} color={baseTheme.colors.textSecondary} />
                  </TouchableOpacity>
                </Animated.View>

                <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)}>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => {
                      onClose();
                      router.push('/leaderboard');
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="trophy-outline" size={20} color={baseTheme.colors.text} />
                    <Text style={styles.actionButtonText}>Leaderboard</Text>
                    <Ionicons name="chevron-forward" size={20} color={baseTheme.colors.textSecondary} />
                  </TouchableOpacity>
                </Animated.View>
              </View>

              {/* Logout */}
              <View style={styles.section}>
                <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)}>
                  <TouchableOpacity
                    style={[styles.logoutButton, loading && styles.logoutButtonDisabled]}
                    onPress={handleLogout}
                    disabled={loading}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="log-out-outline" size={20} color="#FF5252" />
                    <Text style={styles.logoutButtonText}>
                      {loading ? 'Logging out...' : 'Logout'}
                    </Text>
                  </TouchableOpacity>
                </Animated.View>
              </View>
            </ScrollView>
          </SafeAreaView>
        </View>
      ) : (
        <SafeAreaView style={styles.modalContainer} edges={['top', 'bottom']}>
          <LinearGradient
            colors={['#000000', '#0A0E1A', '#000000']}
            style={StyleSheet.absoluteFillObject}
          />
          
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Settings</Text>
            <TouchableOpacity 
              onPress={onClose} 
              style={styles.closeButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={28} color={baseTheme.colors.text} />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* User Info Header */}
            <View style={styles.userHeader}>
              <View style={[styles.avatarContainer, { borderColor: theme.colors.primary + '30' }]}>
                <Text style={[styles.avatarText, { color: theme.colors.primary }]}>
                  {profile?.username?.charAt(0).toUpperCase() || 'U'}
                </Text>
              </View>
              <Text style={styles.username}>{profile?.username || 'User'}</Text>
              <Text style={styles.email}>{profile?.email || ''}</Text>
            </View>

            {/* Account Info */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Account Information</Text>
              
              <View style={styles.infoRow}>
                <Ionicons name="person-outline" size={20} color={theme.colors.primary} />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Username</Text>
                  <Text style={styles.infoValue}>{profile?.username || 'N/A'}</Text>
                </View>
              </View>

              <View style={styles.infoRow}>
                <Ionicons name="mail-outline" size={20} color={theme.colors.primary} />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Email</Text>
                  <Text style={styles.infoValue}>{profile?.email || 'N/A'}</Text>
                </View>
              </View>

              <View style={styles.infoRow}>
                <Ionicons name="calendar-outline" size={20} color={theme.colors.primary} />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Member Since</Text>
                  <Text style={styles.infoValue}>
                    {formatDate(profile?.created_at)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Stats */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Statistics</Text>
              
              <View style={styles.statsGrid}>
                <View style={styles.statCard}>
                  <Ionicons name="water-outline" size={24} color={theme.colors.primary} />
                  <Text style={[styles.statValue, { color: theme.colors.primary }]}>
                    {profile?.total_drops || 0}
                  </Text>
                  <Text style={styles.statLabel}>Total Drops</Text>
                </View>
              </View>
            </View>

            {/* Actions */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Actions</Text>
              
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => {
                  onClose();
                  router.push('/wallet');
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="wallet-outline" size={20} color={baseTheme.colors.text} />
                <Text style={styles.actionButtonText}>View Wallet</Text>
                <Ionicons name="chevron-forward" size={20} color={baseTheme.colors.textSecondary} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => {
                  onClose();
                  router.push('/leaderboard');
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="trophy-outline" size={20} color={baseTheme.colors.text} />
                <Text style={styles.actionButtonText}>Leaderboard</Text>
                <Ionicons name="chevron-forward" size={20} color={baseTheme.colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Logout */}
            <View style={styles.section}>
              <TouchableOpacity
                style={[styles.logoutButton, loading && styles.logoutButtonDisabled]}
                onPress={handleLogout}
                disabled={loading}
                activeOpacity={0.7}
              >
                <Ionicons name="log-out-outline" size={20} color="#FF5252" />
                <Text style={styles.logoutButtonText}>
                  {loading ? 'Logging out...' : 'Logout'}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  iosContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  iosHeaderContainer: {
    paddingTop: baseTheme.spacing.sm,
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: baseTheme.colors.textSecondary + '40',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: baseTheme.spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: baseTheme.spacing.lg,
    paddingBottom: baseTheme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: baseTheme.glass.border,
    zIndex: 10,
  },
  headerTitle: {
    fontSize: baseTheme.typography.fontSize['2xl'],
    fontWeight: baseTheme.typography.fontWeight.bold,
    color: baseTheme.colors.text,
    letterSpacing: 0.5,
  },
  closeButton: {
    padding: baseTheme.spacing.sm,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: baseTheme.spacing.lg,
    gap: baseTheme.spacing.md,
  },
  userHeader: {
    alignItems: 'center',
    paddingVertical: baseTheme.spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: baseTheme.glass.border,
    marginBottom: baseTheme.spacing.lg,
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: baseTheme.colors.primary + '20',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: baseTheme.spacing.md,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: baseTheme.typography.fontWeight.bold,
  },
  username: {
    fontSize: baseTheme.typography.fontSize['2xl'],
    fontWeight: baseTheme.typography.fontWeight.bold,
    color: baseTheme.colors.text,
    marginBottom: baseTheme.spacing.xs,
    letterSpacing: 0.5,
  },
  email: {
    fontSize: baseTheme.typography.fontSize.sm,
    color: baseTheme.colors.textSecondary,
    letterSpacing: 0.3,
  },
  section: {
    paddingVertical: baseTheme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: baseTheme.glass.border,
  },
  sectionTitle: {
    fontSize: baseTheme.typography.fontSize.sm,
    fontWeight: baseTheme.typography.fontWeight.semibold,
    color: baseTheme.colors.textSecondary,
    marginBottom: baseTheme.spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: baseTheme.spacing.md,
    gap: baseTheme.spacing.md,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: baseTheme.typography.fontSize.xs,
    color: baseTheme.colors.textSecondary,
    marginBottom: baseTheme.spacing.xs,
    letterSpacing: 0.3,
  },
  infoValue: {
    fontSize: baseTheme.typography.fontSize.base,
    color: baseTheme.colors.text,
    fontWeight: baseTheme.typography.fontWeight.medium,
    letterSpacing: 0.3,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: baseTheme.spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: baseTheme.glass.background,
    borderRadius: baseTheme.borderRadius.xl,
    padding: baseTheme.spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: baseTheme.glass.border,
  },
  statValue: {
    fontSize: baseTheme.typography.fontSize['2xl'],
    fontWeight: baseTheme.typography.fontWeight.bold,
    marginTop: baseTheme.spacing.sm,
    marginBottom: baseTheme.spacing.xs,
    letterSpacing: 0.5,
  },
  statLabel: {
    fontSize: baseTheme.typography.fontSize.xs,
    color: baseTheme.colors.textSecondary,
    letterSpacing: 0.3,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: baseTheme.glass.background,
    borderRadius: baseTheme.borderRadius.xl,
    padding: baseTheme.spacing.lg,
    marginBottom: baseTheme.spacing.md,
    borderWidth: 1,
    borderColor: baseTheme.glass.border,
    gap: baseTheme.spacing.md,
  },
  actionButtonText: {
    flex: 1,
    fontSize: baseTheme.typography.fontSize.base,
    color: baseTheme.colors.text,
    fontWeight: baseTheme.typography.fontWeight.medium,
    letterSpacing: 0.3,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 82, 82, 0.1)',
    borderRadius: baseTheme.borderRadius.xl,
    padding: baseTheme.spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 82, 82, 0.3)',
    gap: baseTheme.spacing.md,
  },
  logoutButtonDisabled: {
    opacity: 0.5,
  },
  logoutButtonText: {
    fontSize: baseTheme.typography.fontSize.base,
    color: '#FF5252',
    fontWeight: baseTheme.typography.fontWeight.semibold,
    letterSpacing: 0.3,
  },
});
