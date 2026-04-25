import type React from 'react';
import type { Ionicons } from '@expo/vector-icons';
import type { AchievementCategory, BadgeWithProgress } from '@/hooks/useAllBadges';

// AGENT NOTE: [2026-04-25] - mobile-coder
// Shared metadata + group-builder for the trophy room. Lifted out of
// TrophyRoom so the new `app/trophy-room/category/[key].tsx` screen can
// look up icons/labels/accents the same way the row headers do, and so
// `buildCategoryGroups` produces identical groups in both surfaces.

export type CategoryKey = AchievementCategory | 'gym';

// Render order for the trophy room rows. Ordered to match the user's
// progression: workouts → drops → consistency → exploration → niche.
export const CATEGORY_ORDER: AchievementCategory[] = [
  'sessions',
  'total_drops',
  'streak',
  'multi_gym',
  'distance',
  'special',
];

export const CATEGORY_ICONS: Record<CategoryKey, React.ComponentProps<typeof Ionicons>['name']> = {
  sessions: 'barbell-outline',
  total_drops: 'water-outline',
  streak: 'flame-outline',
  multi_gym: 'map-outline',
  distance: 'bicycle-outline',
  special: 'star-outline',
  gym: 'fitness-outline',
};

// Per-category accent colours. Drive the row icon, the "X / Y" pill, and
// the View-All chevron — same hue families we already use elsewhere
// (drops = green, streak = orange, multi-gym = purple). Tier colours
// keep driving the badge cards themselves; this is just the row chrome.
export const CATEGORY_ACCENT: Record<CategoryKey, string> = {
  sessions: '#5AC8FA',
  total_drops: '#30D158',
  streak: '#FF9500',
  multi_gym: '#BF5AF2',
  distance: '#64D2FF',
  special: '#FFD60A',
  gym: '#FF6482',
};

// One row in the trophy room: an icon, a label, an accent and the badges
// that belong to it. The keying matches the route segment for the
// category screen — `/trophy-room/category/${group.key}`.
export interface CategoryGroup {
  key: CategoryKey;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  accent: string;
  badges: BadgeWithProgress[];
}

export const TIER_RANK: Record<string, number> = {
  bronze: 0,
  silver: 1,
  gold: 2,
  platinum: 3,
  diamond: 4,
};

// Earned-first, tier-ascending; locked tail sorted by progress descending
// so "almost there" badges surface near the front of the carousel.
export function sortBadgesForRow(badges: BadgeWithProgress[]): BadgeWithProgress[] {
  const earned = badges
    .filter((b) => b.is_earned)
    .sort((a, b) => (TIER_RANK[a.tier ?? ''] ?? 99) - (TIER_RANK[b.tier ?? ''] ?? 99));
  const locked = badges
    .filter((b) => !b.is_earned)
    .sort((a, b) => b.progress - a.progress);
  return [...earned, ...locked];
}

// Build category groups from the flat badge list. `labelFor` is injected
// so the caller controls i18n (the util doesn't depend on react-i18next).
export function buildCategoryGroups(
  badges: BadgeWithProgress[],
  labelFor: (key: CategoryKey) => string,
  brandPrimary: string,
): CategoryGroup[] {
  const groups: CategoryGroup[] = [];
  const buckets: Partial<Record<AchievementCategory, BadgeWithProgress[]>> = {};
  const orphanGlobals: BadgeWithProgress[] = [];
  const gymBadges: BadgeWithProgress[] = [];

  badges.forEach((b) => {
    if (b.badge_type === 'gym') {
      gymBadges.push(b);
      return;
    }
    if (b.category) {
      if (!buckets[b.category]) buckets[b.category] = [];
      buckets[b.category]!.push(b);
    } else {
      orphanGlobals.push(b);
    }
  });

  CATEGORY_ORDER.forEach((cat) => {
    const items = buckets[cat] ?? [];
    if (cat === 'special' && orphanGlobals.length > 0) {
      items.push(...orphanGlobals);
    }
    if (items.length === 0) return;
    groups.push({
      key: cat,
      label: labelFor(cat),
      icon: CATEGORY_ICONS[cat],
      accent: CATEGORY_ACCENT[cat] ?? brandPrimary,
      badges: items,
    });
  });

  if (gymBadges.length > 0) {
    groups.push({
      key: 'gym',
      label: labelFor('gym'),
      icon: CATEGORY_ICONS.gym,
      accent: CATEGORY_ACCENT.gym ?? brandPrimary,
      badges: gymBadges,
    });
  }

  return groups;
}
