#!/usr/bin/env node
/**
 * Focused unit checks: email verification gate, pilot gym listing fallback,
 * send-push parse + Expo ticket summarization (shared modules).
 */
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const MOBILE_DIR = path.join(ROOT, 'apps', 'mobile-app');

const files = [
  'tests/auth-email-verification.test.ts',
  'tests/pilot-gym-listing.test.ts',
  'tests/send-push-shared.test.ts',
];

const result = spawnSync('node', ['--import', 'tsx', '--test', ...files], {
  cwd: MOBILE_DIR,
  encoding: 'utf8',
  stdio: 'inherit',
});

process.exit(typeof result.status === 'number' ? result.status : 1);
