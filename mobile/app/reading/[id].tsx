import { useLocalSearchParams } from 'expo-router';

import { ReadingFormScreen } from '@/components/ReadingFormScreen';
import { ErrorState, ScrollScreen } from '@/components/ui';

export default function EditReadingScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const readingId = Number(params.id);

  if (!Number.isInteger(readingId) || readingId <= 0) {
    return (
      <ScrollScreen edges={[]}>
        <ErrorState message="This reading link is not valid." />
      </ScrollScreen>
    );
  }

  return <ReadingFormScreen readingId={readingId} />;
}
