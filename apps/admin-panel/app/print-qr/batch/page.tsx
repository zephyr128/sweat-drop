'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ClipboardList,
  Printer,
  AlertTriangle,
  CheckSquare,
  Square,
  Loader2,
} from 'lucide-react';
import { BrandedQRCode, warmLogoCache } from '@/components/ui/BrandedQRCode';
import {
  MACHINE_CTAS,
  MACHINE_PRESETS,
  StickerArtwork,
  SweatDropGlyph,
  type CtaOption,
  type Preset,
} from '@/components/print-studio/shared';
import {
  getMachinesForPrintBatch,
  type PrintBatchMachine,
} from '@/lib/actions/machine-actions';
import { machineQrUrl } from '@/lib/qr-urls';

// ---------------------------------------------------------------------------
// Batch print studio
//
// Produces a gym "install kit":
//   1. Manifest (A4 portrait) — checklist the installer carries into the gym.
//      Lists every machine with its name, type, short UUID, and a mini-QR
//      thumbnail so you can verify stickers match without opening the app.
//   2. Sticker sheet — one page per machine at the chosen preset size
//      (portrait / landscape / square). Saved as a single multi-page PDF that
//      you hand to the print shop.
//
// The manifest and sticker flows share one print CSS / portal setup: only one
// print mode is active at a time (state-driven) so we never leak mixed page
// sizes into the same PDF.
// ---------------------------------------------------------------------------

type PrintMode = 'stickers' | 'manifest' | null;

