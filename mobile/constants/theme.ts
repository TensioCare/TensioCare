import { Platform } from 'react-native';

export const colors = {
  brand: '#0F766E',
  brandDark: '#115E59',
  brandSoft: '#CCFBF1',
  brandMuted: '#5EEAD4',

  bg: '#F4F7F6',
  card: '#FFFFFF',
  cardMuted: '#F8FAFC',
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',

  text: '#0F172A',
  textSoft: '#334155',
  muted: '#64748B',
  mutedLight: '#94A3B8',
  onBrand: '#FFFFFF',

  danger: '#DC2626',
  dangerSoft: '#FEE2E2',
  warning: '#D97706',
  warningSoft: '#FEF3C7',
  success: '#059669',
  successSoft: '#D1FAE5',
  info: '#2563EB',
  infoSoft: '#DBEAFE',
  violet: '#7C3AED',
  violetSoft: '#EDE9FE',
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
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

export const shadows = {
  card: Platform.select({
    ios: {
      shadowColor: '#0F172A',
      shadowOpacity: 0.06,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
    },
    android: { elevation: 2 },
    default: {},
  }),
  raised: Platform.select({
    ios: {
      shadowColor: '#0F172A',
      shadowOpacity: 0.12,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 10 },
    },
    android: { elevation: 5 },
    default: {},
  }),
} as const;

export const riskColors: Record<string, { bg: string; fg: string; border: string }> = {
  no_data: { bg: colors.cardMuted, fg: colors.muted, border: colors.border },
  low: { bg: colors.infoSoft, fg: colors.info, border: '#BFDBFE' },
  moderate: { bg: colors.warningSoft, fg: colors.warning, border: '#FDE68A' },
  high: { bg: '#FFEDD5', fg: '#C2410C', border: '#FED7AA' },
  critical: { bg: colors.dangerSoft, fg: colors.danger, border: '#FECACA' },
};

export const categoryColors: Record<string, { bg: string; fg: string; label: string }> = {
  low: { bg: colors.infoSoft, fg: colors.info, label: 'Low' },
  normal: { bg: colors.successSoft, fg: colors.success, label: 'Normal' },
  elevated: { bg: colors.warningSoft, fg: colors.warning, label: 'Elevated' },
  stage_1: { bg: '#FFEDD5', fg: '#C2410C', label: 'Stage 1' },
  stage_2: { bg: colors.dangerSoft, fg: colors.danger, label: 'Stage 2' },
  crisis: { bg: '#450A0A', fg: '#FEE2E2', label: 'Crisis' },
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
