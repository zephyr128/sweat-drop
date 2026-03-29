#!/usr/bin/env node
/**
 * Read-only: required docs/release artifacts for production go-live planning.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

const REQUIRED_RELEASE_DOCS = [
  'docs/release/GO_LIVE_DAY_OF_CHECKLIST.md',
  'docs/release/INCIDENT_ROLLBACK_QUICKSHEET.md',
  'docs/release/PRODUCTION_CUTOVER_COMMANDS.md',
  'docs/release/RELEASE_MANIFEST_TEMPLATE.md',
  'docs/release/app_store_connect_submission_checklist.md',
  'docs/release/google_play_submission_checklist.md',
];

const missing = REQUIRED_RELEASE_DOCS.filter((rel) => !fs.existsSync(path.join(ROOT, rel)));

if (missing.length > 0) {
  console.error('[verify-release-doc-artifacts] FAILED — missing files:');
  for (const rel of missing) {
    console.error(`- ${rel}`);
  }
  process.exit(1);
}

console.log('[verify-release-doc-artifacts] OK');
