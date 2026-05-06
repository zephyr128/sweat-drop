'use client';

import * as React from 'react';
import { BrandedQRCode } from '@/components/ui/BrandedQRCode';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CtaOption = { id: string; line1: string; line2?: string };

export type Orientation = 'portrait' | 'landscape' | 'square';

/**
 * What does the sticker carry?
 * - `qr`    → the legacy QR-only sticker (machine or reception scale).
 * - `combo` → premium combined QR + NFC sticker. Layout reserves a
 *             registered tap-zone the print partner aligns the NFC inlay to.
 */
export type StickerKind = 'qr' | 'combo';

export type Preset = {
  id: string;
  label: string;
  description: string;
  widthIn: number;
  heightIn: number;
  orientation: Orientation;
  qrSizePx: number;
  scale: 'machine' | 'reception';
  /** What the sticker contains. Defaults to `'qr'` for back-compat. */
  kind?: StickerKind;
  /**
   * Combo-only — diameter (CSS px) of the NFC TapMark circle in the design.
   * The print partner uses this footprint as the inlay registration zone.
   */
  tapMarkPx?: number;
};

/**
 * Marker id used by the studio's "Custom…" headline option. When the
 * resolver sees this id it substitutes operator-typed Line 1 / Line 2 copy.
 */
export const CUSTOM_CTA_ID = 'custom';

/**
 * Approx. character cap per preset for headline copy. Advisory — the studio
 * shows a red badge past the cap but never blocks; some partner gyms
 * intentionally overflow for stylistic effect (the visual rules will gracefully
 * shrink wrap rather than truncate, since the design uses `wordBreak`).
 */
export function ctaCharCap(preset: Preset): number {
  if (preset.scale === 'reception') {
    return preset.orientation === 'landscape' ? 32 : 24;
  }
  return preset.orientation === 'landscape' ? 22 : 18;
}

/**
 * Resolves the actual headline to render. If the operator picked the curated
 * `Custom…` entry we splice in their typed values; otherwise we pass through.
 */
export function resolveCta(
  selected: CtaOption,
  custom: { line1: string; line2: string },
): CtaOption {
  if (selected.id !== CUSTOM_CTA_ID) return selected;
  return {
    id: CUSTOM_CTA_ID,
    line1: custom.line1.trim() || ' ',
    line2: custom.line2.trim() || undefined,
  };
}

// ---------------------------------------------------------------------------
// CTA library — hand-picked SweatDrop brand voice. Machine stickers live on
// the equipment itself; check-in stickers live on the reception desk.
// ---------------------------------------------------------------------------

export const MACHINE_CTAS: CtaOption[] = [
  // Tap-first entries — used by the combo NFC zone caption (default for new
  // combo print runs). These read naturally as "TAP HERE / EARN DROPS" under
  // the NFC TapMark and also work as legacy QR-only headlines.
  { id: 'tap-here-earn', line1: 'TAP HERE', line2: 'EARN DROPS' },
  { id: 'tap-to-start', line1: 'TAP HERE', line2: 'START WORKOUT' },
  { id: 'tap-train-earn', line1: 'TAP. TRAIN.', line2: 'EARN.' },
  // QR-first / generic brand voice — used by legacy QR-only stickers and
  // available as alternates on combo stickers.
  { id: 'scan-to-earn', line1: 'SCAN TO EARN' },
  { id: 'sweat-scan-earn', line1: 'SWEAT. SCAN.', line2: 'EARN.' },
  { id: 'every-drop', line1: 'EVERY DROP', line2: 'COUNTS' },
  { id: 'turn-sweat', line1: 'TURN SWEAT', line2: 'INTO DROPS' },
  { id: 'scan-train-earn', line1: 'SCAN. TRAIN.', line2: 'EARN.' },
  { id: 'workout-pays', line1: 'YOUR WORKOUT', line2: 'PAYS' },
  { id: 'earn-burn', line1: 'EARN WHILE', line2: 'YOU BURN' },
  { id: 'drop-in', line1: 'DROP IN.', line2: 'CASH OUT.' },
  { id: 'unlock-drops', line1: 'SCAN TO UNLOCK', line2: 'DROPS' },
  { id: 'lift-scan-collect', line1: 'LIFT. SCAN.', line2: 'COLLECT.' },
];

/**
 * Default NFC zone caption id for combo stickers — "TAP HERE / EARN DROPS".
 * Anchored to the curated entry so we can re-tune the copy without touching
 * the studio defaults.
 */
export const DEFAULT_COMBO_CTA_ID = 'tap-here-earn';

export const CHECKIN_CTAS: CtaOption[] = [
  { id: 'check-in-cash-in', line1: 'CHECK IN.', line2: 'CASH IN.' },
  { id: 'claim-drops', line1: 'SCAN TO CLAIM', line2: "TODAY'S DROPS" },
  { id: 'first-drop', line1: 'YOUR FIRST DROP', line2: 'STARTS HERE' },
  { id: 'scan-to-begin', line1: 'SCAN TO BEGIN' },
  { id: 'welcome-scan-earn', line1: 'WELCOME.', line2: 'SCAN. EARN.' },
  { id: 'unlock-rewards', line1: 'CHECK IN TO', line2: 'UNLOCK REWARDS' },
  { id: 'step-in-drop-in', line1: 'STEP IN.', line2: 'DROP IN.' },
  { id: 'scan-to-collect', line1: 'SCAN TO', line2: 'COLLECT' },
];

