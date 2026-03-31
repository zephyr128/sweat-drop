#!/usr/bin/env node
/**
 * Switches BOTH admin-panel and mobile-app to the same environment.
 * Usage:
 *   node scripts/use-env.cjs dev    — switch everything to dev
 *   node scripts/use-env.cjs prod   — switch everything to production
 */
const { execSync } = require('child_process');
const path = require('path');

const arg = (process.argv[2] || '').trim().toLowerCase();
if (!['dev', 'prod'].includes(arg)) {
  console.error('[use-env] Usage: node scripts/use-env.cjs <dev|prod>');
  process.exit(1);
}

const scriptsDir = __dirname;
const label = arg === 'prod' ? 'PRODUCTION' : 'DEVELOPMENT';

console.log(`\n🔄 Switching all workspaces to ${label}...\n`);

try {
  execSync(`node "${path.join(scriptsDir, 'use-admin-env.cjs')}" ${arg}`, { stdio: 'inherit' });
} catch {
  console.error('[use-env] Failed to switch admin-panel env');
}

try {
  execSync(`node "${path.join(scriptsDir, 'use-mobile-env.cjs')}" ${arg}`, { stdio: 'inherit' });
} catch {
  console.error('[use-env] Failed to switch mobile-app env');
}

console.log(`\n✅ All workspaces switched to ${label}\n`);
