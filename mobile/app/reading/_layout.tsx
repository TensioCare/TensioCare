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
    return <Redirect href="/(caregiver)/(tabs)" />;
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="new" options={{ title: 'Log a reading' }} />
      <Stack.Screen name="[id]" options={{ title: 'Edit reading' }} />
    </Stack>
  );
}
