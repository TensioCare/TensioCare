import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';

import { AppText } from '@/components/ui';
import { colors, fonts, radius, spacing } from '@/constants/theme';

/**
 * TensioCare mark (source: "Fichier 7.svg").
 *
 * A radial starburst drawn from the original polygon, so it scales to any
 * size without a raster asset. It is filled with the caller's colour: the
 * same tone as the "TensioCare" wordmark, which keeps it legible on both
 * the deep-green headers and the light auth screens.
 */
const LOGO_VIEWBOX = { width: 106.72, height: 107.65 };

const LOGO_POINTS = [
  '47.01 30.13', '29.85 42.97', '42.53 60.24', '55.22 77.52',
  '72.39 64.69', '85.08 81.96', '50.74 107.65', '38.06 90.37',
  '25.37 73.09', '12.69 55.82', '0 38.54', '17.17 25.69',
  '34.32 12.84', '51.49 0', '64.18 17.28', '81.34 4.44',
  '94.03 21.72', '106.72 39', '89.55 51.85', '76.86 34.56',
  '59.7 47.41', '47.01 30.13',
].join(' ');

export function Logo({
  size = 40,
  color = colors.brand,
}: {
  size?: number;
  color?: string;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${LOGO_VIEWBOX.width} ${LOGO_VIEWBOX.height}`}
      accessibilityRole="image"
      accessibilityLabel="TensioCare"
    >
      <Polygon points={LOGO_POINTS} fill={color} />
    </Svg>
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
      <Logo size={size} color={color} />
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
