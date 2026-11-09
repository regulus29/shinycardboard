import { useCallback, useEffect, useState } from 'react';
import { Button, ProgressBar, useToast } from '../../ui';
import { CARD_ART_CACHE } from '../../config/constants';
import { formatBytes } from '../../lib/download';
import { SettingsRow, SettingsSection } from './SettingsSection';

interface StorageInfo {
  usage: number;
  quota: number;
  persisted: boolean | null;
}

async function readStorage(): Promise<StorageInfo | null> {
  if (!('storage' in navigator) || !navigator.storage.estimate) return null;
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : null;
  return { usage, quota, persisted };
}

export function StorageSection() {
  const toast = useToast();
  const [info, setInfo] = useState<StorageInfo | null | undefined>(undefined);

  const refresh = useCallback(() => {
    readStorage().then(setInfo, () => setInfo(null));
  }, []);
  useEffect(refresh, [refresh]);

  const clearArt = async () => {
    const removed = 'caches' in window ? await caches.delete(CARD_ART_CACHE) : false;
    toast.show({ title: removed ? 'Card art cache cleared' : 'No cached card art to clear', tone: removed ? 'success' : 'info' });
    refresh();
  };

  const persist = async () => {
    const granted = (await navigator.storage.persist?.()) ?? false;
    toast.show({
      title: granted ? 'Storage protected' : 'Your browser declined',
      description: granted ? undefined : 'It may allow this later, once the app is installed or used more.',
      tone: granted ? 'success' : 'warning',
    });
    refresh();
  };

  return (
    <SettingsSection title="Storage" description="Collection data and cached card art live in this browser.">
      {info === undefined ? null : info === null ? (
        <p className="settings-row__hint">Your browser does not report storage usage.</p>
      ) : (
        <ProgressBar
          label="Storage used"
          value={info.usage}
          max={info.quota || info.usage || 1}
          size="sm"
        />
      )}
      {info ? (
        <p className="settings-row__hint">
          {formatBytes(info.usage)} used of {formatBytes(info.quota)} available.
          {info.persisted === true ? ' Protected from automatic cleanup.' : ''}
        </p>
      ) : null}
      <SettingsRow label="Card art cache" hint="Art is downloaded on demand and kept for offline use.">
        <Button icon="trash" onClick={() => void clearArt()}>
          Clear card art
        </Button>
      </SettingsRow>
      {info && info.persisted === false ? (
        <SettingsRow label="Protect my data" hint="Ask the browser not to clear this data when space runs low.">
          <Button onClick={() => void persist()}>Request protection</Button>
        </SettingsRow>
      ) : null}
    </SettingsSection>
  );
}
