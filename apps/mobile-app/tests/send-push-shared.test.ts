import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePushRequest } from '../../../backend/supabase/functions/_shared/send-push-request.ts';
import {
  PUSH_BODY_LIMITS,
  summarizeExpoTickets,
} from '../../../backend/supabase/functions/_shared/expo-push.ts';

test('parsePushRequest: rejects non-object body', () => {
  const r = parsePushRequest(null);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /object/);
});

test('parsePushRequest: tokens must be array', () => {
  const r = parsePushRequest({ tokens: 'x', title: 't', body: 'b' });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /array/);
});

test('parsePushRequest: title and body must be strings', () => {
  const r = parsePushRequest({ tokens: [], title: 1, body: 'b' });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /strings/);
});

test('parsePushRequest: enforces max body length', () => {
  const r = parsePushRequest({
    tokens: [],
    title: 't',
    body: 'x'.repeat(PUSH_BODY_LIMITS.maxBodyLen + 1),
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /max length/);
});

test('parsePushRequest: enforces max token count', () => {
  const r = parsePushRequest({
    tokens: new Array(PUSH_BODY_LIMITS.maxTokensPerRequest + 1).fill('ExponentPushToken[x]'),
    title: 't',
    body: 'b',
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /exceeds max/);
});

test('parsePushRequest: data must be plain object when provided', () => {
  const r = parsePushRequest({ tokens: [], title: 't', body: 'b', data: [] });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /plain object/);
});

test('parsePushRequest: coerces tokens to strings only', () => {
  const r = parsePushRequest({
    tokens: ['ExponentPushToken[a]', 1, null, 'ExponentPushToken[b]'],
    title: 't',
    body: 'b',
  });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.deepEqual(r.value.tokens, ['ExponentPushToken[a]', 'ExponentPushToken[b]']);
  }
});

test('parsePushRequest: truncates client_ref', () => {
  const long = 'c'.repeat(80);
  const r = parsePushRequest({ tokens: [], title: 't', body: 'b', client_ref: long });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.client_ref?.length, 64);
});

test('parsePushRequest: include_raw_batches only when true', () => {
  const f = parsePushRequest({
    tokens: [],
    title: 't',
    body: 'b',
    include_raw_batches: false,
  });
  assert.equal(f.ok, true);
  if (f.ok) assert.equal(f.value.include_raw_batches, false);

  const t = parsePushRequest({
    tokens: [],
    title: 't',
    body: 'b',
    include_raw_batches: true,
  });
  assert.equal(t.ok, true);
  if (t.ok) assert.equal(t.value.include_raw_batches, true);
});

test('summarizeExpoTickets: counts ok vs error', () => {
  const s = summarizeExpoTickets({
    data: [
      { status: 'ok' },
      { status: 'error', message: 'DeviceNotRegistered' },
      { status: 'ok' },
    ],
  });
  assert.equal(s.receipt_ok, 2);
  assert.equal(s.receipt_error, 1);
  assert.ok(s.error_messages.length >= 1);
});

test('summarizeExpoTickets: missing data array', () => {
  const s = summarizeExpoTickets({ errors: [{ code: 'TEST' }] });
  assert.equal(s.receipt_ok, 0);
  assert.equal(s.receipt_error, 0);
  assert.ok(s.error_messages.some((m) => m.includes('TEST') || m.includes('errors')));
});

test('summarizeExpoTickets: invalid top-level shape', () => {
  const s = summarizeExpoTickets('not-json');
  assert.equal(s.receipt_ok, 0);
  assert.ok(s.error_messages.includes('invalid_expo_response_shape'));
});
