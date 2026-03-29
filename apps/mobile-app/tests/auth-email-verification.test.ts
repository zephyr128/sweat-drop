import test from 'node:test';
import assert from 'node:assert/strict';
import type { User } from '@supabase/supabase-js';
import { shouldRequireEmailVerification } from '../lib/authEmailVerification';

function partialUser(p: Partial<User> & { identities?: User['identities'] }): User {
  return p as User;
}

test('shouldRequireEmailVerification: nullish or no email → false', () => {
  assert.equal(shouldRequireEmailVerification(null), false);
  assert.equal(shouldRequireEmailVerification(undefined), false);
  assert.equal(
    shouldRequireEmailVerification(partialUser({ email: undefined, identities: [{ provider: 'email' } as never] })),
    false,
  );
});

test('shouldRequireEmailVerification: confirmed email → false', () => {
  assert.equal(
    shouldRequireEmailVerification(
      partialUser({
        email: 'a@b.co',
        email_confirmed_at: '2026-01-01T00:00:00Z',
        identities: [{ provider: 'email' } as never],
      }),
    ),
    false,
  );
});

test('shouldRequireEmailVerification: empty identities + unconfirmed email → true (fail closed)', () => {
  assert.equal(
    shouldRequireEmailVerification(
      partialUser({
        email: 'a@b.co',
        identities: [],
      }),
    ),
    true,
  );
  assert.equal(
    shouldRequireEmailVerification(
      partialUser({
        email: 'a@b.co',
      }),
    ),
    true,
  );
});

test('shouldRequireEmailVerification: OAuth present → false', () => {
  for (const provider of ['google', 'apple'] as const) {
    assert.equal(
      shouldRequireEmailVerification(
        partialUser({
          email: 'a@b.co',
          identities: [
            { provider: 'email' } as never,
            { provider } as never,
          ],
        }),
      ),
      false,
    );
  }
});

test('shouldRequireEmailVerification: OAuth provider in app_metadata → false', () => {
  assert.equal(
    shouldRequireEmailVerification(
      partialUser({
        email: 'a@b.co',
        app_metadata: { provider: 'google' } as never,
      }),
    ),
    false,
  );
});

test('shouldRequireEmailVerification: email identity, unconfirmed → true', () => {
  assert.equal(
    shouldRequireEmailVerification(
      partialUser({
        email: 'a@b.co',
        email_confirmed_at: undefined,
        identities: [{ provider: 'email', identity_id: 'x' } as never],
      }),
    ),
    true,
  );
});

test('shouldRequireEmailVerification: non-email identities only + unconfirmed email → true', () => {
  assert.equal(
    shouldRequireEmailVerification(
      partialUser({
        email: 'a@b.co',
        identities: [{ provider: 'phone' } as never],
      }),
    ),
    true,
  );
});
