const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const seedSql = path.join(ROOT_DIR, 'backend', 'supabase', 'fixtures', 'seed_test_data.sql');

if (!fs.existsSync(seedSql)) {
  console.error(`Missing seed fixture: ${seedSql}`);
  process.exit(1);
}

console.log('Fixture seed script is ready.');
console.log(`SQL file: ${seedSql}`);
console.log('Run with your DB client in CI/local setup to apply deterministic test data.');
