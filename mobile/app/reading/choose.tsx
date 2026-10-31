import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ScreenHeader } from '@/components/ScreenHeader';
import { AppText, Card, ScrollScreen } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';

export default function ChooseMeasurementScreen() {
  const router = useRouter();

  return (
    <ScrollScreen contentContainerStyle={{ paddingBottom: 60 }}>
      <ScreenHeader
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        eyebrow="New measurement"
        title="How would you like to measure?"
        subtitle="Choose manual entry or connect a device to receive readings automatically."
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Manual entry"
        onPress={() => router.replace('/reading/new')}
        style={({ pressed }) => [styles.option, pressed && { opacity: 0.85 }]}
      >
        <View style={[styles.iconWrap, { backgroundColor: colors.brandSoft }]}>
          <Ionicons name="create-outline" size={26} color={colors.brand} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="subtitle">Manual entry</AppText>
          <AppText variant="caption" tone="muted">
            Type in your systolic, diastolic and pulse values yourself.
          </AppText>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Auto from device"
        onPress={() => router.replace('/reading/auto')}
        style={({ pressed }) => [styles.option, pressed && { opacity: 0.85 }]}
      >
        <View style={[styles.iconWrap, { backgroundColor: colors.successSoft }]}>
          <Ionicons name="bluetooth-outline" size={26} color={colors.success} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="subtitle">Auto from device</AppText>
          <AppText variant="caption" tone="muted">
            Pair a monitor and receive readings automatically.
          </AppText>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
