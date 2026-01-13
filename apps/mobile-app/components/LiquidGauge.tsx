import React, { useEffect, useImperativeHandle, forwardRef, useMemo } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import {
  Canvas,
  Path,
  LinearGradient,
  RadialGradient,
  vec,
  Skia,
  Group,
  Circle,
  Blur,
} from '@shopify/react-native-skia';
import { useSharedValue, withTiming, useDerivedValue, withRepeat, cancelAnimation, Easing, withSpring } from 'react-native-reanimated';
import { theme, getNumberStyle } from '@/lib/theme';

interface LiquidGaugeProps {
  progress: number; // 0 to 1
  value?: number | string; // The number/percentage to display in the center
  size?: number; // Diameter of the gauge
  strokeWidth?: number; // Width of the border
}

export interface LiquidGaugeRef {
  triggerImpact: () => void; // Trigger slosh/impact effect
}

// Spring configuration for impact physics
const springConfig = {
  damping: 15,
  stiffness: 150,
  mass: 1,
};

const LiquidGauge = forwardRef<LiquidGaugeRef, LiquidGaugeProps>(({
  progress,
  value,
  size = 280,
  strokeWidth = 4,
}, ref) => {
  const radius = size / 2;
  const center = { x: radius, y: radius };

  // Use Reanimated's useSharedValue for animations
  const animatedProgress = useSharedValue(0);
  const timeOffset = useSharedValue(0);
  const impactAnim = useSharedValue(0); // For slosh/impact effect
  const waterLevelOffset = useSharedValue(0); // For spring-based water level oscillation

  // Bubble animations (3-5 bubbles)
  const bubble1Anim = useSharedValue(Math.random());
  const bubble2Anim = useSharedValue(Math.random());
  const bubble3Anim = useSharedValue(Math.random());
  const bubble4Anim = useSharedValue(Math.random());
  const bubble5Anim = useSharedValue(Math.random());

  // Generate bubble positions and properties
  const bubbles = useMemo(() => [
    { id: 1, x: radius * 0.4 + Math.random() * radius * 1.2, baseY: size * 0.4, size: 5, speed: 0.4, anim: bubble1Anim },
    { id: 2, x: radius * 0.3 + Math.random() * radius * 1.4, baseY: size * 0.5, size: 7, speed: 0.35, anim: bubble2Anim },
    { id: 3, x: radius * 0.5 + Math.random() * radius * 1.0, baseY: size * 0.35, size: 4, speed: 0.5, anim: bubble3Anim },
    { id: 4, x: radius * 0.2 + Math.random() * radius * 1.6, baseY: size * 0.45, size: 6, speed: 0.3, anim: bubble4Anim },
    { id: 5, x: radius * 0.6 + Math.random() * radius * 0.8, baseY: size * 0.3, size: 5, speed: 0.45, anim: bubble5Anim },
  ], []);

  useEffect(() => {
    // Animate bubbles rising continuously
    bubbles.forEach((bubble) => {
      bubble.anim.value = withRepeat(
        withTiming(1, {
          duration: (2000 + Math.random() * 2000) / bubble.speed,
          easing: Easing.linear,
        }),
        -1,
        false
      );
    });
  }, []);

  // Update animated progress with spring physics when prop changes
  useEffect(() => {
    animatedProgress.value = withSpring(progress, springConfig);
  }, [progress, animatedProgress]);

  // Animate time offset for wave animation (continuous animation on UI thread)
  useEffect(() => {
    timeOffset.value = withRepeat(
      withTiming(Math.PI * 2, {
        duration: 2000,
        easing: Easing.linear,
      }),
      -1,
      false
    );
    
    return () => cancelAnimation(timeOffset);
  }, [timeOffset]);

  // Expose triggerImpact function to parent with spring physics
  useImperativeHandle(ref, () => ({
    triggerImpact: () => {
      // Trigger impact animation with spring physics
      impactAnim.value = withSpring(1, {
        damping: 12,
        stiffness: 200,
        mass: 0.8,
      });
      impactAnim.value = withSpring(0, springConfig);

      // Water level oscillation
      waterLevelOffset.value = withSpring(8, {
        damping: 10,
        stiffness: 180,
        mass: 0.5,
      });
      waterLevelOffset.value = withSpring(0, springConfig);
    },
  }));

  // Create the liquid path with sine wave sloshing effect
  const liquidPath = useDerivedValue(() => {
    const currentProgress = Math.max(0, Math.min(1, animatedProgress.value));
    const liquidHeight = currentProgress * size;
    const liquidTop = size - liquidHeight + waterLevelOffset.value; // Add spring-based offset

    if (liquidHeight <= 0) {
      return Skia.Path.Make();
    }

    const path = Skia.Path.Make();
    path.moveTo(0, size);
    path.lineTo(0, liquidTop);

    const baseWaveAmplitude = 6;
    const impactWaveAmplitude = 20; // Increased for more dramatic effect
    const waveAmplitude = baseWaveAmplitude + (impactWaveAmplitude - baseWaveAmplitude) * impactAnim.value;
    const frequency = 0.03;

    for (let i = 0; i <= size; i += 5) {
      const wave = Math.sin(i * frequency + timeOffset.value) * waveAmplitude;
      path.lineTo(i, liquidTop + wave);
    }

    path.lineTo(size, liquidTop);
    path.lineTo(size, size);
    path.close();

    return path;
  }, [animatedProgress, timeOffset, impactAnim, waterLevelOffset, size]);

  // Create circular clip path
  const clipPath = useDerivedValue(() => {
    const path = Skia.Path.Make();
    path.addCircle(center.x, center.y, radius);
    return path;
  }, [radius, center.x, center.y]);

  // Bubble positions (derived values)
  const bubble1Y = useDerivedValue(() => {
    const currentProgress = Math.max(0, Math.min(1, animatedProgress.value));
    const liquidHeight = currentProgress * size;
    const liquidTop = size - liquidHeight;
    if (liquidHeight <= 0) return size + 100;
    const animVal = bubble1Anim.value;
    const y = bubbles[0].baseY - (bubbles[0].baseY - liquidTop + 20) * animVal;
    return y > liquidTop + 10 ? y : size + 100;
  }, [animatedProgress, size]);

  const bubble2Y = useDerivedValue(() => {
    const currentProgress = Math.max(0, Math.min(1, animatedProgress.value));
    const liquidHeight = currentProgress * size;
    const liquidTop = size - liquidHeight;
    if (liquidHeight <= 0) return size + 100;
    const animVal = bubble2Anim.value;
    const y = bubbles[1].baseY - (bubbles[1].baseY - liquidTop + 20) * animVal;
    return y > liquidTop + 10 ? y : size + 100;
  }, [animatedProgress, size]);

  const bubble3Y = useDerivedValue(() => {
    const currentProgress = Math.max(0, Math.min(1, animatedProgress.value));
    const liquidHeight = currentProgress * size;
    const liquidTop = size - liquidHeight;
    if (liquidHeight <= 0) return size + 100;
    const animVal = bubble3Anim.value;
    const y = bubbles[2].baseY - (bubbles[2].baseY - liquidTop + 20) * animVal;
    return y > liquidTop + 10 ? y : size + 100;
  }, [animatedProgress, size]);

  const bubble4Y = useDerivedValue(() => {
    const currentProgress = Math.max(0, Math.min(1, animatedProgress.value));
    const liquidHeight = currentProgress * size;
    const liquidTop = size - liquidHeight;
    if (liquidHeight <= 0) return size + 100;
    const animVal = bubble4Anim.value;
    const y = bubbles[3].baseY - (bubbles[3].baseY - liquidTop + 20) * animVal;
    return y > liquidTop + 10 ? y : size + 100;
  }, [animatedProgress, size]);

  const bubble5Y = useDerivedValue(() => {
    const currentProgress = Math.max(0, Math.min(1, animatedProgress.value));
    const liquidHeight = currentProgress * size;
    const liquidTop = size - liquidHeight;
    if (liquidHeight <= 0) return size + 100;
    const animVal = bubble5Anim.value;
    const y = bubbles[4].baseY - (bubbles[4].baseY - liquidTop + 20) * animVal;
    return y > liquidTop + 10 ? y : size + 100;
  }, [animatedProgress, size]);

  // Display value
  const displayValue = value !== undefined ? String(value) : `${Math.round(progress * 100)}%`;

  // Gradient colors: Deep Cyan to Electric Blue
  const gradientColors = ['#00B8CC', '#00E5FF', '#00D4FF', '#0066FF'];
  const gradientStops = [0, 0.3, 0.7, 1];

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Canvas style={{ width: size, height: size }}>
        {/* Clip to circular shape */}
        <Group clip={clipPath}>
          {/* Radial gradient background (back-lit effect) */}
          <Circle cx={center.x} cy={center.y} r={radius}>
            <RadialGradient
              c={vec(center.x, center.y)}
              r={radius}
              colors={[
                theme.colors.primary + '15', // Very subtle glow
                theme.colors.primary + '05',
                'transparent',
              ]}
            />
          </Circle>

          {/* Liquid Fill with Glow (blurred duplicate for bloom effect) */}
          <Group>
            {/* Blurred glow layer */}
            <Path path={liquidPath}>
              <Blur blur={8} />
              <LinearGradient
                start={vec(radius, size)}
                end={vec(radius, 0)}
                colors={gradientColors}
                positions={gradientStops}
              />
            </Path>
            
            {/* Main liquid fill */}
            <Path path={liquidPath}>
              <LinearGradient
                start={vec(radius, size)}
                end={vec(radius, 0)}
                colors={gradientColors}
                positions={gradientStops}
              />
            </Path>
          </Group>

          {/* Floating bubbles - using rrect for clipping or just render them */}
          <Circle cx={bubbles[0].x} cy={bubble1Y} r={bubbles[0].size} opacity={0.4}>
            <LinearGradient
              start={vec(bubbles[0].x - bubbles[0].size, bubble1Y.value - bubbles[0].size)}
              end={vec(bubbles[0].x + bubbles[0].size, bubble1Y.value + bubbles[0].size)}
              colors={[theme.colors.primary + '80', theme.colors.primary + '20']}
            />
          </Circle>
          <Circle cx={bubbles[1].x} cy={bubble2Y} r={bubbles[1].size} opacity={0.4}>
            <LinearGradient
              start={vec(bubbles[1].x - bubbles[1].size, bubble2Y.value - bubbles[1].size)}
              end={vec(bubbles[1].x + bubbles[1].size, bubble2Y.value + bubbles[1].size)}
              colors={[theme.colors.primary + '80', theme.colors.primary + '20']}
            />
          </Circle>
          <Circle cx={bubbles[2].x} cy={bubble3Y} r={bubbles[2].size} opacity={0.4}>
            <LinearGradient
              start={vec(bubbles[2].x - bubbles[2].size, bubble3Y.value - bubbles[2].size)}
              end={vec(bubbles[2].x + bubbles[2].size, bubble3Y.value + bubbles[2].size)}
              colors={[theme.colors.primary + '80', theme.colors.primary + '20']}
            />
          </Circle>
          <Circle cx={bubbles[3].x} cy={bubble4Y} r={bubbles[3].size} opacity={0.4}>
            <LinearGradient
              start={vec(bubbles[3].x - bubbles[3].size, bubble4Y.value - bubbles[3].size)}
              end={vec(bubbles[3].x + bubbles[3].size, bubble4Y.value + bubbles[3].size)}
              colors={[theme.colors.primary + '80', theme.colors.primary + '20']}
            />
          </Circle>
          <Circle cx={bubbles[4].x} cy={bubble5Y} r={bubbles[4].size} opacity={0.4}>
            <LinearGradient
              start={vec(bubbles[4].x - bubbles[4].size, bubble5Y.value - bubbles[4].size)}
              end={vec(bubbles[4].x + bubbles[4].size, bubble5Y.value + bubbles[4].size)}
              colors={[theme.colors.primary + '80', theme.colors.primary + '20']}
            />
          </Circle>
        </Group>
      </Canvas>

      {/* Center Content - Using React Native Text with shadow */}
      <View style={styles.centerContent}>
        {typeof value === 'string' && value.includes('\n') ? (
          // Multi-line message (for challenge completion)
          <Text style={[styles.messageText, { fontSize: size * 0.12, lineHeight: size * 0.15 }]}>
            {value.split('\n').map((line, index) => (
              <Text key={index}>
                {line}
                {index < value.split('\n').length - 1 && '\n'}
              </Text>
            ))}
          </Text>
        ) : (
          // Single value (drops count or percentage)
          <Text style={[styles.valueText, getNumberStyle(64)]}>
            {displayValue}
          </Text>
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerContent: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    height: '100%',
    zIndex: 10,
  },
  valueText: {
    color: theme.colors.text,
    fontWeight: 'bold',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  messageText: {
    color: theme.colors.secondary,
    fontWeight: 'bold',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
});

export default LiquidGauge;
