import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui';
import { colors, fonts, radius, spacing } from '@/constants/theme';

/** Circular heart mark used on every branded surface. */
export function Logo({ size = 40 }: { size?: number }) {
  return (
    <View
      style={[
        styles.logo,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Ionicons name="heart" size={size * 0.5} color={colors.onDeep} />
    </View>
  );
}

export function Brand({
  size = 40,
  color = colors.brandDark,
}: {
  size?: number;
  color?: string;
}) {
  return (
    <View style={styles.brand}>
      <Logo size={size} />
      <AppText
        style={{
          fontFamily: fonts.extrabold,
          fontSize: size * 0.52,
          color,
          letterSpacing: -0.4,
        }}
      >
        TensioCare
      </AppText>
    </View>
  );
}

/** Deep-green header block with the design's rounded bottom corners. */
export function DeepHeader({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.deepHeader, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  logo: {
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  deepHeader: {
    backgroundColor: colors.brandDark,
    borderBottomLeftRadius: radius.xl + 4,
    borderBottomRightRadius: radius.xl + 4,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
  },
});
