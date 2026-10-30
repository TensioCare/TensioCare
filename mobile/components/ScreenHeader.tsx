import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { spacing } from '@/constants/theme';
import { AppText } from './ui';

export function ScreenHeader({
  eyebrow,
  title,
  subtitle,
  right,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          {eyebrow ? (
            <AppText variant="label" tone="brand" style={{ marginBottom: 4 }}>
              {eyebrow}
            </AppText>
          ) : null}
          <AppText variant="display">{title}</AppText>
        </View>
        {right}
      </View>
      {subtitle ? (
        <AppText variant="body" tone="muted" style={{ marginTop: 4 }}>
          {subtitle}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 2, paddingTop: spacing.sm, paddingBottom: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
});
