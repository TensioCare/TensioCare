import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '@/constants/theme';
import { formatClockTime } from '@/lib/format';
import { dateToHHMM, hhmmToDate, sortTimes } from '@/lib/time';
import { TimePickerModal } from './TimePickerModal';
import { AppText, Button, IconButton } from './ui';

export function TimeListEditor({
  times,
  onChange,
  max = 6,
}: {
  times: string[];
  onChange: (times: string[]) => void;
  max?: number;
}) {
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerValue, setPickerValue] = useState(new Date());
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  function openAdd() {
    setEditingIndex(null);
    setPickerValue(new Date());
    setPickerVisible(true);
  }

  function openEdit(index: number) {
    setEditingIndex(index);
    setPickerValue(hhmmToDate(times[index]));
    setPickerVisible(true);
  }

  function confirm(date: Date) {
    const value = dateToHHMM(date);
    if (editingIndex !== null) {
      const next = [...times];
      next[editingIndex] = value;
      onChange(sortTimes(next));
    } else {
      onChange(sortTimes([...times, value]));
    }
    setPickerVisible(false);
    setEditingIndex(null);
  }

  function remove(index: number) {
    if (times.length <= 1) return;
    onChange(times.filter((_time, current) => current !== index));
  }

  return (
    <View style={styles.wrap}>
      {times.map((time, index) => (
        <View key={`${time}-${index}`} style={styles.row}>
          <Pressable
            onPress={() => openEdit(index)}
            style={({ pressed }) => [styles.timeButton, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel={`Change measurement time ${formatClockTime(time)}`}
          >
            <Ionicons name="time-outline" size={19} color={colors.brand} />
            <AppText variant="bodyStrong" style={{ fontVariant: ['tabular-nums'] }}>
              {formatClockTime(time)}
            </AppText>
          </Pressable>
          <IconButton
            icon="close-circle-outline"
            onPress={() => remove(index)}
            accessibilityLabel="Remove this measurement time"
            tone={times.length <= 1 ? 'muted' : 'danger'}
          />
        </View>
      ))}

      {times.length < max ? (
        <Button
          title="Add another time"
          onPress={openAdd}
          variant="secondary"
          size="sm"
          fullWidth={false}
          icon="add"
        />
      ) : null}

      <TimePickerModal
        visible={pickerVisible}
        value={pickerValue}
        onClose={() => {
          setPickerVisible(false);
          setEditingIndex(null);
        }}
        onConfirm={confirm}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  timeButton: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
});
