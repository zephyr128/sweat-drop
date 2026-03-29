import {
  anyGymMetricOk,
  anyNetworkMetricOk,
  type HealthMetric,
  type ReferralFriendGymHealth,
  type ReferralFriendNetworkHealth,
} from '@/lib/referral-friend-challenge-health';

function MetricLine({ label, metric }: { label: string; metric: HealthMetric }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-[#808080]">{label}</span>
      <span className="text-white tabular-nums">
        {metric.ok ? metric.count.toLocaleString() : '—'}
      </span>
    </div>
  );
}

const PANEL_NOTE =
  'Read-only row counts for the referral + 1v1 friend challenge MVP. If a row shows an em dash, the table or column is not available yet, RLS blocked the read, or the schema differs from the pilot plan.';

export function ReferralFriendChallengeNetworkPanel({ data }: { data: ReferralFriendNetworkHealth }) {
  const anyOk = anyNetworkMetricOk(data);

  return (
    <div className="mb-8 bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6">
      <h2 className="text-lg font-bold text-white mb-1">Referral &amp; friend challenge health</h2>
      <p className="text-sm text-[#808080] mb-4">{PANEL_NOTE}</p>
      {!anyOk ? (
        <p className="text-sm text-[#808080]">
          No referral or friend-challenge tables are visible from this deployment yet. After the MVP migrations
          and RLS for admin reads are applied, counts will appear here automatically.
        </p>
      ) : (
        <div className="space-y-2 max-w-md">
          <MetricLine label="Referrals (all gyms)" metric={data.referrals} />
          <MetricLine label="Friend challenges (all gyms)" metric={data.friendChallenges} />
          <MetricLine label="Friend challenge progress rows" metric={data.friendChallengeProgress} />
        </div>
      )}
    </div>
  );
}

export function ReferralFriendChallengeGymPanel({
  gymName,
  data,
}: {
  gymName: string;
  data: ReferralFriendGymHealth;
}) {
  const anyOk = anyGymMetricOk(data);

  return (
    <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6 mt-8">
      <h2 className="text-xl font-bold text-white mb-1">Referral &amp; 1v1 health ({gymName})</h2>
      <p className="text-sm text-[#808080] mb-4">{PANEL_NOTE}</p>
      {!anyOk ? (
        <p className="text-sm text-[#808080]">
          Scoped metrics are not available yet (tables missing, no{' '}
          <code className="text-[#00E5FF]/90 text-xs">gym_id</code> on these rows, or no admin read policy).
        </p>
      ) : (
        <div className="space-y-2 max-w-md">
          <MetricLine label="Referrals (this gym, if gym-scoped)" metric={data.referralsAtGym} />
          <MetricLine label="Friend challenges (this gym)" metric={data.friendChallengesAtGym} />
          <MetricLine
            label={"Friend challenge progress (this gym's challenges)"}
            metric={data.friendChallengeProgressAtGym}
          />
        </div>
      )}
    </div>
  );
}
