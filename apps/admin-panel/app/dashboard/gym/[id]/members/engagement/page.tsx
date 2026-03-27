import { requireGymAccess } from '@/lib/auth-guard';
import { EngagementCampaignManager } from '@/components/modules/EngagementCampaignManager';

interface EngagementPageProps {
  params: Promise<{ id: string }>;
}

export default async function MembersEngagementPage({ params }: EngagementPageProps) {
  const { id } = await params;
  await requireGymAccess(id, ['superadmin', 'gym_owner', 'gym_admin']);

  return (
    <div className="min-h-screen md:p-6 max-w-[1400px] mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">Engagement Campaigns</h1>
        <p className="text-xs text-zinc-500 mt-0.5">
          Target at-risk members with push notifications and comeback offers.
        </p>
      </div>

      <EngagementCampaignManager gymId={id} />
    </div>
  );
}
