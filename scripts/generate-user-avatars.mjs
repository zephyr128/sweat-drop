import { Resvg } from '@resvg/resvg-js';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../apps/mobile-app/assets/user-avatars');
const SIZE = 512;
const BUCKET = 'user-avatars';

// ---------- Color schemes ----------
const COLORS = {
  cyan:    { dark: '#003E66', light: '#00E5FF', aura: '#00E5FF' },
  amber:   { dark: '#6B3A00', light: '#FFB547', aura: '#FFB547' },
  emerald: { dark: '#064E3B', light: '#4ADE80', aura: '#4ADE80' },
  crimson: { dark: '#6B0F1A', light: '#F87171', aura: '#F87171' },
};

// ---------- Activities (Iconify refs) ----------
const ACTIVITIES = {
  weightlifting: 'healthicons:exercise-weights',
  running:       'mdi:run-fast',
  yoga:          'mdi:yoga',
  cycling:       'fa6-solid:person-biking',
  rowing:        'mdi:rowing',
  boxing:        'mdi:boxing-glove',
  swimming:      'fa6-solid:person-swimming',
  hiit:          'tabler:jump-rope',
  climbing:      'fa6-solid:person-walking-with-cane',
  stretching:    'tabler:stretching',
  pilates:       'tabler:yoga',
  crossfit:      'mdi:kettlebell',
};

// Strip explicit color attributes so the icon inherits fill/stroke from the
// parent <g>. We preserve `fill="none"` and `stroke="none"` (semantic, not color).
function sanitizeIconInner(inner) {
  return inner
    .replace(/\sfill="(?!none\b)[^"]*"/gi, '')
    .replace(/\sstroke="(?!none\b)[^"]*"/gi, '')
    .replace(/\scolor="[^"]*"/gi, '');
}

