import { useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, spacing } from '@/constants/theme';
import { AppText, Button } from './ui';

const ITEM_HEIGHT = 40;
const LIST_HEIGHT = ITEM_HEIGHT * 5;

const HOURS = Array.from({ length: 24 }, (_, index) =>
  String(index).padStart(2, '0'),
);
const MINUTES = Array.from({ length: 60 }, (_, index) =>
  String(index).padStart(2, '0'),
);

/**
 * The community date/time picker has no web implementation (it renders
 * nothing), so the browser preview uses these sheets instead. Native builds
 * keep the platform pickers.
 */
function Sheet({
  visible,
  title,
  onClose,
  onConfirm,
  confirmLabel = 'Done',
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  if (!visible) return null;

  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, spacing.lg) },
          ]}
          onPress={() => undefined}
        >
          <View style={styles.handle} />
          <AppText variant="subtitle">{title}</AppText>
          {children}
          <View style={styles.actions}>
            <Button
              title="Cancel"
              onPress={onClose}
              variant="secondary"
              fullWidth={false}
              style={{ flex: 1 }}
            />
            <Button
              title={confirmLabel}
              onPress={onConfirm}
              fullWidth={false}
              style={{ flex: 1 }}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Wheel({
  values,
  selected,
  onSelect,
}: {
  values: string[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);

  useEffect(() => {
    const index = Math.max(values.indexOf(selected), 0);
    const offset = Math.max(index * ITEM_HEIGHT - ITEM_HEIGHT * 2, 0);
    scrollRef.current?.scrollTo({ y: offset, animated: false });
  }, [selected, values]);

  return (
    <ScrollView
      ref={scrollRef}
      style={{ height: LIST_HEIGHT }}
      contentContainerStyle={{ paddingVertical: spacing.sm }}
      showsVerticalScrollIndicator={false}
    >
      {values.map((value) => {
        const isSelected = value === selected;
        return (
          <Pressable
            key={value}
            onPress={() => onSelect(value)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            style={({ pressed }) => [
              styles.wheelItem,
              isSelected && styles.wheelItemSelected,
              pressed && !isSelected && { backgroundColor: colors.cardMuted },
            ]}
          >
            <AppText
              variant="bodyStrong"
              style={{
                fontVariant: ['tabular-nums'],
                color: isSelected ? colors.onBrand : colors.text,
              }}
            >
              {value}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function WebTimeSheet({
  visible,
  value,
  title = 'Choose a time',
  confirmLabel,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  value: Date;
  title?: string;
  confirmLabel?: string;
  onClose: () => void;
  onConfirm: (date: Date) => void;
}) {
  const [hour, setHour] = useState(String(value.getHours()).padStart(2, '0'));
  const [minute, setMinute] = useState(
    String(value.getMinutes()).padStart(2, '0'),
  );

  useEffect(() => {
    if (!visible) return;
    setHour(String(value.getHours()).padStart(2, '0'));
    setMinute(String(value.getMinutes()).padStart(2, '0'));
  }, [value, visible]);

  function confirm() {
    const next = new Date(value);
    next.setHours(Number(hour), Number(minute), 0, 0);
    onConfirm(next);
  }

  return (
    <Sheet
      visible={visible}
      title={title}
      onClose={onClose}
      onConfirm={confirm}
      confirmLabel={confirmLabel}
    >
      <View style={styles.timeHeader}>
        <AppText variant="display" style={styles.timePreview}>
          {hour}:{minute}
        </AppText>
      </View>
      <View style={styles.wheels}>
        <View style={{ flex: 1 }}>
          <AppText variant="label" tone="brand" style={styles.wheelLabel}>
            Hour
          </AppText>
          <Wheel values={HOURS} selected={hour} onSelect={setHour} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="label" tone="brand" style={styles.wheelLabel}>
            Minute
          </AppText>
          <Wheel values={MINUTES} selected={minute} onSelect={setMinute} />
        </View>
      </View>
    </Sheet>
  );
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function WebDateSheet({
  visible,
  value,
  title = 'Choose a date',
  onClose,
  onConfirm,
}: {
  visible: boolean;
  value: Date;
  title?: string;
  onClose: () => void;
  onConfirm: (date: Date) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [month, setMonth] = useState(
    new Date(value.getFullYear(), value.getMonth(), 1),
  );

  useEffect(() => {
    if (!visible) return;
    setDraft(value);
    setMonth(new Date(value.getFullYear(), value.getMonth(), 1));
  }, [value, visible]);

  const today = new Date();
  const firstWeekday = (month.getDay() + 6) % 7;
  const daysInMonth = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0,
  ).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  function shiftMonth(delta: number) {
    setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1));
  }

  function pick(day: number) {
    const next = new Date(draft);
    next.setFullYear(month.getFullYear(), month.getMonth(), day);
    setDraft(next);
  }

  return (
    <Sheet
      visible={visible}
      title={title}
      onClose={onClose}
      onConfirm={() => onConfirm(draft)}
    >
      <View style={styles.monthRow}>
        <Pressable
          onPress={() => shiftMonth(-1)}
          style={styles.monthButton}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
        >
          <AppText variant="bodyStrong" tone="brand">
            ‹
          </AppText>
        </Pressable>
        <AppText variant="bodyStrong">{monthLabel(month)}</AppText>
        <Pressable
          onPress={() => shiftMonth(1)}
          style={styles.monthButton}
          accessibilityRole="button"
          accessibilityLabel="Next month"
        >
          <AppText variant="bodyStrong" tone="brand">
            ›
          </AppText>
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((label) => (
          <AppText
            key={label}
            variant="tiny"
            tone="muted"
            style={styles.weekCell}
          >
            {label}
          </AppText>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((day, index) => {
          if (day === null) {
            return <View key={`empty-${index}`} style={styles.dayCell} />;
          }
          const date = new Date(month.getFullYear(), month.getMonth(), day);
          const selected = isSameDay(date, draft);
          const isToday = isSameDay(date, today);
          return (
            <Pressable
              key={`day-${day}`}
              onPress={() => pick(day)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                styles.dayCell,
                isToday && !selected && styles.dayToday,
                selected && styles.daySelected,
                pressed && !selected && { backgroundColor: colors.cardMuted },
              ]}
            >
              <AppText
                variant="bodyStrong"
                style={{
                  color: selected ? colors.onBrand : colors.text,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {day}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
  },
  actions: { flexDirection: 'row', gap: spacing.md },
  timeHeader: { alignItems: 'center' },
  timePreview: { color: colors.brandDark, fontVariant: ['tabular-nums'] },
  wheels: { flexDirection: 'row', gap: spacing.lg },
  wheelLabel: { textAlign: 'center', marginBottom: spacing.xs },
  wheelItem: {
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  wheelItemSelected: { backgroundColor: colors.brand },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  weekRow: { flexDirection: 'row' },
  weekCell: { flex: 1, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: {
    width: `${100 / 7}%`,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  dayToday: { borderWidth: 1, borderColor: colors.brandMuted },
  daySelected: { backgroundColor: colors.brand },
});
