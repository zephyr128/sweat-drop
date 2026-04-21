import { useAuthStore } from '@/lib/stores/authStore';

/**
 * Returns true if the currently signed-in user has profiles.is_demo = true.
 * Gates simulator/demo flows (5x tap on ScannerScreen, etc.) so they're
 * invisible to real users in production builds.
 */
export function useIsDemoUser(): boolean {
  return useAuthStore((s) => s.profile?.is_demo ?? false);
}