/**
 * Marker entry appended to the CTA picker so operators can opt into custom
 * copy. The studio renders an inline Line 1 / Line 2 form when this id is
 * selected; `resolveCta` substitutes the typed copy at render time.
 */
export const CUSTOM_CTA_OPTION: CtaOption = { id: CUSTOM_CTA_ID, line1: '' };

/**
 * @deprecated as of the v2 combo redesign. The under-TapMark single-word
 * label has been replaced by a 2-line NFC zone caption that reuses the
 * `MACHINE_CTAS` library (e.g. "TAP HERE / EARN DROPS"). Kept exported for
 * back-compat with any external integrations that may have referenced the
 * symbols. Combo artwork no longer reads from these.
 */
export type TapMarkLabel = { id: string; label: string };

export const TAPMARK_LABELS: TapMarkLabel[] = [
  { id: 'tap-to-start', label: 'TAP TO START' },
  { id: 'tap-to-earn', label: 'TAP TO EARN' },
  { id: 'tap-or-scan', label: 'TAP OR SCAN' },
  { id: 'tap-and-go', label: 'TAP & GO' },
  { id: 'hold-phone', label: 'HOLD PHONE HERE' },
];

export const DEFAULT_TAPMARK_LABEL_ID = 'tap-to-start';

export function resolveTapMarkLabel(id: string): string {
  return (
    TAPMARK_LABELS.find((l) => l.id === id)?.label ??
    TAPMARK_LABELS.find((l) => l.id === DEFAULT_TAPMARK_LABEL_ID)?.label ??
    'TAP TO START'
  );
}

// ---------------------------------------------------------------------------
// QR zone caption — combo stickers only.
//
// Single-line callout that sits under the QR tile. Companion to the 2-line
// NFC zone caption (which reuses `MACHINE_CTAS`). Curated entries are
// neutral / instructive on purpose: this is the *fallback* affordance, the
// hero is the NFC tap. Keep entries short (≤14 chars) so they fit the QR
// zone width at every preset.
// ---------------------------------------------------------------------------

export type QRCaptionOption = { id: string; line1: string };

export const QR_CAPTIONS: QRCaptionOption[] = [
  { id: 'scan-qr', line1: 'SCAN QR' },
  { id: 'or-scan', line1: 'OR SCAN' },
  { id: 'point-camera', line1: 'POINT CAMERA' },
  { id: 'or-scan-here', line1: 'OR SCAN HERE' },
  { id: 'no-app', line1: 'NO APP? SCAN.' },
  { id: 'backup', line1: 'BACKUP' },
];

export const DEFAULT_QR_CAPTION_ID = 'scan-qr';
export const QR_CAPTION_CUSTOM_ID = 'qr-custom';
export const QR_CAPTION_CUSTOM_OPTION: QRCaptionOption = {
  id: QR_CAPTION_CUSTOM_ID,
  line1: '',
};

export function resolveQRCaption(
  selected: QRCaptionOption,
  custom: { line1: string },
): QRCaptionOption {
  if (selected.id !== QR_CAPTION_CUSTOM_ID) return selected;
  const trimmed = custom.line1.trim();
  return { id: QR_CAPTION_CUSTOM_ID, line1: trimmed || 'SCAN QR' };
}

/**
 * Char cap for the single-line QR caption — applied per preset. Smaller
 * than the 2-line NFC caption cap because the QR side has less vertical
 * height for word-wrap recovery.
 */
