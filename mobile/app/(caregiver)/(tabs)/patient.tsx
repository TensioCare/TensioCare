import { useQuery } from '@tanstack/react-query';
import { StyleSheet, View } from 'react-native';

import { ReadingCard } from '@/components/ReadingCard';
import { ScreenHeader } from '@/components/ScreenHeader';
import {
  AppText,
  Badge,
  Card,
  EmptyState,
  ErrorState,
  LoadingScreen,
  Metric,
  Notice,
  ScrollScreen,
  SectionHeader,
} from '@/components/ui';
import { colors, riskColors, spacing } from '@/constants/theme';
import { caregiversApi } from '@/lib/api';
import {
  formatClockTime,
  formatPercent,
  fullName,
  riskLabel,
  trendLabel,
} from '@/lib/format';

export default function CaregiverPatientScreen() {
  const patients = useQuery({
    queryKey: ['caregiver', 'patients'],
    queryFn: caregiversApi.patients,
  });
  const patient = patients.data?.[0];
  const patientId = patient?.patient_id;

  const report = useQuery({
    queryKey: ['caregiver', patientId, 'report', 15],
    queryFn: () => caregiversApi.report(patientId!, 15),
    enabled: patientId !== undefined,
  });
  const readings = useQuery({
    queryKey: ['caregiver', patientId, 'readings', 20],
    queryFn: () => caregiversApi.readings(patientId!, 20),
    enabled: patientId !== undefined,
  });

  const refresh = () => {
    void patients.refetch();
    void report.refetch();
    void readings.refetch();
  };

  if (patients.isLoading && !patients.data) {
    return <LoadingScreen label="Loading patient details..." />;
  }

  if (!patient) {
    return (
      <ScrollScreen refreshing={patients.isFetching} onRefresh={refresh}>
        <ScreenHeader eyebrow="Patient" title="No patient linked" />
        <Card>
          <EmptyState
            icon="link-outline"
            title="No patient linked"
            message="Ask the patient for a new caregiver code."
          />
        </Card>
      </ScrollScreen>
    );
  }

  if (report.isError && !report.data) {
    return (
      <ScrollScreen refreshing={report.isFetching} onRefresh={refresh}>
        <ScreenHeader eyebrow="Patient" title={fullName(patient.first_name, patient.last_name)} />
        <ErrorState
          message="We could not load the patient report. Check your connection and try again."
          onRetry={refresh}
        />
      </ScrollScreen>
    );
  }

  const data = report.data;
  const analysis = data?.analysis;
  const palette = riskColors[data?.risk_level ?? 'no_data'] ?? riskColors.no_data;
  const items = readings.data ?? [];

  return (
    <ScrollScreen
      refreshing={report.isRefetching || readings.isRefetching}
      onRefresh={refresh}
    >
      <ScreenHeader
        eyebrow="Patient"
        title={fullName(patient.first_name, patient.last_name)}
        subtitle={`Priority ${patient.priority} in the care circle · alerted after ${patient.notify_after_minutes} min`}
        right={
          data ? (
            <Badge
              label={riskLabel(data.risk_level)}
              tone={
                data.risk_level === 'critical' || data.risk_level === 'high'
                  ? 'danger'
                  : data.risk_level === 'moderate'
                    ? 'warning'
                    : 'muted'
              }
            />
          ) : undefined
        }
      />

      {data ? (
        <Card style={{ backgroundColor: palette.bg, borderColor: palette.border, gap: spacing.md }}>
          <AppText variant="title" style={{ color: palette.fg }}>
            {data.headline}
          </AppText>
          <AppText variant="body" style={{ color: palette.fg, opacity: 0.88 }}>
            {data.narrative}
          </AppText>
          <View style={styles.rowWrap}>
            <Badge
              label={`Trend: ${trendLabel(analysis?.trend ?? 'not_enough_data')}`}
              tone="muted"
              style={{ backgroundColor: colors.card }}
            />
            <Badge
              label={`Adherence: ${formatPercent(data.adherence.adherence_percent)}`}
              tone="muted"
              style={{ backgroundColor: colors.card }}
            />
          </View>
        </Card>
      ) : null}

      <SectionHeader title="Care details" />
      <Card style={{ gap: spacing.md }}>
        <CareRow label="Diagnosis" value={patient.diagnosis || 'Not added'} />
        <CareRow
          label="Target"
          value={
            patient.target_systolic !== null && patient.target_diastolic !== null
              ? `${patient.target_systolic}/${patient.target_diastolic} mmHg`
              : 'Not set'
          }
        />
        <CareRow label="Allergies" value={patient.allergies || 'None recorded'} />
        <CareRow label="Medications" value={patient.medications || 'None recorded'} />
        {patient.medical_history ? (
          <CareRow label="Medical history" value={patient.medical_history} />
        ) : null}
        <CareRow
          label="Measurement plan"
          value={
            patient.measurement_times.length
              ? patient.measurement_times.map(formatClockTime).join(' · ')
              : 'Not set'
          }
        />
      </Card>

      {analysis ? (
        <Card style={{ gap: spacing.md }}>
          <View style={styles.spread}>
            <View>
              <AppText variant="subtitle">Last 15 days</AppText>
              <AppText variant="caption" tone="muted">
                {analysis.reading_count} readings
              </AppText>
            </View>
            <Badge
              label={trendLabel(analysis.trend)}
              tone={
                analysis.trend === 'improving'
                  ? 'success'
                  : analysis.trend === 'worsening'
                    ? 'danger'
                    : 'muted'
              }
            />
          </View>
          <View style={styles.metricsRow}>
            <Metric
              label="Average"
              value={
                analysis.average_systolic !== null && analysis.average_diastolic !== null
                  ? `${Math.round(analysis.average_systolic)}/${Math.round(analysis.average_diastolic)}`
                  : '—'
              }
              unit="mmHg"
            />
            <Metric
              label="In target"
              value={formatPercent(analysis.in_target_percent)}
              tone={
                analysis.in_target_percent !== null && analysis.in_target_percent >= 70
                  ? 'success'
                  : 'warning'
              }
            />
            <Metric label="Readings" value={String(analysis.reading_count)} />
          </View>
          {analysis.alerts.length ? (
            <View style={{ gap: spacing.sm }}>
              {analysis.alerts.slice(0, 2).map((alert) => (
                <Notice key={alert} tone="warning" title="Worth noting" message={alert} />
              ))}
            </View>
          ) : null}
        </Card>
      ) : null}

      {data?.highlights?.length ? (
        <>
          <SectionHeader title="Highlights" />
          <Card style={{ gap: spacing.sm }}>
            {data.highlights.map((highlight) => (
              <View key={highlight} style={styles.bulletRow}>
                <View style={styles.bullet} />
                <AppText variant="body" tone="soft" style={{ flex: 1 }}>
                  {highlight}
                </AppText>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {data?.recommendations?.length ? (
        <>
          <SectionHeader title="Recommendations" />
          <Card style={{ gap: spacing.sm }}>
            {data.recommendations.map((recommendation) => (
              <View key={recommendation} style={styles.bulletRow}>
                <View style={[styles.bullet, { backgroundColor: colors.success }]} />
                <AppText variant="body" tone="soft" style={{ flex: 1 }}>
                  {recommendation}
                </AppText>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <SectionHeader
        title="Readings"
        actionLabel={`${items.length} shown`}
        onAction={() => undefined}
      />
      {items.length ? (
        <View style={{ gap: spacing.md }}>
          {items.map((reading) => (
            <ReadingCard key={reading.id} reading={reading} />
          ))}
        </View>
      ) : (
        <Card>
          <EmptyState
            icon="pulse-outline"
            title="No readings yet"
            message="The patient has not logged any readings."
          />
        </Card>
      )}
    </ScrollScreen>
  );
}

function CareRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
      <AppText variant="caption" tone="muted">
        {label}
      </AppText>
      <AppText variant="body" tone="soft">
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  spread: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metricsRow: { flexDirection: 'row', gap: spacing.md },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  bullet: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 8,
    backgroundColor: colors.brand,
  },
});
