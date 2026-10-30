import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Brand } from '@/components/Brand';
import { colors, fonts, spacing } from '@/constants/theme';
import { AppText } from './ui';

export function AuthShell({
  title,
  subtitle,
  onBack,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  onBack?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  eyebrow?: string;
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
          {onBack ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={onBack}
              hitSlop={10}
              style={({ pressed }) => [styles.back, pressed && { opacity: 0.6 }]}
            >
              <Ionicons name="chevron-back" size={20} color={colors.muted} />
              <AppText variant="bodyStrong" tone="muted">
                Back
              </AppText>
            </Pressable>
          ) : (
            <Brand size={40} />
          )}

          <View style={styles.header}>
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
            <AppText variant="body" tone="muted">
              {subtitle}
            </AppText>
          </View>

          <View style={styles.form}>{children}</View>

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
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.xl,
  },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    alignSelf: 'flex-start',
  },
  header: { gap: spacing.sm },
  form: { gap: spacing.lg },
  footer: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
});

export const authLinkStyle = StyleSheet.create({
  link: { fontFamily: fonts.semibold, color: colors.brand },
});
