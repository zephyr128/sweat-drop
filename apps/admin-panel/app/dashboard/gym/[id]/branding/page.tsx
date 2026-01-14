import { getCurrentProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import { BrandingModule } from '@/components/modules/BrandingModule';

export default async function BrandingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  
  const profile = await getCurrentProfile();
  if (!profile) {
    notFound();
  }

  const supabase = createClient();
  const { data: gym, error } = await supabase
    .from('gyms')
    .select('id, name, owner_id')
    .eq('id', id)
    .single();
  
  if (error || !gym) {
    notFound();
  }
  
  // Verify access: user must own the gym (owner_id) or have it assigned (assigned_gym_id)
  if (profile.role === 'gym_admin' || profile.role === 'gym_owner') {
    // Check if user owns this gym OR it's their assigned gym
    const ownsGym = gym.owner_id === profile.id;
    const isAssignedGym = profile.assigned_gym_id === id;
    
    if (!ownsGym && !isAssignedGym) {
      notFound();
    }
  }

  // Get owner branding (global branding per owner)
  const { data: ownerBranding } = await supabase
    .from('owner_branding')
    .select('primary_color, logo_url, background_url')
    .eq('owner_id', gym.owner_id || profile.id) // Fallback to current user if no owner_id
    .single();

  // If user is gym_admin and owns this gym, use their owner_id
  const ownerId = gym.owner_id || profile.id;

  return (
    <div>
      <div className="mb-8 pt-16 md:pt-0">
        <h1 className="text-4xl font-bold text-white mb-2">Branding Settings</h1>
        <p className="text-[#808080]">
          {gym.owner_id 
            ? 'Global branding applies to all your gym locations'
            : 'Customize your gym\'s appearance in the mobile app'}
        </p>
      </div>

      <BrandingModule 
        ownerId={ownerId} 
        initialData={ownerBranding || {
          primary_color: null,
          logo_url: null,
          background_url: null,
        }} 
      />
    </div>
  );
}
