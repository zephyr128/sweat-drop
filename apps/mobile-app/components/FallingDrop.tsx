import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSharedValue, withTiming, useAnimatedStyle, Easing, runOnJS } from 'react-native-reanimated';
import Animated from 'react-native-reanimated';
import { theme } from '@/lib/theme';

interface FallingDropProps {
  startX: number; // Starting X position
  targetY: number; // Target Y position (water level from bottom)
  containerHeight: number; // Height of the circular container
  onDone: () => void; // Callback when drop reaches target
  delay?: number; // Optional delay before animation starts
}

export default function FallingDrop({ startX, targetY, containerHeight, onDone, delay = 0 }: FallingDropProps) {
  // Start at the top of the container (0)
  const startY = 0;
  // targetY is distance from bottom, so from top it's: containerHeight - targetY
  const targetYFromTop = containerHeight - targetY;
  
  const translateY = useSharedValue(startY);
  const opacity = useSharedValue(1);

  useEffect(() => {
    // Reset position when target changes
    translateY.value = startY;
    opacity.value = 1;
    
    // Start animation after delay
    const timer = setTimeout(() => {
      // Animate from top of container (0) to water level (targetYFromTop)
      translateY.value = withTiming(
        targetYFromTop,
        {
          duration: 800, // Fall duration
          easing: Easing.in(Easing.quad), // Simulate gravity
        },
        (finished) => {
          if (finished) {
            // Fade out quickly after impact
            opacity.value = withTiming(0, { duration: 100 }, () => {
              runOnJS(onDone)();
            });
          }
        }
      );
    }, delay);

    return () => clearTimeout(timer);
  }, [targetYFromTop, delay, onDone, translateY, opacity, startY]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
      opacity: opacity.value,
    };
  });

  return (
    <Animated.View
      style={[
        styles.container,
        {
          left: startX,
          top: 0,
        },
        animatedStyle,
      ]}
      pointerEvents="none"
    >
      <Ionicons name="water" size={24} color={theme.colors.primary} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
