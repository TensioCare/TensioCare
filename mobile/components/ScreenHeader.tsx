import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, fonts, spacing } from '@/constants/theme';
import { AppText } from './ui';

export function ScreenHeader({
  eyebrow,
  title,
  subtitle,
  right,
  onBack,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onBack?: () => void;
}) {
  return (
    <View style={styles.wrap}>
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={10}
          onPress={onBack}
          style={({ pressed }) => [styles.back, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="chevron-back" size={20} color={colors.muted} />
          <AppText variant="bodyStrong" tone="muted">
            Back
          </AppText>
        </Pressable>
      ) : null}

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          {eyebrow ? (
            <AppText variant="label" tone="brand" style={{ marginBottom: 4 }}>
              {eyebrow}
            </AppText>
          ) : null}
          <AppText
            style={{
              fontFamily: fonts.bold,
              fontSize: 24,
              lineHeight: 30,
              color: colors.brandDark,
            }}
          >
            {title}
          </AppText>
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
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    alignSelf: 'flex-start',
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
});
