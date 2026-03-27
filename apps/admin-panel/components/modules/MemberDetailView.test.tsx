// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/MemberAvatar', () => ({
  MemberAvatar: () => <div data-testid="avatar" />,
}));

import { MemberDetailView } from './MemberDetailView';
import type { MemberDetailResult } from '@/lib/actions/member-detail-actions';

const baseData: MemberDetailResult = {
  profile: {
    id: 'u-1',
    username: 'JohnDoe',
    email: 'john@test.com',
    avatar_url: null,
    total_drops: 2000,
    available_drops: 800,
    streak_days: 12,
    last_visit_date: '2026-03-24',
    joined_at: '2026-01-10',
    role: 'user',
  },
  sessions: [],
  transactions: [],
  badges: [],
  redemptions: [],
  expiry: {
    expiringIn7d: 150,
    expiringIn30d: 450,
    nextExpiryDate: '2026-04-05T00:00:00Z',
  },
  ledger: {
    walletBalance: 800,
    earnedScoreWeekly: 120,
    earnedScoreMonthly: 540,
    earnedScoreAllTime: 2000,
  },
  identity: null,
};

describe('MemberDetailView', () => {
  it('renders wallet vs earned split', () => {
    render(<MemberDetailView gymId="gym-1" data={baseData} />);

    expect(screen.getByText('Wallet Balance')).toBeInTheDocument();
    expect(screen.getByText('800')).toBeInTheDocument();
    expect(screen.getByText('Earned (All Time)')).toBeInTheDocument();
    expect(screen.getByText('2,000')).toBeInTheDocument();
  });

  it('renders earned breakdown (week/month)', () => {
    render(<MemberDetailView gymId="gym-1" data={baseData} />);

    expect(screen.getByText('Earned (Week)')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('Earned (Month)')).toBeInTheDocument();
    expect(screen.getByText('540')).toBeInTheDocument();
  });

  it('renders expiry info', () => {
    render(<MemberDetailView gymId="gym-1" data={baseData} />);

    expect(screen.getByText('Expiring (7d)')).toBeInTheDocument();
    expect(screen.getByText('150')).toBeInTheDocument();
    expect(screen.getByText('Expiring (30d)')).toBeInTheDocument();
    expect(screen.getByText('450')).toBeInTheDocument();
    expect(screen.getByText('Next Expiry')).toBeInTheDocument();
    expect(screen.getByText('2026-04-05')).toBeInTheDocument();
  });

  it('renders gracefully without expiry/ledger data', () => {
    const dataNoExpiry: MemberDetailResult = {
      ...baseData,
      expiry: null,
      ledger: null,
    };
    render(<MemberDetailView gymId="gym-1" data={dataNoExpiry} />);

    expect(screen.getByText('Wallet Balance')).toBeInTheDocument();
    expect(screen.queryByText('Expiring (7d)')).not.toBeInTheDocument();
    expect(screen.queryByText('Earned (Week)')).not.toBeInTheDocument();
  });
});
