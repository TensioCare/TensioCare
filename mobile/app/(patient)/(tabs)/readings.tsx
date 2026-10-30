import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { BarChart } from '@/components/Chart';
import { ScreenHeader } from '@/components/ScreenHeader';
import {
  AppText,
  Card,
  EmptyState,
  ErrorState,
  LoadingScreen,
  Notice,
  ScrollScreen,
} from '@/components/ui';
import { categoryColors, colors, fonts, radius, spacing } from '@/constants/theme';
import { readingsApi } from '@/lib/api';
import {
  categoryLabel,
  dayAxisLabel,
  formatPercent,
  formatTime,
  trendLabel,
} from '@/lib/format';
import type { Reading } from '@/lib/types';

type DayGroup = {
  key: string;
  title: string;
  readings: Reading[];
};

function groupByDay(readings: Reading[]): DayGroup[] {
  const groups = new Map<string, DayGroup>();

  for (const reading of readings) {
    const date = new Date(reading.measured_at);
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const existing = groups.get(key);
    if (existing) {
      existing.readings.push(reading);
    } else {
      groups.set(key, {
        key,
        title: new Intl.DateTimeFormat(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        }).format(date),
        readings: [reading],
      });
    }
  }

  return [...groups.values()];
}

export default function PatientReadingsScreen() {
  const router = useRouter();

  const readings = useQuery({
    queryKey: ['readings', 'list'],
    queryFn: () => readingsApi.list(150),
  });
  const analysis = useQuery({
    queryKey: ['readings', 'analysis', 7],
    queryFn: () => readingsApi.analysis(7),
  });

  const refresh = () => {
    void readings.refetch();
    void analysis.refetch();
  };

  if (readings.isLoading && !readings.data) {
    return <LoadingScreen label="Loading your readings..." />;
  }

  if (readings.isError && !readings.data) {
    return (
      <ScrollScreen refreshing={readings.isFetching} onRefresh={refresh}>
        <ScreenHeader title="History" eyebrow="Your measurements" />
        <ErrorState
          message="We could not load your readings. Check your connection and try again."
          onRetry={refresh}
        />
      </ScrollScreen>
    );
  }

  const items = readings.data ?? [];
  const data = analysis.data;
  const days = groupByDay(items);

  const bars = (data?.daily ?? [])
    .slice()
    .reverse()
    .map((day) => ({
      label: dayAxisLabel(day.date),
      value: Math.round(day.average_systolic),
    }));

  const analysisText = data && data.reading_count > 0
    ? `Average ${Math.round(data.average_systolic ?? 0)}/${Math.round(
        data.average_diastolic ?? 0,
      )} mmHg across ${data.reading_count} measurement${
        data.reading_count === 1 ? '' : 's'
      }. ${data.in_target_percent !== null ? `${formatPercent(data.in_target_percent)} within your target.` : ''} Trend: ${trendLabel(data.trend).toLowerCase()}.`
    : 'Log a reading to unlock averages, trends and target tracking.';

  return (
    <ScrollScreen
      refreshing={readings.isRefetching || analysis.isRefetching}
      onRefresh={refresh}
      contentContainerStyle={{ paddingBottom: 120 }}
    >
      <ScreenHeader
        eyebrow="Your measurements"
        title="History"
        subtitle="Every measurement helps show the pattern behind the numbers."
      />

      <View style={styles.banner}>
        <AppText variant="tiny" style={{ color: colors.brand }}>
          LAST 7 DAYS
        </AppText>
        <AppText variant="caption" style={{ color: colors.brandDark }}>
          {analysisText}
        </AppText>
      </View>

      {bars.length > 1 ? (
        <Card style={{ gap: spacing.md }}>
          <AppText variant="subtitle">Average per day</AppText>
          <BarChart bars={bars} suffix=" mmHg" />
        </Card>
      ) : null}

      {data && data.reading_count > 0 ? (
        <View style={styles.statsRow}>
          <Card style={styles.statCard}>
            <AppText variant="tiny" tone="muted">
              Average
            </AppText>
            <AppText variant="title" style={{ color: colors.brandDark }}>
              {data.average_systolic !== null && data.average_diastolic !== null
                ? `${Math.round(data.average_systolic)}/${Math.round(data.average_diastolic)}`
                : '—'}
            </AppText>
            <AppText variant="tiny" tone="muted">
              mmHg
            </AppText>
          </Card>
          <Card style={styles.statCard}>
            <AppText variant="tiny" tone="muted">
              In target
            </AppText>
            <AppText variant="title" style={{ color: colors.brandDark }}>
              {formatPercent(data.in_target_percent)}
            </AppText>
            <AppText variant="tiny" tone="muted">
              of readings
            </AppText>
          </Card>
          <Card style={styles.statCard}>
            <AppText variant="tiny" tone="muted">
              Readings
            </AppText>
            <AppText variant="title" style={{ color: colors.brandDark }}>
              {data.reading_count}
            </AppText>
            <AppText variant="tiny" tone="muted">
              last 7 days
            </AppText>
          </Card>
        </View>
      ) : null}

      {data && data.alerts.length ? (
        <View style={{ gap: spacing.sm }}>
          {data.alerts.slice(0, 2).map((alert) => (
            <Notice key={alert} tone="warning" title="Worth noting" message={alert} />
          ))}
        </View>
      ) : null}

      {days.length ? (
        <View style={{ gap: spacing.lg, marginTop: spacing.xs }}>
          {days.map((group) => (
            <DayCard
              key={group.key}
              group={group}
              onPress={(reading) =>
                router.push({
                  pathname: '/reading/[id]',
                  params: { id: String(reading.id) },
                })
              }
            />
          ))}
        </View>
      ) : (
        <Card>
          <EmptyState
            icon="pulse-outline"
            title="No readings yet"
            message="Add your first blood pressure reading. It takes less than a minute."
            actionLabel="Log a reading"
            onAction={() => router.push('/reading/new')}
          />
        </Card>
      )}
    </ScrollScreen>
  );
}

