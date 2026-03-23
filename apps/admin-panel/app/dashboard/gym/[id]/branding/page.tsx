// CRITICAL: Force dynamic rendering to avoid React.cache issues during build
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import { createClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import { requireGymAccess } from '@/lib/auth-guard';
import { BrandingModule } from '@/components/modules/BrandingModule';

interface BrandingPageProps {
  params: Promise<{ id: string }>;
}

interface GymData {
  id: string;
  name: string;
  owner_id: string | null;
}

interface OwnerBrandingData {
  primary_color: string | null;
  logo_url: string | null;
  background_url: string | null;
}

export default async function BrandingPage({ params }: BrandingPageProps) {
  const { id } = await params;

  const profile = await requireGymAccess(id);

  // Initialize Supabase client
  const supabase = await createClient();

  // Fetch gym data
  let gym: GymData;
  try {
    const { data: gymData, error: gymError } = await supabase
      .from('gyms')
      .select('id, name, owner_id')
      .eq('id', id)
      .single();
    
    if (gymError || !gymData) {
      console.error('[BrandingPage] Gym fetch failed:', gymError);
      notFound();
    }
    
    gym = gymData as GymData;
  } catch (error) {
    console.error('[BrandingPage] Unexpected error fetching gym:', error);
    notFound();
  }

  // Get owner branding (global branding per owner) with error handling
  let ownerBranding: OwnerBrandingData | null = null;
  const ownerId = gym.owner_id || profile.id;
  
  try {
    const { data: brandingData, error: brandingError } = await supabase
      .from('owner_branding')
      .select('primary_color, logo_url, background_url')
      .eq('owner_id', ownerId)
      .single();

    if (brandingError) {
      console.warn('[BrandingPage] Owner branding not found, using defaults:', brandingError);
    } else if (brandingData) {
      ownerBranding = brandingData as OwnerBrandingData;
    }
  } catch (error) {
    console.error('[BrandingPage] Unexpected error fetching owner branding:', error);
    // Continue with null - will use defaults
  }

  return (
    <div>
      <div className="mb-8">
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
