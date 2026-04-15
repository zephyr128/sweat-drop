import React, { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Dimensions,
} from 'react-native';
import { PlatformBlur } from '@/components/PlatformBlur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
  Easing,
  interpolate,
  Extrapolate,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme, fontStyles, hexToRgba } from '@/lib/theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const DISMISS_THRESHOLD = 80;

const OPEN_CONFIG = { duration: 340, easing: Easing.out(Easing.cubic) };
const CLOSE_CONFIG = { duration: 260, easing: Easing.in(Easing.cubic) };
const SNAP_BACK_SPRING = { damping: 22, stiffness: 280, mass: 0.9 };

interface VerificationSheetProps {
  visible: boolean;
  onClose: () => void;
  brandColor?: string;
}

export function VerificationSheet({ visible, onClose, brandColor = theme.colors.primary }: VerificationSheetProps) {
  const { t } = useTranslation('profile');
  const { t: tCommon } = useTranslation('common');
  const insets = useSafeAreaInsets();
  const sheetBottomPad = Math.max(insets.bottom, 16) + 8;

  const translateY = useSharedValue(SCREEN_HEIGHT);
  const backdropOpacity = useSharedValue(0);
  const startY = useSharedValue(0);

  const steps = [
    { icon: 'walk-outline' as const, text: t('verification.step1') },
    { icon: 'person-outline' as const, text: t('verification.step2') },
    { icon: 'shield-checkmark-outline' as const, text: t('verification.step3') },
  ];

  const handleClose = useCallback(() => {
    translateY.value = withTiming(SCREEN_HEIGHT, CLOSE_CONFIG);
    backdropOpacity.value = withTiming(0, CLOSE_CONFIG, (finished) => {
      'worklet';
      if (finished) runOnJS(onClose)();
    });
  }, [onClose]);

  useEffect(() => {
    if (visible) {
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
          if (finished) runOnJS(onClose)();
        });
      } else {
        translateY.value = withSpring(0, SNAP_BACK_SPRING);
        backdropOpacity.value = withTiming(1, { duration: 200 });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  if (!visible) return null;

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
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
      </Animated.View>

      {/* Sheet */}
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.sheetWrapper, sheetStyle]}>
          <View style={[styles.sheet, { borderColor: hexToRgba(brandColor, 0.20) }]}>
            <PlatformBlur
              intensity={55}
              tint="dark"
              style={[styles.blurContainer, { paddingBottom: sheetBottomPad }]}
              androidColor="rgba(12,15,24,0.98)"
            >
              <LinearGradient
                colors={['rgba(255,255,255,0.10)', hexToRgba(brandColor, 0.06), 'rgba(12,12,22,0.0)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />

              {/* Drag handle */}
              <View style={styles.handle} />

              {/* Icon */}
              <View style={styles.iconWrap}>
                <View style={[styles.iconCircle, { backgroundColor: hexToRgba(brandColor, 0.10), borderColor: hexToRgba(brandColor, 0.20) }]}>
                  <Ionicons name="shield-outline" size={36} color={brandColor} />
                </View>
              </View>

              {/* Title + subtitle */}
              <View style={styles.textBlock}>
                <Text style={styles.title}>{t('verification.title')}</Text>
                <Text style={styles.subtitle}>{t('verification.subtitle')}</Text>
              </View>

              {/* Steps */}
              <View style={styles.stepsContainer}>
                {steps.map((step, i) => (
                  <View key={i} style={styles.stepRow}>
                    <View style={[styles.stepIconWrap, { backgroundColor: hexToRgba(brandColor, 0.10) }]}>
                      <Ionicons name={step.icon} size={18} color={brandColor} />
                    </View>
                    <Text style={styles.stepText}>{step.text}</Text>
                  </View>
                ))}
              </View>

              {/* Info chip */}
              <View style={[styles.infoChip, { backgroundColor: hexToRgba(brandColor, 0.07), borderColor: hexToRgba(brandColor, 0.15) }]}>
                <Ionicons name="information-circle-outline" size={15} color={hexToRgba(brandColor, 0.8)} />
                <Text style={[styles.infoChipText, { color: hexToRgba(brandColor, 0.8) }]}>
                  {t('verification.oneTimeNote')}
                </Text>
              </View>

              {/* Close button */}
              <View style={styles.buttonWrap}>
                <Pressable
                  style={({ pressed }) => [
                    styles.closeButton,
                    {
                      backgroundColor: pressed ? hexToRgba(brandColor, 0.18) : hexToRgba(brandColor, 0.12),
                      borderColor: hexToRgba(brandColor, 0.25),
                    },
                  ]}
                  onPress={handleClose}
                >
                  <Text style={[styles.closeButtonText, { color: brandColor }]}>{tCommon('gotIt')}</Text>
                </Pressable>
              </View>
            </PlatformBlur>
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
    backgroundColor: 'rgba(0,0,0,0.60)',
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
    alignItems: 'center',
    gap: 20,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignSelf: 'center',
    marginBottom: 4,
  },
  iconWrap: {
    alignItems: 'center',
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  textBlock: {
    alignItems: 'center',
    gap: 6,
  },
  title: {
    ...fontStyles.heading,
    fontSize: 22,
    color: '#FFFFFF',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  subtitle: {
    ...fontStyles.body,
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  stepsContainer: {
    width: '100%',
    gap: 12,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  stepIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  stepText: {
    ...fontStyles.body,
    fontSize: 14,
    color: 'rgba(255,255,255,0.80)',
    lineHeight: 20,
    flex: 1,
  },
  infoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    width: '100%',
  },
  infoChipText: {
    ...fontStyles.body,
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  buttonWrap: {
    width: '100%',
  },
  closeButton: {
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    ...fontStyles.heading,
    fontSize: 16,
    letterSpacing: 0.3,
  },
});
