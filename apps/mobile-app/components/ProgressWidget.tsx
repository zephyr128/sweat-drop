import React, { useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAllBadges } from '@/hooks/useAllBadges';
import { useUserProgress } from '@/hooks/useUserProgress';
import { useUserBadges } from '@/hooks/useUserBadges';
import { useBranding } from '@/lib/contexts/ThemeContext';
import { ProgressCard } from '@/components/ProgressCard';

export const ProgressWidget: React.FC = () => {
  const { t } = useTranslation('home');
  const router = useRouter();
  const branding = useBranding();
  const { globalAchievements, gymChallenges, refresh: refreshAllBadges } = useAllBadges();
  const { badges: earnedBadges, refresh: refreshEarnedBadges } = useUserBadges();
  const { progress: userProgress, refresh: refreshProgress } = useUserProgress();

  useFocusEffect(
    useCallback(() => {
      refreshEarnedBadges();
      refreshProgress();
    }, [refreshEarnedBadges, refreshProgress])
  );

  const nextBadge = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const activeGymChallenges = gymChallenges.filter((c) => {
      if (!c.is_active) return false;
      if (c.start_date && c.start_date > today) return false;
      if (c.end_date && c.end_date < today) return false;
      return true;
    });

    const allBadges = [
      ...globalAchievements.map((a) => ({
        id: a.id,
        name: a.name,
        badge_image_url: a.badge_image_url as string | null,
        badge_type: 'global' as const,
        display_order: a.display_order,
        progress: userProgress.find((p) => p.global_achievement_id === a.id),
        is_earned: earnedBadges.some((b) => b.badge_type === 'global' && b.badge_name === a.name),
      })),
      ...activeGymChallenges.map((c) => ({
        id: c.id,
        name: c.name,
        badge_image_url: c.badge_image_url,
        badge_type: 'gym' as const,
        display_order: 999,
        progress: userProgress.find((p) => p.gym_challenge_id === c.id),
        is_earned: earnedBadges.some((b) => b.badge_type === 'gym' && b.badge_name === c.name),
      })),
    ];

    const unearnedBadges = allBadges
      .filter((b) => !b.is_earned)
      .map((b) => {
        const progressPercent = b.progress?.progress_percent ?? 0;
        const isCompleted = b.progress?.is_completed ?? false;
        return { ...b, progressPercent, isCompleted };
      })
      .filter((b) => !b.isCompleted && b.progressPercent < 100)
      .sort((a, b) => {
        const diff = b.progressPercent - a.progressPercent;
        return diff !== 0 ? diff : a.display_order - b.display_order;
      });

    return unearnedBadges[0] || null;
  }, [globalAchievements, gymChallenges, userProgress, earnedBadges]);

  if (!nextBadge) return null;

  const pct = Math.round(nextBadge.progressPercent);

  return (
    <ProgressCard
      eyebrow={t('nextBadge')}
      title={nextBadge.name}
      progressPercent={pct}
      progressLabel={`${pct}%`}
      imageUrl={nextBadge.badge_image_url}
      fallbackIcon="ribbon"
      primary={branding.primary}
      primaryDark={branding.primaryDark}
      onPress={() => router.push('/trophy-room')}
    />
  );
};
