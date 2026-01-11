import React from 'react';
import { View, StyleSheet } from 'react-native';
import {
  Canvas,
  Path,
  Skia,
  Line,
  Shadow,
  vec,
  Group,
} from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { theme } from '@/lib/theme';

interface CircularProgressRingProps {
  progress: number; // 0 to 1
  size?: number; // Diameter of the ring
  strokeWidth?: number; // Width of the ring
}

export default function CircularProgressRing({
  progress,
  size = 290,
  strokeWidth = 3,
}: CircularProgressRingProps) {
  const radius = size / 2;
  const center = { x: radius, y: radius };
  const trackRadius = radius - strokeWidth / 2;

  // Create background track path (full circle)
  const trackPath = useDerivedValue(() => {
    const path = Skia.Path.Make();
    path.addCircle(center.x, center.y, trackRadius);
    return path;
  }, [trackRadius, center.x, center.y]);

  // Create progress fill path (arc from top clockwise)
  const progressPath = useDerivedValue(() => {
    const path = Skia.Path.Make();
    const clampedProgress = Math.max(0, Math.min(1, progress));
    
    if (clampedProgress <= 0) {
      return path;
    }

    const startAngle = -Math.PI / 2; // Top (-90 degrees)
    const sweepAngle = clampedProgress * 2 * Math.PI;

    const rect = {
      x: center.x - trackRadius,
      y: center.y - trackRadius,
      width: trackRadius * 2,
      height: trackRadius * 2,
    };

    path.addArc(rect, (startAngle * 180) / Math.PI, (sweepAngle * 180) / Math.PI);
    return path;
  }, [progress, trackRadius, center.x, center.y]);

  // Generate tick marks every 10 degrees (36 ticks total)
  const ticks = useDerivedValue(() => {
    const tickLength = 4;
    const tickWidth = 1.5;
    const tickRadius = trackRadius - strokeWidth / 2;
    const ticks: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];

    for (let i = 0; i < 36; i++) {
      const angle = (i * 10 * Math.PI) / 180 - Math.PI / 2; // Start from top
      const x1 = center.x + Math.cos(angle) * tickRadius;
      const y1 = center.y + Math.sin(angle) * tickRadius;
      const x2 = center.x + Math.cos(angle) * (tickRadius - tickLength);
      const y2 = center.y + Math.sin(angle) * (tickRadius - tickLength);
      
      ticks.push({ x1, y1, x2, y2 });
    }
    return ticks;
  }, [trackRadius, center.x, center.y, strokeWidth]);

  // Calculate glow intensity
  const glowIntensity = progress > 0.8 ? 0.5 + (progress - 0.8) * 0.5 : progress * 0.3;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Canvas style={{ width: size, height: size }}>
        {/* Background track (faint, semi-transparent) */}
        <Path
          path={trackPath}
          color={theme.colors.secondary + '20'} // Very faint
          style="stroke"
          strokeWidth={strokeWidth}
          strokeCap="round"
        />

        {/* Tick marks (precision instrument look) */}
        {ticks.value.map((tick, i) => (
          <Line
            key={`tick-${i}`}
            p1={vec(tick.x1, tick.y1)}
            p2={vec(tick.x2, tick.y2)}
            color={theme.colors.textSecondary + '40'}
            strokeWidth={1}
          />
        ))}

        {/* Progress fill with neon glow */}
        {progress > 0 && (
          <Group>
            {/* Outer glow layer (thick, blurred) */}
            <Path
              path={progressPath}
              color={theme.colors.secondary}
              style="stroke"
              strokeWidth={strokeWidth + 6}
              strokeCap="round"
              opacity={glowIntensity * 0.6}
            >
              <Shadow dx={0} dy={0} blur={12} color={theme.colors.secondary} />
            </Path>
            
            {/* Middle glow layer */}
            <Path
              path={progressPath}
              color={theme.colors.secondary}
              style="stroke"
              strokeWidth={strokeWidth + 3}
              strokeCap="round"
              opacity={glowIntensity * 0.8}
            />
            
            {/* Main progress stroke (solid) */}
            <Path
              path={progressPath}
              color={theme.colors.secondary}
              style="stroke"
              strokeWidth={strokeWidth}
              strokeCap="round"
            />
          </Group>
        )}
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
