import React, { useEffect, useMemo } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface ConfettiEffectProps {
  visible: boolean;
  onComplete?: () => void;
  duration?: number;
}

const CONFETTI_COUNT = 50;
const CONFETTI_COLORS = ['#00E5FF', '#00B8CC', '#33EBFF', '#FFFFFF', '#FF9100'];

interface ConfettiPieceConfig {
  id: number;
  color: string;
  delay: number;
  startX: number;
}

function ConfettiPiece({ visible, duration, config }: { visible: boolean; duration: number; config: ConfettiPieceConfig }) {
  const x = useSharedValue(config.startX);
  const y = useSharedValue(-10);
  const rotation = useSharedValue(0);
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (!visible) {
      y.value = -10;
      rotation.value = 0;
      scale.value = 1;
      opacity.value = 0;
      return;
    }

    y.value = withTiming(110, {
      duration: duration + config.delay,
      easing: Easing.out(Easing.quad),
    });

    rotation.value = withRepeat(
      withTiming(360, {
        duration: 1000 + Math.random() * 500,
        easing: Easing.linear,
      }),
      -1,
      false
    );

    scale.value = withSequence(withTiming(1.2, { duration: 200 }), withTiming(1, { duration: 200 }));
    opacity.value = withSequence(
      withTiming(1, { duration: duration * 0.7 }),
      withTiming(0, { duration: duration * 0.3 })
    );
  }, [visible, duration, config.delay, opacity, rotation, scale, x, y]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: (x.value / 100) * SCREEN_WIDTH - 10 },
      { translateY: (y.value / 100) * SCREEN_HEIGHT },
      { rotate: `${rotation.value}deg` },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  if (!visible) return null;

  return (
    <Animated.View style={[styles.confettiPiece, animatedStyle]}>
      <View style={[styles.confettiDot, { backgroundColor: config.color }]} />
    </Animated.View>
  );
}

export const ConfettiEffect: React.FC<ConfettiEffectProps> = ({
  visible,
  onComplete,
  duration = 3000,
}) => {
  const confettiPieces = useMemo(() => Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
    id: i,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    delay: Math.random() * 500,
    startX: Math.random() * 100,
  })), []);

  useEffect(() => {
    if (!visible) return;

    // Call onComplete after animation
    const timer = setTimeout(() => {
      onComplete?.();
    }, duration);

    return () => clearTimeout(timer);
  }, [visible, duration, onComplete]);

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {confettiPieces.map((piece) => (
        <ConfettiPiece key={piece.id} visible={visible} duration={duration} config={piece} />
      ))}
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
