import { redirect } from 'next/navigation';

export default async function RetentionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: gymId } = await params;
  redirect(`/dashboard/gym/${gymId}/members`);
}
