/**
 * HomeHeroPager
 * Renders 4 swipeable ring pages: Activity → Rank → Badges → Arena
 *
 * Exposes setPage(index) via forwardRef so the parent can programmatically
 * change the page (e.g. when the bottom-sheet tab bar is tapped).
 *
 * Performance notes:
 * - onPageScroll drives parallax + dot indicator via Reanimated shared value
 *   (runs entirely on the UI thread, no JS bridge per frame)
 * - Ring entrance animations are triggered only after the page fully settles
 *   (onPageSelected fires once, after the drag ends)
 * - pageMargin gives a visual peek of adjacent pages as a swipe affordance
 */
import React, { useRef, useCallback, useState, useImperativeHandle, forwardRef } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import PagerView from 'react-native-pager-view';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  interpolate,
  SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ActivityRings, type ActivityRingsHandle } from '@/components/ActivityRings';
import { RankRing } from './RankRing';
import { BadgeRing } from './BadgeRing';
import { ArenaRing } from './ArenaRing';
import { useBranding } from '@/lib/hooks/useBranding';
import type { AvailableArena } from '@/hooks/useAvailableArenas';
import type { LeaderboardPeriod } from '@/components/LeaderboardPreview';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const PAGE_MARGIN = 8;

export const PAGE_ACTIVITY = 0;
export const PAGE_RANK = 1;
export const PAGE_BADGES = 2;
export const PAGE_ARENA = 3;

export interface HomeHeroPagerHandle {
  setPage: (index: number) => void;
}

export interface HomeHeroPagerProps {
  activityRingsRef: React.RefObject<ActivityRingsHandle>;
  streakDays: number;
  todayDrops: number;
  todayBonusDrops: number;
  dailyCap: number;
  totalGymDrops: number;
  onActivityRingPress: () => void;
  onCompeteRingPress: () => void;
  onChallengesRingPress: () => void;
  onArenasRingPress: () => void;

  rank: number;
  totalMembers: number;
  rankPeriod: LeaderboardPeriod;
  rankDropsToFirst?: number;
  rankRewardText?: string | null;

  challengeCompletedCount: number;
  challengeTotalCount: number;
  earnedBadgeCount: number;

  activeArenas: AvailableArena[];

  activePage: number;
  onPageChange: (page: number) => void;

  scrollPosition: SharedValue<number>;

}

