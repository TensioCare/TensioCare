import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useAuth } from '@/lib/auth-context';
import {
  addNotificationResponseListener,
  registerForPushNotifications,
} from '@/lib/notifications';

/**
 * Registers the Expo push token and routes notification taps to the inbox.
 * Push delivery itself is optional; the inbox and local reminders still work.
 */
export function NotificationBridge() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!user) return;
    void registerForPushNotifications().catch(() => undefined);
  }, [user]);

  useEffect(() => {
    return addNotificationResponseListener(() => {
      if (!user) return;
      if (user.role === 'caregiver') {
        router.push('/caregiver/alerts');
      } else {
        router.push('/(patient)/(tabs)/alerts');
      }
    });
  }, [router, user]);

  return null;
}
