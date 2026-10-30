import Constants from 'expo-constants';
import { Platform } from 'react-native';

export const APP_NAME = 'TensioCare';

function developmentHost(): string | null {
  const config = Constants.expoConfig as
    | (typeof Constants.expoConfig & { hostUri?: string })
    | null;
  const manifest = Constants.manifest2 as
    | { extra?: { expoGo?: { debuggerHost?: string } } }
    | null;
  const legacyManifest = Constants.manifest as
    | { debuggerHost?: string }
    | null;

  const hostUri =
    config?.hostUri ??
    manifest?.extra?.expoGo?.debuggerHost ??
    legacyManifest?.debuggerHost;

  if (!hostUri) return null;
  return hostUri.split(':')[0] || null;
}

function defaultApiUrl(): string {
  let host = developmentHost() ?? 'localhost';
  if (Platform.OS === 'android' && (host === 'localhost' || host === '127.0.0.1')) {
    host = '10.0.2.2';
  }
  return `http://${host}:8000/api/v1`;
}

const configuredUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

/**
 * The API URL is auto-detected from the Expo dev server host so a physical
 * phone can reach the backend on the same Wi-Fi without extra configuration.
 * Override it with EXPO_PUBLIC_API_URL when the API is deployed.
 */
export const API_BASE_URL = (configuredUrl || defaultApiUrl()).replace(/\/+$/, '');

export const EAS_PROJECT_ID = process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim() || null;

export const IS_WEB = Platform.OS === 'web';
