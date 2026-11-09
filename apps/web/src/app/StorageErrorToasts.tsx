import { useEffect } from 'react';
import { subscribeStorageFailures } from '../data/changeBus';
import { useToast } from '../ui';

/** Shows a persistent error toast whenever a write fails (quota exceeded, blocked transaction). */
export function StorageErrorToasts() {
  const toast = useToast();
  useEffect(
    () => subscribeStorageFailures((failure) => toast.show({ title: failure.title, description: failure.description, tone: 'danger' })),
    [toast],
  );
  return null;
}
