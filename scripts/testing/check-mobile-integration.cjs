const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');

const requiredMobileArtifacts = [
  'apps/mobile-app/lib/workout/workout-simulator.ts',
  'apps/mobile-app/app/workout.tsx',
  'apps/mobile-app/app/session-summary.tsx',
  'apps/mobile-app/lib/security/deviceFingerprint.ts',
];

const missing = requiredMobileArtifacts.filter(
  (filePath) => !fs.existsSync(path.join(ROOT_DIR, filePath))
);

if (missing.length > 0) {
  console.error('Mobile integration smoke prerequisites missing:');
  for (const filePath of missing) {
    console.error(`- ${filePath}`);
  }
  process.exit(1);
}

console.log('Mobile integration smoke prerequisites passed.');
