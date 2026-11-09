import { useEffect, useRef } from 'react';
import { migrateRetiredKeys, useCatalog } from '../data';
import { useSync } from '../sync';
import { useSyncConfig } from '../sync/config';
import { useToast } from '../ui';

/**
 * Runs the retired-printing-key migration once per catalog build, and warns once about keys the
 * catalog does not know. It waits for the first completed sync of this session when sync is
 * configured, so remote state is merged first; if sync is offline or failing it proceeds anyway,
 * because the migration is written so a stale run can never beat newer data (see runMigration).
 */
export function MigrationNotice() {
  const { state: catalogState, migration, setMigration } = useCatalog();
  const { state: sync } = useSync();
  const configured = useSyncConfig() !== null;
  const toast = useToast();
  const ranFor = useRef<unknown>(null);
  const warned = useRef(false);

  const catalog = catalogState.catalog;
  const syncSettled = !configured || sync.syncedThisSession || sync.status === 'offline' || sync.status === 'error';

  useEffect(() => {
    if (!catalog || !syncSettled || ranFor.current === catalog) return;
    ranFor.current = catalog;
    migrateRetiredKeys(catalog).then(setMigration, () => {
      ranFor.current = null;
    });
  }, [catalog, syncSettled, setMigration]);

  useEffect(() => {
    if (warned.current || migration.orphanedKeys.length === 0) return;
    warned.current = true;
    toast.show({
      title: 'Some cards are not in the catalog',
      description: `${migration.orphanedKeys.length} printing(s) in your data are unknown to this catalog version. They are kept and will match again if the catalog adds them.`,
      tone: 'warning',
    });
  }, [migration, toast]);
  return null;
}
