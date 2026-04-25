import { useMemo } from 'react';
import { useUserBadges } from './useUserBadges';
import { useAllBadges, type BadgeWithProgress } from './useAllBadges';
import { useUserProgress } from './useUserProgress';
import { useGymStore } from '@/lib/stores/useGymStore';

// AGENT NOTE: [2026-04-25] - mobile-coder
// Single source of truth for "the user's full badge ledger" — global
// achievements + gym challenges, each annotated with earned/progress
// state. Originally lived inline in TrophyRoom, lifted out so the new
// per-category screen (`app/trophy-room/category/[key].tsx`) can reuse
// the exact same dataset without re-implementing the merge logic.
//
// The shape returned is intentionally identical to what TrophyRoom used
// before — every existing consumer keeps working without changes.
export interface AllBadgesWithProgress {
  allBadges: BadgeWithProgress[];
  earnedBadges: ReturnType<typeof useUserBadges>['badges'];
  loading: boolean;
}

export function useAllBadgesWithProgress(userId?: string): AllBadgesWithProgress {
  const { badges: earnedBadges, loading: badgesLoading } = useUserBadges(userId);
  const { globalAchievements, gymChallenges, loading: allBadgesLoading } = useAllBadges();
  const { progress: userProgress } = useUserProgress(userId);
  const { getActiveGymId } = useGymStore();
  const activeGymId = getActiveGymId();

  const loading = badgesLoading || allBadgesLoading;

  const allBadges = useMemo<BadgeWithProgress[]>(() => {
    const badges: BadgeWithProgress[] = [];

    // Global achievements: show every active achievement, marked earned
    // if the user has the badge OR the progress row reports completion.
    globalAchievements.forEach((achievement) => {
      const earnedBadge = earnedBadges.find(
        (b) => b.badge_type === 'global' && b.badge_name === achievement.name,
      );
      const prog = userProgress.find((p) => p.global_achievement_id === achievement.id);
      const earned = !!earnedBadge || prog?.is_completed === true;

      badges.push({
        id: achievement.id,
        name: achievement.name,
        description: achievement.description,
        badge_image_url: achievement.badge_image_url,
        badge_type: 'global',
        gym_name: null,
        gym_id: null,
        is_earned: earned,
        earned_at: earnedBadge?.earned_at || null,
        progress: earned ? 100 : (prog?.progress_percent ?? 0),
        progress_data: prog?.progress_data,
        category: achievement.category,
        tier: achievement.tier,
      });
    });

    // Gym challenges: same merge, but the upstream hook already scopes
    // these to the active gym, so we don't need to filter again here.
    gymChallenges.forEach((challenge) => {
      const earnedBadge = earnedBadges.find(
        (b) => b.badge_type === 'gym' && b.badge_name === challenge.name,
      );
      const prog = userProgress.find((p) => p.gym_challenge_id === challenge.id);
      const earned = !!earnedBadge || prog?.is_completed === true;

      badges.push({
        id: challenge.id,
        name: challenge.name,
        description: challenge.description,
        badge_image_url: challenge.badge_image_url,
        badge_type: 'gym',
        gym_name: challenge.gym_name,
        gym_id: challenge.gym_id,
        is_earned: earned,
        earned_at: earnedBadge?.earned_at || null,
        progress: earned ? 100 : (prog?.progress_percent ?? 0),
        progress_data: prog?.progress_data,
      });
    });

    // Tail: gym badges the user owns that are no longer in active
    // challenges (challenge ended after award). Scoped to the active gym
    // so the trophy room doesn't leak other gyms' badges.
    const coveredGymBadgeNames = new Set(gymChallenges.map((c) => c.name));
    earnedBadges
      .filter((b) => b.badge_type === 'gym' && !coveredGymBadgeNames.has(b.badge_name))
      .filter((b) => !activeGymId || b.gym_id === activeGymId)
      .forEach((b) => {
        badges.push({
          id: b.badge_id,
          name: b.badge_name,
          description: b.badge_description,
          badge_image_url: b.badge_image_url,
          badge_type: 'gym',
          gym_name: b.gym_name,
          gym_id: b.gym_id,
          is_earned: true,
          earned_at: b.earned_at,
          progress: 100,
        });
      });

    return badges;
  }, [globalAchievements, gymChallenges, earnedBadges, userProgress, activeGymId]);

  return { allBadges, earnedBadges, loading };
}
