import { Stack } from 'expo-router';

export default function ArenaLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#000000' } }}>
      <Stack.Screen name="[id]/index" />
      <Stack.Screen name="[id]/leaderboard" />
    </Stack>
  );
}
