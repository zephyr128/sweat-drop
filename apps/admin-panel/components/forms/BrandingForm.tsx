'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase-client';

interface BrandingFormProps {
  gymId: string;
  initialData?: {
    primary_color?: string;
    logo_url?: string;
    background_url?: string;
  } | null;
}

export function BrandingForm({ gymId, initialData }: BrandingFormProps) {
  const [primaryColor, setPrimaryColor] = useState(initialData?.primary_color || '#00E5FF');
  const [logoUrl, setLogoUrl] = useState(initialData?.logo_url || '');
  const [backgroundUrl, setBackgroundUrl] = useState(initialData?.background_url || '');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      // Upsert branding
      const { error } = await supabase.from('gym_branding').upsert({
        gym_id: gymId,
        primary_color: primaryColor,
        logo_url: logoUrl || null,
        background_url: backgroundUrl || null,
        updated_at: new Date().toISOString(),
      });

      if (error) throw error;

      setMessage({ type: 'success', text: 'Branding updated successfully!' });
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to update branding' });
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
        <label className="block text-sm font-medium text-white mb-2">Logo URL</label>
        <input
          type="url"
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
          className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
          placeholder="https://example.com/logo.png"
        />
        {logoUrl && (
          <div className="mt-4 p-4 bg-[#1A1A1A] rounded-lg">
            <img src={logoUrl} alt="Logo preview" className="max-h-32 mx-auto" />
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-white mb-2">Background Image URL</label>
        <input
          type="url"
          value={backgroundUrl}
          onChange={(e) => setBackgroundUrl(e.target.value)}
          className="w-full px-4 py-3 bg-[#1A1A1A] border border-[#1A1A1A] rounded-lg text-white placeholder-[#808080] focus:border-[#00E5FF] focus:outline-none"
          placeholder="https://example.com/background.jpg"
        />
        {backgroundUrl && (
          <div className="mt-4 p-4 bg-[#1A1A1A] rounded-lg">
            <img src={backgroundUrl} alt="Background preview" className="max-h-48 mx-auto rounded" />
          </div>
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
        disabled={loading}
        className="w-full px-6 py-3 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Saving...' : 'Save Branding'}
      </button>
    </form>
  );
}
