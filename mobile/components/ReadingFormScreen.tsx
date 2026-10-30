import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { DateTimePickerModal } from '@/components/DateTimePickerModal';
import { ScreenHeader } from '@/components/ScreenHeader';
import {
  AppText,
  Badge,
  Button,
  Card,
  Chip,
  ErrorState,
  LoadingScreen,
  Notice,
  ScrollScreen,
  SectionHeader,
  TextField,
} from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { readingsApi } from '@/lib/api';
import { formatDate, formatTime } from '@/lib/format';
import type { Arm, Position, ReadingCreatePayload } from '@/lib/types';

function mergeDate(base: Date, picked: Date, mode: 'date' | 'time'): Date {
  const next = new Date(base);
  if (mode === 'date') {
    next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
  } else {
    next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
  }
  return next;
}

export function ReadingFormScreen({ readingId }: { readingId?: number }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isEdit = readingId !== undefined;
  const clientReadingId = useRef(
    `reading-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  );

  const readings = useQuery({
    queryKey: ['readings', 'list'],
    queryFn: () => readingsApi.list(500),
    enabled: isEdit,
  });
  const existing = isEdit
    ? readings.data?.find((reading) => reading.id === readingId)
    : undefined;

  const [initialized, setInitialized] = useState(false);
  const [systolic, setSystolic] = useState('');
  const [diastolic, setDiastolic] = useState('');
  const [pulse, setPulse] = useState('');
  const [resting, setResting] = useState('');
  const [notes, setNotes] = useState('');
  const [arm, setArm] = useState<Arm | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [measuredAt, setMeasuredAt] = useState(new Date());
  const [pickerMode, setPickerMode] = useState<'date' | 'time' | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!isEdit || initialized || !existing) return;
    setSystolic(String(existing.systolic));
    setDiastolic(String(existing.diastolic));
    setPulse(existing.pulse?.toString() ?? '');
    setResting(existing.resting_minutes?.toString() ?? '');
    setNotes(existing.notes ?? '');
    setArm(existing.arm);
    setPosition(existing.position);
    setMeasuredAt(new Date(existing.measured_at));
    setInitialized(true);
  }, [existing, initialized, isEdit]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['readings'] });
    void queryClient.invalidateQueries({ queryKey: ['assessment'] });
    void queryClient.invalidateQueries({ queryKey: ['adherence'] });
    void queryClient.invalidateQueries({ queryKey: ['reminder-windows'] });
  };

  const save = useMutation({
    mutationFn: () => {
      const systolicValue = Number(systolic);
      const diastolicValue = Number(diastolic);
      const pulseValue = pulse.trim() ? Number(pulse) : null;
      const restingValue = resting.trim() ? Number(resting) : null;

      if (
        !Number.isInteger(systolicValue) ||
        systolicValue < 50 ||
        systolicValue > 300
      ) {
        throw new Error('Systolic must be a whole number between 50 and 300.');
      }
      if (
        !Number.isInteger(diastolicValue) ||
        diastolicValue < 30 ||
        diastolicValue > 200
      ) {
        throw new Error('Diastolic must be a whole number between 30 and 200.');
      }
      if (systolicValue <= diastolicValue) {
        throw new Error('Systolic must be higher than diastolic.');
      }
      if (
        pulseValue !== null &&
        (!Number.isInteger(pulseValue) || pulseValue < 20 || pulseValue > 250)
      ) {
        throw new Error('Pulse must be a whole number between 20 and 250.');
      }
      if (
        restingValue !== null &&
        (!Number.isInteger(restingValue) || restingValue < 0 || restingValue > 180)
      ) {
        throw new Error('Resting time must be between 0 and 180 minutes.');
      }

      const payload: ReadingCreatePayload = {
        systolic: systolicValue,
        diastolic: diastolicValue,
        pulse: pulseValue,
        measured_at: measuredAt.toISOString(),
        notes: notes.trim() || null,
        arm,
        position,
        resting_minutes: restingValue,
      };

      if (isEdit) {
        return readingsApi.update(readingId!, payload);
      }
      return readingsApi.create({
        ...payload,
        client_reading_id: clientReadingId.current,
      });
    },
    onSuccess: () => {
      invalidate();
      router.back();
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : 'Please try again.');
    },
  });

  const remove = useMutation({
    mutationFn: () => readingsApi.remove(readingId!),
    onSuccess: () => {
      invalidate();
      router.back();
    },
    onError: (error) => {
      Alert.alert(
        'Could not delete reading',
        error instanceof Error ? error.message : 'Please try again.',
      );
    },
  });

  function confirmDelete() {
    Alert.alert(
      'Delete this reading?',
      'This cannot be undone. Your averages and adherence will be recalculated.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => remove.mutate(),
        },
      ],
    );
  }

  if (isEdit && readings.isLoading && !readings.data) {
    return <LoadingScreen label="Loading reading..." />;
  }

  if (isEdit && readings.isError && !readings.data) {
    return (
      <ScrollScreen edges={[]}>
        <ErrorState
          message="We could not load this reading. Check your connection and try again."
          onRetry={() => void readings.refetch()}
        />
      </ScrollScreen>
    );
  }

  if (isEdit && readings.isSuccess && !existing) {
    return (
      <ScrollScreen edges={[]}>
        <ErrorState message="This reading no longer exists." />
      </ScrollScreen>
    );
  }

  return (
    <ScrollScreen edges={[]} contentContainerStyle={{ paddingBottom: 60 }}>
      <ScreenHeader
        eyebrow={isEdit ? 'Correct a record' : 'New measurement'}
        title={isEdit ? 'Edit reading' : 'Log a reading'}
        subtitle="Sit quietly for five minutes before measuring, if you can."
      />

      {formError ? (
        <Notice tone="danger" title="Check the reading" message={formError} />
      ) : null}

      <SectionHeader title="Blood pressure" />
      <Card style={{ gap: spacing.md }}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <TextField
            label="Systolic"
            placeholder="120"
            value={systolic}
            onChangeText={setSystolic}
            keyboardType="number-pad"
            maxLength={3}
            style={{ flex: 1 }}
            inputStyle={styles.bigInput}
          />
          <TextField
            label="Diastolic"
            placeholder="80"
            value={diastolic}
            onChangeText={setDiastolic}
            keyboardType="number-pad"
            maxLength={3}
            style={{ flex: 1 }}
            inputStyle={styles.bigInput}
          />
        </View>
        <AppText variant="caption" tone="muted">
          mmHg · systolic is the top number, diastolic is the bottom number.
        </AppText>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <TextField
            label="Pulse (optional)"
            placeholder="72"
            value={pulse}
            onChangeText={setPulse}
            keyboardType="number-pad"
            maxLength={3}
            style={{ flex: 1 }}
          />
          <TextField
            label="Resting (min)"
            placeholder="5"
            value={resting}
            onChangeText={setResting}
            keyboardType="number-pad"
            maxLength={3}
            style={{ flex: 1 }}
          />
        </View>
      </Card>

      <SectionHeader title="When" />
      <Card style={{ gap: spacing.md }}>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <Pressable
            onPress={() => setPickerMode('date')}
            style={({ pressed }) => [styles.pickerButton, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="calendar-outline" size={18} color={colors.brand} />
            <AppText variant="bodyStrong">{formatDate(measuredAt)}</AppText>
          </Pressable>
          <Pressable
            onPress={() => setPickerMode('time')}
            style={({ pressed }) => [styles.pickerButton, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="time-outline" size={18} color={colors.brand} />
            <AppText variant="bodyStrong">{formatTime(measuredAt)}</AppText>
          </Pressable>
        </View>
        <AppText variant="caption" tone="muted">
          A reading up to 60 minutes before a scheduled measurement still counts
          for that window.
        </AppText>
      </Card>

      <SectionHeader title="Context" />
      <Card style={{ gap: spacing.md }}>
        <View style={{ gap: 8 }}>
          <AppText variant="label">Arm</AppText>
          <View style={styles.chips}>
            <Chip
              label="Left arm"
              selected={arm === 'left'}
              onPress={() => setArm(arm === 'left' ? null : 'left')}
            />
            <Chip
              label="Right arm"
              selected={arm === 'right'}
              onPress={() => setArm(arm === 'right' ? null : 'right')}
            />
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <AppText variant="label">Position</AppText>
          <View style={styles.chips}>
            <Chip
              label="Sitting"
              selected={position === 'sitting'}
              onPress={() => setPosition(position === 'sitting' ? null : 'sitting')}
            />
            <Chip
              label="Standing"
              selected={position === 'standing'}
              onPress={() => setPosition(position === 'standing' ? null : 'standing')}
            />
            <Chip
              label="Lying"
              selected={position === 'lying'}
              onPress={() => setPosition(position === 'lying' ? null : 'lying')}
            />
          </View>
        </View>

        <TextField
          label="Notes (optional)"
          placeholder="Anything that may have affected this reading"
          value={notes}
          onChangeText={setNotes}
          multiline
          inputStyle={styles.textArea}
        />
      </Card>

      <Button
        title={isEdit ? 'Save changes' : 'Save reading'}
        onPress={() => save.mutate()}
        loading={save.isPending}
        size="lg"
      />

      {isEdit ? (
        <Button
          title="Delete reading"
          onPress={confirmDelete}
          variant="danger"
          icon="trash-outline"
          loading={remove.isPending}
        />
      ) : null}

      {isEdit && existing ? (
        <View style={styles.footerMeta}>
          <Badge label={`Source: ${existing.source}`} tone="muted" />
          <AppText variant="caption" tone="muted">
            Logged {formatDate(existing.measured_at)}
          </AppText>
        </View>
      ) : null}

      <DateTimePickerModal
        visible={pickerMode !== null}
        mode={pickerMode ?? 'date'}
        value={measuredAt}
        onClose={() => setPickerMode(null)}
        onConfirm={(date) => {
          if (pickerMode) setMeasuredAt(mergeDate(measuredAt, date, pickerMode));
          setPickerMode(null);
        }}
      />
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  bigInput: {
    fontSize: 26,
    fontWeight: '800',
    minHeight: 54,
    paddingVertical: 8,
  },
  pickerButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  textArea: { minHeight: 82, textAlignVertical: 'top', paddingTop: 12 },
  footerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
});
