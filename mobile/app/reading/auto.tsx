import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ScreenHeader } from '@/components/ScreenHeader';
import {
  AppText,
  Badge,
  Button,
  Card,
  ErrorState,
  LoadingScreen,
  Notice,
  ScrollScreen,
  SectionHeader,
  TextField,
} from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { devicesApi, insightsApi, readingsApi } from '@/lib/api';
import { confirmAction, showAlert } from '@/lib/dialogs';
import { formatDateTime } from '@/lib/format';
import type { Device, Reading } from '@/lib/types';

export default function AutoMeasureScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const devices = useQuery({
    queryKey: ['devices'],
    queryFn: devicesApi.list,
  });

  const readings = useQuery({
    queryKey: ['readings', 'latest'],
    queryFn: () => readingsApi.list(1),
    refetchInterval: 5_000,
  });

  const [serial, setSerial] = useState('');
  const [label, setLabel] = useState('');
  const [autoReceive, setAutoReceive] = useState(true);
  const [received, setReceived] = useState<Reading | null>(null);
  const lastSeenId = useRef<number | null>(null);

  // Detect a newly arrived reading while auto-receive is on.
  useEffect(() => {
    const latest = readings.data?.[0];
    if (!latest) return;
    if (lastSeenId.current === null) {
      lastSeenId.current = latest.id;
      return;
    }
    if (autoReceive && latest.id !== lastSeenId.current) {
      lastSeenId.current = latest.id;
      setReceived(latest);
      void queryClient.invalidateQueries({ queryKey: ['readings'] });
      void queryClient.invalidateQueries({ queryKey: ['assessment'] });
      void queryClient.invalidateQueries({ queryKey: ['risk'] });
    }
  }, [readings.data, autoReceive, queryClient]);

  const pair = useMutation({
    mutationFn: () =>
      devicesApi.register({
        serial_number: serial.trim(),
        label: label.trim() || null,
      }),
    onSuccess: () => {
      setSerial('');
      setLabel('');
      void queryClient.invalidateQueries({ queryKey: ['devices'] });
      showAlert('Device paired', 'Your monitor is now linked for auto-receive.');
    },
    onError: (error) => {
      showAlert(
        'Could not pair device',
        error instanceof Error ? error.message : 'Please try again.',
      );
    },
  });

  const unpair = useMutation({
    mutationFn: (deviceId: number) => devicesApi.remove(deviceId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['devices'] });
    },
    onError: (error) => {
      showAlert(
        'Could not remove device',
        error instanceof Error ? error.message : 'Please try again.',
      );
    },
  });

  function confirmUnpair(device: Device) {
    confirmAction({
      title: 'Remove this device?',
      message: 'Readings already saved stay in your history.',
      confirmLabel: 'Remove',
      destructive: true,
      onConfirm: () => unpair.mutate(device.id),
    });
  }

  if (devices.isLoading && !devices.data) {
    return <LoadingScreen label="Loading devices..." />;
  }

  const paired = devices.data ?? [];
  const hasDevice = paired.length > 0;

  return (
    <ScrollScreen contentContainerStyle={{ paddingBottom: 60 }}>
      <ScreenHeader
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        eyebrow="Auto measurement"
        title="Connect a device"
        subtitle="Pair a blood pressure monitor to receive readings automatically."
      />

      {received ? (
        <Notice
          tone="success"
          title="New reading received"
          message={`${received.systolic}/${received.diastolic} mmHg · ${formatDateTime(received.measured_at)}`}
        />
      ) : null}

      <SectionHeader title="Paired devices" />
      <Card style={{ gap: spacing.md }}>
        {hasDevice ? (
          paired.map((device) => (
            <View key={device.id} style={styles.deviceRow}>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="bodyStrong">
                  {device.label || device.model || 'Blood pressure monitor'}
                </AppText>
                <AppText variant="caption" tone="muted">
                  Serial {device.serial_number}
                  {device.last_synced_at
                    ? ` · last sync ${formatDateTime(device.last_synced_at)}`
                    : ''}
                </AppText>
              </View>
              <Badge
                label={device.is_active ? 'Active' : 'Inactive'}
                tone={device.is_active ? 'success' : 'muted'}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove device"
                onPress={() => confirmUnpair(device)}
                hitSlop={8}
              >
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
              </Pressable>
            </View>
          ))
        ) : (
          <AppText variant="caption" tone="muted">
            No device paired yet. Enter your monitor's serial number below.
          </AppText>
        )}

        <View style={{ gap: 8 }}>
          <AppText variant="label">Auto-receive</AppText>
          <Pressable
            onPress={() => setAutoReceive((v) => !v)}
            style={({ pressed }) => [
              styles.toggleRow,
              pressed && { opacity: 0.8 },
            ]}
          >
            <Ionicons
              name={autoReceive ? 'radio-button-on' : 'radio-button-off'}
              size={20}
              color={autoReceive ? colors.brand : colors.muted}
            />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="bodyStrong">
                {autoReceive ? 'Listening for measurements' : 'Auto-receive off'}
              </AppText>
              <AppText variant="caption" tone="muted">
                {autoReceive
                  ? 'New readings from your monitor appear here automatically.'
                  : 'Turn on to receive readings without manual entry.'}
              </AppText>
            </View>
          </Pressable>
        </View>
      </Card>

      {!hasDevice ? (
        <>
          <SectionHeader title="Pair a new monitor" />
          <Card style={{ gap: spacing.md }}>
            <TextField
              label="Serial number"
              placeholder="SN-123456"
              value={serial}
              onChangeText={setSerial}
              autoCapitalize="characters"
            />
            <TextField
              label="Label (optional)"
              placeholder="Home cuff"
              value={label}
              onChangeText={setLabel}
            />
            <Button
              title="Pair device"
              onPress={() => pair.mutate()}
              loading={pair.isPending}
              disabled={!serial.trim()}
              size="lg"
            />
          </Card>
        </>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        <Button
          title="Manual entry instead"
          variant="ghost"
          onPress={() => router.replace('/reading/new')}
        />
        <AppText variant="caption" tone="muted" style={{ textAlign: 'center' }}>
          Your monitor must be configured to post readings to this app. Readings
          received are saved automatically and feed your risk assessment.
        </AppText>
      </View>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
});
