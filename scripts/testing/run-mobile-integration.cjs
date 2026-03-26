const path = require('path');
const { spawnSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const MOBILE_DIR = path.join(ROOT_DIR, 'apps', 'mobile-app');

const result = spawnSync('node', ['--import', 'tsx', '--test', 'tests/**/*.test.ts'], {
  cwd: MOBILE_DIR,
  encoding: 'utf8',
  stdio: 'pipe',
});

if (result.stdout) {
  process.stdout.write(result.stdout);
}
if (result.stderr) {
  process.stderr.write(result.stderr);
}

process.exit(typeof result.status === 'number' ? result.status : 1);