export function qrCaptionCharCap(preset: Preset): number {
  if (preset.scale === 'reception') return 18;
  return preset.orientation === 'landscape' ? 12 : 14;
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export const MACHINE_PRESETS: Preset[] = [
  {
    id: 'machine-portrait',
    label: 'Portrait · 2 × 3 in',
    description: 'Vertical machine sticker. Fits on console rails.',
    widthIn: 2,
    heightIn: 3,
    orientation: 'portrait',
    qrSizePx: 128,
    scale: 'machine',
  },
  {
    id: 'machine-landscape',
    label: 'Landscape · 3 × 2 in',
    description: 'Horizontal sticker. Fits on machine frames / top rails.',
    widthIn: 3,
    heightIn: 2,
    orientation: 'landscape',
    qrSizePx: 128,
    scale: 'machine',
  },
  {
    id: 'machine-square',
    label: 'Square · 2 × 2 in',
    description: 'Mini square — the most discreet option.',
    widthIn: 2,
    heightIn: 2,
    orientation: 'square',
    qrSizePx: 108,
    scale: 'machine',
  },
];

export const CHECKIN_PRESETS: Preset[] = [
  {
    id: 'checkin-portrait',
    label: 'Portrait · 7.5 × 13 cm',
    description: 'Reception desk vertical poster. Maximum visibility.',
    widthIn: 7.5 / 2.54,
    heightIn: 13 / 2.54,
    orientation: 'portrait',
    qrSizePx: 170,
    scale: 'reception',
  },
  {
    id: 'checkin-landscape',
    label: 'Landscape · 7 × 5 in',
    description: 'Reception desk horizontal card.',
    widthIn: 7,
    heightIn: 5,
    orientation: 'landscape',
    qrSizePx: 260,
    scale: 'reception',
  },
  {
    id: 'checkin-square',
    label: 'Square · 5 × 5 in',
    description: 'Compact desk tile.',
    widthIn: 5,
    heightIn: 5,
    orientation: 'square',
    qrSizePx: 260,
    scale: 'reception',
  },
];

// ---------------------------------------------------------------------------
// Combined QR + NFC presets — premium hero. Single die-cut, NFC inlay
// laminated under the TapMark zone (the bold cyan circle on the right of the
// landscape layout / under the QR on the portrait layout).
//
// Sizes match the partner print-shop's metric proof sheet:
//   landscape  6 × 4.1, 8 × 5.5, 10 × 6.9 cm
//   portrait   3 × 4.3, 4 × 5.8, 5 × 7.2 cm
// ---------------------------------------------------------------------------

const CM_PER_IN = 2.54;
const cm = (n: number): number => n / CM_PER_IN;

// Unified combo: one central QR tile + NFC signal rings in the same zone.
// Only two orientations are exposed in admin (landscape + portrait).
export const COMBO_PRESETS: Preset[] = [
  {
    id: 'combo-landscape',
    label: 'Landscape · 8 × 4 cm',
    description: 'Unified QR+NFC. Recommended for machine frames.',
    widthIn: cm(8),
    heightIn: cm(4),
    orientation: 'landscape',
    qrSizePx: 84,
    tapMarkPx: 150,
    scale: 'machine',
    kind: 'combo',
  },
  {
    id: 'combo-portrait',
    label: 'Vertical · 4 × 5.8 cm',
    description: 'Unified QR+NFC. Best for narrow vertical surfaces.',
    widthIn: cm(4),
    heightIn: cm(5.8),
    orientation: 'portrait',
    qrSizePx: 84,
    tapMarkPx: 150,
    scale: 'machine',
    kind: 'combo',
  },
];

/** `tapMarkPx` ÷ `qrSizePx` from combo presets — halo size for UnifiedNfcQrCore. */
const COMBO_MACHINE_HALO_TO_QR = 150 / 84;

function haloCoreSizeMatchingCombo(qrSizePx: number): number {
  return Math.round(qrSizePx * COMBO_MACHINE_HALO_TO_QR);
}

/** Smaller QR+halo footprint on reception check-in — tight stickers clip otherwise. */
function checkInReceptionUnifiedDims(preset: Preset): { qrPx: number; corePx: number } {
  const shrink =
    preset.orientation === 'square'
      ? 0.64
      : preset.orientation === 'portrait'
        ? 0.84
        : 0.72; // Landscape only — tighter so the CTA column gets width + calmer stacking
  const qrPx = Math.max(120, Math.round(preset.qrSizePx * shrink));
  return { qrPx, corePx: haloCoreSizeMatchingCombo(qrPx) };
}

// ---------------------------------------------------------------------------
// Sticker artwork — the actual design, swappable per orientation & scale.
// ---------------------------------------------------------------------------

export function StickerArtwork({
  preset,
  cta,
  qrData,
  caption,
  showNfcHint = false,
  showTapOrScanLabel = false,
}: {
  preset: Preset;
  cta: CtaOption;
  qrData: string;
  /** Optional under-CTA caption (e.g. gym name for check-in stickers). Pass null to hide. */
  caption: string | null;
  /** QR-only branch: add NFC arcs + small "tap or scan" helper copy. */
  showNfcHint?: boolean;
  /** QR-only branch: render TAP OR SCAN plus the same NFC arc halo as machine combo (`UnifiedNfcQrCore`). */
  showTapOrScanLabel?: boolean;
}) {
  // ── Combined QR + NFC ────────────────────────────────────────────────
  if (preset.kind === 'combo') {
    return <ComboArtwork preset={preset} cta={cta} qrData={qrData} />;
  }

  // ── QR-only (legacy / default) ───────────────────────────────────────
  // Byte-identical to the original implementation — every existing print
  // batch keeps rendering exactly as before.
  const isReception = preset.scale === 'reception';
  /** QR+halo shrunk vs raw combo ratio so portrait / landscape / square check-in fit. */
  const receptionCheckInTile =
    showTapOrScanLabel && isReception ? checkInReceptionUnifiedDims(preset) : null;
  const cyan = '#00E5FF';

  const frame: React.CSSProperties = {
    position: 'relative',
    width: '100%',
    height: '100%',
    background: '#000',
    color: '#fff',
    overflow: 'hidden',
    fontFamily:
      '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  };

  // ── LANDSCAPE ────────────────────────────────────────────────────────
  // Two columns: QR on the left, CTA centered on the right with a small
  // "Powered by SweatDrop" footer pinned to the bottom-right of the
  // content column. The previous design put a SweatDrop logo + wordmark
  // in the top-right corner, which fought the CTA for visual weight and
  // left awkward whitespace; the footer placement is humbler, brand-
  // recognized, and frees the right column to lead with the call-to-action.
  if (preset.orientation === 'landscape') {
    const landscapeCheckInNfc = isReception && showTapOrScanLabel;
    const landscapeReceptionHeadlinePx = landscapeCheckInNfc ? 34 : isReception ? 46 : 15;
    const landscapeHeadlineLineHeight = landscapeCheckInNfc ? 1.05 : isReception ? 0.95 : 1;
    const landscapeHeadlineLetterSpacing = landscapeCheckInNfc ? -0.45 : isReception ? -1 : -0.2;

    return (
      <div style={frame}>
        <SubtleGlow />
        <RegistrationMarks scale={preset.scale} />
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            display: 'grid',
            gridTemplateColumns: landscapeCheckInNfc
              ? 'max-content minmax(0, 1fr)'
              : 'auto minmax(0, 1fr)',
            height: '100%',
            padding: isReception ? '0.4in' : '0.16in',
            columnGap:
              showTapOrScanLabel && isReception
                ? '0.32in'
                : isReception
                  ? '0.3in'
                  : '0.14in',
            alignItems: 'stretch',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              // Centering wide NFC halo inside a max-width/min-width shim would clip outer arcs → flex-start keeps the full halo inside the bleed.
              justifyContent: landscapeCheckInNfc ? 'flex-start' : 'center',
              minWidth: landscapeCheckInNfc ? 'min-content' : 0,
              alignSelf: 'center',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: showTapOrScanLabel ? (isReception ? 8 : 5) : 0,
              }}
            >
              {showTapOrScanLabel && <TapOrScanLabel scale={preset.scale} />}
              {showTapOrScanLabel ? (
                <UnifiedNfcQrCore
                  qrData={qrData}
                  qrSizePx={receptionCheckInTile?.qrPx ?? preset.qrSizePx}
                  coreSize={
                    receptionCheckInTile?.corePx ?? haloCoreSizeMatchingCombo(preset.qrSizePx)
                  }
                  orientation={preset.orientation}
                  scale={preset.scale}
                />
              ) : (
                <QRTileWithOptionalNfcHint
                  size={preset.qrSizePx}
                  value={qrData}
                  scale={preset.scale}
                  orientation={preset.orientation}
                  glow
                  showNfcHint={showNfcHint}
                />
              )}
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              height: '100%',
              minWidth: 0,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                minWidth: 0,
              }}
            >
              <div
                style={{
                  fontSize: landscapeReceptionHeadlinePx,
                  lineHeight: landscapeHeadlineLineHeight,
                  letterSpacing: landscapeHeadlineLetterSpacing,
                  fontWeight: 900,
                  color: '#fff',
                  textTransform: 'uppercase',
                  wordBreak: 'break-word',
                }}
              >
                {cta.line1}
              </div>
              {cta.line2 && (
                <div
                  style={{
                    fontSize: landscapeReceptionHeadlinePx,
                    lineHeight: landscapeHeadlineLineHeight,
                    letterSpacing: landscapeHeadlineLetterSpacing,
                    fontWeight: 900,
                    color: cyan,
                    textTransform: 'uppercase',
                    marginTop:
                      landscapeCheckInNfc ? 8 : isReception ? 4 : 1,
                    wordBreak: 'break-word',
                  }}
                >
                  {cta.line2}
                </div>
              )}
              {caption && (
                <>
                  <div
                    style={{
                      height: 1,
                      background: `linear-gradient(90deg, ${cyan}, transparent)`,
                      marginTop:
                        landscapeCheckInNfc ? 14 : isReception ? 12 : 5,
                      marginBottom:
                        landscapeCheckInNfc ? 8 : isReception ? 8 : 3,
                    }}
                  />
                  <div
                    style={{
                      fontSize: isReception ? 12 : 7,
                      color: '#fff',
                      fontWeight: 600,
                      letterSpacing: 0.5,
                      textTransform: 'uppercase',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {caption}
                  </div>
                </>
              )}
            </div>
            <PoweredByFooter scale={preset.scale} align="left" />
          </div>
        </div>
      </div>
    );
  }

  // ── PORTRAIT + SQUARE ────────────────────────────────────────────────
  // Single column. Previous design wedged a SweatDrop logo header at the
  // top, the QR in the middle, and the CTA at the bottom — three rows
  // competing for the same vertical space, which on the 2×2 in machine
  // square felt cramped. New layout: QR + CTA become a single visually
  // coherent block centered vertically; the small "Powered by SweatDrop"
  // footer pins to the bottom. This gives the QR room to breathe and
  // removes one fighting element from the stack.
  const isCompactReceptionPortrait = preset.id === 'checkin-portrait';
  const portraitPadding = isReception
    ? isCompactReceptionPortrait
      ? '0.22in 0.22in'
      : '0.4in 0.38in'
    : '0.16in 0.14in';
  const portraitGap = isReception
    ? showTapOrScanLabel
      ? preset.orientation === 'square'
        ? 5
        : isCompactReceptionPortrait
          ? 3
          : 5
      : isCompactReceptionPortrait
        ? 22
        : 18
    : 7;
  const portraitHeadlineFont = isReception
    ? showTapOrScanLabel && preset.orientation === 'square'
      ? 32
      : isCompactReceptionPortrait
        ? 26
        : 40
    : 15;
  const portraitCaptionRuleWidth = isReception
    ? isCompactReceptionPortrait
      ? 76
      : 100
    : 36;
  const compactTapLabel = isCompactReceptionPortrait;

  return (
    <div style={frame}>
      <SubtleGlow />
      <RegistrationMarks scale={preset.scale} />
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          padding: portraitPadding,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: portraitGap,
            minHeight: 0,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap:
                showTapOrScanLabel && isReception
                  ? preset.orientation === 'portrait'
                    ? 2
                    : 4
                  : showTapOrScanLabel
                    ? (isReception ? 8 : 5)
                    : 0,
              flexShrink: showTapOrScanLabel ? 1 : undefined,
              minHeight: 0,
            }}
          >
            {showTapOrScanLabel && (
              <TapOrScanLabel
                scale={preset.scale}
                compact={compactTapLabel}
                subtractPx={preset.orientation === 'portrait' ? 2 : 0}
              />
            )}
            {showTapOrScanLabel ? (
              <UnifiedNfcQrCore
                qrData={qrData}
                qrSizePx={receptionCheckInTile?.qrPx ?? preset.qrSizePx}
                coreSize={
                  receptionCheckInTile?.corePx ?? haloCoreSizeMatchingCombo(preset.qrSizePx)
                }
                orientation={preset.orientation}
                scale={preset.scale}
              />
            ) : (
              <QRTileWithOptionalNfcHint
                size={preset.qrSizePx}
                value={qrData}
                scale={preset.scale}
                orientation={preset.orientation}
                glow={isReception}
                showNfcHint={showNfcHint}
              />
            )}
          </div>
          <div style={{ width: '100%', flexShrink: 0 }}>
            <div
              style={{
                fontSize: portraitHeadlineFont,
                lineHeight: 0.95,
                letterSpacing: isReception ? -0.5 : -0.2,
                fontWeight: 900,
                color: '#fff',
                textTransform: 'uppercase',
                wordBreak: 'break-word',
              }}
            >
              {cta.line1}
            </div>
            {cta.line2 && (
              <div
                style={{
                  fontSize: portraitHeadlineFont,
                  lineHeight: 0.95,
                  letterSpacing: isReception ? -0.5 : -0.2,
                  fontWeight: 900,
                  color: cyan,
                  textTransform: 'uppercase',
                  marginTop: isReception ? 4 : 1,
                  wordBreak: 'break-word',
                }}
              >
                {cta.line2}
              </div>
            )}
            {caption && (
              <>
                <div
                  style={{
                    height: 1,
                    width: portraitCaptionRuleWidth,
                    background: cyan,
                    margin: isReception
                      ? isCompactReceptionPortrait
                        ? '7px auto 5px'
                        : '12px auto 8px'
                      : '5px auto 3px',
                  }}
                />
                <div
                  style={{
                    fontSize: isReception ? 12 : 7,
                    color: '#fff',
                    fontWeight: 600,
                    letterSpacing: 0.5,
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {caption}
                </div>
              </>
            )}
          </div>
        </div>
        <PoweredByFooter scale={preset.scale} align="center" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Combo artwork v3 — unified QR + NFC in one central zone.
//
// Layout:
//   - Headline (admin-configured CTA; custom text still supported)
//   - Central QR tile surrounded by NFC signal rings
//   - "TAP OR SCAN" transport hint
//   - "Powered by SweatDrop" footer
//
// This avoids the old split-zone geometry and keeps the surface physically
// flat for print partners who laminate a thin wet inlay behind the QR.
// ---------------------------------------------------------------------------

function ComboArtwork({
  preset,
  cta,
  qrData,
}: {
  preset: Preset;
  cta: CtaOption;
  qrData: string;
}) {
  const coreSize = preset.tapMarkPx ?? 140;
  const frame: React.CSSProperties = {
    position: 'relative',
    width: '100%',
    height: '100%',
    background: '#000',
    color: '#fff',
    overflow: 'hidden',
    borderRadius: preset.orientation === 'landscape' ? 12 : 10,
    fontFamily:
      '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  };
  const isLandscape = preset.orientation === 'landscape';

  return (
    <div style={frame}>
      <SubtleGlow />
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: isLandscape ? 'stretch' : 'center',
          justifyContent: isLandscape ? 'space-between' : 'center',
          gap: isLandscape ? 0 : 2,
          height: '100%',
          padding: `${comboPaddingIn(preset)}in`,
          textAlign: isLandscape ? 'left' : 'center',
          overflow: 'hidden',
        }}
      >
        {isLandscape ? (
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <UnifiedNfcQrCore
              qrData={qrData}
              qrSizePx={preset.qrSizePx}
              coreSize={preset.tapMarkPx ?? 140}
              orientation={preset.orientation}
              scale={preset.scale}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <ComboHeadline cta={cta} fontPx={comboHeadlineFontPx(preset)} />
            </div>
          </div>
        ) : (
          <>
            <div style={{ width: '100%', marginBottom: -6 }}>
              <ComboHeadline cta={cta} fontPx={comboHeadlineFontPx(preset)} />
            </div>
            <UnifiedNfcQrCore
              qrData={qrData}
              qrSizePx={preset.qrSizePx}
              coreSize={preset.tapMarkPx ?? 140}
              orientation={preset.orientation}
              scale={preset.scale}
            />
          </>
        )}

        {isLandscape ? (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ width: coreSize, textAlign: 'center' }}>
              <div
                style={{
                  fontSize: comboTransportLabelFontPx(preset),
                  lineHeight: 1,
                  letterSpacing: 1.2,
                  fontWeight: 600,
                  color: '#fff',
                  textTransform: 'uppercase',
                }}
              >
                TAP OR SCAN
              </div>
            </div>
            <div
              style={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  height: 1,
                  width: '76%',
                  maxWidth: '100%',
                  margin: '3px 0 2px',
                  background:
                    'linear-gradient(90deg, transparent, rgba(0,229,255,0.5) 20%, rgba(0,229,255,0.5) 80%, transparent)',
                }}
              />
              <PoweredByFooter scale={preset.scale} align="right" inline />
            </div>
          </div>
        ) : (
          <div style={{ width: '100%', marginTop: -6 }}>
            <div
              style={{
                fontSize: comboTransportLabelFontPx(preset),
                lineHeight: 1,
                letterSpacing: 1.1,
                fontWeight: 600,
                color: '#fff',
                textTransform: 'uppercase',
              }}
            >
              TAP OR SCAN
            </div>
            <div
              style={{
                height: 1,
                width: '76%',
                margin: '3px auto 2px',
                background:
                  'linear-gradient(90deg, transparent, rgba(0,229,255,0.5) 20%, rgba(0,229,255,0.5) 80%, transparent)',
              }}
            />
            <PoweredByFooter scale={preset.scale} align="center" />
          </div>
        )}
      </div>
    </div>
  );
}

