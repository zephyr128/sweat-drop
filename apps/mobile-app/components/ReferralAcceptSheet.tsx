import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  Extrapolate,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { theme, fontStyles, hexToRgba } from '@/lib/theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const DISMISS_THRESHOLD = 80;
const OPEN_CONFIG = { duration: 340, easing: Easing.out(Easing.cubic) };
const CLOSE_CONFIG = { duration: 260, easing: Easing.in(Easing.cubic) };
const SNAP_BACK = { damping: 22, stiffness: 280, mass: 0.9 };

export interface ReferralAcceptSheetGym {
  id: string;
  name: string;
  city?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
}

interface Props {
  visible: boolean;
  code: string;
  gym: ReferralAcceptSheetGym;
  referrerName?: string | null;
  /** 'apply' = user already has this gym; 'join' = user needs to set home gym */
  mode?: 'apply' | 'join';
  onAccept: () => Promise<boolean>;
  onDecline: () => void;
}

type SheetState = 'confirm' | 'applying' | 'success' | 'error';

export function ReferralAcceptSheet({
  visible,
  code,
  gym,
  referrerName,
  mode = 'apply',
  onAccept,
  onDecline,
}: Props) {
  const { t } = useTranslation('socialFriends');
  const [sheetState, setSheetState] = useState<SheetState>('confirm');

  const accent = gym.primaryColor || theme.colors.primary;

  const translateY = useSharedValue(SCREEN_HEIGHT);
  const backdropOpacity = useSharedValue(0);
  const startY = useSharedValue(0);

  const handleClose = useCallback(() => {
    translateY.value = withTiming(SCREEN_HEIGHT, CLOSE_CONFIG);
    backdropOpacity.value = withTiming(0, CLOSE_CONFIG, (finished) => {
      'worklet';
      if (finished) runOnJS(onDecline)();
    });
  }, [onDecline]);

  useEffect(() => {
    if (visible) {
      setSheetState('confirm');
      translateY.value = SCREEN_HEIGHT;
      backdropOpacity.value = 0;
      translateY.value = withTiming(0, OPEN_CONFIG);
      backdropOpacity.value = withTiming(1, OPEN_CONFIG);
    }
  }, [visible]);

  const panGesture = Gesture.Pan()
    .onBegin(() => {
      'worklet';
      startY.value = translateY.value;
    })
    .onUpdate((e) => {
      'worklet';
      const next = startY.value + e.translationY;
      translateY.value = Math.max(0, next);
      backdropOpacity.value = interpolate(
        translateY.value,
        [0, SCREEN_HEIGHT * 0.5],
        [1, 0],
        Extrapolate.CLAMP,
      );
    })
    .onEnd((e) => {
      'worklet';
      if (e.translationY > DISMISS_THRESHOLD || e.velocityY > 600) {
        translateY.value = withTiming(SCREEN_HEIGHT, CLOSE_CONFIG);
        backdropOpacity.value = withTiming(0, CLOSE_CONFIG, (finished) => {
          if (finished) runOnJS(onDecline)();
        });
      } else {
        translateY.value = withSpring(0, SNAP_BACK);
        backdropOpacity.value = withTiming(1, { duration: 200 });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const handleAccept = useCallback(async () => {
    setSheetState('applying');
    try {
      const ok = await onAccept();
      setSheetState(ok ? 'success' : 'error');
    } catch {
      setSheetState('error');
    }
  }, [onAccept]);

  const handleDone = useCallback(() => {
    translateY.value = withTiming(SCREEN_HEIGHT, CLOSE_CONFIG);
    backdropOpacity.value = withTiming(0, CLOSE_CONFIG, (finished) => {
      'worklet';
      if (finished) runOnJS(onDecline)();
    });
  }, [onDecline]);

  if (!visible) return null;

  const ctaLabel =
    mode === 'join'
      ? t('acceptSheet.joinCta')
      : t('acceptSheet.acceptCta');

  const bodyText =
    mode === 'join'
      ? t('acceptSheet.joinBody', { gym: gym.name })
      : t('acceptSheet.body');

  const successTitle =
    mode === 'join'
      ? t('acceptSheet.joinSuccessTitle', { gym: gym.name })
      : t('acceptSheet.successTitle');

  const successBody =
    mode === 'join'
      ? t('acceptSheet.joinSuccessBody', { gym: gym.name })
      : t('acceptSheet.successBody');

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <GestureHandlerRootView style={StyleSheet.absoluteFillObject}>
        {/* Backdrop */}
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={sheetState === 'confirm' ? handleClose : undefined}
          />
        </Animated.View>

        {/* Sheet */}
        <GestureDetector gesture={panGesture}>
          <Animated.View style={[styles.sheetWrapper, sheetStyle]}>
            <View style={[styles.sheet, { borderColor: hexToRgba(accent, 0.22) }]}>
              <BlurView intensity={55} tint="dark" style={styles.blurContainer}>
                <LinearGradient
                  colors={['rgba(255,255,255,0.08)', hexToRgba(accent, 0.05), 'rgba(12,12,22,0.0)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />

                {/* Drag handle */}
                <View style={styles.handle} />

                {/* ── CONFIRM ── */}
                {sheetState === 'confirm' && (
                  <>
                    {/* Gym logo */}
                    <View style={[styles.gymLogoWrap, { borderColor: hexToRgba(accent, 0.3), backgroundColor: hexToRgba(accent, 0.08) }]}>
                      {gym.logoUrl ? (
                        <Image source={gym.logoUrl} style={styles.gymLogo} contentFit="contain" transition={200} />
                      ) : (
                        <Ionicons name="fitness" size={32} color={accent} />
                      )}
                    </View>

                    {/* Accent line */}
                    <View style={[styles.accentLine, { backgroundColor: hexToRgba(accent, 0.7) }]} />

                    <View style={styles.textBlock}>
                      <Text style={styles.headline}>{t('acceptSheet.headline')}</Text>
                      <Text style={styles.gymName}>{gym.name}</Text>
                      {gym.city && (
                        <Text style={styles.gymCity}>{gym.city}</Text>
                      )}
                      <Text style={styles.body}>{bodyText}</Text>
                    </View>

                    {/* Referrer badge */}
                    {referrerName && (
                      <View style={[styles.referrerBadge, { backgroundColor: hexToRgba(accent, 0.08), borderColor: hexToRgba(accent, 0.18) }]}>
                        <Ionicons name="person-outline" size={13} color={accent} />
                        <Text style={[styles.referrerText, { color: accent }]}>
                          {t('acceptSheet.referrerLabel', { name: referrerName })}
                        </Text>
                      </View>
                    )}

                    {/* Code pill */}
                    <View style={[styles.codePill, { borderColor: hexToRgba(accent, 0.3), backgroundColor: hexToRgba(accent, 0.07) }]}>
                      <Ionicons name="ticket-outline" size={14} color={accent} />
                      <Text style={[styles.codeText, { color: accent }]}>{code}</Text>
                    </View>

                    {/* Reward badge */}
                    <View style={[styles.rewardBadge, { backgroundColor: hexToRgba(accent, 0.1), borderColor: hexToRgba(accent, 0.2) }]}>
                      <Ionicons name="water" size={13} color={accent} />
                      <Text style={[styles.rewardText, { color: accent }]}>{t('acceptSheet.rewardHint')}</Text>
                    </View>

                    {/* Buttons */}
                    <View style={styles.buttonWrap}>
                      <Pressable
                        style={({ pressed }) => [
                          styles.btnAccept,
                          { backgroundColor: pressed ? hexToRgba(accent, 0.85) : accent },
                        ]}
                        onPress={handleAccept}
                      >
                        <Ionicons name={mode === 'join' ? 'home' : 'checkmark'} size={18} color="#000" />
                        <Text style={styles.btnAcceptText}>{ctaLabel}</Text>
                      </Pressable>

                      <Pressable style={styles.btnDecline} onPress={handleClose}>
                        <Text style={styles.btnDeclineText}>{t('acceptSheet.declineCta')}</Text>
                      </Pressable>
                    </View>
                  </>
                )}

                {/* ── APPLYING ── */}
                {sheetState === 'applying' && (
                  <View style={styles.centerState}>
                    <ActivityIndicator size="large" color={accent} />
                    <Text style={styles.centerLabel}>
                      {mode === 'join' ? t('acceptSheet.joiningGym') : t('acceptSheet.applying')}
                    </Text>
                  </View>
                )}

                {/* ── SUCCESS ── */}
                {sheetState === 'success' && (
                  <View style={styles.centerState}>
                    <View style={[styles.outcomeCircle, { backgroundColor: hexToRgba('#4CAF50', 0.12) }]}>
                      <Ionicons name="checkmark-circle" size={52} color="#4CAF50" />
                    </View>
                    <Text style={styles.outcomeTitle}>{successTitle}</Text>
                    <Text style={styles.outcomeBody}>{successBody}</Text>
                    <Pressable
                      style={({ pressed }) => [
                        styles.btnAccept,
                        styles.outcomeBtn,
                        { backgroundColor: pressed ? hexToRgba(accent, 0.85) : accent },
                      ]}
                      onPress={handleDone}
                    >
                      <Text style={styles.btnAcceptText}>{t('acceptSheet.doneCta')}</Text>
                    </Pressable>
                  </View>
                )}

                {/* ── ERROR ── */}
                {sheetState === 'error' && (
                  <View style={styles.centerState}>
                    <View style={[styles.outcomeCircle, { backgroundColor: hexToRgba('#E57373', 0.12) }]}>
                      <Ionicons name="alert-circle" size={52} color="#E57373" />
                    </View>
                    <Text style={styles.outcomeTitle}>{t('acceptSheet.errorTitle')}</Text>
                    <Pressable
                      style={({ pressed }) => [
                        styles.btnAccept,
                        styles.outcomeBtn,
                        { backgroundColor: pressed ? hexToRgba(accent, 0.85) : accent },
                      ]}
                      onPress={handleDone}
                    >
                      <Text style={styles.btnAcceptText}>{t('acceptSheet.doneCta')}</Text>
                    </Pressable>
                  </View>
                )}
              </BlurView>
            </View>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  sheetWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 0,
    overflow: 'hidden',
    backgroundColor: 'rgba(10,10,20,0.55)',
  },
  blurContainer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 44 : 28,
    alignItems: 'center',
    gap: 16,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignSelf: 'center',
    marginBottom: 4,
  },
  gymLogoWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gymLogo: {
    width: 52,
    height: 52,
  },
  accentLine: {
    width: 40,
    height: 3,
    borderRadius: 2,
  },
  textBlock: {
    alignItems: 'center',
    gap: 6,
  },
  headline: {
    ...fontStyles.heading,
    fontSize: 11,
    letterSpacing: 2,
    color: theme.colors.textTertiary,
    textTransform: 'uppercase',
  },
  gymName: {
    ...fontStyles.heading,
    fontSize: 26,
    color: '#fff',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  gymCity: {
    ...fontStyles.body,
    fontSize: 13,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: -2,
  },
  body: {
    ...fontStyles.body,
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
    paddingHorizontal: 8,
  },
  referrerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  referrerText: {
    ...fontStyles.bodySemiBold,
    fontSize: 12,
  },
  codePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  codeText: {
    ...fontStyles.number,
    fontSize: 14,
    letterSpacing: 0.8,
  },
  rewardBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rewardText: {
    ...fontStyles.bodySemiBold,
    fontSize: 12,
  },
  buttonWrap: {
    width: '100%',
    gap: 8,
  },
  btnAccept: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    paddingVertical: 15,
    borderRadius: 16,
  },
  btnAcceptText: {
    ...fontStyles.heading,
    fontSize: 17,
    color: '#000',
    letterSpacing: 0.3,
  },
  btnDecline: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  btnDeclineText: {
    ...fontStyles.body,
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  centerState: {
    width: '100%',
    paddingTop: 24,
    paddingBottom: 8,
    alignItems: 'center',
    gap: 12,
    minHeight: 220,
    justifyContent: 'center',
  },
  centerLabel: {
    ...fontStyles.body,
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  outcomeCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  outcomeTitle: {
    ...fontStyles.heading,
    fontSize: 22,
    color: '#fff',
    textAlign: 'center',
  },
  outcomeBody: {
    ...fontStyles.body,
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 16,
  },
  outcomeBtn: {
    marginTop: 8,
  },
});
