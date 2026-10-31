import { Redirect, Stack } from 'expo-router';

import { LoadingScreen } from '@/components/ui';
import { useAuth } from '@/lib/auth-context';

export default function AuthLayout() {
  const { status, user } = useAuth();

  if (status === 'loading') {
    return <LoadingScreen />;
  }

  if (user) {
    return (
      <Redirect
        href={user.role === 'caregiver' ? '/caregiver' : '/(patient)/(tabs)'}
      />
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        animationDuration: 260,
        gestureEnabled: true,
      }}
    />
  );
}
