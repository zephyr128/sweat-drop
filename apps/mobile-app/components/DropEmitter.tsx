/**
 * Premium DropEmitter Component - Zero-Lag Optimized
 * Apple Fitness+ level visual effects
 * Completely decoupled from BLE data stream
 * Each drop is an independent animated entity that runs on UI thread
 * OPTIMIZED: No Skia Canvas per drop - uses lightweight Animated.View
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
import * as Haptics from 'expo-haptics';
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
  onImpact?: (x: number, y: number) => void; // Callback when drop hits water (for triggerImpact)
}

export function DropEmitter({ drops, containerSize, onDropComplete, onImpact }: DropEmitterProps) {
  const completedDropsRef = useRef<Set<string>>(new Set());

  return (
    <View style={[styles.container, { width: containerSize, height: containerSize }]} pointerEvents="none">
      {/* Drop Animations - Zero-Lag: Simple Animated.View (no Skia Canvas) */}
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
            onImpact={(x, y) => {
              // Impact Sync: Call onImpact callback for triggerImpact
              if (onImpact) {
                onImpact(x, y);
              }
            }}
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
  onImpact: (x: number, y: number) => void;
  onComplete: () => void;
}

function DropAnimation({ drop, containerSize, onImpact, onComplete }: DropAnimationProps) {
  // Animation progress: 0 (top) to 1 (water level)
  const progress = useSharedValue(0);
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);
  const impactTriggered = useRef(false);

  useEffect(() => {
    // Start animation immediately
    progress.value = withTiming(
      1,
      {
        duration: 800, // Fall duration
        easing: Easing.in(Easing.quad), // Gravity simulation
      },
      (finished) => {
        if (finished && !impactTriggered.current) {
          impactTriggered.current = true;
          
          // Calculate impact position
          const waterLevelFromBottom = drop.progress * containerSize;
          const waterLevelFromTop = containerSize - waterLevelFromBottom;
          const impactX = drop.startX;
          const impactY = waterLevelFromTop;
          
          // Impact Sync: Trigger haptic feedback at exact impact moment
          runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
          
          // Impact Sync: Trigger impact callback for LiquidGauge triggerImpact
          runOnJS(onImpact)(impactX, impactY);
          
          // Splash effect: quick scale up then fade out
          scale.value = withSequence(
            withTiming(1.5, { duration: 100, easing: Easing.out(Easing.ease) }),
            withTiming(1, { duration: 50, easing: Easing.in(Easing.ease) })
          );
          
          opacity.value = withTiming(0, { duration: 150 }, () => {
            runOnJS(onComplete)();
          });
        }
      }
    );
  }, []);

  // Motion blur trail (simple gradient opacity - no Skia)
  const trailOpacity = useSharedValue(0);

  useEffect(() => {
    // Trail appears as drop falls
    if (progress.value > 0.1) {
      trailOpacity.value = withTiming(0.6, { duration: 200 });
    }
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

  // Trail style (simple opacity gradient - no Skia)
  const trailStyle = useAnimatedStyle(() => {
    const waterLevelFromBottom = drop.progress * containerSize;
    const waterLevelFromTop = containerSize - waterLevelFromBottom;
    const currentY = progress.value * waterLevelFromTop;
    const trailLength = 20;
    const trailStartY = Math.max(0, currentY - trailLength);
    
    return {
      position: 'absolute',
      left: drop.startX - 2,
      top: trailStartY,
      width: 4,
      height: trailLength,
      opacity: trailOpacity.value * (1 - progress.value), // Fade as it falls
      backgroundColor: theme.colors.primary,
      borderRadius: 2,
    };
  });

  return (
    <>
      {/* Motion Blur Trail - Zero-Lag: Simple View (no Skia) */}
      {progress.value > 0.1 && (
        <Animated.View style={trailStyle} />
      )}
      
      {/* Drop Icon - Zero-Lag: Simple Animated.View */}
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
    </>
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
