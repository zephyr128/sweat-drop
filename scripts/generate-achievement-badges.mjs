import { Resvg } from '@resvg/resvg-js';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../apps/mobile-app/assets/achievement-badges');
const SIZE = 512;
const BUCKET = 'global-achievement-badges';

// ---------- Tiers ----------
const TIERS = {
  bronze:   { label: 'BRONZE',   grad: ['#4A2511', '#CD7F32', '#FFB47A', '#8B4513'], aura: '#CD7F32', plate: '#FFB47A' },
  silver:   { label: 'SILVER',   grad: ['#4A4A55', '#C0C0C0', '#FFFFFF', '#8A8A92'], aura: '#C0C0C0', plate: '#FFFFFF' },
  gold:     { label: 'GOLD',     grad: ['#6B4E00', '#FFD700', '#FFF8B0', '#8C7030'], aura: '#FFD700', plate: '#FFF8B0' },
  platinum: { label: 'PLATINUM', grad: ['#2B2E3A', '#E5E4E2', '#FFFFFF', '#7B7E8A'], aura: '#E5E4E2', plate: '#FFFFFF' },
  diamond:  { label: 'DIAMOND',  grad: ['#003E66', '#6BDFFF', '#EAFBFF', '#0099CC'], aura: '#6BDFFF', plate: '#EAFBFF' },
};

// ---------- Categories (SVG paths from Lucide, viewBox 0 0 24 24, stroke-based) ----------
// code prefix used in DB code column -> category key
const CATEGORIES = {
  sessions: {
    codePrefix: 'sessions',
    // Dumbbell
    path: `<path d="M14.4 14.4 9.6 9.6"/><path d="M18.657 21.485a2 2 0 1 1-2.829-2.828l-1.767 1.768a2 2 0 1 1-2.829-2.829l6.364-6.364a2 2 0 1 1 2.829 2.829l-1.768 1.767a2 2 0 1 1 2.828 2.829z"/><path d="m21.5 21.5-1.4-1.4"/><path d="M3.9 3.9 2.5 2.5"/><path d="M6.404 12.768a2 2 0 1 1-2.829-2.829l1.768-1.767a2 2 0 1 1-2.828-2.829l2.828-2.828a2 2 0 1 1 2.829 2.828l1.767-1.768a2 2 0 1 1 2.829 2.829z"/>`,
  },
  total_drops: {
    codePrefix: 'drops',
    // Droplets
    path: `<path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z"/><path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97"/>`,
  },
  streak: {
    codePrefix: 'streak',
    // Flame
    path: `<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>`,
  },
  multi_gym: {
    codePrefix: 'multi_gym',
    // MapPinned
    path: `<path d="M18 8c0 3.613-3.869 7.429-5.393 8.795a1 1 0 0 1-1.214 0C9.87 15.429 6 11.613 6 8a6 6 0 0 1 12 0"/><circle cx="12" cy="8" r="2"/><path d="M8.714 14h-3.71a1 1 0 0 0-.948.683l-2.004 6A1 1 0 0 0 3 22h18a1 1 0 0 0 .948-1.316l-2-6a1 1 0 0 0-.949-.684h-3.712"/>`,
  },
  distance: {
    codePrefix: 'distance',
    // Route
    path: `<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>`,
  },
  special: {
    codePrefix: 'special',
    // Sparkles
    path: `<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>`,
  },
};

// ---------- Full catalog (matches Phase 1 seed) ----------
const CATALOG = [];
for (const [catKey, cat] of Object.entries(CATEGORIES)) {
  if (catKey === 'special') continue; // no seed rows for special in MVP
  for (const tierKey of Object.keys(TIERS)) {
    CATALOG.push({ category: catKey, tier: tierKey, code: `${cat.codePrefix}_${tierKey}` });
  }
}

// ---------- SVG template ----------
function renderSVG({ category, tier }) {
  const t = TIERS[tier];
  const c = CATEGORIES[category];
  const gradId = `ring-${tier}`;
  const glassId = `glass-${tier}`;
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <radialGradient id="aura" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${t.aura}" stop-opacity="0.25"/>
      <stop offset="70%" stop-color="${t.aura}" stop-opacity="0.05"/>
      <stop offset="100%" stop-color="${t.aura}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"   stop-color="${t.grad[0]}"/>
      <stop offset="35%"  stop-color="${t.grad[1]}"/>
      <stop offset="65%"  stop-color="${t.grad[2]}"/>
      <stop offset="100%" stop-color="${t.grad[3]}"/>
    </linearGradient>
    <linearGradient id="${glassId}" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%"   stop-color="#FFFFFF" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="6"/>
    </filter>
  </defs>

  <!-- Aura -->
  <circle cx="256" cy="256" r="256" fill="url(#aura)"/>

  <!-- Drop shadow under ring -->
  <circle cx="256" cy="268" r="224" fill="#000" opacity="0.45" filter="url(#softShadow)"/>

  <!-- Outer metal ring -->
  <circle cx="256" cy="256" r="224" fill="url(#${gradId})"/>
  <circle cx="256" cy="256" r="224" fill="none" stroke="#000" stroke-opacity="0.25" stroke-width="2"/>

  <!-- Inner glass disk -->
  <circle cx="256" cy="256" r="176" fill="rgba(18,20,30,0.94)"/>
  <circle cx="256" cy="256" r="176" fill="url(#${glassId})"/>
  <circle cx="256" cy="256" r="176" fill="none" stroke="${t.aura}" stroke-opacity="0.35" stroke-width="2"/>

  <!-- Category icon (centered, scaled from 24x24 viewBox to 160x160) -->
  <g transform="translate(176,160) scale(6.667)" fill="none" stroke="${t.plate}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    ${c.path}
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

  for (const entry of CATALOG) {
    const svg = renderSVG(entry);
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: SIZE } }).render().asPng();
    const filename = `${entry.code}-badge.png`;
    const filepath = path.join(OUT_DIR, filename);
    fs.writeFileSync(filepath, png);
    console.log(`✓ generated ${filename}`);

    if (shouldUpload && supabase) {
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(filename, png, { contentType: 'image/png', upsert: true });
      if (error) console.error(`  ↳ upload failed: ${error.message}`);
      else console.log(`  ↳ uploaded to ${BUCKET}/${filename}`);
    }
  }
  console.log(`\nDone. ${CATALOG.length} badges in ${OUT_DIR}`);
}

main().catch(err => { console.error(err); process.exit(1); });
