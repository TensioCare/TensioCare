import { Redirect, Stack } from 'expo-router';

import { LoadingScreen } from '@/components/ui';
import { colors } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';

export default function ReadingLayout() {
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
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="new" />
      <Stack.Screen name="choose" />
      <Stack.Screen name="auto" />
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
