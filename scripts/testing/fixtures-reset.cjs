const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const cleanupSql = path.join(ROOT_DIR, 'backend', 'supabase', 'fixtures', 'cleanup_test_data.sql');

if (!fs.existsSync(cleanupSql)) {
  console.error(`Missing cleanup fixture: ${cleanupSql}`);
  process.exit(1);
}

console.log('Fixture reset script is ready.');
console.log(`SQL file: ${cleanupSql}`);
console.log('Run with your DB client in CI/local setup to execute cleanup deterministically.');
