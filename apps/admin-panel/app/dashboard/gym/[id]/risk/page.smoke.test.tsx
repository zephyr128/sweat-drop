import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/lib/auth-guard', () => ({
  requireGymAccess: vi.fn(async () => ({ id: 'u1', role: 'gym_owner' })),
}));

vi.mock('@/lib/actions/risk-economy-actions', () => ({
  getGymRiskDashboard: vi.fn(async () => ({
    success: true,
    data: {
      summary: { unresolvedEvents: 0, flaggedUsers: 0, suspiciousSessions: 0, suspiciousRedemptions: 0 },
      flaggedUsers: [],
      events: [],
      suspiciousSessions: [],
      suspiciousRedemptions: [],
      backendNotes: null,
    },
  })),
}));

import Page from './page';

describe('risk page smoke', () => {
  it('smoke: renders risk page', async () => {
    const ui = await Page({ params: Promise.resolve({ id: 'gym-1' }) });
    const html = renderToStaticMarkup(ui);
    expect(html).toContain('Safety &amp; Fair Play');
  });
});

