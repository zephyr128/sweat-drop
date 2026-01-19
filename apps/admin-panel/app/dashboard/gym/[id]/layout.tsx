// CRITICAL: Force dynamic rendering to avoid React.cache issues during build
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import { getCurrentProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase-server';
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
  const supabase = await createClient();
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
  // This layout is nested inside dashboard/layout.tsx
  // The parent layout already provides the sidebar and main wrapper
  // We just need to render children
  return <>{children}</>;
}
