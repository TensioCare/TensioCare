import { Redirect, Stack } from 'expo-router';

import { ReminderScheduler } from '@/components/ReminderScheduler';
import { LoadingScreen } from '@/components/ui';
import { colors } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';

export default function PatientLayout() {
  const { status, user } = useAuth();

  if (status === 'loading') {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  if (user.role !== 'patient') {
    return <Redirect href="/caregiver" />;
  }

  return (
    <>
      <ReminderScheduler />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '700' },
          headerShadowVisible: false,
          animation: 'slide_from_right',
          animationDuration: 260,
          gestureEnabled: true,
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="plan"
          options={{ headerShown: false, animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="assistant"
          options={{ headerShown: false, animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="caregivers"
          options={{ headerShown: false, animation: 'slide_from_right' }}
        />
      </Stack>
    </>
  );
}
