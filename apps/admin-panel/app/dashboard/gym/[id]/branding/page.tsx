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

  // Verify access
  if (profile.role === 'gym_admin' && profile.admin_gym_id !== id) {
    notFound();
  }

  const supabase = createClient();
  const { data: gym, error } = await supabase
    .from('gyms')
    .select('id, name, primary_color, logo_url, background_url')
    .eq('id', id)
    .single();

  if (error || !gym) {
    notFound();
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">Branding Settings</h1>
        <p className="text-[#808080]">Customize your gym's appearance in the mobile app</p>
      </div>

      <BrandingModule gymId={id} initialData={gym} />
    </div>
  );
}
