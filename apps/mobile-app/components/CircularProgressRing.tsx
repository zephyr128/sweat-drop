import React, { useEffect, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import {
  Canvas,
  Path,
  Skia,
  Line,
  Shadow,
  vec,
  Group,
  LinearGradient,
} from '@shopify/react-native-skia';
import { useDerivedValue, useSharedValue, useFrameCallback, withRepeat, withTiming, withSequence, Easing, SharedValue } from 'react-native-reanimated';
import Animated, { useAnimatedStyle, interpolateColor } from 'react-native-reanimated';
import { theme } from '@/lib/theme';
import { useBranding } from '@/lib/hooks/useBranding';

interface CircularProgressRingProps {
  progress: number; // 0 to 1
  size?: number; // Diameter of the ring
  strokeWidth?: number; // Width of the ring
  rpm?: SharedValue<number>; // RPM for laser sweep speed
  primaryColor?: string; // Dynamic primary color from branding
}

// Premium Pulse Rings Component: GPU-only animations with interpolateColor
// Animations run once in useEffect (infinite loop), intensity modified by RPM via useDerivedValue
const PulseRings = ({ rpm, primaryColor }: { rpm?: SharedValue<number>, primaryColor?: string }) => {
  const branding = useBranding();
  const dynamicPrimaryColor = useMemo(() => primaryColor || branding.primary, [primaryColor, branding.primary]);
  // Base pulse animations (run once, infinite loop)
  const pulseRing1Scale = useSharedValue(1);
  const pulseRing1Opacity = useSharedValue(0.2);
  const pulseRing2Scale = useSharedValue(1);
  const pulseRing2Opacity = useSharedValue(0.15);
  const pulseRing3Scale = useSharedValue(1);
  const pulseRing3Opacity = useSharedValue(0.1);

  // Start pulse animations ONCE in useEffect (infinite loop, never resets)
  useEffect(() => {
    // Ring 1 (innermost): Fastest, most intense
    const ring1Duration = 1200;
    pulseRing1Scale.value = withRepeat(
      withSequence(
        withTiming(1.15, { duration: ring1Duration / 2, easing: Easing.out(Easing.ease) }),
        withTiming(1, { duration: ring1Duration / 2, easing: Easing.in(Easing.ease) })
      ),
      -1,
      false
    );

    pulseRing1Opacity.value = withRepeat(
      withSequence(
        withTiming(0.6, { duration: ring1Duration / 2, easing: Easing.out(Easing.ease) }),
        withTiming(0.2, { duration: ring1Duration / 2, easing: Easing.in(Easing.ease) })
      ),
      -1,
      false
    );

    // Ring 2 (middle): Medium speed
    const ring2Duration = 1600;
    setTimeout(() => {
      pulseRing2Scale.value = withRepeat(
        withSequence(
          withTiming(1.12, { duration: ring2Duration / 2, easing: Easing.out(Easing.ease) }),
          withTiming(1, { duration: ring2Duration / 2, easing: Easing.in(Easing.ease) })
        ),
        -1,
        false
      );

      pulseRing2Opacity.value = withRepeat(
        withSequence(
          withTiming(0.5, { duration: ring2Duration / 2, easing: Easing.out(Easing.ease) }),
          withTiming(0.15, { duration: ring2Duration / 2, easing: Easing.in(Easing.ease) })
        ),
        -1,
        false
      );
    }, ring2Duration * 0.2);

    // Ring 3 (outermost): Slowest, most subtle
    const ring3Duration = 2000;
    setTimeout(() => {
      pulseRing3Scale.value = withRepeat(
        withSequence(
          withTiming(1.1, { duration: ring3Duration / 2, easing: Easing.out(Easing.ease) }),
          withTiming(1, { duration: ring3Duration / 2, easing: Easing.in(Easing.ease) })
        ),
        -1,
        false
      );

      pulseRing3Opacity.value = withRepeat(
        withSequence(
          withTiming(0.3, { duration: ring3Duration / 2, easing: Easing.out(Easing.ease) }),
          withTiming(0.1, { duration: ring3Duration / 2, easing: Easing.in(Easing.ease) })
        ),
        -1,
        false
      );
    }, ring3Duration * 0.3);
  }, []);

  // GPU-Only: Modify intensity based on RPM via useDerivedValue
  const ring1Intensity = useDerivedValue(() => {
    if (!rpm || rpm.value <= 0) return 0;
    const normalizedRPM = Math.min(rpm.value / 100, 1);
    return normalizedRPM;
  }, [rpm]);

  const ring2Intensity = useDerivedValue(() => {
    if (!rpm || rpm.value <= 0) return 0;
    const normalizedRPM = Math.min(rpm.value / 100, 1);
    return normalizedRPM * 0.8; // Slightly less intense
  }, [rpm]);

  const ring3Intensity = useDerivedValue(() => {
    if (!rpm || rpm.value <= 0) return 0;
    const normalizedRPM = Math.min(rpm.value / 100, 1);
    return normalizedRPM * 0.6; // Least intense
  }, [rpm]);

  // GPU-Only: Color interpolation using interpolateColor with dynamic primary color
  const ring1Color = useDerivedValue(() => {
    if (!rpm || rpm.value <= 0) {
      return theme.colors.textSecondary;
    }
    const currentPrimaryColor = dynamicPrimaryColor;
    return interpolateColor(
      rpm.value,
      [0, 65, 80, 100, 120],
      [
        theme.colors.textSecondary, // 0 RPM: Gray
        currentPrimaryColor, // 65 RPM: Dynamic primary color
        '#00FF88', // 80 RPM: Green
        '#FF6600', // 100 RPM: Orange
        '#FF3300', // 120 RPM: Red
      ]
    );
  }, [rpm, dynamicPrimaryColor, primaryColor, branding.primary]);

  const ring2Color = useDerivedValue(() => {
    if (!rpm || rpm.value <= 0) {
      return theme.colors.textSecondary + 'CC';
    }
    const currentPrimaryColor = dynamicPrimaryColor;
    const baseColor = interpolateColor(
      rpm.value,
      [0, 65, 80, 100, 120],
      [
        theme.colors.textSecondary, // 0 RPM: Gray
        currentPrimaryColor, // 65 RPM: Dynamic primary color
        '#00FF88', // 80 RPM: Green
        '#FF6600', // 100 RPM: Orange
        '#FF3300', // 120 RPM: Red
      ]
    );
    return baseColor + 'CC'; // 80% opacity
  }, [rpm, dynamicPrimaryColor, primaryColor, branding.primary]);

  const ring3Color = useDerivedValue(() => {
    if (!rpm || rpm.value <= 0) {
      return theme.colors.textSecondary + '80';
    }
    const currentPrimaryColor = dynamicPrimaryColor;
    const baseColor = interpolateColor(
      rpm.value,
      [0, 65, 80, 100, 120],
      [
        theme.colors.textSecondary, // 0 RPM: Gray
        currentPrimaryColor, // 65 RPM: Dynamic primary color
        '#00FF88', // 80 RPM: Green
        '#FF6600', // 100 RPM: Orange
        '#FF3300', // 120 RPM: Red
      ]
    );
    return baseColor + '80'; // 50% opacity
  }, [rpm, dynamicPrimaryColor, primaryColor, branding.primary]);

  // GPU-Only: Animated styles with interpolateColor (no JS thread blocking)
  const ring1Style = useAnimatedStyle(() => {
    const intensity = ring1Intensity.value;
    const baseScale = pulseRing1Scale.value;
    const baseOpacity = pulseRing1Opacity.value;
    return {
      transform: [{ scale: 1 + (baseScale - 1) * intensity }],
      opacity: baseOpacity * (0.5 + intensity * 0.5), // Scale opacity with intensity
      borderColor: ring1Color.value,
      shadowColor: ring1Color.value,
    };
  });

  const ring2Style = useAnimatedStyle(() => {
    const intensity = ring2Intensity.value;
    const baseScale = pulseRing2Scale.value;
    const baseOpacity = pulseRing2Opacity.value;
    return {
      transform: [{ scale: 1 + (baseScale - 1) * intensity }],
      opacity: baseOpacity * (0.5 + intensity * 0.5), // Scale opacity with intensity
      borderColor: ring2Color.value,
      shadowColor: ring2Color.value,
    };
  });

  const ring3Style = useAnimatedStyle(() => {
    const intensity = ring3Intensity.value;
    const baseScale = pulseRing3Scale.value;
    const baseOpacity = pulseRing3Opacity.value;
    return {
      transform: [{ scale: 1 + (baseScale - 1) * intensity }],
      opacity: baseOpacity * (0.5 + intensity * 0.5), // Scale opacity with intensity
      borderColor: ring3Color.value,
      shadowColor: ring3Color.value,
    };
  });

  // Only show rings when RPM > 0
  const shouldShow = useDerivedValue(() => {
    return rpm && rpm.value > 0;
  }, [rpm]);

  if (!shouldShow.value) {
    return null;
  }

  return (
    <>
      {/* Ring 3 (outermost): Slowest, most subtle */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: 320,
            height: 320,
            borderRadius: 160,
            borderWidth: 2,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.8,
            shadowRadius: 12,
          },
          ring3Style,
        ]}
      />
      {/* Ring 2 (middle): Medium speed */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: 310,
            height: 310,
            borderRadius: 155,
            borderWidth: 2,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.8,
            shadowRadius: 12,
          },
          ring2Style,
        ]}
      />
      {/* Ring 1 (innermost): Fastest, most intense */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: 300,
            height: 300,
            borderRadius: 150,
            borderWidth: 2,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.8,
            shadowRadius: 12,
          },
          ring1Style,
        ]}
      />
    </>
  );
};

