'use client';

import { Trophy, Users, Calendar, Lock, Flame, Droplet } from 'lucide-react';

interface ArenaLivePreviewProps {
  name: string;
  sponsorName: string;
  scoringModel: string;
  startDate?: string;
  endDate?: string;
  optInType?: string;
  optInValue?: number;
  cardColor?: string;
  cardTextColor?: string;
  cardGradientEnd?: string;
  sponsorLogo?: string;
  participantCount?: number;
  prizes?: Array<{ rank: number; prize: string }>;
}

const SCORING_ICONS: Record<string, typeof Trophy> = {
  total_drops: Droplet,
  streak_days: Flame,
};

function formatPreviewDate(dateStr?: string): string {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function ArenaLivePreview({
  name,
  sponsorName,
  scoringModel,
  startDate,
  endDate,
  optInType,
  optInValue,
  cardColor,
  cardTextColor,
  cardGradientEnd,
  sponsorLogo,
  participantCount,
  prizes,
}: ArenaLivePreviewProps) {
  const bgColor = cardColor || '#00E5FF';
  const textColor = cardTextColor || '#FFFFFF';
  const bgStyle = cardGradientEnd
    ? { background: `linear-gradient(135deg, ${bgColor}, ${cardGradientEnd})` }
    : { background: bgColor };

  return (
    <div className="w-full max-w-sm mx-auto">
      <p className="text-xs text-[#808080] mb-2 text-center">Mobile App Preview</p>
      {/* Phone frame */}
      <div className="bg-[#0A0A0A] rounded-2xl border border-[#333] p-3 shadow-2xl">
        {/* Status bar mock */}
        <div className="flex items-center justify-between px-2 mb-3">
          <span className="text-[10px] text-[#808080]">9:41</span>
          <div className="flex gap-1">
            <div className="w-3 h-1.5 bg-[#808080] rounded-sm" />
            <div className="w-3 h-1.5 bg-[#808080] rounded-sm" />
          </div>
        </div>

        {/* Arena Card */}
        <div
          className="rounded-xl p-4 relative overflow-hidden"
          style={{ ...bgStyle, color: textColor }}
        >
          {/* Sponsor logo watermark */}
          {sponsorLogo && (
            <div className="absolute top-3 right-3 opacity-20">
              <img
                src={sponsorLogo}
                alt=""
                className="w-10 h-10 object-contain"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
          )}

          {/* Content */}
          <div className="relative z-10">
            <p className="text-xs font-medium opacity-70 uppercase tracking-wider mb-1">
              {sponsorName || 'Sponsor'}
            </p>
            <h3 className="text-lg font-bold mb-2 leading-tight">
              {name || 'Arena Name'}
            </h3>

            {/* Dates */}
            <div className="flex items-center gap-2 text-xs opacity-80 mb-3">
              <Calendar className="w-3 h-3" />
              <span>{formatPreviewDate(startDate)} — {formatPreviewDate(endDate)}</span>
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center gap-1 text-xs">
                <Users className="w-3 h-3" />
                <span>{participantCount ?? 0}</span>
              </div>
              {optInType && optInType !== 'free' && (
                <div className="flex items-center gap-1 text-xs">
                  <Lock className="w-3 h-3" />
                  <span>
                    {optInType === 'drops' ? `${optInValue} 💧` :
                     optInType === 'streak' ? `${optInValue}🔥` :
                     `Lvl ${optInValue}`}
                  </span>
                </div>
              )}
            </div>

            {/* Prizes */}
            {prizes && prizes.length > 0 && (
              <div className="flex gap-2 mb-3">
                {prizes.slice(0, 3).map((p, i) => (
                  <div
                    key={i}
                    className="text-[10px] px-2 py-1 rounded-full"
                    style={{ backgroundColor: `${textColor}20`, color: textColor }}
                  >
                    <Trophy className="w-2.5 h-2.5 inline mr-0.5" />
                    #{p.rank}
                  </div>
                ))}
              </div>
            )}

            {/* CTA */}
            <button
              type="button"
              className="w-full py-2 rounded-lg text-sm font-bold transition-colors"
              style={{
                backgroundColor: textColor,
                color: bgColor,
              }}
            >
              {optInType === 'drops' ? `Join for ${optInValue} 💧` :
               optInType === 'streak' ? 'Join Arena' :
               optInType === 'level' ? 'Join Arena' :
               'Join Free'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
