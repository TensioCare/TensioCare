import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { colors } from '@/constants/theme';
import { EAS_PROJECT_ID, IS_WEB } from './config';
import { notificationsApi } from './api';
import { storage, storageKeys } from './storage';
import type { MeasurementWindow } from './types';

const CHANNEL_ID = 'measurements';
const MAX_SCHEDULED = 24;

let configured = false;

export function configureNotifications(): void {
  if (IS_WEB || configured) return;
  configured = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Measurement reminders',
      description: 'Reminders for scheduled blood pressure measurements',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: colors.brand,
      sound: 'default',
    }).catch((error) => console.warn('Could not create notification channel', error));
  }
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (IS_WEB) return false;

  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (current.canAskAgain === false) return false;

  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

async function readScheduledIds(): Promise<string[]> {
  const raw = await storage.getItem(storageKeys.scheduledReminders);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

async function writeScheduledIds(ids: string[]): Promise<void> {
  await storage.setItem(storageKeys.scheduledReminders, JSON.stringify(ids));
}

export async function cancelScheduledReminders(): Promise<void> {
  if (IS_WEB) return;
  const ids = await readScheduledIds();
  await Promise.all(
    ids.map((id) =>
      Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined),
    ),
  );
  await writeScheduledIds([]);
  await storage.removeItem(storageKeys.reminderFingerprint);
}

/**
 * Mirrors the backend's pending measurement windows into local notifications.
 * This keeps reminders working even when remote push is not configured.
 */
export async function syncMeasurementReminders(
  windows: MeasurementWindow[],
): Promise<number> {
  if (IS_WEB) return 0;

  const now = Date.now();
  const horizon = now + 7 * 24 * 60 * 60 * 1000;
  const pending = windows
    .filter((window) => {
      const due = new Date(window.due_at).getTime();
      return window.status === 'pending' && due > now + 30_000 && due < horizon;
    })
    .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime())
    .slice(0, MAX_SCHEDULED);

  const fingerprint = pending
    .map((window) => `${window.id}:${window.due_at}`)
    .join('|');

  if (!pending.length) {
    await cancelScheduledReminders();
    return 0;
  }

  const lastFingerprint = await storage.getItem(storageKeys.reminderFingerprint);
  if (lastFingerprint === fingerprint) return pending.length;

  const granted = await ensureNotificationPermission();
  if (!granted) return 0;

  await cancelScheduledReminders();

  const scheduled: string[] = [];
  for (const window of pending) {
    const identifier = `measurement-window-${window.id}`;
    try {
      await Notifications.scheduleNotificationAsync({
        identifier,
        content: {
          title: 'Time to measure your blood pressure',
          body: 'Take a moment to sit quietly and record your reading.',
          data: { windowId: window.id, type: 'measurement_reminder' },
          sound: 'default',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(window.due_at),
          channelId: CHANNEL_ID,
        },
      });
      scheduled.push(identifier);
    } catch (error) {
      console.warn('Could not schedule measurement reminder', error);
    }
  }

  await writeScheduledIds(scheduled);
  await storage.setItem(storageKeys.reminderFingerprint, fingerprint);
  return scheduled.length;
}

export async function registerForPushNotifications(): Promise<string | null> {
  if (IS_WEB || !Device.isDevice || !EAS_PROJECT_ID) return null;

  const granted = await ensureNotificationPermission();
  if (!granted) return null;

  try {
    const token = await Notifications.getExpoPushTokenAsync({
      projectId: EAS_PROJECT_ID,
    });
    const platform = Platform.OS === 'ios' ? 'ios' : 'android';
    await notificationsApi.registerDevice(token.data, platform);
    return token.data;
  } catch (error) {
    // Expo Go on Android and builds without FCM/APNs credentials can fail here.
    console.warn('Push registration unavailable', error);
    return null;
  }
}

export function addNotificationResponseListener(
  listener: (response: Notifications.NotificationResponse) => void,
): () => void {
  if (IS_WEB) return () => undefined;
  const subscription = Notifications.addNotificationResponseReceivedListener(listener);
  return () => subscription.remove();
}
