import { Redirect, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Brand } from '@/components/Brand';
import { AppText, Button, LoadingScreen } from '@/components/ui';
import { colors, fonts, spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';

export default function Index() {
  const { status, user } = useAuth();
  const router = useRouter();

  if (status === 'loading') {
    return <LoadingScreen label="Opening TensioCare..." />;
  }

  if (user) {
    return (
      <Redirect href={user.role === 'caregiver' ? '/caregiver' : '/(patient)/(tabs)'} />
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Brand size={44} color={colors.onDeep} animate />
          <View style={styles.heroText}>
            <AppText
              style={{
                fontFamily: fonts.extrabold,
                fontSize: 36,
                lineHeight: 44,
                letterSpacing: -0.8,
                color: colors.onDeep,
              }}
            >
              Your blood pressure,{'\n'}tracked every day.
            </AppText>
            <AppText
              variant="body"
              style={[styles.heroSub, { fontSize: 16, fontFamily: fonts.semibold }]}
            >
              Measure, follow your trends, and keep your caregivers and doctor
              informed when it matters.
            </AppText>
          </View>
        </View>

        <View style={styles.actions}>
          <Button
            title="Create an account"
            onPress={() => router.push('/(auth)/register')}
          />
          <Button
            title="Sign in"
            variant="secondary"
            onPress={() => router.push('/(auth)/login')}
          />
          <Button
            title="I'm a caregiver"
            variant="ghost"
            onPress={() => router.push('/(auth)/join')}
          />
        </View>

        <AppText variant="caption" tone="muted" style={styles.note}>
          TensioCare supports your care team. It does not replace medical advice.
        </AppText>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1, justifyContent: 'space-between' },
  hero: {
    backgroundColor: colors.brandDark,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxxl,
    gap: spacing.xxxl,
  },
  heroText: { gap: spacing.lg },
  heroSub: { color: colors.onDeep, opacity: 0.78, maxWidth: 320 },
  actions: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    gap: spacing.md,
  },
  note: {
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
});
