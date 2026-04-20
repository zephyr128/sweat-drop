import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams} from 'expo-router';
import { useThrottledRouter } from '@/hooks/useThrottledRouter';
import { usePendingReferralStore } from '@/lib/stores/usePendingReferralStore';
import { log } from '@/lib/logger';

/**
 * Trampoline for sweatdrop://join/<code> deep links.
 *
 * This screen's ONLY job is to persist the referral code in the Zustand store
 * and then get out of the way by going back or replacing with home.
 *
 * NAVIGATION IS NEVER TO /invite-friend FROM HERE.
 * The invite-friend screen is reached via the home screen banner or when
 * the user already has a gym. This prevents:
 *   - cold-start crashes (empty stack → back → crash)
 *   - races with index.tsx auth routing
 *   - bypassing onboarding/email verification guards
 */
export default function JoinCodeRoute() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useThrottledRouter();
  const setPendingCode = usePendingReferralStore((s) => s.setPendingCode);

  useEffect(() => {
    const decoded = code
      ? (() => { try { return decodeURIComponent(code); } catch { return code; } })()
      : null;

    if (decoded) {
      log.debug('[JoinRoute] Referral code stored:', decoded);
      setPendingCode(decoded);
    }

    // Get out of the way: go back if there's a stack, otherwise do nothing
    // and let index.tsx handle the initial routing.
    if (router.canGoBack()) {
      router.back();
    } else {
      // Cold start — index.tsx will handle routing once auth initializes.
      // Just dismiss this screen by replacing with index (the entry point).
      router.replace('/');
    }
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#00E5FF" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
