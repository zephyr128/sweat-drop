// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/lib/actions/leaderboard-actions', () => ({
  getLeaderboardSnapshots: vi.fn(async () => ({ success: true, data: [], total: 0 })),
  getCurrentLeaderboard: vi.fn(async () => ({ success: true, data: [] })),
  getLeaderboardRewards: vi.fn(async () => ({ success: true, data: { rank1: '', rank2: '', rank3: '' } })),
  updateLeaderboardRewards: vi.fn(async () => ({ success: true })),
}));

vi.mock('@/components/MemberAvatar', () => ({
  MemberAvatar: () => <div data-testid="avatar" />,
}));

import { LeaderboardHistory } from './LeaderboardHistory';

describe('LeaderboardHistory', () => {
  it('renders score source hint banner', () => {
    render(<LeaderboardHistory gymId="gym-1" gymName="Test Gym" />);

    expect(screen.getByTestId('leaderboard-score-hint')).toBeInTheDocument();
    expect(screen.getByText('Rank is based on earned drops score.')).toBeInTheDocument();
    expect(screen.getByText(/Wallet balance can be lower/i)).toBeInTheDocument();
  });

  it('renders tab bar with all periods', () => {
    render(<LeaderboardHistory gymId="gym-1" gymName="Test Gym" />);

    expect(screen.getByText('Weekly')).toBeInTheDocument();
    expect(screen.getByText('Monthly')).toBeInTheDocument();
    expect(screen.getByText('All Time')).toBeInTheDocument();
    expect(screen.getByText('History')).toBeInTheDocument();
  });
});
