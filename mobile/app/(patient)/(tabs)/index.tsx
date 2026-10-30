import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ScreenHeader } from '@/components/ScreenHeader';
import {
  AppText,
  Avatar,
  Badge,
  Button,
  Card,
  ErrorState,
  LoadingScreen,
  ProgressBar,
  ScrollScreen,
  SectionHeader,
  type IconName,
} from '@/components/ui';
import { colors, riskColors, spacing } from '@/constants/theme';
import { patientsApi, insightsApi, remindersApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import {
  formatDateTime,
  formatPercent,
  formatRelative,
  formatTime,
  initials,
  riskLabel,
  trendLabel,
} from '@/lib/format';
import type { MeasurementWindow } from '@/lib/types';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function PatientHomeScreen() {
  const router = useRouter();
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
  };

  if (assessment.isLoading && !assessment.data) {
    return <LoadingScreen label="Checking today's readings..." />;
  }

  if (assessment.isError && !assessment.data) {
    return (
      <ScrollScreen refreshing={assessment.isFetching} onRefresh={refresh}>
        <ScreenHeader eyebrow={greeting()} title="Today" />
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
  const latest = data?.latest_reading ?? null;
  const adherenceValue = adherence.data?.adherence_percent ?? 0;
  const now = Date.now();
  const upcoming = (windows.data ?? [])
    .filter(
      (window) =>
        window.status === 'pending' && new Date(window.due_at).getTime() > now,
    )
    .slice(0, 3);

  const actions = (data?.actions ?? []).slice(0, 3);
  const reasons = (data?.reasons ?? []).slice(0, 3);

  return (
    <ScrollScreen
      refreshing={
        assessment.isRefetching ||
        adherence.isRefetching ||
        windows.isRefetching ||
        profile.isRefetching
      }
      onRefresh={refresh}
    >
      <ScreenHeader
        eyebrow={greeting()}
        title={`Hi, ${user?.first_name ?? 'there'}`}
        subtitle="Here is how today looks, and what is coming next."
        right={
          <Avatar
            label={initials(user?.first_name ?? 'T', user?.last_name ?? 'C')}
            size={50}
          />
        }
      />

      <Card style={{ backgroundColor: palette.bg, borderColor: palette.border, gap: spacing.md }}>
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
            {data?.headline ?? 'Start with your first reading'}
          </AppText>
          <AppText variant="body" style={{ color: palette.fg, opacity: 0.86 }}>
            {data?.summary ?? 'Log a blood pressure reading to see your daily assessment.'}
          </AppText>
        </View>

        {reasons.length ? (
          <View style={{ gap: 5 }}>
            {reasons.map((reason) => (
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
          {data?.average_systolic && data?.average_diastolic ? (
            <AppText variant="caption" style={{ color: palette.fg }}>
              Avg {Math.round(data.average_systolic)}/{Math.round(data.average_diastolic)}
            </AppText>
          ) : null}
        </View>
      </Card>

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
              No reading yet
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

      <SectionHeader title="Quick actions" />
      <View style={styles.quickGrid}>
        <QuickAction
          icon="add-circle-outline"
          title="Log a reading"
          subtitle="Add blood pressure now"
          onPress={() => router.push('/reading/new')}
          highlight
        />
        <QuickAction
          icon="calendar-outline"
          title="Measurement plan"
          subtitle={profile.data?.measurement_times?.length
            ? `${profile.data.measurement_times.length} times per day`
            : 'Set your schedule'}
          onPress={() => router.push('/(patient)/(tabs)/plan')}
        />
        <QuickAction
          icon="people-outline"
          title="Caregivers"
          subtitle="Codes, alerts and contacts"
          onPress={() => router.push('/(patient)/caregivers')}
        />
        <QuickAction
          icon="notifications-outline"
          title="Alerts"
          subtitle="Inbox and acknowledgements"
          onPress={() => router.push('/(patient)/(tabs)/alerts')}
        />
      </View>

      <SectionHeader
        title="Upcoming measurements"
        actionLabel="Edit plan"
        onAction={() => router.push('/(patient)/(tabs)/plan')}
      />
      <Card style={{ gap: 4, paddingVertical: 8 }}>
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
          <View style={{ padding: spacing.md }}>
            <AppText variant="body" tone="muted">
              No upcoming windows in the next 14 days. Check that your plan is active.
            </AppText>
          </View>
        )}
      </Card>

      {actions.length ? (
        <>
          <SectionHeader title="What helps today" />
          <Card style={{ gap: spacing.md }}>
            <AppText variant="body" tone="soft">
              {actions[0]}
            </AppText>
            {actions.slice(1).map((action) => (
              <View key={action} style={styles.actionRow}>
                <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                <AppText variant="body" tone="soft" style={{ flex: 1 }}>
                  {action}
                </AppText>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <AppText variant="caption" tone="muted" style={{ textAlign: 'center' }}>
        TensioCare supports your care team. It does not replace medical advice.
      </AppText>
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
  icon: IconName;
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
        highlight && { backgroundColor: colors.brand, borderColor: colors.brand },
        pressed && { opacity: 0.75 },
      ]}
    >
      <View
        style={[
          styles.quickIcon,
          highlight && { backgroundColor: 'rgba(255,255,255,0.16)' },
        ]}
      >
        <Ionicons
          name={icon}
          size={21}
          color={highlight ? colors.onBrand : colors.brand}
        />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="bodyStrong" style={{ color: highlight ? colors.onBrand : colors.text }}>
          {title}
        </AppText>
        <AppText
          variant="caption"
          style={{ color: highlight ? 'rgba(255,255,255,0.8)' : colors.muted }}
        >
          {subtitle}
        </AppText>
      </View>
      <Ionicons
        name="chevron-forward"
        size={17}
        color={highlight ? 'rgba(255,255,255,0.7)' : colors.mutedLight}
      />
    </Pressable>
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
        <Ionicons name="alarm-outline" size={18} color={colors.brand} />
        <View style={{ flex: 1 }}>
          <AppText variant="bodyStrong">{formatTime(window.due_at)}</AppText>
          <AppText variant="caption" tone="muted">
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
  actionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  upcomingBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  upcomingTime: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
});
