const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');

const requiredAdminArtifacts = [
  'apps/admin-panel/app/dashboard/gym/[id]/risk/page.tsx',
  'apps/admin-panel/app/dashboard/gym/[id]/economy/page.tsx',
  'apps/admin-panel/app/dashboard/super/risk/page.tsx',
  'apps/admin-panel/lib/actions/risk-economy-actions.ts',
];

const missing = requiredAdminArtifacts.filter(
  (filePath) => !fs.existsSync(path.join(ROOT_DIR, filePath))
);

if (missing.length > 0) {
  console.error('Admin smoke prerequisites missing:');
  for (const filePath of missing) {
    console.error(`- ${filePath}`);
  }
  process.exit(1);
}

console.log('Admin smoke prerequisites passed.');
