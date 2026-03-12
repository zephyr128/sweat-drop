'use client';

import { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase-client';
import { uploadFile } from '@/lib/utils/storage';
import { Upload } from 'lucide-react';

interface BrandingFormProps {
  ownerId: string;
  initialData?: {
    primary_color?: string;
    logo_url?: string;
    background_url?: string;
  } | null;
}

export function BrandingForm({ ownerId, initialData }: BrandingFormProps) {
  const [primaryColor, setPrimaryColor] = useState(initialData?.primary_color || '#00E5FF');
  const [logoUrl, setLogoUrl] = useState(initialData?.logo_url || '');
  const [backgroundUrl, setBackgroundUrl] = useState(initialData?.background_url || '');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

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
        setLogoUrl(result.url);
        toast.success('Logo uploaded successfully');
      } catch (error: unknown) {
        toast.error(`Failed to upload logo: ${error instanceof Error ? error.message : String(error)}`);
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
        setBackgroundUrl(result.url);
        toast.success('Background uploaded successfully');
      } catch (error: unknown) {
        toast.error(`Failed to upload background: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setUploading(false);
      }
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      // Upsert branding
      const { error } = await supabase.from('owner_branding').upsert({
        owner_id: ownerId,
        primary_color: primaryColor,
        logo_url: logoUrl || null,
        background_url: backgroundUrl || null,
        updated_at: new Date().toISOString(),
      });

      if (error) throw error;

      setMessage({ type: 'success', text: 'Branding updated successfully!' });
    } catch (error: unknown) {
      setMessage({ type: 'error', text: (error instanceof Error ? error.message : 'Failed to update branding') || 'Failed to update branding' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-white mb-2">Primary Color</label>
        <div className="flex gap-4">
          <input
            type="color"
            value={primaryColor}
            onChange={(e) => setPrimaryColor(e.target.value)}
            className="w-20 h-12 rounded-lg cursor-pointer"
          />
          <input
            type="text"
            value={primaryColor}
            onChange={(e) => setPrimaryColor(e.target.value)}
            className="flex-1 px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
            placeholder="#00E5FF"
          />
        </div>
        <p className="text-xs text-[#808080] mt-2">
          This color will be used for buttons, accents, and highlights in the mobile app
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-white mb-2">Logo</label>
        <div
          {...logoDropzone.getRootProps()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            logoDropzone.isDragActive
              ? 'border-[#00E5FF] bg-[#00E5FF]/10'
              : 'border-[#1A1A1A] hover:border-[#00E5FF]/50'
          }`}
        >
          <input {...logoDropzone.getInputProps()} />
          {logoUrl ? (
            <div className="space-y-4">
              <img src={logoUrl} alt="Logo preview" className="max-h-32 mx-auto rounded-lg" />
              <p className="text-sm text-[#808080]">Click or drag to replace</p>
            </div>
          ) : (
            <div className="space-y-2">
              <Upload className="w-8 h-8 text-[#808080] mx-auto" />
              <p className="text-[#808080]">Drag & drop logo here, or click to select</p>
              <p className="text-xs text-[#808080]">PNG, JPG, WEBP up to 10MB</p>
            </div>
          )}
        </div>
        {uploading && (
          <p className="mt-2 text-sm text-[#00E5FF]">Uploading...</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-white mb-2">Background Image</label>
        <div
          {...backgroundDropzone.getRootProps()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            backgroundDropzone.isDragActive
              ? 'border-[#00E5FF] bg-[#00E5FF]/10'
              : 'border-[#1A1A1A] hover:border-[#00E5FF]/50'
          }`}
        >
          <input {...backgroundDropzone.getInputProps()} />
          {backgroundUrl ? (
            <div className="space-y-4">
              <img src={backgroundUrl} alt="Background preview" className="max-h-48 mx-auto rounded-lg object-cover w-full" />
              <p className="text-sm text-[#808080]">Click or drag to replace</p>
            </div>
          ) : (
            <div className="space-y-2">
              <Upload className="w-8 h-8 text-[#808080] mx-auto" />
              <p className="text-[#808080]">Drag & drop background here, or click to select</p>
              <p className="text-xs text-[#808080]">PNG, JPG, WEBP up to 10MB</p>
            </div>
          )}
        </div>
        {uploading && (
          <p className="mt-2 text-sm text-[#00E5FF]">Uploading...</p>
        )}
      </div>

      {message && (
        <div
          className={`p-4 rounded-lg ${
            message.type === 'success'
              ? 'bg-[#00E5FF]/10 text-[#00E5FF] border border-[#00E5FF]/30'
              : 'bg-[#FF5252]/10 text-[#FF5252] border border-[#FF5252]/30'
          }`}
        >
          {message.text}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || uploading}
        className="w-full px-6 py-3 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Saving...' : 'Save Branding'}
      </button>
    </form>
  );
}
