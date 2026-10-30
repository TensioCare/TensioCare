import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CaregiverCard } from '@/components/CaregiverCard';
import { ScreenHeader } from '@/components/ScreenHeader';
import {
  AppText,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingScreen,
  Notice,
  ScrollScreen,
  TextField,
} from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { ApiError, patientsApi } from '@/lib/api';
import { confirmAction, showAlert } from '@/lib/dialogs';
import type { CaregiverCode } from '@/lib/types';

interface CaregiverForm {
  firstName: string;
  lastName: string;
  relationship: string;
  phone: string;
  notes: string;
  priority: string;
  notifyAfter: string;
}

const emptyForm = (priority: number): CaregiverForm => ({
  firstName: '',
  lastName: '',
  relationship: '',
  phone: '',
  notes: '',
  priority: String(priority),
  notifyAfter: '15',
});

export default function PatientCaregiversScreen() {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<CaregiverForm>(emptyForm(1));
  const [formError, setFormError] = useState<string | null>(null);
  const [codeCard, setCodeCard] = useState<{ title: string; code: CaregiverCode } | null>(
    null,
  );

  const caregivers = useQuery({
    queryKey: ['caregivers', 'list'],
    queryFn: patientsApi.caregivers,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['caregivers'] });
  };

  const add = useMutation({
    mutationFn: () => {
      const priority = Number(form.priority);
      const notifyAfter = Number(form.notifyAfter);
      if (!form.firstName.trim() || !form.lastName.trim() || !form.relationship.trim()) {
        throw new Error('First name, last name and relationship are required.');
      }
      if (!Number.isInteger(priority) || priority < 1 || priority > 50) {
        throw new Error('Priority must be a whole number between 1 and 50.');
      }
      if (!Number.isInteger(notifyAfter) || notifyAfter < 5 || notifyAfter > 1440) {
        throw new Error('Alert delay must be between 5 and 1440 minutes.');
      }
      return patientsApi.addCaregiver({
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        relationship: form.relationship.trim(),
        phone: form.phone.trim() || null,
        notes: form.notes.trim() || null,
        priority,
        notify_after_minutes: notifyAfter,
      });
    },
    onSuccess: (code) => {
      invalidate();
      setFormOpen(false);
      setForm(emptyForm((caregivers.data?.length ?? 0) + 2));
      setCodeCard({ title: 'Share this caregiver code', code });
    },
    onError: (error) => {
      setFormError(
        error instanceof ApiError || error instanceof Error
          ? error.message
          : 'Could not add this caregiver.',
      );
    },
  });

  const regenerate = useMutation({
    mutationFn: (caregiverId: number) => patientsApi.regenerateCode(caregiverId),
    onSuccess: (code) => {
      invalidate();
      setCodeCard({ title: 'New caregiver code', code });
    },
    onError: (error) => {
      showAlert(
        'Could not create a code',
        error instanceof Error ? error.message : 'Please try again.',
      );
    },
  });

  const remove = useMutation({
    mutationFn: (caregiverId: number) => patientsApi.removeCaregiver(caregiverId),
    onSuccess: invalidate,
    onError: (error) => {
      showAlert(
        'Could not remove caregiver',
        error instanceof Error ? error.message : 'Please try again.',
      );
    },
  });

  function openAdd() {
    setForm(emptyForm((caregivers.data?.length ?? 0) + 1));
    setFormError(null);
    setFormOpen(true);
  }

  function confirmRemove(caregiverId: number, name: string) {
    confirmAction({
      title: `Remove ${name}?`,
      message:
        'This deletes the caregiver account, their access, and their sessions. They will need a new code to reconnect.',
      confirmLabel: 'Remove',
      destructive: true,
      onConfirm: () => remove.mutate(caregiverId),
    });
  }

  if (caregivers.isLoading && !caregivers.data) {
    return <LoadingScreen label="Loading caregivers..." />;
  }

  if (caregivers.isError && !caregivers.data) {
    return (
      <ScrollScreen
        edges={[]}
        refreshing={caregivers.isFetching}
        onRefresh={() => void caregivers.refetch()}
      >
        <ErrorState
          message="We could not load your caregivers. Check your connection and try again."
          onRetry={() => void caregivers.refetch()}
        />
      </ScrollScreen>
    );
  }

  const items = caregivers.data ?? [];

  return (
    <>
      <ScrollScreen
        edges={[]}
        refreshing={caregivers.isRefetching}
        onRefresh={() => void caregivers.refetch()}
      >
        <ScreenHeader
          eyebrow="Your circle"
          title="Caregivers"
          subtitle="Caregivers can see your readings and receive alerts when a measurement is missed."
          right={
            <Button
              title="Add"
              onPress={openAdd}
              size="sm"
              fullWidth={false}
              icon="person-add-outline"
            />
          }
        />

        <Card muted style={{ gap: 6 }}>
          <AppText variant="bodyStrong">How codes work</AppText>
          <AppText variant="caption" tone="muted">
            Add the caregiver&apos;s details, then share the 8-character code. Their
            first sign-in activates the account. One caregiver account is linked to
            one patient.
          </AppText>
        </Card>

        {items.length ? (
          <View style={{ gap: spacing.md }}>
            {items.map((caregiver) => (
              <CaregiverCard
                key={caregiver.caregiver_id}
                caregiver={caregiver}
                onRegenerate={() => regenerate.mutate(caregiver.caregiver_id)}
                onRemove={() =>
                  confirmRemove(
                    caregiver.caregiver_id,
                    `${caregiver.first_name} ${caregiver.last_name}`,
                  )
                }
              />
            ))}
          </View>
        ) : (
          <Card>
            <EmptyState
              icon="people-outline"
              title="No caregivers yet"
              message="Add someone you trust so they can follow your readings and respond when a measurement is missed."
              actionLabel="Add a caregiver"
              onAction={openAdd}
            />
          </Card>
        )}
      </ScrollScreen>

      <Modal
        visible={formOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setFormOpen(false)}
      >
        <SafeAreaView style={styles.modalSafe} edges={['top', 'bottom']}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={styles.modalHeader}>
              <View>
                <AppText variant="subtitle">Add a caregiver</AppText>
                <AppText variant="caption" tone="muted">
                  You can edit these details later.
                </AppText>
              </View>
              <Pressable onPress={() => setFormOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={24} color={colors.text} />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.modalContent}
              keyboardShouldPersistTaps="handled"
            >
              {formError ? (
                <Notice tone="danger" title="Check the details" message={formError} />
              ) : null}

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TextField
                  label="First name"
                  value={form.firstName}
                  onChangeText={(value) => setForm({ ...form, firstName: value })}
                  style={{ flex: 1 }}
                />
                <TextField
                  label="Last name"
                  value={form.lastName}
                  onChangeText={(value) => setForm({ ...form, lastName: value })}
                  style={{ flex: 1 }}
                />
              </View>

              <TextField
                label="Relationship"
                placeholder="e.g. Daughter, spouse, neighbour"
                value={form.relationship}
                onChangeText={(value) => setForm({ ...form, relationship: value })}
              />

              <TextField
                label="Phone (optional)"
                placeholder="+1 555 0100"
                value={form.phone}
                onChangeText={(value) => setForm({ ...form, phone: value })}
                keyboardType="phone-pad"
              />

              <TextField
                label="Notes (optional)"
                placeholder="Anything useful for this caregiver"
                value={form.notes}
                onChangeText={(value) => setForm({ ...form, notes: value })}
                multiline
                inputStyle={styles.textArea}
              />

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TextField
                  label="Priority"
                  value={form.priority}
                  onChangeText={(value) => setForm({ ...form, priority: value })}
                  keyboardType="number-pad"
                  hint="1 is contacted first"
                  style={{ flex: 1 }}
                />
                <TextField
                  label="Alert after"
                  value={form.notifyAfter}
                  onChangeText={(value) => setForm({ ...form, notifyAfter: value })}
                  keyboardType="number-pad"
                  hint="Minutes after a missed measurement"
                  style={{ flex: 1 }}
                />
              </View>

              <Button
                title="Create caregiver and code"
                onPress={() => add.mutate()}
                loading={add.isPending}
                size="lg"
              />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      <CodeModal card={codeCard} onClose={() => setCodeCard(null)} />
    </>
  );
}

