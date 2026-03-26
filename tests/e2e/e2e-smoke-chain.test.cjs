const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT_DIR, relativePath), 'utf8');
}

test('critical chain prerequisites exist', () => {
  const required = [
    'scripts/testing/run-ci.cjs',
    'scripts/testing/lib.cjs',
    'backend/supabase/fixtures/seed_test_data.sql',
    'backend/supabase/fixtures/cleanup_test_data.sql',
    'apps/mobile-app/tests/workout-flow.integration.test.ts',
    'apps/admin-panel/app/dashboard/gym/[id]/risk/page.smoke.test.tsx',
  ];

  for (const relPath of required) {
    const absolutePath = path.join(ROOT_DIR, relPath);
    assert.equal(fs.existsSync(absolutePath), true, `missing prerequisite: ${relPath}`);
  }
});

test('root package scripts expose full orchestration contract', () => {
  const packageJson = JSON.parse(read('package.json'));
  const scripts = packageJson.scripts || {};
  const requiredScripts = ['test:db', 'test:mobile', 'test:admin', 'test:e2e', 'test:smoke', 'test:ci'];

  for (const scriptName of requiredScripts) {
    assert.equal(Boolean(scripts[scriptName]), true, `missing script: ${scriptName}`);
  }
});
