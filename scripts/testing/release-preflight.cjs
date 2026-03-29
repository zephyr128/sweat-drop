#!/usr/bin/env node
/**
 * Release preflight: env example templates, release doc artifacts, plan migrations.
 * Read-only on disk; does not connect to Supabase or any remote database.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

const CHECKS = [
  ['verify-env-example-templates', path.join(__dirname, 'verify-env-example-templates.cjs')],
  ['verify-release-doc-artifacts', path.join(__dirname, 'verify-release-doc-artifacts.cjs')],
  ['verify-plan-migration-ids', path.join(__dirname, 'verify-plan-migration-ids.cjs')],
  ['verify-eas-push-profiles', path.join(__dirname, 'verify-eas-push-profiles.cjs')],
];

let failed = false;
for (const [, scriptPath] of CHECKS) {
  const r = spawnSync(process.execPath, [scriptPath], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (r.status !== 0) {
    failed = true;
  }
}

if (failed) {
  console.error('\n[release-preflight] FAILED (one or more checks above)');
  process.exit(1);
}

console.log('\n[release-preflight] All checks passed.');
