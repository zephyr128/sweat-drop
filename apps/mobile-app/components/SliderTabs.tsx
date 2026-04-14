/**
 * SliderTabs — glass-styled tab bar + swipeable pages (powered by react-native-tab-view).
 *
 * ── Mode A: Tab bar only (no children) ──
 *   <SliderTabs tabs={[...]} activeKey={key} onChange={setKey} />
 *
 * ── Mode B: Tab bar + swipeable pages (pass children) ──
 *   <SliderTabs tabs={[...]} activeKey={key} onChange={setKey}>
 *     <PageOne />
 *     <PageTwo />
 *   </SliderTabs>
 *
 * PERF: ModeABar and SliderTabsBar are React.memo'd. renderScene/renderTabBar
 * are memoized via useCallback. The redundant inner ScrollView (when
 * scrollEnabled=false) has been replaced with a plain View.
 */

import React, { Children, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { TabView, SceneRendererProps, NavigationState } from 'react-native-tab-view';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { fontStyles, hexToRgba } from '@/lib/theme';
import { useBranding } from '@/lib/contexts/ThemeContext';

const INDICATOR_HEIGHT = 3;

export interface SliderTab {
  key: string;
  label: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
}

interface SliderTabsProps {
  tabs: SliderTab[];
  activeKey: string;
  onChange: (key: string) => void;
  children?: React.ReactNode;
  accentColor?: string;
  style?: object;
  barStyle?: object;
  hideBar?: boolean;
  pageHeight?: number;
}

type Route = { key: string; title: string; icon?: React.ComponentProps<typeof Ionicons>['name'] };

const SPRING_CFG = { damping: 20, stiffness: 220, mass: 0.8 };

// ── Shared animated tab bar (used by both GlassTabBar and ModeABar) ─────────

const ModeABar = React.memo(function ModeABar({
  tabs,
  activeKey,
  accent,
  barStyle,
  onTabPress,
}: {
  tabs: SliderTab[];
  activeKey: string;
  accent: string;
  barStyle?: object;
  onTabPress: (key: string) => void;
}) {
  const tabCount = tabs.length;
  const activeIdx = tabs.findIndex((t) => t.key === activeKey);
  const safeIdx = activeIdx >= 0 ? activeIdx : 0;

  const position = useSharedValue(safeIdx);

  React.useEffect(() => {
    position.value = withSpring(safeIdx, SPRING_CFG);
  }, [safeIdx]);

  const indicatorStyle = useAnimatedStyle(() => {
    const frac = 1 / tabCount;
    return {
      left: `${position.value * frac * 100}%` as any,
      width: `${frac * 100}%` as any,
    };
  });

  const trackBg = useMemo(() => hexToRgba(accent, 0.12), [accent]);

  return (
    <View style={[styles.barContainer, barStyle]}>
      <View style={styles.trackOuter}>
        {tabs.map((tab, idx) => {
          const isActive = idx === safeIdx;
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.tabItem}
              onPress={() => onTabPress(tab.key)}
              activeOpacity={0.75}
            >
              {tab.icon && (
                <Ionicons
                  name={tab.icon}
                  size={13}
                  color={isActive ? accent : 'rgba(255,255,255,0.38)'}
                  style={styles.tabIconMargin}
                />
              )}
              <Text
                style={[styles.tabLabel, { color: isActive ? accent : 'rgba(255,255,255,0.42)' }]}
                numberOfLines={1}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={[styles.underlineTrack, { backgroundColor: trackBg }]}>
        <Animated.View style={[styles.underline, { backgroundColor: accent }, indicatorStyle]} />
      </View>
    </View>
  );
});

// ── SliderTabsBar — standalone bar for sticky header usage ──────────────────

export interface SliderTabsBarProps {
  tabs: SliderTab[];
  activeKey: string;
  onChange: (key: string) => void;
  accentColor?: string;
  style?: object;
  barStyle?: object;
}

export const SliderTabsBar = React.memo(function SliderTabsBar({
  tabs,
  activeKey,
  onChange,
  accentColor,
  style,
  barStyle,
}: SliderTabsBarProps) {
  const branding = useBranding();
  const accent = accentColor ?? branding.primary;
  const handlePress = useCallback(
    (key: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onChange(key);
    },
    [onChange],
  );
  return (
    <View style={style}>
      <ModeABar
        tabs={tabs}
        activeKey={activeKey}
        accent={accent}
        barStyle={barStyle}
        onTabPress={handlePress}
      />
    </View>
  );
});

// ── GlassTabBar — used inside TabView ───────────────────────────────────────

const GlassTabBar = React.memo(function GlassTabBar({
  navigationState,
  tabs,
  accent,
  barStyle,
  onTabPress,
}: SceneRendererProps & {
  navigationState: NavigationState<Route>;
  tabs: SliderTab[];
  accent: string;
  barStyle?: object;
  onTabPress: (key: string) => void;
}) {
  const { routes, index: activeIndex } = navigationState;
  const tabCount = routes.length;
  const pos = useSharedValue(activeIndex);

  React.useEffect(() => {
    pos.value = withSpring(activeIndex, SPRING_CFG);
  }, [activeIndex]);

  const indicatorStyle = useAnimatedStyle(() => {
    if (tabCount < 2) return {};
    const frac = 1 / tabCount;
    return {
      left: `${pos.value * frac * 100}%` as any,
      width: `${frac * 100}%` as any,
    };
  });

  const trackBg = useMemo(() => hexToRgba(accent, 0.12), [accent]);

  return (
    <View style={[styles.barContainer, barStyle]}>
      <View style={styles.trackOuter}>
        {routes.map((route, idx) => {
          const tab = tabs[idx];
          const isActive = idx === activeIndex;
          return (
            <TouchableOpacity
              key={route.key}
              style={styles.tabItem}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onTabPress(route.key);
              }}
              activeOpacity={0.75}
            >
              {tab?.icon && (
                <Ionicons
                  name={tab.icon}
                  size={13}
                  color={isActive ? accent : 'rgba(255,255,255,0.38)'}
                  style={styles.tabIconMargin}
                />
              )}
              <Text
                style={[styles.tabLabel, { color: isActive ? accent : 'rgba(255,255,255,0.42)' }]}
                numberOfLines={1}
              >
                {route.title}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={[styles.underlineTrack, { backgroundColor: trackBg }]}>
        <Animated.View style={[styles.underline, { backgroundColor: accent }, indicatorStyle]} />
      </View>
    </View>
  );
});

// ── Main component ──────────────────────────────────────────────────────────

export const SliderTabs: React.FC<SliderTabsProps> = ({
  tabs,
  activeKey,
  onChange,
  children,
  accentColor,
  style,
  barStyle,
  hideBar = false,
  pageHeight,
}) => {
  const branding = useBranding();
  const accent = accentColor ?? branding.primary;
  const layout = useWindowDimensions();

  const activeIdx = tabs.findIndex((t) => t.key === activeKey);
  const safeIdx = activeIdx >= 0 ? activeIdx : 0;

  const routes = useMemo<Route[]>(
    () => tabs.map((t) => ({ key: t.key, title: t.label, icon: t.icon })),
    [tabs],
  );

  const navigationState = useMemo(
    () => ({ index: safeIdx, routes }),
    [safeIdx, routes],
  );

  const handleIndexChange = useCallback(
    (index: number) => {
      const tab = tabs[index];
      if (tab) onChange(tab.key);
    },
    [tabs, onChange],
  );

  const hasPages = Children.count(children) > 0;
  const pageChildren = useMemo(() => Children.toArray(children), [children]);

  const doSwipe = useCallback(
    (dir: 'left' | 'right') => {
      const next = dir === 'left'
        ? Math.min(safeIdx + 1, tabs.length - 1)
        : Math.max(safeIdx - 1, 0);
      if (next !== safeIdx) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onChange(tabs[next].key);
      }
    },
    [safeIdx, tabs, onChange],
  );

  const barSwipe = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-8, 8])
    .onEnd((e) => {
      'worklet';
      if (e.translationX < -40) {
        runOnJS(doSwipe)('left');
      } else if (e.translationX > 40) {
        runOnJS(doSwipe)('right');
      }
    });

  // Stable page height style — avoids creating new objects per render
  const renderScene = useCallback(
    ({ route }: SceneRendererProps & { route: Route }) => {
      const idx = tabs.findIndex((t) => t.key === route.key);
      if (pageHeight) {
        return (
          <ScrollView
            style={{ height: pageHeight }}
            contentContainerStyle={{ minHeight: pageHeight }}
            showsVerticalScrollIndicator={false}
            scrollEnabled={false}
          >
            {pageChildren[idx] ?? null}
          </ScrollView>
        );
      }
      return <View style={styles.page}>{pageChildren[idx] ?? null}</View>;
    },
    [tabs, pageChildren, pageHeight],
  );

  const renderTabBar = useCallback(
    hideBar
      ? () => null
      : (props: SceneRendererProps & { navigationState: NavigationState<Route> }) => (
          <GlassTabBar
            {...props}
            tabs={tabs}
            accent={accent}
            barStyle={barStyle}
            onTabPress={(key) => onChange(key)}
          />
        ),
    [hideBar, tabs, accent, barStyle, onChange],
  );

  const initialLayout = useMemo(
    () => ({ width: layout.width, height: pageHeight ?? layout.height }),
    [layout.width, pageHeight, layout.height],
  );

  if (!hasPages) {
    return (
      <View style={style}>
        <ModeABar
          tabs={tabs}
          activeKey={activeKey}
          accent={accent}
          barStyle={barStyle}
          onTabPress={(key) => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onChange(key);
          }}
        />
      </View>
    );
  }

  const wrapperStyle = pageHeight
    ? [{ width: '100%' as const, height: pageHeight }, style]
    : [styles.modeB, style];

  return (
    <View style={wrapperStyle}>
      <TabView
        navigationState={navigationState}
        renderScene={renderScene}
        onIndexChange={handleIndexChange}
        initialLayout={initialLayout}
        renderTabBar={renderTabBar}
        lazy
        swipeEnabled
        style={pageHeight ? { height: pageHeight } : undefined}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  barContainer: {},
  trackOuter: {
    flexDirection: 'row',
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  tabIconMargin: {
    marginBottom: 1,
  },
  tabLabel: {
    ...fontStyles.heading,
    fontSize: 14,
    letterSpacing: 1.2,
  },
  underlineTrack: {
    height: INDICATOR_HEIGHT,
    borderRadius: INDICATOR_HEIGHT / 2,
    position: 'relative',
  },
  underline: {
    height: INDICATOR_HEIGHT,
    borderRadius: INDICATOR_HEIGHT / 2,
    position: 'absolute',
    top: 0,
  },
  modeB: {
    flex: 1,
  },
  page: {
    flex: 1,
  },
});