function CodeModal({
  card,
  onClose,
}: {
  card: { title: string; code: CaregiverCode } | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!card) return;
    await Clipboard.setStringAsync(card.code.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <Modal visible={Boolean(card)} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.codeBackdrop}>
        <Card style={styles.codeCard}>
          <View style={styles.codeIcon}>
            <Ionicons name="key-outline" size={24} color={colors.brand} />
          </View>
          <AppText variant="title" style={{ textAlign: 'center' }}>
            {card?.title}
          </AppText>
          <AppText variant="body" tone="muted" style={{ textAlign: 'center' }}>
            {card
              ? `Give this code to ${card.code.first_name} ${card.code.last_name}. It is shown only once; create a new one if it gets lost.`
              : ''}
          </AppText>
          <Pressable onPress={copy} style={styles.codePill}>
            <AppText variant="title" style={styles.codeText}>
              {card?.code.code}
            </AppText>
            <Ionicons
              name={copied ? 'checkmark' : 'copy-outline'}
              size={20}
              color={colors.brand}
            />
          </Pressable>
          <AppText variant="caption" tone="muted" style={{ textAlign: 'center' }}>
            {copied ? 'Copied to clipboard' : 'Tap the code to copy it'}
          </AppText>
          <Button title="Done" onPress={onClose} size="lg" />
        </Card>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalSafe: { flex: 1, backgroundColor: colors.bg },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  modalContent: {
    padding: spacing.xl,
    gap: spacing.lg,
    paddingBottom: 60,
  },
  textArea: { minHeight: 82, textAlignVertical: 'top', paddingTop: 12 },
  codeBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  codeCard: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.xl,
    borderRadius: radius.xl,
  },
  codeIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codePill: {
    width: '100%',
    minHeight: 68,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brandMuted,
    backgroundColor: colors.brandSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  codeText: { letterSpacing: 2, color: colors.brandDark },
});
