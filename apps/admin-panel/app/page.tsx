// Route is auto-dynamic (reads cookies via getCurrentUser)

import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';

export default async function HomePage() {
  try {
    const user = await getCurrentUser();
    if (!user) redirect('/login');
    redirect('/dashboard');
  } catch {
    redirect('/login');
  }
}
