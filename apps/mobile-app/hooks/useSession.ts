/**
 * @deprecated Use useAuthStore directly instead.
 * This wrapper exists for backward compatibility.
 * New screens should import useAuthStore.
 *
 * There is NO onAuthStateChange listener here.
 * The single listener lives in authStore.initialize().
 */
import { useAuthStore } from '@/lib/stores/authStore';

export function useSession() {
  const session = useAuthStore((s) => s.session);
  const isInitialized = useAuthStore((s) => s.isInitialized);

  return {
    session,
    loading: !isInitialized,
    // Legacy compat — some screens check user directly
    user: session?.user ?? null,
  };
}
