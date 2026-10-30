import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-reanimated';

import { NotificationBridge } from '@/components/NotificationBridge';
import { colors } from '@/constants/theme';
import { AuthProvider } from '@/lib/auth-context';
import { configureNotifications } from '@/lib/notifications';
import { queryClient } from '@/lib/query-client';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  anchor: 'index',
};

export default function RootLayout() {
  useEffect(() => {
    configureNotifications();
  }, []);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <StatusBar style="dark" />
          <NotificationBridge />
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
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(patient)" />
            <Stack.Screen name="(caregiver)" />
            <Stack.Screen name="reading" options={{ presentation: 'modal' }} />
            <Stack.Screen name="+not-found" />
          </Stack>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
