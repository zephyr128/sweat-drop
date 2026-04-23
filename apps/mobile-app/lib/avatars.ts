export const AVATAR_BUCKET_BASE_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/public/user-avatars`;

export const AVATAR_ACTIVITIES = [
  'weightlifting', 'running', 'yoga', 'cycling', 'rowing', 'boxing',
  'swimming', 'hiit', 'climbing', 'stretching', 'pilates', 'crossfit',
] as const;

export const AVATAR_COLORS = ['cyan', 'amber', 'emerald', 'crimson'] as const;

export type AvatarActivity = typeof AVATAR_ACTIVITIES[number];
export type AvatarColor    = typeof AVATAR_COLORS[number];

export function avatarUrl(activity: AvatarActivity, color: AvatarColor): string {
  return `${AVATAR_BUCKET_BASE_URL}/${activity}_${color}.png`;
}

export function allAvatarUrls(): string[] {
  return AVATAR_ACTIVITIES.flatMap(a => AVATAR_COLORS.map(c => avatarUrl(a, c)));
}

/**
 * Deterministic default avatar for users who skip the picker.
 * FNV-1a hash over user_id — same user always gets the same avatar across devices.
 */
export function defaultAvatarFor(userId: string): string {
  let h = 2166136261;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const activity = AVATAR_ACTIVITIES[Math.abs(h) % AVATAR_ACTIVITIES.length];
  const color    = AVATAR_COLORS[Math.abs(h >> 8) % AVATAR_COLORS.length];
  return avatarUrl(activity, color);
}
