import React, { useEffect, useState } from 'react';
import { View, StyleSheet, LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

interface SkeletonShimmerProps {
  style?: StyleProp<ViewStyle>;
  /** Base backdrop color of the block. Defaults to a subtle white tint. */
  baseColor?: string;
  /** Color of the moving highlight band. Defaults to a brighter white tint. */
  highlightColor?: string;
  /** Shimmer cycle duration in ms. Default 1400. */
  durationMs?: number;
  /** Optional delay so adjacent blocks sweep slightly out of phase. */
  delayMs?: number;
}

/**
 * SkeletonShimmer — a single primitive block whose content animates via a
 * soft gradient sweep. Use to build skeleton loaders.
 *
 * Usage:
 *   <SkeletonShimmer style={{ width: 120, height: 16, borderRadius: 8 }} />
 *
 * The block's width is measured on layout; the highlight is a 2× wide band
 * that slides across, clipped by `overflow: 'hidden'`. This avoids relying on
 * percent-based transforms (which are finicky in RN).
 */
export function SkeletonShimmer({
  style,
  baseColor = 'rgba(255,255,255,0.055)',
  highlightColor = 'rgba(255,255,255,0.14)',
  durationMs = 1400,
  delayMs = 0,
}: SkeletonShimmerProps) {
  const [width, setWidth] = useState(0);
  const sweep = useSharedValue(0);

  useEffect(() => {
    if (width === 0) return;
    sweep.value = 0;
    const start = () => {
      sweep.value = withRepeat(
        withTiming(1, { duration: durationMs, easing: Easing.inOut(Easing.ease) }),
        -1,
        false,
      );
    };
    if (delayMs > 0) {
      const id = setTimeout(start, delayMs);
      return () => clearTimeout(id);
    }
    start();
  }, [width, durationMs, delayMs, sweep]);

  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: sweep.value * width * 2 - width }],
  }));

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (Math.abs(w - width) > 0.5) setWidth(w);
  };

  return (
    <View
      onLayout={onLayout}
      style={[{ backgroundColor: baseColor, overflow: 'hidden' }, style]}
    >
      {width > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            { position: 'absolute', top: 0, bottom: 0, width: width * 2, left: 0 },
            sweepStyle,
          ]}
        >
          <LinearGradient
            colors={['transparent', highlightColor, 'transparent']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}
