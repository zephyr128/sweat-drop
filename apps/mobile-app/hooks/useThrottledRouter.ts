import { useRef, useCallback } from 'react';
import { useRouter } from 'expo-router';
import type { Router } from 'expo-router';

const THROTTLE_MS = 600;

type PushParams = Parameters<Router['push']>;
type ReplaceParams = Parameters<Router['replace']>;
type NavigateParams = Parameters<Router['navigate']>;

/**
 * Wraps expo-router's useRouter and throttles push/replace/navigate calls to
 * prevent duplicate screens being pushed when a user taps a button multiple
 * times quickly (e.g. double-tap, slow network lag).
 */
export function useThrottledRouter() {
  const router = useRouter();
  const lastCallRef = useRef<number>(0);

  const isThrottled = useCallback(() => {
    const now = Date.now();
    if (now - lastCallRef.current < THROTTLE_MS) return true;
    lastCallRef.current = now;
    return false;
  }, []);

  const push = useCallback((...args: PushParams) => {
    if (isThrottled()) return;
    router.push(...args);
  }, [router, isThrottled]);

  const replace = useCallback((...args: ReplaceParams) => {
    if (isThrottled()) return;
    router.replace(...args);
  }, [router, isThrottled]);

  const navigate = useCallback((...args: NavigateParams) => {
    if (isThrottled()) return;
    router.navigate(...args);
  }, [router, isThrottled]);

  return {
    ...router,
    push,
    replace,
    navigate,
  };
}
