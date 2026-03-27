import { redirect } from 'next/navigation';

export default async function GymBrandingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/dashboard/gym/${id}/settings?tab=branding`);
}
