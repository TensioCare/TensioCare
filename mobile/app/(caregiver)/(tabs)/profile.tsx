import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ScreenHeader } from '@/components/ScreenHeader';
import {
  AppText,
  Avatar,
  Button,
  Card,
  KeyValue,
  LoadingScreen,
  ScrollScreen,
  SectionHeader,
  TextField,
} from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { caregiversApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { confirmAction, showAlert } from '@/lib/dialogs';
import { fullName, initials } from '@/lib/format';

export default function CaregiverProfileScreen() {
  const queryClient = useQueryClient();
  const { user, signOut, refreshUser } = useAuth();
  const patients = useQuery({
    queryKey: ['caregiver', 'patients'],
    queryFn: caregiversApi.patients,
  });
  const patient = patients.data?.[0];

  const [initialized, setInitialized] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [relationship, setRelationship] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState('1');
  const [notifyAfter, setNotifyAfter] = useState('15');

  useEffect(() => {
    if (initialized || !user || (patient === undefined && patients.isLoading)) return;
    setFirstName(user.first_name);
    setLastName(user.last_name);
    setRelationship(user.caregiver_profile?.relationship ?? '');
    setPhone(user.caregiver_profile?.phone ?? '');
    setNotes(user.caregiver_profile?.notes ?? '');
    if (patient) {
      setPriority(String(patient.priority));
      setNotifyAfter(String(patient.notify_after_minutes));
    }
    setInitialized(true);
  }, [initialized, patient, patients.isLoading, user]);

  const saveSelf = useMutation({
    mutationFn: () => {
      if (!firstName.trim() || !lastName.trim() || !relationship.trim()) {
        throw new Error('Name and relationship are required.');
      }
      return caregiversApi.updateMe({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        relationship: relationship.trim(),
        phone: phone.trim() || null,
        notes: notes.trim() || null,
      });
    },
    onSuccess: async () => {
      await refreshUser();
      void queryClient.invalidateQueries({ queryKey: ['caregiver'] });
      showAlert('Profile saved', 'Your contact details have been updated.');
    },
    onError: (error) => {
      showAlert(
        'Could not save profile',
        error instanceof Error ? error.message : 'Please try again.',
      );
    },
  });

  const saveLink = useMutation({
    mutationFn: () => {
      if (!patient) throw new Error('No patient is linked.');
      const nextPriority = Number(priority);
      const nextNotify = Number(notifyAfter);
      if (!Number.isInteger(nextPriority) || nextPriority < 1 || nextPriority > 50) {
        throw new Error('Priority must be between 1 and 50.');
      }
      if (!Number.isInteger(nextNotify) || nextNotify < 5 || nextNotify > 1440) {
        throw new Error('Alert delay must be between 5 and 1440 minutes.');
      }
      return caregiversApi.updateLink(patient.patient_id, {
        priority: nextPriority,
        notify_after_minutes: nextNotify,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['caregiver'] });
      showAlert('Alert settings saved', 'Your place in the care circle has been updated.');
    },
    onError: (error) => {
      showAlert(
        'Could not save alert settings',
        error instanceof Error ? error.message : 'Please try again.',
      );
    },
  });

  const leave = useMutation({
    mutationFn: () => {
      if (!patient) throw new Error('No patient is linked.');
      return caregiversApi.leave(patient.patient_id);
    },
    onSuccess: async () => {
      await signOut();
    },
    onError: (error) => {
      showAlert(
        'Could not leave the care circle',
        error instanceof Error ? error.message : 'Please try again.',
      );
    },
  });

  function confirmLeave() {
    if (!patient) return;
    confirmAction({
      title: 'Leave this care circle?',
      message:
        'This deletes your caregiver account and access. The patient would need to add you again with a new code.',
      confirmLabel: 'Leave',
      destructive: true,
      onConfirm: () => leave.mutate(),
    });
  }

  if (patients.isLoading && !patients.data) {
    return <LoadingScreen label="Loading your profile..." />;
  }

  return (
    <ScrollScreen
      refreshing={patients.isRefetching}
      onRefresh={() => void patients.refetch()}
    >
      <ScreenHeader eyebrow="Caregiver account" title="Profile" />

      <Card style={styles.identityCard}>
        <Avatar
          label={initials(user?.first_name ?? 'C', user?.last_name ?? 'G')}
          size={60}
          tone="violet"
        />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="title">
            {fullName(user?.first_name ?? '', user?.last_name ?? '')}
          </AppText>
          <AppText variant="caption" tone="muted">
            {user?.caregiver_profile?.relationship ?? 'Caregiver'}
            {patient ? ` · following ${fullName(patient.first_name, patient.last_name)}` : ''}
          </AppText>
        </View>
      </Card>

      <SectionHeader title="My contact details" />
      <Card style={{ gap: spacing.md }}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <TextField
            label="First name"
            value={firstName}
            onChangeText={setFirstName}
            style={{ flex: 1 }}
          />
          <TextField
            label="Last name"
            value={lastName}
            onChangeText={setLastName}
            style={{ flex: 1 }}
          />
        </View>
        <TextField
          label="Relationship"
          value={relationship}
          onChangeText={setRelationship}
          placeholder="e.g. Daughter, spouse"
        />
        <TextField
          label="Phone"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="+1 555 0100"
        />
        <TextField
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          multiline
          inputStyle={styles.textArea}
          placeholder="Anything the patient should know"
        />
        <Button
          title="Save my details"
          onPress={() => saveSelf.mutate()}
          loading={saveSelf.isPending}
        />
      </Card>

      {patient ? (
        <>
          <SectionHeader title="Alert settings" />
          <Card style={{ gap: spacing.md }}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TextField
                label="Priority"
                value={priority}
                onChangeText={setPriority}
                keyboardType="number-pad"
                hint="1 is contacted first"
                style={{ flex: 1 }}
              />
              <TextField
                label="Alert after"
                value={notifyAfter}
                onChangeText={setNotifyAfter}
                keyboardType="number-pad"
                hint="Minutes after a missed reading"
                style={{ flex: 1 }}
              />
            </View>
            <Button
              title="Save alert settings"
              onPress={() => saveLink.mutate()}
              loading={saveLink.isPending}
              variant="secondary"
            />
          </Card>

          <SectionHeader title="Linked patient" />
          <Card style={{ gap: 4 }}>
            <KeyValue
              label="Patient"
              value={fullName(patient.first_name, patient.last_name)}
            />
            <KeyValue label="Priority" value={String(patient.priority)} />
            <KeyValue
              label="Alert delay"
              value={`${patient.notify_after_minutes} minutes`}
            />
          </Card>

          <Button
            title="Leave this care circle"
            onPress={confirmLeave}
            variant="danger"
            icon="exit-outline"
            loading={leave.isPending}
          />
        </>
      ) : null}

      <SectionHeader title="Account" />
      <Card style={{ gap: 4 }}>
        <KeyValue label="Account type" value="Caregiver" />
        <KeyValue label="Email" value={user?.email ?? 'Code-based account'} />
        <KeyValue label="Status" value={user?.is_active ? 'Active' : 'Inactive'} />
      </Card>

      <Button
        title="Sign out"
        onPress={() => {
          confirmAction({
            title: 'Sign out?',
            message: 'You can sign back in with the same code.',
            confirmLabel: 'Sign out',
            destructive: true,
            onConfirm: () => void signOut(),
          });
        }}
        variant="secondary"
        icon="log-out-outline"
      />

      <AppText variant="caption" tone="muted" style={{ textAlign: 'center' }}>
        Only acknowledge an alert when you have checked on the patient.
      </AppText>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  identityCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  textArea: { minHeight: 82, textAlignVertical: 'top', paddingTop: 12 },
});