export const HomeHeroPager = forwardRef<HomeHeroPagerHandle, HomeHeroPagerProps>(function HomeHeroPager({
  activityRingsRef,
  streakDays,
  todayDrops,
  todayBonusDrops,
  dailyCap,
  totalGymDrops,
  onActivityRingPress,
  onCompeteRingPress,
  onChallengesRingPress,
  onArenasRingPress,
  rank,
  totalMembers,
  rankPeriod,
  rankDropsToFirst = 0,
  rankRewardText = null,
  challengeCompletedCount,
  challengeTotalCount,
  earnedBadgeCount,
  activeArenas,
  activePage,
  onPageChange,
  scrollPosition,
}, ref) {
  const branding = useBranding();
  const pagerRef = useRef<PagerView>(null);

  const pageOffset = useSharedValue(0);
  const [settledPage, setSettledPage] = useState(0);

  // When setPage() is called programmatically, we skip the next onPageSelected
  // callback to avoid an infinite sync loop with the parent.
  const programmaticNav = useRef(false);

  useImperativeHandle(ref, () => ({
    setPage(index: number) {
      programmaticNav.current = true;
      pagerRef.current?.setPage(index);
    },
  }));

  const activeArenasList = activeArenas.filter((a) => a.arena_status === 'active');
  const optedIn = activeArenasList.filter((a) => a.user_opted_in);
  const bestArena = optedIn.length > 0
    ? optedIn.reduce((best, a) =>
        (a.user_rank ?? Infinity) < (best.user_rank ?? Infinity) ? a : best,
      optedIn[0])
    : null;
  const arenaProgress = bestArena && bestArena.user_rank && bestArena.participant_count > 0
    ? Math.max(0, Math.min(1, 1 - (bestArena.user_rank - 1) / bestArena.participant_count))
    : 0;

  const handlePageScroll = useCallback((e: { nativeEvent: { position: number; offset: number } }) => {
    const { position, offset } = e.nativeEvent;
    const continuous = position + offset;
    pageOffset.value = continuous;
    scrollPosition.value = continuous;
  }, [pageOffset, scrollPosition]);

  const handlePageSelected = useCallback((e: { nativeEvent: { position: number } }) => {
    const page = e.nativeEvent.position;
    setSettledPage(page);

    if (programmaticNav.current) {
      programmaticNav.current = false;
      return;
    }

    onPageChange(page);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [onPageChange]);

  const page0Style = useAnimatedStyle(() => {
    const dist = Math.abs(pageOffset.value - 0);
    const active = Math.max(0, 1 - Math.min(dist, 1));
    return {
      transform: [{ scale: interpolate(active, [0, 1], [0.91, 1]) }],
      opacity: interpolate(active, [0, 1], [0.55, 1]),
    };
  });
  const page1Style = useAnimatedStyle(() => {
    const dist = Math.abs(pageOffset.value - 1);
    const active = Math.max(0, 1 - Math.min(dist, 1));
    return {
      transform: [{ scale: interpolate(active, [0, 1], [0.91, 1]) }],
      opacity: interpolate(active, [0, 1], [0.55, 1]),
    };
  });
  const page2Style = useAnimatedStyle(() => {
    const dist = Math.abs(pageOffset.value - 2);
    const active = Math.max(0, 1 - Math.min(dist, 1));
    return {
      transform: [{ scale: interpolate(active, [0, 1], [0.91, 1]) }],
      opacity: interpolate(active, [0, 1], [0.55, 1]),
    };
  });
  const page3Style = useAnimatedStyle(() => {
    const dist = Math.abs(pageOffset.value - 3);
    const active = Math.max(0, 1 - Math.min(dist, 1));
    return {
      transform: [{ scale: interpolate(active, [0, 1], [0.91, 1]) }],
      opacity: interpolate(active, [0, 1], [0.55, 1]),
    };
  });
  const pageStyles = [page0Style, page1Style, page2Style, page3Style];

  return (
    <View style={styles.container}>
      <PagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={0}
        pageMargin={PAGE_MARGIN}
        onPageScroll={handlePageScroll}
        onPageSelected={handlePageSelected}
        overdrag
      >
        <View key="0" style={styles.page}>
          <Animated.View style={[styles.pageInner, styles.ringSlot, pageStyles[0]]}>
            <ActivityRings
              ref={activityRingsRef}
              streakDays={streakDays}
              todayDrops={todayDrops}
              todayBonusDrops={todayBonusDrops}
              dailyCap={dailyCap}
              totalGymDrops={totalGymDrops}
              size={290}
              onPress={onActivityRingPress}
              compact
            />
          </Animated.View>
        </View>

        <View key="1" style={styles.page}>
          <Animated.View style={[styles.pageInner, styles.ringSlot, pageStyles[1]]}>
            <RankRing
              rank={rank}
              totalMembers={totalMembers}
              rankPeriod={rankPeriod}
              dropsToFirst={rankDropsToFirst}
              rewardText={rankRewardText}
              active={settledPage === PAGE_RANK}
              onPress={onCompeteRingPress}
            />
          </Animated.View>
        </View>

        <View key="2" style={styles.page}>
          <Animated.View style={[styles.pageInner, styles.ringSlot, pageStyles[2]]}>
            <BadgeRing
              completedCount={challengeCompletedCount}
              totalCount={challengeTotalCount}
              earnedBadgeCount={earnedBadgeCount}
              active={settledPage === PAGE_BADGES}
              onPress={onChallengesRingPress}
            />
          </Animated.View>
        </View>

        <View key="3" style={styles.page}>
          <Animated.View style={[styles.pageInner, styles.ringSlot, pageStyles[3]]}>
            <ArenaRing
              activeCount={activeArenasList.length}
              bestRank={bestArena?.user_rank ?? null}
              arenaName={bestArena?.name ?? (activeArenasList[0]?.name ?? null)}
              progress={arenaProgress}
              active={settledPage === PAGE_ARENA}
              onPress={onArenasRingPress}
            />
          </Animated.View>
        </View>
      </PagerView>

    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginTop: -2,
  },
  pager: {
    width: SCREEN_WIDTH,
    height: 200,
  },
  page: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  pageInner: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  ringSlot: {
    transform: [{ scale: 1 }],
    overflow: 'visible',
  },
});