export default function CircularProgressRing({
  progress,
  size = 290,
  strokeWidth = 3,
  rpm,
  primaryColor,
}: CircularProgressRingProps) {
  const branding = useBranding();
  const dynamicPrimaryColor = primaryColor || branding.primary;
  
  const radius = size / 2;
  const center = { x: radius, y: radius };
  const trackRadius = radius - strokeWidth / 2;
  
  // Premium Smooth Animations: Completely decoupled from BLE data stream
  const laserSweepAngle = useSharedValue(0);
  const pulseValue = useSharedValue(0); // Continuous pulse (0 to 1, never stops)
  const lastFrameTime = useSharedValue(0); // Track last frame time for smooth rotation
  const isInitialized = useSharedValue(false);
  
  // Pulsiranje bez seckanja: Start continuous pulse ONCE in useEffect (runs forever in background)
  useEffect(() => {
    // Pulsiranje: Continuous pulse animation (never stops, never resets)
    pulseValue.value = withRepeat(
      withTiming(1, {
        duration: 2000,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true // Reverse animation for smooth pulse (0 -> 1 -> 0 -> 1...)
    );
  }, []);

  // Fix Laser Sweep: Direct physics calculation without excessive smoothing
  // Laser behaves like a physical object: angle.value += (currentRPM * deltaTime * 6)
  // Read currentRPM directly from SharedValue without excessive smoothing that introduces delay
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
    
    // Fix Laser Sweep: Read RPM directly from SharedValue (no excessive smoothing that introduces delay)
    const currentRPM = rpm?.value ?? 0;
    
    if (currentRPM <= 0) {
      // If RPM is 0, don't update angle (laser stays still)
      return;
    }
    
    // Fix Laser Sweep: Direct physics calculation
    // Formula: angle.value += (currentRPM * deltaTime * 6)
    // 6 degrees per second for 1 RPM = 360 degrees for 60 RPM
    const speedConstant = 6; // Degrees per second per RPM
    const angleIncrement = currentRPM * deltaTime * speedConstant;
    
    // Update angle continuously (modulo 360 to keep it in range)
    laserSweepAngle.value = (laserSweepAngle.value + angleIncrement) % 360;
  });

  // Performance: Pre-calculate tick marks in useMemo (not useDerivedValue)
  const ticks = useMemo(() => {
    const tickLength = 4;
    const tickRadius = trackRadius - strokeWidth / 2;
    const tickMarks: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];

    for (let i = 0; i < 36; i++) {
      const angle = (i * 10 * Math.PI) / 180 - Math.PI / 2; // Start from top
      const x1 = center.x + Math.cos(angle) * tickRadius;
      const y1 = center.y + Math.sin(angle) * tickRadius;
      const x2 = center.x + Math.cos(angle) * (tickRadius - tickLength);
      const y2 = center.y + Math.sin(angle) * (tickRadius - tickLength);
      
      tickMarks.push({ x1, y1, x2, y2 });
    }
    return tickMarks;
  }, [trackRadius, center.x, center.y, strokeWidth]);

  // Create background track path (static - useMemo)
  const trackPath = useMemo(() => {
    const path = Skia.Path.Make();
    path.addCircle(center.x, center.y, trackRadius);
    return path;
  }, [trackRadius, center.x, center.y]);

  // Create progress fill path (arc from top clockwise) - GPU-only calculation
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

  // Fix Laser Path: Small segment (20 degrees) calculated in useDerivedValue - GPU-only
  const laserSweepPath = useDerivedValue(() => {
    // Read RPM directly (no excessive smoothing)
    const currentRPM = rpm?.value ?? 0;
    if (currentRPM <= 0) {
      return Skia.Path.Make();
    }
    
    const path = Skia.Path.Make();
    const sweepLength = 20; // Fixed 20-degree arc
    const currentAngle = laserSweepAngle.value % 360;
    const startAngleDeg = currentAngle - sweepLength / 2; // Center the arc on current angle
    
    const rect = {
      x: center.x - trackRadius,
      y: center.y - trackRadius,
      width: trackRadius * 2,
      height: trackRadius * 2,
    };
    
    // Fix Laser Path: Use path.addArc with proper angle calculation
    path.addArc(rect, startAngleDeg, sweepLength);
    return path;
  }, [laserSweepAngle, trackRadius, center.x, center.y, rpm]);

  // Laser sweep gradient start/end points (center of 20-degree arc) - GPU-only
  const laserGradientStart = useDerivedValue(() => {
    const currentRPM = rpm?.value ?? 0;
    if (currentRPM <= 0) {
      return vec(center.x, center.y);
    }
    const currentAngle = laserSweepAngle.value % 360;
    const angleRad = (currentAngle * Math.PI) / 180;
    // Start point: center of laser arc (bright head)
    const x = center.x + Math.cos(angleRad) * trackRadius;
    const y = center.y + Math.sin(angleRad) * trackRadius;
    return vec(x, y);
  }, [laserSweepAngle, trackRadius, center.x, center.y, rpm]);

  const laserGradientEnd = useDerivedValue(() => {
    const currentRPM = rpm?.value ?? 0;
    if (currentRPM <= 0) {
      return vec(center.x, center.y);
    }
    const currentAngle = laserSweepAngle.value % 360;
    const angleRad = (currentAngle * Math.PI) / 180;
    // End point: slightly offset for gradient direction (tail fades)
    const x = center.x + Math.cos(angleRad) * (trackRadius + strokeWidth);
    const y = center.y + Math.sin(angleRad) * (trackRadius + strokeWidth);
    return vec(x, y);
  }, [laserSweepAngle, trackRadius, center.x, center.y, strokeWidth, rpm]);

  // Premium Pulsiranje: Smooth glow intensity that scales with RPM - GPU-only
  // pulseValue runs continuously in background, we just multiply it by normalized RPM
  const finalGlowIntensity = useDerivedValue(() => {
    const progressGlow = progress > 0.8 ? 0.5 + (progress - 0.8) * 0.5 : progress * 0.3;
    
    // Pulsiranje: pulseValue never stops, we just scale it with RPM
    const currentRPM = rpm?.value ?? 0;
    if (currentRPM <= 0) {
      return progressGlow;
    }
    
    // Normalize RPM (0 to 1) and multiply by continuous pulse
    const rpmMultiplier = Math.min(currentRPM / 100, 1); // Scale with RPM
    const pulseIntensity = pulseValue.value * 0.3; // 0 to 0.3 pulse (continuous)
    const rpmGlow = pulseIntensity * rpmMultiplier; // Scale pulse with RPM
    
    return Math.max(progressGlow, rpmGlow);
  }, [progress, pulseValue, rpm]);

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* Premium Pulse Rings: GPU-only animations with interpolateColor */}
      <PulseRings rpm={rpm} primaryColor={primaryColor} />
      
      <Canvas style={{ width: size, height: size }}>
        {/* Background track (faint, semi-transparent) */}
        <Path
          path={trackPath}
          color={theme.colors.secondary + '20'} // Very faint
          style="stroke"
          strokeWidth={strokeWidth}
          strokeCap="round"
        />

        {/* Tick marks (precision instrument look) - Pre-calculated in useMemo */}
        {ticks.map((tick, i) => (
          <Line
            key={`tick-${i}`}
            p1={vec(tick.x1, tick.y1)}
            p2={vec(tick.x2, tick.y2)}
            color={theme.colors.textSecondary + '40'}
            strokeWidth={1}
          />
        ))}

        {/* Progress fill with neon glow - Premium Pulsiranje: smooth glow with RPM */}
        {progress > 0 && (
          <Group>
            {/* Outer glow layer (thick, blurred) - projects onto background */}
            {/* Performance: Reduced blur from 16 to 4 (blur is CPU-intensive) */}
            <Path
              path={progressPath}
              color={dynamicPrimaryColor}
              style="stroke"
              strokeWidth={strokeWidth + 8}
              strokeCap="round"
              opacity={finalGlowIntensity.value * 0.4}
            >
              <Shadow dx={0} dy={0} blur={4} color={dynamicPrimaryColor} />
            </Path>
            
            {/* Middle glow layer */}
            {/* Performance: Reduced blur from 8 to 4 (blur is CPU-intensive) */}
            <Path
              path={progressPath}
              color={dynamicPrimaryColor}
              style="stroke"
              strokeWidth={strokeWidth + 4}
              strokeCap="round"
              opacity={finalGlowIntensity.value * 0.6}
            >
              <Shadow dx={0} dy={0} blur={4} color={dynamicPrimaryColor} />
            </Path>
            
            {/* Main progress stroke (solid) */}
            <Path
              path={progressPath}
              color={dynamicPrimaryColor}
              style="stroke"
              strokeWidth={strokeWidth}
              strokeCap="round"
            />
          </Group>
        )}

        {/* Fix Laser Sweep: Direct physics calculation, smooth rotation */}
        {progress > 0 && rpm && rpm.value > 0 && (
          <Group>
            <Path
              path={laserSweepPath}
              style="stroke"
              strokeWidth={strokeWidth + 3}
              strokeCap="round"
            >
              <LinearGradient
                start={laserGradientStart}
                end={laserGradientEnd}
                colors={[
                  dynamicPrimaryColor + 'FF', // Bright head (full opacity)
                  dynamicPrimaryColor + 'CC', // High opacity
                  dynamicPrimaryColor + '66', // Medium opacity
                  dynamicPrimaryColor + '00', // Fading tail (transparent)
                ]}
                positions={[0, 0.3, 0.7, 1]} // Gradient positions for smooth fade
              />
            </Path>
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
