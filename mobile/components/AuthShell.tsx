import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, shadows, spacing } from '@/constants/theme';
import { AppText } from './ui';

export function AuthShell({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}: {
  eyebrow?: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brandRow}>
            <View style={styles.logo}>
              <Ionicons name="pulse" size={25} color={colors.onBrand} />
            </View>
            <View>
              <AppText variant="subtitle">TensioCare</AppText>
              <AppText variant="caption" tone="muted">
                Blood pressure, together
              </AppText>
            </View>
          </View>

          <View style={styles.header}>
            {eyebrow ? (
              <AppText variant="label" tone="brand">
                {eyebrow}
              </AppText>
            ) : null}
            <AppText variant="display">{title}</AppText>
            <AppText variant="body" tone="muted">
              {subtitle}
            </AppText>
          </View>

          <View style={styles.card}>{children}</View>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.xxl,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  logo: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: { gap: spacing.sm },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.lg,
    ...shadows.raised,
  },
  footer: { alignItems: 'center', gap: spacing.sm },
});
