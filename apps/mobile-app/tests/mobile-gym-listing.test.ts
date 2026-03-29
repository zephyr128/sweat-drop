import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PG_UNDEFINED_COLUMN,
  shouldRetryGymsWithoutColumnFilter,
} from '../lib/mobileGymListing';

test('mobile listing: 42703 triggers unfiltered retry', () => {
  assert.equal(PG_UNDEFINED_COLUMN, '42703');
  assert.equal(shouldRetryGymsWithoutColumnFilter({ code: '42703' }), true);
});

test('mobile listing: other errors do not trigger column-missing retry', () => {
  assert.equal(shouldRetryGymsWithoutColumnFilter({ code: 'PGRST116' }), false);
  assert.equal(shouldRetryGymsWithoutColumnFilter(null), false);
  assert.equal(shouldRetryGymsWithoutColumnFilter(undefined), false);
});
