import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/lib/auth-guard', () => ({
  requireGymAccess: vi.fn(async () => ({ id: 'u1', role: 'gym_owner' })),
}));

vi.mock('@/lib/supabase-server', () => ({
  createClient: vi.fn(async () => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => ({ data: { name: 'Test Gym' } })),
        })),
      })),
    })),
  })),
}));

vi.mock('@/components/reports/GymReportDashboard', () => ({
  default: ({ gymId, gymName }: { gymId: string; gymName: string }) => (
    <div data-testid="gym-report-dashboard">
      Report {gymId} {gymName}
    </div>
  ),
}));

import Page from './page';

describe('reports page smoke', () => {
  it('smoke: renders reports page and dashboard shell', async () => {
    const ui = await Page({ params: Promise.resolve({ id: 'gym-1' }) });
    const html = renderToStaticMarkup(ui);
    expect(html).toContain('Reports');
    expect(html).toContain('Report gym-1 Test Gym');
  });
});

