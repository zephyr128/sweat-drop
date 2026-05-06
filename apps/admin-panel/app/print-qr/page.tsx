'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import { Printer, Download, Copy, Check } from 'lucide-react';
import {
  CHECKIN_CTAS,
  CHECKIN_PRESETS,
  COMBO_PRESETS,
  CUSTOM_CTA_ID,
  CUSTOM_CTA_OPTION,
  DEFAULT_COMBO_CTA_ID,
  MACHINE_CTAS,
  MACHINE_PRESETS,
  StickerArtwork,
  SweatDropGlyph,
  ctaCharCap,
  resolveCta,
  type CtaOption,
  type Preset,
} from '@/components/print-studio/shared';
import { warmLogoCache } from '@/components/ui/BrandedQRCode';
import { machineQrUrl, checkinQrUrl } from '@/lib/qr-urls';

// ---------------------------------------------------------------------------
// localStorage keys for operator-controlled studio state. Plain client-side
// concerns — never round-trip these to the backend.
// ---------------------------------------------------------------------------
const customCtaStorageKey = (type: 'checkin' | 'machine') =>
  `sweatdrop:print:custom-cta:${type}`;

// Sanitize operator-typed copy: keep printable ASCII + Latin Extended,
// strip everything else (emojis, zero-width chars, control bytes — none of
// which the print pipeline can typeset reliably). Hard cap at 60 characters
// per line to prevent absurd input; visual cap (`ctaCharCap`) is advisory.
function sanitizeCustomCopy(s: string): string {
  return s.replace(/[^\u0020-\u024F]/g, '').slice(0, 60);
}

