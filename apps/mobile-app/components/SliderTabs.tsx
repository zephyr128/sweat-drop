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
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
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
  /** Style for the outer wrapper */
  style?: object;
  /** Style applied to the tab bar card only */
  barStyle?: object;
  /** When true, the tab bar is not rendered — use SliderTabsBar separately as a sticky header */
  hideBar?: boolean;
  /** Explicit height for each page (required when inside a ScrollView content container) */
  pageHeight?: number;
}

// ── Custom glass tab bar ────────────────────────────────────────────────────

type Route = { key: string; title: string; icon?: React.ComponentProps<typeof Ionicons>['name'] };

const SPRING_CFG_BAR = { damping: 20, stiffness: 220, mass: 0.8 };

const GlassTabBar: React.FC<
  SceneRendererProps & {
    navigationState: NavigationState<Route>;
    tabs: SliderTab[];
    accent: string;
    barStyle?: object;
    onTabPress: (key: string) => void;
  }
> = ({ navigationState, tabs, accent, barStyle, onTabPress }) => {
  const { routes, index: activeIndex } = navigationState;
  const tabCount = routes.length;

  const pos = useSharedValue(activeIndex);
  React.useEffect(() => {
    pos.value = withSpring(activeIndex, SPRING_CFG_BAR);
  }, [activeIndex]);

  const indicatorStyle = useAnimatedStyle(() => {
    if (tabCount < 2) return {};
    const frac = 1 / tabCount;
    return {
      left: `${pos.value * frac * 100}%` as any,
      width: `${frac * 100}%` as any,
    };
  });

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
                  style={{ marginBottom: 1 }}
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
      {/* Underline track */}
      <View style={[styles.underlineTrack, { backgroundColor: hexToRgba(accent, 0.12) }]}>
        <Animated.View style={[styles.underline, { backgroundColor: accent }, indicatorStyle]} />
      </View>
    </View>
  );
};

// ── Mode A: standalone bar with spring-animated indicator ───────────────────

const SPRING_CFG = { damping: 20, stiffness: 220, mass: 0.8 };

export interface SliderTabsBarProps {
  tabs: SliderTab[];
  activeKey: string;
  onChange: (key: string) => void;
  accentColor?: string;
  style?: object;
  barStyle?: object;
}

/**
 * SliderTabsBar — tab bar only, no page content.
 * Use this as a sticky header inside a single outer ScrollView.
 */
export const SliderTabsBar: React.FC<SliderTabsBarProps> = ({
  tabs,
  activeKey,
  onChange,
  accentColor,
  style,
  barStyle,
}) => {
  const branding = useBranding();
  const accent = accentColor ?? branding.primary;
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
};

const ModeABar: React.FC<{
  tabs: SliderTab[];
  activeKey: string;
  accent: string;
  barStyle?: object;
  onTabPress: (key: string) => void;
}> = ({ tabs, activeKey, accent, barStyle, onTabPress }) => {
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
                  style={{ marginBottom: 1 }}
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
      {/* Underline track */}
      <View style={[styles.underlineTrack, { backgroundColor: hexToRgba(accent, 0.12) }]}>
        <Animated.View style={[styles.underline, { backgroundColor: accent }, indicatorStyle]} />
      </View>
    </View>
  );
};

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

  // ── Mode A: bar-only swipe gesture for tab changes ────────────────────────
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

  // ── Mode B: full TabView with swipeable pages ─────────────────────────────
  const renderScene = ({ route }: SceneRendererProps & { route: Route }) => {
    const idx = tabs.findIndex((t) => t.key === route.key);
    if (pageHeight) {
      return (
        <ScrollView
          style={{ height: pageHeight }}
          contentContainerStyle={{ flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
          scrollEnabled={false}
        >
          {pageChildren[idx] ?? null}
        </ScrollView>
      );
    }
    return (
      <View style={styles.page}>
        {pageChildren[idx] ?? null}
      </View>
    );
  };

  const renderTabBar = hideBar
    ? () => null
    : (props: SceneRendererProps & { navigationState: NavigationState<Route> }) => (
        <GlassTabBar
          {...props}
          tabs={tabs}
          accent={accent}
          barStyle={barStyle}
          onTabPress={(key) => onChange(key)}
        />
      );

  const wrapperStyle = pageHeight
    ? [{ width: '100%' as const, height: pageHeight }, style]
    : [styles.modeB, style];

  return (
    <View style={wrapperStyle}>
      <TabView
        navigationState={navigationState}
        renderScene={renderScene}
        onIndexChange={handleIndexChange}
        initialLayout={{ width: layout.width, height: pageHeight ?? layout.height }}
        renderTabBar={renderTabBar}
        lazy={false}
        swipeEnabled
        style={pageHeight ? { height: pageHeight } : undefined}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  barContainer: {
    // No background, no border, no blur — transparent
  },
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