function ComboHeadline({ cta, fontPx }: { cta: CtaOption; fontPx: number }) {
  const lineStyle: React.CSSProperties = {
    fontSize: fontPx,
    lineHeight: 0.98,
    letterSpacing: fontPx >= 18 ? -0.4 : -0.1,
    fontWeight: 900,
    color: '#fff',
    textTransform: 'uppercase',
    wordBreak: 'break-word',
    overflowWrap: 'anywhere',
  };

  return (
    <>
      <div style={lineStyle}>{cta.line1}</div>
      {cta.line2 && (
        <div
          style={{
            ...lineStyle,
            color: '#00E5FF',
            marginTop: 1,
          }}
        >
          {cta.line2}
        </div>
      )}
    </>
  );
}

function UnifiedNfcQrCore({
  qrData,
  qrSizePx,
  coreSize,
  orientation,
  scale,
}: {
  qrData: string;
  qrSizePx: number;
  coreSize: number;
  orientation: Orientation;
  scale: 'machine' | 'reception';
}) {
  const ringStroke = 1;
  const gradSid = React.useId().replace(/:/g, '');
  const gradientLeftId = `${gradSid}-nfc-arc-L`;
  const gradientRightId = `${gradSid}-nfc-arc-R`;
  // Side arcs centered on π (left) and 0 (right) so both sets share the same
  // horizontal midline — asymmetric spans shifted the left bundle upward.
  // Span is tighter than full vertical sweeps but long enough to read clearly.
  const halfSpanDeg = orientation === 'portrait' ? 42 : 38;
  const leftSpan = { start: 180 - halfSpanDeg, end: 180 + halfSpanDeg };
  const rightSpan = { start: -halfSpanDeg, end: halfSpanDeg };

  return (
    <div
      style={{
        position: 'relative',
        width: coreSize,
        height: coreSize,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <svg
        aria-hidden
        viewBox="0 0 100 100"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
        }}
      >
        <defs>
          {/*
           Fade along arc tips: full color at the arc midpoint (outer bulge),
           softer toward both endpoints. Left bundle peaks at small x; right at large x.
           */}
          <linearGradient
            id={gradientLeftId}
            gradientUnits="userSpaceOnUse"
            x1={0}
            y1={50}
            x2={55}
            y2={50}
          >
            <stop offset="0%" stopColor="#00E5FF" stopOpacity={0.2} />
            <stop offset="5%" stopColor="#00E5FF" stopOpacity={0.92} />
            <stop offset="14%" stopColor="#00E5FF" stopOpacity={0.92} />
            <stop offset="26%" stopColor="#00E5FF" stopOpacity={0.12} />
            <stop offset="38%" stopColor="#00E5FF" stopOpacity={0} />
            <stop offset="100%" stopColor="#00E5FF" stopOpacity={0} />
          </linearGradient>
          <linearGradient
            id={gradientRightId}
            gradientUnits="userSpaceOnUse"
            x1={100}
            y1={50}
            x2={55}
            y2={50}
          >
            <stop offset="0%" stopColor="#00E5FF" stopOpacity={0.2} />
            <stop offset="5%" stopColor="#00E5FF" stopOpacity={0.92} />
            <stop offset="15%" stopColor="#00E5FF" stopOpacity={0.92} />
            <stop offset="30%" stopColor="#00E5FF" stopOpacity={0.12} />
            <stop offset="45%" stopColor="#00E5FF" stopOpacity={0} />
            <stop offset="100%" stopColor="#00E5FF" stopOpacity={0} />
          </linearGradient>
        </defs>
        {[48, 42, 36, 30].map((r, idx) => (
          <g key={r}>
            <path
              d={arcPath(50, 50, r, leftSpan.start, leftSpan.end)}
              fill="none"
              stroke={`url(#${gradientLeftId})`}
              strokeWidth={ringStroke}
              strokeLinecap="round"
              opacity={Math.min(1, Math.max(0.35, 0.92 - idx * 0.14))}
              style={{
                filter: idx === 0 ? 'drop-shadow(0 0 10px rgba(0,229,255,0.5))' : undefined,
              }}
            />
            <path
              d={arcPath(50, 50, r, rightSpan.start, rightSpan.end)}
              fill="none"
              stroke={`url(#${gradientRightId})`}
              strokeWidth={ringStroke}
              strokeLinecap="round"
              opacity={Math.min(1, Math.max(0.32, 0.88 - idx * 0.14))}
            />
          </g>
        ))}
      </svg>
      <QRTile size={qrSizePx} value={qrData} scale={scale} variant="clean" />
    </div>
  );
}

