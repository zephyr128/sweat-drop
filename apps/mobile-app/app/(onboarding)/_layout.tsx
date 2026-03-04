import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', gestureEnabled: false }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="auth" />
      <Stack.Screen name="stepper" />
      <Stack.Screen name="username" />
      <Stack.Screen name="avatar" />
      <Stack.Screen name="notifications" />
    </Stack>
  );
}
