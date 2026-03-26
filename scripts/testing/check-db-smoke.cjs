const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');

const requiredFiles = [
  'backend/supabase/fixtures/README.md',
  'backend/supabase/fixtures/seed_test_data.sql',
  'backend/supabase/fixtures/cleanup_test_data.sql',
];

const requiredKeywords = [
  'award_drops',
  'claim_reward',
  'perform_checkin',
  'lock_machine',
  'unlock_machine',
  'update_machine_heartbeat',
];

function fileContains(filePath, keyword) {
  const fullPath = path.join(ROOT_DIR, filePath);
  if (!fs.existsSync(fullPath)) {
    return false;
  }
  const content = fs.readFileSync(fullPath, 'utf8');
  return content.includes(keyword);
}

function migrationContainsKeyword(keyword) {
  const migrationDir = path.join(ROOT_DIR, 'backend', 'supabase', 'migrations');
  if (!fs.existsSync(migrationDir)) {
    return false;
  }
  const migrations = fs.readdirSync(migrationDir).filter((name) => name.endsWith('.sql'));
  for (const migration of migrations) {
    const content = fs.readFileSync(path.join(migrationDir, migration), 'utf8');
    if (content.includes(keyword)) {
      return true;
    }
  }
  return false;
}

const missingFiles = requiredFiles.filter((filePath) => !fs.existsSync(path.join(ROOT_DIR, filePath)));
if (missingFiles.length > 0) {
  console.error('Missing fixture files:');
  for (const filePath of missingFiles) {
    console.error(`- ${filePath}`);
  }
  process.exit(1);
}

const missingKeywords = requiredKeywords.filter((keyword) => !migrationContainsKeyword(keyword));
if (missingKeywords.length > 0) {
  console.error('Missing required RPC references in migrations:');
  for (const keyword of missingKeywords) {
    console.error(`- ${keyword}`);
  }
  process.exit(1);
}

if (!fileContains('backend/supabase/fixtures/seed_test_data.sql', 'INSERT')) {
  console.error('seed_test_data.sql must contain INSERT statements.');
  process.exit(1);
}

if (!fileContains('backend/supabase/fixtures/cleanup_test_data.sql', 'DELETE')) {
  console.error('cleanup_test_data.sql must contain DELETE statements.');
  process.exit(1);
}

console.log('DB smoke checks passed.');
