import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/lib/auth-guard', () => ({
  requireGymAccess: vi.fn(async () => ({ id: 'u1', role: 'gym_owner' })),
}));

vi.mock('@/lib/actions/economy-actions', async () => {
  const actual = await vi.importActual('@/lib/actions/economy-actions');
  return {
    ...actual,
    getEconomyConfig: vi.fn(async () => ({
    success: true,
    data: {
      config: {
        maxDropsPerSession: 120,
        maxDropsPerDay: 300,
        maxDropsPerWeek: 1500,
        maxRewardedSessionsPerDay: 4,
        maxCheckinDropsPerDay: 1,
        diminishing: {
          fullRateUntilMin: 45,
          reducedRateUntilMin: 90,
          lowRateUntilMin: 120,
          postLimitFactor: 0.4,
        },
        machineBase: {
          treadmill: { baseRatePerMin: 1.4, targetIntensityFactor: 1.1, highIntensityFactor: 1.28, maxIntensityFactor: 1.55 },
          bike: { baseRatePerMin: 1.2, targetIntensityFactor: 1.05, highIntensityFactor: 1.25, maxIntensityFactor: 1.45 },
          elliptical: { baseRatePerMin: 1.3, targetIntensityFactor: 1.08, highIntensityFactor: 1.24, maxIntensityFactor: 1.46 },
          stepper: { baseRatePerMin: 1.25, targetIntensityFactor: 1.06, highIntensityFactor: 1.22, maxIntensityFactor: 1.42 },
          generic: { baseRatePerMin: 1, targetIntensityFactor: 1, highIntensityFactor: 1.1, maxIntensityFactor: 1.2 },
        },
        priceBandJson: {},
      },
      summary: {
        burnMintRatio: 0.3,
        top1SharePct: 10,
        minted30d: 1000,
        burned30d: 300,
        capHitRate7d: 0.2,
        risk: 'green',
        riskLabel: 'Stable',
      },
      defaults: {
        maxDropsPerSession: 120,
        maxDropsPerDay: 300,
        maxDropsPerWeek: 1500,
        maxRewardedSessionsPerDay: 4,
        maxCheckinDropsPerDay: 1,
        diminishing: {
          fullRateUntilMin: 45,
          reducedRateUntilMin: 90,
          lowRateUntilMin: 120,
          postLimitFactor: 0.4,
        },
        machineBase: {
          treadmill: { baseRatePerMin: 1.4, targetIntensityFactor: 1.1, highIntensityFactor: 1.28, maxIntensityFactor: 1.55 },
          bike: { baseRatePerMin: 1.2, targetIntensityFactor: 1.05, highIntensityFactor: 1.25, maxIntensityFactor: 1.45 },
          elliptical: { baseRatePerMin: 1.3, targetIntensityFactor: 1.08, highIntensityFactor: 1.24, maxIntensityFactor: 1.46 },
          stepper: { baseRatePerMin: 1.25, targetIntensityFactor: 1.06, highIntensityFactor: 1.22, maxIntensityFactor: 1.42 },
          generic: { baseRatePerMin: 1, targetIntensityFactor: 1, highIntensityFactor: 1.1, maxIntensityFactor: 1.2 },
        },
        priceBandJson: {},
      },
      draftExists: false,
      guardrails: [],
    },
    })),
  };
});

import Page from './page';

describe('economy page smoke', () => {
  it('smoke: renders economy settings page', async () => {
    const ui = await Page({ params: Promise.resolve({ id: 'gym-1' }) });
    const html = renderToStaticMarkup(ui);
    expect(html).toContain('Economy Settings');
  });
});

