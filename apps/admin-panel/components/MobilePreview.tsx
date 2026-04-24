'use client';

import { Bell, Store, QrCode, Activity, Trophy, Flame, Shield } from 'lucide-react';

interface MobilePreviewProps {
  primaryColor: string;
  logoUrl?: string | null;
  backgroundUrl?: string | null;
  /** 0..1 — how dark the overlay on top of the background image is. */
  backgroundOverlay?: number;
  /** Hex #RRGGBB — top of the fallback gradient used when backgroundUrl is null. */
  backgroundGradientStart?: string;
  /** Hex #RRGGBB — bottom of the fallback gradient used when backgroundUrl is null. */
  backgroundGradientEnd?: string;
}

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return `rgba(0, 229, 255, ${alpha})`;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function adjustBrightness(hex: string, percent: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const r = Math.min(255, Math.max(0, Math.round(parseInt(m[1], 16) * (1 + percent))));
  const g = Math.min(255, Math.max(0, Math.round(parseInt(m[2], 16) * (1 + percent))));
  const b = Math.min(255, Math.max(0, Math.round(parseInt(m[3], 16) * (1 + percent))));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function getLuminance(hex: string): number {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return 0;
  const [r, g, b] = [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function onPrimary(hex: string): string {
  return getLuminance(hex) < 0.5 ? '#FFFFFF' : '#000000';
}

/**
 * Portrait phone mock that mirrors the real mobile home screen:
 * fullscreen background image + darkening gradient, header (avatar + store/bell),
 * circular drops ring, rounded "sheet" with tab bar + stats cards, and the
 * primary-gradient "Start workout" FAB.
 */
export function MobilePreview({
  primaryColor,
  logoUrl,
  backgroundUrl,
  backgroundOverlay = 0.5,
  backgroundGradientStart = '#080808',
  backgroundGradientEnd = '#0A0E1A',
}: MobilePreviewProps) {
  const overlay = Math.max(0, Math.min(1, backgroundOverlay));

  // Mirror the mobile home's 3-stop LinearGradient scaled by user's overlay.
  const overlayTop = Math.min(1, overlay * 0.6);
  const overlayMid = Math.min(1, overlay * 1.0);
  const overlayBot = Math.min(1, overlay * 1.3);

  const primaryDark = adjustBrightness(primaryColor, -0.2);
  const onP = onPrimary(primaryColor);

  // When there's no image, render the user-defined gradient; otherwise use the
  // image (with the darkening overlay painted on top below).
  const screenBackground = backgroundUrl
    ? `url(${backgroundUrl}) center/cover no-repeat`
    : `linear-gradient(180deg, ${backgroundGradientStart} 0%, ${backgroundGradientEnd} 100%)`;

  return (
    <div className="flex justify-center select-none">
      {/* Phone frame */}
      <div
        className="relative rounded-[44px] p-[6px] shadow-2xl"
        style={{
          width: 296,
          height: 608,
          background: 'linear-gradient(180deg, #1A1A1A 0%, #0A0A0A 100%)',
          boxShadow:
            '0 40px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04) inset',
        }}
      >
        {/* Screen */}
        <div
          className="relative w-full h-full rounded-[38px] overflow-hidden"
          style={{ background: screenBackground }}
        >
          {/* ── Darkening overlay (adjustable) — matches mobile home's gradient ── */}
          {backgroundUrl ? (
            <div
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{
                background: `linear-gradient(180deg, rgba(0,0,0,${overlayTop.toFixed(
                  2,
                )}) 0%, rgba(8,8,8,${overlayMid.toFixed(2)}) 55%, rgba(0,0,0,${overlayBot.toFixed(
                  2,
                )}) 100%)`,
              }}
            />
          ) : null}

          {/* ── Notch ── */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-20 h-5 bg-black rounded-full z-30" />

          {/* ── Status bar ── */}
          <div className="relative z-10 flex items-center justify-between px-5 pt-2.5 pb-1 text-[10px] text-white/90 font-semibold">
            <span>9:41</span>
            <div className="flex items-center gap-1 opacity-80">
              <div className="w-3 h-[7px] rounded-sm border border-white/60" />
              <div className="w-4 h-[7px] rounded-sm border border-white/60 relative">
                <div className="absolute inset-[1px] bg-white/60 rounded-[1px]" />
              </div>
            </div>
          </div>

          {/* ── Fixed header: avatar + username + store/bell ── */}
          <div className="relative z-10 flex items-center justify-between px-4 pt-3 pb-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[11px] text-white/70 font-semibold shrink-0">
                SJ
              </div>
              <span
                className="text-[11px] text-white/70 uppercase tracking-[0.08em] font-mono truncate"
                style={{ fontWeight: 600 }}
              >
                sweatdrop
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <IconCircle primary={primaryColor}>
                <Store className="w-[14px] h-[14px]" style={{ color: hexToRgba(primaryColor, 0.9) }} />
              </IconCircle>
              <IconCircle primary={primaryColor}>
                <Bell className="w-[14px] h-[14px]" style={{ color: hexToRgba(primaryColor, 0.9) }} />
              </IconCircle>
            </div>
          </div>

          {/* ── Drops ring hero ── */}
          <div className="relative z-10 flex flex-col items-center justify-center pt-3 pb-2">
            <div
              className="relative flex items-center justify-center rounded-full"
              style={{
                width: 168,
                height: 168,
                background: `conic-gradient(${primaryColor} 0deg, ${primaryColor} 252deg, rgba(255,255,255,0.08) 252deg, rgba(255,255,255,0.08) 360deg)`,
                boxShadow: `0 0 32px ${hexToRgba(primaryColor, 0.35)}`,
              }}
            >
              <div
                className="absolute rounded-full"
                style={{
                  inset: 10,
                  background:
                    'radial-gradient(circle at 50% 38%, rgba(18,18,26,0.96) 0%, rgba(10,10,18,0.98) 100%)',
                }}
              />
              <div className="relative z-10 flex flex-col items-center">
                <div
                  className="font-semibold tabular-nums leading-none"
                  style={{ color: primaryColor, fontSize: 38, textShadow: `0 0 18px ${hexToRgba(primaryColor, 0.55)}` }}
                >
                  1,250
                </div>
                <div className="text-[9px] text-white/55 tracking-[0.22em] mt-1 uppercase">drops</div>
              </div>
            </div>

            {/* Gym logo badge */}
            <div
              className="mt-2 h-[26px] min-w-[78px] px-2 rounded-full border flex items-center justify-center bg-black/50 backdrop-blur-sm"
              style={{ borderColor: hexToRgba(primaryColor, 0.55) }}
            >
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="Logo" className="max-h-[18px] max-w-[60px] object-contain" />
              ) : (
                <div className="flex items-center gap-1 text-[9px] text-white/70 font-medium tracking-wide">
                  <div
                    className="w-2 h-2 rounded-sm"
                    style={{ background: primaryColor }}
                  />
                  YOUR GYM
                </div>
              )}
            </div>
          </div>

          {/* ── Rounded "sheet" with tab bar + bento grid ── */}
          <div
            className="absolute left-0 right-0 z-10 rounded-t-[24px] border-t border-l border-r overflow-hidden"
            style={{
              top: 356,
              bottom: 0,
              background:
                'linear-gradient(180deg, rgba(20,22,32,0.92) 0%, rgba(12,14,22,0.98) 100%)',
              borderTopColor: 'rgba(255,255,255,0.18)',
              borderLeftColor: 'rgba(255,255,255,0.06)',
              borderRightColor: 'rgba(255,255,255,0.06)',
              backdropFilter: 'blur(12px)',
            }}
          >
            {/* Primary-tinted gradient wash on top of sheet */}
            <div
              className="absolute top-0 left-0 right-0 h-14 pointer-events-none"
              style={{
                background: `linear-gradient(180deg, rgba(255,255,255,0.10) 0%, ${hexToRgba(
                  primaryColor,
                  0.08,
                )} 40%, rgba(12,14,22,0) 100%)`,
              }}
            />

            {/* Tab bar */}
            <div className="relative z-10 flex items-center gap-1 px-2 pt-3 pb-2">
              <SheetTab icon={<Activity className="w-3 h-3" />} label="Activity" active primary={primaryColor} />
              <SheetTab icon={<Trophy className="w-3 h-3" />} label="Compete" primary={primaryColor} />
              <SheetTab icon={<Flame className="w-3 h-3" />} label="Streak" primary={primaryColor} />
              <SheetTab icon={<Shield className="w-3 h-3" />} label="Arena" primary={primaryColor} />
            </div>

            {/* Bento stats */}
            <div className="relative z-10 px-3 pb-3 space-y-2">
              <div className="grid grid-cols-[1.35fr_1fr] gap-2">
                {/* Hero stat — streak */}
                <div
                  className="rounded-2xl p-3 border flex flex-col justify-between min-h-[84px]"
                  style={{
                    background: `linear-gradient(145deg, ${hexToRgba(primaryColor, 0.22)} 0%, ${hexToRgba(
                      primaryColor,
                      0.06,
                    )} 100%)`,
                    borderColor: hexToRgba(primaryColor, 0.35),
                  }}
                >
                  <div className="flex items-center gap-1 text-[8px] uppercase tracking-widest" style={{ color: primaryColor }}>
                    <Flame className="w-2.5 h-2.5" /> streak
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-white font-bold text-xl leading-none tabular-nums">12</span>
                    <span className="text-white/50 text-[9px]">days</span>
                  </div>
                </div>

                {/* Side column */}
                <div className="grid grid-rows-2 gap-2">
                  <div className="rounded-xl p-2 border border-white/8 bg-white/[0.04] flex flex-col justify-center">
                    <div className="text-[8px] text-white/50 uppercase tracking-wider">Today</div>
                    <div className="text-white font-semibold text-sm tabular-nums leading-tight">+240</div>
                  </div>
                  <div className="rounded-xl p-2 border border-white/8 bg-white/[0.04] flex flex-col justify-center">
                    <div className="text-[8px] text-white/50 uppercase tracking-wider">Rank</div>
                    <div className="text-white font-semibold text-sm tabular-nums leading-tight">#7</div>
                  </div>
                </div>
              </div>

              {/* Action row */}
              <div className="grid grid-cols-2 gap-2">
                <div
                  className="rounded-xl px-2.5 py-2 border flex items-center gap-2"
                  style={{
                    background: 'rgba(20,22,32,0.6)',
                    borderColor: hexToRgba(primaryColor, 0.22),
                  }}
                >
                  <div
                    className="w-6 h-6 rounded-lg flex items-center justify-center"
                    style={{ background: hexToRgba(primaryColor, 0.12) }}
                  >
                    <QrCode className="w-3 h-3" style={{ color: primaryColor }} />
                  </div>
                  <div>
                    <div className="text-[8px] text-white/50 uppercase tracking-wider">Check-in</div>
                    <div className="text-white font-semibold text-[10px]">Ready</div>
                  </div>
                </div>
                <div className="rounded-xl px-2.5 py-2 border border-white/8 bg-white/[0.04] flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center">
                    <Trophy className="w-3 h-3 text-white/60" />
                  </div>
                  <div>
                    <div className="text-[8px] text-white/50 uppercase tracking-wider">Reward</div>
                    <div className="text-white font-semibold text-[10px]">500 drops</div>
                  </div>
                </div>
              </div>
            </div>

            {/* FAB "Start workout" */}
            <div className="absolute left-3 right-3 bottom-3 z-20">
              <div
                className="w-full rounded-2xl py-2.5 flex items-center justify-center gap-2 font-bold text-[12px] tracking-wide"
                style={{
                  background: `linear-gradient(135deg, ${hexToRgba(primaryDark, 0.95)} 0%, ${hexToRgba(
                    primaryColor,
                    0.95,
                  )} 100%)`,
                  color: onP,
                  boxShadow: `0 10px 24px ${hexToRgba(primaryColor, 0.35)}`,
                }}
              >
                <QrCode className="w-3.5 h-3.5" />
                Start workout
              </div>
            </div>

            {/* Bottom dim mask behind FAB */}
            <div
              className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none"
              style={{
                background:
                  'linear-gradient(180deg, rgba(12,14,22,0) 0%, rgba(12,14,22,0.85) 60%, rgba(12,14,22,0.96) 100%)',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function IconCircle({ children, primary }: { children: React.ReactNode; primary: string }) {
  return (
    <div
      className="w-8 h-8 rounded-[10px] border flex items-center justify-center bg-white/[0.04]"
      style={{ borderColor: hexToRgba(primary, 0.25) }}
    >
      {children}
    </div>
  );
}

function SheetTab({
  icon,
  label,
  active,
  primary,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  primary: string;
}) {
  return (
    <div
      className="flex-1 flex items-center justify-center gap-1 rounded-lg py-1.5 text-[9px] font-semibold tracking-wide transition-colors"
      style={
        active
          ? {
              background: hexToRgba(primary, 0.18),
              color: primary,
              boxShadow: `inset 0 0 0 1px ${hexToRgba(primary, 0.3)}`,
            }
          : { color: 'rgba(255,255,255,0.45)' }
      }
    >
      {icon}
      {label}
    </div>
  );
}
