import { useRef, useState, type ChangeEvent } from 'react';
import { exportBackup, exportCollectionCsv, importBackup, type UserData } from '@sc/core';
import { Button, Dialog, useToast } from '../../ui';
import { readUserData, restoreBackup, useCatalog } from '../../data';
import { APP_NAME } from '../../config/constants';
import { dateStamp, downloadText } from '../../lib/download';
import { SettingsRow, SettingsSection } from './SettingsSection';

const FILE_PREFIX = 'shiny-cardboard';

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected error';
}

function describeBackup(data: UserData): string {
  const copies = data.owned.reduce((sum, entry) => sum + entry.quantity, 0);
  return `${copies} owned cards, ${data.decks.length} decks, ${data.taggings.length} tagged cards and ${data.savedSearches.length} saved searches`;
}

export function DataSection() {
  const toast = useToast();
  const { state } = useCatalog();
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<UserData | null>(null);
  const [busy, setBusy] = useState<'backup' | 'csv' | 'restore' | null>(null);

  const run = async (kind: NonNullable<typeof busy>, failure: string, work: () => Promise<void>) => {
    setBusy(kind);
    try {
      await work();
    } catch (error) {
      toast.show({ title: failure, description: errorText(error), tone: 'danger', durationMs: 8000 });
    } finally {
      setBusy(null);
    }
  };

  const exportJson = () =>
    run('backup', 'Backup failed', async () => {
      const json = exportBackup(await readUserData());
      downloadText(`${FILE_PREFIX}-backup-${dateStamp()}.json`, json, 'application/json');
      toast.show({ title: 'Backup downloaded', tone: 'success' });
    });

  const exportCsv = () =>
    run('csv', 'CSV export failed', async () => {
      if (state.status !== 'ready') throw new Error('The card catalog is not loaded yet.');
      const { owned } = await readUserData();
      downloadText(`${FILE_PREFIX}-collection-${dateStamp()}.csv`, exportCollectionCsv(owned, state.catalog), 'text/csv');
      toast.show({ title: 'Collection CSV downloaded', tone: 'success' });
    });

  /** Parse first, then ask for confirmation before anything is replaced. */
  const onFileChosen = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const result = importBackup(await file.text());
      if ('error' in result) throw new Error(result.error);
      setPending(result.data);
    } catch (error) {
      toast.show({ title: 'Could not read that backup', description: errorText(error), tone: 'danger', durationMs: 8000 });
    }
  };

  const confirmRestore = () => {
    const data = pending;
    setPending(null);
    if (!data) return;
    void run('restore', 'Restore failed', async () => {
      await restoreBackup(data);
      toast.show({ title: 'Backup restored', description: describeBackup(data), tone: 'success' });
    });
  };

  return (
    <SettingsSection title="Your data" description={`Everything in ${APP_NAME} is yours. Export it any time.`}>
      <SettingsRow label="Backup" hint="A complete JSON copy: collection, tags, decks and saved searches.">
        <Button icon="download" onClick={exportJson} loading={busy === 'backup'}>
          Export backup
        </Button>
      </SettingsRow>
      <SettingsRow label="Collection spreadsheet" hint="CSV of owned cards that you can open in a spreadsheet.">
        <Button icon="download" onClick={exportCsv} loading={busy === 'csv'}>
          Export CSV
        </Button>
      </SettingsRow>
      <SettingsRow label="Restore from backup" hint="Replaces everything on this device with the contents of a backup file.">
        <Button icon="upload" onClick={() => fileInput.current?.click()} loading={busy === 'restore'}>
          Import backup
        </Button>
        <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={onFileChosen} />
      </SettingsRow>

      <Dialog
        open={pending !== null}
        onClose={() => setPending(null)}
        size="sm"
        title="Replace your data?"
        description="This cannot be undone. Export a backup first if you want to keep the current data."
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmRestore}>
              Replace data
            </Button>
          </>
        }
      >
        {pending ? <p>This backup contains {describeBackup(pending)}.</p> : null}
      </Dialog>
    </SettingsSection>
  );
}
