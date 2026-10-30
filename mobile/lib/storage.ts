import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const PREFIX = 'tensiocare.';

export const storageKeys = {
  accessToken: 'access_token',
  refreshToken: 'refresh_token',
  user: 'user',
  scheduledReminders: 'scheduled_reminders',
  reminderFingerprint: 'reminder_fingerprint',
} as const;

function webStorage(): Storage | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  return window.localStorage;
}

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return webStorage()?.getItem(PREFIX + key) ?? null;
  }
  return SecureStore.getItemAsync(PREFIX + key);
}

async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    webStorage()?.setItem(PREFIX + key, value);
    return;
  }
  await SecureStore.setItemAsync(PREFIX + key, value);
}

async function removeItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    webStorage()?.removeItem(PREFIX + key);
    return;
  }
  await SecureStore.deleteItemAsync(PREFIX + key);
}

export const storage = {
  getItem,
  setItem,
  removeItem,
};
