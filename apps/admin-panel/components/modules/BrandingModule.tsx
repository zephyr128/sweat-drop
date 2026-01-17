'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';
import { updateBranding } from '@/lib/actions/branding-actions';
import { uploadFile } from '@/lib/utils/storage';
import { MobilePreview } from '@/components/MobilePreview';

const brandingSchema = z.object({
  primaryColor: z.string().regex(/^#[0-9A-F]{6}$/i, 'Invalid hex color'),
  logoUrl: z.string().url().optional().or(z.literal('')),
  backgroundUrl: z.string().url().optional().or(z.literal('')),
});

type BrandingFormData = z.infer<typeof brandingSchema>;

interface BrandingModuleProps {
  ownerId: string; // Now uses owner_id for global branding
  initialData: {
    primary_color?: string | null;
    logo_url?: string | null;
    background_url?: string | null;
  };
}

export function BrandingModule({ ownerId, initialData }: BrandingModuleProps) {
  const [logoPreview, setLogoPreview] = useState<string | null>(
    initialData.logo_url || null
  );
  const [backgroundPreview, setBackgroundPreview] = useState<string | null>(
    initialData.background_url || null
  );
  const [uploading, setUploading] = useState(false);

  // Normalize color to ensure it's in #RRGGBB format
  const normalizeColor = (color: string | null | undefined): string => {
    if (!color) return '#00E5FF';
    const trimmed = color.trim();
    if (trimmed.startsWith('#')) {
      // Ensure it's uppercase and has 6 hex digits
      const hex = trimmed.slice(1).toUpperCase();
      if (/^[0-9A-F]{6}$/.test(hex)) {
        return `#${hex}`;
      }
      // If it's 3 digits, expand to 6
      if (/^[0-9A-F]{3}$/.test(hex)) {
        return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
      }
    } else {
      // If no #, add it and ensure uppercase
      const hex = trimmed.toUpperCase();
      if (/^[0-9A-F]{6}$/.test(hex)) {
        return `#${hex}`;
      }
      if (/^[0-9A-F]{3}$/.test(hex)) {
        return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
      }
    }
    return '#00E5FF';
  };

  const normalizedInitialColor = normalizeColor(initialData.primary_color);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<BrandingFormData>({
    resolver: zodResolver(brandingSchema),
    defaultValues: {
      primaryColor: normalizedInitialColor,
      logoUrl: initialData.logo_url || '',
      backgroundUrl: initialData.background_url || '',
    },
  });

  const primaryColor = watch('primaryColor');

  // Update form when initialData changes
  useEffect(() => {
    const normalizedColor = normalizeColor(initialData.primary_color);
    setValue('primaryColor', normalizedColor, { shouldValidate: false });
    setValue('logoUrl', initialData.logo_url || '', { shouldValidate: false });
    setValue('backgroundUrl', initialData.background_url || '', { shouldValidate: false });
    setLogoPreview(initialData.logo_url || null);
    setBackgroundPreview(initialData.background_url || null);
  }, [initialData.primary_color, initialData.logo_url, initialData.background_url, setValue]);

  const logoDropzone = useDropzone({
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.webp'],
    },
    maxFiles: 1,
    onDrop: async (acceptedFiles) => {
      if (acceptedFiles.length === 0) return;

      setUploading(true);
      try {
        const file = acceptedFiles[0];
        const result = await uploadFile(file, 'images', 'logos');
        setValue('logoUrl', result.url);
        setLogoPreview(result.url);
        toast.success('Logo uploaded successfully');
      } catch (error: any) {
        console.error('Logo upload error:', error);
        const errorMessage = error.message || 'Unknown error';
        if (errorMessage.includes('Bucket') && errorMessage.includes('does not exist')) {
          toast.error('Bucket "images" not found. Please ensure it exists in Supabase Dashboard > Storage and is set to Public.');
        } else if (errorMessage.includes('row-level security') || errorMessage.includes('RLS')) {
          toast.error('Permission denied. Please check RLS policies for the "images" bucket.');
        } else {
          toast.error(`Failed to upload logo: ${errorMessage}`);
        }
      } finally {
        setUploading(false);
      }
    },
  });

  const backgroundDropzone = useDropzone({
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.webp'],
    },
    maxFiles: 1,
    onDrop: async (acceptedFiles) => {
      if (acceptedFiles.length === 0) return;

      setUploading(true);
      try {
        const file = acceptedFiles[0];
        const result = await uploadFile(file, 'images', 'backgrounds');
        setValue('backgroundUrl', result.url);
        setBackgroundPreview(result.url);
        toast.success('Background uploaded successfully');
      } catch (error: any) {
        console.error('Background upload error:', error);
        const errorMessage = error.message || 'Unknown error';
        if (errorMessage.includes('Bucket') && errorMessage.includes('does not exist')) {
          toast.error('Bucket "images" not found. Please ensure it exists in Supabase Dashboard > Storage and is set to Public.');
        } else if (errorMessage.includes('row-level security') || errorMessage.includes('RLS')) {
          toast.error('Permission denied. Please check RLS policies for the "images" bucket.');
        } else {
          toast.error(`Failed to upload background: ${errorMessage}`);
        }
      } finally {
        setUploading(false);
      }
    },
  });

  const onSubmit = async (data: BrandingFormData) => {
    try {
      const result = await updateBranding({
        ownerId,
        primaryColor: data.primaryColor,
        logoUrl: data.logoUrl || undefined,
        backgroundUrl: data.backgroundUrl || undefined,
      });

      if (result.success) {
        toast.success('Branding updated successfully');
      } else {
        toast.error(`Failed to update branding: ${result.error}`);
      }
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-8">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Color Picker */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Primary Color
            </label>
            <div className="flex items-center gap-4">
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => {
                  const newColor = e.target.value.toUpperCase();
                  setValue('primaryColor', newColor, { shouldValidate: true });
                }}
                className="w-20 h-12 rounded-lg cursor-pointer border border-[#1A1A1A]"
              />
              <input
                type="text"
                value={primaryColor}
                onChange={(e) => {
                  let value = e.target.value.toUpperCase();
                  // Allow typing without #, but add it if missing
                  if (value && !value.startsWith('#')) {
                    value = `#${value}`;
                  }
                  setValue('primaryColor', value, { shouldValidate: true });
                }}
                className="flex-1 px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none uppercase"
                placeholder="#00E5FF"
                maxLength={7}
              />
            </div>
            {errors.primaryColor && (
              <p className="mt-1 text-sm text-[#FF5252]">
                {errors.primaryColor.message}
              </p>
            )}
          </div>

          {/* Logo Upload */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Logo
            </label>
            <div
              {...logoDropzone.getRootProps()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                logoDropzone.isDragActive
                  ? 'border-[#00E5FF] bg-[#00E5FF]/10'
                  : 'border-[#1A1A1A] hover:border-[#00E5FF]/50'
              }`}
            >
              <input {...logoDropzone.getInputProps()} />
              {logoPreview ? (
                <div className="space-y-4">
                  <img
                    src={logoPreview}
                    alt="Logo preview"
                    className="max-h-32 mx-auto rounded-lg"
                  />
                  <p className="text-sm text-[#808080]">
                    Click or drag to replace
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-[#808080]">
                    Drag & drop logo here, or click to select
                  </p>
                  <p className="text-xs text-[#808080]">
                    PNG, JPG, WEBP up to 5MB
                  </p>
                </div>
              )}
            </div>
            {uploading && (
              <p className="mt-2 text-sm text-[#00E5FF]">Uploading...</p>
            )}
          </div>

          {/* Background Upload */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Background Image
            </label>
            <div
              {...backgroundDropzone.getRootProps()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                backgroundDropzone.isDragActive
                  ? 'border-[#00E5FF] bg-[#00E5FF]/10'
                  : 'border-[#1A1A1A] hover:border-[#00E5FF]/50'
              }`}
            >
              <input {...backgroundDropzone.getInputProps()} />
              {backgroundPreview ? (
                <div className="space-y-4">
                  <img
                    src={backgroundPreview}
                    alt="Background preview"
                    className="max-h-48 mx-auto rounded-lg object-cover w-full"
                  />
                  <p className="text-sm text-[#808080]">
                    Click or drag to replace
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-[#808080]">
                    Drag & drop background here, or click to select
                  </p>
                  <p className="text-xs text-[#808080]">
                    PNG, JPG, WEBP up to 10MB
                  </p>
                </div>
              )}
            </div>
            {uploading && (
              <p className="mt-2 text-sm text-[#00E5FF]">Uploading...</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting || uploading}
            className="w-full px-6 py-3 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>

      {/* Live Preview */}
      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-8">
        <h2 className="text-xl font-bold text-white mb-6">Live Preview</h2>
        <MobilePreview
          primaryColor={primaryColor}
          logoUrl={logoPreview}
          backgroundUrl={backgroundPreview}
        />
      </div>
    </div>
  );
}
