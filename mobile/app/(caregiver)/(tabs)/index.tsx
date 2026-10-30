import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ReadingCard } from '@/components/ReadingCard';
import { ScreenHeader } from '@/components/ScreenHeader';
import {
  AppText,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingScreen,
  ProgressBar,
  ScrollScreen,
  SectionHeader,
} from '@/components/ui';
import { colors, riskColors, spacing } from '@/constants/theme';
import { caregiversApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import {
  formatPercent,
  formatRelative,
  fullName,
  initials,
  riskLabel,
  trendLabel,
} from '@/lib/format';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function CaregiverHomeScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();

  const patients = useQuery({
    queryKey: ['caregiver', 'patients'],
    queryFn: caregiversApi.patients,
  });
  const patient = patients.data?.[0];
  const patientId = patient?.patient_id;

  const assessment = useQuery({
    queryKey: ['caregiver', patientId, 'assessment'],
    queryFn: () => caregiversApi.assessment(patientId!),
    enabled: patientId !== undefined,
  });
  const adherence = useQuery({
    queryKey: ['caregiver', patientId, 'adherence', 7],
    queryFn: () => caregiversApi.adherence(patientId!, 7),
    enabled: patientId !== undefined,
  });
  const readings = useQuery({
    queryKey: ['caregiver', patientId, 'readings', 5],
    queryFn: () => caregiversApi.readings(patientId!, 5),
    enabled: patientId !== undefined,
  });

  const refresh = () => {
    void patients.refetch();
    void assessment.refetch();
    void adherence.refetch();
    void readings.refetch();
  };

  if (patients.isLoading && !patients.data) {
    return <LoadingScreen label="Loading your patient..." />;
  }

  if (patients.isError && !patients.data) {
    return (
      <ScrollScreen refreshing={patients.isFetching} onRefresh={refresh}>
        <ScreenHeader eyebrow={greeting()} title="Care overview" />
        <ErrorState
          message="We could not load your linked patient. Check your connection and try again."
          onRetry={refresh}
        />
      </ScrollScreen>
    );
  }

  if (!patient) {
    return (
      <ScrollScreen refreshing={patients.isFetching} onRefresh={refresh}>
        <ScreenHeader eyebrow={greeting()} title="Care overview" />
        <Card>
          <EmptyState
            icon="link-outline"
            title="No patient linked"
            message="Ask the patient for a caregiver code. If you already had access, the patient may have removed it."
            actionLabel="Sign out"
            onAction={() => void signOut()}
          />
        </Card>
      </ScrollScreen>
    );
  }

  const data = assessment.data;
  const risk = data?.risk_level ?? 'no_data';
  const palette = riskColors[risk] ?? riskColors.no_data;
  const latest = data?.latest_reading ?? readings.data?.[0] ?? null;
  const adherenceValue = adherence.data?.adherence_percent ?? 0;
  const patientName = fullName(patient.first_name, patient.last_name);

  return (
    <ScrollScreen
      refreshing={
        patients.isRefetching ||
        assessment.isRefetching ||
        adherence.isRefetching ||
        readings.isRefetching
      }
      onRefresh={refresh}
    >
      <ScreenHeader
        eyebrow={greeting()}
        title="Care overview"
        subtitle={`You are following ${patientName}.`}
        right={
          <Avatar
            label={initials(user?.first_name ?? 'C', user?.last_name ?? 'G')}
            size={50}
            tone="violet"
          />
        }
      />

      <Card style={styles.patientCard}>
        <Avatar label={initials(patient.first_name, patient.last_name)} size={54} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="title">{patientName}</AppText>
          <AppText variant="caption" tone="muted">
            {user?.caregiver_profile?.relationship ?? 'Caregiver'}
            {' · '}
            Priority {patient.priority}
          </AppText>
        </View>
        <Badge
          label={patient.is_primary_contact ? 'Primary contact' : 'Care circle'}
          tone={patient.is_primary_contact ? 'brand' : 'muted'}
        />
      </Card>

      {assessment.isError && !assessment.data ? (
        <ErrorState
          message="We could not load today's assessment."
          onRetry={() => void assessment.refetch()}
        />
      ) : (
        <Card
          style={{
            backgroundColor: palette.bg,
            borderColor: palette.border,
            gap: spacing.md,
          }}
        >
          <View style={styles.spread}>
            <View style={[styles.riskPill, { backgroundColor: colors.card }]}>
              <View style={[styles.riskDot, { backgroundColor: palette.fg }]} />
              <AppText variant="tiny" style={{ color: palette.fg }}>
                {riskLabel(risk)}
              </AppText>
            </View>
            <AppText variant="caption" style={{ color: palette.fg }}>
              {data?.readings_last_24h ?? 0} readings in 24h
            </AppText>
          </View>
          <View style={{ gap: 6 }}>
            <AppText variant="title" style={{ color: palette.fg }}>
              {data?.headline ?? 'Waiting for a reading'}
            </AppText>
            <AppText variant="body" style={{ color: palette.fg, opacity: 0.86 }}>
              {data?.summary ??
                'Once the patient logs a reading, you will see today’s risk assessment here.'}
            </AppText>
          </View>
          {data?.reasons?.length ? (
            <View style={{ gap: 5 }}>
              {data.reasons.slice(0, 2).map((reason) => (
                <View key={reason} style={styles.bulletRow}>
                  <View style={[styles.bullet, { backgroundColor: palette.fg }]} />
                  <AppText variant="caption" style={{ color: palette.fg, flex: 1 }}>
                    {reason}
                  </AppText>
                </View>
              ))}
            </View>
          ) : null}
          <View style={styles.trendRow}>
            <Badge
              label={`7-day trend: ${trendLabel(data?.trend_7_days ?? 'not_enough_data')}`}
              tone="muted"
              style={{ backgroundColor: colors.card }}
            />
            <AppText variant="caption" style={{ color: palette.fg }}>
              Missed: {data?.missed_last_7_days ?? 0}
            </AppText>
          </View>
        </Card>
      )}

      <View style={styles.metricsRow}>
        <Card style={styles.metricCard}>
          <AppText variant="caption" tone="muted">
            Latest reading
          </AppText>
          {latest ? (
            <>
              <View style={styles.bpRow}>
                <AppText variant="title" style={{ fontVariant: ['tabular-nums'] }}>
                  {latest.systolic}
                </AppText>
                <AppText variant="subtitle" tone="muted">
                  /
                </AppText>
                <AppText variant="title" style={{ fontVariant: ['tabular-nums'] }}>
                  {latest.diastolic}
                </AppText>
                <AppText variant="caption" tone="muted">
                  mmHg
                </AppText>
              </View>
              <AppText variant="caption" tone="muted">
                {formatRelative(latest.measured_at)}
              </AppText>
            </>
          ) : (
            <AppText variant="body" tone="muted" style={{ marginTop: 6 }}>
              No readings yet
            </AppText>
          )}
        </Card>
        <Card style={styles.metricCard}>
          <AppText variant="caption" tone="muted">
            7-day adherence
          </AppText>
          <AppText variant="title" style={{ fontVariant: ['tabular-nums'] }}>
            {formatPercent(adherence.data?.adherence_percent)}
          </AppText>
          <ProgressBar
            value={adherenceValue}
            tone={adherenceValue >= 80 ? colors.success : colors.warning}
            style={{ marginTop: 4 }}
          />
          <AppText variant="caption" tone="muted">
            {adherence.data
              ? `${adherence.data.completed} of ${adherence.data.expected} expected`
              : 'Calculating...'}
          </AppText>
        </Card>
      </View>

      <SectionHeader title="Care tools" />
      <View style={styles.quickGrid}>
        <QuickAction
          icon="heart-outline"
          title="Patient details"
          subtitle="Readings, trends and report"
          onPress={() => router.push('/(caregiver)/(tabs)/patient')}
        />
        <QuickAction
          icon="notifications-outline"
          title="Alert inbox"
          subtitle="Acknowledge missed measurements"
          onPress={() => router.push('/(caregiver)/(tabs)/alerts')}
          highlight={Boolean(data?.missed_last_7_days)}
        />
      </View>

      <SectionHeader
        title="Recent readings"
        actionLabel="View all"
        onAction={() => router.push('/(caregiver)/(tabs)/patient')}
      />
      {readings.data?.length ? (
        <View style={{ gap: spacing.md }}>
          {readings.data.slice(0, 3).map((reading) => (
            <ReadingCard key={reading.id} reading={reading} />
          ))}
        </View>
      ) : (
        <Card>
          <EmptyState
            icon="pulse-outline"
            title="No readings yet"
            message="The patient has not logged a reading recently."
          />
        </Card>
      )}

      {data?.actions?.length ? (
        <>
          <SectionHeader title="Suggested next step" />
          <Card style={{ gap: spacing.sm }}>
            <Ionicons name="bulb-outline" size={22} color={colors.warning} />
            <AppText variant="body" tone="soft">
              {data.actions[0]}
            </AppText>
          </Card>
        </>
      ) : null}

      <Button
        title="Open alert inbox"
        onPress={() => router.push('/(caregiver)/(tabs)/alerts')}
        variant="secondary"
        icon="notifications-outline"
      />
    </ScrollScreen>
  );
}

function QuickAction({
  icon,
  title,
  subtitle,
  onPress,
  highlight = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
  highlight?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickCard,
        highlight && { backgroundColor: colors.dangerSoft, borderColor: '#FECACA' },
        pressed && { opacity: 0.75 },
      ]}
    >
      <View
        style={[
          styles.quickIcon,
          highlight && { backgroundColor: colors.card },
        ]}
      >
        <Ionicons
          name={icon}
          size={21}
          color={highlight ? colors.danger : colors.brand}
        />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="bodyStrong">{title}</AppText>
        <AppText variant="caption" tone="muted">
          {subtitle}
        </AppText>
      </View>
      <Ionicons name="chevron-forward" size={17} color={colors.mutedLight} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  patientCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  spread: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  riskPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },
  riskDot: { width: 7, height: 7, borderRadius: 4 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  bullet: { width: 5, height: 5, borderRadius: 3, marginTop: 6 },
  trendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  metricsRow: { flexDirection: 'row', gap: spacing.md },
  metricCard: { flex: 1, gap: 4 },
  bpRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3, flexWrap: 'wrap' },
  quickGrid: { gap: spacing.md },
  quickCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  quickIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandSoft,
  },
});
