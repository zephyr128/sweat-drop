import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyRewardClaimError } from '../lib/security/reward-claim-errors';

test('maps daily/weekly/monthly claim limit errors', () => {
  assert.equal(classifyRewardClaimError('already claimed once'), 'limit_once');
  assert.equal(classifyRewardClaimError('Daily limit reached'), 'limit_daily');
  assert.equal(classifyRewardClaimError('weekly limit reached for reward'), 'limit_weekly');
  assert.equal(classifyRewardClaimError('MONTHLY_LIMIT_EXCEEDED'), 'limit_monthly');
});

test('maps fraud and abuse blocked responses', () => {
  assert.equal(classifyRewardClaimError('Blocked by fraud engine'), 'fraud_blocked');
  assert.equal(classifyRewardClaimError('abuse risk detected'), 'fraud_blocked');
});

test('maps rate limit responses', () => {
  assert.equal(classifyRewardClaimError('429 Too many requests'), 'rate_limited');
  assert.equal(classifyRewardClaimError('rate limit exceeded'), 'rate_limited');
});

test('maps strict policy / out-of-band errors to temporarily_unavailable', () => {
  assert.equal(classifyRewardClaimError('out-of-band reward not allowed'), 'temporarily_unavailable');
  assert.equal(classifyRewardClaimError('reward out of band with strict enforcement'), 'temporarily_unavailable');
  assert.equal(classifyRewardClaimError('Strict policy violation'), 'temporarily_unavailable');
  assert.equal(classifyRewardClaimError('reward temporarily unavailable'), 'temporarily_unavailable');
  assert.equal(classifyRewardClaimError('redemption policy denied'), 'temporarily_unavailable');
});

test('unknown errors remain unknown', () => {
  assert.equal(classifyRewardClaimError('invalid reward id'), 'unknown');
  assert.equal(classifyRewardClaimError(''), 'unknown');
});
