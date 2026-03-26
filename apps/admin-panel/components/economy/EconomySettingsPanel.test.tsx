// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('./DropCalculatorPreview', () => ({
  DropCalculatorPreview: () => <div data-testid="drop-calculator-preview" />,
}));

vi.mock('@/lib/actions/economy-actions', async () => {
  const actual = await vi.importActual('@/lib/actions/economy-actions');
  return {
    ...actual,
    updateEconomyConfig: vi.fn(async () => ({ success: true })),
  };
});

import { updateEconomyConfig } from '@/lib/actions/economy-actions';
import { EconomySettingsPanel } from './EconomySettingsPanel';

const baseConfig = {
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
  dropsPerRsd: 2.0,
  currencyCode: 'RSD',
  bandEnforcementMode: 'warn' as const,
};

const baseSummary = {
  burnMintRatio: 0.3,
  top1SharePct: 10,
  minted30d: 1000,
  burned30d: 300,
  capHitRate7d: 0.2,
  risk: 'green' as const,
  riskLabel: 'Stable',
};

describe('EconomySettingsPanel', () => {
  const guardrailWithDiscount = {
    id: 'r1',
    name: 'Coffee Reward',
    rewardType: 'coffee',
    priceDrops: 160,
    normalizedDrops: 200,
    minRecommended: 120,
    maxRecommended: 220,
    inBand: true,
    complianceReason: 'in_band_discount_normalized',
    priceCalcMode: 'discount_from_rsd' as const,
    basePriceRsd: 200,
    discountPercent: 20,
    finalPriceRsdSnapshot: 160,
  };

  it('renders all MVP sections with correct headings', async () => {
    render(
      <EconomySettingsPanel
        gymId="gym-1"
        config={baseConfig}
        defaults={baseConfig}
        draftExists={false}
        guardrails={[guardrailWithDiscount]}
        summary={baseSummary}
      />,
    );

    expect(await screen.findByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Economy Health')).toBeInTheDocument();
    expect(screen.getByText('Calibration Wizard')).toBeInTheDocument();
    expect(screen.getByText('Earning Limits')).toBeInTheDocument();
    expect(screen.getByText('Store Pricing Bands')).toBeInTheDocument();
    expect(screen.getByText('Drop Calculator')).toBeInTheDocument();
    expect(screen.getByText('Store Compliance')).toBeInTheDocument();
    expect(screen.getByTestId('drop-calculator-preview')).toBeInTheDocument();
    expect(screen.queryByText('Advanced Mode')).not.toBeInTheDocument();
  });

  it('discounted reward normalizing into band shows OK (discount)', () => {
    render(
      <EconomySettingsPanel
        gymId="gym-1"
        config={baseConfig}
        defaults={baseConfig}
        draftExists={false}
        guardrails={[guardrailWithDiscount]}
        summary={baseSummary}
      />,
    );

    expect(screen.getByText('OK (discount)')).toBeInTheDocument();
    expect(screen.getByText('−20%')).toBeInTheDocument();
    expect(screen.getByText('discount-normalized')).toBeInTheDocument();
    expect(screen.queryByText('Below band')).not.toBeInTheDocument();
    expect(screen.queryByText('Above band')).not.toBeInTheDocument();
  });

  it('manual reward below band shows Below band', () => {
    render(
      <EconomySettingsPanel
        gymId="gym-1"
        config={baseConfig}
        defaults={baseConfig}
        draftExists={false}
        guardrails={[{
          id: 'r2', name: 'Cheap Coffee', rewardType: 'coffee', priceDrops: 50,
          normalizedDrops: 50, minRecommended: 120, maxRecommended: 220,
          inBand: false, complianceReason: 'below_band_min',
          priceCalcMode: 'manual_drops' as const, basePriceRsd: null, discountPercent: null, finalPriceRsdSnapshot: null,
        }]}
        summary={baseSummary}
      />,
    );

    expect(screen.getByText('Below band (warning)')).toBeInTheDocument();
    expect(screen.getByText('1 out of band')).toBeInTheDocument();
  });

  it('missing discount fields fallback treats as manual', () => {
    render(
      <EconomySettingsPanel
        gymId="gym-1"
        config={baseConfig}
        defaults={baseConfig}
        draftExists={false}
        guardrails={[{
          id: 'r3', name: 'Legacy Coffee', rewardType: 'coffee', priceDrops: 180,
          normalizedDrops: 180, minRecommended: 120, maxRecommended: 220,
          inBand: true, complianceReason: 'in_band',
          priceCalcMode: 'manual_drops' as const, basePriceRsd: null, discountPercent: null, finalPriceRsdSnapshot: null,
        }]}
        summary={baseSummary}
      />,
    );

    expect(screen.getByText('OK')).toBeInTheDocument();
    expect(screen.getByText('direct')).toBeInTheDocument();
    expect(screen.queryByText('Below band')).not.toBeInTheDocument();
    expect(screen.queryByText('Above band')).not.toBeInTheDocument();
  });

  it('save sends updated caps payload values with conversion', async () => {
    vi.mocked(updateEconomyConfig).mockResolvedValue({ success: true } as any);
    render(
      <EconomySettingsPanel
        gymId="gym-1"
        config={baseConfig}
        defaults={baseConfig}
        draftExists={false}
        guardrails={[]}
        summary={baseSummary}
      />,
    );

    fireEvent.change(screen.getByLabelText('Per session'), { target: { value: '130' } });
    fireEvent.change(screen.getByLabelText('Per day'), { target: { value: '340' } });
    fireEvent.change(screen.getByLabelText('Per week'), { target: { value: '1800' } });
    fireEvent.change(screen.getByLabelText('Rewarded sessions / day'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Economy Settings/i }));

    await waitFor(() => {
      expect(vi.mocked(updateEconomyConfig)).toHaveBeenCalledWith(
        'gym-1',
        expect.objectContaining({
          maxDropsPerSession: 130,
          maxDropsPerDay: 340,
          maxDropsPerWeek: 1800,
          maxRewardedSessionsPerDay: 5,
          dropsPerRsd: 2.0,
          currencyCode: 'RSD',
        }),
        'publish',
      );
    });
  });

  it('calibration wizard renders and apply suggestions updates form', async () => {
    vi.mocked(updateEconomyConfig).mockResolvedValue({ success: true } as any);
    render(
      <EconomySettingsPanel
        gymId="gym-1"
        config={baseConfig}
        defaults={baseConfig}
        draftExists={false}
        guardrails={[]}
        summary={baseSummary}
      />,
    );

    expect(screen.getByText('Calibration Wizard')).toBeInTheDocument();
    expect(screen.getByText('Apply Suggestions')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Apply Suggestions'));
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Suggestions applied — review and save when ready');
    });
  });

  it('shows error toast when save fails', async () => {
    vi.mocked(updateEconomyConfig).mockResolvedValueOnce({ success: false, error: 'Failed save' } as any);

    render(
      <EconomySettingsPanel
        gymId="gym-1"
        config={baseConfig}
        defaults={baseConfig}
        draftExists={false}
        guardrails={[]}
        summary={{ ...baseSummary, risk: 'green' as const, riskLabel: 'Stable' }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Save Economy Settings/i }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });

  it('renders Reward Band Policy section with warn mode by default', () => {
    render(
      <EconomySettingsPanel
        gymId="gym-1"
        config={baseConfig}
        defaults={baseConfig}
        draftExists={false}
        guardrails={[]}
        summary={baseSummary}
      />,
    );

    expect(screen.getByText('Reward Band Policy')).toBeInTheDocument();
    expect(screen.getByText('Warn only')).toBeInTheDocument();
    expect(screen.getByText('Enforce strict band')).toBeInTheDocument();
    expect(screen.getByText('Recommended')).toBeInTheDocument();
  });

  it('compliance row shows Blocked when enforce mode is active', () => {
    render(
      <EconomySettingsPanel
        gymId="gym-1"
        config={{ ...baseConfig, bandEnforcementMode: 'enforce' as const }}
        defaults={baseConfig}
        draftExists={false}
        guardrails={[{
          id: 'r2', name: 'Cheap Coffee', rewardType: 'coffee', priceDrops: 50,
          normalizedDrops: 50, minRecommended: 120, maxRecommended: 220,
          inBand: false, complianceReason: 'below_band_min',
          priceCalcMode: 'manual_drops' as const, basePriceRsd: null, discountPercent: null, finalPriceRsdSnapshot: null,
        }]}
        summary={baseSummary}
      />,
    );

    expect(screen.getByText('Blocked')).toBeInTheDocument();
    expect(screen.getByText(/Out-of-band rewards are currently blocked/)).toBeInTheDocument();
  });

  it('save persists bandEnforcementMode', async () => {
    vi.mocked(updateEconomyConfig).mockResolvedValue({ success: true } as any);
    render(
      <EconomySettingsPanel
        gymId="gym-1"
        config={baseConfig}
        defaults={baseConfig}
        draftExists={false}
        guardrails={[]}
        summary={baseSummary}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Save Economy Settings/i }));
    await waitFor(() => {
      expect(vi.mocked(updateEconomyConfig)).toHaveBeenCalledWith(
        'gym-1',
        expect.objectContaining({ bandEnforcementMode: 'warn' }),
        'publish',
      );
    });
  });
});
