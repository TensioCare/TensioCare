import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Keyboard, Pressable, View } from 'react-native';

import { AuthShell } from '@/components/AuthShell';
import { AppText, Button, Card, Notice, TextField } from '@/components/ui';
import { authApi, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { fullName } from '@/lib/format';

function normalizeCode(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 8);
}

function displayCode(value: string): string {
  if (value.length <= 4) return value;
  return `${value.slice(0, 4)}-${value.slice(4)}`;
}

export default function CaregiverLoginScreen() {
  const router = useRouter();
  const { signInCaregiver } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const normalized = useMemo(() => normalizeCode(code), [code]);
  const canPreview = normalized.length === 8;

  const preview = useQuery({
    queryKey: ['caregiver-code-preview', normalized],
    queryFn: () => authApi.caregiverPreview(normalized),
    enabled: canPreview,
    retry: false,
  });

  async function handleLogin() {
    Keyboard.dismiss();
    setError(null);
    if (normalized.length !== 8) {
      setError('Enter the 8-character code from the patient.');
      return;
    }

    setLoading(true);
    try {
      await signInCaregiver(normalized);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Could not use this code. Check your connection and try again.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Caregiver access"
      title="Join with a patient code"
      subtitle="There is no separate caregiver sign-up. The patient creates your profile and shares an 8-character code."
      footer={
        <Pressable onPress={() => router.replace('/(auth)/login')} hitSlop={8}>
          <AppText variant="bodyStrong" tone="brand">
            Back to patient sign in
          </AppText>
        </Pressable>
      }
    >
      {error ? <Notice tone="danger" title="Could not continue" message={error} /> : null}

      <TextField
        label="Caregiver code"
        placeholder="ABCD-EFGH"
        value={displayCode(code)}
        onChangeText={(value) => setCode(normalizeCode(value))}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={9}
        hint="Dashes and lowercase letters are fine."
        inputStyle={{ letterSpacing: 2, fontWeight: '700' }}
        returnKeyType="go"
        onSubmitEditing={handleLogin}
      />

      {canPreview ? (
        preview.isLoading ? (
          <Card muted style={{ padding: 14 }}>
            <AppText variant="caption" tone="muted">
              Looking up this code...
            </AppText>
          </Card>
        ) : preview.data ? (
          <Card muted style={{ gap: 6 }}>
            <AppText variant="label" tone="brand">
              Code found
            </AppText>
            <AppText variant="subtitle">
              {fullName(preview.data.patient_first_name, preview.data.patient_last_name)}
            </AppText>
            <AppText variant="caption" tone="muted">
              {fullName(preview.data.caregiver_first_name, preview.data.caregiver_last_name)}
              {' · '}
              {preview.data.relationship}
            </AppText>
            <AppText variant="caption" tone="muted">
              {preview.data.claimed
                ? 'This code has already been activated. Signing in here opens your existing caregiver account.'
                : 'First use activates your caregiver account.'}
            </AppText>
          </Card>
        ) : (
          <Notice
            tone="warning"
            title="Code not recognized"
            message="Check that the patient typed it correctly. Codes do not expire, but a new code replaces the old one."
          />
        )
      ) : null}

      <Button
        title={loading ? 'Joining...' : 'Continue as caregiver'}
        onPress={handleLogin}
        loading={loading}
        size="lg"
        disabled={normalized.length !== 8}
      />

      <View style={{ alignItems: 'center' }}>
        <AppText variant="caption" tone="muted" style={{ textAlign: 'center' }}>
          One caregiver account is linked to one patient. Ask the patient for a new
          code if you need to reconnect.
        </AppText>
      </View>
    </AuthShell>
  );
}
