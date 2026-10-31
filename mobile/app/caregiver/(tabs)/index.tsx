import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Brand, DeepHeader } from '@/components/Brand';
import { ScreenHeader } from '@/components/ScreenHeader';
import {
  AppText,
  Card,
  EmptyState,
  ErrorState,
  LoadingScreen,
  ProgressBar,
  ScrollScreen,
} from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { caregiversApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatTime, fullName } from '@/lib/format';
import type { MeasurementWindow } from '@/lib/types';

type DayStatus = 'done' | 'missed' | 'due' | 'upcoming';

function statusOf(window: MeasurementWindow, now: number): DayStatus {
  if (window.status === 'completed') return 'done';
  if (
    window.status === 'missed' ||
    window.status === 'escalated' ||
    window.status === 'unresolved'
  ) {
    return 'missed';
  }
  return new Date(window.due_at).getTime() > now ? 'upcoming' : 'due';
}

const statusMeta: Record<
  DayStatus,
  { label: string; bg: string; fg: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  done: { label: 'Done', bg: colors.successSoft, fg: colors.success, icon: 'checkmark-circle' },
  due: { label: 'Due now', bg: colors.warningSoft, fg: colors.warning, icon: 'time' },
  missed: { label: 'Missed', bg: colors.dangerSoft, fg: colors.danger, icon: 'close-circle' },
  upcoming: { label: 'Upcoming', bg: colors.cardMuted, fg: colors.muted, icon: 'time-outline' },
};

function isSameLocalDay(value: string, reference: Date): boolean {
  const date = new Date(value);
  return (
    date.getFullYear() === reference.getFullYear() &&
    date.getMonth() === reference.getMonth() &&
    date.getDate() === reference.getDate()
  );
}

