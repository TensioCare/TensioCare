import { Alert, Platform } from 'react-native';

/**
 * React Native Web's Alert.alert is a no-op, so web needs a small bridge.
 * Keeping these helpers in one place makes confirmations behave the same on
 * native and in the browser preview.
 */
export function showAlert(title: string, message?: string): void {
  const text = message ? `${title}\n\n${message}` : title;
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(text);
    return;
  }
  Alert.alert(title, message);
}

export function confirmAction({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}): void {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return;
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }

  Alert.alert(title, message, [
    { text: cancelLabel, style: 'cancel' },
    {
      text: confirmLabel,
      style: destructive ? 'destructive' : 'default',
      onPress: onConfirm,
    },
  ]);
}
