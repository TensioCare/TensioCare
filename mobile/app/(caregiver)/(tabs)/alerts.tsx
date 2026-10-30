import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { NotificationCard } from '@/components/NotificationCard';
import { ScreenHeader } from '@/components/ScreenHeader';
import {
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

export default function CaregiverAlertsScreen() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>('all');
  const [acknowledgingId, setAcknowledgingId] = useState<number | null>(null);

  const notifications = useQuery({
    queryKey: ['notifications', filter],
    queryFn: () => notificationsApi.list({ unreadOnly: filter === 'unread', limit: 100 }),
    refetchInterval: 30_000,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    void queryClient.invalidateQueries({ queryKey: ['caregiver'] });
  };

  const markRead = useMutation({
    mutationFn: (item: NotificationItem) => notificationsApi.markRead(item.id),
    onSuccess: invalidate,
  });

  const markAll = useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: invalidate,
  });

  const acknowledge = useMutation({
    mutationFn: (item: NotificationItem) => notificationsApi.acknowledge(item.id),
    onMutate: (item) => setAcknowledgingId(item.id),
    onSuccess: invalidate,
    onSettled: () => setAcknowledgingId(null),
    onError: (error) => {
      Alert.alert(
        'Could not acknowledge',
        error instanceof Error ? error.message : 'Please try again.',
      );
    },
  });

  const refresh = () => {
    void notifications.refetch();
    invalidate();
  };

  if (notifications.isLoading && !notifications.data) {
    return <LoadingScreen label="Opening the alert inbox..." />;
  }

  if (notifications.isError && !notifications.data) {
    return (
      <ScrollScreen refreshing={notifications.isFetching} onRefresh={refresh}>
        <ScreenHeader eyebrow="Caregiver inbox" title="Alerts" />
        <ErrorState
          message="We could not load alerts. Check your connection and try again."
          onRetry={refresh}
        />
      </ScrollScreen>
    );
  }

  const items = notifications.data?.items ?? [];
  const unread = notifications.data?.unread ?? 0;

  return (
    <ScrollScreen refreshing={notifications.isRefetching} onRefresh={refresh}>
      <ScreenHeader
        eyebrow="Caregiver inbox"
        title="Alerts"
        subtitle="Acknowledge an escalation to stop the caregiver ring."
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
              acknowledging={acknowledgingId === item.id}
              onPress={() => {
                if (!item.read_at) markRead.mutate(item);
              }}
              onAcknowledge={() => acknowledge.mutate(item)}
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
                ? 'You are all caught up.'
                : 'Escalations and patient updates will appear here.'
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
