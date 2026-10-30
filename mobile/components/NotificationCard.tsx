import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '@/constants/theme';
import { formatRelative } from '@/lib/format';
import type { NotificationItem } from '@/lib/types';
import { AppText, Button, PressableCard, type IconName } from './ui';

const typeConfig: Record<
  string,
  { icon: IconName; bg: string; fg: string }
> = {
  measurement_reminder: {
    icon: 'alarm-outline',
    bg: colors.brandSoft,
    fg: colors.brand,
  },
  measurement_missed: {
    icon: 'time-outline',
    bg: colors.warningSoft,
    fg: colors.warning,
  },
  caregiver_escalation: {
    icon: 'warning-outline',
    bg: colors.dangerSoft,
    fg: colors.danger,
  },
  escalation_acknowledged: {
    icon: 'checkmark-circle-outline',
    bg: colors.successSoft,
    fg: colors.success,
  },
  escalation_unresolved: {
    icon: 'alert-circle-outline',
    bg: colors.dangerSoft,
    fg: colors.danger,
  },
  daily_assessment: {
    icon: 'pulse-outline',
    bg: colors.violetSoft,
    fg: colors.violet,
  },
};

export function NotificationCard({
  item,
  onPress,
  onAcknowledge,
  acknowledging = false,
}: {
  item: NotificationItem;
  onPress?: () => void;
  onAcknowledge?: () => void;
  acknowledging?: boolean;
}) {
  const config =
    typeConfig[item.type] ?? {
      icon: 'notifications-outline' as IconName,
      bg: colors.cardMuted,
      fg: colors.muted,
    };
  const unread = !item.read_at;
  const canAcknowledge =
    item.type === 'caregiver_escalation' &&
    item.window_id !== null &&
    !item.acknowledged_at &&
    Boolean(onAcknowledge);

  return (
    <PressableCard onPress={onPress ?? (() => undefined)} style={styles.card}>
      <View style={styles.row}>
        <View style={[styles.iconWrap, { backgroundColor: config.bg }]}>
          <Ionicons name={config.icon} size={20} color={config.fg} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <View style={styles.titleRow}>
            <AppText variant="bodyStrong" style={{ flex: 1 }}>
              {item.title}
            </AppText>
            {unread ? <View style={styles.unreadDot} /> : null}
          </View>
          <AppText variant="caption" tone="soft">
            {item.body}
          </AppText>
          <AppText variant="tiny" tone="muted" style={{ marginTop: 2 }}>
            {formatRelative(item.created_at)}
          </AppText>
        </View>
      </View>

      {canAcknowledge ? (
        <View style={styles.actionRow}>
          <Button
            title={acknowledging ? 'Acknowledging...' : 'Acknowledge alert'}
            onPress={onAcknowledge!}
            loading={acknowledging}
            variant="danger"
            size="sm"
            fullWidth={false}
          />
        </View>
      ) : item.acknowledged_at ? (
        <View style={styles.ackRow}>
          <Ionicons name="checkmark" size={14} color={colors.success} />
          <AppText variant="caption" tone="success">
            Acknowledged
          </AppText>
        </View>
      ) : null}
    </PressableCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md, padding: spacing.lg },
  row: { flexDirection: 'row', gap: spacing.md },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.brand,
  },
  actionRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  ackRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
