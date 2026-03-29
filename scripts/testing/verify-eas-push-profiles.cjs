#!/usr/bin/env node
/**
 * Ensures mobile EAS profiles are push-ready for release.
 * Checks development/preview/production profile env keys.
 */
const fs = require('fs');
const path = require('path');

const easPath = path.join(process.cwd(), 'apps', 'mobile-app', 'eas.json');

function fail(message) {
  console.error(`[verify-eas-push-profiles] ${message}`);
  process.exit(1);
}

if (!fs.existsSync(easPath)) {
  fail(`Missing file: ${easPath}`);
}

let eas;
try {
  eas = JSON.parse(fs.readFileSync(easPath, 'utf8'));
} catch (error) {
  fail(`Could not parse eas.json: ${error instanceof Error ? error.message : 'unknown error'}`);
}

const requiredProfiles = ['development', 'preview', 'production'];
const missing = [];

for (const profile of requiredProfiles) {
  const env = eas?.build?.[profile]?.env;
  if (!env || typeof env !== 'object') {
    missing.push(`${profile}: missing env block`);
    continue;
  }

  if (String(env.EXPO_PUBLIC_PUSH_ENABLED) !== 'true') {
    missing.push(`${profile}: EXPO_PUBLIC_PUSH_ENABLED must be "true"`);
  }

  const projectId = String(env.EXPO_PUBLIC_EAS_PROJECT_ID || '').trim();
  if (!projectId) {
    missing.push(`${profile}: EXPO_PUBLIC_EAS_PROJECT_ID is missing`);
  }
}

if (missing.length > 0) {
  fail(`Failed checks:\n- ${missing.join('\n- ')}`);
}

console.log('[verify-eas-push-profiles] OK');
