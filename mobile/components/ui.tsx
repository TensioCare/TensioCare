import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { colors, fonts, radius, shadows, spacing } from '@/constants/theme';
import { Logo } from '@/components/Logo';

export type IconName = keyof typeof Ionicons.glyphMap;
export type TextTone =
  | 'default'
  | 'soft'
  | 'muted'
  | 'brand'
  | 'danger'
  | 'warning'
  | 'success'
  | 'onBrand';

const tones: Record<TextTone, string> = {
  default: colors.text,
  soft: colors.textSoft,
  muted: colors.muted,
  brand: colors.brand,
  danger: colors.danger,
  warning: colors.warning,
  success: colors.success,
  onBrand: colors.onBrand,
};

export function Screen({
  children,
  edges = ['top'],
  style,
}: {
  children: ReactNode;
  edges?: Edge[];
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <SafeAreaView style={[styles.screen, style]} edges={edges}>
      {children}
    </SafeAreaView>
  );
}

export function ScrollScreen({
  children,
  refreshing,
  onRefresh,
  contentContainerStyle,
  edges = ['top'],
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentContainerStyle?: StyleProp<ViewStyle>;
  edges?: Edge[];
}) {
  return (
    <SafeAreaView style={styles.screen} edges={edges}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={Boolean(refreshing)}
              onRefresh={onRefresh}
              tintColor={colors.brand}
              colors={[colors.brand]}
            />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function AppText({
  children,
  variant = 'body',
  tone = 'default',
  style,
  ...rest
}: {
  children?: ReactNode;
  variant?: 'display' | 'title' | 'subtitle' | 'body' | 'bodyStrong' | 'caption' | 'label' | 'tiny';
  tone?: TextTone;
  style?: StyleProp<TextStyle>;
} & Omit<React.ComponentProps<typeof RNText>, 'style'>) {
  return (
    <RNText
      style={[textStyles[variant], { color: tones[tone] }, style]}
      {...rest}
    >
      {children}
    </RNText>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  icon,
  fullWidth = true,
  size = 'md',
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'soft' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  fullWidth?: boolean;
  size?: 'sm' | 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
}) {
  const palette = buttonPalettes[variant];
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        size === 'sm' && styles.buttonSm,
        size === 'lg' && styles.buttonLg,
        { backgroundColor: palette.bg, borderColor: palette.border },
        !fullWidth && styles.buttonAuto,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <View style={styles.buttonInner}>
          {icon ? <Ionicons name={icon} size={18} color={palette.fg} /> : null}
          <AppText
            variant="bodyStrong"
            style={{ color: palette.fg }}
            numberOfLines={1}
          >
            {title}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

const buttonPalettes = {
  primary: { bg: colors.brand, fg: colors.onBrand, border: colors.brand },
  secondary: { bg: colors.brandSoft, fg: colors.brandDark, border: colors.brandSoft },
  soft: { bg: colors.brandSoft, fg: colors.brandDark, border: colors.brandSoft },
  ghost: { bg: 'transparent', fg: colors.brand, border: 'transparent' },
  danger: { bg: colors.danger, fg: colors.onBrand, border: colors.danger },
};

export function Card({
  children,
  style,
  muted = false,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  muted?: boolean;
}) {
  return (
    <View
      style={[
        styles.card,
        muted && { backgroundColor: colors.cardMuted, ...shadows.card },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function PressableCard({
  children,
  onPress,
  style,
  accessibilityLabel,
}: {
  children: ReactNode;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        pressed && styles.pressed,
        style as ViewStyle,
      ]}
    >
      {children}
    </Pressable>
  );
}

export function TextField({
  label,
  error,
  hint,
  style,
  inputStyle,
  right,
  ...inputProps
}: TextInputProps & {
  label?: string;
  error?: string | null;
  hint?: string;
  inputStyle?: StyleProp<TextStyle>;
  right?: ReactNode;
}) {
  return (
    <View style={[styles.field, style as ViewStyle]}>
      {label ? <AppText variant="label">{label}</AppText> : null}
      <View style={[styles.inputWrap, error ? styles.inputWrapError : null]}>
        <TextInput
          placeholderTextColor={colors.mutedLight}
          style={[styles.input, inputStyle]}
          {...inputProps}
        />
        {right}
      </View>
      {error ? (
        <AppText variant="caption" tone="danger">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" tone="muted">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

export function Badge({
  label,
  tone = 'muted',
  icon,
  style,
}: {
  label: string;
  tone?: 'brand' | 'muted' | 'danger' | 'warning' | 'success' | 'info' | 'violet';
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = badgePalettes[tone];
  return (
    <View style={[styles.badge, { backgroundColor: palette.bg }, style]}>
      {icon ? <Ionicons name={icon} size={12} color={palette.fg} /> : null}
      <AppText variant="tiny" style={{ color: palette.fg }}>
        {label}
      </AppText>
    </View>
  );
}

const badgePalettes = {
  brand: { bg: colors.brandSoft, fg: colors.brandDark },
  muted: { bg: colors.cardMuted, fg: colors.muted },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  warning: { bg: colors.warningSoft, fg: colors.warning },
  success: { bg: colors.successSoft, fg: colors.success },
  info: { bg: colors.infoSoft, fg: colors.info },
  violet: { bg: colors.violetSoft, fg: colors.violet },
};

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && styles.pressed,
      ]}
    >
      <AppText
        variant="caption"
        style={{ color: selected ? colors.onBrand : colors.textSoft }}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

export function EmptyState({
  icon = 'leaf-outline',
  title,
  message,
  actionLabel,
  onAction,
}: {
  icon?: IconName;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={26} color={colors.brand} />
      </View>
      <AppText variant="subtitle" style={{ textAlign: 'center' }}>
        {title}
      </AppText>
      <AppText
        variant="body"
        tone="muted"
        style={{ textAlign: 'center', maxWidth: 280 }}
      >
        {message}
      </AppText>
      {actionLabel && onAction ? (
        <Button
          title={actionLabel}
          onPress={onAction}
          variant="soft"
          size="sm"
          fullWidth={false}
        />
      ) : null}
    </View>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.dangerSoft }]}>
        <Ionicons name="cloud-offline-outline" size={26} color={colors.danger} />
      </View>
      <AppText variant="subtitle" style={{ textAlign: 'center' }}>
        Could not load this
      </AppText>
      <AppText variant="body" tone="muted" style={{ textAlign: 'center' }}>
        {message}
      </AppText>
      {onRetry ? (
        <Button title="Try again" onPress={onRetry} variant="secondary" size="sm" fullWidth={false} />
      ) : null}
    </View>
  );
}

export function LoadingScreen({ label = 'Loading...' }: { label?: string }) {
  return (
    <View style={styles.loading}>
      <Logo size={64} color={colors.brand} animate spin />
    </View>
  );
}

export function SectionHeader({
  title,
  actionLabel,
  onAction,
  style,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.sectionHeader, style]}>
      <AppText variant="subtitle">{title}</AppText>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <AppText variant="caption" tone="brand">
            {actionLabel}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

export function ListRow({
  icon,
  title,
  subtitle,
  right,
  onPress,
  tone = 'brand',
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
  tone?: 'brand' | 'danger' | 'muted';
}) {
  const content = (
    <>
      {icon ? (
        <View style={[styles.rowIcon, tone === 'danger' && { backgroundColor: colors.dangerSoft }]}>
          <Ionicons
            name={icon}
            size={19}
            color={tone === 'danger' ? colors.danger : colors.brand}
          />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <AppText variant="bodyStrong">{title}</AppText>
        {subtitle ? (
          <AppText variant="caption" tone="muted" style={{ marginTop: 2 }}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {right}
    </>
  );

  if (!onPress) return <View style={styles.row}>{content}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

export function ProgressBar({
  value,
  tone = colors.brand,
  style,
}: {
  value: number;
  tone?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <View style={[styles.progressTrack, style]}>
      <View
        style={[styles.progressFill, { width: `${clamped}%`, backgroundColor: tone }]}
      />
    </View>
  );
}

export function Avatar({
  label,
  size = 48,
  tone = 'brand',
}: {
  label: string;
  size?: number;
  tone?: 'brand' | 'violet' | 'warning';
}) {
  const bg =
    tone === 'violet'
      ? colors.violetSoft
      : tone === 'warning'
        ? colors.warningSoft
        : colors.brandSoft;
  const fg =
    tone === 'violet'
      ? colors.violet
      : tone === 'warning'
        ? colors.warning
        : colors.brandDark;
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bg },
      ]}
    >
      <AppText
        variant={size > 52 ? 'title' : 'bodyStrong'}
        style={{ color: fg }}
      >
        {label}
      </AppText>
    </View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.divider, style]} />;
}

export function Metric({
  label,
  value,
  unit,
  tone = 'default',
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: TextTone;
}) {
  return (
    <View style={styles.metric}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
        <AppText variant="title" tone={tone} style={{ fontVariant: ['tabular-nums'] }}>
          {value}
        </AppText>
        {unit ? (
          <AppText variant="caption" tone="muted">
            {unit}
          </AppText>
        ) : null}
      </View>
      <AppText variant="caption" tone="muted">
        {label}
      </AppText>
    </View>
  );
}

export function KeyValue({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.keyValue}>
      <AppText variant="caption" tone="muted">
        {label}
      </AppText>
      <AppText variant="body" style={{ flex: 1, textAlign: 'right' }}>
        {value}
      </AppText>
    </View>
  );
}

export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  tone = 'brand',
}: {
  icon: IconName;
  onPress: () => void;
  accessibilityLabel: string;
  tone?: 'brand' | 'danger' | 'muted';
}) {
  const color =
    tone === 'danger' ? colors.danger : tone === 'muted' ? colors.muted : colors.brand;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={21} color={color} />
    </Pressable>
  );
}

export function Notice({
  tone = 'info',
  title,
  message,
}: {
  tone?: 'info' | 'warning' | 'danger' | 'success';
  title: string;
  message: string;
}) {
  const palette =
    tone === 'danger'
      ? { bg: colors.dangerSoft, fg: colors.danger, icon: 'alert-circle-outline' as const }
      : tone === 'warning'
        ? { bg: colors.warningSoft, fg: colors.warning, icon: 'warning-outline' as const }
        : tone === 'success'
          ? { bg: colors.successSoft, fg: colors.success, icon: 'checkmark-circle-outline' as const }
          : { bg: colors.infoSoft, fg: colors.info, icon: 'information-circle-outline' as const };
  return (
    <View style={[styles.notice, { backgroundColor: palette.bg }]}>
      <Ionicons name={palette.icon} size={19} color={palette.fg} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <AppText variant="bodyStrong" style={{ color: palette.fg }}>
          {title}
        </AppText>
        <AppText variant="caption" style={{ color: palette.fg, marginTop: 2 }}>
          {message}
        </AppText>
      </View>
    </View>
  );
}

const textStyles = StyleSheet.create({
  display: {
    fontFamily: fonts.extrabold,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.8,
  },
  title: {
    fontFamily: fonts.extrabold,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.4,
  },
  subtitle: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 23 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 21 },
  caption: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
  label: {
    fontFamily: fonts.bold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  tiny: { fontFamily: fonts.bold, fontSize: 11, lineHeight: 14 },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: 120,
    gap: spacing.lg,
  },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.5 },
  button: {
    minHeight: 52,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSm: { minHeight: 40, paddingHorizontal: spacing.lg, borderRadius: radius.sm },
  buttonLg: { minHeight: 56, borderRadius: radius.sm },
  buttonAuto: { alignSelf: 'flex-start' },
  buttonInner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  field: { gap: 6 },
  inputWrap: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  inputWrapError: { borderColor: colors.danger },
  input: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    paddingVertical: 12,
    minHeight: 46,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: { backgroundColor: colors.brand, borderColor: colors.brand },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.md,
  },
  emptyIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandSoft,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    backgroundColor: colors.bg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 11,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandSoft,
  },
  progressTrack: {
    height: 8,
    backgroundColor: colors.border,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: radius.pill },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  divider: { height: 1, backgroundColor: colors.border },
  metric: { flex: 1, gap: 2 },
  keyValue: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.lg,
    paddingVertical: 7,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  notice: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
  },
});
