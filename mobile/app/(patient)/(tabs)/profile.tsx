import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ScreenHeader } from '@/components/ScreenHeader';
import {
  AppText,
  Avatar,
  Button,
  Card,
  ErrorState,
  KeyValue,
  ListRow,
  LoadingScreen,
  ScrollScreen,
  SectionHeader,
  TextField,
} from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { patientsApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { confirmAction, showAlert } from '@/lib/dialogs';
import {
  daysLabel,
  formatClockTime,
  fullName,
  initials,
} from '@/lib/format';

export default function PatientProfileScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, signOut } = useAuth();

  const profile = useQuery({
    queryKey: ['profile'],
    queryFn: patientsApi.profile,
  });
  const caregivers = useQuery({
    queryKey: ['caregivers', 'list'],
    queryFn: patientsApi.caregivers,
  });

  const [initialized, setInitialized] = useState(false);
  const [diagnosis, setDiagnosis] = useState('');
  const [history, setHistory] = useState('');
  const [allergies, setAllergies] = useState('');
  const [medications, setMedications] = useState('');
  const [targetSystolic, setTargetSystolic] = useState('');
  const [targetDiastolic, setTargetDiastolic] = useState('');

  useEffect(() => {
    if (initialized || !profile.data) return;
    setDiagnosis(profile.data.diagnosis ?? '');
    setHistory(profile.data.medical_history ?? '');
    setAllergies(profile.data.allergies ?? '');
    setMedications(profile.data.medications ?? '');
    setTargetSystolic(profile.data.target_systolic?.toString() ?? '');
    setTargetDiastolic(profile.data.target_diastolic?.toString() ?? '');
    setInitialized(true);
  }, [initialized, profile.data]);

  function optionalNumber(value: string): number | null {
    if (!value.trim()) return null;
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  const save = useMutation({
    mutationFn: () => {
      const systolic = optionalNumber(targetSystolic);
      const diastolic = optionalNumber(targetDiastolic);
      if (systolic !== null && (systolic < 60 || systolic > 250)) {
        throw new Error('Target systolic must be between 60 and 250.');
      }
      if (diastolic !== null && (diastolic < 30 || diastolic > 150)) {
        throw new Error('Target diastolic must be between 30 and 150.');
      }
      if (systolic !== null && diastolic !== null && systolic <= diastolic) {
        throw new Error('Target systolic must be higher than target diastolic.');
      }

      return patientsApi.updateProfile({
        diagnosis: diagnosis.trim() || null,
        medical_history: history.trim() || null,
        allergies: allergies.trim() || null,
        medications: medications.trim() || null,
        target_systolic: systolic,
        target_diastolic: diastolic,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
      void queryClient.invalidateQueries({ queryKey: ['assessment'] });
      void queryClient.invalidateQueries({ queryKey: ['readings'] });
      showAlert('Profile saved', 'Your care details have been updated.');
    },
    onError: (error) => {
      showAlert(
        'Could not save profile',
        error instanceof Error ? error.message : 'Please try again.',
      );
    },
  });

  async function confirmSignOut() {
    confirmAction({
      title: 'Sign out?',
      message: 'Your data stays safely in your account.',
      confirmLabel: 'Sign out',
      destructive: true,
      onConfirm: () => void signOut(),
    });
  }

  if (profile.isLoading && !profile.data) {
    return <LoadingScreen label="Loading your profile..." />;
  }

  if (profile.isError && !profile.data) {
    return (
      <ScrollScreen
        refreshing={profile.isFetching}
        onRefresh={() => void profile.refetch()}
      >
        <ScreenHeader eyebrow="Account" title="Profile" />
        <ErrorState
          message="We could not load your profile. Check your connection and try again."
          onRetry={() => void profile.refetch()}
        />
      </ScrollScreen>
    );
  }

  const data = profile.data;
  const planTimes = data?.measurement_times?.length ? data.measurement_times : [];
  const caregiverCount = caregivers.data?.length ?? 0;

  return (
    <ScrollScreen
      refreshing={profile.isRefetching}
      onRefresh={() => {
        void profile.refetch();
        void caregivers.refetch();
      }}
    >
      <ScreenHeader eyebrow="Account" title="Profile" />

      <Card style={styles.identityCard}>
        <Avatar
          label={initials(user?.first_name ?? 'T', user?.last_name ?? 'C')}
          size={60}
        />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="title">
            {fullName(user?.first_name ?? '', user?.last_name ?? '')}
          </AppText>
          <AppText variant="caption" tone="muted">
            {user?.email ?? 'Patient account'}
            {user?.age !== null && user?.age !== undefined ? ` · ${user.age} years` : ''}
          </AppText>
        </View>
      </Card>

      <SectionHeader title="Measurement plan" />
      <Card style={{ gap: 2, paddingVertical: 8 }}>
        <ListRow
          icon="calendar-outline"
          title={planTimes.length ? 'Your schedule' : 'No schedule yet'}
          subtitle={
            planTimes.length
              ? `${planTimes.map(formatClockTime).join(' · ')}`
              : 'Choose when you want to measure'
          }
          right={<Ionicons name="chevron-forward" size={18} color={colors.mutedLight} />}
          onPress={() => router.push('/(patient)/plan')}
        />
        <ListRow
          icon="globe-outline"
          title="Timezone"
          subtitle={data?.timezone ?? 'UTC'}
          right={
            data?.measurement_times?.length ? (
              <AppText variant="caption" tone="muted">
                {daysLabel([0, 1, 2, 3, 4, 5, 6])}
              </AppText>
            ) : undefined
          }
        />
      </Card>

      <SectionHeader title="Caregivers" />
      <Card style={{ gap: 2, paddingVertical: 8 }}>
        <ListRow
          icon="people-outline"
          title={caregiverCount ? `${caregiverCount} caregiver${caregiverCount === 1 ? '' : 's'}` : 'No caregivers yet'}
          subtitle="Add someone you trust and share their login code"
          right={<Ionicons name="chevron-forward" size={18} color={colors.mutedLight} />}
          onPress={() => router.push('/(patient)/caregivers')}
        />
      </Card>

      <SectionHeader title="Care details" />
      <Card style={{ gap: spacing.md }}>
        <TextField
          label="Diagnosis"
          placeholder="e.g. Hypertension"
          value={diagnosis}
          onChangeText={setDiagnosis}
          maxLength={160}
        />
        <TextField
          label="Medical history"
          placeholder="Conditions, surgeries, or other context"
          value={history}
          onChangeText={setHistory}
          multiline
          inputStyle={styles.textArea}
        />
        <TextField
          label="Allergies"
          placeholder="Medicines, foods, or materials"
          value={allergies}
          onChangeText={setAllergies}
          multiline
          inputStyle={styles.textArea}
        />
        <TextField
          label="Medications"
          placeholder="Current medicines and doses"
          value={medications}
          onChangeText={setMedications}
          multiline
          inputStyle={styles.textArea}
        />
      </Card>

      <SectionHeader title="Blood pressure target" />
      <Card style={{ gap: spacing.md }}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <TextField
            label="Systolic"
            placeholder="130"
            value={targetSystolic}
            onChangeText={setTargetSystolic}
            keyboardType="number-pad"
            maxLength={3}
            style={{ flex: 1 }}
          />
          <TextField
            label="Diastolic"
            placeholder="80"
            value={targetDiastolic}
            onChangeText={setTargetDiastolic}
            keyboardType="number-pad"
            maxLength={3}
            style={{ flex: 1 }}
          />
        </View>
        <AppText variant="caption" tone="muted">
          Your target is used to show in-target readings. Ask your clinician what
          target is right for you.
        </AppText>
      </Card>

      <Button
        title="Save care details"
        onPress={() => save.mutate()}
        loading={save.isPending}
        size="lg"
      />

      <SectionHeader title="Account" />
      <Card style={{ gap: 4 }}>
        <KeyValue label="Account type" value="Patient" />
        <KeyValue
          label="Measurement times"
          value={planTimes.length ? planTimes.map(formatClockTime).join(', ') : 'Not set'}
        />
        <KeyValue label="Timezone" value={data?.timezone ?? 'UTC'} />
      </Card>

      <Button
        title="Sign out"
        onPress={confirmSignOut}
        variant="danger"
        icon="log-out-outline"
      />

      <AppText variant="caption" tone="muted" style={{ textAlign: 'center' }}>
        TensioCare is a support tool, not a substitute for emergency care. Call your
        local emergency number for crisis symptoms.
      </AppText>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  identityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  textArea: {
    minHeight: 86,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
});
