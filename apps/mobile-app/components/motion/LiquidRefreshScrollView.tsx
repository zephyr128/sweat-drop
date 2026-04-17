import React, { forwardRef, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Platform,
  Dimensions,
  ViewStyle,
} from 'react-native';
import Animated, {
  useSharedValue,
  useDerivedValue,
  useAnimatedScrollHandler,
  withSpring,
  runOnJS,
  SharedValue,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { LiquidDrop } from './LiquidDrop';
import { DROP_PHYSICS } from '@/lib/motion/drop-physics';

type AnimatedScrollViewProps = Omit<
  React.ComponentProps<typeof Animated.ScrollView>,
  'onScroll' | 'refreshControl'
>;

export interface LiquidRefreshScrollViewProps extends AnimatedScrollViewProps {
  /** Whether a refresh is currently running. */
  refreshing: boolean;
  /** Fired when the user's pull crosses threshold. */
  onRefresh: () => void | Promise<void>;
  /** Drop color (usually branding.primary). */
  color: string;
  /**
   * Optional shared value that will be kept in sync with scroll offset.y —
   * useful when the parent has its own collapse/parallax animations driven
   * by scroll.
   */
  externalScrollY?: SharedValue<number>;
  /** Extra style for the wrapping View (absolute fill by default). */
  wrapperStyle?: ViewStyle;
  /** Trigger a light haptic tick when the pull crosses threshold. Default true. */
  hapticsOnThreshold?: boolean;
}

const SCREEN_W = Dimensions.get('window').width;

/**
 * LiquidRefreshScrollView — drop-in replacement for Animated.ScrollView with
 * a branded "liquid drop" pull-to-refresh overlay.
 *
 * Works on iOS and Android with identical visuals:
 *   - iOS: native bounces still happen; negative contentOffset feeds the drop.
 *   - Android: a Pan gesture composed Simultaneous with the ScrollView's
 *     native scroll gesture takes over when scrollY === 0 and the user
 *     pulls down past ~10px. Translation is damped to mimic iOS resistance.
 *
 * The ScrollView's native scroll is preserved (you can still flick through
 * the whole list as today). Refresh triggers at DROP_PHYSICS.PULL_THRESHOLD.
 */
export const LiquidRefreshScrollView = forwardRef<
  Animated.ScrollView,
  LiquidRefreshScrollViewProps
>(function LiquidRefreshScrollView(
  {
    refreshing,
    onRefresh,
    color,
    externalScrollY,
    wrapperStyle,
    hapticsOnThreshold = true,
    children,
    bounces,
    contentContainerStyle,
    ...scrollProps
  },
  ref,
) {
  const scrollY = useSharedValue(0);
  const pullY = useSharedValue(0);
  const refreshingSV = useSharedValue(refreshing ? 1 : 0);
  const hasHapticFiredSV = useSharedValue(0);

  useEffect(() => {
    refreshingSV.value = refreshing ? 1 : 0;
    if (!refreshing) {
      // ensure pullY collapses after refresh finishes
      pullY.value = withSpring(0, { damping: 14, stiffness: 140, mass: 0.5 });
    }
  }, [refreshing, refreshingSV, pullY]);

  // Compose scroll handler — writes both internal and external shared values.
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      'worklet';
      scrollY.value = e.contentOffset.y;
      if (externalScrollY) externalScrollY.value = e.contentOffset.y;
    },
  });

  const triggerHaptic = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // haptics unavailable (simulator / web) — swallow
    }
  };

  const triggerRefresh = () => {
    if (refreshing) return;
    Promise.resolve(onRefresh()).catch(() => {
      // errors are the caller's responsibility; we still reset UI
    });
  };

  // Cross-platform pan — activates when user pulls down at scroll top.
  // `activeOffsetY: [10, 9999]` means "only start reacting once translationY
  // exceeds 10px" so taps and small scrolls don't accidentally claim the
  // gesture. `failOffsetY: [-10, 9999]` bails out immediately if the user
  // scrolls up — never blocks normal scrolling.
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([10, 9999])
        .failOffsetY([-10, 9999])
        .onBegin(() => {
          'worklet';
          hasHapticFiredSV.value = 0;
        })
        .onUpdate((e) => {
          'worklet';
          // Only pull when already at the top of the list + not refreshing.
          if (scrollY.value <= 0 && refreshingSV.value === 0 && e.translationY > 0) {
            pullY.value = e.translationY * DROP_PHYSICS.ANDROID_PAN_DAMPING;
            if (
              pullY.value >= DROP_PHYSICS.PULL_THRESHOLD &&
              hasHapticFiredSV.value === 0
            ) {
              hasHapticFiredSV.value = 1;
              if (hapticsOnThreshold) runOnJS(triggerHaptic)();
            }
          } else {
            pullY.value = 0;
          }
        })
        .onEnd(() => {
          'worklet';
          const shouldRefresh =
            pullY.value >= DROP_PHYSICS.PULL_THRESHOLD &&
            refreshingSV.value === 0;
          if (shouldRefresh) {
            runOnJS(triggerRefresh)();
          } else {
            pullY.value = withSpring(0, {
              damping: 14,
              stiffness: 140,
              mass: 0.5,
            });
          }
        })
        .onFinalize(() => {
          'worklet';
          if (refreshingSV.value === 0 && pullY.value !== 0) {
            pullY.value = withSpring(0, {
              damping: 14,
              stiffness: 140,
              mass: 0.5,
            });
          }
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hapticsOnThreshold],
  );

  // Compose with the ScrollView's native scroll gesture so both can run.
  const composedGesture = useMemo(
    () => Gesture.Simultaneous(pan, Gesture.Native()),
    [pan],
  );

  // Drop progress (0..1) — max of Android pull distance and iOS negative bounce.
  const progress = useDerivedValue(() => {
    'worklet';
    if (refreshingSV.value === 1) return 0.7; // constant during refresh, LiquidDrop overrides anyway
    const iosBounce = Math.max(0, -scrollY.value);
    const combined = Math.max(pullY.value, iosBounce);
    return Math.min(1, combined / DROP_PHYSICS.MAX_STRETCH);
  });

  return (
    <View style={[styles.wrapper, wrapperStyle]}>
      <View pointerEvents="none" style={styles.dropOverlay}>
        <LiquidDrop
          width={SCREEN_W}
          progress={progress}
          refreshing={refreshing}
          color={color}
        />
      </View>
      <GestureDetector gesture={composedGesture}>
        <Animated.ScrollView
          ref={ref}
          {...scrollProps}
          bounces={bounces ?? Platform.OS === 'ios'}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          contentContainerStyle={contentContainerStyle}
          // Don't use a native RefreshControl — we render our own.
        >
          {children}
        </Animated.ScrollView>
      </GestureDetector>
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  dropOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: DROP_PHYSICS.CANVAS_HEIGHT,
    zIndex: 10,
    alignItems: 'center',
  },
});
