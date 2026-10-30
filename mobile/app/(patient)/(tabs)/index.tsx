import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Brand, DeepHeader } from '@/components/Brand';
import { TrendChart, type TrendPoint } from '@/components/Chart';
import {
  AppText,
  Avatar,
  Button,
  Card,
  ErrorState,
  LoadingScreen,
  ScrollScreen,
  SectionHeader,
} from '@/components/ui';
import { colors, fonts, radius, riskColors, spacing } from '@/constants/theme';
import { notificationsApi, patientsApi, insightsApi, readingsApi, remindersApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import {
  formatClockTime,
  formatDateTime,
  formatPercent,
  formatTime,
  initials,
  riskLabel,
} from '@/lib/format';
import type { MeasurementWindow } from '@/lib/types';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function pointLabel(value: string): string {
  const date = new Date(value);
  const hour = date.getHours();
  const suffix = hour < 12 ? 'AM' : 'PM';
  const hour12 = hour % 12 || 12;
  return `${date.getDate()} ${hour12}${suffix}`;
}

const badgeOnDeep: Record<string, { bg: string; fg: string }> = {
  no_data: { bg: 'rgba(251,250,246,0.14)', fg: '#CFE3DB' },
  low: { bg: 'rgba(126,205,174,0.20)', fg: '#A5E7CB' },
  moderate: { bg: 'rgba(216,149,61,0.22)', fg: '#F2C58C' },
  high: { bg: 'rgba(214,133,88,0.24)', fg: '#F4C3A9' },
  critical: { bg: 'rgba(244,150,155,0.20)', fg: '#F7C0C3' },
};

function isSameLocalDay(value: string, reference = new Date()): boolean {
  const date = new Date(value);
  return (
    date.getFullYear() === reference.getFullYear() &&
    date.getMonth() === reference.getMonth() &&
    date.getDate() === reference.getDate()
  );
}

export default function PatientHomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const assessment = useQuery({
    queryKey: ['assessment'],
    queryFn: insightsApi.assessment,
  });
  const adherence = useQuery({
    queryKey: ['adherence', 7],
    queryFn: () => remindersApi.adherence(7),
  });
  const windows = useQuery({
    queryKey: ['reminder-windows', 14],
    queryFn: () => remindersApi.windows(14),
  });
  const profile = useQuery({
    queryKey: ['profile'],
    queryFn: patientsApi.profile,
  });
  const chart = useQuery({
    queryKey: ['readings', 'chart'],
    queryFn: () => readingsApi.list(14),
  });
  const unread = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: notificationsApi.unreadCount,
    refetchInterval: 45_000,
  });

  const snooze = useMutation({
    mutationFn: (windowId: number) => remindersApi.snooze(windowId, 15),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['reminder-windows'] });
      void queryClient.invalidateQueries({ queryKey: ['assessment'] });
      void queryClient.invalidateQueries({ queryKey: ['adherence'] });
    },
  });

  const refresh = () => {
    void assessment.refetch();
    void adherence.refetch();
    void windows.refetch();
    void profile.refetch();
    void chart.refetch();
    void unread.refetch();
  };

  if (assessment.isLoading && !assessment.data) {
    return <LoadingScreen label="Checking today's readings..." />;
  }

  if (assessment.isError && !assessment.data) {
    return (
      <ScrollScreen refreshing={assessment.isFetching} onRefresh={refresh}>
        <View style={[styles.deepBleed, { paddingTop: insets.top + spacing.lg }]}>
          <DeepHeader>
            <Brand size={38} color={colors.onDeep} />
          </DeepHeader>
        </View>
        <ErrorState
          message="We could not reach the health service. Check your connection and try again."
          onRetry={refresh}
        />
      </ScrollScreen>
    );
  }

  const data = assessment.data;
  const risk = data?.risk_level ?? 'no_data';
  const palette = riskColors[risk] ?? riskColors.no_data;
  const badge = badgeOnDeep[risk] ?? badgeOnDeep.no_data;
  const latest = data?.latest_reading ?? null;
  const adherenceValue = adherence.data?.adherence_percent ?? 0;
  const now = Date.now();

  const todayWindows = (windows.data ?? []).filter((window) =>
    isSameLocalDay(window.due_at),
  );
  const expectedToday = todayWindows.length;
  const doneToday = todayWindows.filter(
    (window) => window.status === 'completed',
  ).length;
  const missedToday = todayWindows.filter(
    (window) =>
      window.status === 'missed' ||
      window.status === 'escalated' ||
      window.status === 'unresolved',
  );
  const upcoming = (windows.data ?? [])
    .filter(
      (window) =>
        window.status === 'pending' && new Date(window.due_at).getTime() > now,
    )
    .slice(0, 3);

  const chartPoints: TrendPoint[] = (chart.data ?? [])
    .slice()
    .sort(
      (a, b) => new Date(a.measured_at).getTime() - new Date(b.measured_at).getTime(),
    )
    .slice(-14)
    .map((reading) => ({
      label: pointLabel(reading.measured_at),
      systolic: reading.systolic,
      diastolic: reading.diastolic,
    }));

  const times = profile.data?.measurement_times ?? [];

  return (
    <ScrollScreen
      edges={[]}
      refreshing={
        assessment.isRefetching ||
        adherence.isRefetching ||
        windows.isRefetching ||
        profile.isRefetching
      }
      onRefresh={refresh}
      contentContainerStyle={{ paddingBottom: 120 }}
    >
      <DeepHeader style={[styles.deepBleed, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.headerTop}>
          <Brand size={36} color={colors.onDeep} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open your profile"
            onPress={() => router.push('/(patient)/(tabs)/profile')}
            hitSlop={8}
          >
            <Avatar label={initials(user?.first_name ?? 'T', user?.last_name ?? 'C')} size={40} />
          </Pressable>
        </View>

        <View style={{ gap: 6 }}>
          <AppText
            style={{
              fontFamily: fonts.bold,
              fontSize: 24,
              lineHeight: 30,
              color: colors.onDeep,
            }}
          >
            {greeting()}, {user?.first_name ?? 'there'}
          </AppText>
        </View>

        <View style={{ gap: 4, marginTop: spacing.sm }}>
          <View style={styles.readingRow}>
            <AppText
              style={{
                fontFamily: fonts.extrabold,
                fontSize: 36,
                lineHeight: 44,
                color: colors.onDeep,
                fontVariant: ['tabular-nums'],
              }}
            >
              {latest ? `${latest.systolic}/${latest.diastolic}` : '—/—'}
            </AppText>
            <AppText variant="caption" style={{ color: colors.onDeep, opacity: 0.7 }}>
              mmHg
            </AppText>
          </View>
          <AppText variant="caption" style={{ color: colors.onDeep, opacity: 0.7 }}>
            {latest
              ? `Pulse ${latest.pulse ?? '—'} bpm · measured ${formatTime(latest.measured_at)}`
              : 'Log your first reading to start today'}
          </AppText>
        </View>

        <View style={[styles.riskBadge, { backgroundColor: badge.bg }]}>
          <View style={[styles.riskDot, { backgroundColor: badge.fg }]} />
          <AppText variant="tiny" style={{ color: badge.fg }}>
            {riskLabel(risk)}
          </AppText>
        </View>
      </DeepHeader>

      <View style={styles.body}>
        {missedToday.length ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/reading/new')}
            style={({ pressed }) => [styles.warningCard, pressed && { opacity: 0.8 }]}
          >
            <View style={styles.warningIcon}>
              <Ionicons name="alarm-outline" size={20} color={colors.warning} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong">
                Measurement missed at {formatTime(missedToday[0].due_at)}
              </AppText>
              <AppText variant="caption" tone="muted">
                {missedToday.length > 1
                  ? `${missedToday.length} measurements still outstanding today. `
                  : ''}
                Tap to log it now.
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.warning} />
          </Pressable>
        ) : null}

        {risk === 'critical' || risk === 'high' ? (
          <Card style={[styles.alertCard, { backgroundColor: colors.danger, borderColor: colors.danger }]}>
            <View style={styles.alertHeader}>
              <Ionicons name="warning-outline" size={18} color={colors.onBrand} />
              <AppText variant="tiny" style={{ color: colors.onBrand }}>
                {riskLabel(risk)}
              </AppText>
            </View>
            <AppText variant="subtitle" style={{ color: colors.onBrand }}>
              {data?.headline ?? 'Keep an eye on your readings'}
            </AppText>
            {data?.summary ? (
              <AppText variant="caption" style={{ color: colors.onBrand, opacity: 0.85 }}>
                {data.summary}
              </AppText>
            ) : null}
            <AppText variant="caption" style={{ color: colors.onBrand, opacity: 0.72 }}>
              Your caregiver and doctor are notified when a scheduled measurement is missed.
            </AppText>
          </Card>
        ) : null}

        <View style={styles.statsRow}>
          <Card style={styles.statCard}>
            <AppText variant="tiny" tone="muted">
              Today
            </AppText>
            <AppText
              variant="title"
              style={{ fontVariant: ['tabular-nums'], color: colors.brandDark }}
            >
              {expectedToday ? `${doneToday}/${expectedToday}` : '—'}
            </AppText>
            <AppText variant="tiny" tone="muted">
              measurements
            </AppText>
          </Card>

          <Card style={styles.statCard}>
            <AppText variant="tiny" tone="muted">
              7-day average
            </AppText>
            <AppText
              variant="title"
              style={{ fontVariant: ['tabular-nums'], color: colors.brandDark }}
            >
              {data?.average_systolic && data?.average_diastolic
                ? `${Math.round(data.average_systolic)}/${Math.round(data.average_diastolic)}`
                : '—'}
            </AppText>
            <AppText variant="tiny" tone="muted">
              mmHg
            </AppText>
          </Card>

          <Card style={styles.statCard}>
            <AppText variant="tiny" tone="muted">
              Alerts
            </AppText>
            <AppText
              variant="title"
              style={{ fontVariant: ['tabular-nums'], color: colors.brandDark }}
            >
              {unread.data?.unread ?? 0}
            </AppText>
            <AppText variant="tiny" tone="muted">
              unread
            </AppText>
          </Card>
        </View>

        <Card style={{ gap: spacing.md }}>
          <View style={styles.spread}>
            <AppText variant="subtitle">Recent trend</AppText>
            <View style={styles.legend}>
              <View style={[styles.legendLine, { backgroundColor: colors.brand }]} />
              <AppText variant="tiny" tone="muted">
                Top
              </AppText>
              <View
                style={[styles.legendLine, { backgroundColor: colors.brandMuted }]}
              />
              <AppText variant="tiny" tone="muted">
                Bottom
              </AppText>
            </View>
          </View>
          <TrendChart
            points={chartPoints}
            summary="Log a few readings and your trend appears here."
          />
          <AppText variant="caption" tone="muted" style={{ textAlign: 'center' }}>
            {data?.trend_7_days === 'improving'
              ? 'Your readings are trending down over the last 7 days.'
              : data?.trend_7_days === 'worsening'
                ? 'Your readings have been drifting up over the last 7 days.'
                : data?.trend_7_days === 'stable'
                  ? 'Your readings have been steady over the last 7 days.'
                  : 'Not enough data yet to describe a trend.'}
          </AppText>
        </Card>

        <SectionHeader
          title="Today's plan"
          actionLabel="Edit plan"
          onAction={() => router.push('/(patient)/plan')}
        />
        <Card style={{ gap: spacing.md }}>
          <View style={styles.chipRow}>
            {times.length ? (
              times.map((time) => (
                <View key={time} style={styles.timeChip}>
                  <Ionicons name="alarm-outline" size={13} color={colors.brand} />
                  <AppText variant="tiny" style={{ color: colors.brandDark }}>
                    {formatClockTime(time)}
                  </AppText>
                </View>
              ))
            ) : (
              <AppText variant="caption" tone="muted">
                No measurement times set yet.
              </AppText>
            )}
          </View>

          <View style={{ gap: 2 }}>
            <AppText variant="label" tone="muted">
              Next up
            </AppText>
            {upcoming.length ? (
              upcoming.map((window, index) => (
                <UpcomingRow
                  key={window.id}
                  window={window}
                  last={index === upcoming.length - 1}
                  onSnooze={() => snooze.mutate(window.id)}
                  snoozing={snooze.isPending && snooze.variables === window.id}
                />
              ))
            ) : (
              <AppText variant="caption" tone="muted" style={{ paddingVertical: spacing.sm }}>
                Nothing else scheduled right now.
              </AppText>
            )}
          </View>
        </Card>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/(patient)/assistant')}
          style={({ pressed }) => [styles.assistantCard, pressed && { opacity: 0.85 }]}
        >
          <View style={styles.assistantIcon}>
            <Ionicons name="chatbubbles-outline" size={22} color={colors.brandDark} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="bodyStrong">Ask the assistant</AppText>
            <AppText variant="caption" tone="muted">
              Answers about your readings, targets and routine.
            </AppText>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.brand} />
        </Pressable>

        <AppText variant="caption" tone="muted" style={{ textAlign: 'center' }}>
          Adherence this week: {formatPercent(adherenceValue)} of scheduled
          measurements. TensioCare supports your care team, it does not replace
          medical advice.
        </AppText>
      </View>
    </ScrollScreen>
  );
}

