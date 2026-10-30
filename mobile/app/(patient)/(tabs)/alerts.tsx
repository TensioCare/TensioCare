import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { NotificationCard } from '@/components/NotificationCard';
import { ScreenHeader } from '@/components/ScreenHeader';
import {
  AppText,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  LoadingScreen,
  ScrollScreen,
} from '@/components/ui';
import { spacing } from '@/constants/theme';
import { notificationsApi } from '@/lib/api';
import type { NotificationItem } from '@/lib/types';

type Filter = 'all' | 'unread';

export default function PatientAlertsScreen() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>('all');

  const notifications = useQuery({
    queryKey: ['notifications', filter],
    queryFn: () => notificationsApi.list({ unreadOnly: filter === 'unread', limit: 100 }),
    refetchInterval: 60_000,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const markRead = useMutation({
    mutationFn: (item: NotificationItem) => notificationsApi.markRead(item.id),
    onSuccess: invalidate,
  });

  const markAll = useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: invalidate,
  });

  const refresh = () => {
    void notifications.refetch();
    invalidate();
  };

  if (notifications.isLoading && !notifications.data) {
    return <LoadingScreen label="Opening your alerts..." />;
  }

  if (notifications.isError && !notifications.data) {
    return (
      <ScrollScreen refreshing={notifications.isFetching} onRefresh={refresh}>
        <ScreenHeader eyebrow="Inbox" title="Alerts" />
        <ErrorState
          message="We could not load your alerts. Check your connection and try again."
          onRetry={refresh}
        />
      </ScrollScreen>
    );
  }

  const items = notifications.data?.items ?? [];
  const unread = notifications.data?.unread ?? 0;

  return (
    <ScrollScreen
      refreshing={notifications.isRefetching}
      onRefresh={refresh}
    >
      <ScreenHeader
        eyebrow="Inbox"
        title="Alerts"
        subtitle="Reminders, missed measurements, and updates from your caregivers."
        right={
          unread > 0 ? (
            <Button
              title="Mark all read"
              onPress={() => markAll.mutate()}
              variant="secondary"
              size="sm"
              fullWidth={false}
              loading={markAll.isPending}
            />
          ) : undefined
        }
      />

      <View style={styles.filters}>
        <Chip
          label={`All${notifications.data ? ` (${notifications.data.total})` : ''}`}
          selected={filter === 'all'}
          onPress={() => setFilter('all')}
        />
        <Chip
          label={`Unread${unread ? ` (${unread})` : ''}`}
          selected={filter === 'unread'}
          onPress={() => setFilter('unread')}
        />
      </View>

      {items.length ? (
        <View style={{ gap: spacing.md }}>
          {items.map((item) => (
            <NotificationCard
              key={item.id}
              item={item}
              onPress={() => {
                if (!item.read_at) markRead.mutate(item);
              }}
            />
          ))}
        </View>
      ) : (
        <Card>
          <EmptyState
            icon="notifications-off-outline"
            title={filter === 'unread' ? 'No unread alerts' : 'No alerts yet'}
            message={
              filter === 'unread'
                ? 'You are all caught up. New reminders and caregiver updates will appear here.'
                : 'Measurement reminders and caregiver updates will appear here.'
            }
          />
        </Card>
      )}
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', gap: spacing.sm },
});
