import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', gestureEnabled: false }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="auth" />
      <Stack.Screen name="verify-email" />
      <Stack.Screen name="stepper" />
      <Stack.Screen name="username" />
      <Stack.Screen name="avatar" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="step-gender" />
      <Stack.Screen name="step-weight" />
      <Stack.Screen name="step-height" />
      <Stack.Screen name="step-birthday" />
      <Stack.Screen name="step-goal" />
      <Stack.Screen name="home-gym" />
    </Stack>
  );
}
