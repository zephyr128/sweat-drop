/**
 * Upload a generated badge PNG to the `gym-challenge-badges` Supabase Storage
 * bucket and return its public URL.
 *
 * Must be called from a Client Component (uses the browser Supabase client).
 */
import { supabase } from '@/lib/supabase-client';

const BUCKET = 'gym-challenge-badges';

/**
 * Upload one PNG blob and return the public URL.
 *
 * @param gymId    Gym UUID — used as the folder prefix inside the bucket.
 * @param filename File name, e.g. `gold-badge.png`.
 * @param pngBlob  PNG blob returned by svgToPng().
 */
export async function uploadBadge(
  gymId: string,
  filename: string,
  pngBlob: Blob,
): Promise<string> {
  const path = `${gymId}/${filename}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, pngBlob, { contentType: 'image/png', upsert: true });

  if (error) throw new Error(`Badge upload failed: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Update a gym challenge's badge_image_url field via a direct Supabase client
 * call. A lightweight alternative to importing the full challenge server action
 * when we already have the public URL in hand.
 */
export async function attachBadgeToChallenge(
  challengeId: string,
  badgeUrl: string,
): Promise<void> {
  const { error } = await supabase
    .from('gym_challenges')
    .update({ badge_image_url: badgeUrl })
    .eq('id', challengeId);

  if (error) throw new Error(`Failed to attach badge: ${error.message}`);
}
