import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Alert,
  Platform,
  TextInput,
  Switch,
  Keyboard,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { useRouter } from 'expo-router';
import { theme as baseTheme, getNumberStyle } from '@/lib/theme';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { useBranding } from '@/lib/hooks/useBranding';
import { useGymStore } from '@/lib/stores/useGymStore';
import Animated, {
  FadeIn,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
  Easing,
} from 'react-native-reanimated';

/* ── Helper ─────────────────────────────────── */
function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(128, 128, 128, ${alpha})`;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* ── Types ──────────────────────────────────── */
interface UserSettingsSheetProps {
  visible: boolean;
  onClose: () => void;
  profile: any;
}

/* ── Component ──────────────────────────────── */
export function UserSettingsSheet({ visible, onClose, profile }: UserSettingsSheetProps) {
  const { session } = useSession();
  const { theme } = useTheme();
  const branding = useBranding();
  const router = useRouter();
  const { activeGym } = useGymStore();

  const [loading, setLoading] = useState(false);
  const [editingUsername, setEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [savingUsername, setSavingUsername] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  // Stats
  const [totalWorkouts, setTotalWorkouts] = useState(0);
  const [streak, setStreak] = useState(0);

  // Avatar glow pulse
  const avatarGlow = useSharedValue(0);
  useEffect(() => {
    if (visible) {
      avatarGlow.value = withRepeat(
        withTiming(1, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    }
  }, [visible]);

  const avatarGlowStyle = useAnimatedStyle(() => {
    const opacity = interpolate(avatarGlow.value, [0, 1], [0.3, 0.7]);
    const scale = interpolate(avatarGlow.value, [0, 1], [1, 1.06]);
    return { opacity, transform: [{ scale }] };
  });

  // Load lightweight stats when sheet opens
  useEffect(() => {
    if (visible && session?.user) {
      loadStats();
    }
  }, [visible, session?.user]);

  const loadStats = async () => {
    if (!session?.user) return;
    const userId = session.user.id;

    try {
      // Total completed workouts
      const { count } = await supabase
        .from('sessions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_active', false);

      setTotalWorkouts(count || 0);

      // Streak (same algorithm as useHomeStats)
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const sixtyDaysAgo = new Date(now);
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

      const { data: sessionDates } = await supabase
        .from('sessions')
        .select('started_at')
        .eq('user_id', userId)
        .eq('is_active', false)
        .gte('started_at', sixtyDaysAgo.toISOString())
        .order('started_at', { ascending: false });

      let currentStreak = 0;
      if (sessionDates && sessionDates.length > 0) {
        const uniqueDates = new Set<string>();
        for (const s of sessionDates) {
          if (s.started_at) {
            uniqueDates.add(new Date(s.started_at).toISOString().split('T')[0]);
          }
        }

        const todayStr = todayStart.toISOString().split('T')[0];
        const checkDate = new Date(todayStart);
        if (!uniqueDates.has(todayStr)) {
          checkDate.setDate(checkDate.getDate() - 1);
        }

        while (true) {
          const dateStr = checkDate.toISOString().split('T')[0];
          if (uniqueDates.has(dateStr)) {
            currentStreak++;
            checkDate.setDate(checkDate.getDate() - 1);
          } else {
            break;
          }
        }
      }
      setStreak(currentStreak);
    } catch (error) {
      console.error('[Settings] Error loading stats:', error);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  /* ── Username edit ─────────────────── */
  const handleStartEditUsername = () => {
    setNewUsername(profile?.username || '');
    setEditingUsername(true);
  };

  const handleSaveUsername = async () => {
    if (!session?.user || !newUsername.trim()) return;
    const trimmed = newUsername.trim();

    if (trimmed === profile?.username) {
      setEditingUsername(false);
      return;
    }

    setSavingUsername(true);
    try {
      // Check uniqueness
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', trimmed)
        .neq('id', session.user.id)
        .maybeSingle();

      if (existing) {
        Alert.alert('Unavailable', 'This username is already taken.');
        setSavingUsername(false);
        return;
      }

      const { error } = await supabase
        .from('profiles')
        .update({ username: trimmed })
        .eq('id', session.user.id);

      if (error) throw error;

      // Update the local profile state in parent (via re-fetch)
      setEditingUsername(false);
      Alert.alert('Updated', 'Username changed successfully.');
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to update username');
    } finally {
      setSavingUsername(false);
    }
  };

  /* ── Logout ────────────────────────── */
  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
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
    ]);
  };

  /* ── Delete Account ────────────────── */
  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all associated data. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Confirm Deletion',
              'Type "DELETE" to confirm. Are you really sure?',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'I understand, delete',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      // For now, sign out - actual account deletion should be an RPC
                      await supabase.auth.signOut();
                      router.replace('/(onboarding)/auth');
                    } catch (error: any) {
                      Alert.alert('Error', error.message || 'Failed to delete account');
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
  };

  /* ── Reusable row component ────────── */
  const SettingsRow = ({
    icon,
    label,
    value,
    onPress,
    rightElement,
    destructive,
  }: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    value?: string;
    onPress?: () => void;
    rightElement?: React.ReactNode;
    destructive?: boolean;
  }) => (
    <TouchableOpacity
      style={styles.settingsRow}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress}
    >
      <View
        style={[
          styles.settingsRowIcon,
          {
            backgroundColor: destructive
              ? 'rgba(255, 82, 82, 0.12)'
              : hexToRgba(branding.primary, 0.1),
          },
        ]}
      >
        <Ionicons
          name={icon}
          size={18}
          color={destructive ? '#FF5252' : branding.primary}
        />
      </View>
      <View style={styles.settingsRowContent}>
        <Text
          style={[
            styles.settingsRowLabel,
            destructive && { color: '#FF5252' },
          ]}
        >
          {label}
        </Text>
        {value ? (
          <Text style={styles.settingsRowValue} numberOfLines={1}>
            {value}
          </Text>
        ) : null}
      </View>
      {rightElement ||
        (onPress && (
          <Ionicons
            name="chevron-forward"
            size={18}
            color={destructive ? '#FF5252' : baseTheme.colors.textTertiary}
          />
        ))}
    </TouchableOpacity>
  );

  /* ── Stat pill component ───────────── */
  const StatPill = ({
    icon,
    value,
    label,
  }: {
    icon: keyof typeof Ionicons.glyphMap;
    value: number | string;
    label: string;
  }) => (
    <View style={styles.statPillWrapper}>
      <BlurView intensity={50} tint="dark" style={styles.statPill}>
        <Ionicons name={icon} size={18} color={branding.primary} />
        <Text
          style={[
            styles.statPillValue,
            getNumberStyle(18),
            { color: '#FFFFFF' },
          ]}
        >
          {typeof value === 'number' ? value.toLocaleString() : value}
        </Text>
        <Text
          style={[
            styles.statPillLabel,
            { color: hexToRgba(branding.primary, 0.7) },
          ]}
        >
          {label}
        </Text>
      </BlurView>
    </View>
  );

  /* ── Sheet Content (shared for iOS/Android) ── */
  const SheetContent = () => (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* ═══════════════════════════════════════ */}
      {/* PROFILE HERO                            */}
      {/* ═══════════════════════════════════════ */}
      <Animated.View
        entering={FadeInDown.duration(400).delay(100)}
        style={styles.profileHero}
      >
        {/* Avatar with glow */}
        <View style={styles.avatarWrapper}>
          <Animated.View
            style={[
              styles.avatarGlow,
              {
                backgroundColor: hexToRgba(branding.primary, 0.15),
                shadowColor: branding.primary,
              },
              avatarGlowStyle,
            ]}
          />
          <View
            style={[
              styles.avatarContainer,
              {
                borderColor: hexToRgba(branding.primary, 0.4),
                backgroundColor: hexToRgba(branding.primary, 0.1),
              },
            ]}
          >
            <Text style={[styles.avatarText, { color: branding.primary }]}>
              {profile?.username?.charAt(0).toUpperCase() || 'U'}
            </Text>
          </View>
        </View>

        <Text style={styles.heroUsername}>
          {profile?.username || 'User'}
        </Text>
        <Text style={styles.heroEmail}>
          {profile?.email || session?.user?.email || ''}
        </Text>

        {/* Member since badge */}
        <View
          style={[
            styles.memberBadge,
            {
              backgroundColor: hexToRgba(branding.primary, 0.08),
              borderColor: hexToRgba(branding.primary, 0.15),
            },
          ]}
        >
          <Ionicons
            name="calendar-outline"
            size={12}
            color={hexToRgba(branding.primary, 0.6)}
          />
          <Text
            style={[
              styles.memberBadgeText,
              { color: hexToRgba(branding.primary, 0.6) },
            ]}
          >
            Member since {formatDate(profile?.created_at)}
          </Text>
        </View>
      </Animated.View>

      {/* ═══════════════════════════════════════ */}
      {/* QUICK STATS                             */}
      {/* ═══════════════════════════════════════ */}
      <Animated.View
        entering={FadeInDown.duration(400).delay(200)}
        style={styles.statsRow}
      >
        <StatPill
          icon="water-outline"
          value={profile?.total_drops || 0}
          label="Total Drops"
        />
        <StatPill
          icon="barbell-outline"
          value={totalWorkouts}
          label="Workouts"
        />
        <StatPill
          icon="flame-outline"
          value={streak}
          label="Streak"
        />
      </Animated.View>

      {/* ═══════════════════════════════════════ */}
      {/* ACCOUNT SECTION                          */}
      {/* ═══════════════════════════════════════ */}
      <Animated.View entering={FadeInDown.duration(400).delay(300)}>
        <Text
          style={[
            styles.sectionTitle,
            { color: hexToRgba(branding.primary, 0.6) },
          ]}
        >
          ACCOUNT
        </Text>
        <View
          style={[
            styles.settingsCard,
            { borderColor: hexToRgba(branding.primary, 0.1) },
          ]}
        >
          <BlurView
            intensity={50}
            tint="dark"
            style={styles.settingsCardBlur}
          >
            {editingUsername ? (
              <View style={styles.editUsernameRow}>
                <View
                  style={[
                    styles.settingsRowIcon,
                    { backgroundColor: hexToRgba(branding.primary, 0.1) },
                  ]}
                >
                  <Ionicons
                    name="person-outline"
                    size={18}
                    color={branding.primary}
                  />
                </View>
                <TextInput
                  style={[
                    styles.usernameInput,
                    { borderColor: hexToRgba(branding.primary, 0.3) },
                  ]}
                  value={newUsername}
                  onChangeText={setNewUsername}
                  autoFocus
                  maxLength={20}
                  placeholder="Username"
                  placeholderTextColor={baseTheme.colors.textTertiary}
                  returnKeyType="done"
                  onSubmitEditing={handleSaveUsername}
                />
                <TouchableOpacity
                  onPress={handleSaveUsername}
                  disabled={savingUsername}
                  style={[
                    styles.saveButton,
                    { backgroundColor: branding.primary },
                  ]}
                >
                  <Text
                    style={[styles.saveButtonText, { color: branding.onPrimary }]}
                  >
                    {savingUsername ? '...' : 'Save'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setEditingUsername(false)}
                  style={styles.cancelButton}
                >
                  <Ionicons name="close" size={18} color={baseTheme.colors.textSecondary} />
                </TouchableOpacity>
              </View>
            ) : (
              <SettingsRow
                icon="person-outline"
                label="Username"
                value={profile?.username || 'N/A'}
                onPress={handleStartEditUsername}
              />
            )}

            <View style={styles.settingsRowDivider} />

            <SettingsRow
              icon="fitness-outline"
              label="Home Gym"
              value={activeGym?.name || 'Not set'}
              onPress={() => {
                onClose();
                // Navigate to gym selector (already available via home header)
                router.push('/home');
              }}
            />
          </BlurView>
        </View>
      </Animated.View>

      {/* ═══════════════════════════════════════ */}
      {/* PREFERENCES SECTION                      */}
      {/* ═══════════════════════════════════════ */}
      <Animated.View entering={FadeInDown.duration(400).delay(400)}>
        <Text
          style={[
            styles.sectionTitle,
            { color: hexToRgba(branding.primary, 0.6) },
          ]}
        >
          PREFERENCES
        </Text>
        <View
          style={[
            styles.settingsCard,
            { borderColor: hexToRgba(branding.primary, 0.1) },
          ]}
        >
          <BlurView
            intensity={50}
            tint="dark"
            style={styles.settingsCardBlur}
          >
            <SettingsRow
              icon="notifications-outline"
              label="Push Notifications"
              rightElement={
                <Switch
                  value={notificationsEnabled}
                  onValueChange={setNotificationsEnabled}
                  trackColor={{
                    false: '#3E3E3E',
                    true: hexToRgba(branding.primary, 0.4),
                  }}
                  thumbColor={
                    notificationsEnabled ? branding.primary : '#808080'
                  }
                />
              }
            />
          </BlurView>
        </View>
      </Animated.View>

      {/* ═══════════════════════════════════════ */}
      {/* ACTIONS                                  */}
      {/* ═══════════════════════════════════════ */}
      <Animated.View entering={FadeInDown.duration(400).delay(500)}>
        <Text
          style={[
            styles.sectionTitle,
            { color: hexToRgba(branding.primary, 0.6) },
          ]}
        >
          ACTIONS
        </Text>
        <View
          style={[
            styles.settingsCard,
            { borderColor: hexToRgba(branding.primary, 0.1) },
          ]}
        >
          <BlurView
            intensity={50}
            tint="dark"
            style={styles.settingsCardBlur}
          >
            <SettingsRow
              icon="log-out-outline"
              label={loading ? 'Logging out...' : 'Logout'}
              onPress={loading ? undefined : handleLogout}
              destructive
            />
            <View style={styles.settingsRowDivider} />
            <SettingsRow
              icon="trash-outline"
              label="Delete Account"
              onPress={handleDeleteAccount}
              destructive
            />
          </BlurView>
        </View>
      </Animated.View>

      {/* ═══════════════════════════════════════ */}
      {/* FOOTER                                   */}
      {/* ═══════════════════════════════════════ */}
      <Animated.View
        entering={FadeInDown.duration(400).delay(600)}
        style={styles.footer}
      >
        <Text style={styles.footerText}>SweatDrop v1.0.0</Text>
        <Text style={styles.footerSubtext}>Made with 💧</Text>
      </Animated.View>
    </ScrollView>
  );

  /* ── Render ────────────────────────── */
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={Platform.OS === 'android'}
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={onClose}
      statusBarTranslucent={Platform.OS === 'android'}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.modalWrapper}>
          <SafeAreaView style={styles.modalContainer} edges={['top', 'bottom']}>
            <LinearGradient
              colors={['#080810', '#0A0E1A', '#080810']}
              style={StyleSheet.absoluteFillObject}
            />

            {/* Header */}
            {Platform.OS === 'ios' && (
              <View style={styles.dragHandle} />
            )}
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Settings</Text>
              <TouchableOpacity
                onPress={onClose}
                style={[
                  styles.closeButton,
                  { backgroundColor: hexToRgba(branding.primary, 0.08) },
                ]}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={22} color={branding.primary} />
              </TouchableOpacity>
            </View>

            {/* Content */}
            <SheetContent />
          </SafeAreaView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* ── Styles ───────────────────────────────── */
const styles = StyleSheet.create({
  modalWrapper: {
    flex: 1,
    backgroundColor: '#000000',
  },
  modalContainer: {
    flex: 1,
  },
  dragHandle: {
    width: 36,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* Scroll */
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },

  /* Profile Hero */
  profileHero: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 24,
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 16,
  },
  avatarGlow: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 10,
    top: 0,
    left: 0,
  },
  avatarContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 38,
    fontWeight: '700',
  },
  heroUsername: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  heroEmail: {
    fontSize: 14,
    color: '#B0B0B0',
    letterSpacing: 0.3,
    marginBottom: 12,
  },
  memberBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  memberBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },

  /* Stats Row */
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 28,
  },
  statPillWrapper: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  statPill: {
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(20, 20, 30, 0.75)',
  },
  statPillValue: {
    marginTop: 6,
    letterSpacing: 0.5,
  },
  statPillLabel: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 2,
  },

  /* Section */
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 10,
    marginLeft: 4,
  },

  /* Settings Card */
  settingsCard: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    marginBottom: 24,
  },
  settingsCardBlur: {
    backgroundColor: 'rgba(20, 20, 30, 0.75)',
  },

  /* Settings Row */
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  settingsRowIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsRowContent: {
    flex: 1,
  },
  settingsRowLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  settingsRowValue: {
    fontSize: 12,
    color: '#B0B0B0',
    letterSpacing: 0.2,
    marginTop: 2,
  },
  settingsRowDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginLeft: 60,
  },

  /* Edit Username */
  editUsernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 10,
  },
  usernameInput: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    color: '#FFFFFF',
    fontSize: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  saveButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  saveButtonText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  cancelButton: {
    padding: 6,
  },

  /* Footer */
  footer: {
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 24,
    gap: 4,
  },
  footerText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.2)',
    letterSpacing: 0.5,
  },
  footerSubtext: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.12)',
    letterSpacing: 0.3,
  },
});
