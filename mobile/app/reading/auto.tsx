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
import {
  connectAndMonitor,
  isBleAvailable,
  parseBpMeasurement,
  scanForBpDevices,
  type BpReading,
} from '@/lib/ble';
import type { Device, Reading } from '@/lib/types';

type BleDevice = { id: string; name: string | null };

export default function AutoMeasureScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const bleAvailable = isBleAvailable();

  const devices = useQuery({
    queryKey: ['devices'],
    queryFn: devicesApi.list,
  });

  const readings = useQuery({
    queryKey: ['readings', 'latest'],
    queryFn: () => readingsApi.list(1),
    refetchInterval: 5_000,
  });

  const [scanning, setScanning] = useState(false);
  const [found, setFound] = useState<BleDevice[]>([]);
  const [connectedId, setConnectedId] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [received, setReceived] = useState<Reading | null>(null);
  const [serial, setSerial] = useState('');
  const [label, setLabel] = useState('');
  const [autoReceive, setAutoReceive] = useState(true);
  const cleanupRef = useRef<(() => void) | null>(null);
  const lastSeenId = useRef<number | null>(null);

  // Detect a newly arrived reading while listening.
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

  // Cleanup BLE connection on unmount.
  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, []);

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

  async function startScan() {
    if (!bleAvailable) {
      showAlert(
        'Bluetooth not available',
        'Bluetooth scanning requires a development build. In Expo Go or on web, pair a device by serial number instead.',
      );
      return;
    }
    setScanning(true);
    setFound([]);
    try {
      await scanForBpDevices((device) => {
        setFound((prev) =>
          prev.some((d) => d.id === device.id) ? prev : [...prev, { id: device.id, name: device.name }],
        );
      });
    } finally {
      setScanning(false);
    }
  }

  async function connectToDevice(device: BleDevice) {
    if (!bleAvailable) return;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { BleManager } = require('react-native-ble-plx');
    const manager = new (BleManager as any)();
    let bleDevice: any = null;
    try {
      bleDevice = await manager.devices([device.id]).then((ds: any[]) => ds[0]);
      if (!bleDevice) {
        // device not cached; re-scan by id is not supported, fall back to name
        bleDevice = { id: device.id, name: device.name };
      }
    } catch {
      bleDevice = { id: device.id, name: device.name };
    }

    // Register the device in the backend (idempotent-ish: ignore 409).
    try {
      await devicesApi.register({ serial_number: device.id, label: device.name });
      void queryClient.invalidateQueries({ queryKey: ['devices'] });
    } catch {
      // already registered — fine
    }

    setConnectedId(device.id);
    setListening(true);

    // Connect and monitor. We need the actual device object from the manager.
    try {
      const dev = await manager.connectToDevice(device.id);
      await dev.discoverAllServicesAndCharacteristics();
      const sub = dev.monitorCharacteristicForService(
        '00001810-0000-1000-8000-00805f9b34fb',
        '00002a35-0000-1000-8000-00805f9b34fb',
        async (_err: any, char: any) => {
          if (!char?.value) return;
          const reading = parseBpMeasurement(char.value);
          if (!reading) return;
          try {
            const saved = await readingsApi.create({
              systolic: reading.systolic,
              diastolic: reading.diastolic,
              pulse: reading.pulse,
              measured_at: reading.timestamp ?? new Date().toISOString(),
              notes: 'Received via Bluetooth',
              symptoms: [],
              device_serial: device.id,
              client_reading_id: `ble-${device.id}-${Date.now()}`,
            });
            setReceived(saved);
            void queryClient.invalidateQueries({ queryKey: ['readings'] });
            void queryClient.invalidateQueries({ queryKey: ['assessment'] });
            void queryClient.invalidateQueries({ queryKey: ['risk'] });
          } catch {
            // ignore transient errors
          }
        },
      );
      cleanupRef.current = () => {
        try { sub?.remove?.(); } catch { /* ignore */ }
        try { dev.cancelConnection(); } catch { /* ignore */ }
      };
    } catch (e) {
      setListening(false);
      setConnectedId(null);
      showAlert('Connection failed', e instanceof Error ? e.message : 'Could not connect to the monitor.');
    }
  }

  function stopListening() {
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    setListening(false);
    setConnectedId(null);
  }

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

      {bleAvailable ? (
        <Card style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <AppText variant="subtitle">Scan for monitors</AppText>
            <Button
              title={scanning ? 'Scanning…' : 'Scan'}
              size="sm"
              onPress={startScan}
              loading={scanning}
            />
          </View>
          {found.length === 0 && !scanning ? (
            <AppText variant="caption" tone="muted">
              Tap Scan to look for nearby blood pressure monitors.
            </AppText>
          ) : null}
          {found.map((d) => (
            <Pressable
              key={d.id}
              onPress={() => connectToDevice(d)}
              style={({ pressed }) => [
                styles.deviceRow,
                pressed && { opacity: 0.8 },
              ]}
            >
              <Ionicons name="bluetooth" size={18} color={colors.brand} />
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="bodyStrong">{d.name || 'Unknown device'}</AppText>
                <AppText variant="caption" tone="muted">{d.id}</AppText>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </Pressable>
          ))}
          {listening ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Ionicons name="pulse" size={16} color={colors.success} />
              <AppText variant="caption" tone="muted">
                Listening for measurements from {connectedId}…
              </AppText>
              <Button title="Stop" variant="ghost" size="sm" onPress={stopListening} />
            </View>
          ) : null}
        </Card>
      ) : (
        <Notice
          tone="info"
          title="Bluetooth unavailable here"
          message="Bluetooth scanning requires a development build. In Expo Go or on web, pair a device by serial number below."
        />
      )}

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
            No device paired yet.
          </AppText>
        )}
      </Card>

      <SectionHeader title="Pair by serial number" />
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

      <View style={{ gap: spacing.sm }}>
        <Button
          title="Manual entry instead"
          variant="ghost"
          onPress={() => router.replace('/reading/new')}
        />
        <AppText variant="caption" tone="muted" style={{ textAlign: 'center' }}>
          Readings received from a monitor are saved automatically and feed your
          risk assessment.
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
});
