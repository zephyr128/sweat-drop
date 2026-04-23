import type { ImageSource } from 'expo-image';

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

// ─────────────────────────────────────────────────────────────────────────────
// Bundled sport-avatar assets (48 PNGs, ~5.3 MB total).
// Shipping them with the binary means the onboarding picker and any other
// surface that shows a canonical sport avatar never waits on Supabase Storage.
// Remote URLs are still written to `profiles.avatar_url` for cross-device
// rendering; when we see that URL again on this device, we short-circuit to
// the local asset via `localAvatarSource()`.
//
// React Native's Metro bundler requires static string literals in `require()`,
// hence the flat map instead of a dynamic loop.
// ─────────────────────────────────────────────────────────────────────────────
export const AVATAR_LOCAL_ASSETS: Record<`${AvatarActivity}_${AvatarColor}`, number> = {
  weightlifting_cyan:    require('../assets/user-avatars/weightlifting_cyan.png'),
  weightlifting_amber:   require('../assets/user-avatars/weightlifting_amber.png'),
  weightlifting_emerald: require('../assets/user-avatars/weightlifting_emerald.png'),
  weightlifting_crimson: require('../assets/user-avatars/weightlifting_crimson.png'),
  running_cyan:          require('../assets/user-avatars/running_cyan.png'),
  running_amber:         require('../assets/user-avatars/running_amber.png'),
  running_emerald:       require('../assets/user-avatars/running_emerald.png'),
  running_crimson:       require('../assets/user-avatars/running_crimson.png'),
  yoga_cyan:             require('../assets/user-avatars/yoga_cyan.png'),
  yoga_amber:            require('../assets/user-avatars/yoga_amber.png'),
  yoga_emerald:          require('../assets/user-avatars/yoga_emerald.png'),
  yoga_crimson:          require('../assets/user-avatars/yoga_crimson.png'),
  cycling_cyan:          require('../assets/user-avatars/cycling_cyan.png'),
  cycling_amber:         require('../assets/user-avatars/cycling_amber.png'),
  cycling_emerald:       require('../assets/user-avatars/cycling_emerald.png'),
  cycling_crimson:       require('../assets/user-avatars/cycling_crimson.png'),
  rowing_cyan:           require('../assets/user-avatars/rowing_cyan.png'),
  rowing_amber:          require('../assets/user-avatars/rowing_amber.png'),
  rowing_emerald:        require('../assets/user-avatars/rowing_emerald.png'),
  rowing_crimson:        require('../assets/user-avatars/rowing_crimson.png'),
  boxing_cyan:           require('../assets/user-avatars/boxing_cyan.png'),
  boxing_amber:          require('../assets/user-avatars/boxing_amber.png'),
  boxing_emerald:        require('../assets/user-avatars/boxing_emerald.png'),
  boxing_crimson:        require('../assets/user-avatars/boxing_crimson.png'),
  swimming_cyan:         require('../assets/user-avatars/swimming_cyan.png'),
  swimming_amber:        require('../assets/user-avatars/swimming_amber.png'),
  swimming_emerald:      require('../assets/user-avatars/swimming_emerald.png'),
  swimming_crimson:      require('../assets/user-avatars/swimming_crimson.png'),
  hiit_cyan:             require('../assets/user-avatars/hiit_cyan.png'),
  hiit_amber:            require('../assets/user-avatars/hiit_amber.png'),
  hiit_emerald:          require('../assets/user-avatars/hiit_emerald.png'),
  hiit_crimson:          require('../assets/user-avatars/hiit_crimson.png'),
  climbing_cyan:         require('../assets/user-avatars/climbing_cyan.png'),
  climbing_amber:        require('../assets/user-avatars/climbing_amber.png'),
  climbing_emerald:      require('../assets/user-avatars/climbing_emerald.png'),
  climbing_crimson:      require('../assets/user-avatars/climbing_crimson.png'),
  stretching_cyan:       require('../assets/user-avatars/stretching_cyan.png'),
  stretching_amber:      require('../assets/user-avatars/stretching_amber.png'),
  stretching_emerald:    require('../assets/user-avatars/stretching_emerald.png'),
  stretching_crimson:    require('../assets/user-avatars/stretching_crimson.png'),
  pilates_cyan:          require('../assets/user-avatars/pilates_cyan.png'),
  pilates_amber:         require('../assets/user-avatars/pilates_amber.png'),
  pilates_emerald:       require('../assets/user-avatars/pilates_emerald.png'),
  pilates_crimson:       require('../assets/user-avatars/pilates_crimson.png'),
  crossfit_cyan:         require('../assets/user-avatars/crossfit_cyan.png'),
  crossfit_amber:        require('../assets/user-avatars/crossfit_amber.png'),
  crossfit_emerald:      require('../assets/user-avatars/crossfit_emerald.png'),
  crossfit_crimson:      require('../assets/user-avatars/crossfit_crimson.png'),
};

/** Return a local bundled asset for a given sport+color, typed. */
export function localAvatarAsset(activity: AvatarActivity, color: AvatarColor): number {
  return AVATAR_LOCAL_ASSETS[`${activity}_${color}`];
}

// Matches URLs like `.../user-avatars/{activity}_{color}.png` (with or without
// query params, from any Supabase project — dev/prod URLs both work).
const AVATAR_URL_PATTERN = /\/user-avatars\/([a-z]+)_([a-z]+)\.png(?:\?.*)?$/i;

/**
 * Resolve an `<Image>` source for a sport avatar, preferring the bundled
 * asset when the URL matches the canonical catalog pattern. Falls back to
 * the remote URI for user-uploaded or unknown avatars (none exist yet, but
 * the API stays forward-compatible).
 *
 * Pass the same `avatar_url` value that lives in `profiles.avatar_url` —
 * callers don't need to know or care whether it resolves locally.
 */
export function localAvatarSource(url: string | null | undefined): ImageSource | null {
  if (!url) return null;
  const match = url.match(AVATAR_URL_PATTERN);
  if (match) {
    const activity = match[1].toLowerCase() as AvatarActivity;
    const color    = match[2].toLowerCase() as AvatarColor;
    const asset = AVATAR_LOCAL_ASSETS[`${activity}_${color}`];
    if (asset) return asset as unknown as ImageSource;
  }
  return { uri: url };
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
