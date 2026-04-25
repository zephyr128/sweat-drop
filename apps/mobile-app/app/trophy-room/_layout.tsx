import { Stack } from 'expo-router';

// AGENT NOTE: [2026-04-25] - mobile-coder
// Nested stack so the per-category drill-down (`category/[key]`) gets the
// same iOS-style push transition as every other detail screen in the app
// (gym-detail, arena, redemptions, etc.) instead of opening as a modal
// from the bottom.
export default function TrophyRoomLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#000000' },
        animation: 'slide_from_right',
        animationDuration: 280,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="category/[key]" />
    </Stack>
  );
}
