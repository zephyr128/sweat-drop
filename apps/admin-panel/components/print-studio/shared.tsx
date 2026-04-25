'use client';

import * as React from 'react';
import { BrandedQRCode } from '@/components/ui/BrandedQRCode';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CtaOption = { id: string; line1: string; line2?: string };

export type Orientation = 'portrait' | 'landscape' | 'square';

export type Preset = {
  id: string;
  label: string;
  description: string;
  widthIn: number;
  heightIn: number;
  orientation: Orientation;
  qrSizePx: number;
  scale: 'machine' | 'reception';
};

// ---------------------------------------------------------------------------
// CTA library — hand-picked SweatDrop brand voice. Machine stickers live on
// the equipment itself; check-in stickers live on the reception desk.
// ---------------------------------------------------------------------------

export const MACHINE_CTAS: CtaOption[] = [
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
    label: 'Portrait · 5 × 7 in',
    description: 'Reception desk vertical poster. Maximum visibility.',
    widthIn: 5,
    heightIn: 7,
    orientation: 'portrait',
    qrSizePx: 280,
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
// Sticker artwork — the actual design, swappable per orientation & scale.
// ---------------------------------------------------------------------------

export function StickerArtwork({
  preset,
  cta,
  qrData,
  caption,
}: {
  preset: Preset;
  cta: CtaOption;
  qrData: string;
  /** Optional under-CTA caption (e.g. gym name for check-in stickers). Pass null to hide. */
  caption: string | null;
}) {
  const isReception = preset.scale === 'reception';
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
    return (
      <div style={frame}>
        <SubtleGlow />
        <RegistrationMarks scale={preset.scale} />
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            display: 'grid',
            gridTemplateColumns: 'auto minmax(0, 1fr)',
            height: '100%',
            padding: isReception ? '0.4in' : '0.16in',
            columnGap: isReception ? '0.3in' : '0.14in',
            alignItems: 'stretch',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <QRTile size={preset.qrSizePx} value={qrData} scale={preset.scale} glow />
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
                  fontSize: isReception ? 46 : 15,
                  lineHeight: 0.95,
                  letterSpacing: isReception ? -1 : -0.2,
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
                    fontSize: isReception ? 46 : 15,
                    lineHeight: 0.95,
                    letterSpacing: isReception ? -1 : -0.2,
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
                      background: `linear-gradient(90deg, ${cyan}, transparent)`,
                      marginTop: isReception ? 12 : 5,
                      marginBottom: isReception ? 8 : 3,
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
          padding: isReception ? '0.4in 0.38in' : '0.16in 0.14in',
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
            gap: isReception ? 18 : 7,
          }}
        >
          <QRTile size={preset.qrSizePx} value={qrData} scale={preset.scale} glow={isReception} />
          <div style={{ width: '100%' }}>
            <div
              style={{
                fontSize: isReception ? 40 : 15,
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
                  fontSize: isReception ? 40 : 15,
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
                    width: isReception ? 100 : 36,
                    background: cyan,
                    margin: isReception ? '12px auto 8px' : '5px auto 3px',
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
// Footer — humble "Powered by SweatDrop" attribution. Lives at the bottom
// of every sticker so the QR + CTA can lead the visual hierarchy.
// ---------------------------------------------------------------------------

function PoweredByFooter({
  scale,
  align,
}: {
  scale: 'machine' | 'reception';
  align: 'center' | 'left' | 'right';
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
        gap: isReception ? 6 : 3,
        opacity: 0.78,
        marginTop: isReception ? 8 : 2,
      }}
    >
      <SweatDropGlyph
        style={{
          width: isReception ? 10 : 6,
          height: isReception ? 10 : 6,
          color: '#00E5FF',
          flexShrink: 0,
        }}
      />
      <div
        style={{
          fontSize: isReception ? 9 : 5.5,
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
}: {
  size: number;
  value: string;
  scale: 'machine' | 'reception';
  glow?: boolean;
}) {
  const pad = scale === 'reception' ? 10 : 5;
  const radius = scale === 'reception' ? 10 : 6;
  const ringWidth = scale === 'reception' ? 1.5 : 1;

  return (
    <div
      style={{
        position: 'relative',
        padding: pad,
        background: '#fff',
        borderRadius: radius,
        flexShrink: 0,
        boxShadow: glow
          ? `0 0 0 ${ringWidth}px #00E5FF, 0 0 18px rgba(0,229,255,0.3)`
          : `0 0 0 ${ringWidth}px #00E5FF`,
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
