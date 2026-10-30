import { Redirect, Stack } from 'expo-router';

import { LoadingScreen } from '@/components/ui';
import { colors } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';

export default function CaregiverLayout() {
  const { status, user } = useAuth();

  if (status === 'loading') {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  if (user.role !== 'caregiver') {
    return <Redirect href="/(patient)/(tabs)" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
