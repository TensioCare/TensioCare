import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/constants/theme';
import { fullName, initials } from '@/lib/format';
import type { PatientCaregiver } from '@/lib/types';
import { AppText, Avatar, Badge, Button, Card } from './ui';

export function CaregiverCard({
  caregiver,
  onRegenerate,
  onRemove,
}: {
  caregiver: PatientCaregiver;
  onRegenerate: () => void;
  onRemove: () => void;
}) {
  const claimed = caregiver.status === 'active';
  return (
    <Card style={styles.card}>
      <View style={styles.top}>
        <Avatar
          label={initials(caregiver.first_name, caregiver.last_name)}
          size={46}
          tone={caregiver.priority === 1 ? 'brand' : 'violet'}
        />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="bodyStrong">
            {fullName(caregiver.first_name, caregiver.last_name)}
          </AppText>
          <AppText variant="caption" tone="muted">
            {caregiver.relationship}
            {caregiver.phone ? ` · ${caregiver.phone}` : ''}
          </AppText>
        </View>
        <Badge
          label={claimed ? 'Joined' : 'Invite pending'}
          tone={claimed ? 'success' : 'warning'}
        />
      </View>

      <View style={styles.metaRow}>
        <View style={styles.meta}>
          <Ionicons name="layers-outline" size={14} color={colors.muted} />
          <AppText variant="caption" tone="muted">
            Priority {caregiver.priority}
          </AppText>
        </View>
        <View style={styles.meta}>
          <Ionicons name="timer-outline" size={14} color={colors.muted} />
          <AppText variant="caption" tone="muted">
            Alert after {caregiver.notify_after_minutes} min
          </AppText>
        </View>
      </View>

      {caregiver.notes ? (
        <AppText variant="caption" tone="soft">
          {caregiver.notes}
        </AppText>
      ) : null}

      <View style={styles.actions}>
        <Button
          title="New code"
          onPress={onRegenerate}
          variant="secondary"
          size="sm"
          fullWidth={false}
          icon="key-outline"
          style={{ flex: 1 }}
        />
        <Button
          title="Remove"
          onPress={onRemove}
          variant="danger"
          size="sm"
          fullWidth={false}
          icon="person-remove-outline"
          style={{ flex: 1 }}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actions: { flexDirection: 'row', gap: spacing.md },
});