function DayCard({
  group,
  onPress,
}: {
  group: DayGroup;
  onPress: (reading: Reading) => void;
}) {
  const count = group.readings.length;
  const averageSys = Math.round(
    group.readings.reduce((sum, reading) => sum + reading.systolic, 0) / count,
  );
  const averageDia = Math.round(
    group.readings.reduce((sum, reading) => sum + reading.diastolic, 0) / count,
  );
  const aboveTarget = group.readings.filter(
    (reading) => reading.category !== 'normal' && reading.category !== 'low',
  ).length;

  return (
    <Card style={{ padding: 0, overflow: 'hidden', gap: 0 }}>
      <View style={styles.dayHeader}>
        <AppText variant="bodyStrong" style={{ color: colors.brandDark }}>
          {group.title}
        </AppText>
        <AppText variant="tiny" tone="muted">
          {count} measurement{count === 1 ? '' : 's'}
        </AppText>
      </View>

      <View style={{ paddingHorizontal: spacing.lg }}>
        {group.readings.map((reading, index) => {
          const palette = categoryColors[reading.category] ?? categoryColors.normal;
          return (
            <Pressable
              key={reading.id}
              accessibilityRole="button"
              onPress={() => onPress(reading)}
              style={({ pressed }) => [
                styles.readingRow,
                index < group.readings.length - 1 && styles.rowBorder,
                pressed && { opacity: 0.65 },
              ]}
            >
              <AppText
                variant="caption"
                tone="muted"
                style={{ width: 58, fontFamily: fonts.semibold }}
              >
                {formatTime(reading.measured_at)}
              </AppText>
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong" style={{ fontVariant: ['tabular-nums'] }}>
                  {reading.systolic}/{reading.diastolic}
                  {reading.pulse ? (
                    <AppText variant="caption" tone="muted">
                      {' '}
                      · {reading.pulse} bpm
                    </AppText>
                  ) : null}
                </AppText>
              </View>
              <View
                style={[
                  styles.categoryChip,
                  { backgroundColor: palette.bg, borderColor: `${palette.fg}33` },
                ]}
              >
                <AppText variant="tiny" style={{ color: palette.fg }}>
                  {categoryLabel(reading.category)}
                </AppText>
              </View>
              <Ionicons name="chevron-forward" size={15} color={colors.mutedLight} />
            </Pressable>
          );
        })}
      </View>

      <View style={styles.daySummary}>
        <AppText variant="tiny" style={{ color: colors.textSoft }}>
          Average {averageSys}/{averageDia} mmHg
        </AppText>
        <AppText variant="tiny" tone="muted">
          {aboveTarget ? `${aboveTarget} above target` : 'All within range'}
        </AppText>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.brandSoft,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.brandMuted,
    padding: spacing.lg,
    gap: 6,
  },
  statsRow: { flexDirection: 'row', gap: spacing.sm },
  statCard: { flex: 1, alignItems: 'flex-start', gap: 2, padding: spacing.md },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  readingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 11,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  categoryChip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  daySummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.cardMuted,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
