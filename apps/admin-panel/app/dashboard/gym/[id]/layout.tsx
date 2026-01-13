import { getCurrentProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase-server';
import { Sidebar } from '@/components/Sidebar';
import { notFound } from 'next/navigation';

export default async function GymLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  // Await params in Next.js 14
  const { id } = await params;
  
  // Middleware already handles authentication and redirects
  // If we reach here, user is authenticated
  const profile = await getCurrentProfile();
  
  // If no profile, middleware should have redirected, but handle gracefully
  if (!profile) {
    notFound();
  }

  // Check if gym exists (middleware validates access)
  const supabase = createClient();
  const { data: gym } = await supabase
    .from('gyms')
    .select('id, name')
    .eq('id', id)
    .single();

  // If gym doesn't exist, show 404 (middleware should have caught this)
  if (!gym) {
    notFound();
  }

  // Middleware already handles all redirects and access control
  // At this point, if we reach here, the user has access
  // Just render the layout
  return (
    <div className="min-h-screen bg-[#000000]">
      <Sidebar role={profile.role} currentGymId={id} />
      <main className="w-full p-4 md:pl-[10rem] md:pr-8 md:pt-8 md:pb-8 transition-all min-h-screen">{children}</main>
    </div>
  );
}
