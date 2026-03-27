import { redirect } from 'next/navigation';

export default async function GymInvitationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: gymId } = await params;
  redirect(`/dashboard/gym/${gymId}/arenas?tab=invitations`);
}
