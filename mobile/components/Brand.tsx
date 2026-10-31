import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui';
import { Logo } from '@/components/Logo';
import { colors, fonts, radius, spacing } from '@/constants/theme';

export function Brand({
  size = 40,
  color = colors.brandDark,
  animate = false,
}: {
  size?: number;
  color?: string;
  animate?: boolean;
}) {
  const opacity = useRef(new Animated.Value(animate ? 0 : 1)).current;

  useEffect(() => {
    if (!animate) return;
    Animated.timing(opacity, {
      toValue: 1,
      duration: 700,
      delay: 200,
      useNativeDriver: true,
    }).start();
  }, [animate, opacity]);

  return (
    <View style={styles.brand}>
      <Logo size={size} color={color} animate={animate} />
      <Animated.Text
        style={{
          fontFamily: fonts.extrabold,
          fontSize: size * 0.52,
          color,
          letterSpacing: -0.4,
          opacity,
        }}
      >
        TENSIOCARE
      </Animated.Text>
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