function arcPath(
  cx: number,
  cy: number,
  r: number,
  startAngleDeg: number,
  endAngleDeg: number,
): string {
  const start = polarPoint(cx, cy, r, startAngleDeg);
  const end = polarPoint(cx, cy, r, endAngleDeg);
  const largeArc = Math.abs(endAngleDeg - startAngleDeg) > 180 ? 1 : 0;
  const sweep = endAngleDeg > startAngleDeg ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} ${sweep} ${end.x} ${end.y}`;
}

function polarPoint(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function comboHeadlineFontPx(preset: Preset): number {
  if (preset.scale === 'reception') return 22;
  return preset.orientation === 'landscape' ? 13.5 : 12;
}

function comboTransportLabelFontPx(preset: Preset): number {
  if (preset.scale === 'reception') return 12;
  return preset.orientation === 'landscape' ? 6.6 : 5.4;
}

function comboPaddingIn(preset: Preset): number {
  if (preset.scale === 'reception') return 0.15;
  return preset.orientation === 'landscape' ? 0.09 : 0.085;
}

function TapOrScanLabel({
  scale,
  compact = false,
  subtractPx = 0,
}: {
  scale: 'machine' | 'reception';
  compact?: boolean;
  /** Subtract from computed font size (e.g. portrait check-in fine-tuning). */
  subtractPx?: number;
}) {
  const base = scale === 'reception' ? (compact ? 10.5 : 13) : 8;
  const fontSize = Math.max(8, base - subtractPx);
  return (
    <div
      style={{
        fontSize,
        lineHeight: 1,
        letterSpacing: 1.1,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.9)',
        textTransform: 'uppercase',
      }}
    >
      TAP OR SCAN
    </div>
  );
}

function QRTileWithOptionalNfcHint({
  size,
  value,
  scale,
  orientation,
  glow,
  showNfcHint,
}: {
  size: number;
  value: string;
  scale: 'machine' | 'reception';
  orientation: 'portrait' | 'landscape' | 'square';
  glow?: boolean;
  showNfcHint: boolean;
}) {
  if (!showNfcHint) {
    return <QRTile size={size} value={value} scale={scale} glow={glow} />;
  }

  const isPortrait = orientation === 'portrait';
  const adjustedQrSize = Math.max(
    64,
    size - (isPortrait ? (scale === 'reception' ? 30 : 14) : scale === 'reception' ? 16 : 10),
  );
  const arcSpace = scale === 'reception' ? 56 : 32;
  const frameWidth = adjustedQrSize + arcSpace * 2;
  const frameHeight = adjustedQrSize + (scale === 'reception' ? 20 : 14);
  const ringStroke = scale === 'reception' ? 1.6 : 1.2;
  const labelSize = scale === 'reception' ? 13 : 8;
  const label = (
    <div
      style={{
        fontSize: labelSize,
        lineHeight: 1,
        letterSpacing: 1.1,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.9)',
        textTransform: 'uppercase',
      }}
    >
      TAP OR SCAN
    </div>
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: scale === 'reception' ? 8 : 5,
      }}
    >
      {isPortrait && label}
      <div
        style={{
          position: 'relative',
          width: frameWidth,
          height: frameHeight,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg
          aria-hidden
          viewBox="0 0 200 100"
          preserveAspectRatio="none"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
          }}
        >
          {[38, 30, 22].map((r, idx) => (
            <g key={r}>
              <path
                d={arcPath(22, 50, r, 140, 220)}
                fill="none"
                stroke={`rgba(0,229,255,${0.78 - idx * 0.14})`}
                strokeWidth={ringStroke}
                strokeLinecap="round"
              />
              <path
                d={arcPath(178, 50, r, -40, 40)}
                fill="none"
                stroke={`rgba(0,229,255,${0.76 - idx * 0.14})`}
                strokeWidth={ringStroke}
                strokeLinecap="round"
              />
            </g>
          ))}
        </svg>
        <QRTile size={adjustedQrSize} value={value} scale={scale} glow={glow} />
      </div>
      {!isPortrait && label}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Footer — humble "Powered by SweatDrop" attribution. Lives at the bottom
// of every sticker so the QR + CTA can lead the visual hierarchy.
// ---------------------------------------------------------------------------

function PoweredByFooter({
  scale,
  align,
  inline = false,
}: {
  scale: 'machine' | 'reception';
  align: 'center' | 'left' | 'right';
  inline?: boolean;
}) {
  const isReception = scale === 'reception';
  const justify =
    align === 'center' ? 'center' : align === 'left' ? 'flex-start' : 'flex-end';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: justify,
        gap: inline ? (isReception ? 5 : 2.5) : isReception ? 6 : 3,
        opacity: 0.78,
        marginTop: inline ? 0 : isReception ? 6 : 1,
      }}
    >
      <SweatDropGlyph
        style={{
          width: isReception ? 9 : 5.5,
          height: isReception ? 9 : 5.5,
          color: '#00E5FF',
          flexShrink: 0,
        }}
      />
      <div
        style={{
          fontSize: isReception ? 8 : 5,
          letterSpacing: isReception ? 1.6 : 0.8,
          fontWeight: 600,
          color: 'rgba(255,255,255,0.65)',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}
      >
        Powered by{' '}
        <span style={{ color: '#00E5FF', fontWeight: 700 }}>SweatDrop</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components (exported for flexibility)
// ---------------------------------------------------------------------------

export function QRTile({
  size,
  value,
  scale,
  glow,
  variant = 'framed',
}: {
  size: number;
  value: string;
  scale: 'machine' | 'reception';
  /** Legacy boolean glow — only honoured when `variant === 'framed'`. */
  glow?: boolean;
  /**
   * - `framed` (default): cyan ring + optional glow. Used by QR-only and
   *   reception stickers.
   * - `clean`: no ring, no glow — just the white tile. Used by the combo
   *   v2 design where the cyan element is the NFC TapMark, not the QR.
   */
  variant?: 'framed' | 'clean';
}) {
  const pad = scale === 'reception' ? 10 : 5;
  const radius = scale === 'reception' ? 10 : 6;
  const ringWidth = scale === 'reception' ? 1.5 : 1;

  const boxShadow =
    variant === 'clean'
      ? 'none'
      : glow
        ? `0 0 0 ${ringWidth}px #00E5FF, 0 0 18px rgba(0,229,255,0.3)`
        : `0 0 0 ${ringWidth}px #00E5FF`;

  return (
    <div
      style={{
        position: 'relative',
        padding: pad,
        background: '#fff',
        borderRadius: radius,
        flexShrink: 0,
        boxShadow,
      }}
    >
      <BrandedQRCode value={value} size={size} />
    </div>
  );
}

