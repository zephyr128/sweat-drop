const {
  getSuites,
  runSuite,
  nowStamp,
  buildReport,
  writeReportArtifacts,
} = require('./lib.cjs');

const suiteOrder = ['db', 'mobile', 'admin', 'e2e'];
const suites = getSuites().filter((suite) => suiteOrder.includes(suite.id));
const suiteMap = new Map(suites.map((suite) => [suite.id, suite]));
const orderedSuites = suiteOrder.map((id) => suiteMap.get(id)).filter(Boolean);

const results = [];
let failFastTriggered = false;
for (const suite of orderedSuites) {
  if (failFastTriggered) {
    results.push({
      id: suite.id,
      displayName: suite.displayName,
      critical: suite.critical,
      owner: suite.owner,
      status: 'skipped',
      commands: [],
    });
    continue;
  }

  const result = runSuite(suite);
  results.push(result);
  if (result.status === 'failed' && suite.critical) {
    failFastTriggered = true;
  }
}

const timestamp = nowStamp();
const report = buildReport(results, { failFast: true });
const artifacts = writeReportArtifacts(report, timestamp);

console.log(`Report JSON: ${artifacts.jsonPath}`);
console.log(`Report MD: ${artifacts.mdPath}`);
console.log(`Release gate: ${report.releaseGate}`);

process.exit(report.releaseGate === 'GO' ? 0 : 1);
