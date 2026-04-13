import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import {
  Canvas,
  Path,
  LinearGradient,
  vec,
  Skia,
  Blur,
  Group,
  RoundedRect,
} from '@shopify/react-native-skia';
import {
  useDerivedValue,
  useSharedValue,
  useFrameCallback,
  withTiming,
  Easing,
} from 'react-native-reanimated';

const WAVE1_AMP = 5;
const WAVE2_AMP = 3.5;
const WAVE1_FREQ = 1.3;
const WAVE2_FREQ = 0.9;
const WAVE_SPEED = 1.8;

interface LiquidFillProps {
  width: number;
  height: number;
  /** 0–1 fill level */
  fillPercent: number;
  color?: string;
  colorEnd?: string;
  borderRadius?: number;
}

export function LiquidFill({
  width,
  height,
  fillPercent,
  color = 'rgba(0, 229, 255, 0.28)',
  colorEnd = 'rgba(0, 184, 204, 0.45)',
  borderRadius = 18,
}: LiquidFillProps) {
  const waveTime = useSharedValue(0);
  const lastFrameTime = useSharedValue(0);
  const animFill = useSharedValue(0);

  useFrameCallback((info) => {
    const now = info.timestamp;
    if (lastFrameTime.value === 0) {
      lastFrameTime.value = now;
      return;
    }
    const dt = Math.min((now - lastFrameTime.value) / 1000, 0.05);
    lastFrameTime.value = now;
    waveTime.value += dt * WAVE_SPEED;
  });

  useEffect(() => {
    animFill.value = withTiming(Math.min(Math.max(fillPercent, 0), 1), {
      duration: 1200,
      easing: Easing.out(Easing.cubic),
    });
  }, [fillPercent, animFill]);

  // Clip rect as a Skia rounded-rect path for Group clip
  const clipPath = Skia.Path.Make();
  const clipRRect = Skia.RRectXY(
    Skia.XYWHRect(0, 0, width, height),
    borderRadius,
    borderRadius,
  );
  clipPath.addRRect(clipRRect);

  const wavePath = useDerivedValue(() => {
    const fill = animFill.value;
    const t = waveTime.value;
    const waterY = height * (1 - fill);
    const steps = 50;

    const path = Skia.Path.Make();
    path.moveTo(0, height);
    path.lineTo(0, waterY);

    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * width;
      const norm = x / width;
      const w1 = Math.sin(t * 2.2 + norm * WAVE1_FREQ * 2 * Math.PI) * WAVE1_AMP;
      const w2 = Math.sin(t * 1.5 + norm * WAVE2_FREQ * 2 * Math.PI + 1.3) * WAVE2_AMP;
      path.lineTo(x, waterY + w1 + w2);
    }

    path.lineTo(width, height);
    path.close();

    return path;
  }, [animFill, waveTime]);

  const bgPath = useDerivedValue(() => {
    const fill = animFill.value;
    const t = waveTime.value;
    const waterY = height * (1 - fill) + 3;
    const steps = 50;

    const path = Skia.Path.Make();
    path.moveTo(0, height);
    path.lineTo(0, waterY);

    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * width;
      const norm = x / width;
      const w1 = Math.sin(t * 1.6 + norm * WAVE2_FREQ * 2 * Math.PI + 0.8) * WAVE2_AMP * 1.2;
      const w2 = Math.sin(t * 1.1 + norm * WAVE1_FREQ * 2 * Math.PI + 2.5) * WAVE1_AMP * 0.7;
      path.lineTo(x, waterY + w1 + w2);
    }

    path.lineTo(width, height);
    path.close();

    return path;
  }, [animFill, waveTime]);

  return (
    <Canvas style={[StyleSheet.absoluteFill, { width, height }]}>
      <Group clip={clipPath}>
        <Path path={bgPath} opacity={0.5}>
          <Blur blur={2} />
          <LinearGradient
            start={vec(0, height * 0.4)}
            end={vec(0, height)}
            colors={[color, colorEnd]}
          />
        </Path>
        <Path path={wavePath} opacity={0.85}>
          <LinearGradient
            start={vec(0, height * 0.3)}
            end={vec(0, height)}
            colors={[color, colorEnd]}
          />
        </Path>
      </Group>
    </Canvas>
  );
}
