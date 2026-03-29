import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Switch,
  RefreshControl,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import i18n from '@/lib/i18n';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { useGymStore } from '@/lib/stores/useGymStore';
import { useAuthStore } from '@/lib/stores/authStore';
import { theme, fontStyles, getNumberStyle } from '@/lib/theme';
import BackButton from '@/components/BackButton';
import { useBranding } from '@/lib/contexts/ThemeContext';
import { getPrivacyUrl, getTermsUrl, openLegalUrl } from '@/lib/legalUrls';

function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return hex;
  return `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${alpha})`;
}

interface ProfileData {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  email: string | null;
  total_drops: number;
  available_drops: number;
  weekly_drops: number;
  monthly_drops: number;
  streak_days: number;
  is_newcomer: boolean;
  role: string;
  home_gym_id: string | null;
  expo_push_token: string | null;
  created_at: string;
  updated_at: string;
  gender: string | null;
  weight_kg: number | null;
  height_cm: number | null;
  date_of_birth: string | null;
  fitness_goal: string | null;
  onboarding_completed: boolean;
}

export default function SettingsScreen() {
  const { t } = useTranslation('settings');
  const { t: tOnboarding } = useTranslation('onboarding');
  const { session } = useSession();
  const branding = useBranding();
  const router = useRouter();
  const { activeGym } = useGymStore();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [editingUsername, setEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [savingUsername, setSavingUsername] = useState(false);

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const loadProfile = useCallback(async () => {
    if (!session?.user) return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (error) {
        console.error('[Settings] Error loading profile:', error);
        return;
      }
      setProfile(data as ProfileData);
    } catch (err) {
      console.error('[Settings] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadProfile();
    setRefreshing(false);
  }, [loadProfile]);

  /* ── Username edit ─────────────────── */
  const handleStartEditUsername = () => {
    setNewUsername(profile?.username || '');
    setEditingUsername(true);
  };

  const handleSaveUsername = async () => {
    if (!newUsername.trim() || !session?.user) return;
    setSavingUsername(true);
    const trimmed = newUsername.trim();

    if (trimmed === profile?.username) {
      setEditingUsername(false);
      setSavingUsername(false);
      return;
    }

    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', trimmed)
      .neq('id', session.user.id)
      .limit(1);

    if (existing && existing.length > 0) {
      Alert.alert(t('error') || 'Error', t('usernameTaken') || 'This username is already taken.');
      setSavingUsername(false);
      return;
    }

    const { error } = await supabase
      .from('profiles')
      .update({ username: trimmed, updated_at: new Date().toISOString() })
      .eq('id', session.user.id);

    if (error) {
      Alert.alert(t('error') || 'Error', error.message);
    } else {
      setProfile((prev: any) => (prev ? { ...prev, username: trimmed } : prev));
      setEditingUsername(false);
    }
    setSavingUsername(false);
  };

  /* ── Logout ────────────────────────── */
  const handleLogout = () => {
    Alert.alert(
      t('logoutTitle') || 'Log Out',
      t('logoutConfirm') || 'Are you sure you want to log out?',
      [
        { text: t('cancel') || 'Cancel', style: 'cancel' },
        {
          text: t('logout') || 'Log Out',
          style: 'destructive',
          onPress: async () => {
            try {
              const { signOut } = useAuthStore.getState();
              await signOut();
              if (router.canDismiss()) router.dismissAll();
              router.replace('/(onboarding)/welcome');
            } catch (error: any) {
              Alert.alert(t('error') || 'Error', error.message || 'Failed to log out');
            }
          },
        },
      ],
    );
  };

  /* ── Delete Account ────────────────── */
  const [isDeleting, setIsDeleting] = useState(false);

  const executeAccountDeletion = async () => {
    setIsDeleting(true);
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (!authSession?.access_token) {
        Alert.alert(t('error') || 'Error', t('sessionExpired') || 'Session expired. Please sign in again.');
        setIsDeleting(false);
        return;
      }

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const response = await fetch(
        `${supabaseUrl}/functions/v1/delete-account`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authSession.access_token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        Alert.alert(
          t('error') || 'Error',
          errorData.error || t('failedDelete') || 'Failed to delete account. Please try again.',
        );
        setIsDeleting(false);
        return;
      }

      const { signOut } = useAuthStore.getState();
      await signOut();
      if (router.canDismiss()) router.dismissAll();
      router.replace('/(onboarding)/welcome');
    } catch (error: any) {
      Alert.alert(
        t('error') || 'Error',
        error.message || 'Failed to delete account',
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      t('deleteAccountTitle') || 'Delete Account',
      t('deleteAccountConfirm') ||
        'This will permanently delete your account and all associated data. This action cannot be undone.',
      [
        { text: t('cancel') || 'Cancel', style: 'cancel' },
        {
          text: t('deleteAccount') || 'Delete',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              t('deleteConfirm2Title') || 'Confirm Deletion',
              t('deleteConfirm2') || 'Are you really sure? This cannot be undone.',
              [
                { text: t('cancel') || 'Cancel', style: 'cancel' },
                {
                  text: t('yesDelete') || 'I understand, delete',
                  style: 'destructive',
                  onPress: executeAccountDeletion,
                },
              ],
            );
          },
        },
      ],
    );
  };

  /* ── Body data helpers ─────────────── */
  const formatGender = (g: string | null) => {
    if (!g) return null;
    if (g === 'male') return t('male') || 'Male';
    if (g === 'female') return t('female') || 'Female';
    return g;
  };

  const formatWeight = (w: number | null) => {
    if (!w) return null;
    return `${w} kg`;
  };

  const formatHeight = (h: number | null) => {
    if (!h) return null;
    return `${h} cm`;
  };

  const formatDateOfBirth = (dob: string | null) => {
    if (!dob) return null;
    const d = new Date(dob);
    const age = Math.floor(
      (Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000),
    );
    return `${d.toLocaleDateString(i18n.language === 'sr' ? 'sr-RS' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })} (${age})`;
  };

  const formatFitnessGoal = (goal: string | null) => {
    if (!goal) return null;
    const goalLabels: Record<string, string> = {
      weight_loss: t('goalWeightLoss') || 'Weight Loss',
      strength: t('goalStrength') || 'Strength',
      cardio: t('goalCardio') || 'Cardio',
      health: t('goalHealth') || 'General Health',
    };
    return goalLabels[goal] || goal;
  };

  const hasIncompleteBodyData =
    !profile?.gender ||
    !profile?.weight_kg ||
    !profile?.height_cm ||
    !profile?.date_of_birth ||
    !profile?.fitness_goal;

  const appVersion = Constants.expoConfig?.version || '1.0.0';
  const currentLang = i18n.language;

  if (loading && !profile) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={['#000000', '#080A14', '#000000']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <SafeAreaView style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={branding.primary} />
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#000000', '#080A14', '#000000']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        {/* ═══════════════════════════════════════ */}
        {/* HEADER                                  */}
        {/* ═══════════════════════════════════════ */}
        <View style={styles.header}>
          <BackButton />
          <Text style={styles.headerTitle}>{t('title') || 'Settings'}</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={branding.primary}
              progressBackgroundColor="#111"
            />
          }
        >
          {/* ═══════════════════════════════════════ */}
          {/* ACCOUNT SECTION                         */}
          {/* ═══════════════════════════════════════ */}
          <Animated.View entering={FadeInDown.delay(0).duration(500)}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>
              {t('accountSection') || 'ACCOUNT'}
            </Text>
            <View style={[styles.card, { borderColor: hexToRgba(branding.primary, 0.12) }]}>
              <BlurView intensity={40} tint="dark" style={styles.cardBlur}>
                {/* Email row (read-only) */}
                <View style={styles.row}>
                  <View style={[styles.rowIcon, { backgroundColor: hexToRgba(branding.primary, 0.1) }]}>
                    <Ionicons name="mail-outline" size={18} color={branding.primary} />
                  </View>
                  <View style={styles.rowContent}>
                    <Text style={styles.rowLabel}>{t('email') || 'Email'}</Text>
                    <Text style={styles.rowValue} numberOfLines={1}>
                      {session?.user?.email || '—'}
                    </Text>
                  </View>
                </View>

                <View style={styles.divider} />

                {/* Username row with inline edit */}
                {editingUsername ? (
                  <View style={styles.editUsernameRow}>
                    <View style={[styles.rowIcon, { backgroundColor: hexToRgba(branding.primary, 0.1) }]}>
                      <Ionicons name="person-outline" size={18} color={branding.primary} />
                    </View>
                    <TextInput
                      style={[styles.usernameInput, { borderColor: hexToRgba(branding.primary, 0.3) }]}
                      value={newUsername}
                      onChangeText={setNewUsername}
                      autoFocus
                      maxLength={20}
                      placeholder={t('usernamePlaceholder') || 'Username'}
                      placeholderTextColor={theme.colors.textTertiary}
                      returnKeyType="done"
                      onSubmitEditing={handleSaveUsername}
                    />
                    <TouchableOpacity
                      onPress={handleSaveUsername}
                      disabled={savingUsername}
                      style={[styles.saveButton, { backgroundColor: branding.primary }]}
                    >
                      <Text style={[styles.saveButtonText, { color: branding.onPrimary }]}>
                        {savingUsername ? '...' : t('save') || 'Save'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setEditingUsername(false)}
                      style={styles.cancelButton}
                    >
                      <Ionicons name="close" size={18} color={theme.colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.row} onPress={handleStartEditUsername} activeOpacity={0.7}>
                    <View style={[styles.rowIcon, { backgroundColor: hexToRgba(branding.primary, 0.1) }]}>
                      <Ionicons name="person-outline" size={18} color={branding.primary} />
                    </View>
                    <View style={styles.rowContent}>
                      <Text style={styles.rowLabel}>{t('username') || 'Username'}</Text>
                      <Text style={styles.rowValue} numberOfLines={1}>
                        {profile?.username || '—'}
                      </Text>
                    </View>
                    <Ionicons name="pencil-outline" size={16} color="rgba(255,255,255,0.2)" />
                  </TouchableOpacity>
                )}

                <View style={styles.divider} />

                {/* Avatar row */}
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => router.push('/(onboarding)/avatar?edit=true')}
                  activeOpacity={0.7}
                >
                  <View style={[styles.rowIcon, { backgroundColor: hexToRgba(branding.primary, 0.1) }]}>
                    <Ionicons name="happy-outline" size={18} color={branding.primary} />
                  </View>
                  <View style={styles.rowContent}>
                    <Text style={styles.rowLabel}>{t('avatar') || 'Avatar'}</Text>
                    <Text style={styles.rowValue} numberOfLines={1}>
                      {profile?.avatar_url ? (t('changeAvatar') || 'Change avatar') : (t('setAvatar') || 'Set avatar')}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.2)" />
                </TouchableOpacity>
              </BlurView>
            </View>
          </Animated.View>

          {/* ═══════════════════════════════════════ */}
          {/* BODY DATA SECTION                       */}
          {/* ═══════════════════════════════════════ */}
          <Animated.View entering={FadeInDown.delay(100).duration(500)}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, styles.sectionTitleInRow, { color: theme.colors.textSecondary }]}>
                {t('bodyDataSection') || 'BODY DATA'}
              </Text>
              <TouchableOpacity
                style={[styles.editPill, { backgroundColor: hexToRgba(branding.primary, 0.1), borderColor: hexToRgba(branding.primary, 0.2) }]}
                onPress={() => router.push('/(onboarding)/step-gender?edit=true')}
                activeOpacity={0.7}
              >
                <Ionicons name="create-outline" size={12} color={branding.primary} />
                <Text style={[styles.editPillText, { color: branding.primary }]}>
                  {hasIncompleteBodyData ? (t('complete') || 'Complete') : (t('edit') || 'Edit')}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.card, { borderColor: hexToRgba(branding.primary, 0.12) }]}>
              <BlurView intensity={40} tint="dark" style={styles.cardBlur}>
                {/* Gender */}
                <View style={styles.row}>
                  <View style={[styles.rowIcon, { backgroundColor: hexToRgba(branding.primary, 0.1) }]}>
                    <Ionicons name="male-female-outline" size={18} color={branding.primary} />
                  </View>
                  <View style={styles.rowContent}>
                    <Text style={styles.rowLabel}>{t('gender') || 'Gender'}</Text>
                    {profile?.gender && (
                      <Text style={styles.rowValue}>{formatGender(profile.gender)}</Text>
                    )}
                  </View>
                  {!profile?.gender && (
                    <Text style={[styles.rowMissing, { color: theme.colors.textTertiary }]}>—</Text>
                  )}
                </View>

                <View style={styles.divider} />

                {/* Weight */}
                <View style={styles.row}>
                  <View style={[styles.rowIcon, { backgroundColor: hexToRgba(branding.primary, 0.1) }]}>
                    <Ionicons name="scale-outline" size={18} color={branding.primary} />
                  </View>
                  <View style={styles.rowContent}>
                    <Text style={styles.rowLabel}>{t('weight') || 'Weight'}</Text>
                    {profile?.weight_kg && (
                      <Text style={[styles.rowValue, getNumberStyle(12)]}>{formatWeight(profile.weight_kg)}</Text>
                    )}
                  </View>
                  {!profile?.weight_kg && (
                    <Text style={[styles.rowMissing, { color: theme.colors.textTertiary }]}>—</Text>
                  )}
                </View>

                <View style={styles.divider} />

                {/* Height */}
                <View style={styles.row}>
                  <View style={[styles.rowIcon, { backgroundColor: hexToRgba(branding.primary, 0.1) }]}>
                    <Ionicons name="resize-outline" size={18} color={branding.primary} />
                  </View>
                  <View style={styles.rowContent}>
                    <Text style={styles.rowLabel}>{t('height') || 'Height'}</Text>
                    {profile?.height_cm && (
                      <Text style={[styles.rowValue, getNumberStyle(12)]}>{formatHeight(profile.height_cm)}</Text>
                    )}
                  </View>
                  {!profile?.height_cm && (
                    <Text style={[styles.rowMissing, { color: theme.colors.textTertiary }]}>—</Text>
                  )}
                </View>

                <View style={styles.divider} />

                {/* Date of birth */}
                <View style={styles.row}>
                  <View style={[styles.rowIcon, { backgroundColor: hexToRgba(branding.primary, 0.1) }]}>
                    <Ionicons name="calendar-outline" size={18} color={branding.primary} />
                  </View>
                  <View style={styles.rowContent}>
                    <Text style={styles.rowLabel}>{t('dateOfBirth') || 'Date of Birth'}</Text>
                    {profile?.date_of_birth && (
                      <Text style={styles.rowValue}>{formatDateOfBirth(profile.date_of_birth)}</Text>
                    )}
                  </View>
                  {!profile?.date_of_birth && (
                    <Text style={[styles.rowMissing, { color: theme.colors.textTertiary }]}>—</Text>
                  )}
                </View>

                <View style={styles.divider} />

                {/* Fitness goal */}
                <View style={styles.row}>
                  <View style={[styles.rowIcon, { backgroundColor: hexToRgba(branding.primary, 0.1) }]}>
                    <Ionicons name="trophy-outline" size={18} color={branding.primary} />
                  </View>
                  <View style={styles.rowContent}>
                    <Text style={styles.rowLabel}>{t('fitnessGoal') || 'Fitness Goal'}</Text>
                    {profile?.fitness_goal && (
                      <Text style={styles.rowValue}>{formatFitnessGoal(profile.fitness_goal)}</Text>
                    )}
                  </View>
                  {!profile?.fitness_goal && (
                    <Text style={[styles.rowMissing, { color: theme.colors.textTertiary }]}>—</Text>
                  )}
                </View>
              </BlurView>
            </View>
          </Animated.View>

          {/* ═══════════════════════════════════════ */}
          {/* GYM SECTION                             */}
          {/* ═══════════════════════════════════════ */}
          <Animated.View entering={FadeInDown.delay(200).duration(500)}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>
              {t('gymSection') || 'GYM'}
            </Text>
            <View style={[styles.card, { borderColor: hexToRgba(branding.primary, 0.12) }]}>
              <BlurView intensity={40} tint="dark" style={styles.cardBlur}>
                {/* Home gym */}
                <View style={styles.row}>
                  <View style={[styles.rowIcon, { backgroundColor: hexToRgba(branding.primary, 0.1) }]}>
                    <Ionicons name="home-outline" size={18} color={branding.primary} />
                  </View>
                  <View style={styles.rowContent}>
                    <Text style={styles.rowLabel}>{t('homeGym') || 'Home Gym'}</Text>
                    <Text style={styles.rowValue} numberOfLines={1}>
                      {activeGym?.name || (t('notSet') || 'Not set')}
                    </Text>
                  </View>
                </View>

                <View style={styles.divider} />

                {/* Browse gyms */}
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => router.push('/gyms')}
                  activeOpacity={0.7}
                >
                  <View style={[styles.rowIcon, { backgroundColor: hexToRgba(branding.primary, 0.1) }]}>
                    <Ionicons name="fitness-outline" size={18} color={branding.primary} />
                  </View>
                  <View style={styles.rowContent}>
                    <Text style={styles.rowLabel}>{t('browseGyms') || 'Browse Gyms'}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.2)" />
                </TouchableOpacity>
              </BlurView>
            </View>
          </Animated.View>

          {/* ═══════════════════════════════════════ */}
          {/* PREFERENCES SECTION                     */}
          {/* ═══════════════════════════════════════ */}
          <Animated.View entering={FadeInDown.delay(300).duration(500)}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>
              {t('preferencesSection') || 'PREFERENCES'}
            </Text>
            <View style={[styles.card, { borderColor: hexToRgba(branding.primary, 0.12) }]}>
              <BlurView intensity={40} tint="dark" style={styles.cardBlur}>
                {/* Language toggle */}
                <View style={styles.row}>
                  <View style={[styles.rowIcon, { backgroundColor: hexToRgba(branding.primary, 0.1) }]}>
                    <Ionicons name="language-outline" size={18} color={branding.primary} />
                  </View>
                  <View style={styles.rowContent}>
                    <Text style={styles.rowLabel}>{t('language') || 'Language'}</Text>
                  </View>
                  <View style={styles.languageToggle}>
                    <TouchableOpacity
                      style={[
                        styles.langButton,
                        currentLang === 'sr' && [
                          styles.langButtonActive,
                          { backgroundColor: hexToRgba(branding.primary, 0.15), borderColor: branding.primary },
                        ],
                      ]}
                      onPress={() => i18n.changeLanguage('sr')}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.langButtonText, currentLang === 'sr' && { color: branding.primary }]}>
                        SR
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.langButton,
                        currentLang === 'en' && [
                          styles.langButtonActive,
                          { backgroundColor: hexToRgba(branding.primary, 0.15), borderColor: branding.primary },
                        ],
                      ]}
                      onPress={() => i18n.changeLanguage('en')}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.langButtonText, currentLang === 'en' && { color: branding.primary }]}>
                        EN
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.divider} />

                {/* Notifications toggle */}
                <View style={styles.row}>
                  <View style={[styles.rowIcon, { backgroundColor: hexToRgba(branding.primary, 0.1) }]}>
                    <Ionicons name="notifications-outline" size={18} color={branding.primary} />
                  </View>
                  <View style={styles.rowContent}>
                    <Text style={styles.rowLabel}>{t('notifications') || 'Notifications'}</Text>
                  </View>
                  <Switch
                    value={notificationsEnabled}
                    onValueChange={setNotificationsEnabled}
                    trackColor={{
                      false: '#3E3E3E',
                      true: hexToRgba(branding.primary, 0.4),
                    }}
                    thumbColor={notificationsEnabled ? branding.primary : '#808080'}
                  />
                </View>

                <View style={styles.divider} />

                {/* Happy Hours */}
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => router.push('/happy-hours')}
                  activeOpacity={0.7}
                >
                  <View style={[styles.rowIcon, { backgroundColor: 'rgba(255, 215, 0, 0.1)' }]}>
                    <Ionicons name="flash-outline" size={18} color="#FFD700" />
                  </View>
                  <View style={styles.rowContent}>
                    <Text style={styles.rowLabel}>{t('happyHours') || 'Happy Hours'}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.2)" />
                </TouchableOpacity>
              </BlurView>
            </View>
          </Animated.View>

          {/* ═══════════════════════════════════════ */}
          {/* LEGAL SECTION                           */}
          {/* ═══════════════════════════════════════ */}
          <Animated.View entering={FadeInDown.delay(400).duration(500)}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textSecondary }]}>
              {t('legalSection') || 'LEGAL'}
            </Text>
            <View style={[styles.card, { borderColor: hexToRgba(branding.primary, 0.12) }]}>
              <BlurView intensity={40} tint="dark" style={styles.cardBlur}>
                {/* Terms of Service */}
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => {
                    const url = getTermsUrl();
                    if (!url) {
                      Alert.alert(
                        t('legalLinkUnavailableTitle') || 'Unavailable',
                        t('legalLinkUnavailableBody') || 'This link is not yet available.',
                      );
                      return;
                    }
                    void openLegalUrl(url, {
                      onInvalid: () =>
                        Alert.alert(
                          t('legalLinkUnavailableTitle') || 'Unavailable',
                          t('legalLinkUnavailableBody') || 'This link is not yet available.',
                        ),
                    });
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.rowIcon, { backgroundColor: hexToRgba(branding.primary, 0.1) }]}>
                    <Ionicons name="document-text-outline" size={18} color={branding.primary} />
                  </View>
                  <View style={styles.rowContent}>
                    <Text style={styles.rowLabel}>{t('termsOfService') || 'Terms of Service'}</Text>
                  </View>
                  <Ionicons name="open-outline" size={16} color="rgba(255,255,255,0.2)" />
                </TouchableOpacity>

                <View style={styles.divider} />

                {/* Privacy Policy */}
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => {
                    const url = getPrivacyUrl();
                    if (!url) {
                      Alert.alert(
                        t('legalLinkUnavailableTitle') || 'Unavailable',
                        t('legalLinkUnavailableBody') || 'This link is not yet available.',
                      );
                      return;
                    }
                    void openLegalUrl(url, {
                      onInvalid: () =>
                        Alert.alert(
                          t('legalLinkUnavailableTitle') || 'Unavailable',
                          t('legalLinkUnavailableBody') || 'This link is not yet available.',
                        ),
                    });
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.rowIcon, { backgroundColor: hexToRgba(branding.primary, 0.1) }]}>
                    <Ionicons name="shield-checkmark-outline" size={18} color={branding.primary} />
                  </View>
                  <View style={styles.rowContent}>
                    <Text style={styles.rowLabel}>{t('privacyPolicy') || 'Privacy Policy'}</Text>
                  </View>
                  <Ionicons name="open-outline" size={16} color="rgba(255,255,255,0.2)" />
                </TouchableOpacity>
              </BlurView>
            </View>
          </Animated.View>

          {/* ═══════════════════════════════════════ */}
          {/* DANGER ZONE SECTION                     */}
          {/* ═══════════════════════════════════════ */}
          <Animated.View entering={FadeInDown.delay(500).duration(500)}>
            <Text style={[styles.sectionTitle, { color: 'rgba(255, 82, 82, 0.7)' }]}>
              {t('dangerZone') || 'DANGER ZONE'}
            </Text>
            <View style={[styles.card, { borderColor: 'rgba(255, 82, 82, 0.15)' }]}>
              <BlurView intensity={40} tint="dark" style={styles.cardBlur}>
                {/* Logout */}
                <TouchableOpacity style={styles.row} onPress={handleLogout} activeOpacity={0.7}>
                  <View style={[styles.rowIcon, { backgroundColor: 'rgba(255, 145, 0, 0.1)' }]}>
                    <Ionicons name="log-out-outline" size={18} color={theme.colors.secondary} />
                  </View>
                  <View style={styles.rowContent}>
                    <Text style={[styles.rowLabel, { color: theme.colors.secondary }]}>
                      {t('logout') || 'Log Out'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="rgba(255, 145, 0, 0.3)" />
                </TouchableOpacity>

                <View style={styles.divider} />

                {/* Delete Account */}
                <TouchableOpacity style={styles.row} onPress={handleDeleteAccount} activeOpacity={0.7} disabled={isDeleting}>
                  <View style={[styles.rowIcon, { backgroundColor: 'rgba(255, 82, 82, 0.1)' }]}>
                    {isDeleting
                      ? <ActivityIndicator size="small" color="#FF5252" />
                      : <Ionicons name="trash-outline" size={18} color="#FF5252" />
                    }
                  </View>
                  <View style={styles.rowContent}>
                    <Text style={[styles.rowLabel, { color: '#FF5252' }]}>
                      {isDeleting ? (t('deleting') || 'Deleting...') : (t('deleteAccount') || 'Delete Account')}
                    </Text>
                  </View>
                  {!isDeleting && <Ionicons name="chevron-forward" size={16} color="rgba(255, 82, 82, 0.3)" />}
                </TouchableOpacity>
              </BlurView>
            </View>
          </Animated.View>

          {/* ═══════════════════════════════════════ */}
          {/* FOOTER                                  */}
          {/* ═══════════════════════════════════════ */}
          <Animated.View entering={FadeInDown.delay(600).duration(500)} style={styles.footer}>
            <Text style={styles.footerText}>SweatDrop v{appVersion}</Text>
          </Animated.View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  safeArea: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* ── Header ── */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  headerTitle: {
    ...fontStyles.heading,
    flex: 1,
    fontSize: 26,
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 1.5,
  },
  headerSpacer: {
    width: 40,
  },

  /* ── Scroll ── */
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
  },

  /* ── Section Title ── */
  sectionTitle: {
    ...fontStyles.heading,
    fontSize: 13,
    letterSpacing: 2,
    marginBottom: 10,
    marginLeft: 4,
    marginTop: theme.spacing.md,
  },

  /* ── Glass Card ── */
  card: {
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    marginBottom: theme.spacing.sm,
  },
  cardBlur: {
    backgroundColor: 'rgba(18, 18, 28, 0.78)',
  },

  /* ── Settings Row ── */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: theme.spacing.md,
    gap: 12,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowContent: {
    flex: 1,
  },
  rowLabel: {
    ...fontStyles.bodySemiBold,
    fontSize: 15,
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  rowValue: {
    ...fontStyles.body,
    fontSize: 12,
    color: '#B0B0B0',
    letterSpacing: 0.2,
    marginTop: 2,
  },
  rowMissing: {
    ...fontStyles.body,
    fontSize: 14,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginLeft: 60,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    marginTop: theme.spacing.md,
  },
  sectionTitleInRow: {
    marginBottom: 0,
    marginTop: 0,
  },
  editPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  editPillText: {
    ...fontStyles.bodyMedium,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  /* ── Edit Username ── */
  editUsernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: theme.spacing.md,
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
    ...fontStyles.heading,
    fontSize: 14,
    letterSpacing: 0.3,
  },
  cancelButton: {
    padding: 6,
  },

  /* ── Language Toggle ── */
  languageToggle: {
    flexDirection: 'row',
    gap: 6,
  },
  langButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  langButtonActive: {
    borderWidth: 1.5,
  },
  langButtonText: {
    ...fontStyles.heading,
    fontSize: 14,
    color: theme.colors.textSecondary,
  },

  /* ── Complete Profile Banner ── */
  completeBanner: {
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: theme.spacing.sm,
  },
  completeBannerBlur: {
    backgroundColor: 'rgba(18, 18, 28, 0.78)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: theme.spacing.md,
  },
  completeBannerText: {
    ...fontStyles.body,
    flex: 1,
    fontSize: 13,
    color: '#B0B0B0',
    lineHeight: 18,
  },
  completeBannerBtn: {
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  completeBannerBtnText: {
    ...fontStyles.heading,
    fontSize: 12,
  },

  /* ── Footer ── */
  footer: {
    alignItems: 'center',
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
  },
  footerText: {
    ...fontStyles.body,
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.2)',
    letterSpacing: 0.5,
  },
});
