import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, ZoomIn, useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useBranding } from '@/lib/contexts/ThemeContext';
import { theme, fontStyles, getNumberStyle } from '@/lib/theme';

function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(0, 229, 255, ${alpha})`;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const formatDistance = (m: number) => (m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1)}km`);

type CheckinStatus =
  | 'success'
  | 'already_checked_in'
  | 'too_far'
  | 'gym_not_found'
  | 'gym_suspended'
  | 'checkin_disabled'
  | 'cap_reached'
  | 'rate_limited'
  | 'fraud_blocked'
  | 'error';

export default function CheckinResultScreen() {
  const router = useRouter();
  const { t } = useTranslation('checkin');
  const branding = useBranding();
  const params = useLocalSearchParams<{
    status: string;
    dropsEarned?: string;
    gymName?: string;
    streakDays?: string;
    checkinDrops?: string;
    errorMessage?: string;
    distanceM?: string;
    radiusM?: string;
    isNewGym?: string;
  }>();

  const status = (params.status || 'error') as CheckinStatus;
  const dropsEarned = parseInt(params.dropsEarned || '0', 10);
  const gymName = params.gymName || '';
  const streakDays = parseInt(params.streakDays || '0', 10);
  const checkinDrops = parseInt(params.checkinDrops || '0', 10);
  const errorMessage = params.errorMessage || '';
  const distanceM = parseInt(params.distanceM || '0', 10);
  const radiusM = parseInt(params.radiusM || '0', 10);
  const isNewGym = params.isNewGym === '1';

  const [displayDrops, setDisplayDrops] = useState(0);
  const progressWidth = useSharedValue(0);
  const autoCloseRef = useRef<ReturnType<typeof setTimeout>>();

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%`,
  }));

  useEffect(() => {
    if (status === 'success') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      animateCounter(dropsEarned);
      startAutoClose(isNewGym ? 5000 : 3000);
    } else if (status === 'already_checked_in') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      startAutoClose(2500);
    }

    return () => {
      if (autoCloseRef.current) clearTimeout(autoCloseRef.current);
    };
  }, []);

  const animateCounter = (target: number) => {
    const duration = 800;
    const steps = 20;
    const interval = duration / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += target / steps;
      if (current >= target) {
        setDisplayDrops(target);
        clearInterval(timer);
      } else {
        setDisplayDrops(Math.round(current));
      }
    }, interval);
  };

  const startAutoClose = (ms: number) => {
    progressWidth.value = withTiming(100, {
      duration: ms,
      easing: Easing.linear,
    });
    autoCloseRef.current = setTimeout(() => {
      router.back();
    }, ms);
  };

  const handleClose = () => {
    if (autoCloseRef.current) clearTimeout(autoCloseRef.current);
    router.back();
  };

  const renderSuccess = () => (
    <>
      {isNewGym && gymName ? (
        <Animated.View entering={FadeInDown.delay(0).duration(500)} style={styles.textCenter}>
          <Text style={styles.welcomeLabel}>{t('welcomeTo')}</Text>
          <Text style={[styles.welcomeGymName, { color: branding.primary }]} numberOfLines={2} adjustsFontSizeToFit>
            {gymName}
          </Text>
          <View style={[styles.welcomeDivider, { backgroundColor: hexToRgba(branding.primary, 0.3) }]} />
          <Text style={styles.welcomeHint}>{t('gymSetAsHome')}</Text>
        </Animated.View>
      ) : null}

      <Animated.View entering={ZoomIn.delay(isNewGym ? 500 : 100).duration(400)} style={styles.iconContainer}>
        <View style={[styles.iconCircle, { backgroundColor: hexToRgba('#4CAF50', 0.15) }]}>
          <Ionicons name="checkmark-circle" size={80} color="#4CAF50" />
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(isNewGym ? 700 : 300).duration(400)} style={styles.textCenter}>
        <Text style={styles.mainTitle}>{t('success')}</Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(isNewGym ? 850 : 450).duration(400)} style={styles.textCenter}>
        <Text style={[styles.dropsText, getNumberStyle(56), { color: branding.primary }]}>
          +{displayDrops}
        </Text>
        <Text style={[styles.dropsLabel, { color: branding.primary }]}>DROPS</Text>
      </Animated.View>

      {streakDays > 1 && (
        <Animated.View entering={FadeInDown.delay(isNewGym ? 1000 : 600).duration(400)}>
          <View style={[styles.streakPill, { backgroundColor: 'rgba(255, 145, 0, 0.12)' }]}>
            <Text style={styles.streakText}>{t('streakDays', { streak: streakDays })}</Text>
          </View>
        </Animated.View>
      )}

      {!isNewGym && gymName ? (
        <Animated.View entering={FadeInDown.delay(700).duration(400)}>
          <Text style={styles.gymName}>{gymName}</Text>
        </Animated.View>
      ) : null}

      <Animated.View entering={FadeInDown.delay(isNewGym ? 1200 : 800).duration(400)} style={styles.progressBarContainer}>
        <View style={styles.progressBarBg}>
          <Animated.View style={[styles.progressBarFill, progressStyle, { backgroundColor: '#4CAF50' }]} />
        </View>
      </Animated.View>
    </>
  );

  const renderAlreadyCheckedIn = () => (
    <>
      <Animated.View entering={ZoomIn.delay(100).duration(400)} style={styles.iconContainer}>
        <View style={[styles.iconCircle, { backgroundColor: hexToRgba(branding.primary, 0.15) }]}>
          <Ionicons name="information-circle" size={80} color={branding.primary} />
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(300).duration(400)} style={styles.textCenter}>
        <Text style={styles.mainTitle}>{t('alreadyCheckedIn')}</Text>
        <Text style={styles.subtitle}>
          {t('comeBackTomorrow', { drops: checkinDrops })}
        </Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(500).duration(400)} style={styles.progressBarContainer}>
        <View style={styles.progressBarBg}>
          <Animated.View style={[styles.progressBarFill, progressStyle, { backgroundColor: branding.primary }]} />
        </View>
      </Animated.View>
    </>
  );

  const renderTooFar = () => (
    <>
      <Animated.View entering={ZoomIn.delay(100).duration(400)} style={styles.iconContainer}>
        <View style={[styles.iconCircle, { backgroundColor: 'rgba(255, 152, 0, 0.15)' }]}>
          <Text style={{ fontSize: 64 }}>📍</Text>
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(300).duration(400)} style={styles.textCenter}>
        <Text style={styles.mainTitle}>{t('tooFar')}</Text>
        <Text style={styles.subtitle}>
          {t('tooFarSub', {
            distance: formatDistance(distanceM),
            radius: `${radiusM}m`,
          })}
        </Text>
        <Text style={styles.hint}>{t('tooFarHint')}</Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(500).duration(400)} style={styles.buttonContainer}>
        <TouchableOpacity style={styles.closeButton} onPress={handleClose} activeOpacity={0.8}>
          <Text style={styles.closeButtonText}>{t('close')}</Text>
        </TouchableOpacity>
      </Animated.View>
    </>
  );

  const renderError = () => {
    const messages: Record<string, string> = {
      gym_not_found: t('gymNotFound'),
      gym_suspended: t('gymSuspended'),
      checkin_disabled: t('checkinDisabled'),
      cap_reached: t('capReached'),
      rate_limited: t('rateLimited'),
      fraud_blocked: t('fraudBlocked'),
      error: errorMessage || t('error'),
    };

    return (
      <>
        <Animated.View entering={ZoomIn.delay(100).duration(400)} style={styles.iconContainer}>
          <View style={[styles.iconCircle, { backgroundColor: 'rgba(244, 67, 54, 0.15)' }]}>
            <Ionicons name="close-circle" size={80} color="#F44336" />
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(300).duration(400)} style={styles.textCenter}>
          <Text style={styles.mainTitle}>{messages[status] || t('error')}</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(500).duration(400)} style={styles.buttonContainer}>
          <TouchableOpacity style={styles.closeButton} onPress={handleClose} activeOpacity={0.8}>
            <Text style={styles.closeButtonText}>{t('close')}</Text>
          </TouchableOpacity>
        </Animated.View>
      </>
    );
  };

  const gradientColors: Record<string, [string, string, string]> = {
    success: ['#000000', '#0A1A0F', '#000000'],
    already_checked_in: ['#000000', '#0A0E1A', '#000000'],
    too_far: ['#000000', '#1A150A', '#000000'],
    error: ['#000000', '#1A0A0A', '#000000'],
  };

  const bgColors = gradientColors[status] || gradientColors.error;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <LinearGradient
        colors={bgColors}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <View style={styles.content}>
        {status === 'success' && renderSuccess()}
        {status === 'already_checked_in' && renderAlreadyCheckedIn()}
        {status === 'too_far' && renderTooFar()}
        {!['success', 'already_checked_in', 'too_far'].includes(status) && renderError()}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  iconContainer: {
    marginBottom: 8,
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textCenter: {
    alignItems: 'center',
  },
  mainTitle: {
    ...fontStyles.heading,
    fontSize: 32,
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  dropsText: {
    fontSize: 56,
    textAlign: 'center',
    lineHeight: 64,
  },
  dropsLabel: {
    ...fontStyles.heading,
    fontSize: 24,
    textAlign: 'center',
  },
  streakPill: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    alignSelf: 'center',
  },
  streakText: {
    ...fontStyles.bodySemiBold,
    fontSize: 16,
    color: theme.colors.secondary,
    textAlign: 'center',
  },
  gymName: {
    ...fontStyles.body,
    fontSize: 15,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
  subtitle: {
    ...fontStyles.body,
    fontSize: 15,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  hint: {
    ...fontStyles.body,
    fontSize: 13,
    color: theme.colors.textTertiary,
    textAlign: 'center',
    marginTop: 12,
  },
  progressBarContainer: {
    width: '100%',
    marginTop: 24,
  },
  progressBarBg: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  buttonContainer: {
    width: '100%',
    marginTop: 24,
  },
  closeButton: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 50,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  closeButtonText: {
    ...fontStyles.heading,
    fontSize: 16,
    color: theme.colors.text,
  },
  welcomeLabel: {
    ...fontStyles.body,
    fontSize: 16,
    color: theme.colors.textSecondary,
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  welcomeGymName: {
    ...fontStyles.heading,
    fontSize: 28,
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 12,
  },
  welcomeDivider: {
    width: 40,
    height: 1.5,
    borderRadius: 1,
    marginBottom: 10,
  },
  welcomeHint: {
    ...fontStyles.body,
    fontSize: 13,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: 8,
  },
});
