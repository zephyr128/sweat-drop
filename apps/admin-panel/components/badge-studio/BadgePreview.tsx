'use client';

import { useMemo } from 'react';
import { renderBadgeSVG, TIERS, TIER_ORDER } from '@/lib/badge-studio/badge-svg-template';
import type { TierKey, CategoryKey } from '@/lib/badge-studio/badge-svg-template';

interface BadgePreviewProps {
  /** Which tier badges to show. Defaults to all 5 preset tiers. */
  tiers?: TierKey[];
  category?: CategoryKey;
  customCenterImage?: string;
  /** Custom palette — only applied to tier === 'custom'. */
  customColors?: {
    grad: [string, string, string, string];
    aura: string;
    plate: string;
  };
  /** Rendered SVG size in px. Default: 96 (matches w-24 h-24). */
  size?: number;
}

export function BadgePreview({
  tiers = TIER_ORDER,
  category,
  customCenterImage,
  customColors,
  size = 96,
}: BadgePreviewProps) {
  const badges = useMemo(
    () =>
      tiers.map((tier) => ({
        tier,
        svg: renderBadgeSVG({ tier, category, customCenterImage, customColors, size }),
        label: tier === 'custom' ? 'Custom' : TIERS[tier].label,
      })),
    [tiers, category, customCenterImage, customColors, size],
  );

  return (
    <div className="flex flex-wrap gap-4 items-end justify-center">
      {badges.map(({ tier, svg, label }) => (
        <div key={tier} className="flex flex-col items-center gap-2">
          <div
            style={{ width: size, height: size }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          <span className="text-[10px] font-semibold tracking-widest text-zinc-400 uppercase">
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}
