import { Redirect } from 'expo-router';

import { LoadingScreen } from '@/components/ui';
import { useAuth } from '@/lib/auth-context';

export default function Index() {
  const { status, user } = useAuth();

  if (status === 'loading') {
    return <LoadingScreen label="Opening TensioCare..." />;
  }

  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  if (user.role === 'caregiver') {
    return <Redirect href="/(caregiver)/(tabs)" />;
  }

  return <Redirect href="/(patient)/(tabs)" />;
}
