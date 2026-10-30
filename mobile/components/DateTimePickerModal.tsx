import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, spacing } from '@/constants/theme';
import { WebDateSheet, WebTimeSheet } from './WebPickerSheet';
import { AppText, Button } from './ui';

export function DateTimePickerModal({
  visible,
  mode,
  value,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  mode: 'date' | 'time';
  value: Date;
  onClose: () => void;
  onConfirm: (date: Date) => void;
}) {
  const [draft, setDraft] = useState(value);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (visible) setDraft(value);
  }, [value, visible]);

  if (!visible) return null;

  if (Platform.OS === 'web') {
    return mode === 'date' ? (
      <WebDateSheet
        visible={visible}
        value={value}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    ) : (
      <WebTimeSheet
        visible={visible}
        value={value}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );
  }

  if (Platform.OS === 'android') {
    return (
      <DateTimePicker
        value={draft}
        mode={mode}
        display="default"
        onChange={(event: DateTimePickerEvent, date?: Date) => {
          if (event.type === 'dismissed' || !date) {
            onClose();
            return;
          }
          onConfirm(date);
        }}
      />
    );
  }

  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}
          onPress={() => undefined}
        >
          <View style={styles.handle} />
          <AppText variant="subtitle">
            {mode === 'date' ? 'Choose a date' : 'Choose a time'}
          </AppText>
          <DateTimePicker
            value={draft}
            mode={mode}
            display="spinner"
            onChange={(_event: DateTimePickerEvent, date?: Date) => {
              if (date) setDraft(date);
            }}
            style={styles.picker}
          />
          <View style={styles.actions}>
            <Button
              title="Cancel"
              onPress={onClose}
              variant="secondary"
              fullWidth={false}
              style={{ flex: 1 }}
            />
            <Button
              title="Done"
              onPress={() => onConfirm(draft)}
              fullWidth={false}
              style={{ flex: 1 }}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
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
  picker: { alignSelf: 'center' },
  actions: { flexDirection: 'row', gap: spacing.md },
});
