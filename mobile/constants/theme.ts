import { Platform } from 'react-native';

/**
 * Palette extracted from the reference design.
 * Deep-green headers, green primary, mint surfaces, ivory background,
 * carbon text and bordeaux alerts.
 */
export const colors = {
  brand: '#1C6D64',
  brandDark: '#07443E',
  brandSoft: '#E3F3EF',
  brandMuted: '#9CC4B8',

  bg: '#F7F4EC',
  card: '#E3F3EF',
  cardMuted: '#E2F2EB',
  border: '#DCE0D5',
  borderStrong: '#C7CEBF',

  text: '#16211F',
  textSoft: '#33443F',
  muted: '#52615E',
  mutedLight: '#8B968F',
  onBrand: '#FFFFFF',
  onDeep: '#F7F4EC',

  danger: '#651519',
  dangerSoft: '#F7E5E6',
  warning: '#B0741F',
  warningSoft: '#F5E9D6',
  success: '#1F7A57',
  successSoft: '#E2F3EC',
  info: '#1C6D64',
  infoSoft: '#E3F3EF',
  violet: '#5B6B95',
  violetSoft: '#E8EAF2',
} as const;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 36,
} as const;

export const radius = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  pill: 999,
} as const;

export const shadows = {
  card: Platform.select({
    ios: {
      shadowColor: '#131D1B',
      shadowOpacity: 0.04,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 3 },
    },
    android: { elevation: 1 },
    default: {},
  }),
  raised: Platform.select({
    ios: {
      shadowColor: '#003F38',
      shadowOpacity: 0.18,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
    },
    android: { elevation: 6 },
    default: {},
  }),
} as const;

export const riskColors: Record<string, { bg: string; fg: string; border: string }> = {
  no_data: { bg: colors.cardMuted, fg: colors.muted, border: colors.border },
  low: { bg: colors.successSoft, fg: colors.success, border: colors.brandMuted },
  moderate: { bg: colors.warningSoft, fg: colors.warning, border: '#E8D3AE' },
  high: { bg: '#F3E3D6', fg: '#9A4E1C', border: '#E6CBB4' },
  critical: { bg: colors.danger, fg: colors.onBrand, border: colors.danger },
};

export const categoryColors: Record<string, { bg: string; fg: string; label: string }> = {
  low: { bg: colors.successSoft, fg: colors.success, label: 'Low' },
  normal: { bg: colors.successSoft, fg: colors.success, label: 'Normal' },
  elevated: { bg: colors.warningSoft, fg: colors.warning, label: 'Elevated' },
  stage_1: { bg: '#F3E3D6', fg: '#9A4E1C', label: 'Stage 1' },
  stage_2: { bg: colors.dangerSoft, fg: colors.danger, label: 'Stage 2' },
  crisis: { bg: colors.danger, fg: colors.onBrand, label: 'Crisis' },
};

export const riskLabels: Record<string, string> = {
  no_data: 'No data',
  low: 'Low risk',
  moderate: 'Moderate risk',
  high: 'High risk',
  critical: 'Critical risk',
};

export const trendLabels: Record<string, string> = {
  improving: 'Improving',
  worsening: 'Worsening',
  stable: 'Stable',
  not_enough_data: 'Not enough data',
};

export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold',
} as const;

export const textStyles = {
  display: {
    fontFamily: fonts.extrabold,
    fontSize: 36,
    lineHeight: 44,
    letterSpacing: -0.8,
    color: colors.text,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 24,
    lineHeight: 30,
    color: colors.brandDark,
  },
  subtitle: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22, color: colors.brand },
  body: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.text },
  bodyStrong: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
  },
  caption: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16, color: colors.brand },
  label: {
    fontFamily: fonts.bold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  tiny: { fontFamily: fonts.bold, fontSize: 11, lineHeight: 14 },
} as const;
