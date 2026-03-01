import React, { useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { useBranding } from '@/lib/contexts/ThemeContext';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface ConfettiEffectProps {
  visible: boolean;
  onComplete?: () => void;
  duration?: number;
}

const CONFETTI_COUNT = 50;
const CONFETTI_COLORS = ['#00E5FF', '#00B8CC', '#33EBFF', '#FFFFFF', '#FF9100'];

export const ConfettiEffect: React.FC<ConfettiEffectProps> = ({
  visible,
  onComplete,
  duration = 3000,
}) => {
  const branding = useBranding();
  const confettiPieces = Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
    id: i,
    x: useSharedValue(Math.random() * 100),
    y: useSharedValue(-10),
    rotation: useSharedValue(0),
    scale: useSharedValue(1),
    opacity: useSharedValue(1),
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    delay: Math.random() * 500,
  }));

  useEffect(() => {
    if (!visible) return;

    confettiPieces.forEach((piece) => {
      // Animate falling
      piece.y.value = withTiming(
        110,
        {
          duration: duration + piece.delay,
          easing: Easing.out(Easing.quad),
        }
      );

      // Animate rotation
      piece.rotation.value = withRepeat(
        withTiming(360, {
          duration: 1000 + Math.random() * 500,
          easing: Easing.linear,
        }),
        -1,
        false
      );

      // Animate scale
      piece.scale.value = withSequence(
        withTiming(1.2, { duration: 200 }),
        withTiming(1, { duration: 200 })
      );

      // Fade out
      piece.opacity.value = withSequence(
        withTiming(1, { duration: duration * 0.7 }),
        withTiming(0, { duration: duration * 0.3 })
      );
    });

    // Call onComplete after animation
    const timer = setTimeout(() => {
      onComplete?.();
    }, duration);

    return () => clearTimeout(timer);
  }, [visible, duration, onComplete]);

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {confettiPieces.map((piece) => {
        const animatedStyle = useAnimatedStyle(() => ({
          transform: [
            { translateX: (piece.x.value / 100) * SCREEN_WIDTH - 10 },
            { translateY: (piece.y.value / 100) * SCREEN_HEIGHT },
            { rotate: `${piece.rotation.value}deg` },
            { scale: piece.scale.value },
          ],
          opacity: piece.opacity.value,
        }));

        return (
          <Animated.View
            key={piece.id}
            style={[styles.confettiPiece, animatedStyle]}
          >
            <View
              style={[
                styles.confettiDot,
                { backgroundColor: piece.color },
              ]}
            />
          </Animated.View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  confettiPiece: {
    position: 'absolute',
    width: 20,
    height: 20,
    top: 0,
    left: '50%',
  },
  confettiDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
