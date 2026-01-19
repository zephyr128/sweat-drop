// apps/admin-panel/app/accept-invitation/[token]/page.tsx

// CRITICAL: Force dynamic rendering to avoid React.cache issues during build
export const dynamic = 'force-dynamic';
export const dynamicParams = true;
export const revalidate = 0;
export const fetchCache = 'force-no-store';

// CRITICAL: Prevent static generation by returning empty array
// This must be a sync function that returns empty array
export function generateStaticParams() {
  // Return empty array to prevent static generation
  return [];
}

import { redirect } from 'next/navigation';
// import { cache } from 'react'; // <--- OVO JE BIO UBICA, NE VRAĆAJ GA!

import InvitationHandler from './InvitationHandler';

export default async function AcceptInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  // CRITICAL: Prevent rendering during build phase to avoid React.cache calls
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return null;
  }

  // CRITICAL: In Next.js 14+, params is a Promise - must await it
  const { token } = await params;

  // Ovde ide tvoja logika, ali bez 'cache()' omotača
  // Npr: const invitation = await getInvitation(token);
  
  if (!token) {
    redirect('/login');
  }
  
  // Renderuj InvitationHandler komponentu
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#000000]">
      <InvitationHandler token={token} />
    </div>
  );
}
