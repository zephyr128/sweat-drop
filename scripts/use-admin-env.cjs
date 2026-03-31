#!/usr/bin/env node
/**
 * Copies a selected local admin env file into apps/admin-panel/.env.local.
 * Usage:
 *   node scripts/use-admin-env.cjs dev
 *   node scripts/use-admin-env.cjs prod
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ADMIN_DIR = path.join(ROOT, 'apps', 'admin-panel');
const TARGET_ENV = path.join(ADMIN_DIR, '.env.local');

const arg = (process.argv[2] || '').trim().toLowerCase();
const sourceByArg = {
  dev: path.join(ADMIN_DIR, '.env.dev.local'),
  prod: path.join(ADMIN_DIR, '.env.prod.local'),
};

if (!sourceByArg[arg]) {
  console.error('[use-admin-env] Usage: node scripts/use-admin-env.cjs <dev|prod>');
  process.exit(1);
}

const sourcePath = sourceByArg[arg];
if (!fs.existsSync(sourcePath)) {
  console.error(`[use-admin-env] Missing source file: ${sourcePath}`);
  console.error('[use-admin-env] Create it from .env.example first.');
  process.exit(1);
}

fs.copyFileSync(sourcePath, TARGET_ENV);
console.log(`[use-admin-env] Wrote ${TARGET_ENV} from ${path.basename(sourcePath)}`);
