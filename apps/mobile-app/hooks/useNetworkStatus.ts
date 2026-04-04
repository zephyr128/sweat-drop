import { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';

async function checkConnectivity(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    await fetch('https://www.google.com/generate_204', {
      method: 'HEAD',
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timeout);
    return true;
  } catch {
    return false;
  }
}

export function useNetworkStatus() {
  const [isConnected, setIsConnected] = useState<boolean | null>(true);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const connected = await checkConnectivity();
      if (!cancelled) setIsConnected(connected);
    };

    run();

    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const prev = appState.current;
      if ((prev === 'inactive' || prev === 'background') && nextState === 'active') {
        run();
      }
      appState.current = nextState;
    });

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  return { isConnected };
}
