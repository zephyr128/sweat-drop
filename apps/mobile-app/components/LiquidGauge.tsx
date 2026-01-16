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
import { useSharedValue, withTiming, useDerivedValue, useAnimatedReaction, useFrameCallback, cancelAnimation, Easing, withSpring, SharedValue } from 'react-native-reanimated';
import { theme, getNumberStyle } from '@/lib/theme';

interface LiquidGaugeProps {
  progress: number | SharedValue<number>; // 0 to 1 (can be number or SharedValue)
  value?: number | string; // The number/percentage to display in the center
  size?: number; // Diameter of the gauge
  strokeWidth?: number; // Width of the border
  rpm?: SharedValue<number>; // RPM for dynamic glow synchronization
}

export interface LiquidGaugeRef {
  triggerImpact: () => void; // Trigger slosh/impact effect
}

// Spring configuration for impact physics
const springConfig = {
  damping: 15,
  stiffness: 100,
  mass: 1,
};

// Impact spring config (more dramatic)
const impactSpringConfig = {
  damping: 10,
  stiffness: 100,
  mass: 0.8,
};

const LiquidGauge = forwardRef<LiquidGaugeRef, LiquidGaugeProps>(({
  progress,
  value,
  size = 280,
  strokeWidth = 4,
  rpm,
}, ref) => {
  const radius = size / 2;
  const center = { x: radius, y: radius };

  // Use Reanimated's useSharedValue for animations
  const animatedProgress = useSharedValue(0);
  // Battery Optimization: Single clock source for all waves (useFrameCallback)
  const waveTime = useSharedValue(0); // Single time counter that increments every frame
  const lastFrameTime = useSharedValue(0);
  const isInitialized = useSharedValue(false);
  const impactAnim = useSharedValue(0); // For slosh/impact effect (controls wave amplitude)
  const waterLevelOffset = useSharedValue(0); // For spring-based water level oscillation
  const auraPulse = useSharedValue(0); // Dynamic glow aura pulse

  // Bubble animations (3-5 bubbles)
  const bubble1Anim = useSharedValue(Math.random());
  const bubble2Anim = useSharedValue(Math.random());
  const bubble3Anim = useSharedValue(Math.random());
  const bubble4Anim = useSharedValue(Math.random());
  const bubble5Anim = useSharedValue(Math.random());

  // Performance: Pre-calculate bubble positions in useMemo
  const bubbles = useMemo(() => [
    { id: 1, x: radius * 0.4 + Math.random() * radius * 1.2, baseY: size * 0.4, size: 5, speed: 0.4, anim: bubble1Anim },
    { id: 2, x: radius * 0.3 + Math.random() * radius * 1.4, baseY: size * 0.5, size: 7, speed: 0.35, anim: bubble2Anim },
    { id: 3, x: radius * 0.5 + Math.random() * radius * 1.0, baseY: size * 0.35, size: 4, speed: 0.5, anim: bubble3Anim },
    { id: 4, x: radius * 0.2 + Math.random() * radius * 1.6, baseY: size * 0.45, size: 6, speed: 0.3, anim: bubble4Anim },
    { id: 5, x: radius * 0.6 + Math.random() * radius * 0.8, baseY: size * 0.3, size: 5, speed: 0.45, anim: bubble5Anim },
  ], [radius, size]);

  // Performance: Pre-calculate gradient colors and stops in useMemo
  const gradientColors = useMemo(() => ['#00E5FF', '#00D4FF', '#00B8CC', '#0066FF'], []);
  const gradientStops = useMemo(() => [0, 0.3, 0.7, 1], []);

  // Performance: Pre-calculate clip path in useMemo (static circle)
  const clipPath = useMemo(() => {
    const path = Skia.Path.Make();
    path.addCircle(center.x, center.y, radius);
    return path;
  }, [radius, center.x, center.y]);

  useEffect(() => {
    // Animate bubbles rising continuously
    bubbles.forEach((bubble) => {
      bubble.anim.value = withTiming(1, {
        duration: (2000 + Math.random() * 2000) / bubble.speed,
        easing: Easing.linear,
      });
    });
  }, []);

  // Battery Optimization: Single clock source using useFrameCallback
  // All 3 waves calculated from one time counter with phase offsets
  useFrameCallback((frameInfo) => {
    'worklet';
    // Initialize on first frame
    if (!isInitialized.value) {
      lastFrameTime.value = frameInfo.timestamp;
      isInitialized.value = true;
      return;
    }
    
    // Calculate frame delta
    const deltaTime = (frameInfo.timestamp - lastFrameTime.value) / 1000; // Convert ms to seconds
    lastFrameTime.value = frameInfo.timestamp;
    
    // Increment wave time counter (continuous, never resets)
    // Speed: 1 full cycle (2π) per 1.8 seconds for base wave
    const waveSpeed = (2 * Math.PI) / 1.8; // Radians per second
    waveTime.value = (waveTime.value + deltaTime * waveSpeed) % (2 * Math.PI);
  });

  // Dynamic aura pulse synchronized with RPM
  useEffect(() => {
    if (rpm) {
      auraPulse.value = withTiming(1, {
        duration: 2000,
        easing: Easing.inOut(Easing.ease),
      });
    }
  }, [rpm, auraPulse]);

  // Update animated progress with spring physics when prop changes
  useEffect(() => {
    if (typeof progress === 'number') {
      animatedProgress.value = withSpring(progress, springConfig);
    }
  }, [typeof progress === 'number' ? progress : undefined, animatedProgress]);
  
  // If progress is SharedValue, use useAnimatedReaction for real-time updates on UI thread
  useAnimatedReaction(
    () => {
      'worklet';
      if (typeof progress === 'number') {
        return progress;
      }
      return (progress as SharedValue<number>).value;
    },
    (currentProgress) => {
      'worklet';
      if (typeof progress !== 'number') {
        // Update directly on UI thread if SharedValue (real-time updates)
        animatedProgress.value = withSpring(currentProgress, springConfig);
      }
    },
    [progress]
  );

  // Expose triggerImpact function to parent with spring physics
  useImperativeHandle(ref, () => ({
    triggerImpact: () => {
      // Organic Waves: Impact anim controls wave amplitude with spring physics
      // When drop hits, waves 'go wild' then settle
      impactAnim.value = withSpring(1, impactSpringConfig, () => {
        // After impact, settle back to base
        impactAnim.value = withSpring(0, springConfig);
      });

      // Water level oscillation
      waterLevelOffset.value = withSpring(8, impactSpringConfig, () => {
        waterLevelOffset.value = withSpring(0, springConfig);
      });
    },
  }));

  // Performance: Optimized bubble positions (shared calculation for liquidTop)
  // MUST be defined BEFORE liquidPath uses it
  const liquidTop = useDerivedValue(() => {
    if (!animatedProgress) return size;
    const currentProgress = Math.max(0, Math.min(1, animatedProgress.value));
    const liquidHeight = currentProgress * size;
    return size - liquidHeight;
  }, [animatedProgress, size]);

  // Battery Optimization: Calculate all 3 wave offsets from single time counter
  // Wave 1: Fast (base speed)
  // Wave 2: Medium (0.8x speed, phase offset π/3)
  // Wave 3: Slow (0.6x speed, phase offset π/6)
  const wave1Offset = useDerivedValue(() => {
    return waveTime.value; // Fast wave (base speed)
  }, [waveTime]);

  const wave2Offset = useDerivedValue(() => {
    return (waveTime.value * 0.8) + (Math.PI / 3); // Medium wave (0.8x speed, phase offset)
  }, [waveTime]);

  const wave3Offset = useDerivedValue(() => {
    return (waveTime.value * 0.6) + (Math.PI / 6); // Slow wave (0.6x speed, phase offset)
  }, [waveTime]);

  // Create the liquid path with organic wave system
  // Battery Optimization: Uses single time counter with phase offsets (no 3 independent animations)
  const liquidPath = useDerivedValue(() => {
    if (!animatedProgress || !liquidTop || !waterLevelOffset) {
      return Skia.Path.Make();
    }
    const currentProgress = Math.max(0, Math.min(1, animatedProgress.value));
    const liquidHeight = currentProgress * size;
    const currentLiquidTop = liquidTop.value + waterLevelOffset.value; // Use shared liquidTop + offset

    if (liquidHeight <= 0) {
      return Skia.Path.Make();
    }

    const path = Skia.Path.Make();
    path.moveTo(0, size);
    path.lineTo(0, currentLiquidTop);

    // Organic Waves: Base amplitude + impact amplitude (controlled by impactAnim)
    const baseWaveAmplitude = 4;
    const impactWaveAmplitude = 25; // Increased for more dramatic effect
    const waveAmplitude = baseWaveAmplitude + (impactWaveAmplitude - baseWaveAmplitude) * impactAnim.value;
    
    // Three-layer wave system with different frequencies and phases
    // Battery Optimization: All calculated from single waveTime counter
    const frequency1 = 0.025; // Fast wave
    const frequency2 = 0.018; // Medium wave
    const frequency3 = 0.012; // Slow wave

    for (let i = 0; i <= size; i += 2) {
      // Combine three wave layers for depth
      // Battery Optimization: Use single time counter with phase offsets
      const wave1 = Math.sin(i * frequency1 + wave1Offset.value) * waveAmplitude * 0.5;
      const wave2 = Math.sin(i * frequency2 + wave2Offset.value) * waveAmplitude * 0.3;
      const wave3 = Math.sin(i * frequency3 + wave3Offset.value) * waveAmplitude * 0.2;
      const combinedWave = wave1 + wave2 + wave3;
      
      path.lineTo(i, currentLiquidTop + combinedWave);
    }

    path.lineTo(size, currentLiquidTop);
    path.lineTo(size, size);
    path.close();

    return path;
  }, [liquidTop, wave1Offset, wave2Offset, wave3Offset, impactAnim, waterLevelOffset, size]);

  // Dynamic aura glow (pulsates with RPM)
  const auraGlow = useDerivedValue(() => {
    if (!rpm) return 0;
    const normalizedRPM = Math.min(rpm.value / 120, 1);
    const baseGlow = 0.3;
    const pulseIntensity = auraPulse.value * 0.2; // 0.2 additional glow on pulse
    return baseGlow + pulseIntensity * normalizedRPM;
  }, [rpm, auraPulse]);

  // Bubble positions (optimized - use shared liquidTop)
  // Add safety checks to prevent undefined errors
  const bubble1Y = useDerivedValue(() => {
    if (!liquidTop || liquidTop.value >= size || !bubbles || !bubbles[0]) return size + 100;
    const animVal = bubble1Anim?.value ?? 0;
    const y = bubbles[0].baseY - (bubbles[0].baseY - liquidTop.value + 20) * animVal;
    return y > liquidTop.value + 10 ? y : size + 100;
  }, [liquidTop, bubbles]);

  const bubble2Y = useDerivedValue(() => {
    if (!liquidTop || liquidTop.value >= size || !bubbles || !bubbles[1]) return size + 100;
    const animVal = bubble2Anim?.value ?? 0;
    const y = bubbles[1].baseY - (bubbles[1].baseY - liquidTop.value + 20) * animVal;
    return y > liquidTop.value + 10 ? y : size + 100;
  }, [liquidTop, bubbles]);

  const bubble3Y = useDerivedValue(() => {
    if (!liquidTop || liquidTop.value >= size || !bubbles || !bubbles[2]) return size + 100;
    const animVal = bubble3Anim?.value ?? 0;
    const y = bubbles[2].baseY - (bubbles[2].baseY - liquidTop.value + 20) * animVal;
    return y > liquidTop.value + 10 ? y : size + 100;
  }, [liquidTop, bubbles]);

  const bubble4Y = useDerivedValue(() => {
    if (!liquidTop || liquidTop.value >= size || !bubbles || !bubbles[3]) return size + 100;
    const animVal = bubble4Anim?.value ?? 0;
    const y = bubbles[3].baseY - (bubbles[3].baseY - liquidTop.value + 20) * animVal;
    return y > liquidTop.value + 10 ? y : size + 100;
  }, [liquidTop, bubbles]);

  const bubble5Y = useDerivedValue(() => {
    if (!liquidTop || liquidTop.value >= size || !bubbles || !bubbles[4]) return size + 100;
    const animVal = bubble5Anim?.value ?? 0;
    const y = bubbles[4].baseY - (bubbles[4].baseY - liquidTop.value + 20) * animVal;
    return y > liquidTop.value + 10 ? y : size + 100;
  }, [liquidTop, bubbles]);

  // Display value
  const displayValue = value !== undefined ? String(value) : `${Math.round((typeof progress === 'number' ? progress : progress.value) * 100)}%`;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Canvas style={{ width: size, height: size }}>
        {/* Dynamic Aura Glow (pulsates with RPM) */}
        <Circle cx={center.x} cy={center.y} r={radius + 10}>
          <RadialGradient
            c={vec(center.x, center.y)}
            r={radius + 10}
            colors={[
              theme.colors.primary + Math.floor(auraGlow.value * 255).toString(16).padStart(2, '0'),
              theme.colors.primary + Math.floor(auraGlow.value * 180).toString(16).padStart(2, '0'),
              'transparent',
            ]}
          />
        </Circle>

        {/* Fix Visibility: Use Group with clip (no Mask mode needed - clip works directly) */}
        <Group clip={clipPath}>
          {/* Glassmorphism: Inner glow background */}
          <Circle cx={center.x} cy={center.y} r={radius}>
            <RadialGradient
              c={vec(center.x, center.y)}
              r={radius}
              colors={[
                theme.colors.primary + '25', // Inner glow
                theme.colors.primary + '10',
                'transparent',
              ]}
            />
          </Circle>

          {/* Liquid Fill with organic wave system - MUST BE VISIBLE */}
          {/* Fix Visibility: Path uses relative coordinates (0 to size) which are correct */}
          <Group>
            {/* Layer 3: Slow wave (background, most transparent) */}
            <Path path={liquidPath} opacity={0.5}>
              <Blur blur={3} />
              <LinearGradient
                start={vec(radius, size)}
                end={vec(radius, 0)}
                colors={gradientColors}
                positions={gradientStops}
              />
            </Path>
            
            {/* Layer 2: Medium wave (middle, medium opacity) */}
            <Path path={liquidPath} opacity={0.8}>
              <Blur blur={1} />
              <LinearGradient
                start={vec(radius, size)}
                end={vec(radius, 0)}
                colors={gradientColors}
                positions={gradientStops}
              />
            </Path>
            
            {/* Layer 1: Fast wave (foreground, full opacity) - Glass Look: Lighter on top */}
            <Path path={liquidPath} opacity={1}>
              <LinearGradient
                start={vec(radius, size)}
                end={vec(radius, 0)}
                colors={gradientColors}
                positions={gradientStops}
              />
            </Path>
          </Group>

          {/* Floating bubbles - Performance: Optimized with shared liquidTop calculation */}
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

      {/* Center Content - Premium shadow and blur for readability */}
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
          // Single value (drops count or percentage) with premium shadow
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
    // Premium shadow and blur for readability
    textShadowColor: 'rgba(0, 0, 0, 0.9)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 12,
    // Additional iOS-style shadow layers
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.8,
    shadowRadius: 16,
  },
  messageText: {
    color: theme.colors.secondary,
    fontWeight: 'bold',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.9)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.8,
    shadowRadius: 16,
  },
});

export default LiquidGauge;
