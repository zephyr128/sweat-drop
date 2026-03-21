/**
 * Profile `avatar_url` may be an image URL or a stored emoji string.
 */
export function isProfileAvatarImageUrl(value: string | null | undefined): boolean {
  if (!value || typeof value !== 'string') return false;
  const t = value.trim();
  if (!t) return false;
  return (
    t.startsWith('http://') ||
    t.startsWith('https://') ||
    t.startsWith('data:image/')
  );
}

/** Trimmed raw value or null (empty → null). */
export function normalizeAvatarRaw(value: string | null | undefined): string | null {
  if (value == null || typeof value !== 'string') return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}
