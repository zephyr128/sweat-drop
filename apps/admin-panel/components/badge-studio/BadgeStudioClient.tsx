'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';
import {
  Palette, Image as ImageIcon, Layers, Upload, Copy,
  Check, Link2, ChevronDown, Loader2, Sparkles, ImagePlus,
} from 'lucide-react';
import { BadgePreview } from './BadgePreview';
import { renderBadgeSVG, TIERS, TIER_ORDER, CATEGORIES } from '@/lib/badge-studio/badge-svg-template';
import { svgToPng, fetchAsDataUrl } from '@/lib/badge-studio/svg-to-png';
import { uploadBadge, attachBadgeToChallenge } from '@/lib/badge-studio/badge-upload';
import type { TierKey, CategoryKey } from '@/lib/badge-studio/badge-svg-template';

// ── Types ─────────────────────────────────────────────────────────

type LogoSource = 'gym_logo' | 'category' | 'custom_upload';

interface GymInfo {
  id: string;
  name: string;
  logo_url: string | null;
}

interface ChallengeOption {
  id: string;
  name: string;
  badge_image_url: string | null;
}

interface BadgeStudioClientProps {
  gym: GymInfo;
  challenges: ChallengeOption[];
}

// ── Helpers ───────────────────────────────────────────────────────

const TIER_COLORS: Record<Exclude<TierKey, 'custom'>, string> = {
  bronze:   'from-amber-900 to-amber-600',
  silver:   'from-zinc-500 to-zinc-300',
  gold:     'from-yellow-700 to-yellow-400',
  platinum: 'from-slate-500 to-slate-200',
  diamond:  'from-cyan-800 to-cyan-400',
};

// ── Component ─────────────────────────────────────────────────────

