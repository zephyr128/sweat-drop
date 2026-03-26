// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { DropsEconomyKPIs } from './DropsEconomyKPIs';

describe('DropsEconomyKPIs', () => {
  it('renders standard KPIs', () => {
    render(<DropsEconomyKPIs dropsEarned={1000} dropsSpent={300} />);

    expect(screen.getByText('Drops Earned')).toBeInTheDocument();
    expect(screen.getByText('1,000')).toBeInTheDocument();
    expect(screen.getByText('Drops Spent')).toBeInTheDocument();
    expect(screen.getByText('300')).toBeInTheDocument();
    expect(screen.getByText('Circulation')).toBeInTheDocument();
    expect(screen.getByText('30%')).toBeInTheDocument();
  });

  it('renders expiry KPI when provided', () => {
    render(
      <DropsEconomyKPIs
        dropsEarned={1000}
        dropsSpent={300}
        dropsExpiring30d={250}
        membersAffectedByExpiry={8}
      />,
    );

    expect(screen.getByText('Expiring (30d)')).toBeInTheDocument();
    expect(screen.getByText('250')).toBeInTheDocument();
    expect(screen.getByText('8 members affected')).toBeInTheDocument();
  });

  it('does not render expiry KPI when not provided', () => {
    render(<DropsEconomyKPIs dropsEarned={500} dropsSpent={100} />);

    expect(screen.queryByText('Expiring (30d)')).not.toBeInTheDocument();
  });

  it('handles singular member affected', () => {
    render(
      <DropsEconomyKPIs
        dropsEarned={1000}
        dropsSpent={300}
        dropsExpiring30d={50}
        membersAffectedByExpiry={1}
      />,
    );

    expect(screen.getByText('1 member affected')).toBeInTheDocument();
  });
});
