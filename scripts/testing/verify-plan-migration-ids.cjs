#!/usr/bin/env node
/**
 * Read-only: ensure planned Supabase migrations are present under
 * backend/supabase/migrations (filename must contain each migration id suffix).
 * Current production plan: 11130000, 27140000, 27150000.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const MIGRATIONS_DIR = path.join(ROOT, 'backend', 'supabase', 'migrations');

const MANDATORY_ID_SUFFIXES = ['11130000', '27140000', '27150000'];

function listMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return { error: `migrations directory missing: backend/supabase/migrations`, files: [] };
  }
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'));
  return { error: null, files };
}

const { error, files } = listMigrationFiles();

if (error) {
  console.error('[verify-plan-migration-ids] FAILED');
  console.error(`- ${error}`);
  process.exit(1);
}

const missing = [];
for (const id of MANDATORY_ID_SUFFIXES) {
  const found = files.some((name) => name.includes(id));
  if (!found) {
    missing.push(id);
  }
}

if (missing.length > 0) {
  console.error('[verify-plan-migration-ids] FAILED — no .sql migration filename contains:');
  for (const id of missing) {
    console.error(`- ${id}`);
  }
  console.error(`  scanned: ${MIGRATIONS_DIR} (${files.length} .sql files)`);
  process.exit(1);
}

console.log('[verify-plan-migration-ids] OK', `(${MANDATORY_ID_SUFFIXES.join(', ')})`);
