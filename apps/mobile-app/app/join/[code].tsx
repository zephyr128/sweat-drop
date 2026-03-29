import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { usePendingReferralStore } from '@/lib/stores/usePendingReferralStore';
import { log } from '@/lib/logger';

export default function JoinCodeRoute() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const setPendingCode = usePendingReferralStore((s) => s.setPendingCode);

  useEffect(() => {
    if (code) {
      log.debug('[JoinRoute] Referral code from route:', code);
      setPendingCode(code);
    }
    router.replace('/home');
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