function UpcomingRow({
  window,
  last,
  onSnooze,
  snoozing,
}: {
  window: MeasurementWindow;
  last: boolean;
  onSnooze: () => void;
  snoozing: boolean;
}) {
  return (
    <View style={[styles.upcomingRow, !last && styles.upcomingBorder]}>
      <View style={styles.upcomingTime}>
        <Ionicons name="time-outline" size={17} color={colors.brand} />
        <View style={{ flex: 1 }}>
          <AppText variant="bodyStrong">{formatTime(window.due_at)}</AppText>
          <AppText variant="tiny" tone="muted">
            {formatDateTime(window.due_at)}
          </AppText>
        </View>
      </View>
      <Button
        title={snoozing ? 'Moving...' : 'Snooze 15m'}
        onPress={onSnooze}
        variant="ghost"
        size="sm"
        fullWidth={false}
        loading={snoozing}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  deepBleed: {
    marginHorizontal: -spacing.xl,
    marginBottom: spacing.lg,
  },
  body: { gap: spacing.lg },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  readingRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  riskBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    marginTop: spacing.sm,
  },
  riskDot: { width: 6, height: 6, borderRadius: 3 },
  spread: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendLine: { width: 14, height: 3, borderRadius: 2 },
  warningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: '#EBDCC0',
  },
  warningIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertCard: { gap: spacing.sm },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    opacity: 0.9,
  },
  statsRow: { flexDirection: 'row', gap: spacing.sm },
  statCard: { flex: 1, alignItems: 'flex-start', gap: 2, padding: spacing.md },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  timeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.brandSoft,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: 8,
  },
  upcomingBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  upcomingTime: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  assistantCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.brandSoft,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.brandMuted,
  },
  assistantIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
