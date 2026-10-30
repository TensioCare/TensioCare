import { Link, Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppText, Button } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not found', headerShown: true }} />
      <View style={styles.container}>
        <AppText variant="display">Page not found</AppText>
        <AppText variant="body" tone="muted" style={{ textAlign: 'center' }}>
          The screen you were looking for does not exist.
        </AppText>
        <Link href="/" asChild>
          <Button title="Go home" onPress={() => undefined} fullWidth={false} />
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    padding: spacing.xl,
    backgroundColor: colors.bg,
  },
});
