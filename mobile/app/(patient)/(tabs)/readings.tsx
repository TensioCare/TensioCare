import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ReadingCard } from '@/components/ReadingCard';
import { ScreenHeader } from '@/components/ScreenHeader';
import {
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingScreen,
  Metric,
  Notice,
  ScrollScreen,
  SectionHeader,
} from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { readingsApi } from '@/lib/api';
import { formatPercent, trendLabel } from '@/lib/format';

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
        <ScreenHeader title="Readings" eyebrow="Your history" />
        <ErrorState
          message="We could not load your readings. Check your connection and try again."
          onRetry={refresh}
        />
      </ScrollScreen>
    );
  }

  const items = readings.data ?? [];
  const data = analysis.data;

  return (
    <ScrollScreen
      refreshing={readings.isRefetching || analysis.isRefetching}
      onRefresh={refresh}
    >
      <ScreenHeader
        eyebrow="Your history"
        title="Readings"
        subtitle="Every measurement helps show the pattern behind the numbers."
        right={
          <Button
            title="Log"
            onPress={() => router.push('/reading/new')}
            variant="primary"
            size="sm"
            fullWidth={false}
            icon="add"
          />
        }
      />

      <Card style={{ gap: spacing.md }}>
        <View style={styles.analysisHeader}>
          <View>
            <AppText variant="subtitle">Last 7 days</AppText>
            <AppText variant="caption" tone="muted">
              {data ? `${data.reading_count} readings` : 'Loading analysis...'}
            </AppText>
          </View>
          {data ? (
            <Badge
              label={trendLabel(data.trend)}
              tone={
                data.trend === 'improving'
                  ? 'success'
                  : data.trend === 'worsening'
                    ? 'danger'
                    : 'muted'
              }
              icon={
                data.trend === 'improving'
                  ? 'trending-down-outline'
                  : data.trend === 'worsening'
                    ? 'trending-up-outline'
                    : 'remove-outline'
              }
            />
          ) : null}
        </View>

        {data && data.reading_count > 0 ? (
          <>
            <View style={styles.metricsRow}>
              <Metric
                label="Average"
                value={
                  data.average_systolic !== null && data.average_diastolic !== null
                    ? `${Math.round(data.average_systolic)}/${Math.round(data.average_diastolic)}`
                    : '—'
                }
                unit="mmHg"
              />
              <Metric
                label="In target"
                value={formatPercent(data.in_target_percent)}
                tone={
                  data.in_target_percent !== null && data.in_target_percent >= 70
                    ? 'success'
                    : 'warning'
                }
              />
              <Metric
                label="Readings"
                value={String(data.reading_count)}
                unit="total"
              />
            </View>

            {data.target_systolic && data.target_diastolic ? (
              <AppText variant="caption" tone="muted">
                Target: below {data.target_systolic}/{data.target_diastolic} mmHg
              </AppText>
            ) : (
              <AppText variant="caption" tone="muted">
                Set a blood pressure target in your profile to track in-target readings.
              </AppText>
            )}

            {data.alerts.length ? (
              <View style={{ gap: spacing.sm }}>
                {data.alerts.slice(0, 2).map((alert) => (
                  <Notice key={alert} tone="warning" title="Worth noting" message={alert} />
                ))}
              </View>
            ) : null}
          </>
        ) : (
          <AppText variant="body" tone="muted">
            Log a reading to unlock averages, trends and target tracking.
          </AppText>
        )}
      </Card>

      <SectionHeader
        title="All readings"
        actionLabel="Log reading"
        onAction={() => router.push('/reading/new')}
      />

      {items.length ? (
        <View style={{ gap: spacing.md }}>
          {items.map((reading) => (
            <ReadingCard
              key={reading.id}
              reading={reading}
              onPress={() =>
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

const styles = StyleSheet.create({
  analysisHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  metricsRow: { flexDirection: 'row', gap: spacing.md },
  targetText: { color: colors.muted },
});