// ---------- Fetch icon SVG from Iconify ----------
// Returns { inner, viewBox: { w, h } } so we can scale correctly for any viewBox.
async function fetchIcon(ref) {
  const [pack, name] = ref.split(':');
  const url = `https://api.iconify.design/${pack}/${name}.svg`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Iconify fetch failed: ${ref} (${res.status})`);
  const svg = await res.text();

  const vbMatch = svg.match(/viewBox="([^"]+)"/);
  let vbW = 24, vbH = 24;
  if (vbMatch) {
    const parts = vbMatch[1].split(/\s+/).map(Number);
    vbW = parts[2];
    vbH = parts[3];
  }

  const innerRaw = svg
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .trim();

  return { inner: sanitizeIconInner(innerRaw), vbW, vbH };
}

// ---------- SVG template ----------
// Icon target: 220x220 box centered in the 512x512 canvas (center at 256,256).
const ICON_SIZE = 220;

function renderSVG({ icon, color }) {
  const c = COLORS[color];

  // Uniform scale to fit the icon's native viewBox into ICON_SIZE × ICON_SIZE
  const scale = Math.min(ICON_SIZE / icon.vbW, ICON_SIZE / icon.vbH);
  const scaledW = icon.vbW * scale;
  const scaledH = icon.vbH * scale;
  const tx = (SIZE - scaledW) / 2;
  const ty = (SIZE - scaledH) / 2;
  // Soft offset shadow under the icon (purely translated, no filter — works in resvg)
  const shadowDy = 4;

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <radialGradient id="aura" cx="50%" cy="50%" r="50%">
      <stop offset="0%"  stop-color="${c.aura}" stop-opacity="0.30"/>
      <stop offset="70%" stop-color="${c.aura}" stop-opacity="0.06"/>
      <stop offset="100%" stop-color="${c.aura}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="ring" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"   stop-color="${c.dark}"/>
      <stop offset="50%"  stop-color="${c.light}"/>
      <stop offset="100%" stop-color="${c.dark}"/>
    </linearGradient>
    <linearGradient id="silverPlate" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"   stop-color="#FAFBFD"/>
      <stop offset="32%"  stop-color="#DCE2EB"/>
      <stop offset="55%"  stop-color="#B6BDC8"/>
      <stop offset="78%"  stop-color="#D6DCE5"/>
      <stop offset="100%" stop-color="#F4F6FA"/>
    </linearGradient>
    <linearGradient id="silverShine" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%"   stop-color="#FFFFFF" stop-opacity="0.55"/>
      <stop offset="45%"  stop-color="#FFFFFF" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="plateVignette" cx="50%" cy="50%" r="50%">
      <stop offset="55%"  stop-color="#000000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.22"/>
    </radialGradient>
    <radialGradient id="specularHi" cx="35%" cy="30%" r="55%">
      <stop offset="0%"   stop-color="#FFFFFF" stop-opacity="0.55"/>
      <stop offset="60%"  stop-color="#FFFFFF" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="iconMetal" x1="50%" y1="0%" x2="50%" y2="100%">
      <stop offset="0%"   stop-color="#5E6776"/>
      <stop offset="55%"  stop-color="#262E3D"/>
      <stop offset="100%" stop-color="#0E131C"/>
    </linearGradient>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="6"/>
    </filter>
  </defs>

  <!-- Aura -->
  <circle cx="256" cy="256" r="256" fill="url(#aura)"/>

  <!-- Drop shadow under the badge -->
  <circle cx="256" cy="270" r="224" fill="#000" opacity="0.5" filter="url(#softShadow)"/>

  <!-- Outer color ring -->
  <circle cx="256" cy="256" r="224" fill="url(#ring)"/>
  <circle cx="256" cy="256" r="224" fill="none" stroke="#000" stroke-opacity="0.30" stroke-width="2"/>
  <circle cx="256" cy="256" r="221" fill="none" stroke="#FFFFFF" stroke-opacity="0.18" stroke-width="1"/>

  <!-- Inner metallic silver plate -->
  <circle cx="256" cy="256" r="176" fill="url(#silverPlate)"/>
  <circle cx="256" cy="256" r="176" fill="url(#silverShine)"/>

  <!-- Brushed-metal concentric arcs (very subtle) -->
  <g fill="none">
    <circle cx="256" cy="256" r="168" stroke="#FFFFFF" stroke-opacity="0.10" stroke-width="1"/>
    <circle cx="256" cy="256" r="156" stroke="#FFFFFF" stroke-opacity="0.07" stroke-width="1"/>
    <circle cx="256" cy="256" r="142" stroke="#000000" stroke-opacity="0.06" stroke-width="1"/>
    <circle cx="256" cy="256" r="126" stroke="#FFFFFF" stroke-opacity="0.05" stroke-width="1"/>
  </g>

  <!-- Specular highlight (top-left lit) -->
  <circle cx="256" cy="256" r="176" fill="url(#specularHi)"/>
  <ellipse cx="206" cy="196" rx="118" ry="48" fill="#FFFFFF" fill-opacity="0.18"/>

  <!-- Plate vignette (darkens edges for depth) -->
  <circle cx="256" cy="256" r="176" fill="url(#plateVignette)"/>

  <!-- Inner bezel rings -->
  <circle cx="256" cy="256" r="176" fill="none" stroke="${c.aura}" stroke-opacity="0.55" stroke-width="2"/>
  <circle cx="256" cy="256" r="170" fill="none" stroke="${c.aura}" stroke-opacity="0.18" stroke-width="1"/>

  <!-- Activity icon — soft drop shadow underlay (covers both filled & stroke icons) -->
  <g transform="translate(${tx.toFixed(1)},${(ty + shadowDy).toFixed(1)}) scale(${scale.toFixed(4)})" fill="#000000" fill-opacity="0.22" stroke="#000000" stroke-opacity="0.22">
    ${icon.inner}
  </g>
  <!-- Activity icon — metallic gradient (inherited via fill/stroke on parent <g>) -->
  <g transform="translate(${tx.toFixed(1)},${ty.toFixed(1)}) scale(${scale.toFixed(4)})" fill="url(#iconMetal)" stroke="url(#iconMetal)">
    ${icon.inner}
  </g>

</svg>`.trim();
}

// ---------- Main ----------
async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const shouldUpload = process.argv.includes('--upload');
  let supabase = null;
  if (shouldUpload) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      console.error('❌ --upload requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.');
      process.exit(1);
    }
    supabase = createClient(url, key, { auth: { persistSession: false } });
  }

  // Fetch all 12 icons once (cached in memory for the 4 color variants)
  console.log('Fetching 12 icon SVGs from Iconify…');
  const iconCache = {};
  for (const [activity, ref] of Object.entries(ACTIVITIES)) {
    iconCache[activity] = await fetchIcon(ref);
    const ic = iconCache[activity];
    console.log(`  ✓ ${activity} (${ref}) — viewBox ${ic.vbW}×${ic.vbH}`);
  }

  let generated = 0;
  for (const [activity, icon] of Object.entries(iconCache)) {
    for (const color of Object.keys(COLORS)) {
      const svg = renderSVG({ icon, color });
      const png = new Resvg(svg, { fitTo: { mode: 'width', value: SIZE } }).render().asPng();
      const filename = `${activity}_${color}.png`;
      const filepath = path.join(OUT_DIR, filename);
      fs.writeFileSync(filepath, png);
      generated++;
      console.log(`✓ ${filename}`);

      if (shouldUpload && supabase) {
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(filename, png, { contentType: 'image/png', upsert: true });
        if (error) console.error(`  ↳ upload failed: ${error.message}`);
        else console.log(`  ↳ uploaded to ${BUCKET}/${filename}`);
      }
    }
  }
  console.log(`\nDone. ${generated} avatars in ${OUT_DIR}`);
}

main().catch(err => { console.error(err); process.exit(1); });
