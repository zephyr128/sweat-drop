import { createClient } from '@/lib/supabase-server';
import { QRValidator } from '../QRValidator';

interface ReceptionistDashboardProps {
  gymId: string;
}

export async function ReceptionistDashboard({ gymId }: ReceptionistDashboardProps) {
  const supabase = await createClient();
  
  // Fetch pending redemptions
  const { data: pendingRedemptions } = await supabase
    .from('redemptions')
    .select(
      `
      *,
      profiles:user_id (username, email),
      rewards:reward_id (name, reward_type)
    `
    )
    .eq('gym_id', gymId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(10);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">Check-in Dashboard</h1>
        <p className="text-[#808080]">Validate redemptions and check-ins</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6">
          <h2 className="text-xl font-bold text-white mb-4">Pending Redemptions</h2>
          {pendingRedemptions && pendingRedemptions.length > 0 ? (
            <div className="space-y-3">
              {pendingRedemptions.map((redemption: any) => (
                <div
                  key={redemption.id}
                  className="p-4 bg-[#1A1A1A] rounded-lg border border-[#1A1A1A]"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white font-medium">
                        {redemption.profiles?.username || 'Unknown User'}
                      </p>
                      <p className="text-sm text-[#808080]">
                        {redemption.rewards?.name} - {redemption.drops_spent} drops
                      </p>
                    </div>
                    <button className="px-4 py-2 bg-[#00E5FF] text-black rounded-lg font-medium hover:bg-[#00B8CC] transition-colors">
                      Confirm
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[#808080]">No pending redemptions</p>
          )}
        </div>

        <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-6">
          <h2 className="text-xl font-bold text-white mb-4">QR Code Validator</h2>
          <p className="text-[#808080] mb-4">Enter redemption ID to validate</p>
          <QRValidator gymId={gymId} />
        </div>
      </div>
    </div>
  );
}
