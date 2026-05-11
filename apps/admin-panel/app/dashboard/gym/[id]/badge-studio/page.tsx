import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Palette } from 'lucide-react';
import { createClient } from '@/lib/supabase-server';
import { BadgeStudioClient } from '@/components/badge-studio/BadgeStudioClient';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BadgeStudioPage({ params }: PageProps) {
  const { id: gymId } = await params;
  const supabase = await createClient();

  const [gymRes, challengesRes] = await Promise.all([
    supabase
      .from('gyms')
      .select('id, name, logo_url')
      .eq('id', gymId)
      .single(),
    supabase
      .from('gym_challenges')
      .select('id, name, badge_image_url')
      .eq('gym_id', gymId)
      .order('name'),
  ]);

  if (gymRes.error || !gymRes.data) notFound();

  const gym      = gymRes.data;
  const challenges = challengesRes.data ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href={`/dashboard/gym/${gymId}/challenges`}
          className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
          aria-label="Back to Challenges"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#00E5FF]/10 flex items-center justify-center">
            <Palette className="w-5 h-5 text-[#00E5FF]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Badge Studio</h1>
            <p className="text-xs text-zinc-500">{gym.name}</p>
          </div>
        </div>
      </div>

      <BadgeStudioClient gym={gym} challenges={challenges} />
    </div>
  );
}
