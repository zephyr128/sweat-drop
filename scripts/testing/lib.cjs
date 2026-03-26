const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const REPORTS_DIR = path.join(ROOT_DIR, 'docs', 'test-reports');

function nowStamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    '_',
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
  ].join('');
}

function runCommand(command, args, options = {}) {
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const result = spawnSync(command, args, {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    stdio: 'pipe',
    shell: false,
    ...options,
  });
  const endedAt = new Date().toISOString();
  return {
    command: [command, ...args].join(' '),
    exitCode: typeof result.status === 'number' ? result.status : 1,
    durationMs: Date.now() - started,
    startedAt,
    endedAt,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    signal: result.signal || null,
  };
}

function getSuites() {
  return [
    {
      id: 'db',
      displayName: 'DB/RPC Contract Smoke',
      critical: true,
      owner: 'supabase-dba',
      commands: [
        ['node', ['scripts/testing/check-db-smoke.cjs']],
        ['node', ['--test', 'tests/db/db-contract-smoke.test.cjs']],
      ],
    },
    {
      id: 'mobile',
      displayName: 'Mobile Integration Smoke (simulator hooks)',
      critical: false,
      owner: 'mobile-coder',
      commands: [
        ['node', ['scripts/testing/check-mobile-integration.cjs']],
        ['node', ['scripts/testing/run-mobile-integration.cjs']],
      ],
    },
    {
      id: 'admin',
      displayName: 'Admin Smoke (actions + UI routes)',
      critical: false,
      owner: 'admin-coder',
      commands: [
        ['node', ['scripts/testing/check-admin-smoke.cjs']],
        ['pnpm', ['--filter', 'sweatdrop-admin-panel', 'test:smoke']],
        ['pnpm', ['--filter', 'sweatdrop-admin-panel', 'test:actions']],
      ],
    },
    {
      id: 'e2e',
      displayName: 'E2E Smoke Gate',
      critical: true,
      owner: 'admin-coder',
      commands: [
        ['node', ['scripts/testing/check-e2e-smoke.cjs']],
        ['node', ['--test', 'tests/e2e/e2e-smoke-chain.test.cjs']],
      ],
    },
  ];
}

function runSuite(suite) {
  const commandResults = [];
  let status = 'passed';
  for (const [command, args] of suite.commands) {
    const result = runCommand(command, args);
    commandResults.push(result);
    if (result.exitCode !== 0) {
      status = 'failed';
      break;
    }
  }
  return {
    id: suite.id,
    displayName: suite.displayName,
    critical: suite.critical,
    owner: suite.owner,
    status,
    commands: commandResults,
  };
}

function ensureReportsDir() {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

function summarizeSuites(suiteResults) {
  const total = suiteResults.length;
  const passed = suiteResults.filter((s) => s.status === 'passed').length;
  const failed = suiteResults.filter((s) => s.status === 'failed').length;
  const skipped = suiteResults.filter((s) => s.status === 'skipped').length;
  return { total, passed, failed, skipped };
}

function buildCriticalStatus(suiteResults) {
  const critical = suiteResults.filter((suite) => suite.critical);
  return critical.map((suite) => ({
    suite: suite.id,
    status: suite.status,
    owner: suite.owner,
  }));
}

function buildBlockers(suiteResults) {
  return suiteResults
    .filter((suite) => suite.status === 'failed')
    .map((suite) => {
      const lastCommand = suite.commands[suite.commands.length - 1];
      return {
        suite: suite.id,
        reason: `Command failed: ${lastCommand.command}`,
        owner: suite.owner,
      };
    });
}

function buildReport(suiteResults, options = {}) {
  const summary = summarizeSuites(suiteResults);
  const criticalSuiteStatus = buildCriticalStatus(suiteResults);
  const blockers = buildBlockers(suiteResults);
  const criticalFailures = blockers.filter((blocker) =>
    criticalSuiteStatus.some(
      (criticalEntry) =>
        criticalEntry.suite === blocker.suite && criticalEntry.status !== 'passed'
    )
  );
  const failedCritical = criticalSuiteStatus.some((entry) => entry.status !== 'passed');
  const hasE2eFailure = suiteResults.some((entry) => entry.id === 'e2e' && entry.status !== 'passed');
  const releaseGate = failedCritical || hasE2eFailure ? 'NO-GO' : 'GO';

  return {
    generatedAt: new Date().toISOString(),
    releaseGate,
    summary,
    criticalSuiteStatus,
    criticalFailures,
    flakyTests: [],
    blockers,
    failFast: Boolean(options.failFast),
    suites: suiteResults,
  };
}

function writeReportArtifacts(report, timestamp) {
  ensureReportsDir();
  const jsonPath = path.join(REPORTS_DIR, `${timestamp}.json`);
  const mdPath = path.join(REPORTS_DIR, `${timestamp}.md`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(mdPath, renderMarkdownReport(report, timestamp), 'utf8');
  return { jsonPath, mdPath };
}

function renderMarkdownReport(report, timestamp) {
  const lines = [];
  lines.push('# SWEATDROP Test Run Report');
  lines.push('');
  lines.push(`- Run ID: \`${timestamp}\``);
  lines.push(`- Generated At: \`${report.generatedAt}\``);
  lines.push(`- Release Gate: **${report.releaseGate}**`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- total: ${report.summary.total}`);
  lines.push(`- pass: ${report.summary.passed}`);
  lines.push(`- fail: ${report.summary.failed}`);
  lines.push(`- skipped: ${report.summary.skipped}`);
  lines.push('');
  lines.push('## Critical Suite Status');
  lines.push('');
  for (const critical of report.criticalSuiteStatus) {
    lines.push(`- ${critical.suite}: ${critical.status} (owner: ${critical.owner})`);
  }
  lines.push('');
  lines.push('## Flaky Tests');
  lines.push('');
  if (report.flakyTests.length === 0) {
    lines.push('- none detected');
  } else {
    for (const flaky of report.flakyTests) {
      lines.push(`- ${flaky}`);
    }
  }
  lines.push('');
  lines.push('## Critical Failures');
  lines.push('');
  if (report.criticalFailures.length === 0) {
    lines.push('- none');
  } else {
    for (const criticalFailure of report.criticalFailures) {
      lines.push(
        `- ${criticalFailure.suite}: ${criticalFailure.reason} (owner: ${criticalFailure.owner})`
      );
    }
  }
  lines.push('');
  lines.push('## Blockers');
  lines.push('');
  if (report.blockers.length === 0) {
    lines.push('- none');
  } else {
    for (const blocker of report.blockers) {
      lines.push(`- ${blocker.suite}: ${blocker.reason} (owner: ${blocker.owner})`);
    }
  }
  lines.push('');
  lines.push('## Suite Results');
  lines.push('');
  for (const suite of report.suites) {
    lines.push(`### ${suite.displayName} (\`${suite.id}\`)`);
    lines.push(`- status: ${suite.status}`);
    lines.push(`- critical: ${suite.critical}`);
    lines.push(`- owner: ${suite.owner}`);
    for (const command of suite.commands) {
      lines.push(`- command: \`${command.command}\``);
      lines.push(`  - exitCode: ${command.exitCode}`);
      lines.push(`  - durationMs: ${command.durationMs}`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

module.exports = {
  getSuites,
  runSuite,
  nowStamp,
  buildReport,
  writeReportArtifacts,
};
