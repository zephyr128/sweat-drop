import { redirect } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default async function HomePage() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect('/login');
  }

  redirect('/dashboard');
}