export function SubtleGlow() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background:
          'radial-gradient(120% 80% at 50% 110%, rgba(0,229,255,0.14), transparent 60%), radial-gradient(80% 60% at 50% -20%, rgba(0,229,255,0.07), transparent 70%)',
        pointerEvents: 'none',
      }}
    />
  );
}

export function RegistrationMarks({ scale }: { scale: 'machine' | 'reception' }) {
  const isReception = scale === 'reception';
  const frameInset = isReception ? 6 : 3;
  const frameRadius = isReception ? 6 : 4;
  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: frameInset,
          border: '0.5px solid rgba(0,229,255,0.18)',
          borderRadius: frameRadius,
          pointerEvents: 'none',
        }}
      />
      <CornerBracket pos="tl" scale={scale} />
      <CornerBracket pos="tr" scale={scale} />
      <CornerBracket pos="bl" scale={scale} />
      <CornerBracket pos="br" scale={scale} />
    </>
  );
}

function CornerBracket({
  pos,
  scale,
}: {
  pos: 'tl' | 'tr' | 'bl' | 'br';
  scale: 'machine' | 'reception';
}) {
  const isReception = scale === 'reception';
  const size = isReception ? 14 : 8;
  const offset = isReception ? 10 : 6;
  const border = isReception ? '1.25px solid #00E5FF' : '1px solid #00E5FF';
  const base: React.CSSProperties = {
    position: 'absolute',
    width: size,
    height: size,
    opacity: 0.85,
    pointerEvents: 'none',
  };
  const styles: Record<string, React.CSSProperties> = {
    tl: { top: offset, left: offset, borderTop: border, borderLeft: border },
    tr: { top: offset, right: offset, borderTop: border, borderRight: border },
    bl: { bottom: offset, left: offset, borderBottom: border, borderLeft: border },
    br: { bottom: offset, right: offset, borderBottom: border, borderRight: border },
  };
  return <div style={{ ...base, ...styles[pos] }} />;
}

