// Route is auto-dynamic (reads cookies via requireGymAccess)

import { requireGymAccess } from '@/lib/auth-guard';
import { ChallengesPageView } from '@/components/modules/ChallengesPageView';

interface ChallengesPageProps {
  params: Promise<{ id: string }>;
}

export default async function ChallengesPage({ params }: ChallengesPageProps) {
  const { id } = await params;
  await requireGymAccess(id);

  return (
    <div className="min-h-screen md:p-6 max-w-[1400px] mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">Challenges</h1>
        <p className="text-xs text-zinc-500 mt-0.5">
          Create and manage daily, weekly, and custom challenges for members.
        </p>
      </div>

      <ChallengesPageView gymId={id} />
    </div>
  );
}