type PresetGroup = {
  title: string;
  description?: string;
  presets: Preset[];
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function PrintQRContent() {
  const searchParams = useSearchParams();

  const initialType = (searchParams.get('type') || 'checkin') as 'checkin' | 'machine';
  const gymId = searchParams.get('gymId') || '';
  const gymName = searchParams.get('gymName') || 'Your Gym';
  const machineId = searchParams.get('machineId') || '';
  const machineName = searchParams.get('machineName') || 'Machine';
  const machineTypeParam = (searchParams.get('machineType') || '') as
    | 'treadmill'
    | 'bike'
    | '';

  // Resolve QR payload
  const qrData = useMemo(() => {
    if (initialType === 'checkin') {
      return checkinQrUrl(gymId);
    }
    return machineQrUrl(machineId, machineTypeParam);
  }, [initialType, gymId, machineId, machineTypeParam]);

  // ---- Local UI state ----
  // Preset groups: machine stickers default to the premium QR + NFC combo
  // family, with the QR-only legacy presets demoted to a secondary group.
  // Reception (check-in) stickers stay QR-only for now — they sit on the
  // counter where members type a card / scan a code and don't benefit from
  // NFC integration the same way machine stickers do.
  const presetGroups: PresetGroup[] = useMemo(() => {
    if (initialType === 'machine') {
      return [
        {
          title: 'QR + NFC · Recommended',
          description: 'Single die-cut, dual transport.',
          presets: COMBO_PRESETS,
        },
        {
          title: 'QR-only · Legacy',
          description: 'No NFC chip. Compatible with v1 print runs.',
          presets: MACHINE_PRESETS,
        },
      ];
    }
    return [{ title: 'Reception', presets: CHECKIN_PRESETS }];
  }, [initialType]);

  const allPresets = useMemo(
    () => presetGroups.flatMap((g) => g.presets),
    [presetGroups],
  );

  // CTAs — append the Custom marker so operators can opt into typed copy
  // without hunting for the option in a hidden menu.
  const baseCtas = initialType === 'checkin' ? CHECKIN_CTAS : MACHINE_CTAS;
  const ctas: CtaOption[] = useMemo(
    () => [...baseCtas, CUSTOM_CTA_OPTION],
    [baseCtas],
  );

  const defaultPresetId =
    initialType === 'machine' ? COMBO_PRESETS[0].id : CHECKIN_PRESETS[0].id;
  const [presetId, setPresetId] = useState<string>(defaultPresetId);
  // Combo presets default to the tap-first headline ("TAP HERE / EARN DROPS").
  // QR-only legacy presets default to the first entry of the existing CTA
  // library — preserves the pre-redesign behaviour for the legacy branch.
  const defaultCtaId =
    initialType === 'machine' ? DEFAULT_COMBO_CTA_ID : baseCtas[0].id;
  const [ctaId, setCtaId] = useState<string>(defaultCtaId);
  const [copied, setCopied] = useState(false);

  // Operator-typed Line 1 / Line 2 — only used when the Custom CTA is active.
  // Persisted to localStorage so reopening the studio restores the last copy.
  const [customLine1, setCustomLine1] = useState('');
  const [customLine2, setCustomLine2] = useState('');

  const preset = allPresets.find((p) => p.id === presetId) ?? allPresets[0];
  const selectedCta = ctas.find((c) => c.id === ctaId) ?? ctas[0];
  const cta = resolveCta(selectedCta, { line1: customLine1, line2: customLine2 });
  const charCap = ctaCharCap(preset);

  // Portal mount guard — `createPortal` needs `document` which isn't available during
  // SSR. We flip this after the client mounts.
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => {
    setPortalReady(true);
    // Pre-generate the rounded app icon so the print portal renders with the
    // logo embedded on first paint. Without this warm-up the first click on
    // Print can race the async canvas generation and Chrome captures an empty
    // logo slot in the printed PDF.
    void warmLogoCache();
  }, []);

  // Hydrate operator-controlled studio state from localStorage on mount.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(customCtaStorageKey(initialType));
      if (raw) {
        const parsed = JSON.parse(raw) as { line1?: unknown; line2?: unknown };
        if (typeof parsed.line1 === 'string') setCustomLine1(parsed.line1);
        if (typeof parsed.line2 === 'string') setCustomLine2(parsed.line2);
      }
    } catch {
      // localStorage may be unavailable (private mode, security policy).
    }
  }, [initialType]);

  // Persist operator-typed copy on every change so the next session re-hydrates.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        customCtaStorageKey(initialType),
        JSON.stringify({ line1: customLine1, line2: customLine2 }),
      );
    } catch {
      // ignore
    }
  }, [initialType, customLine1, customLine2]);

  const handlePrint = async () => {
    await warmLogoCache();
    window.print();
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(qrData);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // On-sticker caption:
  //   - Machine stickers: no caption (user is standing at the machine; "Bike 2 / BIKE"
  //     communicates nothing useful and clutters the design).
  //   - Check-in stickers: gym name only — confirms "you're at the right gym".
  const caption = initialType === 'checkin' ? gymName : null;

  // Print CSS strategy:
  //   - `@page size` sets paper dimensions (Chrome honors this when the print dialog's
  //     "Paper size" is set to "Default").
  //   - The sticker is portal-rendered as a direct child of <body> via `.print-host`,
  //     so we can simply `display: none` every sibling of `.print-host` during print
  //     instead of wrestling with `position: fixed` (which Chrome replicates on every
  //     paginated page, causing 8 identical pages on tall layouts) or `visibility:
  //     hidden` (which preserves layout box heights → phantom blank pages).
  //   - `.print-host` only renders its children under `@media print`; the on-screen
  //     preview (inside `.screen-only`) is a separate instance.
  //   - Combo presets render with rounded sticker corners — to make them visible
  //     against the page, the print body is white. QR-only/legacy presets keep the
  //     edge-to-edge black background to match the v1 print profile.
  const printBg = preset.kind === 'combo' ? '#ffffff' : '#000000';
  const pageCss = `
    @page { size: ${preset.widthIn}in ${preset.heightIn}in; margin: 0; }
    .print-host { display: none; }
    @media print {
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        background: ${printBg} !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      body > *:not(.print-host) { display: none !important; }
      .print-host { display: block !important; }
      .print-host .print-page {
        width: ${preset.widthIn}in !important;
        height: ${preset.heightIn}in !important;
        margin: 0 !important;
        box-shadow: none !important;
      }
    }
  `;

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <style dangerouslySetInnerHTML={{ __html: pageCss }} />

      {/* ------------------------- TOP BAR ------------------------- */}
      <header className="no-print sticky top-0 z-20 border-b border-[#1a1a1a] bg-[#050505]/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#00E5FF]/10 ring-1 ring-[#00E5FF]/30">
              <SweatDropGlyph className="h-5 w-5 text-[#00E5FF]" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[3px] text-[#00E5FF]">
                SweatDrop · Print Studio
              </div>
              <div className="text-sm text-zinc-400">
                {initialType === 'checkin' ? 'Check-In QR' : 'Machine QR'}
                {(initialType === 'checkin' ? gymName : machineName) && (
                  <>
                    {' · '}
                    <span className="text-zinc-200">
                      {initialType === 'checkin' ? gymName : machineName}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-2 rounded-lg border border-[#222] bg-[#0c0c0c] px-3 py-2 text-xs text-zinc-300 hover:border-[#00E5FF]/40 hover:text-white"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-[#00E5FF]" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 rounded-lg bg-[#00E5FF] px-4 py-2 text-sm font-semibold text-black hover:bg-[#00c8e0]"
            >
              <Printer className="h-4 w-4" />
              Print
            </button>
          </div>
        </div>
      </header>

      {/* ------------------------- LAYOUT ------------------------- */}
      <div className="no-print mx-auto grid max-w-7xl grid-cols-12 gap-6 px-6 py-8">
        {/* CONTROLS */}
        <aside className="col-span-12 lg:col-span-4 xl:col-span-3">
          <div className="space-y-6">
            {/* Size — grouped: combo (recommended) + qr-only (legacy) */}
            <Section title="Format" hint="Dimensions of the printed piece">
              <div className="space-y-4">
                {presetGroups.map((g) => (
                  <div key={g.title}>
                    <div className="mb-1.5 flex items-baseline justify-between">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                        {g.title}
                      </div>
                      {g.description && (
                        <div className="text-[9px] text-zinc-600">{g.description}</div>
                      )}
                    </div>
                    <div className="space-y-2">
                      {g.presets.map((p) => (
                        <OptionCard
                          key={p.id}
                          active={p.id === preset.id}
                          onClick={() => setPresetId(p.id)}
                          label={p.label}
                          description={p.description}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {/* CTA — curated entries + Custom expander */}
            <Section title="Headline" hint="Call-to-action copy">
              <div className="space-y-2">
                {ctas.map((c) => {
                  if (c.id === CUSTOM_CTA_ID) {
                    return (
                      <div key={c.id}>
                        <OptionCard
                          active={ctaId === c.id}
                          onClick={() => setCtaId(c.id)}
                          label="Custom…"
                          description="Type your own headline"
                        />
                        {ctaId === CUSTOM_CTA_ID && (
                          <CustomCtaForm
                            line1={customLine1}
                            line2={customLine2}
                            onLine1Change={(v) => setCustomLine1(sanitizeCustomCopy(v))}
                            onLine2Change={(v) => setCustomLine2(sanitizeCustomCopy(v))}
                            charCap={charCap}
                          />
                        )}
                      </div>
                    );
                  }
                  return (
                    <OptionCard
                      key={c.id}
                      active={c.id === ctaId}
                      onClick={() => setCtaId(c.id)}
                      label={[c.line1, c.line2].filter(Boolean).join(' ')}
                    />
                  );
                })}
              </div>
            </Section>

            <Section title="Payload" hint="QR code destination">
              <code className="block break-all rounded-md border border-[#1a1a1a] bg-[#0a0a0a] px-3 py-2 text-[11px] text-[#00E5FF]">
                {qrData}
              </code>
            </Section>

            <div className="rounded-lg border border-[#1a1a1a] bg-[#0a0a0a] p-3 text-[11px] text-zinc-500 space-y-2">
              <div className="flex items-center gap-2 text-zinc-300">
                <Download className="h-4 w-4 shrink-0 text-[#00E5FF]" />
                <span className="font-semibold">Export to PDF</span>
              </div>
              <ol className="list-decimal list-inside space-y-1 pl-1 text-zinc-500 leading-relaxed">
                <li>Click <span className="text-zinc-300">Print</span> above.</li>
                <li>Destination → <span className="text-zinc-300">Save as PDF</span>.</li>
                <li>
                  Paper size → <span className="text-[#00E5FF]">Default</span> (so the {preset.widthIn}″ × {preset.heightIn}″ page size is honored).
                  Do <em>not</em> pick A4/Letter — that forces a full sheet.
                </li>
                <li>Margins → <span className="text-zinc-300">None</span>.</li>
              </ol>
              <div className="pt-1 text-zinc-600">
                Print on removable adhesive vinyl — sticks cleanly, peels without residue.
              </div>
            </div>
          </div>
        </aside>

        {/* PREVIEW */}
        <main className="col-span-12 flex items-start justify-center lg:col-span-8 xl:col-span-9">
          <div
            className="relative flex items-center justify-center overflow-auto rounded-2xl p-10"
            style={{
              background:
                'radial-gradient(1200px 600px at 50% -10%, rgba(0,229,255,0.07), transparent 60%), #070707',
              minHeight: '70vh',
              width: '100%',
            }}
          >
            {/* Ruler label */}
            <div className="absolute left-4 top-4 font-mono text-[10px] uppercase tracking-[2px] text-zinc-600">
              {preset.widthIn}″ × {preset.heightIn}″ · {preset.orientation}
            </div>

            <div
              className="preview-sticker shadow-[0_30px_120px_-20px_rgba(0,229,255,0.2)]"
              style={{
                width: `${preset.widthIn}in`,
                height: `${preset.heightIn}in`,
                flexShrink: 0,
                overflow: 'hidden',
              }}
            >
              <StickerArtwork
                preset={preset}
                cta={cta}
                qrData={qrData}
                caption={caption}
                showTapOrScanLabel={initialType === 'checkin'}
              />
            </div>
          </div>
        </main>
      </div>

      {/*
        Print portal — rendered as a direct child of <body> so the print CSS can cleanly
        `display: none` every sibling and emit exactly one page at exact sticker size.
        Not visible on screen (`.print-host { display: none }`), only activated under
        `@media print`.
      */}
      {portalReady &&
        createPortal(
          <div className="print-host">
            <div
              className="print-page"
              style={{
                width: `${preset.widthIn}in`,
                height: `${preset.heightIn}in`,
                overflow: 'hidden',
              }}
            >
              <StickerArtwork
                preset={preset}
                cta={cta}
                qrData={qrData}
                caption={caption}
                showTapOrScanLabel={initialType === 'checkin'}
              />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}


// ---------------------------------------------------------------------------
// UI primitives for the designer panel
// ---------------------------------------------------------------------------

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-[2px] text-zinc-300">
          {title}
        </div>
        {hint && <div className="text-[10px] text-zinc-600">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function OptionCard({
  active,
  onClick,
  label,
  description,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  description?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-lg border px-3 py-2.5 text-left transition-all ${
        active
          ? 'border-[#00E5FF]/60 bg-[#00E5FF]/10 shadow-[0_0_0_1px_rgba(0,229,255,0.25)_inset]'
          : 'border-[#1a1a1a] bg-[#0a0a0a] hover:border-[#2a2a2a]'
      }`}
    >
      <div className={`text-sm font-semibold ${active ? 'text-white' : 'text-zinc-200'}`}>
        {label}
      </div>
      {description && (
        <div className={`mt-0.5 text-[11px] ${active ? 'text-[#00E5FF]/80' : 'text-zinc-500'}`}>
          {description}
        </div>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Custom CTA form — operator-typed Line 1 / Line 2. Mounted inside the
// Headline section when the Custom… option is selected.
//
// Length cap is advisory (red badge), not blocking. The print pipeline lays
// out long copy with `wordBreak: break-word` so it shrink-wraps rather than
// overflowing the sticker.
// ---------------------------------------------------------------------------

function CustomCtaForm({
  line1,
  line2,
  onLine1Change,
  onLine2Change,
  charCap,
}: {
  line1: string;
  line2: string;
  onLine1Change: (value: string) => void;
  onLine2Change: (value: string) => void;
  charCap: number;
}) {
  return (
    <div className="mt-2 space-y-2.5 rounded-lg border border-[#00E5FF]/30 bg-[#00E5FF]/[0.04] p-3">
      <CustomInput
        label="Line 1"
        value={line1}
        onChange={onLine1Change}
        cap={charCap}
        placeholder="EVERY DROP"
      />
      <CustomInput
        label="Line 2"
        value={line2}
        onChange={onLine2Change}
        cap={charCap}
        placeholder="COUNTS"
        optional
      />
      <p className="text-[10px] leading-relaxed text-zinc-500">
        Auto-uppercased on the sticker. Up to ~{charCap} characters per line for
        this preset; longer copy wraps but stays printable.
      </p>
    </div>
  );
}

function CustomInput({
  label,
  value,
  onChange,
  cap,
  placeholder,
  optional,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  cap: number;
  placeholder: string;
  optional?: boolean;
}) {
  const overflow = value.length > cap;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-[10px] uppercase tracking-wider">
        <span className="text-zinc-400">
          {label}
          {optional && <span className="ml-1 text-zinc-600">· optional</span>}
        </span>
        <span className={overflow ? 'text-red-400' : 'text-zinc-600'}>
          {value.length}/{cap}
        </span>
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        autoCapitalize="characters"
        className="w-full rounded-md border border-[#222] bg-[#0a0a0a] px-2.5 py-1.5 text-sm text-white placeholder:text-zinc-700 focus:border-[#00E5FF]/60 focus:outline-none"
      />
    </div>
  );
}

export default function PrintQRPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-black text-white">
          Loading…
        </div>
      }
    >
      <PrintQRContent />
    </Suspense>
  );
}