function BatchPrintContent() {
  const searchParams = useSearchParams();
  const gymId = searchParams.get('gymId') || '';

  // Remote data
  const [gymName, setGymName] = useState<string>('');
  const [allMachines, setAllMachines] = useState<PrintBatchMachine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selection (default: every machine)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Sticker design controls (shared across every sticker in the batch)
  const [presetId, setPresetId] = useState<string>(MACHINE_PRESETS[0].id);
  const [ctaId, setCtaId] = useState<string>(MACHINE_CTAS[0].id);

  // Print-flow state machine — null = regular on-screen preview.
  const [printMode, setPrintMode] = useState<PrintMode>(null);

  // Portal readiness (needed for SSR safety with `createPortal`).
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => {
    setPortalReady(true);
    // Warm the rounded-logo cache on mount so the very first print click
    // already has the embedded app icon ready — no empty squares in the PDF.
    void warmLogoCache();
  }, []);

  // Load data on mount.
  useEffect(() => {
    let cancelled = false;
    if (!gymId) {
      setError('Missing ?gymId parameter.');
      setLoading(false);
      return;
    }
    (async () => {
      const result = await getMachinesForPrintBatch(gymId);
      if (cancelled) return;
      if (!result.success) {
        setError(result.error);
        setLoading(false);
        return;
      }
      setGymName(result.data.gym.name);
      setAllMachines(result.data.machines);
      setSelectedIds(new Set(result.data.machines.map((m) => m.id)));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [gymId]);

  // Resolved selections
  const preset = useMemo(
    () => MACHINE_PRESETS.find((p) => p.id === presetId) ?? MACHINE_PRESETS[0],
    [presetId],
  );
  const cta = useMemo(
    () => MACHINE_CTAS.find((c) => c.id === ctaId) ?? MACHINE_CTAS[0],
    [ctaId],
  );
  const selectedMachines = useMemo(
    () => allMachines.filter((m) => selectedIds.has(m.id)),
    [allMachines, selectedIds],
  );
  const selectedCount = selectedMachines.length;

  // Sticker helpers
  const toggleMachine = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAll = () => setSelectedIds(new Set(allMachines.map((m) => m.id)));
  const selectNone = () => setSelectedIds(new Set());

  // Print flow — warm the logo cache, flip `printMode`, give React a beat to
  // mount the print portal, call `window.print`, then reset.
  const runPrint = async (mode: Exclude<PrintMode, null>) => {
    if (selectedCount === 0 && mode === 'stickers') return;
    if (allMachines.length === 0) return;
    // Make sure the rounded app icon is in the cache before we mount N QR
    // codes inside the print portal. Without this, if the user clicks print
    // faster than the preview finished rasterizing the logo, the portal-
    // mounted instances race `window.print()` and Chrome captures empty.
    await warmLogoCache();
    setPrintMode(mode);
    // Double rAF so the portal's DOM is committed before the print dialog opens.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print();
        setPrintMode(null);
      });
    });
  };

  // Dynamic @page CSS — size depends on which print mode is active.
  const pageCss = useMemo(() => {
    // A4 portrait for the manifest; preset dimensions for sticker sheets.
    const pageSize =
      printMode === 'manifest' ? '210mm 297mm' : `${preset.widthIn}in ${preset.heightIn}in`;
    const pageWidth = printMode === 'manifest' ? '210mm' : `${preset.widthIn}in`;
    const pageHeight = printMode === 'manifest' ? '297mm' : `${preset.heightIn}in`;

    return `
      @page { size: ${pageSize}; margin: 0; }
      .print-host { display: none; }
      @media print {
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          background: ${printMode === 'manifest' ? '#fff' : '#000'} !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        body > *:not(.print-host) { display: none !important; }
        .print-host { display: block !important; }
        .print-host .print-page {
          width: ${pageWidth} !important;
          height: ${pageHeight} !important;
          margin: 0 !important;
          box-shadow: none !important;
          page-break-after: always;
          break-after: page;
        }
        .print-host .print-page:last-child {
          page-break-after: auto;
          break-after: auto;
        }
      }
    `;
  }, [preset, printMode]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050505] text-zinc-400">
        <Loader2 className="mr-2 h-4 w-4 animate-spin text-[#00E5FF]" />
        Loading machines…
      </div>
    );
  }

  if (error || !gymId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050505] text-white">
        <div className="max-w-md rounded-xl border border-red-500/40 bg-red-500/5 p-6 text-center">
          <AlertTriangle className="mx-auto mb-3 h-6 w-6 text-red-400" />
          <div className="mb-1 text-sm font-semibold">Couldn&apos;t open Batch Studio</div>
          <div className="text-xs text-zinc-400">{error ?? 'Unknown error'}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <style dangerouslySetInnerHTML={{ __html: pageCss }} />

      {/* ------------------------- TOP BAR ------------------------- */}
      <header className="no-print sticky top-0 z-20 border-b border-[#1a1a1a] bg-[#050505]/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link
              href={`/dashboard/gym/${gymId}/machines`}
              className="flex items-center gap-2 rounded-lg border border-[#222] bg-[#0c0c0c] px-3 py-2 text-xs text-zinc-400 hover:border-[#00E5FF]/40 hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </Link>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#00E5FF]/10 ring-1 ring-[#00E5FF]/30">
              <SweatDropGlyph className="h-5 w-5 text-[#00E5FF]" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[3px] text-[#00E5FF]">
                SweatDrop · Batch Print
              </div>
              <div className="text-sm text-zinc-400">
                Install kit ·{' '}
                <span className="text-zinc-200">{gymName}</span>{' '}
                <span className="text-zinc-600">
                  · {selectedCount}/{allMachines.length} selected
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => runPrint('manifest')}
              disabled={allMachines.length === 0}
              className="flex items-center gap-2 rounded-lg border border-[#222] bg-[#0c0c0c] px-3 py-2 text-xs text-zinc-200 hover:border-[#00E5FF]/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ClipboardList className="h-3.5 w-3.5" />
              Print Manifest (A4)
            </button>
            <button
              onClick={() => runPrint('stickers')}
              disabled={selectedCount === 0}
              className="flex items-center gap-2 rounded-lg bg-[#00E5FF] px-4 py-2 text-sm font-semibold text-black hover:bg-[#00c8e0] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Printer className="h-4 w-4" />
              Print {selectedCount} {selectedCount === 1 ? 'Sticker' : 'Stickers'}
            </button>
          </div>
        </div>
      </header>

      {/* ------------------------- LAYOUT ------------------------- */}
      <div className="no-print mx-auto grid max-w-7xl grid-cols-12 gap-6 px-6 py-8">
        {/* CONTROLS */}
        <aside className="col-span-12 space-y-6 lg:col-span-4 xl:col-span-3">
          <Section title="Format" hint="Same size for every sticker in the batch">
            <div className="space-y-2">
              {MACHINE_PRESETS.map((p) => (
                <OptionCard
                  key={p.id}
                  active={p.id === preset.id}
                  onClick={() => setPresetId(p.id)}
                  label={p.label}
                  description={p.description}
                />
              ))}
            </div>
          </Section>

          <Section title="Headline" hint="Same CTA across every sticker">
            <div className="space-y-2">
              {MACHINE_CTAS.map((c) => (
                <OptionCard
                  key={c.id}
                  active={c.id === cta.id}
                  onClick={() => setCtaId(c.id)}
                  label={[c.line1, c.line2].filter(Boolean).join(' ')}
                />
              ))}
            </div>
          </Section>

          <div className="rounded-lg border border-[#1a1a1a] bg-[#0a0a0a] p-3 text-[11px] leading-relaxed text-zinc-500 space-y-2">
            <div className="flex items-center gap-2 text-zinc-300">
              <Printer className="h-4 w-4 shrink-0 text-[#00E5FF]" />
              <span className="font-semibold">Export workflow</span>
            </div>
            <ol className="list-decimal space-y-1 pl-4">
              <li>
                <span className="text-zinc-300">Print Manifest (A4)</span> first — save as{' '}
                <code className="text-[#00E5FF]">00-manifest.pdf</code>. Print on regular
                paper, carry into the gym as your checklist.
              </li>
              <li>
                <span className="text-zinc-300">Print Stickers</span> — save as{' '}
                <code className="text-[#00E5FF]">stickers.pdf</code>. Paper size →{' '}
                <span className="text-[#00E5FF]">Default</span> (not A4/Letter). Margins →{' '}
                <span className="text-zinc-300">None</span>. Send to print shop on
                removable adhesive vinyl.
              </li>
              <li>
                Stickers print in the exact same order as the manifest. Ask the print shop to
                keep the physical order and number the backing 1 → N.
              </li>
            </ol>
          </div>
        </aside>

        {/* MACHINES + PREVIEW */}
        <main className="col-span-12 space-y-6 lg:col-span-8 xl:col-span-9">
          {/* Preview */}
          <div>
            <div className="mb-3 flex items-center gap-3 text-[11px] uppercase tracking-[2px] text-zinc-500">
              <span>Sticker preview</span>
              <span className="text-zinc-700">·</span>
              <span className="text-zinc-400">
                {preset.widthIn}″ × {preset.heightIn}″ · {preset.orientation}
              </span>
            </div>
            <div
              className="relative flex items-center justify-center overflow-auto rounded-2xl p-8"
              style={{
                background:
                  'radial-gradient(1200px 600px at 50% -10%, rgba(0,229,255,0.07), transparent 60%), #070707',
              }}
            >
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
                  qrData={
                    selectedMachines[0]
                      ? buildMachineQrUrl(selectedMachines[0])
                      : 'sweatdrop://preview'
                  }
                  caption={null}
                />
              </div>
            </div>
            <p className="mt-2 text-[11px] text-zinc-600">
              Live preview uses the first selected machine. Each printed sticker encodes its
              own QR payload.
            </p>
          </div>

          {/* Machine table */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-[2px] text-zinc-500">
                Machines · {allMachines.length}
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <button
                  onClick={selectAll}
                  className="text-zinc-500 hover:text-[#00E5FF] uppercase tracking-wider transition-colors"
                >
                  Select all
                </button>
                <span className="text-zinc-700">·</span>
                <button
                  onClick={selectNone}
                  className="text-zinc-500 hover:text-[#00E5FF] uppercase tracking-wider transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>

            {allMachines.length === 0 ? (
              <div className="rounded-xl border border-[#1a1a1a] bg-[#0a0a0a] p-6 text-center text-sm text-zinc-500">
                No machines found for this gym.
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-[#1a1a1a] bg-[#0a0a0a]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#1a1a1a] text-[10px] uppercase tracking-wider text-zinc-600">
                      <th className="px-4 py-3 text-left w-10"></th>
                      <th className="px-4 py-3 text-left w-12">#</th>
                      <th className="px-4 py-3 text-left">Name</th>
                      <th className="px-4 py-3 text-left">Type</th>
                      <th className="px-4 py-3 text-left">UUID</th>
                      <th className="px-4 py-3 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allMachines.map((m, idx) => {
                      const checked = selectedIds.has(m.id);
                      return (
                        <tr
                          key={m.id}
                          className={`border-b border-[#131313] cursor-pointer transition-colors ${
                            checked
                              ? 'bg-[#00E5FF]/[0.03] hover:bg-[#00E5FF]/[0.07]'
                              : 'opacity-50 hover:opacity-80'
                          }`}
                          onClick={() => toggleMachine(m.id)}
                        >
                          <td className="px-4 py-3">
                            {checked ? (
                              <CheckSquare className="h-4 w-4 text-[#00E5FF]" />
                            ) : (
                              <Square className="h-4 w-4 text-zinc-600" />
                            )}
                          </td>
                          <td className="px-4 py-3 font-mono text-[11px] text-zinc-500">
                            {checked
                              ? String(
                                  selectedMachines.findIndex((s) => s.id === m.id) + 1,
                                ).padStart(2, '0')
                              : '—'}
                          </td>
                          <td className="px-4 py-3 font-medium text-zinc-100">{m.name}</td>
                          <td className="px-4 py-3 text-zinc-400">
                            {typeEmoji(m.type)} {capitalize(m.type)}
                          </td>
                          <td className="px-4 py-3 font-mono text-[11px] text-[#00E5FF]">
                            {m.qr_uuid.slice(0, 8)}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge machine={m} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>

      {/*
        Print portal — rendered as a direct child of <body>. Contents swap with `printMode`.
      */}
      {portalReady &&
        createPortal(
          <div className="print-host">
            {printMode === 'stickers' &&
              selectedMachines.map((m) => (
                <div
                  key={m.id}
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
                    qrData={buildMachineQrUrl(m)}
                    caption={null}
                  />
                </div>
              ))}
            {printMode === 'manifest' && (
              <ManifestPages
                gymName={gymName}
                machines={selectedMachines.length ? selectedMachines : allMachines}
                preset={preset}
                cta={cta}
              />
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Manifest (A4 portrait)
//
// Each row: # · machine name · type · short UUID · mini QR · blank box the
// installer ticks once the sticker is on the machine.
//
// Paginates at ~20 rows per A4 page with comfortable spacing.
// ---------------------------------------------------------------------------

const ROWS_PER_PAGE = 20;

function ManifestPages({
  gymName,
  machines,
  preset,
  cta,
}: {
  gymName: string;
  machines: PrintBatchMachine[];
  preset: Preset;
  cta: CtaOption;
}) {
  const pages: PrintBatchMachine[][] = [];
  for (let i = 0; i < machines.length; i += ROWS_PER_PAGE) {
    pages.push(machines.slice(i, i + ROWS_PER_PAGE));
  }
  if (pages.length === 0) pages.push([]);
  const totalPages = pages.length;

  return (
    <>
      {pages.map((rows, pageIdx) => (
        <div
          key={pageIdx}
          className="print-page"
          style={{
            width: '210mm',
            height: '297mm',
            background: '#fff',
            color: '#0a0a0a',
            padding: '14mm 14mm 12mm',
            fontFamily:
              '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              borderBottom: '2px solid #0a0a0a',
              paddingBottom: '5mm',
              marginBottom: '6mm',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
            }}
          >
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 4,
                }}
              >
                <SweatDropGlyph style={{ width: 20, height: 20, color: '#00C5DD' }} />
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 3,
                    textTransform: 'uppercase',
                    color: '#00C5DD',
                  }}
                >
                  SweatDrop · Install Manifest
                </span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.5 }}>
                {gymName}
              </div>
              <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>
                {machines.length} {machines.length === 1 ? 'machine' : 'machines'} · Format{' '}
                {preset.label} · Headline &quot;{cta.line1}
                {cta.line2 ? ` ${cta.line2}` : ''}&quot;
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 10, color: '#666' }}>
              <div style={{ fontWeight: 600, color: '#0a0a0a' }}>
                {new Date().toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </div>
              <div>
                Page {pageIdx + 1} / {totalPages}
              </div>
            </div>
          </div>

          {/* Install tips (only on page 1) */}
          {pageIdx === 0 && (
            <div
              style={{
                border: '1px solid #e5e5e5',
                borderRadius: 4,
                padding: '4mm 5mm',
                marginBottom: '5mm',
                fontSize: 10,
                lineHeight: 1.5,
                color: '#333',
                background: '#fafafa',
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 2, color: '#0a0a0a' }}>
                Installer checklist
              </div>
              <div>
                1. Keep stickers in order (1 → {machines.length}). Don&apos;t mix up the pile.
                <br />
                2. Go machine-by-machine in the order listed below.
                <br />
                3. Apply the sticker, scan it with your phone, verify the app opens with the
                matching machine name, then tick the box in the &quot;Done&quot; column.
                <br />
                4. Removable vinyl — if you placed one wrong, peel and reapply (no residue).
              </div>
            </div>
          )}

          {/* Table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
            <thead>
              <tr
                style={{
                  borderBottom: '1px solid #0a0a0a',
                  textAlign: 'left',
                  fontSize: 9,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  color: '#555',
                }}
              >
                <th style={{ padding: '4px 6px', width: 26 }}>#</th>
                <th style={{ padding: '4px 6px', width: 64 }}>QR</th>
                <th style={{ padding: '4px 6px' }}>Machine</th>
                <th style={{ padding: '4px 6px', width: 62 }}>Type</th>
                <th style={{ padding: '4px 6px', width: 80 }}>UUID</th>
                <th style={{ padding: '4px 6px', width: 42, textAlign: 'center' }}>Done</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m, rowIdx) => {
                const globalIdx = pageIdx * ROWS_PER_PAGE + rowIdx + 1;
                return (
                  <tr key={m.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td
                      style={{
                        padding: '6px 6px',
                        fontFamily:
                          'ui-monospace, SFMono-Regular, Menlo, monospace',
                        fontWeight: 700,
                        verticalAlign: 'middle',
                      }}
                    >
                      {String(globalIdx).padStart(2, '0')}
                    </td>
                    <td style={{ padding: '6px 6px', verticalAlign: 'middle' }}>
                      <div
                        style={{
                          width: 54,
                          height: 54,
                          padding: 2,
                          background: '#fff',
                          borderRadius: 4,
                          boxShadow: '0 0 0 1px #e5e5e5',
                        }}
                      >
                        <BrandedQRCode value={buildMachineQrUrl(m)} size={50} />
                      </div>
                    </td>
                    <td
                      style={{
                        padding: '6px 6px',
                        fontWeight: 600,
                        verticalAlign: 'middle',
                      }}
                    >
                      {m.name}
                    </td>
                    <td
                      style={{
                        padding: '6px 6px',
                        color: '#333',
                        verticalAlign: 'middle',
                      }}
                    >
                      {capitalize(m.type)}
                    </td>
                    <td
                      style={{
                        padding: '6px 6px',
                        fontFamily:
                          'ui-monospace, SFMono-Regular, Menlo, monospace',
                        color: '#00A0B8',
                        verticalAlign: 'middle',
                      }}
                    >
                      {m.qr_uuid.slice(0, 8)}
                    </td>
                    <td
                      style={{
                        padding: '6px 6px',
                        textAlign: 'center',
                        verticalAlign: 'middle',
                      }}
                    >
                      <div
                        style={{
                          display: 'inline-block',
                          width: 16,
                          height: 16,
                          border: '1.25px solid #0a0a0a',
                          borderRadius: 2,
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Footer */}
          <div
            style={{
              marginTop: 'auto',
              paddingTop: '4mm',
              borderTop: '1px solid #e5e5e5',
              fontSize: 9,
              color: '#999',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>Generated from SweatDrop Admin · sweatdrop.app</span>
            <span>
              Page {pageIdx + 1} of {totalPages}
            </span>
          </div>
        </div>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildMachineQrUrl(machine: PrintBatchMachine): string {
  return machineQrUrl(machine.qr_uuid, machine.type);
}

function typeEmoji(type: string): string {
  if (type === 'bike') return '🚴';
  if (type === 'treadmill') return '🏃';
  return '⚙️';
}

function capitalize(s: string): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function StatusBadge({ machine }: { machine: PrintBatchMachine }) {
  if (machine.is_under_maintenance) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">
        Maintenance
      </span>
    );
  }
  if (machine.is_active) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[#00E5FF]/30 bg-[#00E5FF]/10 px-2 py-0.5 text-[10px] font-medium text-[#00E5FF]">
        Active
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
      Inactive
    </span>
  );
}

// ---------------------------------------------------------------------------
// UI primitives
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
// Suspense shell
// ---------------------------------------------------------------------------

export default function BatchPrintPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-black text-white">
          Loading…
        </div>
      }
    >
      <BatchPrintContent />
    </Suspense>
  );
}

