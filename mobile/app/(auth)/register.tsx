import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Keyboard, Pressable, View } from 'react-native';

import { AuthShell } from '@/components/AuthShell';
import { TimeListEditor } from '@/components/TimeListEditor';
import { AppText, Button, Card, Notice, TextField } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { deviceTimezone } from '@/lib/time';

export default function RegisterScreen() {
  const router = useRouter();
  const { registerPatient } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [age, setAge] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [targetSystolic, setTargetSystolic] = useState('');
  const [targetDiastolic, setTargetDiastolic] = useState('');
  const [times, setTimes] = useState(['08:00', '20:00']);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const timezone = deviceTimezone();

  function optionalNumber(value: string): number | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  async function handleRegister() {
    Keyboard.dismiss();
    setError(null);

    const ageNumber = Number(age);
    if (!firstName.trim() || !lastName.trim()) {
      setError('Enter your first and last name.');
      return;
    }
    if (!Number.isInteger(ageNumber) || ageNumber < 0 || ageNumber > 120) {
      setError('Enter an age between 0 and 120.');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setError('Use at least 8 characters for your password.');
      return;
    }

    const systolic = optionalNumber(targetSystolic);
    const diastolic = optionalNumber(targetDiastolic);
    if (systolic !== null && (systolic < 60 || systolic > 250)) {
      setError('Target systolic must be between 60 and 250.');
      return;
    }
    if (diastolic !== null && (diastolic < 30 || diastolic > 150)) {
      setError('Target diastolic must be between 30 and 150.');
      return;
    }
    if (systolic !== null && diastolic !== null && systolic <= diastolic) {
      setError('Target systolic must be higher than target diastolic.');
      return;
    }

    setLoading(true);
    try {
      await registerPatient({
        email: email.trim().toLowerCase(),
        password,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        age: ageNumber,
        diagnosis: diagnosis.trim() || null,
        target_systolic: systolic,
        target_diastolic: diastolic,
        measurements_per_day: times.length,
        measurement_times: times,
        timezone,
      });
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Could not create your account. Check your connection and try again.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Patient account"
      title="Create your care space"
      subtitle="This account is for the person measuring their blood pressure. Caregivers join later with a code you share."
      footer={
        <Pressable onPress={() => router.replace('/(auth)/login')} hitSlop={8}>
          <AppText variant="bodyStrong" tone="brand">
            I already have an account
          </AppText>
        </Pressable>
      }
    >
      {error ? <Notice tone="danger" title="Could not create account" message={error} /> : null}

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <TextField
          label="First name"
          placeholder="Maya"
          value={firstName}
          onChangeText={setFirstName}
          autoCapitalize="words"
          style={{ flex: 1 }}
        />
        <TextField
          label="Last name"
          placeholder="Haddad"
          value={lastName}
          onChangeText={setLastName}
          autoCapitalize="words"
          style={{ flex: 1 }}
        />
      </View>

      <TextField
        label="Age"
        placeholder="64"
        value={age}
        onChangeText={setAge}
        keyboardType="number-pad"
        maxLength={3}
      />

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
        placeholder="At least 8 characters"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        textContentType="newPassword"
        autoComplete="new-password"
        hint="You will use this email and password to sign in as the patient."
      />

      <TextField
        label="Diagnosis (optional)"
        placeholder="e.g. Hypertension"
        value={diagnosis}
        onChangeText={setDiagnosis}
        maxLength={160}
      />

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <TextField
          label="Target systolic"
          placeholder="130"
          value={targetSystolic}
          onChangeText={setTargetSystolic}
          keyboardType="number-pad"
          maxLength={3}
          style={{ flex: 1 }}
        />
        <TextField
          label="Target diastolic"
          placeholder="80"
          value={targetDiastolic}
          onChangeText={setTargetDiastolic}
          keyboardType="number-pad"
          maxLength={3}
          style={{ flex: 1 }}
        />
      </View>

      <Card muted style={{ gap: 12, padding: 16 }}>
        <View>
          <AppText variant="subtitle">Measurement plan</AppText>
          <AppText variant="caption" tone="muted" style={{ marginTop: 2 }}>
            When should TensioCare remind you to measure? You can change this later.
          </AppText>
        </View>
        <TimeListEditor times={times} onChange={setTimes} max={6} />
        <AppText variant="caption" tone="muted">
          Timezone: {timezone}
        </AppText>
      </Card>

      <Button
        title="Create patient account"
        onPress={handleRegister}
        loading={loading}
        size="lg"
      />
    </AuthShell>
  );
}
