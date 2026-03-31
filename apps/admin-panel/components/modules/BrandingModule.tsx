'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';
import { Palette, Save, Upload, ImageIcon } from 'lucide-react';
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
  ownerId: string;
  initialData: {
    primary_color?: string | null;
    logo_url?: string | null;
    background_url?: string | null;
  };
}

function normalizeColor(color: string | null | undefined): string {
  if (!color) return '#00E5FF';
  const trimmed = color.trim();
  const raw = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
  const upper = raw.toUpperCase();
  if (/^[0-9A-F]{6}$/.test(upper)) return `#${upper}`;
  if (/^[0-9A-F]{3}$/.test(upper)) return `#${upper[0]}${upper[0]}${upper[1]}${upper[1]}${upper[2]}${upper[2]}`;
  return '#00E5FF';
}

export function BrandingModule({ ownerId, initialData }: BrandingModuleProps) {
  const [logoPreview, setLogoPreview] = useState<string | null>(initialData.logo_url || null);
  const [backgroundPreview, setBackgroundPreview] = useState<string | null>(initialData.background_url || null);
  const [uploading, setUploading] = useState(false);

  const normalizedInitialColor = normalizeColor(initialData.primary_color);

  const {
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

  useEffect(() => {
    setValue('primaryColor', normalizeColor(initialData.primary_color), { shouldValidate: false });
    setValue('logoUrl', initialData.logo_url || '', { shouldValidate: false });
    setValue('backgroundUrl', initialData.background_url || '', { shouldValidate: false });
    setLogoPreview(initialData.logo_url || null);
    setBackgroundPreview(initialData.background_url || null);
  }, [initialData.primary_color, initialData.logo_url, initialData.background_url, setValue]);

  const checkPortrait = (file: File): Promise<boolean> =>
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(img.src);
        resolve(img.height >= img.width);
      };
      img.onerror = () => resolve(true);
      img.src = URL.createObjectURL(file);
    });

  const handleUpload = async (file: File, type: 'logo' | 'background') => {
    if (type === 'background') {
      const isPortrait = await checkPortrait(file);
      if (!isPortrait) {
        toast.error('Background must be portrait (taller than wide). This image is used as a full-screen mobile background.');
        return;
      }
    }

    setUploading(true);
    try {
      const folder = type === 'logo' ? 'logos' : 'backgrounds';
      const result = await uploadFile(file, 'images', folder);
      if (type === 'logo') {
        setValue('logoUrl', result.url);
        setLogoPreview(result.url);
      } else {
        setValue('backgroundUrl', result.url);
        setBackgroundPreview(result.url);
      }
      toast.success(`${type === 'logo' ? 'Logo' : 'Background'} uploaded`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Upload failed';
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  const logoDropzone = useDropzone({
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] },
    maxFiles: 1,
    onDrop: (files) => files[0] && handleUpload(files[0], 'logo'),
  });

  const backgroundDropzone = useDropzone({
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] },
    maxFiles: 1,
    onDrop: (files) => files[0] && handleUpload(files[0], 'background'),
  });

  const onSubmit = async (data: BrandingFormData) => {
    const result = await updateBranding({
      ownerId,
      primaryColor: data.primaryColor,
      logoUrl: data.logoUrl || undefined,
      backgroundUrl: data.backgroundUrl || undefined,
    });
    if (result.success) {
      toast.success('Branding saved');
    } else {
      toast.error(result.error || 'Failed to save');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-5">
      {/* Form card */}
      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden">
        <div className="px-5 pt-5 pb-3">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Palette className="w-4 h-4 text-[#00E5FF]" />
            Brand Identity
          </h3>
          <p className="text-[10px] text-zinc-600 mt-0.5">
            Colors and images applied across the mobile app for your gym.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="px-5 pb-5 space-y-5">
            {/* Primary color */}
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Primary Color</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setValue('primaryColor', e.target.value.toUpperCase(), { shouldValidate: true })}
                  className="w-10 h-10 rounded-lg cursor-pointer border border-[#222] bg-transparent shrink-0 [&::-webkit-color-swatch-wrapper]:p-0.5 [&::-webkit-color-swatch]:rounded-md [&::-webkit-color-swatch]:border-none"
                />
                <input
                  type="text"
                  value={primaryColor}
                  onChange={(e) => {
                    let val = e.target.value.toUpperCase();
                    if (val && !val.startsWith('#')) val = `#${val}`;
                    setValue('primaryColor', val, { shouldValidate: true });
                  }}
                  className="flex-1 px-3 py-2 bg-[#111] border border-[#222] rounded-lg text-white text-sm font-mono focus:border-[#00E5FF] focus:outline-none uppercase"
                  placeholder="#00E5FF"
                  maxLength={7}
                />
                <div
                  className="w-10 h-10 rounded-lg border border-[#222] shrink-0"
                  style={{ backgroundColor: primaryColor }}
                />
              </div>
              {errors.primaryColor && (
                <p className="mt-1 text-[11px] text-rose-400">{errors.primaryColor.message}</p>
              )}
            </div>

            {/* Logo upload */}
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Logo</label>
              <div
                {...logoDropzone.getRootProps()}
                className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${
                  logoDropzone.isDragActive
                    ? 'border-[#00E5FF] bg-[#00E5FF]/5'
                    : 'border-[#1A1A1A] hover:border-[#333]'
                }`}
              >
                <input {...logoDropzone.getInputProps()} />
                {logoPreview ? (
                  <div className="flex flex-col items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={logoPreview}
                      alt="Logo preview"
                      className="max-h-20 rounded-lg"
                    />
                    <p className="text-[10px] text-zinc-500">Click or drag to replace</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1.5">
                    <Upload className="w-5 h-5 text-zinc-600" />
                    <p className="text-xs text-zinc-500">Drag logo here or click to select</p>
                    <p className="text-[10px] text-zinc-600">PNG, JPG, WEBP · max 5 MB</p>
                  </div>
                )}
              </div>
            </div>

            {/* Background upload */}
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Background Image</label>
              <div
                {...backgroundDropzone.getRootProps()}
                className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${
                  backgroundDropzone.isDragActive
                    ? 'border-[#00E5FF] bg-[#00E5FF]/5'
                    : 'border-[#1A1A1A] hover:border-[#333]'
                }`}
              >
                <input {...backgroundDropzone.getInputProps()} />
                {backgroundPreview ? (
                  <div className="flex flex-col items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={backgroundPreview}
                      alt="Background preview"
                      className="h-40 w-auto rounded-lg object-cover"
                    />
                    <p className="text-[10px] text-zinc-500">Click or drag to replace</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1.5">
                    <div className="w-10 h-16 rounded-lg border-2 border-dashed border-zinc-700 flex items-center justify-center">
                      <ImageIcon className="w-4 h-4 text-zinc-600" />
                    </div>
                    <p className="text-xs text-zinc-500">Drag background here or click to select</p>
                    <p className="text-[10px] text-zinc-600">Portrait only · PNG, JPG, WEBP · max 10 MB</p>
                  </div>
                )}
              </div>
              <p className="text-[10px] text-zinc-600 mt-1.5">Used as the full-screen mobile background. Must be portrait (taller than wide).</p>
            </div>

            {uploading && (
              <div className="flex items-center gap-2 text-[11px] text-[#00E5FF]">
                <div className="h-3 w-3 border-2 border-[#00E5FF] border-t-transparent rounded-full animate-spin" />
                Uploading…
              </div>
            )}
          </div>

          <div className="border-t border-[#1A1A1A] px-5 py-3 flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting || uploading}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#00E5FF] text-black text-sm font-bold rounded-lg hover:bg-[#00B8CC] disabled:opacity-50 transition-colors"
            >
              <Save className="w-4 h-4" />
              {isSubmitting ? 'Saving…' : 'Save Branding'}
            </button>
          </div>
        </form>
      </div>

      {/* Live preview card */}
      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden">
        <div className="px-5 pt-5 pb-3">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Palette className="w-4 h-4 text-[#00E5FF]" />
            Live Preview
          </h3>
          <p className="text-[10px] text-zinc-600 mt-0.5">
            How members see your gym in the app.
          </p>
        </div>
        <div className="px-5 pb-5">
          <MobilePreview
            primaryColor={primaryColor}
            logoUrl={logoPreview}
            backgroundUrl={backgroundPreview}
          />
        </div>
      </div>
    </div>
  );
}