export function SweatDropGlyph({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M12 2C12 2 4 11 4 16a8 8 0 0 0 16 0c0-5-8-14-8-14z"
        fill="currentColor"
      />
      <circle cx="9.5" cy="14.5" r="1.25" fill="#000" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// NFC TapMark — circular target with three concentric cyan rings and the
// SweatDrop rounded app icon at center. The outer ring is the print
// partner's NFC inlay registration mark — laminate a 25 mm NTAG215 antenna
// underneath, with +/- 2 mm tolerance ring of empty space around.
//
// The center renders the actual app icon (the same image embedded inside QR
// codes via `BrandedQRCode`) rather than a flat glyph, so the TapMark and
// the QR's center logo are visually anchored to the same brand mark.
// ---------------------------------------------------------------------------

const APP_ICON_SRC = '/app-icon.png';
const APP_ICON_CORNER_RADIUS = 0.22;

export function NfcTapMark({
  diameterPx,
  scale: _scale,
}: {
  diameterPx: number;
  scale: 'machine' | 'reception';
}) {
  const cyan = '#00E5FF';

  // Three concentric rings — opacities tuned so the outer is dominant
  // (matching the reference print proof) and the inner two read as gentle
  // "signal waves" around the icon.
  const outerRingPx = Math.max(1.25, diameterPx * 0.022);
  const midInset = Math.max(3, diameterPx * 0.1);
  const innerInset = Math.max(6, diameterPx * 0.2);

  // Icon ~46% of diameter — leaves a single ring's worth of breathing room.
  const iconSize = Math.round(diameterPx * 0.46);
  const iconBorderRadius = iconSize * APP_ICON_CORNER_RADIUS;

  return (
    <div
      style={{
        position: 'relative',
        width: diameterPx,
        height: diameterPx,
        flexShrink: 0,
      }}
    >
      {/* Outer ring — bold, doubles as the inlay registration mark. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          border: `${outerRingPx}px solid ${cyan}`,
          // Subtle interior glow to lift the rings off the matte black
          // background. Conservative alpha so it doesn't haze the print.
          boxShadow: `inset 0 0 ${diameterPx * 0.18}px rgba(0,229,255,0.18)`,
          pointerEvents: 'none',
        }}
      />
      {/* Mid ring */}
      <div
        style={{
          position: 'absolute',
          inset: midInset,
          borderRadius: '50%',
          border: `1px solid ${cyan}`,
          opacity: 0.55,
          pointerEvents: 'none',
        }}
      />
      {/* Inner ring */}
      <div
        style={{
          position: 'absolute',
          inset: innerInset,
          borderRadius: '50%',
          border: `0.75px solid ${cyan}`,
          opacity: 0.32,
          pointerEvents: 'none',
        }}
      />
      {/* Rounded app icon centered. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={APP_ICON_SRC}
          alt=""
          width={iconSize}
          height={iconSize}
          decoding="async"
          loading="eager"
          style={{
            width: iconSize,
            height: iconSize,
            borderRadius: iconBorderRadius,
            display: 'block',
            // Keep the icon crisp in the printed PDF — Chrome can subsample
            // images when scaling for print, so we hint at preserving edges.
            imageRendering: 'auto',
          }}
        />
      </div>
    </div>
  );
}
