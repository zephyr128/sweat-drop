import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const dynamicParams = true;
export const revalidate = 0;

export default async function HomePage() {
  // CRITICAL: Build-safe check - only run in runtime, not during build
  // During build-time static generation, this page will be skipped
  try {
    const user = await getCurrentUser();

    if (!user) {
      redirect('/login');
    }

    redirect('/dashboard');
  } catch (error) {
    // During build, getCurrentUser might fail - redirect to login as fallback
    redirect('/login');
  }
}
