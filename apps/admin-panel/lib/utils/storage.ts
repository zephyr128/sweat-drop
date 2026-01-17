import { supabase } from '@/lib/supabase-client';

export interface UploadResult {
  url: string;
  path: string;
}

/**
 * Check if a bucket exists and is accessible
 * Note: This may not work if RLS policies restrict bucket listing
 */
export async function checkBucketExists(bucket: string): Promise<boolean> {
  try {
    const { data: buckets, error } = await supabase.storage.listBuckets();
    if (error) {
      console.warn('Could not list buckets (RLS may restrict access):', error.message);
      return false; // Assume it doesn't exist if we can't check
    }
    return buckets?.some((b) => b.name === bucket) ?? false;
  } catch (error) {
    console.warn('Error checking bucket existence:', error);
    return false;
  }
}

/**
 * Upload a file to Supabase Storage
 * @param file - File to upload
 * @param bucket - Storage bucket name
 * @param folder - Optional folder path within bucket
 * @returns Public URL and path of uploaded file
 */
export async function uploadFile(
  file: File,
  bucket: string,
  folder?: string
): Promise<UploadResult> {
  // Validate file size (10MB limit)
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    throw new Error(`File size exceeds 10MB limit. Current size: ${(file.size / 1024 / 1024).toFixed(2)}MB`);
  }

  // Validate file type
  const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    throw new Error(`Invalid file type. Allowed types: PNG, JPG, JPEG, WEBP`);
  }

  const fileExt = file.name.split('.').pop()?.toLowerCase();
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
  const filePath = folder ? `${folder}/${fileName}` : fileName;

  // Check if bucket exists and is accessible
  // Note: listBuckets() might not work for all users due to RLS
  // Instead, we'll try to upload and handle the error if bucket doesn't exist
  // This is more reliable than checking bucket existence

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error) {
    // Provide more helpful error messages
    const errorMsg = error.message.toLowerCase();
    
    if (errorMsg.includes('bucket') && (errorMsg.includes('not found') || errorMsg.includes('does not exist'))) {
      throw new Error(
        `Bucket '${bucket}' does not exist or is not accessible. ` +
        `Please ensure:\n` +
        `1. Bucket '${bucket}' exists in Supabase Dashboard > Storage\n` +
        `2. Bucket is set to Public (for read access)\n` +
        `3. RLS policies are configured (run migration 20240101000036_setup_images_bucket_rls.sql)`
      );
    }
    
    if (errorMsg.includes('row-level security') || errorMsg.includes('rls') || errorMsg.includes('policy')) {
      throw new Error(
        `Upload failed: Permission denied. ` +
        `Please check RLS policies for bucket '${bucket}'. ` +
        `Run migration 20240101000036_setup_images_bucket_rls.sql to set up policies.`
      );
    }
    
    if (errorMsg.includes('unauthorized') || errorMsg.includes('forbidden')) {
      throw new Error(
        `Upload failed: Unauthorized. ` +
        `Please ensure you are logged in and have permission to upload to bucket '${bucket}'.`
      );
    }
    
    throw new Error(`Failed to upload file: ${error.message}`);
  }

  if (!data) {
    throw new Error('Upload succeeded but no data returned');
  }

  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(data.path);

  if (!urlData?.publicUrl) {
    throw new Error('Failed to get public URL for uploaded file');
  }

  return {
    url: urlData.publicUrl,
    path: data.path,
  };
}

/**
 * Delete a file from Supabase Storage
 * @param bucket - Storage bucket name
 * @param path - Path to file in bucket
 */
export async function deleteFile(bucket: string, path: string): Promise<void> {
  const { error } = await supabase.storage.from(bucket).remove([path]);

  if (error) {
    throw new Error(`Failed to delete file: ${error.message}`);
  }
}