export function BadgeStudioClient({ gym, challenges }: BadgeStudioClientProps) {
  // ── Logo source ──
  const [logoSource, setLogoSource] = useState<LogoSource>(
    gym.logo_url ? 'gym_logo' : 'category',
  );
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey>('sessions');
  const [customUploadDataUrl, setCustomUploadDataUrl] = useState<string | null>(null);

  // ── Tiers ──
  const [selectedTiers, setSelectedTiers] = useState<Set<Exclude<TierKey, 'custom'>>>(
    new Set(TIER_ORDER),
  );

  // ── Custom colours (advanced) ──
  const [showCustomColors, setShowCustomColors] = useState(false);
  const [customAura,  setCustomAura]  = useState('#00E5FF');
  const [customPlate, setCustomPlate] = useState('#EAFBFF');
  const [customGrad0, setCustomGrad0] = useState('#003E66');
  const [customGrad1, setCustomGrad1] = useState('#6BDFFF');
  const [customGrad2, setCustomGrad2] = useState('#EAFBFF');
  const [customGrad3, setCustomGrad3] = useState('#0099CC');

  // ── Generation ──
  const [generating, setGenerating] = useState(false);
  const [generatedUrls, setGeneratedUrls] = useState<Partial<Record<Exclude<TierKey, 'custom'>, string>>>({});
  const [copiedTier, setCopiedTier] = useState<string | null>(null);

  // ── Attach ──
  const [attachTier, setAttachTier] = useState<Exclude<TierKey, 'custom'>>('gold');
  const [attachChallengeId, setAttachChallengeId] = useState<string>('');
  const [attaching, setAttaching] = useState(false);

  // ── Gym logo data URL (pre-fetched eagerly so preview updates live) ──
  const [gymLogoDataUrl, setGymLogoDataUrl] = useState<string | null>(null);
  const [gymLogoLoading, setGymLogoLoading] = useState(false);

  useEffect(() => {
    if (!gym.logo_url) return;
    let cancelled = false;
    setGymLogoLoading(true);
    fetchAsDataUrl(gym.logo_url)
      .then((dataUrl) => { if (!cancelled) setGymLogoDataUrl(dataUrl); })
      .catch(() => { if (!cancelled) toast.error('Could not load gym logo — check storage CORS settings'); })
      .finally(() => { if (!cancelled) setGymLogoLoading(false); });
    return () => { cancelled = true; };
  }, [gym.logo_url]);

  // ── Hidden file input (alternative to dropzone — simpler UX) ──
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Derive effective center image for preview & generate ──
  const effectiveCenter: string | undefined =
    logoSource === 'custom_upload' ? (customUploadDataUrl ?? undefined) :
    logoSource === 'gym_logo'      ? (gymLogoDataUrl ?? undefined) :
    undefined;

  const previewTiers = Array.from(selectedTiers) as TierKey[];

  // ── Dropzone for custom upload ──
  const onDrop = useCallback((accepted: File[]) => {
    const file = accepted[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCustomUploadDataUrl(reader.result as string);
    reader.readAsDataURL(file);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.svg'] },
    maxFiles: 1,
    multiple: false,
  });

  // ── Toggle tier selection ──
  const toggleTier = (tier: Exclude<TierKey, 'custom'>) => {
    setSelectedTiers((prev) => {
      const next = new Set(prev);
      if (next.has(tier)) {
        if (next.size === 1) return prev; // always keep at least one
        next.delete(tier);
      } else {
        next.add(tier);
      }
      return next;
    });
  };

  // ── Generate & Upload ──
  const handleGenerate = async () => {
    if (selectedTiers.size === 0) {
      toast.error('Select at least one tier to generate');
      return;
    }

    setGenerating(true);
    const newUrls: Partial<Record<Exclude<TierKey, 'custom'>, string>> = {};

    try {
      if (logoSource === 'gym_logo' && !gymLogoDataUrl) {
        toast.error('Gym logo is still loading — please wait a moment');
        setGenerating(false);
        return;
      }

      for (const tier of TIER_ORDER) {
        if (!selectedTiers.has(tier)) continue;

        const svg = renderBadgeSVG({
          tier,
          category: selectedCategory,
          customCenterImage: effectiveCenter,
          size: 512,
        });

        const blob = await svgToPng(svg, 512);
        const tierLabel = TIERS[tier].label.toLowerCase();
        const filename = `badge-${tierLabel}-${Date.now()}.png`;
        const url = await uploadBadge(gym.id, filename, blob);
        newUrls[tier] = url;
        toast.success(`${TIERS[tier].label} badge uploaded`);
      }

      setGeneratedUrls(newUrls);

      // Pre-select attach tier to the best generated one
      const preferOrder: Exclude<TierKey, 'custom'>[] = ['gold', 'platinum', 'diamond', 'silver', 'bronze'];
      const best = preferOrder.find((t) => newUrls[t]);
      if (best) setAttachTier(best);

    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  // ── Copy URL ──
  const copyUrl = (tier: Exclude<TierKey, 'custom'>, url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedTier(tier);
      setTimeout(() => setCopiedTier(null), 2000);
    });
  };

  // ── Attach badge to challenge ──
  const handleAttach = async () => {
    const url = generatedUrls[attachTier];
    if (!url) { toast.error('Generate badges first'); return; }
    if (!attachChallengeId) { toast.error('Select a challenge'); return; }

    setAttaching(true);
    try {
      await attachBadgeToChallenge(attachChallengeId, url);
      toast.success('Badge attached to challenge');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Attach failed');
    } finally {
      setAttaching(false);
    }
  };

  // ── Custom colors object ──
  const customColors = showCustomColors
    ? {
        grad: [customGrad0, customGrad1, customGrad2, customGrad3] as [string, string, string, string],
        aura:  customAura,
        plate: customPlate,
      }
    : undefined;

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 items-start">
      {/* Hidden file input — triggered by the Upload button */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            setCustomUploadDataUrl(reader.result as string);
            setLogoSource('custom_upload');
          };
          reader.readAsDataURL(file);
          e.target.value = '';
        }}
      />

      {/* ── Left panel ─────────────────────────────────────────── */}
      <div className="space-y-5">

        {/* Logo Source */}
        <section className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-[#00E5FF]" />
            <h2 className="text-sm font-semibold text-white">Center Image</h2>
          </div>

          {/* Upload badge logo (always available, shown first) */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors ${logoSource === 'custom_upload' ? 'border-[#00E5FF]/60 bg-[#00E5FF]/5' : 'border-zinc-800 hover:border-zinc-700'}`}
          >
            {customUploadDataUrl ? (
              <img src={customUploadDataUrl} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
                <ImagePlus className="w-4 h-4 text-zinc-400" />
              </div>
            )}
            <div className="text-left flex-1 min-w-0">
              <p className="text-sm font-medium text-white">
                {customUploadDataUrl ? 'Image uploaded' : 'Upload badge logo'}
              </p>
              <p className="text-[10px] text-zinc-500 truncate">
                {customUploadDataUrl ? 'Click to replace' : 'PNG, JPG, WEBP, SVG'}
              </p>
            </div>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${logoSource === 'custom_upload' ? 'bg-[#00E5FF] text-black' : 'bg-zinc-800 text-zinc-400'}`}>
              {logoSource === 'custom_upload' ? 'Active' : 'Pick'}
            </span>
          </button>

          {/* Also accept drop anywhere inside the dropzone when upload is active */}
          {logoSource === 'custom_upload' && (
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-xl p-3 text-center cursor-pointer transition-colors text-[10px] ${isDragActive ? 'border-[#00E5FF] bg-[#00E5FF]/5 text-[#00E5FF]' : 'border-zinc-800 text-zinc-600 hover:border-zinc-700'}`}
            >
              <input {...getInputProps()} />
              {isDragActive ? 'Drop image here' : 'Or drag &amp; drop here'}
            </div>
          )}

          {/* Gym logo option */}
          {(gym.logo_url || gymLogoLoading) && (
            <button
              type="button"
              onClick={() => { if (gymLogoDataUrl) setLogoSource('gym_logo'); }}
              disabled={gymLogoLoading || !gymLogoDataUrl}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors disabled:opacity-50 disabled:cursor-wait ${logoSource === 'gym_logo' ? 'border-[#00E5FF]/60 bg-[#00E5FF]/5' : 'border-zinc-800 hover:border-zinc-700'}`}
            >
              {gymLogoLoading ? (
                <div className="w-9 h-9 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
                  <Loader2 className="w-4 h-4 text-zinc-400 animate-spin" />
                </div>
              ) : gymLogoDataUrl ? (
                <img src={gymLogoDataUrl} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="w-9 h-9 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
                  <ImageIcon className="w-4 h-4 text-zinc-600" />
                </div>
              )}
              <div className="text-left flex-1">
                <p className="text-sm font-medium text-white">Gym logo</p>
                <p className="text-[10px] text-zinc-500">
                  {gymLogoLoading ? 'Loading…' : 'From gym settings'}
                </p>
              </div>
              {!gymLogoLoading && (
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${logoSource === 'gym_logo' ? 'bg-[#00E5FF] text-black' : 'bg-zinc-800 text-zinc-400'}`}>
                  {logoSource === 'gym_logo' ? 'Active' : 'Use'}
                </span>
              )}
            </button>
          )}

          {/* Category icon */}
          <button
            type="button"
            onClick={() => setLogoSource('category')}
            className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors ${logoSource === 'category' ? 'border-[#00E5FF]/60 bg-[#00E5FF]/5' : 'border-zinc-800 hover:border-zinc-700'}`}
          >
            <div className="w-9 h-9 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-zinc-400" />
            </div>
            <div className="text-left flex-1">
              <p className="text-sm font-medium text-white">Category icon</p>
              <p className="text-[10px] text-zinc-500">Built-in icons</p>
            </div>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${logoSource === 'category' ? 'bg-[#00E5FF] text-black' : 'bg-zinc-800 text-zinc-400'}`}>
              {logoSource === 'category' ? 'Active' : 'Use'}
            </span>
          </button>

          {/* Category dropdown — only when category is active */}
          {logoSource === 'category' && (
            <div className="relative">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value as CategoryKey)}
                className="w-full appearance-none pl-3 pr-8 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-sm text-white focus:border-[#00E5FF] focus:outline-none"
              >
                {(Object.keys(CATEGORIES) as CategoryKey[]).map((k) => (
                  <option key={k} value={k}>{CATEGORIES[k].label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
            </div>
          )}
        </section>

        {/* Tier selector */}
        <section className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#00E5FF]" />
            <h2 className="text-sm font-semibold text-white">Tiers to Generate</h2>
          </div>

          <div className="grid grid-cols-5 gap-2">
            {TIER_ORDER.map((tier) => {
              const def = TIERS[tier];
              const active = selectedTiers.has(tier);
              return (
                <button
                  key={tier}
                  type="button"
                  onClick={() => toggleTier(tier)}
                  className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border transition-all ${active ? 'border-[#00E5FF]/50 bg-[#00E5FF]/5' : 'border-zinc-800 hover:border-zinc-700 opacity-40'}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-gradient-to-br ${TIER_COLORS[tier]}`} />
                  <span className="text-[9px] font-bold text-zinc-300 tracking-wider uppercase">
                    {def.label.slice(0, 2)}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-zinc-600">
            {selectedTiers.size} tier{selectedTiers.size !== 1 ? 's' : ''} selected
          </p>
        </section>

        {/* Custom colours (advanced) */}
        <section className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-5 space-y-3">
          <button
            type="button"
            onClick={() => setShowCustomColors((v) => !v)}
            className="flex items-center justify-between w-full"
          >
            <div className="flex items-center gap-2">
              <Palette className="w-4 h-4 text-[#00E5FF]" />
              <h2 className="text-sm font-semibold text-white">Custom Colours</h2>
            </div>
            <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform ${showCustomColors ? 'rotate-180' : ''}`} />
          </button>

          {showCustomColors && (
            <div className="space-y-3 pt-1">
              <p className="text-[10px] text-zinc-500">
                Adds a &quot;Custom&quot; tier variant using the colours below.
              </p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Aura',       value: customAura,  setter: setCustomAura },
                  { label: 'Plate / Icon', value: customPlate, setter: setCustomPlate },
                  { label: 'Grad stop 1', value: customGrad0, setter: setCustomGrad0 },
                  { label: 'Grad stop 2', value: customGrad1, setter: setCustomGrad1 },
                  { label: 'Grad stop 3', value: customGrad2, setter: setCustomGrad2 },
                  { label: 'Grad stop 4', value: customGrad3, setter: setCustomGrad3 },
                ].map(({ label, value, setter }) => (
                  <div key={label}>
                    <label className="block text-[9px] text-zinc-500 mb-1 uppercase tracking-wider">{label}</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={value}
                        onChange={(e) => setter(e.target.value)}
                        className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
                      />
                      <input
                        type="text"
                        value={value}
                        onChange={(e) => setter(e.target.value)}
                        className="flex-1 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-[10px] text-white font-mono focus:border-[#00E5FF] focus:outline-none uppercase"
                        maxLength={7}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Generate button */}
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating || selectedTiers.size === 0}
          className="w-full py-3 bg-[#00E5FF] text-black font-bold rounded-xl hover:bg-[#00E5FF]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {generating ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
          ) : (
            <><Upload className="w-4 h-4" /> Generate &amp; Upload</>
          )}
        </button>

        {/* Generated URLs */}
        {Object.keys(generatedUrls).length > 0 && (
          <section className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-5 space-y-3">
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Generated Badges</h2>
            <div className="space-y-2">
              {TIER_ORDER.filter((t) => generatedUrls[t]).map((tier) => (
                <div key={tier} className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full bg-gradient-to-br ${TIER_COLORS[tier]} shrink-0`} />
                  <span className="text-xs text-zinc-300 flex-1 truncate font-mono text-[10px]">
                    {generatedUrls[tier]!.split('/').slice(-2).join('/')}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyUrl(tier, generatedUrls[tier]!)}
                    className="p-1 rounded hover:bg-zinc-800 transition-colors"
                    title="Copy URL"
                  >
                    {copiedTier === tier
                      ? <Check className="w-3 h-3 text-green-400" />
                      : <Copy className="w-3 h-3 text-zinc-500" />
                    }
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Attach to challenge */}
        {Object.keys(generatedUrls).length > 0 && challenges.length > 0 && (
          <section className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-[#00E5FF]" />
              <h2 className="text-sm font-semibold text-white">Attach to Challenge</h2>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] text-zinc-500 mb-1 uppercase tracking-wider">Badge tier</label>
                <select
                  value={attachTier}
                  onChange={(e) => setAttachTier(e.target.value as Exclude<TierKey, 'custom'>)}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:border-[#00E5FF] focus:outline-none"
                >
                  {TIER_ORDER.filter((t) => generatedUrls[t]).map((tier) => (
                    <option key={tier} value={tier}>{TIERS[tier].label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] text-zinc-500 mb-1 uppercase tracking-wider">Challenge</label>
                <select
                  value={attachChallengeId}
                  onChange={(e) => setAttachChallengeId(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:border-[#00E5FF] focus:outline-none"
                >
                  <option value="">— Select challenge —</option>
                  {challenges.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.badge_image_url ? ' ✓' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={handleAttach}
                disabled={attaching || !attachChallengeId}
                className="w-full py-2.5 bg-zinc-800 border border-zinc-700 text-white font-semibold text-sm rounded-xl hover:bg-zinc-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {attaching ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                ) : (
                  'Save Badge to Challenge'
                )}
              </button>
            </div>
          </section>
        )}
      </div>

      {/* ── Right panel: live preview ───────────────────────────── */}
      <div className="sticky top-6 bg-zinc-900/50 border border-zinc-800 rounded-2xl p-8 min-h-[300px] flex flex-col items-center justify-center gap-6">
        <div className="flex items-center gap-2 self-start w-full">
          <h2 className="text-sm font-semibold text-white">Live Preview</h2>
          <span className="text-[10px] text-zinc-500">Updates as you change options</span>
        </div>

        {previewTiers.length > 0 ? (
          <BadgePreview
            tiers={[
              ...previewTiers,
              ...(showCustomColors && customColors ? (['custom'] as TierKey[]) : []),
            ]}
            category={selectedCategory}
            customCenterImage={effectiveCenter}
            customColors={customColors}
            size={120}
          />
        ) : (
          <p className="text-zinc-600 text-sm">Select at least one tier</p>
        )}

        {/* After generation, also show the uploaded images */}
        {Object.keys(generatedUrls).length > 0 && (
          <div className="w-full border-t border-zinc-800 pt-4">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-3">Uploaded PNGs</p>
            <div className="flex flex-wrap gap-3 justify-center">
              {TIER_ORDER.filter((t) => generatedUrls[t]).map((tier) => (
                <div key={tier} className="flex flex-col items-center gap-1">
                  <img
                    src={generatedUrls[tier]}
                    alt={TIERS[tier].label}
                    className="w-20 h-20 rounded-xl object-contain border border-zinc-700"
                  />
                  <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">
                    {TIERS[tier].label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
