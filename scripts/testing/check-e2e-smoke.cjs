const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const e2eDir = path.join(ROOT_DIR, 'tests', 'e2e');

if (!fs.existsSync(e2eDir)) {
  console.error('E2E smoke missing: tests/e2e directory does not exist.');
  process.exit(1);
}

const entries = fs
  .readdirSync(e2eDir)
  .filter((name) => /\.(test|spec)\.(js|cjs|mjs|ts|tsx)$/.test(name));

if (entries.length === 0) {
  console.error('E2E smoke missing: no *.test.* or *.spec.* files in tests/e2e.');
  process.exit(1);
}

console.log(`E2E smoke checks passed (${entries.length} spec files found).`);
