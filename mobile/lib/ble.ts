/**
 * Bluetooth Low Energy helpers for blood pressure monitors.
 *
 * Standard BLE Blood Pressure Service:
 *   Service UUID:        00001810-0000-1000-8000-00805f9b34fb
 *   Measurement char:    00002a35-0000-1000-8000-00805f9b34fb
 *
 * The library (react-native-ble-plx) only works in a development build,
 * not in Expo Go or on web. `isBleAvailable()` reports that so the UI can
 * degrade gracefully.
 */

export const BP_SERVICE_UUID = '00001810-0000-1000-8000-00805f9b34fb';
export const BP_MEASUREMENT_CHAR_UUID = '00002a35-0000-1000-8000-00805f9b34fb';

export interface BpReading {
  systolic: number;
  diastolic: number;
  mean: number | null;
  pulse: number | null;
  timestamp: string | null;
}

let cachedManager: any = null;

export function isBleAvailable(): boolean {
  try {
    // react-native-ble-plx is a native module; requiring it in Expo Go
    // throws, which we treat as "not available".
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-ble-plx');
    return !!mod && !!mod.BleManager;
  } catch {
    return false;
  }
}

export function getBleManager(): any {
  if (cachedManager) return cachedManager;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { BleManager } = require('react-native-ble-plx');
  cachedManager = new BleManager();
  return cachedManager;
}

/**
 * Parse a standard 0x2A35 Blood Pressure Measurement value.
 * Format (little-endian):
 *   flags (1 byte)
 *   [timestamp (7 bytes) if bit 0 set]
 *   systolic, diastolic, mean (IEEE-11073 16-bit SFLOAT, 2 bytes each)
 *   [pulse (SFLOAT) if bit 2 set]
 *   [user id (1 byte) if bit 3 set]
 *   [measurement status (2 bytes) if bit 4 set]
 */
export function parseBpMeasurement(base64: string): BpReading | null {
  try {
    const raw = atob(base64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);

    let idx = 0;
    const flags = bytes[idx++];
    const hasTimestamp = (flags & 0x01) !== 0;
    const hasPulse = (flags & 0x04) !== 0;
    const hasUserId = (flags & 0x08) !== 0;
    const hasStatus = (flags & 0x10) !== 0;

    let timestamp: string | null = null;
    if (hasTimestamp) {
      const year = bytes[idx] | (bytes[idx + 1] << 8);
      const month = bytes[idx + 2];
      const day = bytes[idx + 3];
      const hour = bytes[idx + 4];
      const min = bytes[idx + 5];
      const sec = bytes[idx + 6];
      idx += 7;
      if (year > 0) {
        timestamp = new Date(year, month - 1, day, hour, min, sec).toISOString();
      }
    }

    // IEEE-11073 SFLOAT: 16-bit, mantissa in low 12 bits, exponent in high 4 bits.
    const readSfloat = (off: number): number => {
      const val = bytes[off] | (bytes[off + 1] << 8);
      const mantissa = val & 0x0fff;
      let exponent = (val >> 12) & 0x0f;
      if (exponent >= 0x08) exponent -= 0x10;
      // handle NaN / reserved
      if (mantissa === 0x07ff || mantissa === 0x0800 || mantissa === 0x07fe) {
        return NaN;
      }
      return mantissa * Math.pow(10, exponent);
    };

    const systolic = readSfloat(idx);
    const diastolic = readSfloat(idx + 2);
    const mean = readSfloat(idx + 4);
    idx += 6;

    let pulse: number | null = null;
    if (hasPulse) {
      pulse = readSfloat(idx);
      idx += 2;
    }
    if (hasUserId) idx += 1;
    if (hasStatus) idx += 2;

    if (!Number.isFinite(systolic) || !Number.isFinite(diastolic)) return null;
    return {
      systolic: Math.round(systolic),
      diastolic: Math.round(diastolic),
      mean: Number.isFinite(mean) ? Math.round(mean) : null,
      pulse: pulse !== null && Number.isFinite(pulse) ? Math.round(pulse) : null,
      timestamp,
    };
  } catch {
    return null;
  }
}

export async function scanForBpDevices(
  onDevice: (device: any) => void,
  timeoutMs = 12000,
): Promise<void> {
  const manager = getBleManager();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      manager.stopDeviceScan();
      resolve();
    }, timeoutMs);

    manager.startDeviceScan([BP_SERVICE_UUID], null, (error: any, device: any) => {
      if (error) {
        manager.stopDeviceScan();
        clearTimeout(timer);
        resolve();
        return;
      }
      if (device) {
        onDevice(device);
      }
    });
  });
}

export async function connectAndMonitor(
  device: any,
  onReading: (reading: BpReading) => void,
): Promise<() => void> {
  const conn = await device.connect();
  await conn.discoverAllServicesAndCharacteristics();
  const subscription = conn.monitorCharacteristicForService(
    BP_SERVICE_UUID,
    BP_MEASUREMENT_CHAR_UUID,
    (error: any, char: any) => {
      if (error || !char?.value) return;
      const reading = parseBpMeasurement(char.value);
      if (reading) onReading(reading);
    },
  );
  return () => {
    try { subscription?.remove?.(); } catch { /* ignore */ }
    try { conn.cancelConnection(); } catch { /* ignore */ }
  };
}