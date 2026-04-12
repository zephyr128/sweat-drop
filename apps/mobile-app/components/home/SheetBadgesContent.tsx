/**
 * SheetBadgesContent
 * Bottom sheet content for page 2 (Challenges): orange-themed premium challenge stats.
 * No internal scroll — the parent Animated.ScrollView handles all vertical scrolling.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ChallengesStatsCards } from '@/components/home/ChallengesStatsCards';
import type { ChallengeProgress } from '@/hooks/useChallengeProgress';
import type { UserBadge } from '@/hooks/useUserBadges';

export interface SheetBadgesContentProps {
  isUnlocked: boolean;
  displayedChallenges: ChallengeProgress[];
  challengesLoading: boolean;
  gymId: string | null;
  earnedBadges?: UserBadge[];
  onChallengePress: (challengeId: string) => void;
  onViewActiveChallenges: () => void;
  onViewCompletedChallenges: () => void;
  onTrophyRoomPress: () => void;
}

export function SheetBadgesContent({
  isUnlocked,
  displayedChallenges,
  challengesLoading,
  gymId,
  earnedBadges = [],
  onChallengePress,
  onViewActiveChallenges,
  onViewCompletedChallenges,
  onTrophyRoomPress,
}: SheetBadgesContentProps) {
  return (
    <View style={styles.container}>
      <ChallengesStatsCards
        challenges={displayedChallenges}
        earnedBadges={earnedBadges}
        loading={challengesLoading}
        isUnlocked={isUnlocked}
        gymId={gymId}
        onChallengePress={onChallengePress}
        onViewActiveChallenges={onViewActiveChallenges}
        onViewCompletedChallenges={onViewCompletedChallenges}
        onTrophyRoomPress={onTrophyRoomPress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120 },
});
