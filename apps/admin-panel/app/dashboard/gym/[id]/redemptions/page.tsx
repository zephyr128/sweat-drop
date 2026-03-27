import { redirect } from 'next/navigation';

export default async function RedemptionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/dashboard/gym/${id}/store?tab=redemptions`);
}
