import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { categoryColors, colors, radius, spacing } from '@/constants/theme';
import { categoryLabel, formatDateTime } from '@/lib/format';
import type { Reading } from '@/lib/types';
import { AppText, Badge, PressableCard } from './ui';

export function ReadingCard({
  reading,
  onPress,
}: {
  reading: Reading;
  onPress?: () => void;
}) {
  const category = categoryColors[reading.category] ?? categoryColors.normal;

  return (
    <PressableCard
      onPress={onPress ?? (() => undefined)}
      accessibilityLabel={`Blood pressure ${reading.systolic} over ${reading.diastolic}`}
      style={styles.card}
    >
      <View style={styles.topRow}>
        <View style={styles.values}>
          <AppText variant="title" style={styles.bpText}>
            {reading.systolic}
            <AppText variant="subtitle" tone="muted">
              {' / '}
            </AppText>
            {reading.diastolic}
          </AppText>
          <AppText variant="caption" tone="muted">
            mmHg
          </AppText>
        </View>
        <Badge label={categoryLabel(reading.category)} tone="muted" style={{ backgroundColor: category.bg }} />
      </View>

      <View style={styles.metaRow}>
        <View style={styles.meta}>
          <Ionicons name="calendar-outline" size={14} color={colors.muted} />
          <AppText variant="caption" tone="muted">
            {formatDateTime(reading.measured_at)}
          </AppText>
        </View>
        {reading.pulse ? (
          <View style={styles.meta}>
            <Ionicons name="heart-outline" size={14} color={colors.muted} />
            <AppText variant="caption" tone="muted">
              {reading.pulse} bpm
            </AppText>
          </View>
        ) : null}
        {reading.arm ? (
          <View style={styles.meta}>
            <Ionicons name="body-outline" size={14} color={colors.muted} />
            <AppText variant="caption" tone="muted">
              {reading.arm === 'left' ? 'Left arm' : 'Right arm'}
            </AppText>
          </View>
        ) : null}
      </View>

      {reading.notes ? (
        <AppText variant="caption" tone="soft" numberOfLines={2} style={{ marginTop: 6 }}>
          {reading.notes}
        </AppText>
      ) : null}
    </PressableCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, padding: spacing.lg },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  values: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  bpText: { fontVariant: ['tabular-nums'] },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
