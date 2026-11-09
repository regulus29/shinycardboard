import { useEffect, useRef } from 'react';
import { DATA_MARKER_KEY } from '../config/constants';
import { db } from '../data/db';
import { useToast } from '../ui';

/**
 * Warns when this browser once held collection data but every table is now empty, which means
 * the browser (or the user) cleared site storage. Shown once per session, never blocks.
 */
export function DataLossNotice() {
  const toast = useToast();
  const checked = useRef(false);

  useEffect(() => {
    if (checked.current) return;
    checked.current = true;
    (async () => {
      const hadData = (await db.syncMeta.get(DATA_MARKER_KEY))?.value === true;
      if (!hadData) return;
      const counts = await Promise.all([db.owned.count(), db.taggings.count(), db.decks.count(), db.savedSearches.count()]);
      if (counts.some((n) => n > 0)) return;
      toast.show({
        title: 'Your collection is empty',
        description: 'This browser had data before, but it is gone. Storage may have been cleared. Restore a backup in Settings, or sync from your server.',
        tone: 'warning',
      });
    })().catch(() => undefined);
  }, [toast]);

  return null;
}
