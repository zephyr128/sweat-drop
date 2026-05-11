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

  // Schema note: gym logo lives on `owner_branding` (keyed by owner_id) — the
  // legacy `gyms.logo_url` column was dropped by the
  // 20240101000034_unify_branding_and_cleanup migration. Two queries here so
  // the Badge Studio sees the same logo Admin uses everywhere else.
  const [gymRes, challengesRes] = await Promise.all([
    supabase
      .from('gyms')
      .select('id, name, owner_id')
      .eq('id', gymId)
      .single(),
    supabase
      .from('gym_challenges')
      .select('id, name, badge_image_url')
      .eq('gym_id', gymId)
      .order('name'),
  ]);

  if (gymRes.error || !gymRes.data) notFound();

  let logoUrl: string | null = null;
  if (gymRes.data.owner_id) {
    const { data: branding } = await supabase
      .from('owner_branding')
      .select('logo_url')
      .eq('owner_id', gymRes.data.owner_id)
      .maybeSingle();
    if (branding && typeof branding.logo_url === 'string' && branding.logo_url.length > 0) {
      logoUrl = branding.logo_url;
    }
  }

  const gym = {
    id: gymRes.data.id,
    name: gymRes.data.name,
    logo_url: logoUrl,
  };
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
