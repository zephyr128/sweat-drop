/**
 * Home hero semicircle gauge: arc from -15° to 195° (210° sweep) instead of a plain 180° semicircle.
 * Angles use standard math convention: 0° = east, counterclockwise positive.
 * y maps to SVG with y-down: y = cy - r * sin(θ).
 */
export const HERO_GAUGE_ARC_START_DEG = -15;
export const HERO_GAUGE_ARC_END_DEG = 195;

const D2R = Math.PI / 180;

/** Vertical distance the chord sits below the horizontal through center (endpoints dip by 15° along the circle). */
export function heroGaugeArcChordDrop(radius: number): number {
  return radius * Math.sin(15 * D2R);
}

/** SVG elliptical arc path d= for the gauge (single arc, 210°). */
export function heroGaugeArcD(cx: number, cy: number, r: number): string {
  const t1 = HERO_GAUGE_ARC_START_DEG * D2R;
  const t2 = HERO_GAUGE_ARC_END_DEG * D2R;
  const x1 = cx + r * Math.cos(t1);
  const y1 = cy - r * Math.sin(t1);
  const x2 = cx + r * Math.cos(t2);
  const y2 = cy - r * Math.sin(t2);
  const largeArc = 1;
  const sweep = 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} ${sweep} ${x2} ${y2}`;
}
