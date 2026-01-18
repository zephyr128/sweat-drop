import { getCurrentProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase-server';
import { notFound, redirect } from 'next/navigation';

export default async function SystemHealthPage() {
  const profile = await getCurrentProfile();
  
  if (!profile) {
    redirect('/login');
  }

  if (profile.role !== 'superadmin') {
    notFound();
  }

  const supabase = await createClient();
  
  // Fetch system health metrics
  const [
    { count: totalGyms },
    { count: activeGyms },
    { count: suspendedGyms },
    { count: totalMachines },
    { count: activeMachines },
    { count: totalUsers },
    { count: totalSessions },
    { data: recentErrors },
  ] = await Promise.all([
    supabase.from('gyms').select('*', { count: 'exact', head: true }),
    supabase.from('gyms').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('gyms').select('*', { count: 'exact', head: true }).eq('status', 'suspended'),
    supabase.from('machines').select('*', { count: 'exact', head: true }),
    supabase.from('machines').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('sessions').select('*', { count: 'exact', head: true }),
    supabase
      .from('machine_reports')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  // Calculate health score (0-100)
  const healthScore = Math.round(
    ((activeGyms || 0) / Math.max(totalGyms || 1, 1)) * 50 +
    ((activeMachines || 0) / Math.max(totalMachines || 1, 1)) * 30 +
    (Math.min((recentErrors?.length || 0) / 10, 1) * 20)
  );

  const getHealthStatus = (score: number) => {
    if (score >= 80) return { label: 'Healthy', color: 'text-[#00E5FF]', bg: 'bg-[#00E5FF]/20' };
    if (score >= 60) return { label: 'Warning', color: 'text-yellow-500', bg: 'bg-yellow-500/20' };
    return { label: 'Critical', color: 'text-[#FF5252]', bg: 'bg-[#FF5252]/20' };
  };

  const healthStatus = getHealthStatus(healthScore);

  return (
    <div>
      <div className="mb-8 pt-16 md:pt-0">
        <h1 className="text-4xl font-bold text-white mb-2">System Health</h1>
        <p className="text-[#808080]">Monitor system status and performance</p>
      </div>

      {/* Health Score */}
      <div className="mb-6 bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">Overall Health Score</h2>
          <span className={`px-4 py-2 rounded-full text-sm font-medium ${healthStatus.bg} ${healthStatus.color}`}>
            {healthStatus.label}
          </span>
        </div>
        <div className="relative w-full h-4 bg-[#1A1A1A] rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${
              healthScore >= 80 ? 'bg-[#00E5FF]' : healthScore >= 60 ? 'bg-yellow-500' : 'bg-[#FF5252]'
            }`}
            style={{ width: `${healthScore}%` }}
          />
        </div>
        <p className="mt-2 text-[#808080] text-sm">{healthScore}/100</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6">
          <h3 className="text-sm text-[#808080] mb-2">Total Gyms</h3>
          <p className="text-3xl font-bold text-white">{totalGyms || 0}</p>
          <p className="text-sm text-[#808080] mt-1">
            {activeGyms || 0} active, {suspendedGyms || 0} suspended
          </p>
        </div>
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6">
          <h3 className="text-sm text-[#808080] mb-2">Total Machines</h3>
          <p className="text-3xl font-bold text-white">{totalMachines || 0}</p>
          <p className="text-sm text-[#808080] mt-1">
            {activeMachines || 0} active
          </p>
        </div>
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6">
          <h3 className="text-sm text-[#808080] mb-2">Total Users</h3>
          <p className="text-3xl font-bold text-white">{totalUsers || 0}</p>
        </div>
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6">
          <h3 className="text-sm text-[#808080] mb-2">Total Sessions</h3>
          <p className="text-3xl font-bold text-white">{totalSessions || 0}</p>
        </div>
      </div>

      {/* Pending Reports */}
      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl overflow-hidden">
        <div className="p-6 border-b border-[#1A1A1A]">
          <h2 className="text-xl font-bold text-white">Recent Machine Reports</h2>
          <p className="text-sm text-[#808080] mt-1">Pending maintenance requests</p>
        </div>
        {!recentErrors || recentErrors.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-[#808080]">No pending reports</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#1A1A1A]">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-medium text-[#808080] uppercase tracking-wide">Machine</th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-[#808080] uppercase tracking-wide">Issue</th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-[#808080] uppercase tracking-wide">Reported</th>
                  <th className="px-6 py-4 text-left text-sm font-medium text-[#808080] uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1A1A1A]">
                {recentErrors.map((report: any) => (
                  <tr key={report.id} className="hover:bg-[#1A1A1A]/50 transition-colors">
                    <td className="px-6 py-4 text-white">{report.machine_id?.substring(0, 8)}...</td>
                    <td className="px-6 py-4 text-white">{report.issue_type || 'Unknown'}</td>
                    <td className="px-6 py-4 text-[#808080] text-sm">
                      {new Date(report.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-3 py-1 bg-yellow-500/20 text-yellow-500 rounded-full text-sm font-medium">
                        Pending
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
