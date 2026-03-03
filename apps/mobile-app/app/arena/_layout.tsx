import { Stack } from 'expo-router';

export default function ArenaLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="[id]/index" />
      <Stack.Screen name="[id]/leaderboard" />
    </Stack>
  );
}
