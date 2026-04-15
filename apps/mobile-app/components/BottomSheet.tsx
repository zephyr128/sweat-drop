import React, { useCallback, useEffect } from 'react';
import {
  Dimensions,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { PlatformBlur } from '@/components/PlatformBlur';
import { LinearGradient } from 'expo-linear-gradient';
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
import { theme, hexToRgba } from '@/lib/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const DISMISS_THRESHOLD = 80;
const OPEN_CONFIG  = { duration: 340, easing: Easing.out(Easing.cubic) };
const CLOSE_CONFIG = { duration: 260, easing: Easing.in(Easing.cubic) };
const SNAP_BACK    = { damping: 22, stiffness: 280, mass: 0.9 };

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  accentColor?: string;
  children: React.ReactNode;
}

export function BottomSheet({ visible, onClose, accentColor = theme.colors.primary, children }: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const sheetBottomPad = Math.max(insets.bottom, 16);
  const translateY      = useSharedValue(SCREEN_HEIGHT);
  const backdropOpacity = useSharedValue(0);
  const startY          = useSharedValue(0);

  const handleClose = useCallback(() => {
    translateY.value      = withTiming(SCREEN_HEIGHT, CLOSE_CONFIG);
    backdropOpacity.value = withTiming(0, CLOSE_CONFIG, (finished) => {
      'worklet';
      if (finished) runOnJS(onClose)();
    });
  }, [onClose]);

  useEffect(() => {
    if (visible) {
      translateY.value      = SCREEN_HEIGHT;
      backdropOpacity.value = 0;
      translateY.value      = withTiming(0, OPEN_CONFIG);
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
      translateY.value = Math.max(0, startY.value + e.translationY);
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
        translateY.value      = withTiming(SCREEN_HEIGHT, CLOSE_CONFIG);
        backdropOpacity.value = withTiming(0, CLOSE_CONFIG, (finished) => {
          if (finished) runOnJS(onClose)();
        });
      } else {
        translateY.value      = withSpring(0, SNAP_BACK);
        backdropOpacity.value = withTiming(1, { duration: 200 });
      }
    });

  const sheetStyle   = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={handleClose}>
      <GestureHandlerRootView style={StyleSheet.absoluteFillObject}>
        {/* Backdrop */}
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        </Animated.View>

        {/* Sheet */}
        <GestureDetector gesture={panGesture}>
          <Animated.View style={[styles.sheetWrapper, sheetStyle]}>
            <View style={[styles.sheet, { borderColor: hexToRgba(accentColor, 0.22) }]}>
              {Platform.OS === 'ios' ? (
                <PlatformBlur
                  intensity={60}
                  tint="dark"
                  style={[styles.blurContainer, { paddingBottom: sheetBottomPad }]}
                  androidColor="rgba(12,12,22,0.97)"
                >
                  <LinearGradient
                    colors={['rgba(255,255,255,0.07)', hexToRgba(accentColor, 0.04), 'transparent']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                  />
                  <View style={styles.handle} />
                  {children}
                  <Pressable style={styles.closeBtn} onPress={handleClose} hitSlop={8}>
                    <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
                  </Pressable>
                </PlatformBlur>
              ) : (
                <View style={[styles.blurContainer, styles.androidSheet, { paddingBottom: sheetBottomPad }]}>
                  <LinearGradient
                    colors={['rgba(255,255,255,0.06)', hexToRgba(accentColor, 0.03), 'transparent']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                  />
                  <View style={styles.handle} />
                  {children}
                  <Pressable style={styles.closeBtn} onPress={handleClose} hitSlop={8}>
                    <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
                  </Pressable>
                </View>
              )}
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
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  sheetWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    overflow: 'hidden',
  },
  blurContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    paddingTop: 12,
  },
  androidSheet: {
    backgroundColor: '#0E1118',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.20)',
    alignSelf: 'center',
    marginBottom: 14,
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 18,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
    elevation: 8,
  },
});
