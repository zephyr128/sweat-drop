const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const migrationsDir = path.join(ROOT_DIR, 'backend', 'supabase', 'migrations');
const fixtureSeed = path.join(ROOT_DIR, 'backend', 'supabase', 'fixtures', 'seed_test_data.sql');
const fixtureCleanup = path.join(ROOT_DIR, 'backend', 'supabase', 'fixtures', 'cleanup_test_data.sql');

test('critical RPC references exist in migrations', () => {
  const required = [
    'award_drops',
    'claim_reward',
    'perform_checkin',
    'lock_machine',
    'unlock_machine',
    'update_machine_heartbeat',
  ];

  const files = fs.readdirSync(migrationsDir).filter((name) => name.endsWith('.sql'));
  const merged = files
    .map((fileName) => fs.readFileSync(path.join(migrationsDir, fileName), 'utf8'))
    .join('\n');

  for (const symbol of required) {
    assert.equal(
      merged.includes(symbol),
      true,
      `expected migration references for ${symbol}`
    );
  }
});

test('fixtures include deterministic identifiers and teardown deletes them', () => {
  const seed = fs.readFileSync(fixtureSeed, 'utf8');
  const cleanup = fs.readFileSync(fixtureCleanup, 'utf8');
  const fixtureIds = [
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000001',
  ];

  for (const id of fixtureIds) {
    assert.equal(seed.includes(id), true, `expected seed fixture id ${id}`);
    assert.equal(cleanup.includes(id), true, `expected cleanup fixture id ${id}`);
  }
});
