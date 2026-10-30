import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Switch, View } from 'react-native';

import { ScreenHeader } from '@/components/ScreenHeader';
import { TimeListEditor } from '@/components/TimeListEditor';
import {
  AppText,
  Badge,
  Button,
  Card,
  Chip,
  ErrorState,
  LoadingScreen,
  Notice,
  ScrollScreen,
  SectionHeader,
} from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { patientsApi, remindersApi } from '@/lib/api';
import { daysLabel, formatDateTime, formatTime } from '@/lib/format';
import { deviceTimezone } from '@/lib/time';

const DAYS = [
  { value: 0, label: 'Mon' },
  { value: 1, label: 'Tue' },
  { value: 2, label: 'Wed' },
  { value: 3, label: 'Thu' },
  { value: 4, label: 'Fri' },
  { value: 5, label: 'Sat' },
  { value: 6, label: 'Sun' },
];

export default function PatientPlanScreen() {
  const queryClient = useQueryClient();
  const schedule = useQuery({
    queryKey: ['reminder-schedule'],
    queryFn: remindersApi.schedule,
  });
  const profile = useQuery({
    queryKey: ['profile'],
    queryFn: patientsApi.profile,
  });
  const windows = useQuery({
    queryKey: ['reminder-windows', 14],
    queryFn: () => remindersApi.windows(14),
  });

  const [initialized, setInitialized] = useState(false);
  const [times, setTimes] = useState(['08:00', '20:00']);
  const [days, setDays] = useState([0, 1, 2, 3, 4, 5, 6]);
  const [grace, setGrace] = useState(60);
  const [timezone, setTimezone] = useState(deviceTimezone());
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (initialized || !schedule.isSuccess) return;
    if (!schedule.data && !profile.isSuccess) return;
    const current = schedule.data;
    const planTimes =
      current?.times?.length
        ? current.times
        : profile.data?.measurement_times?.length
          ? profile.data.measurement_times
          : ['08:00', '20:00'];
    setTimes(planTimes);
    setDays(current?.days_of_week?.length ? current.days_of_week : [0, 1, 2, 3, 4, 5, 6]);
    setGrace(current?.grace_minutes ?? 60);
    setTimezone(current?.timezone ?? profile.data?.timezone ?? deviceTimezone());
    setActive(current?.is_active ?? true);
    setInitialized(true);
  }, [initialized, profile.data, schedule.data, schedule.isSuccess]);

  const save = useMutation({
    mutationFn: () =>
      remindersApi.upsertSchedule({
        timezone,
        times,
        days_of_week: days,
        grace_minutes: grace,
        is_active: active,
      }),
    onSuccess: (saved) => {
      setTimes(saved.times);
      setDays(saved.days_of_week);
      setGrace(saved.grace_minutes);
      setTimezone(saved.timezone);
      setActive(saved.is_active);
      void queryClient.invalidateQueries({ queryKey: ['reminder-schedule'] });
      void queryClient.invalidateQueries({ queryKey: ['reminder-windows'] });
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
      void queryClient.invalidateQueries({ queryKey: ['assessment'] });
      void queryClient.invalidateQueries({ queryKey: ['adherence'] });
      Alert.alert(
        'Plan saved',
        'New measurement windows will be created from your updated plan.',
      );
    },
    onError: (error) => {
      Alert.alert(
        'Could not save plan',
        error instanceof Error ? error.message : 'Please try again.',
      );
    },
  });

  function toggleDay(day: number) {
    if (days.includes(day)) {
      if (days.length === 1) return;
      setDays(days.filter((value) => value !== day));
    } else {
      setDays([...days, day].sort((a, b) => a - b));
    }
  }

  function changeGrace(delta: number) {
    setGrace((current) => Math.max(5, Math.min(720, current + delta)));
  }

  if (
    (schedule.isLoading && !schedule.isSuccess) ||
    (profile.isLoading && !profile.data)
  ) {
    return <LoadingScreen label="Loading your measurement plan..." />;
  }

  if (schedule.isError) {
    return (
      <ScrollScreen
        refreshing={schedule.isFetching}
        onRefresh={() => {
          void schedule.refetch();
          void profile.refetch();
        }}
      >
        <ScreenHeader eyebrow="Your routine" title="Measurement plan" />
        <ErrorState
          message="We could not load your plan. Check your connection and try again."
          onRetry={() => {
            void schedule.refetch();
            void profile.refetch();
          }}
        />
      </ScrollScreen>
    );
  }

  const now = Date.now();
  const upcoming = (windows.data ?? [])
    .filter(
      (window) =>
        window.status === 'pending' && new Date(window.due_at).getTime() > now,
    )
    .slice(0, 4);
  const deviceZone = deviceTimezone();

  return (
    <ScrollScreen
      refreshing={schedule.isRefetching || windows.isRefetching}
      onRefresh={() => {
        void schedule.refetch();
        void profile.refetch();
        void windows.refetch();
      }}
    >
      <ScreenHeader
        eyebrow="Your routine"
        title="Measurement plan"
        subtitle="Set the times you want to measure. TensioCare opens a window at each time and reminds you."
      />

      <Card style={{ gap: spacing.md }}>
        <View style={styles.switchRow}>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="bodyStrong">Reminders are {active ? 'on' : 'paused'}</AppText>
            <AppText variant="caption" tone="muted">
              {active
                ? 'Measurement windows and local reminders are active.'
                : 'No new windows will be created while paused.'}
            </AppText>
          </View>
          <Switch
            value={active}
            onValueChange={setActive}
            trackColor={{ false: colors.borderStrong, true: colors.brandMuted }}
            thumbColor={active ? colors.brand : colors.card}
          />
        </View>
      </Card>

      {!active ? (
        <Notice
          tone="warning"
          title="Plan paused"
          message="Existing windows stay in your history, but no new reminders are created until you turn the plan back on."
        />
      ) : null}

      <SectionHeader title="Times" />
      <Card style={{ gap: spacing.md }}>
        <AppText variant="caption" tone="muted">
          Most people measure once in the morning and once in the evening. Your
          clinician may suggest a different routine.
        </AppText>
        <TimeListEditor times={times} onChange={setTimes} max={6} />
      </Card>

      <SectionHeader title="Days" />
      <Card style={{ gap: spacing.md }}>
        <View style={styles.dayRow}>
          {DAYS.map((day) => (
            <Chip
              key={day.value}
              label={day.label}
              selected={days.includes(day.value)}
              onPress={() => toggleDay(day.value)}
            />
          ))}
        </View>
        <AppText variant="caption" tone="muted">
          {daysLabel(days)}
        </AppText>
      </Card>

      <SectionHeader title="Missed measurement grace" />
      <Card style={{ gap: spacing.md }}>
        <View style={styles.graceRow}>
          <Button
            title="−15"
            onPress={() => changeGrace(-15)}
            variant="secondary"
            size="sm"
            fullWidth={false}
            disabled={grace <= 5}
          />
          <View style={{ alignItems: 'center', flex: 1 }}>
            <AppText variant="title">{grace} min</AppText>
            <AppText variant="caption" tone="muted">
              before an alert is escalated
            </AppText>
          </View>
          <Button
            title="+15"
            onPress={() => changeGrace(15)}
            variant="secondary"
            size="sm"
            fullWidth={false}
            disabled={grace >= 720}
          />
        </View>
        <AppText variant="caption" tone="muted">
          A reading can still close the window during this grace period. After it
          ends, your caregiver may be alerted according to their priority.
        </AppText>
      </Card>

      <SectionHeader title="Timezone" />
      <Card style={{ gap: spacing.md }}>
        <View style={styles.timezoneRow}>
          <Ionicons name="globe-outline" size={20} color={colors.brand} />
          <View style={{ flex: 1 }}>
            <AppText variant="bodyStrong">{timezone}</AppText>
            <AppText variant="caption" tone="muted">
              Times are interpreted in this timezone.
            </AppText>
          </View>
          {timezone === deviceZone ? <Badge label="Device" tone="brand" /> : null}
        </View>
        {timezone !== deviceZone ? (
          <Button
            title={`Use device timezone (${deviceZone})`}
            onPress={() => setTimezone(deviceZone)}
            variant="secondary"
            size="sm"
            fullWidth={false}
            icon="phone-portrait-outline"
          />
        ) : null}
      </Card>

      <Button
        title="Save measurement plan"
        onPress={() => save.mutate()}
        loading={save.isPending}
        size="lg"
      />

      <SectionHeader title="Upcoming windows" />
      <Card style={{ gap: 4, paddingVertical: 8 }}>
        {upcoming.length ? (
          upcoming.map((window, index) => (
            <View
              key={window.id}
              style={[
                styles.windowRow,
                index !== upcoming.length - 1 && styles.windowBorder,
              ]}
            >
              <Ionicons name="alarm-outline" size={18} color={colors.brand} />
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong">{formatTime(window.due_at)}</AppText>
                <AppText variant="caption" tone="muted">
                  {formatDateTime(window.due_at)}
                </AppText>
              </View>
              <Badge label="Upcoming" tone="brand" />
            </View>
          ))
        ) : (
          <View style={{ padding: spacing.md }}>
            <AppText variant="body" tone="muted">
              Save an active plan to see upcoming measurement windows.
            </AppText>
          </View>
        )}
      </Card>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  graceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  timezoneRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  windowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  windowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
});
