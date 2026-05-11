'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Upload, Loader2, Palette, ImagePlus, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { BadgePreview } from './BadgePreview';
import { renderBadgeSVG, TIERS, TIER_ORDER, CATEGORIES } from '@/lib/badge-studio/badge-svg-template';
import { svgToPng, fetchAsDataUrl } from '@/lib/badge-studio/svg-to-png';
import { uploadBadge } from '@/lib/badge-studio/badge-upload';
import { supabase } from '@/lib/supabase-client';
import type { TierKey, CategoryKey } from '@/lib/badge-studio/badge-svg-template';

const TIER_COLORS: Record<Exclude<TierKey, 'custom'>, string> = {
  bronze:   'from-amber-900 to-amber-600',
  silver:   'from-zinc-500 to-zinc-300',
  gold:     'from-yellow-700 to-yellow-400',
  platinum: 'from-slate-500 to-slate-200',
  diamond:  'from-cyan-800 to-cyan-400',
};

type CenterSource = 'upload' | 'gym_logo' | 'category';

interface BadgeStudioModalProps {
  gymId: string;
  onComplete: (badgeUrl: string) => void;
  onClose: () => void;
}

export function BadgeStudioModal({ gymId, onComplete, onClose }: BadgeStudioModalProps) {
  // ── Center image source ──
  const [source, setSource] = useState<CenterSource>('upload');
  const [gymLogoDataUrl, setGymLogoDataUrl] = useState<string | null>(null);
  const [gymLogoLoading, setGymLogoLoading] = useState(false);
  const [uploadedDataUrl, setUploadedDataUrl] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey>('sessions');

  // ── Tier ──
  const [selectedTier, setSelectedTier] = useState<Exclude<TierKey, 'custom'>>('gold');

  // ── Generation ──
  const [generating, setGenerating] = useState(false);

  // ── File input ref (invisible, triggered programmatically) ──
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Fetch gym logo on mount ──
  useEffect(() => {
    let cancelled = false;
    setGymLogoLoading(true);
    supabase
      .from('gyms')
      .select('logo_url')
      .eq('id', gymId)
      .single()
      .then(async ({ data }) => {
        if (cancelled) return;
        if (!data?.logo_url) {
          setGymLogoLoading(false);
          return;
        }
        try {
          const dataUrl = await fetchAsDataUrl(data.logo_url);
          if (!cancelled) {
            setGymLogoDataUrl(dataUrl);
            setSource('gym_logo');
          }
        } catch {
          // CORS or load error — gym logo unavailable, stay on 'upload' source
        } finally {
          if (!cancelled) setGymLogoLoading(false);
        }
      }, () => { if (!cancelled) setGymLogoLoading(false); });
    return () => { cancelled = true; };
  }, [gymId]);

  // ── Handle file pick ──
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setUploadedDataUrl(reader.result as string);
      setSource('upload');
    };
    reader.readAsDataURL(file);
    // Reset so the same file can be re-selected after clearing
    e.target.value = '';
  }, []);

  // ── Effective center image for preview & generation ──
  const effectiveCenter: string | undefined =
    source === 'upload'    ? (uploadedDataUrl ?? undefined) :
    source === 'gym_logo'  ? (gymLogoDataUrl ?? undefined) :
    undefined;

  // ── Generate & Upload ──
  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      const svg = renderBadgeSVG({
        tier: selectedTier,
        category: selectedCategory,
        customCenterImage: effectiveCenter,
        size: 512,
      });
      const blob = await svgToPng(svg, 512);
      const filename = `badge-${selectedTier}-${Date.now()}.png`;
      const url = await uploadBadge(gymId, filename, blob);
      onComplete(url);
      toast.success(`${TIERS[selectedTier].label} badge generated`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }, [gymId, selectedTier, selectedCategory, effectiveCenter, onComplete]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-[#00E5FF]" />
            <h2 className="text-sm font-semibold text-white">Quick Badge Generator</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Live preview */}
          <div className="flex justify-center py-2">
            <BadgePreview
              tiers={[selectedTier]}
              category={selectedCategory}
              customCenterImage={effectiveCenter}
              size={128}
            />
          </div>

          {/* Center image source */}
          <div className="space-y-2">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Center Image</p>

            {/* Upload image (always available) */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors ${source === 'upload' ? 'border-[#00E5FF]/50 bg-[#00E5FF]/5' : 'border-zinc-800 hover:border-zinc-700'}`}
            >
              {uploadedDataUrl ? (
                <img src={uploadedDataUrl} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
                  <ImagePlus className="w-4 h-4 text-zinc-400" />
                </div>
              )}
              <div className="text-left flex-1 min-w-0">
                <p className="text-sm text-white font-medium">
                  {uploadedDataUrl ? 'Image uploaded' : 'Upload badge logo'}
                </p>
                <p className="text-[10px] text-zinc-500 truncate">
                  {uploadedDataUrl ? 'Click to replace' : 'PNG, JPG, WEBP, SVG'}
                </p>
              </div>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${source === 'upload' ? 'bg-[#00E5FF] text-black' : 'bg-zinc-800 text-zinc-400'}`}>
                {source === 'upload' ? 'Active' : 'Pick'}
              </span>
            </button>

            {/* Gym logo (shown when available or loading) */}
            {(gymLogoLoading || gymLogoDataUrl) && (
              <button
                type="button"
                onClick={() => { if (gymLogoDataUrl) setSource('gym_logo'); }}
                disabled={gymLogoLoading || !gymLogoDataUrl}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors disabled:opacity-50 disabled:cursor-wait ${source === 'gym_logo' ? 'border-[#00E5FF]/50 bg-[#00E5FF]/5' : 'border-zinc-800 hover:border-zinc-700'}`}
              >
                {gymLogoLoading ? (
                  <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
                    <Loader2 className="w-4 h-4 text-zinc-400 animate-spin" />
                  </div>
                ) : (
                  <img src={gymLogoDataUrl!} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
                )}
                <div className="text-left flex-1">
                  <p className="text-sm text-white font-medium">Gym logo</p>
                  <p className="text-[10px] text-zinc-500">{gymLogoLoading ? 'Loading…' : 'From gym settings'}</p>
                </div>
                {!gymLogoLoading && (
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${source === 'gym_logo' ? 'bg-[#00E5FF] text-black' : 'bg-zinc-800 text-zinc-400'}`}>
                    {source === 'gym_logo' ? 'Active' : 'Use'}
                  </span>
                )}
              </button>
            )}

            {/* Category icon */}
            <button
              type="button"
              onClick={() => setSource('category')}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors ${source === 'category' ? 'border-[#00E5FF]/50 bg-[#00E5FF]/5' : 'border-zinc-800 hover:border-zinc-700'}`}
            >
              <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-zinc-400" />
              </div>
              <div className="text-left flex-1">
                <p className="text-sm text-white font-medium">Category icon</p>
                <p className="text-[10px] text-zinc-500">Built-in icons</p>
              </div>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${source === 'category' ? 'bg-[#00E5FF] text-black' : 'bg-zinc-800 text-zinc-400'}`}>
                {source === 'category' ? 'Active' : 'Use'}
              </span>
            </button>

            {/* Category dropdown — only when category is active */}
            {source === 'category' && (
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value as CategoryKey)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-sm text-white focus:border-[#00E5FF] focus:outline-none"
              >
                {(Object.keys(CATEGORIES) as CategoryKey[]).map((k) => (
                  <option key={k} value={k}>{CATEGORIES[k].label}</option>
                ))}
              </select>
            )}
          </div>

          {/* Tier selector */}
          <div>
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Tier</p>
            <div className="grid grid-cols-5 gap-2">
              {TIER_ORDER.map((tier) => (
                <button
                  key={tier}
                  type="button"
                  onClick={() => setSelectedTier(tier)}
                  className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border transition-all ${selectedTier === tier ? 'border-[#00E5FF]/50 bg-[#00E5FF]/5' : 'border-zinc-800 hover:border-zinc-700 opacity-50'}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-gradient-to-br ${TIER_COLORS[tier]}`} />
                  <span className="text-[9px] font-bold text-zinc-300 tracking-wider uppercase">
                    {TIERS[tier].label.slice(0, 2)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-5 pt-0">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating || (source === 'upload' && !uploadedDataUrl)}
            className="flex-1 py-2.5 bg-[#00E5FF] text-black font-bold text-sm rounded-xl hover:bg-[#00E5FF]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {generating
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
              : <><Upload className="w-4 h-4" /> Generate &amp; Use</>
            }
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm rounded-xl hover:bg-zinc-700 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
