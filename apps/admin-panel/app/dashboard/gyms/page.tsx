import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase-server';
import { Building2, MapPin, PlusCircle } from 'lucide-react';

interface Gym {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  status: string | null;
  is_suspended: boolean | null;
}

export default async function GymsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const supabase = await createClient();
  const { data: gyms } = await supabase
    .from('gyms')
    .select('id, name, city, country, status, is_suspended')
    .order('name');

  const gymList = (gyms ?? []) as Gym[];

  return (
    <div className="md:p-6">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">Gym Management</h1>
          <p className="text-[#808080]">Create and manage gyms</p>
        </div>
        <Link
          href="/dashboard/gyms/new"
          className="inline-flex items-center gap-2 px-6 py-3 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors"
        >
          <PlusCircle className="w-4 h-4" />
          Create New Gym
        </Link>
      </div>

      {gymList.length === 0 ? (
        <div className="col-span-full text-center py-16 bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl">
          <Building2 className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
          <p className="text-[#808080] mb-4">No gyms yet</p>
          <Link
            href="/dashboard/gyms/new"
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#00E5FF] text-black rounded-lg font-bold hover:bg-[#00B8CC] transition-colors"
          >
            <PlusCircle className="w-4 h-4" />
            Create First Gym
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {gymList.map((gym) => {
            const isSuspended = gym.status === 'suspended' || gym.is_suspended;
            return (
              <div
                key={gym.id}
                className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6 hover:border-[#00E5FF]/30 transition-all"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-xl font-bold text-white">{gym.name}</h3>
                  {isSuspended && (
                    <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-red-500/10 text-red-400 border border-red-500/20 shrink-0 ml-2">
                      Suspended
                    </span>
                  )}
                </div>
                {(gym.city || gym.country) && (
                  <p className="flex items-center gap-1 text-[#808080] text-sm mb-4">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    {[gym.city, gym.country].filter(Boolean).join(', ')}
                  </p>
                )}
                <div className="flex gap-3">
                  <Link
                    href={`/dashboard/gyms/${gym.id}`}
                    className="flex-1 px-4 py-2 bg-[#00E5FF]/10 text-[#00E5FF] rounded-lg text-center text-sm font-medium hover:bg-[#00E5FF]/20 transition-colors"
                  >
                    Details
                  </Link>
                  <Link
                    href={`/dashboard/gym/${gym.id}/dashboard`}
                    className="px-4 py-2 bg-[#1A1A1A] text-white rounded-lg text-sm font-medium hover:bg-[#2A2A2A] transition-colors"
                  >
                    Dashboard
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
