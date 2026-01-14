import { getCurrentProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase-server';
import { notFound, redirect } from 'next/navigation';
import { BrandingModule } from '@/components/modules/BrandingModule';

export default async function GlobalBrandingPage() {
  const profile = await getCurrentProfile();
  
  if (!profile) {
    redirect('/login');
  }

  // Only gym owners can access global branding
  if (profile.role !== 'gym_owner') {
    notFound();
  }

  const supabase = createClient();
  
  // Get owner branding (global branding per owner)
  const { data: ownerBranding } = await supabase
    .from('owner_branding')
    .select('primary_color, logo_url, background_url')
    .eq('owner_id', profile.id)
    .single();

  return (
    <div>
      <div className="mb-8 pt-16 md:pt-0">
        <h1 className="text-4xl font-bold text-white mb-2">Global Branding Settings</h1>
        <p className="text-[#808080]">
          Global branding applies to all your gym locations. Changes here will be reflected across all your gyms.
        </p>
      </div>

      <BrandingModule 
        ownerId={profile.id} 
        initialData={ownerBranding || {
          primary_color: null,
          logo_url: null,
          background_url: null,
        }} 
      />
    </div>
  );
}
