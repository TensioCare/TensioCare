import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Keyboard, Pressable, View } from 'react-native';

import { AuthShell } from '@/components/AuthShell';
import { AppText, Button, Notice, TextField } from '@/components/ui';
import { colors } from '@/constants/theme';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

export default function LoginScreen() {
  const router = useRouter();
  const { signInPatient } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    Keyboard.dismiss();
    setError(null);

    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }

    setLoading(true);
    try {
      await signInPatient(email.trim().toLowerCase(), password);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Could not sign in. Check your connection and try again.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Sign in to your care space"
      subtitle="Track readings, follow your measurement plan, and keep your caregiver in the loop."
      footer={
        <>
          <Pressable onPress={() => router.push('/(auth)/caregiver')} hitSlop={8}>
            <AppText variant="bodyStrong" tone="brand">
              I have a caregiver code
            </AppText>
          </Pressable>
          <AppText variant="caption" tone="muted">
            Caregivers join with a code from the patient.
          </AppText>
        </>
      }
    >
      {error ? <Notice tone="danger" title="Sign in failed" message={error} /> : null}

      <TextField
        label="Email"
        placeholder="you@example.com"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
        autoComplete="email"
      />

      <TextField
        label="Password"
        placeholder="Your password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry={!showPassword}
        autoCapitalize="none"
        textContentType="password"
        autoComplete="password"
        returnKeyType="go"
        onSubmitEditing={handleLogin}
        right={
          <Pressable
            onPress={() => setShowPassword((current) => !current)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
          >
            <Ionicons
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={colors.muted}
            />
          </Pressable>
        }
      />

      <Button title="Sign in" onPress={handleLogin} loading={loading} size="lg" />

      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 4 }}>
        <AppText variant="caption" tone="muted">
          New to TensioCare?
        </AppText>
        <Pressable onPress={() => router.push('/(auth)/register')} hitSlop={8}>
          <AppText variant="caption" tone="brand">
            Create a patient account
          </AppText>
        </Pressable>
      </View>
    </AuthShell>
  );
}