export default function CaregiverTodayScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const patients = useQuery({
    queryKey: ['caregiver', 'patients'],
    queryFn: caregiversApi.patients,
  });
  const patient = patients.data?.[0];
  const patientId = patient?.patient_id;

  const windows = useQuery({
    queryKey: ['caregiver', patientId, 'windows', 7],
    queryFn: () => caregiversApi.windows(patientId!, 7),
    enabled: patientId !== undefined,
    refetchInterval: 60_000,
  });
  const adherence = useQuery({
    queryKey: ['caregiver', patientId, 'adherence', 7],
    queryFn: () => caregiversApi.adherence(patientId!, 7),
    enabled: patientId !== undefined,
  });

  const risk = useQuery({
    queryKey: ['caregiver', patientId, 'risk'],
    queryFn: () => caregiversApi.risk(patientId!),
    enabled: patientId !== undefined,
  });

  const refresh = () => {
    void patients.refetch();
    void windows.refetch();
    void adherence.refetch();
    void risk.refetch();
  };

  if (patients.isLoading && !patients.data) {
    return <LoadingScreen label="Loading your care circle..." />;
  }

  if (patients.isError && !patients.data) {
    return (
      <ScrollScreen refreshing={patients.isFetching} onRefresh={refresh}>
        <ScreenHeader title="Today" eyebrow="Measurement checklist" />
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
        <ScreenHeader title="Today" eyebrow="Measurement checklist" />
        <Card>
          <EmptyState
            icon="link-outline"
            title="No patient linked"
            message="Ask the patient for a caregiver code to start following their measurement schedule."
          />
        </Card>
      </ScrollScreen>
    );
  }

  const now = Date.now();
  const today = new Date();
  const patientName = fullName(patient.first_name, patient.last_name);

  const todayWindows = (windows.data ?? [])
    .filter((window) => isSameLocalDay(window.due_at, today))
    .sort(
      (a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime(),
    );

  const done = todayWindows.filter(
    (window) => window.status === 'completed',
  ).length;
  const expected = todayWindows.length;
  const missed = todayWindows.filter((window) => {
    const status = statusOf(window, now);
    return status === 'missed';
  }).length;
  const next = todayWindows.find(
    (window) =>
      window.status !== 'completed' && new Date(window.due_at).getTime() > now,
  );

  const adherenceValue = adherence.data?.adherence_percent ?? 0;

  return (
    <ScrollScreen
      edges={[]}
      refreshing={windows.isRefetching || patients.isRefetching}
      onRefresh={refresh}
      contentContainerStyle={{ paddingBottom: 120 }}
    >
      <DeepHeader
        style={[styles.deepBleed, { paddingTop: insets.top + spacing.md }]}
      >
        <View style={styles.headerTop}>
          <Brand size={34} color={colors.onDeep} />
          <View style={styles.modePill}>
            <Ionicons name="eye-outline" size={13} color={colors.onDeep} />
            <AppText variant="tiny" style={{ color: colors.onDeep }}>
              Care mode
            </AppText>
          </View>
        </View>

        <View style={{ gap: 4 }}>
          <AppText
            style={{ fontSize: 24, lineHeight: 30, color: colors.onDeep }}
          >
            {patientName}
          </AppText>
          <AppText variant="caption" style={{ color: colors.onDeep, opacity: 0.72 }}>
            Measurement checklist — you see times and completion only, never the
            readings themselves.
          </AppText>
        </View>
      </DeepHeader>

      <View style={styles.body}>
        <Card style={{ gap: spacing.md }}>
          <View style={styles.spread}>
            <View style={{ gap: 2 }}>
              <AppText variant="tiny" tone="muted">
                TODAY
              </AppText>
              <AppText
                variant="title"
                style={{ color: colors.brandDark, fontVariant: ['tabular-nums'] }}
              >
                {expected ? `${done}/${expected}` : '—'}
              </AppText>
            </View>
            <View style={[styles.donePill, missed ? styles.donePillAlert : null]}>
              <Ionicons
                name={missed ? 'alert-circle' : 'checkmark-circle'}
                size={14}
                color={missed ? colors.danger : colors.success}
              />
              <AppText variant="tiny" style={{ color: missed ? colors.danger : colors.success }}>
                {missed
                  ? `${missed} missed`
                  : done === expected && expected > 0
                    ? 'All done'
                    : 'On track'}
              </AppText>
            </View>
          </View>

          <View>
            <ProgressBar
              value={expected ? (done / expected) * 100 : 0}
              tone={missed ? colors.danger : colors.brand}
            />
            <AppText variant="caption" tone="muted" style={{ marginTop: 6 }}>
              {next
                ? `Next measurement at ${formatTime(next.due_at)}`
                : expected
                  ? 'No more measurements expected today.'
                  : 'No measurement times are scheduled for today.'}
            </AppText>
          </View>
        </Card>

        <Card style={{ gap: spacing.md }}>
          <View style={styles.spread}>
            <AppText variant="subtitle">Risk & outlook</AppText>
            <AppText variant="tiny" tone="muted">
              {risk.data
                ? `${risk.data.current.risk_score}/100 · ${risk.data.current.risk_level}`
                : '—'}
            </AppText>
          </View>
          {risk.data ? (
            <>
              <AppText variant="bodyStrong" style={{ color: colors.brandDark }}>
                {risk.data.current.risk_level === 'critical'
                  ? 'Urgent attention needed'
                  : risk.data.current.risk_level === 'high'
                    ? 'High risk — follow up soon'
                    : risk.data.current.risk_level === 'moderate'
                      ? 'Moderate risk'
                      : risk.data.current.risk_level === 'no_data'
                        ? 'Not enough data yet'
                        : 'Low risk'}
              </AppText>
              {risk.data.current.reasons.length ? (
                <AppText variant="caption" tone="muted">
                  {risk.data.current.reasons[0]}
                </AppText>
              ) : null}
              {risk.data.projections.length ? (
                <AppText variant="caption" tone="muted">
                  {risk.data.direction === 'rising'
                    ? `Rising ~${Math.abs(risk.data.slope_systolic_per_day ?? 0)} mmHg/day. ${
                        risk.data.days_until_stage_2 !== null
                          ? `Could reach stage 2 in ~${risk.data.days_until_stage_2} day(s).`
                          : 'Keep measuring.'
                      }`
                    : risk.data.direction === 'falling'
                      ? 'Trending down.'
                      : 'Stable.'}
                </AppText>
              ) : null}
              {risk.data.probability_of_missing_next_measurement !== null &&
              risk.data.probability_of_missing_next_measurement >= 0.5 ? (
                <AppText variant="caption" tone="muted">
                  ~{Math.round(risk.data.probability_of_missing_next_measurement * 100)}%
                  chance of a missed measurement.
                </AppText>
              ) : null}
            </>
          ) : (
            <AppText variant="caption" tone="muted">
              Loading risk assessment…
            </AppText>
          )}
        </Card>

        <View style={styles.spread}>
          <AppText variant="subtitle">Today's checklist</AppText>
          <AppText variant="tiny" tone="muted">
            {expected ? `${done} of ${expected} done` : ''}
          </AppText>
        </View>

        {todayWindows.length ? (
          <Card style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
            {todayWindows.map((window, index) => {
              const status = statusOf(window, now);
              const meta = statusMeta[status];
              const closedAt =
                status === 'done' ? (window.resolved_at ?? null) : null;
              return (
                <View
                  key={window.id}
                  style={[
                    styles.checkRow,
                    index < todayWindows.length - 1 && styles.rowBorder,
                  ]}
                >
                  <View style={[styles.timeBox, { backgroundColor: meta.bg }]}>
                    <AppText
                      variant="bodyStrong"
                      style={{
                        color: meta.fg,
                        fontVariant: ['tabular-nums'],
                      }}
                    >
                      {formatTime(window.due_at)}
                    </AppText>
                  </View>

                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText variant="bodyStrong">
                      {status === 'done'
                        ? 'Measurement completed'
                        : status === 'missed'
                          ? 'Measurement missed'
                          : status === 'due'
                            ? 'Measurement due'
                            : 'Scheduled measurement'}
                    </AppText>
                    <AppText variant="tiny" tone="muted">
                      {closedAt
                        ? `Logged at ${formatTime(closedAt)}`
                        : status === 'upcoming'
                          ? 'Waiting for the patient'
                          : 'Waiting for the patient'}
                    </AppText>
                  </View>

                  <View style={[styles.statusChip, { backgroundColor: meta.bg }]}>
                    <Ionicons name={meta.icon} size={12} color={meta.fg} />
                    <AppText variant="tiny" style={{ color: meta.fg }}>
                      {meta.label}
                    </AppText>
                  </View>
                </View>
              );
            })}
          </Card>
        ) : (
          <Card>
            <EmptyState
              icon="calendar-outline"
              title="Nothing scheduled today"
              message="The patient's measurement plan has no times set for today. It appears here as soon as they add one."
            />
          </Card>
        )}

        <Card style={{ gap: spacing.sm }}>
          <View style={styles.spread}>
            <AppText variant="subtitle">Last 7 days</AppText>
            <AppText variant="caption" tone="brand" style={{ fontVariant: ['tabular-nums'] }}>
              {adherence.data
                ? `${adherence.data.completed}/${adherence.data.expected} done`
                : '—'}
            </AppText>
          </View>
          <ProgressBar
            value={adherenceValue}
            tone={adherenceValue >= 80 ? colors.success : colors.warning}
          />
          <AppText variant="caption" tone="muted">
            {adherence.data?.missed
              ? `${adherence.data.missed} measurement${adherence.data.missed === 1 ? '' : 's'} missed in the last week.`
              : 'No measurements missed in the last week.'}
          </AppText>
        </Card>

        <AppText variant="caption" tone="muted" style={{ textAlign: 'center' }}>
          Signed in as {user?.first_name ?? 'caregiver'}. TensioCare supports the
          care team, it does not replace medical advice.
        </AppText>
      </View>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  deepBleed: {
    marginHorizontal: -spacing.xl,
    marginBottom: spacing.lg,
    gap: spacing.lg,
  },
  body: { gap: spacing.md },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(251,250,246,0.16)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  spread: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  donePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.successSoft,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  donePillAlert: { backgroundColor: colors.dangerSoft },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  timeBox: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: radius.md,
    minWidth: 76,
    alignItems: 'center',
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
});
