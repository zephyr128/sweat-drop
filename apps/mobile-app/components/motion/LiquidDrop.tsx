import React, { useEffect } from 'react';
import { View } from 'react-native';
import {
  Canvas,
  Path,
  Skia,
  Group,
} from '@shopify/react-native-skia';
import {
  useSharedValue,
  useDerivedValue,
  withRepeat,
  withTiming,
  Easing,
  SharedValue,
} from 'react-native-reanimated';
import { DROP_PHYSICS } from '@/lib/motion/drop-physics';

interface LiquidDropProps {
  /** Horizontal space the drop is allowed to occupy. */
  width: number;
  /** 0..1 shared value — 0 = nothing, 1 = fully pulled. */
  progress: SharedValue<number>;
  /** When true, plays a gentle breathing loop instead of reading progress. */
  refreshing: boolean;
  /** Primary drop color. Use branding.primary. */
  color: string;
}

/**
 * LiquidDrop — a classic teardrop rendered with Skia.
 *
 * Shape is built from 4 cubic-bezier quadrants:
 *   - two top quadrants form a gently-pointed tip (tangent ≈ vertical)
 *   - two bottom quadrants form a perfect hemisphere (using the classic
 *     0.5523 bezier-circle approximation constant so the bottom looks
 *     like a real water droplet and not a lemon).
 *
 * As the user pulls, the drop grows in size (dropW: 18→40, dropH: 23→52)
 * AND its tip descends (tipY: 12→62), giving the illusion of water
 * gathering from the top edge and starting to fall.
 */
export function LiquidDrop({ width, progress, refreshing, color }: LiquidDropProps) {
  const height = DROP_PHYSICS.CANVAS_HEIGHT;
  const refreshPhase = useSharedValue(0);

  useEffect(() => {
    if (refreshing) {
      refreshPhase.value = 0;
      refreshPhase.value = withRepeat(
        withTiming(1, {
          duration: DROP_PHYSICS.REFRESH_CYCLE_MS,
          easing: Easing.inOut(Easing.ease),
        }),
        -1,
        true,
      );
    } else {
      refreshPhase.value = withTiming(0, { duration: 180 });
    }
  }, [refreshing, refreshPhase]);

  // While refreshing, oscillate 0.7 → 1.0 for a subtle "breathing" pulse.
  // Otherwise mirror the pull progress.
  const shownProgress = useDerivedValue(() => {
    'worklet';
    if (refreshing) return 0.7 + 0.3 * refreshPhase.value;
    return Math.min(1, Math.max(0, progress.value));
  });

  const dropPath = useDerivedValue(() => {
    'worklet';
    const p = shownProgress.value;
    const cx = width / 2;

    // Drop grows in size as pull grows — classical proportions.
    const dropW = 18 + 22 * p;          // 18px → 40px wide
    const halfW = dropW / 2;
    const dropH = dropW * 1.3;          // teardrop is ~1.3× taller than wide
    const tipY = 12 + 50 * p;           // drop "emerges" and descends
    const widestY = tipY + dropH * 0.62;
    const bottomY = tipY + dropH;
    const topH = widestY - tipY;
    const bottomH = bottomY - widestY;  // ≈ halfW — a hemisphere at the bottom
    const K = 0.5523;                   // cubic approximation for a quarter circle

    const path = Skia.Path.Make();
    // Start at the tip
    path.moveTo(cx, tipY);
    // (1) tip → left-widest — long gentle curve, tangent ≈ vertical at tip
    path.cubicTo(
      cx,         tipY + topH * 0.5,
      cx - halfW, widestY - topH * 0.5,
      cx - halfW, widestY,
    );
    // (2) left-widest → bottom-center — proper quarter circle
    path.cubicTo(
      cx - halfW,        widestY + bottomH * K,
      cx - bottomH * K,  bottomY,
      cx,                bottomY,
    );
    // (3) bottom-center → right-widest — mirror of (2)
    path.cubicTo(
      cx + bottomH * K,  bottomY,
      cx + halfW,        widestY + bottomH * K,
      cx + halfW,        widestY,
    );
    // (4) right-widest → tip — mirror of (1)
    path.cubicTo(
      cx + halfW, widestY - topH * 0.5,
      cx,         tipY + topH * 0.5,
      cx,         tipY,
    );
    path.close();
    return path;
  });

  // Fade in quickly with pull; always visible while refreshing.
  const dropOpacity = useDerivedValue(() => {
    'worklet';
    if (refreshing) return 1;
    return Math.min(1, progress.value / 0.12);
  });

  return (
    <View
      pointerEvents="none"
      style={{ width, height, position: 'absolute', top: 0, left: 0 }}
    >
      <Canvas style={{ width, height }}>
        <Group opacity={dropOpacity}>
          <Path path={dropPath} color={color} style="fill" />
        </Group>
      </Canvas>
    </View>
  );
}
