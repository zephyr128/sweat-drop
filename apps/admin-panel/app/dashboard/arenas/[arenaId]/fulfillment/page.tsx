// Route is auto-dynamic (reads cookies via auth check)
// Accessible to: superadmin, gym_owner, gym_admin, receptionist
// (NOT under /dashboard/super so middleware allows all authenticated gym staff)

import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Trophy } from 'lucide-react';
import { getCurrentProfile } from '@/lib/auth';
import { getAdminClient } from '@/lib/utils/supabase-admin';
import { ArenaFulfillmentTable } from '@/components/modules/ArenaFulfillmentTable';

interface FulfillmentPageProps {
  params: Promise<{ arenaId: string }>;
}

interface ArenaRow {
  id: string;
  name: string;
  is_finalized: boolean | null;
  finalized_at: string | null;
}

function backHref(role: string, assignedGymId: string | null): string {
  if (role === 'superadmin') return '/dashboard/super';
  if (role === 'gym_owner') return '/dashboard/owner';
  if (assignedGymId) return `/dashboard/gym/${assignedGymId}/dashboard`;
  return '/dashboard';
}

export default async function ArenaFulfillmentPage({ params }: FulfillmentPageProps) {
  const { arenaId } = await params;

  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const allowedRoles = ['superadmin', 'gym_owner', 'gym_admin', 'receptionist'];
  if (!allowedRoles.includes(profile.role)) notFound();

  const admin = getAdminClient();
  if (!admin) notFound();

  const { data: arena, error } = await (admin.from('sweat_arenas') as any)
    .select('id, name, is_finalized, finalized_at')
    .eq('id', arenaId)
    .single() as { data: ArenaRow | null; error: unknown };

  if (error || !arena) notFound();

  const isSuperAdmin = profile.role === 'superadmin';
  const back = backHref(profile.role, profile.assigned_gym_id ?? null);

  return (
    <div className="min-h-screen md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link
          href={back}
          className="p-2 rounded-lg bg-[#1A1A1A] border border-[#333] text-zinc-400 hover:text-white transition-colors shrink-0 mt-0.5"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Trophy className="w-5 h-5 text-purple-400" />
            <h1 className="text-2xl font-bold text-white truncate">{arena.name}</h1>
          </div>
          <p className="text-[#808080] text-sm">
            Prize fulfillment{' '}
            {arena.is_finalized && arena.finalized_at
              ? `— finalized ${new Date(arena.finalized_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}`
              : '— arena not yet finalized'}
          </p>
        </div>
      </div>

      {!arena.is_finalized && (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-sm text-amber-400">
          This arena has not been finalized yet. Fulfillment rows will appear once winners are determined.
        </div>
      )}

      <ArenaFulfillmentTable
        arenaId={arenaId}
        arenaName={arena.name}
        isSuperAdmin={isSuperAdmin}
      />
    </div>
  );
}
