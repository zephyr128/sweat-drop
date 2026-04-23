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

  const inner = svg
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .trim();

  return { inner, vbW, vbH };
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

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <radialGradient id="aura" cx="50%" cy="50%" r="50%">
      <stop offset="0%"  stop-color="${c.aura}" stop-opacity="0.25"/>
      <stop offset="70%" stop-color="${c.aura}" stop-opacity="0.05"/>
      <stop offset="100%" stop-color="${c.aura}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="ring" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"   stop-color="${c.dark}"/>
      <stop offset="50%"  stop-color="${c.light}"/>
      <stop offset="100%" stop-color="${c.dark}"/>
    </linearGradient>
    <linearGradient id="glass" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%"   stop-color="#FFFFFF" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="6"/>
    </filter>
  </defs>

  <!-- Aura -->
  <circle cx="256" cy="256" r="256" fill="url(#aura)"/>

  <!-- Drop shadow -->
  <circle cx="256" cy="268" r="224" fill="#000" opacity="0.45" filter="url(#softShadow)"/>

  <!-- Outer color ring -->
  <circle cx="256" cy="256" r="224" fill="url(#ring)"/>
  <circle cx="256" cy="256" r="224" fill="none" stroke="#000" stroke-opacity="0.25" stroke-width="2"/>

  <!-- Inner glass disk -->
  <circle cx="256" cy="256" r="176" fill="rgba(18,20,30,0.94)"/>
  <circle cx="256" cy="256" r="176" fill="url(#glass)"/>
  <circle cx="256" cy="256" r="176" fill="none" stroke="${c.aura}" stroke-opacity="0.35" stroke-width="2"/>

  <!-- Activity icon (centered, scaled from ${icon.vbW}x${icon.vbH} to fit ${ICON_SIZE}x${ICON_SIZE}) -->
  <g transform="translate(${tx.toFixed(1)},${ty.toFixed(1)}) scale(${scale.toFixed(4)})" fill="#FFFFFF" stroke="none">
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
