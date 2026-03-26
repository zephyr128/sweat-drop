const { getSuites, runSuite } = require('./lib.cjs');

const suiteId = process.argv[2];
if (!suiteId) {
  console.error('Usage: node scripts/testing/run-suite.cjs <db|mobile|admin|e2e>');
  process.exit(1);
}

const suite = getSuites().find((entry) => entry.id === suiteId);
if (!suite) {
  console.error(`Unknown suite: ${suiteId}`);
  process.exit(1);
}

const result = runSuite(suite);
for (const command of result.commands) {
  console.log(`$ ${command.command}`);
  if (command.stdout.trim()) {
    console.log(command.stdout.trim());
  }
  if (command.stderr.trim()) {
    console.error(command.stderr.trim());
  }
}

console.log(`[suite:${result.id}] ${result.status}`);
process.exit(result.status === 'passed' ? 0 : 1);
