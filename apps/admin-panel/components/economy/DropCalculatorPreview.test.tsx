// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/actions/economy-actions', () => ({
  previewDropCalculation: vi.fn(async () => ({
    success: true,
    data: {
      expectedRawDrops: 210,
      adjustedDrops: 180,
      reducedByDiminishing: 30,
      appliedCap: 'none',
      finalDrops: 180,
      explanation: ['High intensity sustained bonus applied', 'Short spike ignored by anti-spike filter'],
      source: 'mock',
    },
  })),
}));

import { DropCalculatorPreview } from './DropCalculatorPreview';

const baseConfig = {
  maxDropsPerSession: 120,
  maxDropsPerDay: 300,
  maxDropsPerWeek: 1500,
  maxRewardedSessionsPerDay: 4,
  maxCheckinDropsPerDay: 1,
  dropsPerRsd: 2.0,
  currencyCode: 'RSD',
  bandEnforcementMode: 'warn' as const,
  diminishing: { fullRateUntilMin: 45, reducedRateUntilMin: 90, lowRateUntilMin: 120, postLimitFactor: 0.4 },
  machineBase: {
    treadmill: { baseRatePerMin: 1.4, targetIntensityFactor: 1.1, highIntensityFactor: 1.2, maxIntensityFactor: 1.5 },
    bike: { baseRatePerMin: 1.2, targetIntensityFactor: 1.1, highIntensityFactor: 1.2, maxIntensityFactor: 1.4 },
    elliptical: { baseRatePerMin: 1.2, targetIntensityFactor: 1.1, highIntensityFactor: 1.2, maxIntensityFactor: 1.4 },
    stepper: { baseRatePerMin: 1.2, targetIntensityFactor: 1.1, highIntensityFactor: 1.2, maxIntensityFactor: 1.4 },
    generic: { baseRatePerMin: 1, targetIntensityFactor: 1, highIntensityFactor: 1.1, maxIntensityFactor: 1.2 },
  },
  priceBandJson: {},
};

describe('DropCalculatorPreview', () => {
  it('renders and maps preview output', async () => {
    render(<DropCalculatorPreview gymId="gym-1" config={baseConfig} />);

    fireEvent.click(screen.getByRole('button', { name: /Calculate Drops/i }));

    await waitFor(() => {
      expect(screen.getByText('Raw drops')).toBeInTheDocument();
      expect(screen.getByText('210')).toBeInTheDocument();
      expect(screen.getByText(/Short spike ignored by anti-spike filter/i)).toBeInTheDocument();
    });
  });

  it('applies current session cap from config to preview output', async () => {
    const { rerender } = render(
      <DropCalculatorPreview gymId="gym-1" config={{ ...baseConfig, maxDropsPerSession: 392 }} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Calculate Drops/i }));
    await waitFor(() => {
      expect(screen.getByText('Not hit')).toBeInTheDocument();
      expect(screen.getByText('drops earned')).toBeInTheDocument();
    });

    rerender(
      <DropCalculatorPreview gymId="gym-1" config={{ ...baseConfig, maxDropsPerSession: 60 }} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Applied (60)')).toBeInTheDocument();
      const hero = screen.getByText('drops earned').previousElementSibling;
      expect(hero).toHaveTextContent('60');
    });
  });
});
