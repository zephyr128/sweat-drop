#!/usr/bin/env node
/**
 * Read-only: ensures mobile/admin .env.example templates exist and document
 * required variable names (no remote DB, no reading real .env).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

/** Must appear as a non-comment assignment line: KEY=... */
const MOBILE_ENV_EXAMPLE_KEYS = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_APP_ENV',
  'EXPO_PUBLIC_PUSH_ENABLED',
  'EXPO_PUBLIC_EAS_PROJECT_ID',
  'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
  'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID',
  'EXPO_PUBLIC_TERMS_URL',
  'EXPO_PUBLIC_PRIVACY_URL',
];

const ADMIN_ENV_EXAMPLE_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_APP_URL',
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL',
];

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertKeysInEnvExample(relativePath, keys) {
  const full = path.join(ROOT, relativePath);
  if (!fs.existsSync(full)) {
    return [`missing file: ${relativePath}`];
  }
  const text = fs.readFileSync(full, 'utf8');
  const errors = [];
  for (const key of keys) {
    const re = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`, 'm');
    if (!re.test(text)) {
      errors.push(`${relativePath}: template must document ${key}=`);
    }
  }
  return errors;
}

const errors = [
  ...assertKeysInEnvExample('apps/mobile-app/.env.example', MOBILE_ENV_EXAMPLE_KEYS),
  ...assertKeysInEnvExample('apps/admin-panel/.env.example', ADMIN_ENV_EXAMPLE_KEYS),
];

if (errors.length > 0) {
  console.error('[verify-env-example-templates] FAILED');
  for (const e of errors) {
    console.error(`- ${e}`);
  }
  process.exit(1);
}

console.log('[verify-env-example-templates] OK (mobile + admin .env.example)');
