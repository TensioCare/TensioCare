import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { remindersApi } from '@/lib/api';
import { syncMeasurementReminders } from '@/lib/notifications';

/**
 * Keeps the phone's local measurement notifications in sync with the backend
 * windows. Runs quietly in the patient layout.
 */
export function ReminderScheduler() {
  const { data } = useQuery({
    queryKey: ['reminder-windows', 'scheduler'],
    queryFn: () => remindersApi.windows(14),
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!data) return;
    void syncMeasurementReminders(data).catch((error) => {
      console.warn('Could not sync reminders', error);
    });
  }, [data]);

  return null;
}
