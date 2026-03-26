const { getSuites, runSuite } = require('./lib.cjs');

const smokeOrder = ['db', 'e2e'];
const suites = getSuites().filter((suite) => smokeOrder.includes(suite.id));
const suiteMap = new Map(suites.map((suite) => [suite.id, suite]));
const ordered = smokeOrder.map((suiteId) => suiteMap.get(suiteId)).filter(Boolean);

for (const suite of ordered) {
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
  console.log(`[suite:${suite.id}] ${result.status}`);
  if (result.status !== 'passed') {
    process.exit(1);
  }
}

console.log('Smoke suites passed.');
