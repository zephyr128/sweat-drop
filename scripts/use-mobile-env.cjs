#!/usr/bin/env node
/**
 * Copies a selected local mobile env file into apps/mobile-app/.env.
 * Usage:
 *   node scripts/use-mobile-env.cjs dev
 *   node scripts/use-mobile-env.cjs prod
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MOBILE_DIR = path.join(ROOT, 'apps', 'mobile-app');
const TARGET_ENV = path.join(MOBILE_DIR, '.env');

const arg = (process.argv[2] || '').trim().toLowerCase();
const sourceByArg = {
  dev: path.join(MOBILE_DIR, '.env.dev.local'),
  prod: path.join(MOBILE_DIR, '.env.prod.local'),
};

if (!sourceByArg[arg]) {
  console.error('[use-mobile-env] Usage: node scripts/use-mobile-env.cjs <dev|prod>');
  process.exit(1);
}

const sourcePath = sourceByArg[arg];
if (!fs.existsSync(sourcePath)) {
  console.error(`[use-mobile-env] Missing source file: ${sourcePath}`);
  console.error('[use-mobile-env] Create it from .env.dev.example or .env.prod.example first.');
  process.exit(1);
}

fs.copyFileSync(sourcePath, TARGET_ENV);
console.log(`[use-mobile-env] Wrote ${TARGET_ENV} from ${path.basename(sourcePath)}`);
