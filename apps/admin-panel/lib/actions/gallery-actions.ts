'use server';

import { getAdminClient } from '@/lib/utils/supabase-admin';
import { getCurrentProfile } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

export interface GalleryImage {
  id: string;
  gym_id: string;
  image_url: string;
  sort_order: number;
  caption: string | null;
  uploaded_by: string | null;
  created_at: string;
}

async function authorizeGymManagement(gymId: string) {
  const profile = await getCurrentProfile();
  if (!profile) return { authorized: false as const, error: 'Not authenticated' };

  if (profile.role === 'superadmin') return { authorized: true as const, profile };

  if (profile.role === 'gym_owner') {
    const admin = getAdminClient();
    if (!admin) return { authorized: false as const, error: 'Admin client not available' };
    const { data: gym } = await admin
      .from('gyms')
      .select('owner_id')
      .eq('id', gymId)
      .single() as { data: { owner_id: string | null } | null };
    if (gym?.owner_id === profile.id) return { authorized: true as const, profile };
  }

  if (profile.role === 'gym_admin' && profile.assigned_gym_id === gymId) {
    return { authorized: true as const, profile };
  }

  return { authorized: false as const, error: 'Unauthorized' };
}

export async function getGymGallery(gymId: string): Promise<{
  success: boolean;
  data?: GalleryImage[];
  error?: string;
}> {
  try {
    const admin = getAdminClient();
    if (!admin) return { success: false, error: 'Admin client not available' };

    const { data, error } = await admin
      .from('gym_gallery')
      .select('*')
      .eq('gym_id', gymId)
      .order('sort_order', { ascending: true }) as {
      data: GalleryImage[] | null;
      error: { message: string } | null;
    };

    if (error) throw new Error(error.message);
    return { success: true, data: data ?? [] };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to load gallery' };
  }
}

const BUCKET = 'gym-gallery';

export async function uploadAndAddGalleryImage(
  gymId: string,
  formData: FormData,
  sortOrder: number,
): Promise<{ success: boolean; data?: GalleryImage; error?: string }> {
  try {
    const auth = await authorizeGymManagement(gymId);
    if (!auth.authorized) return { success: false, error: auth.error };

    const admin = getAdminClient();
    if (!admin) return { success: false, error: 'Admin client not available' };

    const file = formData.get('file') as File | null;
    if (!file) return { success: false, error: 'No file provided' };

    if (file.size > 10 * 1024 * 1024) {
      return { success: false, error: 'File exceeds 10 MB limit' };
    }

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return { success: false, error: 'Unsupported file format. Use JPEG, PNG, or WEBP.' };
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const storagePath = `${gymId}/${fileName}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadErr } = await admin.storage
      .from(BUCKET)
      .upload(storagePath, buffer, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type,
      });

    if (uploadErr) throw new Error(uploadErr.message);

    const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(storagePath);
    if (!urlData?.publicUrl) throw new Error('Failed to get public URL');

    const { data, error } = await (admin.from('gym_gallery') as any).insert({
      gym_id: gymId,
      image_url: urlData.publicUrl,
      sort_order: sortOrder,
      caption: null,
      uploaded_by: auth.profile.id,
    }).select().single();

    if (error) throw new Error(error.message);
    revalidatePath(`/dashboard/gym/${gymId}/settings`);
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to upload image' };
  }
}

export async function deleteGalleryImage(
  gymId: string,
  imageId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const auth = await authorizeGymManagement(gymId);
    if (!auth.authorized) return { success: false, error: auth.error };

    const admin = getAdminClient();
    if (!admin) return { success: false, error: 'Admin client not available' };

    // Fetch the image record to get the storage path before deleting
    const { data: img } = await admin
      .from('gym_gallery')
      .select('image_url')
      .eq('id', imageId)
      .eq('gym_id', gymId)
      .single() as { data: { image_url: string } | null };

    if (img?.image_url) {
      const urlParts = img.image_url.split(`/${BUCKET}/`);
      const storagePath = urlParts[1];
      if (storagePath) {
        await admin.storage.from(BUCKET).remove([storagePath]);
      }
    }

    const { error } = await admin
      .from('gym_gallery')
      .delete()
      .eq('id', imageId)
      .eq('gym_id', gymId);

    if (error) throw new Error(error.message);
    revalidatePath(`/dashboard/gym/${gymId}/settings`);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to delete image' };
  }
}

export async function updateGalleryCaption(
  gymId: string,
  imageId: string,
  caption: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const auth = await authorizeGymManagement(gymId);
    if (!auth.authorized) return { success: false, error: auth.error };

    const admin = getAdminClient();
    if (!admin) return { success: false, error: 'Admin client not available' };

    const { error } = await (admin.from('gym_gallery') as any)
      .update({ caption: caption || null })
      .eq('id', imageId)
      .eq('gym_id', gymId);

    if (error) throw new Error(error.message);
    revalidatePath(`/dashboard/gym/${gymId}/settings`);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update caption' };
  }
}

export async function reorderGalleryImages(
  gymId: string,
  orderedIds: string[],
): Promise<{ success: boolean; error?: string }> {
  try {
    const auth = await authorizeGymManagement(gymId);
    if (!auth.authorized) return { success: false, error: auth.error };

    const admin = getAdminClient();
    if (!admin) return { success: false, error: 'Admin client not available' };

    const updates = orderedIds.map((id, idx) =>
      (admin.from('gym_gallery') as any)
        .update({ sort_order: idx })
        .eq('id', id)
        .eq('gym_id', gymId),
    );
    await Promise.all(updates);

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to reorder' };
  }
}
