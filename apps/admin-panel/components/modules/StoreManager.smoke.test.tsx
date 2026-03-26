// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/actions/store-actions', () => ({
  createStoreItem: vi.fn(async () => ({ success: true, data: { id: 'new-id' } })),
  updateStoreItem: vi.fn(async () => ({ success: true, data: { id: 'item-1' } })),
  deleteStoreItem: vi.fn(async () => ({ success: true })),
  getStorePriceGuidance: vi.fn(async () => ({
    success: true,
    data: {
      coffee: { min: 120, max: 220 },
      physical: { min: 1, max: 100000 },
    },
  })),
}));

vi.mock('@/lib/actions/economy-actions', () => ({
  getGymConversionRate: vi.fn(async () => ({ success: true, dropsPerRsd: 2 })),
  getBandEnforcementMode: vi.fn(async () => ({ success: true, mode: 'warn' })),
}));

vi.mock('@/components/ui/ConfirmDialog', () => ({
  confirmAction: vi.fn(async () => true),
}));

vi.mock('@/lib/utils/storage', () => ({
  uploadFile: vi.fn(async () => ({ url: 'https://example.com/image.png' })),
}));

import { StoreManager } from './StoreManager';

describe('StoreManager smoke', () => {
  it('smoke: renders guardrail info and modal controls', async () => {
    render(
      <StoreManager
        gymId="gym-1"
        initialItems={[
          {
            id: 'item-1',
            name: 'Coffee Reward',
            description: 'desc',
            price_drops: 300,
            stock: 10,
            image_url: null,
            is_active: true,
            reward_type: 'coffee',
            redemption_limit: 'once_per_day',
          },
        ]}
      />,
    );

    expect(await screen.findByText(/Out of band/i)).toBeInTheDocument();
    expect(screen.getByText(/Daily/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /\+ Add Item/i }));
    expect(await screen.findByText('Add New Item')).toBeInTheDocument();
    expect(screen.getByText('Reward Category')).toBeInTheDocument();
    expect(screen.getByText('Redemption Limit')).toBeInTheDocument();

    const [rewardCategorySelect] = screen.getAllByRole('combobox');
    const priceInput = screen.getAllByRole('spinbutton')[0];

    fireEvent.change(rewardCategorySelect, {
      target: { value: 'coffee' },
    });
    fireEvent.change(priceInput, {
      target: { value: '300' },
    });

    await waitFor(() => {
      expect(screen.getByText(/Recommended: 120\s*[–\-]\s*220 drops for coffee/i)).toBeInTheDocument();
    });
  });
});

