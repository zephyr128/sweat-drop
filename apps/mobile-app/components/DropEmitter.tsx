/**
 * Premium DropEmitter Component
 * Completely decoupled from BLE data stream
 * Each drop is an independent animated entity that runs on UI thread
 */

import React, { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  useSharedValue,
  withTiming,
  useAnimatedStyle,
  Easing,
  runOnJS,
  withSequence,
} from 'react-native-reanimated';
import Animated from 'react-native-reanimated';
import { theme } from '@/lib/theme';

interface Drop {
  id: string;
  startX: number;
  progress: number; // 0 to 1 (water level progress)
}

interface DropEmitterProps {
  drops: Drop[]; // Array of drops to animate
  containerSize: number; // Size of the circular container
  onDropComplete: (dropId: string) => void; // Callback when drop animation completes
}

export function DropEmitter({ drops, containerSize, onDropComplete }: DropEmitterProps) {
  const completedDropsRef = useRef<Set<string>>(new Set());

  return (
    <View style={[styles.container, { width: containerSize, height: containerSize }]} pointerEvents="none">
      {drops.map((drop) => {
        // Skip if already completed
        if (completedDropsRef.current.has(drop.id)) {
          return null;
        }

        return (
          <DropAnimation
            key={drop.id}
            drop={drop}
            containerSize={containerSize}
            onComplete={() => {
              completedDropsRef.current.add(drop.id);
              onDropComplete(drop.id);
            }}
          />
        );
      })}
    </View>
  );
}

interface DropAnimationProps {
  drop: Drop;
  containerSize: number;
  onComplete: () => void;
}

function DropAnimation({ drop, containerSize, onComplete }: DropAnimationProps) {
  // Animation progress: 0 (top) to 1 (water level)
  const progress = useSharedValue(0);
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);

  useEffect(() => {
    // Start animation immediately
    progress.value = withTiming(
      1,
      {
        duration: 800, // Fall duration
        easing: Easing.in(Easing.quad), // Gravity simulation
      },
      (finished) => {
        if (finished) {
          // Splash effect: quick scale up then fade out
          scale.value = withSequence(
            withTiming(1.3, { duration: 100, easing: Easing.out(Easing.ease) }),
            withTiming(1, { duration: 50, easing: Easing.in(Easing.ease) })
          );
          
          opacity.value = withTiming(0, { duration: 150 }, () => {
            runOnJS(onComplete)();
          });
        }
      }
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    // Calculate water level from bottom
    const waterLevelFromBottom = drop.progress * containerSize;
    const waterLevelFromTop = containerSize - waterLevelFromBottom;
    
    // Animate from top (0) to water level
    const currentY = progress.value * waterLevelFromTop;
    
    return {
      transform: [
        { translateY: currentY },
        { scale: scale.value },
      ],
      opacity: opacity.value,
    };
  });

  return (
    <Animated.View
      style={[
        styles.drop,
        {
          left: drop.startX,
          top: 0,
        },
        animatedStyle,
      ]}
    >
      <Ionicons name="water" size={24} color={theme.colors.primary} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    overflow: 'hidden',
    borderRadius: 140, // Half of container size for circular clip
  },
  drop: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
