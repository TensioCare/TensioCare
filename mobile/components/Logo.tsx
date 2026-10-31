import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';

import { colors } from '@/constants/theme';

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
  animate = false,
  spin = false,
}: {
  size?: number;
  color?: string;
  animate?: boolean;
  spin?: boolean;
}) {
  const opacity = useRef(new Animated.Value(animate || spin ? 0 : 1)).current;
  const scale = useRef(new Animated.Value(animate || spin ? 0.4 : 1)).current;
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (animate || spin) {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          friction: 6,
          tension: 50,
          useNativeDriver: true,
        }),
      ]).start();
    }
    if (spin) {
      const loop = Animated.loop(
        Animated.timing(rotation, {
          toValue: 1,
          duration: 1400,
          easing: (t) => t,
          useNativeDriver: true,
        }),
      );
      loop.start();
      return () => loop.stop();
    }
  }, [animate, spin, opacity, scale, rotation]);

  const rotate = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View style={{ opacity, transform: [{ scale }, { rotate }] }}>
      <Svg
        width={size}
        height={size}
        viewBox={`0 0 ${LOGO_VIEWBOX.width} ${LOGO_VIEWBOX.height}`}
        accessibilityRole="image"
        accessibilityLabel="TensioCare"
      >
        <Polygon points={LOGO_POINTS} fill={color} />
      </Svg>
    </Animated.View>
  );
}