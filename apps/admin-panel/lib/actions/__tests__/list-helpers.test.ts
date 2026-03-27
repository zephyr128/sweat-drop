import { describe, expect, it } from 'vitest';
import { sanitizeListInput, paginationMeta, rangeFromPage } from '../list-helpers';

describe('sanitizeListInput', () => {
  it('applies defaults when no input', () => {
    const result = sanitizeListInput();
    expect(result).toEqual({
      q: '',
      page: 1,
      limit: 25,
      sortBy: '',
      sortDir: 'desc',
      filters: {},
    });
  });

  it('clamps limit to max 100', () => {
    const result = sanitizeListInput({ limit: 500 });
    expect(result.limit).toBe(100);
  });

  it('clamps limit to min 1', () => {
    const result = sanitizeListInput({ limit: -5 });
    expect(result.limit).toBe(1);
  });

  it('clamps page to min 1', () => {
    const result = sanitizeListInput({ page: 0 });
    expect(result.page).toBe(1);
  });

  it('truncates search query to 200 chars', () => {
    const longQuery = 'a'.repeat(300);
    const result = sanitizeListInput({ q: longQuery });
    expect(result.q.length).toBe(200);
  });

  it('defaults sortDir to desc for invalid values', () => {
    const result = sanitizeListInput({ sortDir: 'invalid' as any });
    expect(result.sortDir).toBe('desc');
  });

  it('preserves asc sortDir', () => {
    const result = sanitizeListInput({ sortDir: 'asc' });
    expect(result.sortDir).toBe('asc');
  });

  it('passes through typed filters', () => {
    const result = sanitizeListInput({ filters: { status: 'active' } });
    expect(result.filters).toEqual({ status: 'active' });
  });
});

describe('paginationMeta', () => {
  it('computes totalPages correctly', () => {
    expect(paginationMeta(100, 1, 25)).toEqual({
      total: 100, page: 1, limit: 25, totalPages: 4,
    });
  });

  it('rounds up partial pages', () => {
    expect(paginationMeta(101, 1, 25).totalPages).toBe(5);
  });

  it('returns totalPages=1 for zero items', () => {
    expect(paginationMeta(0, 1, 25).totalPages).toBe(1);
  });

  it('handles exact multiples', () => {
    expect(paginationMeta(50, 1, 10).totalPages).toBe(5);
  });
});

describe('rangeFromPage', () => {
  it('returns correct range for page 1', () => {
    expect(rangeFromPage(1, 25)).toEqual({ from: 0, to: 24 });
  });

  it('returns correct range for page 3', () => {
    expect(rangeFromPage(3, 10)).toEqual({ from: 20, to: 29 });
  });

  it('handles limit of 1', () => {
    expect(rangeFromPage(5, 1)).toEqual({ from: 4, to: 4 });
  });
});
